import { FlexMessage, Message, QuickReply, QuickReplyItem, TextMessage } from '@line/bot-sdk';

export const BOT_NAME = 'เจ้านาย';

function qr(items: { label: string; text?: string; data?: string; displayText?: string }[]): QuickReply {
  const qrItems: QuickReplyItem[] = items.map((it) => ({
    type: 'action',
    action: it.data
      ? { type: 'postback', label: it.label, data: it.data, displayText: it.displayText ?? it.label }
      : { type: 'message', label: it.label, text: it.text ?? it.label },
  }));
  return { items: qrItems };
}

export function textMessage(text: string, quickReply?: QuickReply): TextMessage {
  return { type: 'text', text, ...(quickReply ? { quickReply } : {}) };
}

export function askTitle(): Message {
  return textMessage(`📝 ${BOT_NAME}: สร้างงานใหม่\nพิมพ์ "หัวข้องาน" มาได้เลยครับ`);
}

export function askDescription(title: string): Message {
  return textMessage(
    `หัวข้อ: "${title}"\nมีรายละเอียดเพิ่มเติมไหมครับ? (พิมพ์เนื้อหา หรือพิมพ์ "ข้าม" ถ้าไม่มี)`,
  );
}

export function askPriority(): Message {
  return textMessage(
    'เลือกความสำคัญของงาน',
    qr([
      { label: '🔴 สูง', data: 'priority:HIGH' },
      { label: '🟡 กลาง', data: 'priority:MEDIUM' },
      { label: '🟢 ต่ำ', data: 'priority:LOW' },
    ]),
  );
}

export function askDeadline(): Message {
  return textMessage(
    'กำหนดเส้นตายไหมครับ? พิมพ์วันเวลา เช่น "2026-07-15 18:00" หรือกดข้ามได้เลย',
    qr([{ label: 'ไม่มีเส้นตาย', data: 'deadline:skip' }]),
  );
}

export function askAssignmentMode(): Message {
  return textMessage(
    'มอบหมายงานนี้ยังไงดี?',
    qr([
      { label: '👤 มอบให้คนใดคนหนึ่ง', data: 'assignmode:EXCLUSIVE' },
      { label: '🙋 เปิดให้ใครก็ได้กดรับ', data: 'assignmode:OPEN_CLAIM' },
    ]),
  );
}

export function askAssignee(members: { id: string; displayName: string }[]): Message {
  return textMessage(
    'มอบหมายให้ใคร?',
    qr(members.slice(0, 12).map((m) => ({ label: m.displayName.slice(0, 20), data: `assignee:${m.id}` }))),
  );
}

export function taskCreatedSummary(task: {
  title: string;
  priority: string;
  deadline?: Date | null;
  assignmentMode: string;
  assignedToName?: string | null;
}): Message {
  const lines = [
    `✅ สร้างงานสำเร็จ: "${task.title}"`,
    `ความสำคัญ: ${priorityLabel(task.priority)}`,
    task.deadline ? `เส้นตาย: ${formatDate(task.deadline)}` : 'เส้นตาย: ไม่มี',
    task.assignmentMode === 'EXCLUSIVE'
      ? `มอบหมายให้: ${task.assignedToName ?? '-'}`
      : 'โหมด: เปิดให้กดรับงาน (open-claim)',
  ];
  return textMessage(lines.join('\n'));
}

export function priorityLabel(p: string): string {
  return { HIGH: '🔴 สูง', MEDIUM: '🟡 กลาง', LOW: '🟢 ต่ำ' }[p] ?? p;
}

export function statusLabel(s: string): string {
  return (
    { OPEN: '🆕 ยังไม่รับ', IN_PROGRESS: '🔧 กำลังทำ', DONE: '✅ เสร็จแล้ว', CANCELLED: '🚫 ยกเลิก' }[s] ?? s
  );
}

export function formatDate(d: Date): string {
  const dt = new Date(d);
  const dd = dt.toLocaleDateString('th-TH', { day: '2-digit', month: '2-digit', year: 'numeric' });
  const tt = dt.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' });
  return `${dd} ${tt} น.`;
}

