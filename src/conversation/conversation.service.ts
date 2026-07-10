import { Injectable } from '@nestjs/common';

export type ConversationStep =
  | 'AWAIT_TITLE'
  | 'AWAIT_DESCRIPTION'
  | 'AWAIT_PRIORITY'
  | 'AWAIT_DEADLINE'
  | 'AWAIT_ASSIGN_MODE'
  | 'AWAIT_ASSIGNEE';

export interface CreateTaskDraft {
  title?: string;
  description?: string | null;
  priority?: 'HIGH' | 'MEDIUM' | 'LOW';
  deadline?: Date | null;
  assignmentMode?: 'EXCLUSIVE' | 'OPEN_CLAIM';
  assignedToUserId?: string;
}

export interface ConversationState {
  step: ConversationStep;
  draft: CreateTaskDraft;
  updatedAt: number;
}

const STATE_TTL_MS = 15 * 60 * 1000; // เลิกรอ input หลัง 15 นาที เผื่อคนพิมพ์ทิ้งไว้

/**
 * เก็บ state การสนทนาแบบ in-memory ต่อ (groupId, userId)
 * เหมาะกับ instance เดียว (MVP) — ถ้า scale หลาย instance ค่อยย้ายไปเก็บใน DB/Redis
 */
@Injectable()
export class ConversationService {
  private readonly states = new Map<string, ConversationState>();

  private key(groupId: string, userId: string) {
    return `${groupId}:${userId}`;
  }

  start(groupId: string, userId: string) {
    const state: ConversationState = { step: 'AWAIT_TITLE', draft: {}, updatedAt: Date.now() };
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

  update(groupId: string, userId: string, patch: Partial<ConversationState>) {
    const key = this.key(groupId, userId);
    const current = this.states.get(key);
    if (!current) return undefined;
    const next = { ...current, ...patch, updatedAt: Date.now() };
    this.states.set(key, next);
    return next;
  }

  clear(groupId: string, userId: string) {
    this.states.delete(this.key(groupId, userId));
  }
}
