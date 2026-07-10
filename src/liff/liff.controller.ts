import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Header,
  Headers,
  Post,
  Query,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AssignmentMode, Priority } from '@prisma/client';
import { LiffAuthService } from './liff-auth.service';
import { renderCreateTaskPage } from './create-task.page';
import { UsersService, personalSpaceId, isPersonalSpace } from '../users/users.service';
import { TasksService } from '../tasks/tasks.service';

const VALID_PRIORITIES: Priority[] = [Priority.HIGH, Priority.MEDIUM, Priority.LOW];

@Controller('liff')
export class LiffController {
  constructor(
    private readonly config: ConfigService,
    private readonly liffAuth: LiffAuthService,
    private readonly users: UsersService,
    private readonly tasks: TasksService,
  ) {}

  /** หน้าฟอร์ม LIFF สำหรับสร้างงาน — ใช้ได้ทั้งในแชทกลุ่มและแชทส่วนตัว (utou) */
  @Get('create-task')
  @Header('Content-Type', 'text/html; charset=utf-8')
  getCreateTaskPage(): string {
    const liffId = this.config.get<string>('LIFF_ID');
    if (!liffId) {
      return `<!DOCTYPE html><html lang="th"><meta charset="utf-8" /><body style="font-family:sans-serif;padding:32px;text-align:center;color:#333">ยังไม่ได้ตั้งค่า LIFF_ID บนเซิร์ฟเวอร์ครับ 🙏</body></html>`;
    }
    return renderCreateTaskPage(liffId);
  }

  /** รายชื่อสมาชิกในกลุ่ม ใช้เติม dropdown มอบหมายงาน (ไม่มีผลกับแชทส่วนตัว) */
  @Get('api/members')
  async getMembers(
    @Headers('authorization') auth: string | undefined,
    @Query('groupId') lineGroupId: string | undefined,
  ) {
    const idToken = this.liffAuth.extractBearer(auth);
    const { lineUserId } = await this.liffAuth.verifyIdToken(idToken);

    const effectiveGroupId =
      lineGroupId && lineGroupId !== 'null' && lineGroupId !== 'undefined'
        ? lineGroupId
        : personalSpaceId(lineUserId);

    if (isPersonalSpace(effectiveGroupId)) {
      return { members: [] };
    }

    const { group } = await this.users.ensureUserAndGroup(lineUserId, effectiveGroupId);
    if (!group) return { members: [] };

    const members = await this.users.listGroupMembers(group.id);
    return { members: members.map((m) => ({ id: m.id, displayName: m.displayName })) };
  }

  /** สร้างงานจากฟอร์ม LIFF — ยืนยันตัวตนด้วย ID token เสมอ ไม่เชื่อค่าที่ client ส่งมาเฉยๆ */
  @Post('api/tasks')
  async createTask(@Headers('authorization') auth: string | undefined, @Body() body: any) {
    const idToken = this.liffAuth.extractBearer(auth);
    const { lineUserId } = await this.liffAuth.verifyIdToken(idToken);

    const title = typeof body?.title === 'string' ? body.title.trim() : '';
    if (!title) throw new BadRequestException('ต้องมีหัวข้องานครับ');

    const isPersonalCtx = !body?.lineGroupId;
    const effectiveGroupId = isPersonalCtx ? personalSpaceId(lineUserId) : String(body.lineGroupId);

    const { user, group } = await this.users.ensureUserAndGroup(lineUserId, effectiveGroupId);
    if (!group) throw new BadRequestException('ไม่พบกลุ่มครับ');

    const priority: Priority = VALID_PRIORITIES.includes(body?.priority) ? body.priority : Priority.MEDIUM;

    let deadline: Date | null = null;
    if (body?.deadline) {
      deadline = new Date(body.deadline);
      if (isNaN(deadline.getTime())) throw new BadRequestException('รูปแบบเส้นตายไม่ถูกต้อง');
    }

    let assignmentMode: AssignmentMode = AssignmentMode.OPEN_CLAIM;
    let assignedToUserId: string | undefined;

    if (isPersonalCtx) {
      // งานส่วนตัว: มอบให้ตัวเองเสมอ ไม่ต้องเลือก (ไม่เชื่อ assignmentMode ที่ client ส่งมา)
      assignmentMode = AssignmentMode.EXCLUSIVE;
      assignedToUserId = user.id;
    } else if (body?.assignmentMode === 'EXCLUSIVE') {
      const candidate = typeof body?.assignedToUserId === 'string' ? body.assignedToUserId : '';
      const membership = candidate ? await this.users.getMembership(group.id, candidate) : null;
      if (!membership) throw new BadRequestException('ผู้ที่เลือกไม่ใช่สมาชิกกลุ่มนี้ครับ');
      assignmentMode = AssignmentMode.EXCLUSIVE;
      assignedToUserId = candidate;
    }

    const description =
      typeof body?.description === 'string' && body.description.trim() ? body.description.trim() : null;

    const task = await this.tasks.createTask(group.id, user.id, {
      title,
      description,
      priority,
      deadline,
      assignmentMode,
      assignedToUserId,
    });

    return { ok: true, taskId: task.id };
  }
}
