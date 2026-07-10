import { Module } from '@nestjs/common';
import { NotificationsService } from './notifications.service';
import { SchedulerService } from './scheduler.service';

@Module({
  providers: [NotificationsService, SchedulerService],
  exports: [NotificationsService],
})
export class NotificationsModule {}
