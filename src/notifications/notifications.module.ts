import { Module } from '@nestjs/common';
import { NotificationsService } from './notifications.service';
import { SchedulerService } from './scheduler.service';
import { NotificationPreferenceService } from './notification-preference.service';

@Module({
  providers: [NotificationsService, SchedulerService, NotificationPreferenceService],
  exports: [NotificationsService, NotificationPreferenceService],
})
export class NotificationsModule {}
