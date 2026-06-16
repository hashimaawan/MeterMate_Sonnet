import { Router, Request, Response } from 'express';
import { lifecycleSchema } from '../schemas/lifecycle';
import { sessionStore } from '../stores/sessionStore';
import { transactionStore } from '../stores/transactionStore';
import { performLifecycle } from '../services/maxioService';
import {
  ensureTxnChannel,
  postProgress,
  postCompletion,
  postFailure,
  buildLifecycleBlocks,
} from '../services/slackService';
import { config } from '../config';
import { MutatingResponse } from '../types';

const router = Router();

const ACTION_LABEL: Record<string, string> = {
  pause: 'Pause',
  resume: 'Resume',
  cancel: 'Cancel',
  reactivate: 'Reactivate',
};

router.post('/lifecycle', async (req: Request, res: Response) => {
  // ── 1. Validate ───────────────────────────────────────────────────────────
  const parsed = lifecycleSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({
      status: 'invalid',
      error: 'Validation failed',
      details: parsed.error.flatten().fieldErrors,
    } satisfies MutatingResponse);
    return;
  }

  const { sessionId, txnRef, action, cancelType, reasonCode } = parsed.data;
  sessionStore.put(sessionId, { lastSubmission: parsed.data as Record<string, unknown> });

  // ── 2. Resolve transaction ────────────────────────────────────────────────
  const txn = transactionStore.get(txnRef);
  if (!txn) {
    res.status(409).json({
      status: 'session_expired',
      error: `Transaction not found: ${txnRef}. Please start a new booking.`,
    } satisfies MutatingResponse);
    return;
  }
  if (!txn.maxioSubscriptionId) {
    res.status(400).json({
      status: 'invalid',
      error: 'Transaction has no active subscription. Complete a booking first.',
      txnId: txn.txnId,
    } satisfies MutatingResponse);
    return;
  }

  // ── 3. Ensure channel ─────────────────────────────────────────────────────
  let channelId = txn.channelId;
  let channelName = txn.channelName;

  if (!channelId) {
    try {
      const consultant = config.consultants.find((c) => c.id === txn.consultantId);
      const channelResult = await ensureTxnChannel(txn, consultant?.email ?? '');
      channelId = channelResult.channelId;
      channelName = channelResult.channelName;
      transactionStore.update(txn.txnId, { channelId, channelName });
    } catch (err) {
      console.error('[lifecycle] Slack channel setup failed:', (err as Error).message);
    }
  }

  // ── 4. Post in-progress ───────────────────────────────────────────────────
  const label = ACTION_LABEL[action] ?? action;
  const detail = action === 'cancel' && cancelType === 'end-of-period'
    ? 'Cancel (end of period)'
    : label;

  if (channelId) {
    await postProgress(channelId, `${detail} in progress…`);
  }

  // ── 5. Call Maxio ─────────────────────────────────────────────────────────
  try {
    const lcResult = await performLifecycle({
      subscriptionId: txn.maxioSubscriptionId,
      action,
      cancelType,
      reasonCode,
    });

    // ── 6a. Success: post completion ─────────────────────────────────────────
    if (channelId) {
      await postCompletion(
        channelId,
        buildLifecycleBlocks({
          action: detail,
          oldState: lcResult.oldState,
          newState: lcResult.newState,
          reason: reasonCode,
          effectiveDate: lcResult.effectiveDate,
        }),
        `${detail}: ${lcResult.oldState} → ${lcResult.newState}`
      );
    }

    sessionStore.put(sessionId, { lastResult: lcResult as unknown as Record<string, unknown> });

    res.status(200).json({
      status: 'ok',
      txnId: txn.txnId,
      channelId,
      channelName,
      subscriptionId: lcResult.subscriptionId,
      action: lcResult.action,
      oldState: lcResult.oldState,
      newState: lcResult.newState,
      effectiveDate: lcResult.effectiveDate,
      maxioUrl: lcResult.maxioUrl,
    } satisfies MutatingResponse);
  } catch (err) {
    // ── 6b. Failure ───────────────────────────────────────────────────────────
    const errorMessage = (err as Error).message;
    console.error('[lifecycle] Maxio performLifecycle failed:', errorMessage);

    if (channelId) await postFailure(channelId, `Lifecycle: ${detail}`, errorMessage);

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
