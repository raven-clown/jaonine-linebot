import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { WebhookEvent } from '@line/bot-sdk';
import { ReminderMode, TaskStatus } from '@prisma/client';
import { LineService } from '../line/line.service';
import { UsersService, personalSpaceId, isPersonalSpace } from '../users/users.service';
import { TasksService } from '../tasks/tasks.service';
import { ConversationService, ConversationState } from '../conversation/conversation.service';
import { NotificationPreferenceService } from '../notifications/notification-preference.service';
import { parseCustomOffsets } from '../notifications/reminder-schedule.util';
import * as fx from '../line/flex-builder';

const CREATE_KEYWORDS = ['สร้างงาน', 'สร้าง task', 'create task', 'newtask'];
const LIST_KEYWORDS = ['งาน', 'list', 'รายการงาน', 'ดูงาน'];
const MY_TASKS_KEYWORDS = ['งานของฉัน', 'งานฉัน', 'my tasks', 'mytasks'];
const HISTORY_KEYWORDS = ['ประวัติงาน', 'ประวัติ', 'history'];
const PLAN_KEYWORDS = ['แพลนของฉัน', 'แพลน', 'plan'];
const NAMED_TASKS_PREFIX = 'งานของ';
const REMINDER_KEYWORDS = ['ตั้งแจ้งเตือน', 'แจ้งเตือน', 'reminder', 'notify'];
const CANCEL_KEYWORDS = ['ยกเลิก', 'cancel'];
const HELP_KEYWORDS = ['help', 'ช่วยเหลือ', 'คำสั่ง'];
const SKIP_KEYWORDS = ['ข้าม', 'skip'];

@Injectable()
export class CommandRouterService {
  private readonly logger = new Logger(CommandRouterService.name);

  constructor(
    private readonly line: LineService,
    private readonly users: UsersService,
    private readonly tasks: TasksService,
    private readonly conversation: ConversationService,
    private readonly preferences: NotificationPreferenceService,
    private readonly config: ConfigService,
  ) {}

  async handle(event: WebhookEvent) {
    const source = event.source;
    const lineUserId = 'userId' in source ? source.userId : undefined;
    if (!lineUserId) return; // ต้องรู้ตัวผู้ส่งเสมอ

    let lineGroupId: string | undefined;
    if (source.type === 'group') {
      lineGroupId = source.groupId;
    } else if (source.type === 'user') {
      // แชทส่วนตัว 1-ต่อ-1 กับบอท -> ใช้ "พื้นที่ส่วนตัว" (personal space) แทนกลุ่ม สร้าง/จัดการงานของตัวเองได้เลย
      lineGroupId = personalSpaceId(lineUserId);
    }

    if (!lineGroupId) {
      // ห้องแชทแบบ multi-person (room) ที่ไม่ใช่ group อย่างเป็นทางการ — ยังไม่รองรับ
      if (event.type === 'message' && event.message.type === 'text') {
        await this.line.reply(
          event.replyToken,
          fx.textMessage(`${fx.BOT_NAME} ยังไม่รองรับแชทประเภทนี้ครับ ลองใช้ในแชทกลุ่ม หรือทักคุยส่วนตัวกับบอทแทนได้ครับ`),
        );
      }
      return;
    }

    const { user, group } = await this.users.ensureUserAndGroup(lineUserId, lineGroupId);
    if (!group) return;

    const isPersonal = isPersonalSpace(lineGroupId);

    if (event.type === 'message' && event.message.type === 'text') {
      await this.handleText(event, user.id, group.id, isPersonal);
      return;
    }

    if (event.type === 'postback') {
      await this.handlePostback(event, user.id, group.id);
      return;
    }
  }

