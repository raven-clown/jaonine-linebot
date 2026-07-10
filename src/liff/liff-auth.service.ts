import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

/**
 * ตรวจสอบ LIFF ID token กับ LINE โดยตรง (ไม่เชื่อค่าที่ client ส่งมาเฉยๆ)
 * ป้องกันคนปลอมตัวเป็นคนอื่นตอนยิง API เข้ามาสร้าง/ดูงาน
 */
@Injectable()
export class LiffAuthService {
  private readonly channelId: string;

  constructor(config: ConfigService) {
    this.channelId = config.get<string>('LINE_CHANNEL_ID') ?? '';
  }

  async verifyIdToken(idToken: string | undefined): Promise<{ lineUserId: string }> {
    if (!idToken) throw new UnauthorizedException('missing id token');
    if (!this.channelId) throw new UnauthorizedException('server missing LINE_CHANNEL_ID config');

    const params = new URLSearchParams({ id_token: idToken, client_id: this.channelId });
    const res = await fetch('https://api.line.me/oauth2/v2.1/verify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params.toString(),
    });

    if (!res.ok) throw new UnauthorizedException('invalid id token');
    const data: any = await res.json();
    if (!data?.sub) throw new UnauthorizedException('invalid id token payload');

    return { lineUserId: data.sub };
  }

  extractBearer(authHeader?: string): string | undefined {
    if (!authHeader?.startsWith('Bearer ')) return undefined;
    return authHeader.slice('Bearer '.length);
  }
}
