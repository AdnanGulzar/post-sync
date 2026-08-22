import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreatePlanDto } from './dto/create-plan.dto';
import { UpdatePlanDto } from './dto/update-plan.dto';
import { ALL_PLATFORM_IDS } from '@syncpost/platform-core';

@Injectable()
export class PlansService {
  constructor(private prisma: PrismaService) {}

  list() {
    return this.prisma.plan.findMany({ orderBy: { createdAt: 'asc' } });
  }

  listActive() {
    return this.prisma.plan.findMany({ where: { isActive: true }, orderBy: { createdAt: 'asc' } });
  }

  /** Plan new sign-ups land on: the active "Free" plan, or else the cheapest active plan. */
  async defaultSignupPlanId(): Promise<string> {
    const free = await this.prisma.plan.findFirst({ where: { isActive: true, name: { equals: 'Free', mode: 'insensitive' } } });
    if (free) return free.id;

    const cheapest = await this.prisma.plan.findFirst({ where: { isActive: true }, orderBy: { price: 'asc' } });
    if (!cheapest) throw new BadRequestException('No active plan is available to assign — create one first.');
    return cheapest.id;
  }

  async findByIdOrThrow(id: string) {
    const plan = await this.prisma.plan.findUnique({ where: { id } });
    if (!plan) throw new NotFoundException('Plan not found');
    return plan;
  }

  async create(dto: CreatePlanDto) {
    const existing = await this.prisma.plan.findUnique({ where: { name: dto.name } });
    if (existing) throw new BadRequestException('A plan with this name already exists');

    return this.prisma.plan.create({
      data: {
        name: dto.name,
        price: dto.price ?? 0,
        postsLimit: dto.postsLimit,
        connectedAccountsLimit: dto.connectedAccountsLimit,
        stripePriceId: dto.stripePriceId,
        // A plan with no explicit platform list grants all of them.
        platforms: dto.platforms ?? [...ALL_PLATFORM_IDS],
        isCustom: true,
      },
    });
  }

  async update(id: string, dto: UpdatePlanDto) {
    await this.findByIdOrThrow(id);

    if (dto.name) {
      const existing = await this.prisma.plan.findUnique({ where: { name: dto.name } });
      if (existing && existing.id !== id) throw new BadRequestException('A plan with this name already exists');
    }

    return this.prisma.plan.update({
      where: { id },
      data: {
        name: dto.name,
        price: dto.price,
        postsLimit: dto.postsLimit,
        connectedAccountsLimit: dto.connectedAccountsLimit,
        stripePriceId: dto.stripePriceId,
        platforms: dto.platforms,
        isActive: dto.isActive,
      },
    });
  }

  async remove(id: string) {
    await this.findByIdOrThrow(id);
    const inUse = await this.prisma.subscription.count({ where: { planId: id } });
    if (inUse > 0) {
      throw new BadRequestException(
        'This plan is assigned to at least one user — disable it instead of deleting, or move those users to another plan first.',
      );
    }
    await this.prisma.plan.delete({ where: { id } });
    return { id };
  }
}
