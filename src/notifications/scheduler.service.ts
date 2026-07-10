import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as cron from 'node-cron';
import { NotifType, TaskStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { LineService } from '../line/line.service';
import { formatDate, priorityLabel } from '../line/flex-builder';

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
        task: { include: { assignedTo: true, creator: true, group: true } },
      },
      take: 50,
    });

    for (const notif of due) {
      try {
        await this.send(notif.type, notif.task);
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

  private async send(type: NotifType, task: any) {
    const groupLineId = task.group?.lineGroupId;
    const assigneeLineId = task.assignedTo?.lineUserId;

    switch (type) {
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
        const target = assigneeLineId ?? groupLineId;
        if (target) {
          await this.line.push(
            target,
            textMsg(
              `⏰ ใกล้ถึงเส้นตายแล้ว: "${task.title}"\nเส้นตาย: ${task.deadline ? formatDate(task.deadline) : '-'}`,
            ),
          );
        }
        break;
      }
      case NotifType.OVERDUE_REPEAT: {
        const messages = [
          `🚨 งานเลยกำหนดแล้ว: "${task.title}" (เส้นตาย ${task.deadline ? formatDate(task.deadline) : '-'})`,
        ];
        if (assigneeLineId) await this.line.push(assigneeLineId, textMsg(messages[0]));
        if (task.creator?.lineUserId && task.creator.lineUserId !== assigneeLineId) {
          await this.line.push(task.creator.lineUserId, textMsg(`${messages[0]}\n(แจ้งเพราะคุณเป็นผู้สร้างงานนี้)`));
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
