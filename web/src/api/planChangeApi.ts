export type PlanHandle = 'basic' | 'pro';
export type Timing = 'prorate' | 'at-renewal';

export interface PlanChangeRequest {
  sessionId: string;
  txnRef: string;
  targetHandle: PlanHandle;
  timing: Timing;
}

export interface PlanChangePreviewSuccess {
  status: 'ok';
  txnId: string;
  channelId?: string;
  channelName?: string;
  currentPlan: string;
  currentPlanHandle: string;
  targetPlan: string;
  timing: Timing;
  proratedDisplay: string;
  paymentDueInCents: number;
  creditAppliedInCents: number;
  effectiveDate: string;
}

export interface PlanChangeApplySuccess {
  status: 'ok';
  txnId: string;
  channelId?: string;
  channelName?: string;
  subscriptionId: number;
  oldPlan: string;
  newPlan: string;
  timing: Timing;
  effectiveDate: string;
  proration: string;
  mrr?: string;
  maxioUrl: string;
}

export interface PlanChangeFailed {
  status: 'maxio_failed';
  txnId?: string;
  channelId?: string;
  channelName?: string;
  error: string;
}

export interface PlanChangeSessionExpired {
  status: 'session_expired';
  error: string;
}

export interface PlanChangeValidationError {
  status: 'invalid';
  error: string;
  details?: Record<string, string[]>;
}

export type PlanChangePreviewResponse =
  | PlanChangePreviewSuccess
  | PlanChangeFailed
  | PlanChangeSessionExpired
  | PlanChangeValidationError;

export type PlanChangeApplyResponse =
  | PlanChangeApplySuccess
  | PlanChangeFailed
  | PlanChangeSessionExpired
  | PlanChangeValidationError;

export async function postPlanChangePreview(
  body: PlanChangeRequest
): Promise<PlanChangePreviewResponse> {
  const res = await fetch('/api/plan-change/preview', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return (await res.json()) as PlanChangePreviewResponse;
}

export async function postPlanChangeApply(
  body: PlanChangeRequest
): Promise<PlanChangeApplyResponse> {
  const res = await fetch('/api/plan-change', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return (await res.json()) as PlanChangeApplyResponse;
}
