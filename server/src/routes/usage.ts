import { Router, Request, Response } from 'express';
import { usageSchema } from '../schemas/usage';
import { sessionStore } from '../stores/sessionStore';
import { transactionStore } from '../stores/transactionStore';
import { recordUsage, UNIT_NAMES } from '../services/maxioService';
import {
  ensureTxnChannel,
  postProgress,
  postCompletion,
  postFailure,
  buildUsageRecordedBlocks,
} from '../services/slackService';
import { MutatingResponse } from '../types';

const router = Router();

router.post('/usage', async (req: Request, res: Response) => {
  // ── 1. Zod validation ─────────────────────────────────────────────────────
  const parsed = usageSchema.safeParse(req.body);
  if (!parsed.success) {
    const response: MutatingResponse = {
      status: 'invalid',
      error: 'Validation failed',
      details: parsed.error.flatten().fieldErrors,
    };
    res.status(400).json(response);
    return;
  }

  const { sessionId, txnRef, componentHandle, quantity, memo } = parsed.data;

  // ── 2. Resolve transaction ────────────────────────────────────────────────
  const txn = transactionStore.get(txnRef);
  if (!txn) {
    const response: MutatingResponse = {
      status: 'session_expired',
      error: `Transaction not found: ${txnRef}. Please start a new booking.`,
    };
    res.status(409).json(response);
    return;
  }

  if (!txn.maxioSubscriptionId) {
    const response: MutatingResponse = {
      status: 'invalid',
      error: 'Transaction has no active subscription. Complete a booking first.',
      txnId: txn.txnId,
    };
    res.status(400).json(response);
    return;
  }

  // ── 3. Session upsert ─────────────────────────────────────────────────────
  sessionStore.put(sessionId, { lastSubmission: parsed.data as Record<string, unknown> });

  // ── 4. Ensure Slack channel (reuses existing for this consultant↔client pair) ──
  let channelId = txn.channelId;
  let channelName = txn.channelName;

  if (!channelId) {
    try {
      // Look up consultant email from config via consultantId
      const { config } = await import('../config');
      const consultant = config.consultants.find((c) => c.id === txn.consultantId);
      const consultantEmail = consultant?.email ?? '';
      const channelResult = await ensureTxnChannel(txn, consultantEmail);
      channelId = channelResult.channelId;
      channelName = channelResult.channelName;
      transactionStore.update(txn.txnId, { channelId, channelName });
    } catch (err) {
      console.error('[usage] Slack channel setup failed:', (err as Error).message);
    }
  }

  // ── 5. Post in-progress update ────────────────────────────────────────────
  if (channelId) {
    await postProgress(channelId, `Recording ${quantity} ${UNIT_NAMES[componentHandle] ?? 'unit'}(s) of ${componentHandle}…`);
  }

  // ── 6. Call Maxio ─────────────────────────────────────────────────────────
  try {
    const usageResult = await recordUsage({
      subscriptionId: txn.maxioSubscriptionId,
      componentHandle,
      quantity,
      memo,
    });

    // ── 7a. Success: post completion ─────────────────────────────────────────
    if (channelId) {
      await postCompletion(
        channelId,
        buildUsageRecordedBlocks({
          component: componentHandle,
          quantity: usageResult.quantity,
          periodTotal: usageResult.unitBalance,
          unitName: UNIT_NAMES[componentHandle] ?? 'unit',
        }),
        `Usage recorded — ${usageResult.quantity} ${UNIT_NAMES[componentHandle] ?? 'unit'}(s) of ${componentHandle}`
      );
    }

    sessionStore.put(sessionId, { lastResult: usageResult as unknown as Record<string, unknown> });

    const response: MutatingResponse = {
      status: 'ok',
      txnId: txn.txnId,
      channelId,
      channelName,
      usageId: usageResult.usageId,
      componentHandle: usageResult.componentHandle,
      quantity: usageResult.quantity,
      unitBalance: usageResult.unitBalance,
      unitName: UNIT_NAMES[componentHandle] ?? 'unit',
      memo: usageResult.memo,
      recordedAt: usageResult.recordedAt,
    };
    res.status(200).json(response);
  } catch (err) {
    // ── 7b. Failure ──────────────────────────────────────────────────────────
    const errorMessage = (err as Error).message;
    console.error('[usage] Maxio recordUsage failed:', errorMessage);

    if (channelId) {
      await postFailure(channelId, 'Record Usage', errorMessage);
    }

    const response: MutatingResponse = {
      status: 'maxio_failed',
      txnId: txn.txnId,
      channelId,
      channelName,
      error: errorMessage,
    };
    res.status(200).json(response);
  }
});

export default router;
