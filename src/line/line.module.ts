import { Global, Module } from '@nestjs/common';
import { LineService } from './line.service';

@Global()
@Module({
  providers: [LineService],
  exports: [LineService],
})
export class LineModule {}
