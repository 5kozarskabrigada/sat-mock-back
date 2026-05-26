import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  UseGuards,
} from '@nestjs/common';
import { QuestionsService } from './questions.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';

@Controller('questions')
@UseGuards(JwtAuthGuard, RolesGuard)
export class QuestionsController {
  constructor(private questionsService: QuestionsService) {}

  @Get('exam/:examId')
  async findByExam(@Param('examId') examId: string) {
    return this.questionsService.findByExam(examId);
  }

  @Get('deleted')
  @Roles('admin')
  async getDeleted() {
    return this.questionsService.getDeleted();
  }

  @Get(':id')
  async findOne(@Param('id') id: string) {
    return this.questionsService.findOne(id);
  }

  @Post()
  @Roles('admin')
  async create(@Body() questionData: any) {
    return this.questionsService.create(questionData);
  }

  @Post('bulk')
  @Roles('admin')
  async createBulk(
    @Body() data: { examId?: string; exam_id?: string; questions: any[] },
  ) {
    return this.questionsService.createBulk(
      data.exam_id ?? data.examId ?? '',
      data.questions,
    );
  }

  @Put(':id')
  @Roles('admin')
  async update(@Param('id') id: string, @Body() questionData: any) {
    return this.questionsService.update(id, questionData);
  }

  @Put('exam/:examId/reorder')
  @Roles('admin')
  async reorderByExam(
    @Param('examId') examId: string,
    @Body()
    data: { section: string; module: number; questionIdsInOrder: string[] },
  ) {
    return this.questionsService.reorderByExam(examId, data);
  }

  @Delete(':id')
  @Roles('admin')
  async delete(@Param('id') id: string) {
    return this.questionsService.softDelete(id);
  }

  @Post(':id/restore')
  @Roles('admin')
  async restore(@Param('id') id: string) {
    return this.questionsService.restore(id);
  }

  @Delete(':id/permanent')
  @Roles('admin')
  async permanentlyDelete(@Param('id') id: string) {
    return this.questionsService.permanentlyDelete(id);
  }
}
