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

// ── UC3 types ─────────────────────────────────────────────────────────────────

export interface PlanChangePreviewResult {
  currentPlan: string;
  currentPlanHandle: string;
  targetPlan: string;
  timing: 'prorate' | 'at-renewal';
  paymentDueInCents: number;
  creditAppliedInCents: number;
  proratedDisplay: string;
  effectiveDate: string;
}

export interface PlanChangeResult {
  subscriptionId: number;
  oldPlan: string;
  newPlan: string;
  timing: 'prorate' | 'at-renewal';
  effectiveDate: string;
  proration: string;
  mrr?: string;
  maxioUrl: string;
}

// ── UC3: previewPlanChange ────────────────────────────────────────────────────

export async function previewPlanChange(params: {
  subscriptionId: number;
  targetHandle: string;
  timing: 'prorate' | 'at-renewal';
}): Promise<PlanChangePreviewResult> {
  const { subscriptionId, targetHandle, timing } = params;

  // Read current subscription for current plan info
  const { result: subResult } = await subscriptionsController.readSubscription(subscriptionId);
  const sub = subResult.subscription;
  const currentPlanHandle = (sub?.product?.handle as string | undefined) ?? 'unknown';
  const currentPlan = (sub?.product?.name as string | undefined) ?? currentPlanHandle;
  const targetPlan = targetHandle === 'basic' ? 'Basic Plan' : 'Pro Plan';

  if (timing === 'prorate') {
    const { result: previewResult } =
      await subscriptionProductsController.previewSubscriptionProductMigration(
        subscriptionId,
        {
          migration: {
            productHandle: targetHandle,
            preservePeriod: true,
            includeCoupons: true,
          },
        }
      );

    const migration = previewResult.migration;
    const paymentDueInCents = Number(migration?.paymentDueInCents ?? 0);
    const creditAppliedInCents = Number(migration?.creditAppliedInCents ?? 0);

    let proratedDisplay: string;
    if (paymentDueInCents > 0) {
      proratedDisplay = `${centsToDisplay(paymentDueInCents)} due now`;
    } else if (creditAppliedInCents > 0) {
      proratedDisplay = `${centsToDisplay(creditAppliedInCents)} credit applied`;
    } else {
      proratedDisplay = '$0.00';
    }

    return {
      currentPlan,
      currentPlanHandle,
      targetPlan,
      timing,
      paymentDueInCents,
      creditAppliedInCents,
      proratedDisplay,
      effectiveDate: formatDate(new Date().toISOString()),
    };
  } else {
    // at-renewal: no immediate charge
    const nextBillDate = formatDate(
      (sub?.nextAssessmentAt as string | undefined) ?? null
    );
    return {
      currentPlan,
      currentPlanHandle,
      targetPlan,
      timing,
      paymentDueInCents: 0,
      creditAppliedInCents: 0,
      proratedDisplay: '$0.00 now — full price at renewal',
      effectiveDate: nextBillDate,
    };
  }
}

// ── UC3: applyPlanChange ──────────────────────────────────────────────────────

export async function applyPlanChange(params: {
  subscriptionId: number;
  targetHandle: string;
  timing: 'prorate' | 'at-renewal';
}): Promise<PlanChangeResult> {
  const { subscriptionId, targetHandle, timing } = params;

  // Read current plan before change
  const { result: subResult } = await subscriptionsController.readSubscription(subscriptionId);
  const oldPlan =
    (subResult.subscription?.product?.name as string | undefined) ?? 'unknown';
  const targetPlan = targetHandle === 'basic' ? 'Basic Plan' : 'Pro Plan';

  if (timing === 'prorate') {
    const { result: migResult } =
      await subscriptionProductsController.migrateSubscriptionProduct(
        subscriptionId,
        {
          migration: {
            productHandle: targetHandle,
            preservePeriod: true,
            includeCoupons: true,
          },
        }
      );

    const updatedSub = migResult.subscription;
    return {
      subscriptionId: Number(updatedSub?.id ?? subscriptionId),
      oldPlan,
      newPlan: (updatedSub?.product?.name as string | undefined) ?? targetPlan,
      timing,
      effectiveDate: formatDate(new Date().toISOString()),
      proration: `Prorated — ${centsToDisplay(updatedSub?.productPriceInCents)} / mo`,
      mrr: centsToDisplay(updatedSub?.productPriceInCents),
      maxioUrl: maxioSubscriptionUrl(subscriptionId),
    };
  } else {
    // at-renewal: schedule delayed product change (no proration)
    const { result: updResult } = await subscriptionsController.updateSubscription(
      subscriptionId,
      {
        subscription: {
          productHandle: targetHandle,
          productChangeDelayed: true,
        },
      }
    );

    const updatedSub = updResult.subscription;
    const effectiveDate = formatDate(
      (updatedSub?.currentPeriodEndsAt as string | undefined) ??
        (updatedSub?.nextAssessmentAt as string | undefined) ??
        null
    );

    return {
      subscriptionId: Number(updatedSub?.id ?? subscriptionId),
      oldPlan,
      newPlan: targetPlan,
      timing,
      effectiveDate,
      proration: 'No immediate charge — takes effect at renewal',
      maxioUrl: maxioSubscriptionUrl(subscriptionId),
    };
  }
}

