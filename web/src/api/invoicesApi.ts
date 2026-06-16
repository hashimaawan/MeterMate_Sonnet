export interface InvoiceRequest {
  sessionId: string;
  txnRef: string;
}

export interface InvoiceSuccess {
  status: 'ok';
  txnId: string;
  channelId?: string;
  channelName?: string;
  invoiceUid: string;
  invoiceNumber: string;
  invoiceStatus: string;
  amountDue: string;
  dueDate: string;
  publicUrl: string;
  wasIssued: boolean;
  maxioUrl: string;
}

export interface InvoiceFailed {
  status: 'maxio_failed';
  txnId?: string;
  channelId?: string;
  channelName?: string;
  error: string;
}

export interface InvoiceSessionExpired {
  status: 'session_expired';
  error: string;
}

export interface InvoiceValidationError {
  status: 'invalid';
  error: string;
  details?: Record<string, string[]>;
}

export type InvoiceResponse =
  | InvoiceSuccess
  | InvoiceFailed
  | InvoiceSessionExpired
  | InvoiceValidationError;

export async function postInvoice(
  body: InvoiceRequest,
  adminUser: string,
  adminPassword: string
): Promise<InvoiceResponse> {
  const credentials = btoa(`${adminUser}:${adminPassword}`);
  const res = await fetch('/api/invoices', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Basic ${credentials}`,
    },
    body: JSON.stringify(body),
  });
  if (res.status === 401 || res.status === 403) {
    return (await res.json()) as InvoiceResponse;
  }
  return (await res.json()) as InvoiceResponse;
}
