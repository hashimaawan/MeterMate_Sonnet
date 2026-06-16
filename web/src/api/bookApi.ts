export interface Consultant {
  id: string;
  name: string;
  email: string;
}

export interface Product {
  handle: string;
  name: string;
  price: number;
  interval: string;
}

export interface BookRequest {
  sessionId: string;
  firstName: string;
  lastName: string;
  email: string;
  consultantId: string;
  productHandle: 'basic' | 'pro';
  collectionMethod: 'automatic' | 'remittance';
  couponCode?: string;
}

export interface BookSuccess {
  status: 'ok';
  txnId: string;
  channelId?: string;
  channelName?: string;
  subscriptionId: number;
  customerName: string;
  plan: string;
  mrr: string;
  state: string;
  nextBillDate: string;
  maxioUrl: string;
}

export interface BookMaxioFailed {
  status: 'maxio_failed';
  txnId: string;
  channelId?: string;
  channelName?: string;
  error: string;
}

export interface BookValidationError {
  status: 'invalid';
  error: string;
  details?: Record<string, string[]>;
}

export type BookResponse = BookSuccess | BookMaxioFailed | BookValidationError;

export async function fetchConsultants(): Promise<Consultant[]> {
  const res = await fetch('/api/consultants');
  if (!res.ok) throw new Error(`Failed to load consultants: ${res.status}`);
  const data = (await res.json()) as { consultants: Consultant[] };
  return data.consultants;
}

export async function fetchProducts(): Promise<Product[]> {
  const res = await fetch('/api/products');
  if (!res.ok) throw new Error(`Failed to load products: ${res.status}`);
  const data = (await res.json()) as { products: Product[] };
  return data.products;
}

export async function postBook(body: BookRequest): Promise<BookResponse> {
  const res = await fetch('/api/book', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = (await res.json()) as BookResponse;
  return data;
}