// ── UC3 stub ──────────────────────────────────────────────────────────────────
export { subscriptionProductsController };

// ── UC4 types ─────────────────────────────────────────────────────────────────

export interface LifecycleResult {
  subscriptionId: number;
  action: string;
  oldState: string;
  newState: string;
  effectiveDate: string;
  maxioUrl: string;
}

// ── UC4: performLifecycle ─────────────────────────────────────────────────────

export async function performLifecycle(params: {
  subscriptionId: number;
  action: 'pause' | 'resume' | 'cancel' | 'reactivate';
  cancelType?: 'immediate' | 'end-of-period';
  reasonCode?: string;
}): Promise<LifecycleResult> {
  const { subscriptionId, action, cancelType, reasonCode } = params;

  // Read current state before the operation
  const { result: beforeResult } = await subscriptionsController.readSubscription(subscriptionId);
  const oldState = (beforeResult.subscription?.state as string | undefined) ?? 'unknown';

  let newState: string;

  switch (action) {
    case 'pause': {
      const { result } = await subscriptionStatusController.pauseSubscription(subscriptionId, {});
      newState = (result.subscription?.state as string | undefined) ?? 'on_hold';
      break;
    }

    case 'resume': {
      const { result } = await subscriptionStatusController.resumeSubscription(subscriptionId);
      newState = (result.subscription?.state as string | undefined) ?? 'active';
      break;
    }

    case 'cancel': {
      if (cancelType === 'end-of-period') {
        await subscriptionStatusController.initiateDelayedCancellation(subscriptionId, {
          subscription: {
            ...(reasonCode ? { cancellationMessage: reasonCode, reasonCode } : {}),
          },
        });
        // Subscription stays active but is scheduled to cancel — read back to confirm
        const { result } = await subscriptionsController.readSubscription(subscriptionId);
        newState =
          (result.subscription?.cancelAtEndOfPeriod as boolean | undefined)
            ? 'active (cancels at period end)'
            : (result.subscription?.state as string | undefined) ?? 'active';
      } else {
        // immediate
        const { result } = await subscriptionStatusController.cancelSubscription(
          subscriptionId,
          {
            subscription: {
              ...(reasonCode ? { cancellationMessage: reasonCode, reasonCode } : {}),
            },
          }
        );
        newState = (result.subscription?.state as string | undefined) ?? 'canceled';
      }
      break;
    }

    case 'reactivate': {
      const { result } = await subscriptionStatusController.reactivateSubscription(
        subscriptionId,
        {}
      );
      newState = (result.subscription?.state as string | undefined) ?? 'active';
      break;
    }
  }

  return {
    subscriptionId,
    action,
    oldState,
    newState,
    effectiveDate: formatDate(new Date().toISOString()),
    maxioUrl: maxioSubscriptionUrl(subscriptionId),
  };
}

// ── UC4 stub ──────────────────────────────────────────────────────────────────
export { subscriptionStatusController };

// ── UC5 stub (implemented in UC5 slice) ───────────────────────────────────────
export { invoicesController };

// ── UC6 stub (implemented in UC6 slice) ───────────────────────────────────────
export { insightsController, eventsController };

// ── Shared utility re-exports ─────────────────────────────────────────────────
export { centsToDisplay, formatDate, maxioSubscriptionUrl };
