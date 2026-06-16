import { SessionData } from '../types';

const store = new Map<string, SessionData>();

export const sessionStore = {
  get(sessionId: string): SessionData | undefined {
    return store.get(sessionId);
  },

  put(sessionId: string, data: Partial<SessionData>): SessionData {
    const existing = store.get(sessionId);
    const now = new Date();
    const session: SessionData = {
      sessionId,
      ...existing,
      ...data,
      updatedAt: now,
      createdAt: existing?.createdAt ?? now,
    };
    store.set(sessionId, session);
    return session;
  },

  delete(sessionId: string): void {
    store.delete(sessionId);
  },

  sweep(ttlMinutes: number): number {
    const cutoff = new Date(Date.now() - ttlMinutes * 60 * 1000);
    let removed = 0;
    for (const [id, session] of store.entries()) {
      if (session.updatedAt < cutoff) {
        store.delete(id);
        removed++;
      }
    }
    return removed;
  },

  size(): number {
    return store.size;
  },
};
