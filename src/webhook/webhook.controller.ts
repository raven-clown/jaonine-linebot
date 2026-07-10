import { BadRequestException, Controller, Headers, HttpCode, Logger, Post, Req } from '@nestjs/common';
import { Request } from 'express';
import { WebhookRequestBody } from '@line/bot-sdk';
import { LineService } from '../line/line.service';
import { CommandRouterService } from '../commands/command-router.service';

@Controller('webhook')
export class WebhookController {
  private readonly logger = new Logger(WebhookController.name);

  constructor(private readonly line: LineService, private readonly router: CommandRouterService) {}

  @Post()
  @HttpCode(200)
  async handleWebhook(@Req() req: Request, @Headers('x-line-signature') signature: string) {
    const rawBody: Buffer | undefined = (req as any).rawBody;
    if (!rawBody || !this.line.verifySignature(rawBody, signature)) {
      throw new BadRequestException('invalid signature');
    }

    const body = req.body as WebhookRequestBody;
    const events = body?.events ?? [];

    // ตอบ 200 ให้ LINE ไวๆ โดยไม่ต้องรอทุก event ประมวลผลเสร็จ (กัน webhook timeout)
    Promise.all(
      events.map((event) =>
        this.router.handle(event).catch((err) => this.logger.error(`event failed: ${err?.message ?? err}`)),
      ),
    ).catch(() => undefined);

    return { status: 'ok' };
  }
}
