import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as cron from 'node-cron';
import { NotifType, TaskStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { LineService } from '../line/line.service';
import { NotificationPreferenceService } from './notification-preference.service';
import { formatDate, priorityLabel } from '../line/flex-builder';
import { formatOffset } from './reminder-schedule.util';

/**
 * Scheduler (node-cron) — รันทุก N นาทีตาม SCHEDULER_INTERVAL_MIN
 * เช็คว่ามี NotificationSchedule ไหนถึงเวลาส่งหรือยัง (scheduledAt <= now AND sentAt IS NULL)
 * และสร้าง OVERDUE_REPEAT ใหม่เมื่อถึงรอบ
 */
@Injectable()
export class SchedulerService implements OnModuleInit {
  private readonly logger = new Logger(SchedulerService.name);
  private readonly overdueRepeatMin: number;
  private readonly intervalMin: number;

  constructor(
    private readonly prisma: PrismaService,
    private readonly line: LineService,
    private readonly preferences: NotificationPreferenceService,
    config: ConfigService,
  ) {
    this.overdueRepeatMin = Number(config.get('NOTIFY_OVERDUE_REPEAT_MIN') ?? 180);
    this.intervalMin = Number(config.get('SCHEDULER_INTERVAL_MIN') ?? 1);
  }

  onModuleInit() {
    const expr = `*/${Math.max(1, this.intervalMin)} * * * *`;
    cron.schedule(expr, () => this.tick().catch((e) => this.logger.error(e)));
    this.logger.log(`Notification scheduler started (cron: "${expr}")`);
  }

  private async tick() {
    await this.generateOverdueIfNeeded();
    await this.processDueNotifications();
  }

  private async generateOverdueIfNeeded() {
    const overdueTasks = await this.prisma.task.findMany({
      where: {
        status: { in: [TaskStatus.OPEN, TaskStatus.IN_PROGRESS] },
        deadline: { lt: new Date() },
      },
    });

    for (const task of overdueTasks) {
      const last = await this.prisma.notificationSchedule.findFirst({
        where: { taskId: task.id, type: NotifType.OVERDUE_REPEAT },
        orderBy: { scheduledAt: 'desc' },
      });
      const dueForAnother =
        !last || Date.now() - new Date(last.scheduledAt).getTime() >= this.overdueRepeatMin * 60 * 1000;
      if (dueForAnother) {
        await this.prisma.notificationSchedule.create({
          data: { taskId: task.id, type: NotifType.OVERDUE_REPEAT, scheduledAt: new Date() },
        });
      }
    }
  }

  private async processDueNotifications() {
    const due = await this.prisma.notificationSchedule.findMany({
      where: { sentAt: null, scheduledAt: { lte: new Date() } },
      include: {
        recipient: true,
        task: { include: { assignedTo: true, creator: true, group: true } },
      },
      take: 50,
    });

    for (const notif of due) {
      try {
        await this.send(notif, notif.task);
      } catch (err) {
        this.logger.error(`send notif ${notif.id} failed: ${err?.message ?? err}`);
      } finally {
        await this.prisma.notificationSchedule.update({
          where: { id: notif.id },
          data: { sentAt: new Date() },
        });
      }
    }
  }

  private async send(notif: any, task: any) {
    const groupLineId = task.group?.lineGroupId;
    const assigneeLineId = task.assignedTo?.lineUserId;

    switch (notif.type as NotifType) {
      case NotifType.ASSIGNED_ALERT: {
        if (assigneeLineId) {
          await this.line.push(
            assigneeLineId,
            textMsg(`📌 คุณได้รับมอบหมายงาน: "${task.title}"\nความสำคัญ: ${priorityLabel(task.priority)}`),
          );
        }
        break;
      }
      case NotifType.BEFORE_DEADLINE: {
        const target = notif.recipient?.lineUserId ?? assigneeLineId ?? groupLineId;
        if (!target || !task.deadline) break;

        const offsetMin = Math.max(
          0,
          Math.round((new Date(task.deadline).getTime() - new Date(notif.scheduledAt).getTime()) / 60000),
        );
        const text =
          offsetMin <= 0
            ? `⏰ ถึงเวลาเดดไลน์แล้ว: "${task.title}" (เส้นตาย ${formatDate(task.deadline)})`
            : `⏰ อีก${formatOffset(offsetMin)}จะถึงเดดไลน์: "${task.title}" (เส้นตาย ${formatDate(task.deadline)})`;
        await this.line.push(target, textMsg(text));
        break;
      }
      case NotifType.OVERDUE_REPEAT: {
        const message = `🚨 งานเลยกำหนดแล้ว: "${task.title}" (เส้นตาย ${task.deadline ? formatDate(task.deadline) : '-'})`;

        if (assigneeLineId) {
          const pref = await this.preferences.getPreference(task.assignedTo.id);
          if (pref.mode !== 'OFF') {
            await this.line.push(assigneeLineId, textMsg(message));
          }
        }
        if (task.creator?.lineUserId && task.creator.lineUserId !== assigneeLineId) {
          const creatorPref = await this.preferences.getPreference(task.creator.id);
          if (creatorPref.mode !== 'OFF') {
            await this.line.push(task.creator.lineUserId, textMsg(`${message}\n(แจ้งเพราะคุณเป็นผู้สร้างงานนี้)`));
          }
        }
        break;
      }
      case NotifType.CLAIMED_BROADCAST: {
        if (groupLineId) {
          await this.line.push(
            groupLineId,
            textMsg(`✋ "${task.title}" ถูกรับไปแล้วโดย ${task.assignedTo?.displayName ?? 'สมาชิกในกลุ่ม'}`),
          );
        }
        break;
      }
    }
  }
}

function textMsg(text: string) {
  return { type: 'text' as const, text };
}
