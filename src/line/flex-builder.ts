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

export interface TaskCardData {
  id: string;
  title: string;
  description?: string | null;
  priority: string;
  status: string;
  deadline?: Date | null;
  assignmentMode: string;
  assignedToName?: string | null;
  creatorName: string;
}

/** สร้าง bubble เดียว (ใช้ร่วมกันทั้งการ์ดเดี่ยวและ carousel) พร้อมปุ่ม action ตามสถานะ */
function taskBubble(task: TaskCardData): any {
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
  if (task.status === 'DONE' || task.status === 'CANCELLED') {
    // ลบถาวรได้เฉพาะงานที่จบแล้ว (เสร็จ/ยกเลิก) — เซิร์ฟเวอร์เช็คสิทธิ์ผู้สร้างอีกชั้นตอนกดจริง
    buttons.push({
      type: 'button',
      style: 'secondary',
      color: '#FF5A5F',
      action: { type: 'postback', label: '🗑️ ลบงานนี้', data: `delete:${task.id}`, displayText: `ลบงาน: ${task.title}` },
    });
  }

  return {
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
  };
}

/** Flex message การ์ดงานเดี่ยว พร้อมปุ่ม action ตามสถานะ */
export function taskCard(task: TaskCardData): FlexMessage {
  return {
    type: 'flex',
    altText: `งาน: ${task.title}`,
    contents: taskBubble(task),
  };
}

/** Flex carousel แสดงงานหลายชิ้นพร้อมปุ่มกดได้ในตัว (แทนที่ list แบบข้อความล้วน) */
export function taskListMessage(
  tasks: TaskCardData[],
  opts?: { emptyText?: string; altText?: string },
): Message {
  if (tasks.length === 0) {
    return textMessage(opts?.emptyText ?? `ยังไม่มีงานในกลุ่มนี้ครับ พิมพ์ "สร้างงาน" เพื่อเริ่มเลย`);
  }
  const shown = tasks.slice(0, 10); // LINE carousel จำกัดสูงสุด 12 bubble ต่อข้อความ
  return {
    type: 'flex',
    altText: opts?.altText ?? `📋 รายการงาน (${tasks.length})`,
    contents: {
      type: 'carousel',
      contents: shown.map((t) => taskBubble(t)),
    },
  };
}

/** สรุปแพลน + ลิมิตงานค้าง ใช้กับคำสั่ง "แพลนของฉัน" */
export function planInfoMessage(plan: string, limit: number, current: number): Message {
  const planText = { FREE: '🆓 FREE', PRO: '⭐ PRO' }[plan] ?? plan;
  const lines = [
    `แพลนของคุณ: ${planText}`,
    `งานค้างตอนนี้: ${current}/${limit}`,
    plan === 'FREE'
      ? 'อยากได้ลิมิตเพิ่ม (สูงสุด 15 งาน) ต้องอัปเกรดเป็น PRO — ตอนนี้ยังไม่เปิดรับชำระเงินอัตโนมัติ ติดต่อแอดมินเพื่ออัปเกรดได้ครับ'
      : 'ขอบคุณที่อัปเกรดเป็น PRO ครับ 🙏',
  ];
  return textMessage(lines.join('\n'));
}

/** การ์ดเปิดฟอร์ม LIFF สำหรับสร้างงาน — ใช้แทนขั้นตอนพิมพ์ทีละอย่างแบบเดิม */
export function openCreateTaskFormMessage(liffId: string): Message {
  const url = `https://liff.line.me/${liffId}`;
  return {
    type: 'flex',
    altText: '📝 เปิดฟอร์มสร้างงาน',
    contents: {
      type: 'bubble',
      size: 'kilo',
      body: {
        type: 'box',
        layout: 'vertical',
        spacing: 'md',
        contents: [
          { type: 'text', text: '📝 สร้างงานใหม่', weight: 'bold', size: 'lg' },
          {
            type: 'text',
            text: 'กดปุ่มด้านล่างเพื่อกรอกฟอร์มสร้างงานได้เลยครับ ใช้งานง่ายกว่าเดิมเยอะ',
            size: 'sm',
            color: '#666666',
            wrap: true,
            margin: 'md',
          },
        ],
      },
      footer: {
        type: 'box',
        layout: 'vertical',
        contents: [
          {
            type: 'button',
            style: 'primary',
            color: '#5B5FEE',
            height: 'md',
            action: { type: 'uri', label: 'เปิดฟอร์มสร้างงาน', uri: url },
          },
        ],
      },
    },
  };
}