  private async handleText(
    event: WebhookEvent & { type: 'message' },
    userId: string,
    groupId: string,
    isPersonal: boolean,
  ) {
    if (event.type !== 'message' || event.message.type !== 'text') return;
    const text = event.message.text.trim();
    const replyToken = event.replyToken;

    const state = this.conversation.get(groupId, userId);

    if (CANCEL_KEYWORDS.includes(text.toLowerCase()) && state) {
      this.conversation.clear(groupId, userId);
      await this.line.reply(replyToken, fx.textMessage('ยกเลิกขั้นตอนที่ทำอยู่แล้วครับ'));
      return;
    }

    if (state?.flow === 'CREATE_TASK') {
      await this.continueCreateTask(state, text, replyToken, userId, groupId);
      return;
    }
    if (state?.flow === 'SET_REMINDER') {
      await this.continueSetReminder(state, text, replyToken, userId, groupId);
      return;
    }

    if (CREATE_KEYWORDS.some((k) => text.toLowerCase().includes(k.toLowerCase()))) {
      const liffId = this.config.get<string>('LIFF_ID');
      if (liffId) {
        await this.line.reply(replyToken, fx.openCreateTaskFormMessage(liffId));
      } else {
        // ยังไม่ได้ตั้งค่า LIFF_ID บนเซิร์ฟเวอร์ -> ใช้ flow พิมพ์ทีละขั้นตอนแบบเดิมแทน
        this.conversation.start(groupId, userId, 'CREATE_TASK', 'AWAIT_TITLE', { isPersonal });
        await this.line.reply(replyToken, fx.askTitle());
      }
      return;
    }

    if (LIST_KEYWORDS.some((k) => text.toLowerCase() === k.toLowerCase())) {
      const tasks = await this.tasks.listTasks(groupId);
      await this.line.reply(replyToken, fx.taskListMessage(tasks));
      return;
    }

    if (MY_TASKS_KEYWORDS.some((k) => text.toLowerCase() === k.toLowerCase())) {
      const tasks = await this.tasks.listTasks(groupId, { assignedToId: userId });
      await this.line.reply(
        replyToken,
        fx.taskListMessage(tasks, {
          emptyText: 'ยังไม่มีงานที่คุณรับผิดชอบอยู่ครับ',
          altText: `📋 งานของฉัน (${tasks.length})`,
        }),
      );
      return;
    }

    if (HISTORY_KEYWORDS.some((k) => text.toLowerCase() === k.toLowerCase())) {
      const tasks = await this.tasks.listTasks(groupId, {
        statuses: [TaskStatus.DONE, TaskStatus.CANCELLED],
        orderBy: 'latest',
        take: 20,
      });
      await this.line.reply(
        replyToken,
        fx.taskListMessage(tasks, {
          emptyText: 'ยังไม่มีประวัติงานที่เสร็จหรือยกเลิกไปแล้วครับ',
          altText: `🗂️ ประวัติงาน (${tasks.length})`,
        }),
      );
      return;
    }

    if (PLAN_KEYWORDS.some((k) => text.toLowerCase() === k.toLowerCase())) {
      const info = await this.tasks.getPlanInfo(groupId, userId);
      await this.line.reply(replyToken, fx.planInfoMessage(info.plan, info.limit, info.current));
      return;
    }

    if (
      text.toLowerCase().startsWith(NAMED_TASKS_PREFIX.toLowerCase()) &&
      !MY_TASKS_KEYWORDS.includes(text.toLowerCase())
    ) {
      const name = text.slice(NAMED_TASKS_PREFIX.length).trim();
      if (!name) {
        await this.line.reply(replyToken, fx.textMessage('พิมพ์ชื่อคนที่อยากดูงานด้วยครับ เช่น "งานของแนน"'));
        return;
      }
      const member = await this.users.findMemberByName(groupId, name);
      if (member === null) {
        await this.line.reply(replyToken, fx.textMessage(`ไม่พบสมาชิกชื่อ "${name}" ในกลุ่มนี้ครับ`));
        return;
      }
      if (member === 'ambiguous') {
        await this.line.reply(
          replyToken,
          fx.textMessage(`เจอหลายคนที่ชื่อคล้าย "${name}" ครับ ลองพิมพ์ชื่อให้ตรงขึ้นอีกหน่อย`),
        );
        return;
      }
      const tasks = await this.tasks.listTasks(groupId, { assignedToId: member.id });
      await this.line.reply(
        replyToken,
        fx.taskListMessage(tasks, {
          emptyText: `${member.displayName} ยังไม่มีงานที่รับผิดชอบอยู่ครับ`,
          altText: `📋 งานของ${member.displayName} (${tasks.length})`,
        }),
      );
      return;
    }

    if (REMINDER_KEYWORDS.some((k) => text.toLowerCase() === k.toLowerCase())) {
      this.conversation.start(groupId, userId, 'SET_REMINDER', 'AWAIT_MODE');
      await this.line.reply(replyToken, fx.askReminderMode());
      return;
    }

    if (HELP_KEYWORDS.includes(text.toLowerCase())) {
      await this.line.reply(replyToken, fx.helpMessage());
      return;
    }

    // ข้อความอื่นๆ ที่ไม่ตรงคำสั่งใด ๆ และไม่มี state ค้าง -> เงียบไว้ ไม่ตอบกวนแชทกลุ่ม
  }

