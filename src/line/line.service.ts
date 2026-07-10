import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Client, ClientConfig, Message } from '@line/bot-sdk';
import * as crypto from 'crypto';

@Injectable()
export class LineService {
  private readonly logger = new Logger(LineService.name);
  private readonly client: Client;
  private readonly channelSecret: string;

  constructor(private readonly config: ConfigService) {
    this.channelSecret = this.config.get<string>('LINE_CHANNEL_SECRET') ?? '';
    const clientConfig: ClientConfig = {
      channelAccessToken: this.config.get<string>('LINE_CHANNEL_ACCESS_TOKEN') ?? '',
      channelSecret: this.channelSecret,
    };
    this.client = new Client(clientConfig);
  }

  /** ตรวจสอบลายเซ็นจาก LINE (ความปลอดภัยพื้นฐานของ webhook) */
  verifySignature(rawBody: Buffer, signature: string | undefined): boolean {
    if (!signature || !this.channelSecret) return false;
    const hash = crypto
      .createHmac('sha256', this.channelSecret)
      .update(rawBody)
      .digest('base64');
    try {
      return crypto.timingSafeEqual(Buffer.from(hash), Buffer.from(signature));
    } catch {
      return false;
    }
  }

  async reply(replyToken: string, messages: Message | Message[]) {
    try {
      await this.client.replyMessage(replyToken, messages);
    } catch (err) {
      this.logger.error(`reply failed: ${err?.message ?? err}`);
    }
  }

  async push(to: string, messages: Message | Message[]) {
    try {
      await this.client.pushMessage(to, messages);
    } catch (err) {
      this.logger.error(`push to ${to} failed: ${err?.message ?? err}`);
    }
  }

  async getGroupSummary(groupId: string) {
    try {
      return await this.client.getGroupSummary(groupId);
    } catch {
      return null;
    }
  }

  async getProfile(userId: string, groupId?: string) {
    try {
      if (groupId) {
        return await this.client.getGroupMemberProfile(groupId, userId);
      }
      return await this.client.getProfile(userId);
    } catch {
      return null;
    }
  }
}
