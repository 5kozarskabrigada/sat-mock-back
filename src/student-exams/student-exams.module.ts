import { Module } from '@nestjs/common';
import { StudentExamsService } from './student-exams.service';
import { StudentExamsController } from './student-exams.controller';
import { DatabaseModule } from '../database/database.module';

@Module({
  imports: [DatabaseModule],
  providers: [StudentExamsService],
  controllers: [StudentExamsController],
  exports: [StudentExamsService],
})
export class StudentExamsModule {}