  private async continueCreateTask(
    state: ConversationState,
    text: string,
    replyToken: string,
    userId: string,
    groupId: string,
  ) {
    switch (state.step) {
      case 'AWAIT_TITLE': {
        this.conversation.update(groupId, userId, { data: { ...state.data, title: text }, step: 'AWAIT_DESCRIPTION' });
        await this.line.reply(replyToken, fx.askDescription(text));
        return;
      }
      case 'AWAIT_DESCRIPTION': {
        const description = SKIP_KEYWORDS.includes(text.toLowerCase()) ? null : text;
        this.conversation.update(groupId, userId, { data: { ...state.data, description }, step: 'AWAIT_PRIORITY' });
        await this.line.reply(replyToken, fx.askPriority());
        return;
      }
      case 'AWAIT_DEADLINE': {
        const parsed = new Date(text.replace(' ', 'T'));
        if (isNaN(parsed.getTime())) {
          await this.line.reply(
            replyToken,
            fx.textMessage('รูปแบบวันเวลาไม่ถูกต้องครับ ลองพิมพ์แบบ "2026-07-15 18:00" หรือกดข้ามได้เลย'),
          );
          return;
        }
        await this.afterDeadlineSet(state, parsed, replyToken, userId, groupId);
        return;
      }
      default:
        // ขั้นตอนอื่นรอ postback อย่างเดียว เตือนผู้ใช้
        await this.line.reply(replyToken, fx.textMessage('กรุณากดปุ่มตัวเลือกด้านบนครับ หรือพิมพ์ "ยกเลิก" เพื่อเริ่มใหม่'));
    }
  }

  /** หลังตั้ง/ข้ามเส้นตายแล้ว: งานส่วนตัวมอบให้ตัวเองอัตโนมัติ ข้ามขั้นตอนเลือกผู้รับผิดชอบไปเลย */
  private async afterDeadlineSet(
    state: ConversationState,
    deadline: Date | null,
    replyToken: string,
    userId: string,
    groupId: string,
  ) {
    if (state.data.isPersonal) {
      await this.finalizeTask(
        groupId,
        userId,
        { ...state.data, deadline, assignmentMode: 'EXCLUSIVE', assignedToUserId: userId },
        replyToken,
      );
      return;
    }
    this.conversation.update(groupId, userId, { data: { ...state.data, deadline }, step: 'AWAIT_ASSIGN_MODE' });
    await this.line.reply(replyToken, fx.askAssignmentMode());
  }

  private async continueSetReminder(
    state: ConversationState,
    text: string,
    replyToken: string,
    userId: string,
    groupId: string,
  ) {
    if (state.step !== 'AWAIT_CUSTOM_OFFSETS') {
      await this.line.reply(replyToken, fx.textMessage('กรุณากดปุ่มตัวเลือกด้านบนครับ หรือพิมพ์ "ยกเลิก" เพื่อเริ่มใหม่'));
      return;
    }

    const offsets = parseCustomOffsets(text);
    if (!offsets) {
      await this.line.reply(
        replyToken,
        fx.textMessage('รูปแบบไม่ถูกต้องครับ ลองพิมพ์แบบ "1mo 15d 7d 3d 1d 12h 6h 1h" หรือพิมพ์ "ยกเลิก"'),
      );
      return;
    }

    await this.preferences.setCustomOffsets(userId, offsets);
    this.conversation.clear(groupId, userId);
    await this.line.reply(replyToken, fx.reminderSetConfirmation('CUSTOM', offsets));
  }

