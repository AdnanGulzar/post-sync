import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../prisma/prisma.service';
import {
  USER_SAFE_SELECT,
  USER_WITH_SUBSCRIPTION_SELECT,
} from '../common/prisma/user-select';
import { PlansService } from '../subscriptions/plans.service';
import { CreateUserDto } from './dto/create-user.dto';
import { GrantSubscriptionDto } from './dto/grant-subscription.dto';

@Injectable()
export class AdminService {
  constructor(
    private prisma: PrismaService,
    private plansService: PlansService,
  ) {}

  async listUsers() {
    return this.prisma.user.findMany({
      where: { role: 'USER' },
      select: USER_WITH_SUBSCRIPTION_SELECT,
      orderBy: { createdAt: 'desc' },
    });
  }

  async createUser(adminId: string, dto: CreateUserDto) {
    const existing = await this.prisma.user.findUnique({ where: { email: dto.email } });
    if (existing) throw new ConflictException('An account with this email already exists');

    const passwordHash = await bcrypt.hash(dto.password, 12);
    const planId = await this.plansService.defaultSignupPlanId();

    return this.prisma.user.create({
      data: {
        email: dto.email,
        passwordHash,
        name: dto.name,
        role: 'USER',
        createdByAdminId: adminId,
        // Admin-created accounts are granted active access immediately,
        // since the admin is vouching for this user manually.
        subscription: { create: { planId, status: 'ACTIVE' } },
      },
      select: { ...USER_SAFE_SELECT, subscription: { include: { plan: true } } },
    });
  }

  async grantSubscription(adminId: string, userId: string, dto: GrantSubscriptionDto) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');

    const plan = await this.prisma.plan.findUnique({ where: { id: dto.planId } });
    if (!plan) throw new NotFoundException('Plan not found');

    return this.prisma.subscription.upsert({
      where: { userId },
      create: {
        userId,
        planId: dto.planId,
        status: dto.status,
        endDate: dto.endDate ? new Date(dto.endDate) : null,
        grantedByAdminId: adminId,
      },
      update: {
        planId: dto.planId,
        status: dto.status,
        endDate: dto.endDate ? new Date(dto.endDate) : null,
        grantedByAdminId: adminId,
      },
      include: { plan: true },
    });
  }

  async deactivateUser(userId: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');
    return this.prisma.user.update({
      where: { id: userId },
      data: { isActive: false },
      select: USER_SAFE_SELECT,
    });
  }

  async reactivateUser(userId: string) {
    return this.prisma.user.update({
      where: { id: userId },
      data: { isActive: true },
      select: USER_SAFE_SELECT,
    });
  }
}
