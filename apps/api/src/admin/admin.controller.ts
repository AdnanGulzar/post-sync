import { Body, Controller, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AdminService } from './admin.service';
import { CreateUserDto } from './dto/create-user.dto';
import { GrantSubscriptionDto } from './dto/grant-subscription.dto';
import { ParseEntityIdPipe } from '../common/pipes/parse-entity-id.pipe';

@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN')
@Controller('admin')
export class AdminController {
  constructor(private adminService: AdminService) {}

  @Get('users')
  listUsers() {
    return this.adminService.listUsers();
  }

  @Post('users')
  createUser(@CurrentUser() admin: any, @Body() dto: CreateUserDto) {
    return this.adminService.createUser(admin.id, dto);
  }

  @Patch('users/:id/subscription')
  grantSubscription(
    @CurrentUser() admin: any,
    @Param('id', ParseEntityIdPipe) userId: string,
    @Body() dto: GrantSubscriptionDto,
  ) {
    return this.adminService.grantSubscription(admin.id, userId, dto);
  }

  @Patch('users/:id/deactivate')
  deactivateUser(@Param('id', ParseEntityIdPipe) userId: string) {
    return this.adminService.deactivateUser(userId);
  }

  @Patch('users/:id/reactivate')
  reactivateUser(@Param('id', ParseEntityIdPipe) userId: string) {
    return this.adminService.reactivateUser(userId);
  }
}
