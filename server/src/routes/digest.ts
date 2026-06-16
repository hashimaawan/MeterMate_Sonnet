import { Router, Request, Response } from 'express';
import { adminGuard } from '../auth';
import { digestSchema } from '../schemas/digest';
import { sessionStore } from '../stores/sessionStore';
import { transactionStore } from '../stores/transactionStore';
import { fetchDigest } from '../services/maxioService';
import {
  ensureTxnChannel,
  postProgress,
  postCompletion,
  postFailure,
  buildDigestBlocks,
} from '../services/slackService';
import { config } from '../config';
import { MutatingResponse } from '../types';

const router = Router();

router.post('/digest', adminGuard, async (req: Request, res: Response) => {
  // ── 1. Validate ───────────────────────────────────────────────────────────
  const parsed = digestSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({
      status: 'invalid',
      error: 'Validation failed',
      details: parsed.error.flatten().fieldErrors,
    } satisfies MutatingResponse);
    return;
  }

  const { sessionId, txnRef } = parsed.data;
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
      console.error('[digest] Slack channel setup failed:', (err as Error).message);
    }
  }

  // ── 4. Post in-progress ───────────────────────────────────────────────────
  if (channelId) {
    await postProgress(channelId, 'Fetching billing digest…');
  }

  // ── 5. Call Maxio ─────────────────────────────────────────────────────────
  try {
    const digestResult = await fetchDigest({ consultantId: txn.consultantId });

    // ── 6a. Success: post to channel ──────────────────────────────────────────
    if (channelId) {
      await postCompletion(
        channelId,
        buildDigestBlocks({
          consultantId: digestResult.consultantId,
          activeCount: digestResult.activeCount,
          mrr: digestResult.mrr,
          newSignups: digestResult.newSignups,
          churn: digestResult.churn,
          overdueInvoices: digestResult.overdueInvoices,
        }),
        `Digest: ${digestResult.activeCount} active, MRR ${digestResult.mrr}, ${digestResult.newSignups} new / ${digestResult.churn} churn (${digestResult.windowDays}d)`
      );
    }

    // Also post to dedicated digest channel if configured and different
    const digestChannel = config.slack.digestChannel;
    if (digestChannel && digestChannel !== channelId) {
      try {
        await postCompletion(
          digestChannel,
          buildDigestBlocks({
            consultantId: digestResult.consultantId,
            activeCount: digestResult.activeCount,
            mrr: digestResult.mrr,
            newSignups: digestResult.newSignups,
            churn: digestResult.churn,
            overdueInvoices: digestResult.overdueInvoices,
          }),
          `Digest: ${digestResult.activeCount} active, MRR ${digestResult.mrr}`
        );
      } catch (err) {
        console.error('[digest] Failed to post to digest channel:', (err as Error).message);
      }
    }

    sessionStore.put(sessionId, {
      lastResult: digestResult as unknown as Record<string, unknown>,
    });

    res.status(200).json({
      status: 'ok',
      txnId: txn.txnId,
      channelId,
      channelName,
      consultantId: digestResult.consultantId,
      activeCount: digestResult.activeCount,
      mrr: digestResult.mrr,
      newSignups: digestResult.newSignups,
      churn: digestResult.churn,
      overdueInvoices: digestResult.overdueInvoices,
      windowDays: digestResult.windowDays,
    } satisfies MutatingResponse);
  } catch (err) {
    // ── 6b. Failure ───────────────────────────────────────────────────────────
    const errorMessage = (err as Error).message;
    console.error('[digest] fetchDigest failed:', errorMessage);

    if (channelId) await postFailure(channelId, 'Billing Digest', errorMessage);

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
