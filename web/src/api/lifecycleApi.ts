export type LifecycleAction = 'pause' | 'resume' | 'cancel' | 'reactivate';
export type CancelType = 'immediate' | 'end-of-period';

export interface LifecycleRequest {
  sessionId: string;
  txnRef: string;
  action: LifecycleAction;
  cancelType?: CancelType;
  reasonCode?: string;
}

export interface LifecycleSuccess {
  status: 'ok';
  txnId: string;
  channelId?: string;
  channelName?: string;
  subscriptionId: number;
  action: string;
  oldState: string;
  newState: string;
  effectiveDate: string;
  maxioUrl: string;
}

export interface LifecycleFailed {
  status: 'maxio_failed';
  txnId?: string;
  channelId?: string;
  channelName?: string;
  error: string;
}

export interface LifecycleSessionExpired {
  status: 'session_expired';
  error: string;
}

export interface LifecycleValidationError {
  status: 'invalid';
  error: string;
  details?: Record<string, string[]>;
}

export type LifecycleResponse =
  | LifecycleSuccess
  | LifecycleFailed
  | LifecycleSessionExpired
  | LifecycleValidationError;

export async function postLifecycle(body: LifecycleRequest): Promise<LifecycleResponse> {
  const res = await fetch('/api/lifecycle', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return (await res.json()) as LifecycleResponse;
}