export function helpMessage(): Message {
  return textMessage(
    `${BOT_NAME} — คำสั่งที่ใช้ได้:\n` +
      '• "สร้างงาน" — เริ่มสร้างงานใหม่\n' +
      '• "งาน" หรือ "list" — ดูรายการงานที่ยังไม่เสร็จในกลุ่ม\n' +
      '• "งานของฉัน" — ดูงานที่ตัวเองรับผิดชอบ\n' +
      '• "งานของ<ชื่อ>" — ดูงานของคนอื่นในกลุ่ม เช่น "งานของแนน"\n' +
      '• "ประวัติงาน" — ดูงานที่เสร็จ/ยกเลิกไปแล้ว (ย้อนหลังได้ถึง 1 ปี)\n' +
      '• "แพลนของฉัน" — ดูระดับผู้ใช้และลิมิตงานค้างสูงสุด\n' +
      '• "ตั้งแจ้งเตือน" — ตั้งค่าการแจ้งเตือนเดดไลน์ของตัวเอง\n' +
      '• "ยกเลิก" — ยกเลิกขั้นตอนที่กำลังทำอยู่\n' +
      '• กดปุ่มใต้การ์ดงานเพื่อ รับ/เสร็จ/ถอนงาน/ลบงาน',
  );
}

export function askReminderMode(): Message {
  return textMessage(
    'ตั้งค่าการแจ้งเตือนเดดไลน์ของคุณ — อยากให้เตือนแบบไหน?',
    qr([
      { label: '🔔 มาตรฐาน', data: 'remindmode:DEFAULT_SCHEDULE' },
      { label: '⏱️ แจ้งตอนหมดเวลาอย่างเดียว', data: 'remindmode:DEADLINE_ONLY' },
      { label: '🛠️ กำหนดเอง', data: 'remindmode:CUSTOM' },
      { label: '🔕 ปิดแจ้งเตือน', data: 'remindmode:OFF' },
    ]),
  );
}

export function askCustomOffsets(): Message {
  return textMessage(
    'พิมพ์ระยะเวลาที่อยากให้เตือนก่อนถึงเดดไลน์ คั่นด้วยช่องว่าง (mo=เดือน, d=วัน, h=ชม.)\n' +
      'เช่น: 1mo 15d 7d 3d 1d 12h 6h 1h\n' +
      'พิมพ์ "ยกเลิก" เพื่อไม่ตั้งค่านี้',
  );
}

export function reminderSetConfirmation(mode: string, offsetsMin: number[]): Message {
  const modeText = modeLabelLocal(mode);
  if (mode === 'OFF') {
    return textMessage(`🔕 ปิดแจ้งเตือนเดดไลน์เรียบร้อยแล้วครับ (ยังได้รับแจ้งตอนได้รับมอบหมายงานตามปกติ)`);
  }
  const list = offsetsMin.length ? offsetsMin.map((m) => `• ${offsetLabelLocal(m)}`).join('\n') : '';
  return textMessage(`✅ ตั้งค่าแจ้งเตือนเป็น: ${modeText}${list ? `\n${list}` : ''}`);
}

function modeLabelLocal(mode: string): string {
  return (
    {
      DEFAULT_SCHEDULE: 'มาตรฐาน',
      DEADLINE_ONLY: 'แจ้งตอนหมดเวลาอย่างเดียว',
      CUSTOM: 'กำหนดเอง',
      OFF: 'ปิดแจ้งเตือน',
    }[mode] ?? mode
  );
}

function offsetLabelLocal(min: number): string {
  if (min <= 0) return 'ถึงเวลาเดดไลน์';
  const days = Math.floor(min / 1440);
  const hours = Math.floor((min % 1440) / 60);
  const mins = min % 60;
  const parts: string[] = [];
  if (days > 0) parts.push(`${days} วัน`);
  if (hours > 0) parts.push(`${hours} ชม.`);
  if (mins > 0 && days === 0) parts.push(`${mins} นาที`);
  return (parts.join(' ') || `${min} นาที`) + 'ก่อนเดดไลน์';
}
