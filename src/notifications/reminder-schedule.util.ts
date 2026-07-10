import { ReminderMode } from '@prisma/client';

/**
 * ตารางเตือนมาตรฐาน (นาทีก่อนเดดไลน์ เรียงจากไกลสุด -> ใกล้สุด)
 * 1 เดือน, 15/12/9/7/5/3/1 วัน, 12/6/3/1 ชั่วโมง
 */
export const DEFAULT_OFFSETS_MIN: number[] = [
  43200, // 1 เดือน (30 วัน)
  21600, // 15 วัน
  17280, // 12 วัน
  12960, // 9 วัน
  10080, // 7 วัน
  7200, // 5 วัน
  4320, // 3 วัน
  1440, // 1 วัน
  720, // 12 ชม.
  360, // 6 ชม.
  180, // 3 ชม.
  60, // 1 ชม.
];

export const MAX_CUSTOM_OFFSETS = 15;
export const MIN_OFFSET_MIN = 5; // กันตั้งถี่เกินไปจนสแปม (ขั้นต่ำ 5 นาทีก่อนเดดไลน์)

/** แปลงนาทีเป็นข้อความอ่านง่าย เช่น 1440 -> "1 วัน", 90 -> "1 ชม. 30 นาที" */
export function formatOffset(min: number): string {
  if (min <= 0) return 'ถึงเวลาเดดไลน์';
  const days = Math.floor(min / 1440);
  const hours = Math.floor((min % 1440) / 60);
  const mins = min % 60;
  const parts: string[] = [];
  if (days > 0) parts.push(`${days} วัน`);
  if (hours > 0) parts.push(`${hours} ชม.`);
  if (mins > 0 && days === 0) parts.push(`${mins} นาที`);
  return parts.length ? parts.join(' ') + ' ก่อน' : `${min} นาทีก่อน`;
}

/**
 * แปลงข้อความที่ผู้ใช้พิมพ์ เช่น "1mo 15d 7d 3d 1d 12h 6h 1h" หรือ "15d,7d,1d"
 * เป็น array นาที (เรียงมาก->น้อย, ตัดค่าซ้ำ/ค่าต่ำกว่าขั้นต่ำ/เกินจำนวนสูงสุดออก)
 * คืนค่า null ถ้า parse ไม่ได้เลยสักตัว
 */
export function parseCustomOffsets(input: string): number[] | null {
  const tokens = input
    .trim()
    .split(/[\s,]+/)
    .filter(Boolean);
  if (tokens.length === 0) return null;

  const unitToMin: Record<string, number> = {
    mo: 43200,
    d: 1440,
    h: 60,
    m: 1,
  };

  const results: number[] = [];
  for (const token of tokens) {
    const match = token.match(/^(\d+)(mo|d|h|m)$/i);
    if (!match) return null;
    const amount = parseInt(match[1], 10);
    const unit = match[2].toLowerCase();
    const min = amount * unitToMin[unit];
    if (min >= MIN_OFFSET_MIN) results.push(min);
  }

  if (results.length === 0) return null;

  const deduped = Array.from(new Set(results)).sort((a, b) => b - a);
  return deduped.slice(0, MAX_CUSTOM_OFFSETS);
}

/** คืนรายการ "นาทีก่อนเดดไลน์" ที่ควรเตือน ตาม preference ที่ resolve มาแล้ว */
export function resolveOffsets(mode: ReminderMode, customOffsetsMin: number[]): number[] {
  switch (mode) {
    case 'DEFAULT_SCHEDULE':
      return DEFAULT_OFFSETS_MIN;
    case 'DEADLINE_ONLY':
      return [0];
    case 'CUSTOM':
      return customOffsetsMin.length ? customOffsetsMin : DEFAULT_OFFSETS_MIN;
    case 'OFF':
      return [];
    default:
      return DEFAULT_OFFSETS_MIN;
  }
}

export function modeLabel(mode: ReminderMode): string {
  return (
    {
      DEFAULT_SCHEDULE: 'มาตรฐาน (1 เดือน, 15/12/9/7/5/3/1 วัน, 12/6/3/1 ชม. ก่อนเดดไลน์)',
      DEADLINE_ONLY: 'แจ้งเฉพาะตอนถึงเดดไลน์เท่านั้น',
      CUSTOM: 'กำหนดเอง',
      OFF: 'ปิดแจ้งเตือนเดดไลน์ทั้งหมด',
    }[mode] ?? mode
  );
}
