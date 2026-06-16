import { Router, Request, Response } from 'express';
import { planChangeSchema } from '../schemas/planChange';
import { sessionStore } from '../stores/sessionStore';
import { transactionStore } from '../stores/transactionStore';
import { previewPlanChange, applyPlanChange } from '../services/maxioService';
import {
  ensureTxnChannel,
  postProgress,
  postCompletion,
  postFailure,
  buildPlanChangePreviewBlocks,
  buildPlanChangedBlocks,
} from '../services/slackService';
import { config } from '../config';
import { MutatingResponse } from '../types';

const router = Router();

// ── Shared: resolve txn + channel ────────────────────────────────────────────

async function resolveTxnAndChannel(txnRef: string): Promise<{
  txn: NonNullable<ReturnType<typeof transactionStore.get>>;
  channelId: string | undefined;
  channelName: string | undefined;
} | { error: MutatingResponse; httpStatus: number }> {
  const txn = transactionStore.get(txnRef);
  if (!txn) {
    return {
      error: {
        status: 'session_expired',
        error: `Transaction not found: ${txnRef}. Please start a new booking.`,
      },
      httpStatus: 409,
    };
  }
  if (!txn.maxioSubscriptionId) {
    return {
      error: {
        status: 'invalid',
        error: 'Transaction has no active subscription. Complete a booking first.',
        txnId: txn.txnId,
      },
      httpStatus: 400,
    };
  }

  let channelId = txn.channelId;
  let channelName = txn.channelName;

  if (!channelId) {
    try {
      const consultant = config.consultants.find((c) => c.id === txn.consultantId);
      const result = await ensureTxnChannel(txn, consultant?.email ?? '');
      channelId = result.channelId;
      channelName = result.channelName;
      transactionStore.update(txn.txnId, { channelId, channelName });
    } catch (err) {
      console.error('[planChange] Slack channel setup failed:', (err as Error).message);
    }
  }

  return { txn, channelId, channelName };
}

// ── POST /plan-change/preview ─────────────────────────────────────────────────

router.post('/plan-change/preview', async (req: Request, res: Response) => {
  const parsed = planChangeSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({
      status: 'invalid',
      error: 'Validation failed',
      details: parsed.error.flatten().fieldErrors,
    } satisfies MutatingResponse);
    return;
  }

  const { sessionId, txnRef, targetHandle, timing } = parsed.data;
  sessionStore.put(sessionId, { lastSubmission: parsed.data as Record<string, unknown> });

  const resolved = await resolveTxnAndChannel(txnRef);
  if ('error' in resolved) {
    res.status(resolved.httpStatus).json(resolved.error);
    return;
  }

  const { txn, channelId, channelName } = resolved;

  if (channelId) {
    await postProgress(channelId, `Previewing plan change to ${targetHandle}…`);
  }

  try {
    const preview = await previewPlanChange({
      subscriptionId: txn.maxioSubscriptionId!,
      targetHandle,
      timing,
    });

    if (channelId) {
      await postCompletion(
        channelId,
        buildPlanChangePreviewBlocks({
          oldPlan: preview.currentPlan,
          newPlan: preview.targetPlan,
          proratedAmount: preview.proratedDisplay,
          timing,
        }),
        `Plan change preview: ${preview.currentPlan} → ${preview.targetPlan} (${preview.proratedDisplay})`
      );
    }

    // Store preview in session so UI can reference it at apply time
    sessionStore.put(sessionId, { lastResult: preview as unknown as Record<string, unknown> });

    const response: MutatingResponse = {
      status: 'ok',
      txnId: txn.txnId,
      channelId,
      channelName,
      currentPlan: preview.currentPlan,
      currentPlanHandle: preview.currentPlanHandle,
      targetPlan: preview.targetPlan,
      timing,
      proratedDisplay: preview.proratedDisplay,
      paymentDueInCents: preview.paymentDueInCents,
      creditAppliedInCents: preview.creditAppliedInCents,
      effectiveDate: preview.effectiveDate,
    };
    res.status(200).json(response);
  } catch (err) {
    const errorMessage = (err as Error).message;
    console.error('[planChange/preview] Maxio previewPlanChange failed:', errorMessage);
    if (channelId) await postFailure(channelId, 'Plan Change Preview', errorMessage);
    res.status(200).json({
      status: 'maxio_failed',
      txnId: txn.txnId,
      channelId,
      channelName,
      error: errorMessage,
    } satisfies MutatingResponse);
  }
});

// ── POST /plan-change ─────────────────────────────────────────────────────────

router.post('/plan-change', async (req: Request, res: Response) => {
  const parsed = planChangeSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({
      status: 'invalid',
      error: 'Validation failed',
      details: parsed.error.flatten().fieldErrors,
    } satisfies MutatingResponse);
    return;
  }

  const { sessionId, txnRef, targetHandle, timing } = parsed.data;
  sessionStore.put(sessionId, { lastSubmission: parsed.data as Record<string, unknown> });

  const resolved = await resolveTxnAndChannel(txnRef);
  if ('error' in resolved) {
    res.status(resolved.httpStatus).json(resolved.error);
    return;
  }

  const { txn, channelId, channelName } = resolved;

  if (channelId) {
    await postProgress(
      channelId,
      `Applying plan change to ${targetHandle} (${timing})…`
    );
  }

  try {
    const changeResult = await applyPlanChange({
      subscriptionId: txn.maxioSubscriptionId!,
      targetHandle,
      timing,
    });

    if (channelId) {
      await postCompletion(
        channelId,
        buildPlanChangedBlocks({
          oldPlan: changeResult.oldPlan,
          newPlan: changeResult.newPlan,
          effectiveDate: changeResult.effectiveDate,
          proration: changeResult.proration,
          maxioUrl: changeResult.maxioUrl,
        }),
        `Plan changed: ${changeResult.oldPlan} → ${changeResult.newPlan}`
      );
    }

    sessionStore.put(sessionId, {
      lastResult: changeResult as unknown as Record<string, unknown>,
    });

    const response: MutatingResponse = {
      status: 'ok',
      txnId: txn.txnId,
      channelId,
      channelName,
      subscriptionId: changeResult.subscriptionId,
      oldPlan: changeResult.oldPlan,
      newPlan: changeResult.newPlan,
      timing: changeResult.timing,
      effectiveDate: changeResult.effectiveDate,
      proration: changeResult.proration,
      mrr: changeResult.mrr,
      maxioUrl: changeResult.maxioUrl,
    };
    res.status(200).json(response);
  } catch (err) {
    const errorMessage = (err as Error).message;
    console.error('[planChange] Maxio applyPlanChange failed:', errorMessage);
    if (channelId) await postFailure(channelId, 'Plan Change', errorMessage);
    res.status(200).json({
      status: 'maxio_failed',
      txnId: txn.txnId,
      channelId,
      channelName,
      error: errorMessage,
    } satisfies MutatingResponse);
  }
});

export default router;
