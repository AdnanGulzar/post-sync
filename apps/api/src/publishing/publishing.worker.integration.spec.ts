import { PrismaClient } from '@prisma/client';

/**
 * Exercises the recovery and idempotency guarantees against a real database,
 * because both are expressed in SQL semantics that a mock cannot represent.
 *
 * Skipped when DATABASE_URL is unset so a plain `nx test api` still runs
 * everywhere; CI provides a Postgres service.
 */
const DATABASE_URL = process.env.DATABASE_URL;
const describeWithDb = DATABASE_URL ? describe : describe.skip;

const STALE_PUBLISHING_MINUTES = 15;

describeWithDb('publishing recovery (integration)', () => {
  const prisma = new PrismaClient();
  let userId: string;
  let planId: string;

  beforeAll(async () => {
    await prisma.$connect();
    const plan = await prisma.plan.upsert({
      where: { name: 'IntegrationTestPlan' },
      create: { name: 'IntegrationTestPlan', price: 0 },
      update: {},
    });
    planId = plan.id;
    const user = await prisma.user.upsert({
      where: { email: 'worker-integration@test.local' },
      create: {
        email: 'worker-integration@test.local',
        passwordHash: 'not-a-real-hash',
        name: 'Worker Integration',
        subscription: { create: { planId } },
      },
      update: {},
    });
    userId = user.id;
  });

  afterAll(async () => {
    await prisma.post.deleteMany({ where: { userId } });
    await prisma.$disconnect();
  });

  /** Creates a post frozen in PUBLISHING with a backdated updatedAt. */
  async function stuckPost(minutesAgo: number): Promise<string> {
    const post = await prisma.post.create({
      data: { userId, content: 'stuck', status: 'PUBLISHING', destinationIds: [] },
    });
    // updatedAt is @updatedAt, so it must be backdated with raw SQL.
    // No ::uuid cast: Prisma maps `String @id` to TEXT, not Postgres uuid.
    await prisma.$executeRaw`
      UPDATE posts SET "updatedAt" = NOW() - (${minutesAgo} * INTERVAL '1 minute') WHERE id = ${post.id}
    `;
    return post.id;
  }

  /** The reaper, as the worker runs it. */
  async function reap(): Promise<number> {
    const cutoff = new Date(Date.now() - STALE_PUBLISHING_MINUTES * 60_000);
    const { count } = await prisma.post.updateMany({
      where: { status: 'PUBLISHING', updatedAt: { lt: cutoff } },
      data: { status: 'SCHEDULED' },
    });
    return count;
  }

  it('recovers a post abandoned mid-publish', async () => {
    // The bug: claiming set PUBLISHING, but the sweep only queried SCHEDULED, so
    // a process death between claim and finalise wedged the post permanently.
    const id = await stuckPost(30);
    expect((await prisma.post.findUniqueOrThrow({ where: { id } })).status).toBe('PUBLISHING');

    await reap();

    expect((await prisma.post.findUniqueOrThrow({ where: { id } })).status).toBe('SCHEDULED');
  });

  it('leaves a post that is still legitimately publishing alone', async () => {
    // Reaping too eagerly would republish work that is still in flight.
    const id = await stuckPost(1);
    await reap();
    expect((await prisma.post.findUniqueOrThrow({ where: { id } })).status).toBe('PUBLISHING');
  });

  it('claims each due post exactly once across concurrent workers', async () => {
    const due = new Date(Date.now() - 60_000);
    const ids = await Promise.all(
      [0, 1, 2].map(async (n) => {
        const p = await prisma.post.create({
          data: {
            userId,
            content: `due-${n}`,
            status: 'SCHEDULED',
            scheduledAt: due,
            destinationIds: [],
          },
        });
        return p.id;
      }),
    );

    const claim = () => prisma.$queryRaw<Array<{ id: string }>>`
      UPDATE posts SET status = 'PUBLISHING', "updatedAt" = NOW()
      WHERE id IN (
        SELECT id FROM posts
        WHERE status = 'SCHEDULED' AND "scheduledAt" <= NOW() AND "userId" = ${userId}
        ORDER BY "scheduledAt"
        LIMIT 25
        FOR UPDATE SKIP LOCKED
      )
      RETURNING id
    `;

    // Three workers racing on the same rows.
    const batches = await Promise.all([claim(), claim(), claim()]);
    const claimedIds = batches.flat().map((r) => r.id);

    // Every post claimed, none claimed twice — the property that stops a post
    // being published to the same destination by two workers at once.
    expect(new Set(claimedIds).size).toBe(claimedIds.length);
    for (const id of ids) expect(claimedIds).toContain(id);
  });

  it('never has two workers claim the same row', async () => {
    const p = await prisma.post.create({
      data: {
        userId,
        content: 'contended',
        status: 'SCHEDULED',
        scheduledAt: new Date(Date.now() - 60_000),
        destinationIds: [],
      },
    });

    const claimOne = () => prisma.$queryRaw<Array<{ id: string }>>`
      UPDATE posts SET status = 'PUBLISHING'
      WHERE id IN (
        SELECT id FROM posts WHERE id = ${p.id} AND status = 'SCHEDULED'
        FOR UPDATE SKIP LOCKED
      )
      RETURNING id
    `;

    const results = await Promise.all([claimOne(), claimOne(), claimOne(), claimOne()]);
    const winners = results.filter((r) => r.length > 0);
    expect(winners).toHaveLength(1);
  });
});
