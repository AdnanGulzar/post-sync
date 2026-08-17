import { Controller, Get } from '@nestjs/common';
import { PlansService } from './plans.service';

// Public (no auth) — the signup page needs to list plans before an account exists.
@Controller('plans')
export class PlansPublicController {
  constructor(private plansService: PlansService) {}

  @Get()
  list() {
    return this.plansService.listActive();
  }
}
