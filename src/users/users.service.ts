import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { LineService } from '../line/line.service';

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService, private readonly line: LineService) {}

  /** เรียกทุกครั้งที่มี event เข้ามา เพื่อบันทึก User/Group/Membership อัตโนมัติ */
  async ensureUserAndGroup(lineUserId: string, lineGroupId?: string) {
    let user = await this.prisma.user.findUnique({ where: { lineUserId } });
    if (!user) {
      const profile = await this.line.getProfile(lineUserId, lineGroupId);
      user = await this.prisma.user.create({
        data: {
          lineUserId,
          displayName: profile?.displayName ?? 'ไม่ทราบชื่อ',
        },
      });
    }

    let group: Awaited<ReturnType<typeof this.prisma.group.findUnique>> = null;
    if (lineGroupId) {
      group = await this.prisma.group.findUnique({ where: { lineGroupId } });
      if (!group) {
        const summary = await this.line.getGroupSummary(lineGroupId);
        group = await this.prisma.group.create({
          data: {
            lineGroupId,
            name: summary?.groupName ?? 'กลุ่มไม่มีชื่อ',
          },
        });
      }

      const membership = await this.prisma.groupMember.findUnique({
        where: { groupId_userId: { groupId: group.id, userId: user.id } },
      });
      if (!membership) {
        await this.prisma.groupMember.create({
          data: { groupId: group.id, userId: user.id },
        });
      }
    }

    return { user, group };
  }

  async listGroupMembers(groupId: string) {
    const members = await this.prisma.groupMember.findMany({
      where: { groupId },
      include: { user: true },
    });
    return members.map((m) => ({
      id: m.user.id, // internal User.id — ใช้ผูก assignedToId ใน Task
      lineUserId: m.user.lineUserId,
      displayName: m.user.displayName,
      maxOpenTasks: m.maxOpenTasks,
    }));
  }

  async getMembership(groupId: string, userId: string) {
    return this.prisma.groupMember.findUnique({
      where: { groupId_userId: { groupId, userId } },
    });
  }
}
