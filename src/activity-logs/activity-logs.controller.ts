import { Controller, Get, Post, Body, Query, UseGuards } from '@nestjs/common';
import { ActivityLogsService } from './activity-logs.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';

@Controller('activity-logs')
@UseGuards(JwtAuthGuard, RolesGuard)
export class ActivityLogsController {
  constructor(private activityLogsService: ActivityLogsService) {}

  @Get()
  @Roles('admin')
  async findAll(@Query() filters: any) {
    return this.activityLogsService.findAll(filters);
  }

  @Post()
  async create(@Body() logData: any) {
    return this.activityLogsService.create(logData);
  }
}
