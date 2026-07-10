import { Injectable, Logger } from '@nestjs/common';
import { WebhookEvent } from '@line/bot-sdk';
import { LineService } from '../line/line.service';
import { UsersService } from '../users/users.service';
import { TasksService } from '../tasks/tasks.service';
import { ConversationService } from '../conversation/conversation.service';
import * as fx from '../line/flex-builder';

const CREATE_KEYWORDS = ['สร้างงาน', 'สร้าง task', 'create task', 'newtask'];
const LIST_KEYWORDS = ['งาน', 'list', 'รายการงาน', 'ดูงาน'];
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
  ) {}

  async handle(event: WebhookEvent) {
    const source = event.source;
    const lineUserId = 'userId' in source ? source.userId : undefined;
    if (!lineUserId) return; // ต้องรู้ตัวผู้ส่งเสมอ

    const lineGroupId = source.type === 'group' ? source.groupId : undefined;

    if (!lineGroupId) {
      if (event.type === 'message' && event.message.type === 'text') {
        await this.line.reply(
          event.replyToken,
          fx.textMessage(`${fx.BOT_NAME} ใช้งานในแชทกลุ่มครับ ลองชวนบอทเข้ากลุ่มแล้วพิมพ์คุยกันได้เลย`),
        );
      }
      return;
    }

    const { user, group } = await this.users.ensureUserAndGroup(lineUserId, lineGroupId);
    if (!group) return;

    if (event.type === 'message' && event.message.type === 'text') {
      await this.handleText(event, user.id, group.id);
      return;
    }

    if (event.type === 'postback') {
      await this.handlePostback(event, user.id, group.id);
      return;
    }
  }

  private async handleText(event: WebhookEvent & { type: 'message' }, userId: string, groupId: string) {
    if (event.type !== 'message' || event.message.type !== 'text') return;
    const text = event.message.text.trim();
    const replyToken = event.replyToken;

    const state = this.conversation.get(groupId, userId);

    if (CANCEL_KEYWORDS.includes(text.toLowerCase()) && state) {
      this.conversation.clear(groupId, userId);
      await this.line.reply(replyToken, fx.textMessage('ยกเลิกขั้นตอนที่ทำอยู่แล้วครับ'));
      return;
    }

    if (state) {
      await this.continueConversation(state, text, replyToken, userId, groupId);
      return;
    }

    if (CREATE_KEYWORDS.some((k) => text.toLowerCase().includes(k.toLowerCase()))) {
      this.conversation.start(groupId, userId);
      await this.line.reply(replyToken, fx.askTitle());
      return;
    }

    if (LIST_KEYWORDS.some((k) => text.toLowerCase() === k.toLowerCase())) {
      const tasks = await this.tasks.listTasks(groupId);
      await this.line.reply(replyToken, fx.taskListMessage(tasks));
      return;
    }

    if (HELP_KEYWORDS.includes(text.toLowerCase())) {
      await this.line.reply(replyToken, fx.helpMessage());
      return;
    }

    // ข้อความอื่นๆ ที่ไม่ตรงคำสั่งใด ๆ และไม่มี state ค้าง -> เงียบไว้ ไม่ตอบกวนแชทกลุ่ม
  }

  private async continueConversation(
    state: ReturnType<ConversationService['get']>,
    text: string,
    replyToken: string,
    userId: string,
    groupId: string,
  ) {
    if (!state) return;

    switch (state.step) {
      case 'AWAIT_TITLE': {
        this.conversation.update(groupId, userId, { draft: { ...state.draft, title: text }, step: 'AWAIT_DESCRIPTION' });
        await this.line.reply(replyToken, fx.askDescription(text));
        return;
      }
      case 'AWAIT_DESCRIPTION': {
        const description = SKIP_KEYWORDS.includes(text.toLowerCase()) ? null : text;
        this.conversation.update(groupId, userId, { draft: { ...state.draft, description }, step: 'AWAIT_PRIORITY' });
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
        this.conversation.update(groupId, userId, { draft: { ...state.draft, deadline: parsed }, step: 'AWAIT_ASSIGN_MODE' });
        await this.line.reply(replyToken, fx.askAssignmentMode());
        return;
      }
      default:
        // ขั้นตอนอื่นรอ postback อย่างเดียว เตือนผู้ใช้
        await this.line.reply(replyToken, fx.textMessage('กรุณากดปุ่มตัวเลือกด้านบนครับ หรือพิมพ์ "ยกเลิก" เพื่อเริ่มใหม่'));
    }
  }

  private async handlePostback(event: WebhookEvent & { type: 'postback' }, userId: string, groupId: string) {
    if (event.type !== 'postback') return;
    const data = event.postback.data;
    const replyToken = event.replyToken;
    const [action, value] = data.split(':');

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

    // action ระหว่างขั้นตอนสร้างงาน
    const state = this.conversation.get(groupId, userId);
    if (!state) {
      await this.line.reply(replyToken, fx.textMessage('ขั้นตอนนี้หมดเวลาไปแล้วครับ พิมพ์ "สร้างงาน" เพื่อเริ่มใหม่'));
      return;
    }

    if (action === 'priority' && state.step === 'AWAIT_PRIORITY') {
      this.conversation.update(groupId, userId, { draft: { ...state.draft, priority: value as any }, step: 'AWAIT_DEADLINE' });
      await this.line.reply(replyToken, fx.askDeadline());
      return;
    }

    if (action === 'deadline' && value === 'skip' && state.step === 'AWAIT_DEADLINE') {
      this.conversation.update(groupId, userId, { draft: { ...state.draft, deadline: null }, step: 'AWAIT_ASSIGN_MODE' });
      await this.line.reply(replyToken, fx.askAssignmentMode());
      return;
    }

    if (action === 'assignmode' && state.step === 'AWAIT_ASSIGN_MODE') {
      if (value === 'OPEN_CLAIM') {
        await this.finalizeTask(groupId, userId, { ...state.draft, assignmentMode: 'OPEN_CLAIM' }, replyToken);
        return;
      }
      const members = await this.users.listGroupMembers(groupId);
      if (members.length === 0) {
        await this.line.reply(replyToken, fx.textMessage('ยังไม่มีสมาชิกอื่นในระบบครับ ลองให้เพื่อนทักบอทก่อนแล้วค่อยลองใหม่'));
        return;
      }
      this.conversation.update(groupId, userId, { draft: { ...state.draft, assignmentMode: 'EXCLUSIVE' }, step: 'AWAIT_ASSIGNEE' });
      await this.line.reply(replyToken, fx.askAssignee(members));
      return;
    }

    if (action === 'assignee' && state.step === 'AWAIT_ASSIGNEE') {
      await this.finalizeTask(
        groupId,
        userId,
        { ...state.draft, assignmentMode: 'EXCLUSIVE', assignedToUserId: value },
        replyToken,
      );
      return;
    }
  }

  private async finalizeTask(groupId: string, userId: string, draft: any, replyToken: string) {
    try {
      const task = await this.tasks.createTask(groupId, userId, draft);
      this.conversation.clear(groupId, userId);
      await this.line.reply(
        replyToken,
        fx.taskCreatedSummary({
          title: task.title,
          priority: task.priority,
          deadline: task.deadline,
          assignmentMode: task.assignmentMode,
          assignedToName: (task as any).assignedTo?.displayName,
        }),
      );
    } catch (err: any) {
      await this.line.reply(replyToken, fx.textMessage(`⚠️ สร้างงานไม่สำเร็จ: ${err?.message ?? 'unknown error'}`));
    }
  }
}