/** Flex bubble แสดงรายละเอียดงาน 1 ชิ้น พร้อมปุ่ม action ตามสถานะ */
export function taskCard(task: {
  id: string;
  title: string;
  description?: string | null;
  priority: string;
  status: string;
  deadline?: Date | null;
  assignmentMode: string;
  assignedToName?: string | null;
  creatorName: string;
}): FlexMessage {
  const buttons: any[] = [];
  if (task.status === 'OPEN' && task.assignmentMode === 'OPEN_CLAIM') {
    buttons.push({
      type: 'button',
      style: 'primary',
      color: '#06C755',
      action: { type: 'postback', label: 'รับงานนี้', data: `claim:${task.id}`, displayText: `รับงาน: ${task.title}` },
    });
  }
  if (task.status === 'IN_PROGRESS' || task.status === 'OPEN') {
    buttons.push({
      type: 'button',
      style: 'secondary',
      action: {
        type: 'postback',
        label: 'ทำเสร็จแล้ว',
        data: `complete:${task.id}`,
        displayText: `เสร็จแล้ว: ${task.title}`,
      },
    });
    buttons.push({
      type: 'button',
      style: 'secondary',
      action: {
        type: 'postback',
        label: task.assignmentMode === 'OPEN_CLAIM' ? 'ถอนตัว' : 'ถอนการมอบหมาย',
        data: `unassign:${task.id}`,
        displayText: 'ถอนงาน',
      },
    });
  }

  return {
    type: 'flex',
    altText: `งาน: ${task.title}`,
    contents: {
      type: 'bubble',
      body: {
        type: 'box',
        layout: 'vertical',
        spacing: 'sm',
        contents: [
          { type: 'text', text: task.title, weight: 'bold', size: 'md', wrap: true },
          { type: 'text', text: statusLabel(task.status), size: 'sm', color: '#888888' },
          { type: 'separator', margin: 'md' },
          ...(task.description
            ? [{ type: 'text', text: task.description, size: 'sm', wrap: true, margin: 'md' } as any]
            : []),
          { type: 'text', text: `ความสำคัญ: ${priorityLabel(task.priority)}`, size: 'sm', margin: 'md' },
          {
            type: 'text',
            text: task.deadline ? `เส้นตาย: ${formatDate(task.deadline)}` : 'เส้นตาย: ไม่มี',
            size: 'sm',
          },
          {
            type: 'text',
            text: `ผู้รับผิดชอบ: ${task.assignedToName ?? '(ยังไม่มี)'}`,
            size: 'sm',
          },
          { type: 'text', text: `สร้างโดย: ${task.creatorName}`, size: 'xs', color: '#aaaaaa' },
        ],
      },
      ...(buttons.length
        ? { footer: { type: 'box', layout: 'vertical', spacing: 'sm', contents: buttons } }
        : {}),
    },
  };
}

export function taskListMessage(tasks: any[]): Message {
  if (tasks.length === 0) {
    return textMessage(`ยังไม่มีงานในกลุ่มนี้ครับ พิมพ์ "สร้างงาน" เพื่อเริ่มเลย`);
  }
  const lines = tasks
    .slice(0, 20)
    .map(
      (t, i) =>
        `${i + 1}. [${statusLabel(t.status)}] ${t.title}${t.assignedToName ? ' — ' + t.assignedToName : ''}`,
    );
  return textMessage(`📋 รายการงานในกลุ่ม (${tasks.length}):\n${lines.join('\n')}`);
}

export function helpMessage(): Message {
  return textMessage(
    `${BOT_NAME} — คำสั่งที่ใช้ได้:\n` +
      '• "สร้างงาน" — เริ่มสร้างงานใหม่\n' +
      '• "งาน" หรือ "list" — ดูรายการงานในกลุ่ม\n' +
      '• "ยกเลิก" — ยกเลิกขั้นตอนที่กำลังทำอยู่\n' +
      '• กดปุ่มใต้การ์ดงานเพื่อ รับ/เสร็จ/ถอนงาน',
  );
}
