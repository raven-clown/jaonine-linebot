import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as cron from 'node-cron';
import { TaskStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

/**
 * ป้องกันข้อมูลบวมบน Supabase free tier: ลบงานที่ "เสร็จแล้ว" หรือ "ยกเลิกแล้ว" ที่ผ่านมานานเกิน
 * TASK_RETENTION_DAYS (ค่าเริ่มต้น 365 วัน) ทิ้งอัตโนมัติทุกคืน — ระหว่างนี้ยังเรียกดูผ่าน "ประวัติงาน" ได้ตามปกติ
 * TaskLog / NotificationSchedule ที่เกี่ยวข้องจะถูกลบตามไปด้วยอัตโนมัติ (onDelete: Cascade ที่ตั้งไว้ในสคีมา)
 */
@Injectable()
export class TaskRetentionService implements OnModuleInit {
  private readonly logger = new Logger(TaskRetentionService.name);
  private readonly retentionDays: number;

  constructor(
    private readonly prisma: PrismaService,
    config: ConfigService,
  ) {
    this.retentionDays = Number(config.get('TASK_RETENTION_DAYS') ?? 365);
  }

  onModuleInit() {
    // รันทุกวันตอนตี 3 (ตามเวลาของโปรเซส/TZ ที่ตั้งไว้) — ช่วงที่คนใช้งานน้อยที่สุด
    cron.schedule('0 3 * * *', () => this.cleanup().catch((e) => this.logger.error(e)));
    this.logger.log(
      `Task retention cleanup scheduled: keep ${this.retentionDays} day(s) of DONE/CANCELLED history`,
    );
  }

  async cleanup(): Promise<number> {
    if (!Number.isFinite(this.retentionDays) || this.retentionDays <= 0) return 0; // <=0 = ปิดการลบอัตโนมัติ
    const cutoff = new Date(Date.now() - this.retentionDays * 24 * 60 * 60 * 1000);

    const result = await this.prisma.task.deleteMany({
      where: {
        status: { in: [TaskStatus.DONE, TaskStatus.CANCELLED] },
        updatedAt: { lt: cutoff },
      },
    });

    if (result.count > 0) {
      this.logger.log(`Retention cleanup: deleted ${result.count} old DONE/CANCELLED task(s)`);
    }
    return result.count;
  }
}
