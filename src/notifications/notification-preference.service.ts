import { Injectable } from '@nestjs/common';
import { ReminderMode } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { resolveOffsets } from './reminder-schedule.util';

@Injectable()
export class NotificationPreferenceService {
  constructor(private readonly prisma: PrismaService) {}

  /** คืน preference ของ user นั้น หรือค่า default (DEFAULT_SCHEDULE) ถ้ายังไม่เคยตั้ง */
  async getPreference(userId: string) {
    const pref = await this.prisma.notificationPreference.findUnique({ where: { userId } });
    return pref ?? { userId, mode: 'DEFAULT_SCHEDULE' as ReminderMode, customOffsetsMin: [] as number[] };
  }

  async getOffsetsFor(userId: string): Promise<number[]> {
    const pref = await this.getPreference(userId);
    return resolveOffsets(pref.mode, pref.customOffsetsMin);
  }

  async setMode(userId: string, mode: ReminderMode) {
    return this.prisma.notificationPreference.upsert({
      where: { userId },
      update: { mode, ...(mode !== 'CUSTOM' ? { customOffsetsMin: [] } : {}) },
      create: { userId, mode },
    });
  }

  async setCustomOffsets(userId: string, offsetsMin: number[]) {
    return this.prisma.notificationPreference.upsert({
      where: { userId },
      update: { mode: 'CUSTOM', customOffsetsMin: offsetsMin },
      create: { userId, mode: 'CUSTOM', customOffsetsMin: offsetsMin },
    });
  }
}
