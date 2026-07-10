import { Injectable } from '@nestjs/common';

export type ConversationFlow = 'CREATE_TASK' | 'SET_REMINDER';

export interface CreateTaskDraft {
  title?: string;
  description?: string | null;
  priority?: 'HIGH' | 'MEDIUM' | 'LOW';
  deadline?: Date | null;
  assignmentMode?: 'EXCLUSIVE' | 'OPEN_CLAIM';
  assignedToUserId?: string;
}

export interface ConversationState {
  flow: ConversationFlow;
  step: string;
  data: Record<string, any>;
  updatedAt: number;
}

const STATE_TTL_MS = 15 * 60 * 1000; // เลิกรอ input หลัง 15 นาที เผื่อคนพิมพ์ทิ้งไว้

/**
 * เก็บ state การสนทนาแบบ in-memory ต่อ (groupId, userId)
 * ใช้ร่วมกันได้หลาย flow (สร้างงาน / ตั้งค่าแจ้งเตือน) แยกด้วย field `flow`
 * เหมาะกับ instance เดียว (MVP) — ถ้า scale หลาย instance ค่อยย้ายไปเก็บใน DB/Redis
 */
@Injectable()
export class ConversationService {
  private readonly states = new Map<string, ConversationState>();

  private key(groupId: string, userId: string) {
    return `${groupId}:${userId}`;
  }

  start(groupId: string, userId: string, flow: ConversationFlow, step: string, data: Record<string, any> = {}) {
    const state: ConversationState = { flow, step, data, updatedAt: Date.now() };
    this.states.set(this.key(groupId, userId), state);
    return state;
  }

  get(groupId: string, userId: string): ConversationState | undefined {
    const state = this.states.get(this.key(groupId, userId));
    if (state && Date.now() - state.updatedAt > STATE_TTL_MS) {
      this.clear(groupId, userId);
      return undefined;
    }
    return state;
  }

  update(groupId: string, userId: string, patch: Partial<Pick<ConversationState, 'step' | 'data'>>) {
    const key = this.key(groupId, userId);
    const current = this.states.get(key);
    if (!current) return undefined;
    const next: ConversationState = { ...current, ...patch, updatedAt: Date.now() };
    this.states.set(key, next);
    return next;
  }

  clear(groupId: string, userId: string) {
    this.states.delete(this.key(groupId, userId));
  }
}
