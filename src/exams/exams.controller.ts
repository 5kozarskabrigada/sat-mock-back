import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  Request,
} from '@nestjs/common';
import { ExamsService } from './exams.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';

@Controller('exams')
@UseGuards(JwtAuthGuard, RolesGuard)
export class ExamsController {
  constructor(private examsService: ExamsService) {}

  @Get()
  async findAll(@Query() query: any) {
    return this.examsService.findAll(query);
  }

  @Get('deleted')
  @Roles('admin')
  async getDeleted() {
    return this.examsService.getDeleted();
  }

  @Get(':id')
  async findOne(@Param('id') id: string) {
    return this.examsService.findOne(id);
  }

  @Post()
  @Roles('admin')
  async create(@Body() examData: any, @Request() req: any) {
    return this.examsService.create(examData, req.user.id);
  }

  @Put(':id')
  @Roles('admin')
  async update(@Param('id') id: string, @Body() examData: any) {
    return this.examsService.update(id, examData);
  }

  @Delete(':id')
  @Roles('admin')
  async delete(@Param('id') id: string) {
    return this.examsService.softDelete(id);
  }

  @Post(':id/restore')
  @Roles('admin')
  async restore(@Param('id') id: string) {
    return this.examsService.restore(id);
  }

  @Delete(':id/permanent')
  @Roles('admin')
  async permanentlyDelete(@Param('id') id: string) {
    return this.examsService.permanentlyDelete(id);
  }
}