  private async handlePostback(event: WebhookEvent & { type: 'postback' }, userId: string, groupId: string) {
    if (event.type !== 'postback') return;
    const data = event.postback.data;
    const replyToken = event.replyToken;
    const [action, value] = data.split(':');

    // ลบงานถาวร — ใช้ได้เฉพาะงานที่เสร็จ/ยกเลิกแล้ว และเฉพาะผู้สร้างงาน (เช็คในเซอร์วิส)
    if (action === 'delete') {
      try {
        const deleted = await this.tasks.deleteTask(value, userId);
        await this.line.reply(replyToken, fx.textMessage(`🗑️ ลบงาน "${deleted.title}" เรียบร้อยแล้วครับ`));
      } catch (err: any) {
        await this.line.reply(replyToken, fx.textMessage(`⚠️ ${err?.message ?? 'ลบงานไม่สำเร็จ'}`));
      }
      return;
    }

    // action บนงานที่มีอยู่แล้ว: claim / complete / unassign / cancel
    if (action === 'claim' || action === 'complete' || action === 'unassign' || action === 'cancel') {
      try {
        let task;
        if (action === 'claim') task = await this.tasks.claimTask(value, userId);
        else if (action === 'complete') task = await this.tasks.completeTask(value, userId);
        else if (action === 'unassign') task = await this.tasks.unassignTask(value, userId);
        else task = await this.tasks.cancelTask(value, userId);

        await this.line.reply(
          replyToken,
          fx.taskCard({
            id: task.id,
            title: task.title,
            description: task.description,
            priority: task.priority,
            status: task.status,
            deadline: task.deadline,
            assignmentMode: task.assignmentMode,
            assignedToName: task.assignedTo?.displayName,
            creatorName: task.creator.displayName,
          }),
        );
      } catch (err: any) {
        await this.line.reply(replyToken, fx.textMessage(`⚠️ ${err?.message ?? 'ทำรายการไม่สำเร็จ'}`));
      }
      return;
    }

    // เลือกโหมดแจ้งเตือน
    if (action === 'remindmode') {
      const state = this.conversation.get(groupId, userId);
      if (!state || state.flow !== 'SET_REMINDER') {
        await this.line.reply(replyToken, fx.textMessage('ขั้นตอนนี้หมดเวลาไปแล้วครับ พิมพ์ "ตั้งแจ้งเตือน" เพื่อเริ่มใหม่'));
        return;
      }
      const mode = value as ReminderMode;
      if (mode === 'CUSTOM') {
        this.conversation.update(groupId, userId, { step: 'AWAIT_CUSTOM_OFFSETS' });
        await this.line.reply(replyToken, fx.askCustomOffsets());
        return;
      }
      await this.preferences.setMode(userId, mode);
      this.conversation.clear(groupId, userId);
      await this.line.reply(replyToken, fx.reminderSetConfirmation(mode, []));
      return;
    }

    // action ระหว่างขั้นตอนสร้างงาน
    const state = this.conversation.get(groupId, userId);
    if (!state || state.flow !== 'CREATE_TASK') {
      await this.line.reply(replyToken, fx.textMessage('ขั้นตอนนี้หมดเวลาไปแล้วครับ พิมพ์ "สร้างงาน" เพื่อเริ่มใหม่'));
      return;
    }

    if (action === 'priority' && state.step === 'AWAIT_PRIORITY') {
      this.conversation.update(groupId, userId, { data: { ...state.data, priority: value }, step: 'AWAIT_DEADLINE' });
      await this.line.reply(replyToken, fx.askDeadline());
      return;
    }

    if (action === 'deadline' && value === 'skip' && state.step === 'AWAIT_DEADLINE') {
      await this.afterDeadlineSet(state, null, replyToken, userId, groupId);
      return;
    }

    if (action === 'assignmode' && state.step === 'AWAIT_ASSIGN_MODE') {
      if (value === 'OPEN_CLAIM') {
        await this.finalizeTask(groupId, userId, { ...state.data, assignmentMode: 'OPEN_CLAIM' }, replyToken);
        return;
      }
      const members = await this.users.listGroupMembers(groupId);
      if (members.length === 0) {
        await this.line.reply(replyToken, fx.textMessage('ยังไม่มีสมาชิกอื่นในระบบครับ ลองให้เพื่อนทักบอทก่อนแล้วค่อยลองใหม่'));
        return;
      }
      this.conversation.update(groupId, userId, { data: { ...state.data, assignmentMode: 'EXCLUSIVE' }, step: 'AWAIT_ASSIGNEE' });
      await this.line.reply(replyToken, fx.askAssignee(members));
      return;
    }

    if (action === 'assignee' && state.step === 'AWAIT_ASSIGNEE') {
      await this.finalizeTask(
        groupId,
        userId,
        { ...state.data, assignmentMode: 'EXCLUSIVE', assignedToUserId: value },
        replyToken,
      );
      return;
    }
  }

  private async finalizeTask(groupId: string, userId: string, draft: any, replyToken: string) {
    try {
      const task = await this.tasks.createTask(groupId, userId, draft);
      this.conversation.clear(groupId, userId);
      await this.line.reply(replyToken, [
        fx.textMessage('✅ สร้างงานสำเร็จ! กดปุ่มด้านล่างการ์ดเพื่อจัดการงานนี้ได้เลยครับ'),
        fx.taskCard({
          id: task.id,
          title: task.title,
          description: task.description,
          priority: task.priority,
          status: task.status,
          deadline: task.deadline,
          assignmentMode: task.assignmentMode,
          assignedToName: (task as any).assignedTo?.displayName,
          creatorName: (task as any).creator.displayName,
        }),
      ]);
    } catch (err: any) {
      await this.line.reply(replyToken, fx.textMessage(`⚠️ สร้างงานไม่สำเร็จ: ${err?.message ?? 'unknown error'}`));
    }
  }
}
