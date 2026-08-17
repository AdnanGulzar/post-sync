import {
  CanActivate,
  ExecutionContext,
  Injectable,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

/**
 * Blocks access unless the requesting user has an ACTIVE subscription
 * that has not passed its endDate. Subscriptions are granted manually
 * by an admin for this MVP (no self-serve billing yet).
 */
@Injectable()
export class SubscriptionGuard implements CanActivate {
  constructor(private prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const { user } = context.switchToHttp().getRequest();
    if (!user) throw new ForbiddenException('Not authenticated');

    // Admins are not subject to subscription checks.
    if (user.role === 'ADMIN') return true;

    const subscription = await this.prisma.subscription.findUnique({
      where: { userId: user.id },
    });

    if (!subscription || subscription.status !== 'ACTIVE') {
      throw new ForbiddenException(
        'Your account does not have an active subscription. Contact your admin for access.',
      );
    }

    if (subscription.endDate && subscription.endDate.getTime() < Date.now()) {
      throw new ForbiddenException('Your subscription has expired. Contact your admin.');
    }

    return true;
  }
}
