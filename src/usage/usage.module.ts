import { Module, MiddlewareConsumer, NestModule } from '@nestjs/common';
import { UsageService } from './usage.service';
import { UsageController } from './usage.controller';
import { UsageTrackerMiddleware } from './usage.middleware';
import { DatabaseModule } from '../database/database.module';

@Module({
  imports: [DatabaseModule],
  providers: [UsageService, UsageTrackerMiddleware],
  controllers: [UsageController],
  exports: [UsageService],
})
export class UsageModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(UsageTrackerMiddleware).forRoutes('*');
  }
}
