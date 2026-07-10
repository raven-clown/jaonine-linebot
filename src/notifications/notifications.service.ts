import { Injectable } from '@nestjs/common';
import { NotifType } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class NotificationsService {
  constructor(private readonly prisma: PrismaService) {}

  schedule(taskId: string, type: NotifType, scheduledAt: Date) {
    return this.prisma.notificationSchedule.create({
      data: { taskId, type, scheduledAt },
    });
  }

  scheduleNow(taskId: string, type: NotifType) {
    return this.schedule(taskId, type, new Date());
  }

  async lastSentOfType(taskId: string, type: NotifType) {
    return this.prisma.notificationSchedule.findFirst({
      where: { taskId, type, sentAt: { not: null } },
      orderBy: { scheduledAt: 'desc' },
    });
  }
}
