import { Transaction } from '../types';

const byTxnId = new Map<string, Transaction>();
const channelReuse = new Map<string, string>(); // `${consultantId}:${clientEmail}` -> channelId

function pairKey(consultantId: string, clientEmail: string): string {
  return `${consultantId}:${clientEmail.toLowerCase()}`;
}

export const transactionStore = {
  get(txnId: string): Transaction | undefined {
    return byTxnId.get(txnId);
  },

  put(txn: Transaction): Transaction {
    byTxnId.set(txn.txnId, txn);
    if (txn.channelId) {
      channelReuse.set(pairKey(txn.consultantId, txn.clientEmail), txn.channelId);
    }
    return txn;
  },

  update(txnId: string, patch: Partial<Transaction>): Transaction | undefined {
    const existing = byTxnId.get(txnId);
    if (!existing) return undefined;
    const updated: Transaction = { ...existing, ...patch, updatedAt: new Date() };
    byTxnId.set(txnId, updated);
    if (updated.channelId) {
      channelReuse.set(pairKey(updated.consultantId, updated.clientEmail), updated.channelId);
    }
    return updated;
  },

  getChannelForPair(consultantId: string, clientEmail: string): string | undefined {
    return channelReuse.get(pairKey(consultantId, clientEmail));
  },

  findByRef(txnRef: string): Transaction | undefined {
    return byTxnId.get(txnRef);
  },

  size(): number {
    return byTxnId.size;
  },

  sweep(ttlMinutes: number): number {
    const cutoff = new Date(Date.now() - ttlMinutes * 60 * 1000);
    let removed = 0;
    for (const [id, txn] of byTxnId.entries()) {
      if (txn.updatedAt < cutoff && (txn.state === 'completed' || txn.state === 'failed')) {
        byTxnId.delete(id);
        removed++;
      }
    }
    return removed;
  },
};
