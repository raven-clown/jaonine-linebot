import { Module } from '@nestjs/common';
import { CommandRouterService } from './command-router.service';
import { UsersModule } from '../users/users.module';
import { TasksModule } from '../tasks/tasks.module';
import { ConversationModule } from '../conversation/conversation.module';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [UsersModule, TasksModule, ConversationModule, NotificationsModule],
  providers: [CommandRouterService],
  exports: [CommandRouterService],
})
export class CommandsModule {}
