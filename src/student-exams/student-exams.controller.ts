import {
  Controller,
  Get,
  Post,
  Put,
  Body,
  Param,
  Query,
  UseGuards,
  Request,
} from '@nestjs/common';
import { StudentExamsService } from './student-exams.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';

@Controller('student-exams')
@UseGuards(JwtAuthGuard, RolesGuard)
export class StudentExamsController {
  constructor(private studentExamsService: StudentExamsService) {}

  @Post('start')
  @Roles('student')
  async startExam(@Body() data: { examId: string }, @Request() req: any) {
    return this.studentExamsService.startExam(req.user.id, data.examId);
  }

  @Get('my-exams')
  @Roles('student')
  async getMyExams(@Request() req: any, @Query() filters: any) {
    return this.studentExamsService.getStudentExams(req.user.id, filters);
  }

  @Get(':id')
  async getStudentExam(@Param('id') id: string, @Request() req: any) {
    // Students can only view their own exams, admins can view all
    if (req.user.role === 'student') {
      return this.studentExamsService.getStudentExam(id, req.user.id);
    }
    // Admin view - remove student ID check
    return this.studentExamsService.getStudentExam(id, null);
  }

  @Get(':id/answers')
  async getAnswers(@Param('id') id: string) {
    return this.studentExamsService.getStudentAnswers(id);
  }

  @Post(':id/answer')
  @Roles('student')
  async saveAnswer(
    @Param('id') id: string,
    @Body() data: { questionId: string; answerValue: string },
    @Request() req: any,
  ) {
    return this.studentExamsService.saveAnswer(
      id,
      data.questionId,
      data.answerValue,
      req.user.id,
    );
  }

  @Post(':id/answers-batch')
  @Roles('student')
  async saveAnswersBatch(
    @Param('id') id: string,
    @Body()
    data: { answers: Array<{ questionId: string; answerValue: string }> },
    @Request() req: any,
  ) {
    return this.studentExamsService.saveAnswersBatch(
      id,
      data.answers,
      req.user.id,
    );
  }

  @Post(':id/complete')
  @Roles('student')
  async completeExam(@Param('id') id: string, @Request() req: any) {
    return this.studentExamsService.completeExam(id, req.user.id);
  }

  @Post(':id/lockdown-violation')
  @Roles('student')
  async recordViolation(@Param('id') id: string, @Request() req: any) {
    return this.studentExamsService.recordLockdownViolation(id, req.user.id);
  }

  @Get('exam/:examId/results')
  @Roles('admin')
  async getExamResults(@Param('examId') examId: string) {
    return this.studentExamsService.getExamResults(examId);
  }

  @Get('exam/:examId/participation')
  @Roles('admin')
  async getExamParticipation(@Param('examId') examId: string) {
    return this.studentExamsService.getExamParticipation(examId);
  }

  @Post(':id/send-report')
  @Roles('admin')
  async sendReportEmail(
    @Param('id') id: string,
    @Body() data: { email?: string },
  ) {
    return this.studentExamsService.generateAndSendReport(id, data.email);
  }
}
