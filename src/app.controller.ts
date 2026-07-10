import { Controller, Get } from '@nestjs/common';

@Controller()
export class AppController {
  @Get()
  health() {
    return { ok: true, bot: 'เจ้านาย (JaoNine) LINE Task Bot' };
  }
}
