import { Module } from '@nestjs/common';
import { NotificationsService } from './notifications.service';
import { SchedulerService } from './scheduler.service';
import { NotificationPreferenceService } from './notification-preference.service';
import { TaskRetentionService } from './task-retention.service';

@Module({
  providers: [NotificationsService, SchedulerService, NotificationPreferenceService, TaskRetentionService],
  exports: [NotificationsService, NotificationPreferenceService],
})
export class NotificationsModule {}
