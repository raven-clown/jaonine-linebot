import { Module } from '@nestjs/common';
import { TasksService } from './tasks.service';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [NotificationsModule],
  providers: [TasksService],
  exports: [TasksService],
})
export class TasksModule {}
