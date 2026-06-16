import { Router, Request, Response, NextFunction } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { bookSchema } from '../schemas/book';
import { sessionStore } from '../stores/sessionStore';
import { transactionStore } from '../stores/transactionStore';
import { createSubscription } from '../services/maxioService';
import {
  ensureTxnChannel,
  postProgress,
  postCompletion,
  postFailure,
  buildSubscriptionActiveBlocks,
} from '../services/slackService';
import { config } from '../config';
import { MutatingResponse } from '../types';

const router = Router();

router.post('/book', async (req: Request, res: Response, next: NextFunction) => {
  // ── 1. Zod validation ────────────────────────────────────────────────────
  const parsed = bookSchema.safeParse(req.body);
  if (!parsed.success) {
    const response: MutatingResponse = {
      status: 'invalid',
      error: 'Validation failed',
      details: parsed.error.flatten().fieldErrors,
    };
    res.status(400).json(response);
    return;
  }

  const { sessionId, firstName, lastName, email, consultantId, productHandle, collectionMethod, couponCode } = parsed.data;

  // ── 2. Session upsert ────────────────────────────────────────────────────
  sessionStore.put(sessionId, { lastSubmission: parsed.data as Record<string, unknown> });

  // ── 3. Resolve consultant ────────────────────────────────────────────────
  const consultant = config.consultants.find((c) => c.id === consultantId);
  if (!consultant) {
    const response: MutatingResponse = {
      status: 'invalid',
      error: `Unknown consultantId: ${consultantId}`,
    };
    res.status(400).json(response);
    return;
  }

  // ── 4. Create transaction record ─────────────────────────────────────────
  const txnId = uuidv4();
  const now = new Date();
  const txn = transactionStore.put({
    txnId,
    consultantId,
    clientEmail: email,
    type: 'subscription',
    state: 'started',
    createdAt: now,
    updatedAt: now,
  });

  // ── 5. Ensure Slack transaction channel ──────────────────────────────────
  let channelId: string | undefined;
  let channelName: string | undefined;

  try {
    const channelResult = await ensureTxnChannel(txn, consultant.email);
    channelId = channelResult.channelId;
    channelName = channelResult.channelName;
    transactionStore.update(txnId, { channelId, channelName });
  } catch (err) {
    // Slack channel failure is non-fatal — log and continue
    console.error('[book] Slack channel setup failed:', (err as Error).message);
  }

  // ── 6. Post in-progress update ───────────────────────────────────────────
  if (channelId) {
    await postProgress(channelId, 'Creating your subscription…');
  }

  // ── 7. Call Maxio ────────────────────────────────────────────────────────
  try {
    const subResult = await createSubscription({
      firstName,
      lastName,
      email,
      productHandle,
      collectionMethod,
      couponCode,
    });

    // ── 8a. Success: update transaction + post completion ──────────────────
    transactionStore.update(txnId, {
      state: 'completed',
      maxioSubscriptionId: subResult.subscriptionId,
    });

    if (channelId) {
      await postCompletion(
        channelId,
        buildSubscriptionActiveBlocks({
          customerName: subResult.customerName,
          plan: subResult.plan,
          mrr: subResult.mrr,
          state: subResult.state,
          nextBillDate: subResult.nextBillDate,
          maxioUrl: subResult.maxioUrl,
        }),
        `Subscription active — ${subResult.plan}, ${subResult.mrr}/mo`
      );
    }

    sessionStore.put(sessionId, { lastResult: subResult as unknown as Record<string, unknown> });

    const response: MutatingResponse = {
      status: 'ok',
      txnId,
      channelId,
      channelName,
      subscriptionId: subResult.subscriptionId,
      customerName: subResult.customerName,
      plan: subResult.plan,
      mrr: subResult.mrr,
      state: subResult.state,
      nextBillDate: subResult.nextBillDate,
      maxioUrl: subResult.maxioUrl,
    };
    res.status(200).json(response);
  } catch (err) {
    // ── 8b. Maxio failure: update transaction + post failure ───────────────
    const errorMessage = (err as Error).message;
    console.error('[book] Maxio createSubscription failed:', errorMessage);

    transactionStore.update(txnId, { state: 'failed' });

    if (channelId) {
      await postFailure(channelId, 'Book & Subscribe', errorMessage);
    }

    const response: MutatingResponse = {
      status: 'maxio_failed',
      txnId,
      channelId,
      channelName,
      error: errorMessage,
    };
    res.status(200).json(response);
  }
});

export default router;
