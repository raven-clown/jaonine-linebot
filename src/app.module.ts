import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller';
import { PrismaModule } from './prisma/prisma.module';
import { LineModule } from './line/line.module';
import { UsersModule } from './users/users.module';
import { TasksModule } from './tasks/tasks.module';
import { NotificationsModule } from './notifications/notifications.module';
import { ConversationModule } from './conversation/conversation.module';
import { CommandsModule } from './commands/commands.module';
import { WebhookModule } from './webhook/webhook.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule,
    LineModule,
    UsersModule,
    TasksModule,
    NotificationsModule,
    ConversationModule,
    CommandsModule,
    WebhookModule,
  ],
  controllers: [AppController],
})
export class AppModule {}
