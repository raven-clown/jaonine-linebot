import { Injectable } from '@nestjs/common';
import { NotifType } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationPreferenceService } from './notification-preference.service';

@Injectable()
export class NotificationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly preferences: NotificationPreferenceService,
  ) {}

  schedule(taskId: string, type: NotifType, scheduledAt: Date, recipientUserId?: string) {
    return this.prisma.notificationSchedule.create({
      data: { taskId, type, scheduledAt, recipientUserId: recipientUserId ?? null },
    });
  }

  scheduleNow(taskId: string, type: NotifType, recipientUserId?: string) {
    return this.schedule(taskId, type, new Date(), recipientUserId);
  }

  async lastSentOfType(taskId: string, type: NotifType, recipientUserId?: string) {
    return this.prisma.notificationSchedule.findFirst({
      where: { taskId, type, recipientUserId: recipientUserId ?? undefined, sentAt: { not: null } },
      orderBy: { scheduledAt: 'desc' },
    });
  }

  /**
   * ตั้งเตือนล่วงหน้าก่อนเดดไลน์ทั้งหมดให้ recipientUserId ตาม preference ของเขาเอง
   * ข้ามจุดที่เวลาผ่านไปแล้ว (ไม่ต้องส่งเตือนที่ล่วงเลยไปแล้วตอนสร้าง/มอบหมายงาน)
   */
  async scheduleDeadlineReminders(taskId: string, deadline: Date, recipientUserId: string) {
    const offsets = await this.preferences.getOffsetsFor(recipientUserId);
    const now = Date.now();
    const rows = offsets
      .map((min) => new Date(deadline.getTime() - min * 60 * 1000))
      .filter((at) => at.getTime() > now);

    if (rows.length === 0) return [];

    await this.prisma.notificationSchedule.createMany({
      data: rows.map((scheduledAt) => ({
        taskId,
        type: 'BEFORE_DEADLINE' as NotifType,
        scheduledAt,
        recipientUserId,
      })),
    });
    return rows;
  }

  /** ยกเลิกเตือนล่วงหน้าที่ยังไม่ส่งของงานนี้ (ใช้ตอนงานเสร็จ/ยกเลิก/ถอนมอบหมาย) */
  async cancelPendingDeadlineReminders(taskId: string, recipientUserId?: string) {
    await this.prisma.notificationSchedule.deleteMany({
      where: {
        taskId,
        type: 'BEFORE_DEADLINE',
        sentAt: null,
        ...(recipientUserId ? { recipientUserId } : {}),
      },
    });
  }
}
