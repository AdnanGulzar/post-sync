import { Controller, Get, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { PostAnalyticsService } from './post-analytics.service';

@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN')
@Controller('admin/analytics')
export class PostAnalyticsController {
  constructor(private postAnalyticsService: PostAnalyticsService) {}

  @Get('posts')
  posts() {
    return this.postAnalyticsService.getOverview();
  }
}
