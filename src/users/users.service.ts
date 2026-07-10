import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { LineService } from '../line/line.service';

const PERSONAL_PREFIX = 'personal:';

/** ID ของ "พื้นที่ส่วนตัว" (pseudo-group ที่มีสมาชิกแค่คนเดียว) ใช้ตอนคุย 1-ต่อ-1 กับบอท */
export function personalSpaceId(lineUserId: string): string {
  return `${PERSONAL_PREFIX}${lineUserId}`;
}

export function isPersonalSpace(lineGroupId?: string | null): boolean {
  return !!lineGroupId?.startsWith(PERSONAL_PREFIX);
}

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService, private readonly line: LineService) {}

  /** เรียกทุกครั้งที่มี event เข้ามา เพื่อบันทึก User/Group/Membership อัตโนมัติ
   *  ถ้า lineGroupId เป็น personal space (คุย 1-ต่อ-1) จะสร้าง "กลุ่มส่วนตัว" ที่มีแค่ตัวเองแทน */
  async ensureUserAndGroup(lineUserId: string, lineGroupId?: string) {
    let user = await this.prisma.user.findUnique({ where: { lineUserId } });
    const isPersonal = isPersonalSpace(lineGroupId);
    if (!user) {
      const profile = isPersonal ? null : await this.line.getProfile(lineUserId, lineGroupId);
      user = await this.prisma.user.create({
        data: {
          lineUserId,
          displayName: profile?.displayName ?? (isPersonal ? undefined : 'ไม่ทราบชื่อ') ?? 'ไม่ทราบชื่อ',
        },
      });
      // สำหรับแชทส่วนตัว ดึงชื่อจริงจาก getProfile (ไม่ต้องพึ่ง groupId)
      if (isPersonal) {
        const profile2 = await this.line.getProfile(lineUserId);
        if (profile2?.displayName) {
          user = await this.prisma.user.update({ where: { id: user.id }, data: { displayName: profile2.displayName } });
        }
      }
    }

    let group: Awaited<ReturnType<typeof this.prisma.group.findUnique>> = null;
    if (lineGroupId) {
      group = await this.prisma.group.findUnique({ where: { lineGroupId } });
      if (!group) {
        const name = isPersonal
          ? `งานส่วนตัวของ ${user.displayName}`
          : (await this.line.getGroupSummary(lineGroupId))?.groupName ?? 'กลุ่มไม่มีชื่อ';
        group = await this.prisma.group.create({ data: { lineGroupId, name } });
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
      maxOpenTasksOverride: m.maxOpenTasksOverride,
    }));
  }

  async getMembership(groupId: string, userId: string) {
    return this.prisma.groupMember.findUnique({
      where: { groupId_userId: { groupId, userId } },
    });
  }

  /** หาสมาชิกในกลุ่มจากชื่อ (ตรงตัวก่อน ไม่งั้นค่อยหาแบบ substring แบบไม่สนตัวพิมพ์เล็ก-ใหญ่)
   *  ใช้กับคำสั่ง "งานของ<ชื่อ>" — คืนค่า null ถ้าไม่เจอ, คืน 'ambiguous' ถ้าเจอมากกว่า 1 คนตอน match แบบ substring */
  async findMemberByName(
    groupId: string,
    name: string,
  ): Promise<{ id: string; displayName: string } | 'ambiguous' | null> {
    const members = await this.listGroupMembers(groupId);
    const needle = name.trim().toLowerCase();
    if (!needle) return null;

    const exact = members.find((m) => m.displayName.toLowerCase() === needle);
    if (exact) return exact;

    const partial = members.filter((m) => m.displayName.toLowerCase().includes(needle));
    if (partial.length === 1) return partial[0];
    if (partial.length > 1) return 'ambiguous';
    return null;
  }
}
