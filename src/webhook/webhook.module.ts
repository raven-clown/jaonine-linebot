import { Module } from '@nestjs/common';
import { WebhookController } from './webhook.controller';
import { CommandsModule } from '../commands/commands.module';

@Module({
  imports: [CommandsModule],
  controllers: [WebhookController],
})
export class WebhookModule {}
