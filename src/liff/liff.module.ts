import { Module } from '@nestjs/common';
import { LiffController } from './liff.controller';
import { LiffAuthService } from './liff-auth.service';
import { UsersModule } from '../users/users.module';
import { TasksModule } from '../tasks/tasks.module';

@Module({
  imports: [UsersModule, TasksModule],
  controllers: [LiffController],
  providers: [LiffAuthService],
})
export class LiffModule {}
