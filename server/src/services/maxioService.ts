/**
 * maxioService — one exported function per use case.
 * No Express or Slack imports: fully unit-testable in isolation.
 */

import {
  subscriptionsController,
  subscriptionComponentsController,
  subscriptionProductsController,
  subscriptionStatusController,
  invoicesController,
  insightsController,
  eventsController,
} from '../maxioClient';
import { config } from '../config';
import {
  CollectionMethod,
  SubscriptionState,
} from '@maxio-com/advanced-billing-sdk';

// ── Shared helpers ────────────────────────────────────────────────────────────

function maxioSubscriptionUrl(subscriptionId: number): string {
  return `https://app.chargify.com/subscriptions/${subscriptionId}`;
}

function centsToDisplay(cents: bigint | number | undefined): string {
  if (cents == null) return '$0.00';
  return `$${(Number(cents) / 100).toFixed(2)}`;
}

function formatDate(iso: string | null | undefined): string {
  if (!iso) return 'N/A';
  return new Date(iso).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

// ── UC1 types ─────────────────────────────────────────────────────────────────

export interface SubscriptionResult {
  subscriptionId: number;
  customerName: string;
  plan: string;
  mrr: string;
  state: string;
  nextBillDate: string;
  maxioUrl: string;
}

// ── UC1: createSubscription ───────────────────────────────────────────────────

export async function createSubscription(params: {
  firstName: string;
  lastName: string;
  email: string;
  productHandle: string;
  collectionMethod: 'automatic' | 'remittance';
  couponCode?: string;
}): Promise<SubscriptionResult> {
  const collectionMethodEnum =
    params.collectionMethod === 'automatic'
      ? CollectionMethod.Automatic
      : CollectionMethod.Remittance;

  const { result } = await subscriptionsController.createSubscription({
    subscription: {
      productHandle: params.productHandle,
      customerAttributes: {
        firstName: params.firstName,
        lastName: params.lastName,
        email: params.email,
        // reference = email ensures idempotent customer lookup
        reference: params.email.toLowerCase(),
      },
      paymentCollectionMethod: collectionMethodEnum,
      ...(params.couponCode ? { couponCode: params.couponCode } : {}),
    },
  });

  const sub = result.subscription;
  if (!sub?.id) throw new Error('Maxio returned no subscription id');

  const customerName =
    `${sub.customer?.firstName ?? ''} ${sub.customer?.lastName ?? ''}`.trim() ||
    params.email;

  const planName = sub.product?.name ?? params.productHandle;
  const mrr = centsToDisplay(sub.productPriceInCents);
  const state = (sub.state as string | undefined) ?? 'unknown';
  const nextBillDate = formatDate(sub.nextAssessmentAt);

  return {
    subscriptionId: Number(sub.id),
    customerName,
    plan: planName,
    mrr,
    state,
    nextBillDate,
    maxioUrl: maxioSubscriptionUrl(Number(sub.id)),
  };
}

// ── UC2: recordUsage ──────────────────────────────────────────────────────────

export interface UsageResult {
  usageId: number;
  componentHandle: string;
  quantity: number;
  unitBalance: number;
  memo?: string;
  recordedAt: string;
}

const UNIT_NAMES: Record<string, string> = {
  'metermate-consulting-minutes': 'minute',
  'metermate-api-calls': 'call',
};

export async function recordUsage(params: {
  subscriptionId: number;
  componentHandle: string;
  quantity: number;
  memo?: string;
}): Promise<UsageResult> {
  const { subscriptionId, componentHandle, quantity, memo } = params;

  const componentId = `handle:${componentHandle}`;

  // Record the usage
  const { result } = await subscriptionComponentsController.createUsage(
    subscriptionId,
    componentId,
    {
      usage: {
        quantity,
        ...(memo ? { memo } : {}),
      },
    }
  );

  const usage = result.usage;
  if (!usage?.id) throw new Error('Maxio returned no usage id');

  // unit_balance is listed in the createUsage spec but not reliably returned
  // by the live API. Sum listUsages for the definitive period total instead.
  let periodTotal = quantity;
  try {
    const { result: usageList } = await subscriptionComponentsController.listUsages({
      subscriptionIdOrReference: subscriptionId,
      componentId,
      perPage: 200,
    });
    if (Array.isArray(usageList) && usageList.length > 0) {
      periodTotal = usageList.reduce(
        (sum, item) => sum + Number(item.usage?.quantity ?? 0),
        0
      );
    }
  } catch {
    // listUsages failure is non-fatal — fall back to the just-recorded quantity
  }

  return {
    usageId: Number(usage.id),
    componentHandle: usage.componentHandle ?? componentHandle,
    quantity: Number(usage.quantity ?? quantity),
    unitBalance: periodTotal,
    memo: usage.memo ?? undefined,
    recordedAt: usage.createdAt ?? new Date().toISOString(),
  };
}

export { UNIT_NAMES };

// ── UC2 stub (implemented in UC2 slice) ───────────────────────────────────────
export { subscriptionComponentsController };

// ── UC3 stub (implemented in UC3 slice) ───────────────────────────────────────
export { subscriptionProductsController };

// ── UC4 stub (implemented in UC4 slice) ───────────────────────────────────────
export { subscriptionStatusController };

// ── UC5 stub (implemented in UC5 slice) ───────────────────────────────────────
export { invoicesController };

// ── UC6 stub (implemented in UC6 slice) ───────────────────────────────────────
export { insightsController, eventsController };

// ── Shared utility re-exports ─────────────────────────────────────────────────
export { centsToDisplay, formatDate, maxioSubscriptionUrl };
