import { Module } from '@nestjs/common';
import { StudentExamsService } from './student-exams.service';
import { StudentExamsController } from './student-exams.controller';
import { DatabaseModule } from '../database/database.module';
import { PdfModule } from '../pdf/pdf.module';
import { EmailModule } from '../email/email.module';

@Module({
  imports: [DatabaseModule, PdfModule, EmailModule],
  providers: [StudentExamsService],
  controllers: [StudentExamsController],
  exports: [StudentExamsService],
})
export class StudentExamsModule {}
