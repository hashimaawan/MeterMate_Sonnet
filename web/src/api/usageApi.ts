export type ComponentHandle = 'metermate-consulting-minutes' | 'metermate-api-calls';

export interface UsageRequest {
  sessionId: string;
  txnRef: string;
  componentHandle: ComponentHandle;
  quantity: number;
  memo?: string;
}

export interface UsageSuccess {
  status: 'ok';
  txnId: string;
  channelId?: string;
  channelName?: string;
  usageId: number;
  componentHandle: string;
  quantity: number;
  unitBalance: number;
  unitName: string;
  memo?: string;
  recordedAt: string;
}

export interface UsageMaxioFailed {
  status: 'maxio_failed';
  txnId?: string;
  channelId?: string;
  channelName?: string;
  error: string;
}

export interface UsageSessionExpired {
  status: 'session_expired';
  error: string;
}

export interface UsageValidationError {
  status: 'invalid';
  error: string;
  details?: Record<string, string[]>;
}

export type UsageResponse =
  | UsageSuccess
  | UsageMaxioFailed
  | UsageSessionExpired
  | UsageValidationError;

export const COMPONENT_OPTIONS: { handle: ComponentHandle; label: string; rate: string }[] = [
  { handle: 'metermate-consulting-minutes', label: 'Consulting Minutes', rate: '$2.00 / minute' },
  { handle: 'metermate-api-calls', label: 'API Calls', rate: '$0.01 / call' },
];

export async function postUsage(body: UsageRequest): Promise<UsageResponse> {
  const res = await fetch('/api/usage', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return (await res.json()) as UsageResponse;
}
