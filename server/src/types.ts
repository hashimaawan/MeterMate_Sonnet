export type TransactionState = 'started' | 'in_progress' | 'completed' | 'failed';
export type TransactionType =
  | 'subscription'
  | 'usage'
  | 'plan_change'
  | 'lifecycle'
  | 'invoice'
  | 'digest';

export interface Transaction {
  txnId: string;
  consultantId: string;
  clientEmail: string;
  type: TransactionType;
  state: TransactionState;
  channelId?: string;
  channelName?: string;
  maxioSubscriptionId?: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface SessionData {
  sessionId: string;
  lastSubmission?: Record<string, unknown>;
  lastResult?: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

export interface Consultant {
  id: string;
  name: string;
  email: string;
}

export interface MutatingResponse {
  status: 'ok' | 'maxio_failed' | 'invalid' | 'session_expired';
  txnId?: string;
  channelId?: string;
  channelName?: string;
  [key: string]: unknown;
}

export interface AppError extends Error {
  statusCode: number;
  code: string;
}

export function createAppError(message: string, statusCode: number, code: string): AppError {
  const err = new Error(message) as AppError;
  err.statusCode = statusCode;
  err.code = code;
  return err;
}
