import { Plan } from '@prisma/client';

/** ลิมิตจำนวนงานค้าง (OPEN/IN_PROGRESS) สูงสุดต่อคนตามระดับผู้ใช้
 *  หมายเหตุ: ยังไม่เชื่อมระบบรับเงินจริง — การอัปเกรดเป็น PRO ตอนนี้ต้องปรับผ่านฐานข้อมูลโดยตรง
 *  (UPDATE "User" SET plan = 'PRO' WHERE "lineUserId" = '...') */
export const PLAN_LIMITS: Record<Plan, number> = {
  FREE: 3,
  PRO: 15,
};

export function planLimit(plan: Plan): number {
  return PLAN_LIMITS[plan] ?? PLAN_LIMITS.FREE;
}

export function planLabel(plan: Plan): string {
  return { FREE: '🆓 FREE', PRO: '⭐ PRO' }[plan] ?? plan;
}
