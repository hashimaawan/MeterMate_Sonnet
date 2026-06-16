export interface DigestRequest {
  sessionId: string;
  txnRef: string;
}

export interface DigestSuccess {
  status: 'ok';
  txnId: string;
  channelId?: string;
  channelName?: string;
  consultantId: string;
  activeCount: number;
  mrr: string;
  newSignups: number;
  churn: number;
  overdueInvoices: number;
  windowDays: number;
}

export interface DigestFailed {
  status: 'maxio_failed';
  txnId?: string;
  channelId?: string;
  channelName?: string;
  error: string;
}

export interface DigestSessionExpired {
  status: 'session_expired';
  error: string;
}

export interface DigestValidationError {
  status: 'invalid';
  error: string;
  details?: Record<string, string[]>;
}

export type DigestResponse =
  | DigestSuccess
  | DigestFailed
  | DigestSessionExpired
  | DigestValidationError;

export async function postDigest(
  body: DigestRequest,
  adminUser: string,
  adminPassword: string
): Promise<DigestResponse> {
  const credentials = btoa(`${adminUser}:${adminPassword}`);
  const res = await fetch('/api/digest', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Basic ${credentials}`,
    },
    body: JSON.stringify(body),
  });
  return (await res.json()) as DigestResponse;
}
