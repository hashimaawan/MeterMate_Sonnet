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
