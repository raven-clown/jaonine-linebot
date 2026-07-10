import { Injectable, BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { AssignmentMode, LogAction, Priority, TaskStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { CreateTaskDraft } from '../conversation/conversation.service';

@Injectable()
export class TasksService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
  ) {}

  private taskInclude = {
    creator: true,
    assignedTo: true,
  } as const;

  private async countOpenTasksFor(groupId: string, userId: string) {
    return this.prisma.task.count({
      where: {
        groupId,
        assignedToId: userId,
        status: { in: [TaskStatus.OPEN, TaskStatus.IN_PROGRESS] },
      },
    });
  }

  private async assertUnderLimit(groupId: string, userId: string) {
    const membership = await this.prisma.groupMember.findUnique({
      where: { groupId_userId: { groupId, userId } },
    });
    const limit = membership?.maxOpenTasks ?? 3;
    const current = await this.countOpenTasksFor(groupId, userId);
    if (current >= limit) {
      throw new BadRequestException(`รับงานไม่ได้ครับ ถึงลิมิตงานค้าง (${current}/${limit}) แล้ว`);
    }
  }

  async createTask(groupId: string, creatorId: string, draft: CreateTaskDraft) {
    if (!draft.title) throw new BadRequestException('ต้องมีหัวข้องาน');

    let assignedToId: string | undefined;
    if (draft.assignmentMode === 'EXCLUSIVE' && draft.assignedToUserId) {
      await this.assertUnderLimit(groupId, draft.assignedToUserId);
      assignedToId = draft.assignedToUserId;
    }

    const task = await this.prisma.task.create({
      data: {
        groupId,
        creatorId,
        title: draft.title,
        description: draft.description ?? null,
        priority: draft.priority ?? Priority.MEDIUM,
        deadline: draft.deadline ?? null,
        assignmentMode: draft.assignmentMode ?? AssignmentMode.OPEN_CLAIM,
        assignedToId: assignedToId ?? null,
        status: assignedToId ? TaskStatus.IN_PROGRESS : TaskStatus.OPEN,
      },
      include: this.taskInclude,
    });

    await this.prisma.taskLog.create({
      data: { taskId: task.id, actorId: creatorId, action: LogAction.CREATED },
    });

    if (assignedToId) {
      await this.prisma.taskLog.create({
        data: { taskId: task.id, actorId: creatorId, action: LogAction.ASSIGNED },
      });
      await this.notifications.scheduleNow(task.id, 'ASSIGNED_ALERT');
    }

    if (task.deadline) {
      // ตั้งเตือนล่วงหน้าตาม preference ของผู้รับผิดชอบ (ถ้ายังไม่มีคนรับ ใช้ preference ของผู้สร้างไปก่อน)
      const recipientId = assignedToId ?? creatorId;
      await this.notifications.scheduleDeadlineReminders(task.id, task.deadline, recipientId);
    }

    return task;
  }

  async listTasks(groupId: string, statuses: TaskStatus[] = [TaskStatus.OPEN, TaskStatus.IN_PROGRESS]) {
    const tasks = await this.prisma.task.findMany({
      where: { groupId, status: { in: statuses } },
      include: this.taskInclude,
      orderBy: [{ priority: 'asc' }, { createdAt: 'asc' }],
    });
    return tasks.map((t) => ({ ...t, assignedToName: t.assignedTo?.displayName, creatorName: t.creator.displayName }));
  }

  async getTask(taskId: string) {
    const task = await this.prisma.task.findUnique({ where: { id: taskId }, include: this.taskInclude });
    if (!task) throw new NotFoundException('ไม่พบงานนี้ครับ (อาจถูกลบหรือยกเลิกไปแล้ว)');
    return task;
  }

  /** รับงานแบบ open-claim — ป้องกัน race condition ด้วย conditional update */
  async claimTask(taskId: string, userId: string) {
    const task = await this.getTask(taskId);
    if (task.assignmentMode !== AssignmentMode.OPEN_CLAIM) {
      throw new BadRequestException('งานนี้ไม่ใช่แบบเปิดให้กดรับครับ');
    }
    if (task.status !== TaskStatus.OPEN) {
      throw new BadRequestException('งานนี้ถูกรับไปแล้วครับ ช้าไปหน่อย 😅');
    }

    await this.assertUnderLimit(task.groupId, userId);

    // atomic: update only if ยังไม่มีคนรับ ป้องกันสองคนกดพร้อมกัน
    const result = await this.prisma.task.updateMany({
      where: { id: taskId, status: TaskStatus.OPEN, assignedToId: null },
      data: { assignedToId: userId, status: TaskStatus.IN_PROGRESS },
    });

    if (result.count === 0) {
      throw new BadRequestException('งานนี้ถูกรับไปแล้วครับ ช้าไปหน่อย 😅');
    }

    await this.prisma.taskLog.create({
      data: { taskId, actorId: userId, action: LogAction.CLAIMED },
    });
    await this.notifications.scheduleNow(taskId, 'CLAIMED_BROADCAST');

    // ตั้งเตือนล่วงหน้าให้คนที่เพิ่งรับงานไป ตาม preference ของเขาเอง
    if (task.deadline) {
      await this.notifications.scheduleDeadlineReminders(taskId, task.deadline, userId);
    }

    return this.getTask(taskId);
  }

  async unassignTask(taskId: string, userId: string) {
    const task = await this.getTask(taskId);
    if (task.status !== TaskStatus.IN_PROGRESS && task.status !== TaskStatus.OPEN) {
      throw new BadRequestException('งานนี้แก้ไขสถานะไม่ได้แล้วครับ');
    }
    if (task.assignmentMode === AssignmentMode.EXCLUSIVE && task.creatorId !== userId && task.assignedToId !== userId) {
      throw new ForbiddenException('เฉพาะผู้สร้างหรือผู้รับผิดชอบเท่านั้นที่ถอนงานนี้ได้');
    }

    await this.prisma.task.update({
      where: { id: taskId },
      data: { assignedToId: null, status: TaskStatus.OPEN },
    });
    await this.prisma.taskLog.create({
      data: {
        taskId,
        actorId: userId,
        action: task.assignmentMode === AssignmentMode.OPEN_CLAIM ? LogAction.UNCLAIMED : LogAction.UNASSIGNED,
      },
    });

    // คนที่ถูกถอนออกไม่ต้องได้รับเตือนล่วงหน้าของงานนี้อีก
    if (task.assignedToId) {
      await this.notifications.cancelPendingDeadlineReminders(taskId, task.assignedToId);
    }

    return this.getTask(taskId);
  }

  async completeTask(taskId: string, userId: string) {
    const task = await this.getTask(taskId);
    if (task.status === TaskStatus.DONE) {
      throw new BadRequestException('งานนี้เสร็จไปแล้วครับ');
    }
    await this.prisma.task.update({ where: { id: taskId }, data: { status: TaskStatus.DONE } });
    await this.prisma.taskLog.create({
      data: { taskId, actorId: userId, action: LogAction.COMPLETED },
    });
    await this.notifications.cancelPendingDeadlineReminders(taskId);
    return this.getTask(taskId);
  }

  async cancelTask(taskId: string, userId: string) {
    const task = await this.getTask(taskId);
    if (task.creatorId !== userId) {
      throw new ForbiddenException('เฉพาะผู้สร้างงานเท่านั้นที่ยกเลิกได้');
    }
    await this.prisma.task.update({ where: { id: taskId }, data: { status: TaskStatus.CANCELLED } });
    await this.prisma.taskLog.create({
      data: { taskId, actorId: userId, action: LogAction.CANCELLED },
    });
    await this.notifications.cancelPendingDeadlineReminders(taskId);
    return this.getTask(taskId);
  }
}
