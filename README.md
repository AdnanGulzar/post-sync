# SyncPost — MVP

An Nx monorepo with three apps:

- **apps/api** — NestJS + PostgreSQL (Prisma). Auth, admin, subscriptions, social OAuth, and post publishing.
- **apps/user** — React (Vite) user panel: sign up / log in, connect LinkedIn/Facebook/X, write a post and publish it to all connected platforms at once.
- **apps/admin** — React (Vite) admin panel: create user accounts and manually grant/change their subscription access (no payment provider wired up yet — that's the next milestone, not part of this MVP).

Shared TypeScript types and a tiny fetch-based API client live in `libs/api-client`, used by both React apps.

## 1. Prerequisites

- Node.js 20+
- A PostgreSQL database (local Postgres, Docker, or a hosted one like Neon/Supabase/RDS)

## 2. Install

```bash
npm install
```

`@prisma/client`'s postinstall hook automatically runs `prisma generate` against `prisma/schema.prisma`. If that gets skipped (e.g. `npm install --ignore-scripts`), run it yourself:

```bash
npm run db:generate
```

## 3. Configure environment variables

Copy the example files and fill in real values:

```bash
cp .env.example .env
cp apps/user/.env.example apps/user/.env
cp apps/admin/.env.example apps/admin/.env
```

At minimum, set `DATABASE_URL`, `JWT_SECRET`, and `ADMIN_EMAIL` / `ADMIN_PASSWORD` in the root `.env`. The social platform variables (LinkedIn/Facebook/X) are only needed once you're ready to test real publishing — see section 6.

## 4. Set up the database

```bash
npm run db:migrate    # creates the tables from prisma/schema.prisma
npm run db:seed       # creates your first ADMIN account from ADMIN_EMAIL/ADMIN_PASSWORD
```

## 5. Run everything

```bash
npm run dev
```

This runs all three apps concurrently:

- API: http://localhost:3000/api
- User panel: http://localhost:4200
- Admin panel: http://localhost:4201

Or run them individually with `npm run dev:api`, `npm run dev:user`, `npm run dev:admin`.

### First login

1. Open the admin panel (`:4201`) and log in with the `ADMIN_EMAIL` / `ADMIN_PASSWORD` you seeded.
2. Click **+ Create user** to create a real user account. New accounts created by an admin are automatically given an **active FREE** subscription (20 posts/month) — that's "admin gives access" for this MVP, with no self-serve billing yet.
3. Use the **Subscription access** controls on each row to change plan/status/limit at any time (e.g. bump someone to `PROFESSIONAL` / `ACTIVE`).

Note: the public **Sign up** flow on the user panel (`:4200/signup`) also works — anyone can create an account — but those accounts start with an **INACTIVE** subscription until an admin activates them from the admin panel. That's the "manual gate" the brief asked for.

## 6. Connecting real social accounts (LinkedIn / Facebook / X)

Posting is real, not mocked — but each platform requires you to register a developer app first and plug its credentials into `.env`. Do this once per platform:

### LinkedIn
1. Create an app at https://www.linkedin.com/developers/apps.
2. Under **Products**, request "Sign In with LinkedIn using OpenID Connect" and "Share on LinkedIn" (both self-serve, instant approval for basic scopes).
3. Under **Auth**, add `LINKEDIN_REDIRECT_URI` (from your `.env`) as an authorized redirect URL.
4. Copy the Client ID/Secret into `LINKEDIN_CLIENT_ID` / `LINKEDIN_CLIENT_SECRET`.

### Facebook / Meta
1. Create an app at https://developers.facebook.com/apps (type: "Business").
2. Add the **Facebook Login** product, and add `FACEBOOK_REDIRECT_URI` as a valid OAuth redirect URI.
3. Copy the App ID/Secret into `FACEBOOK_APP_ID` / `FACEBOOK_APP_SECRET`.
4. Note: Meta only lets apps publish to **Pages**, not personal profiles, and the `pages_manage_posts` permission requires **App Review** before it works for anyone outside your app's admins/testers/developers. Add yourself as a tester to try it before review.

### X (Twitter)
1. Create a project + app at https://developer.x.com/en/portal/dashboard.
2. Under **User authentication settings**, turn on OAuth 2.0, set type to "Web App", and add `X_REDIRECT_URI` as a callback URL.
3. Copy the Client ID/Secret into `X_CLIENT_ID` / `X_CLIENT_SECRET`.
4. Free-tier X API access allows posting tweets; note that image uploads via the v1.1 media endpoint aren't wired up yet in this MVP — text-only tweets work out of the box.

Once the env vars are set, restart the API. In the user panel, go to **Connections** and click **Connect** next to each platform — this redirects to the provider, and drops you back on `/connections?connected=<platform>` on success.

## 7. How publishing works

`POST /api/posts` (used by the "Create post" screen) accepts `{ content, platforms: string[], imageUrl? }`. It:

1. Checks the user has an **ACTIVE** subscription (`SubscriptionGuard`) and hasn't hit their plan's monthly post limit.
2. Publishes to each selected platform **in parallel**, independently — one platform failing doesn't block the others.
3. Records a `PostPublishResult` row per platform (`SUCCESS` / `FAILED` + the provider's post id or error), so partial failures are visible per-platform in the UI.

## 8. Project layout

```
apps/
  api/      NestJS backend (auth, admin, subscriptions, social OAuth + publishing, posts)
  user/     React user panel (Vite)
  admin/    React admin panel (Vite)
libs/
  api-client/   Shared TS types + fetch client used by both React apps
prisma/
  schema.prisma   User, Subscription, SocialAccount, Post, PostPublishResult
  seed.ts         Creates the first admin account
```

## 9. What's intentionally NOT in this MVP

- **No payment provider (Stripe etc.)** — subscription access is granted manually by an admin, per the brief. Wiring up real billing is a clean next step: the `Subscription` model already has `plan`/`status`/`endDate`, so a webhook handler could flip those fields without touching the rest of the app.
- **No scheduling/queueing (Redis/BullMQ)** — posts publish immediately/synchronously. The `SocialPlatformService` abstraction (`apps/api/src/social/publisher.interface.ts`) is written so a queue worker could call the same `publish()` methods later without any rewrite.
- **No AI content generation** — the brief's bigger SyncPost vision includes AI rewriting/scheduling/analytics; this MVP is scoped to the explicit ask: auth, manual subscriptions, and real multi-platform publishing.
- **Image posting for X** is not implemented (text-only tweets); LinkedIn and Facebook do support an image URL.

## 10. Useful scripts

| Command | What it does |
|---|---|
| `npm run dev` | Run API + both React apps together |
| `npm run db:migrate` | Apply Prisma migrations (dev) |
| `npm run db:seed` | Create/update the admin account from `.env` |
| `npm run db:studio` | Open Prisma Studio to browse the DB |
| `npm run build:api` / `build:user` / `build:admin` | Production builds |
