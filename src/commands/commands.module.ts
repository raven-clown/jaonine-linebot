import { Module } from '@nestjs/common';
import { CommandRouterService } from './command-router.service';
import { UsersModule } from '../users/users.module';
import { TasksModule } from '../tasks/tasks.module';
import { ConversationModule } from '../conversation/conversation.module';

@Module({
  imports: [UsersModule, TasksModule, ConversationModule],
  providers: [CommandRouterService],
  exports: [CommandRouterService],
})
export class CommandsModule {}
