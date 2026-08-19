import { Controller, Get, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { BillingAnalyticsService } from './billing-analytics.service';

@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN')
@Controller('admin/billing')
export class BillingController {
  constructor(private billingAnalyticsService: BillingAnalyticsService) {}

  @Get()
  overview() {
    return this.billingAnalyticsService.getOverview();
  }
}
