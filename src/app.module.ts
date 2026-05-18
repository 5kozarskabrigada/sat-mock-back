import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { DatabaseModule } from './database/database.module';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { ExamsModule } from './exams/exams.module';
import { QuestionsModule } from './questions/questions.module';
import { StudentExamsModule } from './student-exams/student-exams.module';
import { ClassroomsModule } from './classrooms/classrooms.module';
import { ActivityLogsModule } from './activity-logs/activity-logs.module';
import { UsageModule } from './usage/usage.module';
import { ImagesModule } from './images/images.module';
import { EmailModule } from './email/email.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    DatabaseModule,
    AuthModule,
    UsersModule,
    ExamsModule,
    QuestionsModule,
    StudentExamsModule,
    ClassroomsModule,
    ActivityLogsModule,
    UsageModule,
    ImagesModule,
    EmailModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
