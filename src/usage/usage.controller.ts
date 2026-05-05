import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { UsageService } from './usage.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';

@Controller('admin/usage')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('admin')
export class UsageController {
  constructor(private usageService: UsageService) {}

  /**
   * GET /api/admin/usage/per-student
   * Returns per-user usage stats for cost attribution.
   */
  @Get('per-student')
  async getPerStudentUsage(@Query('from') from?: string, @Query('to') to?: string) {
    return this.usageService.getPerStudentUsage(from, to);
  }

  /**
   * GET /api/admin/usage/summary
   * High-level usage summary.
   */
  @Get('summary')
  async getUsageSummary(@Query('from') from?: string, @Query('to') to?: string) {
    return this.usageService.getUsageSummary(from, to);
  }
}
