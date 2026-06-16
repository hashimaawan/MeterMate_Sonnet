import { Router, Request, Response } from 'express';
import { adminGuard } from '../auth';
import { invoiceSchema } from '../schemas/invoices';
import { sessionStore } from '../stores/sessionStore';
import { transactionStore } from '../stores/transactionStore';
import { issueAndSendInvoice } from '../services/maxioService';
import {
  ensureTxnChannel,
  postProgress,
  postCompletion,
  postFailure,
  buildInvoiceIssuedBlocks,
} from '../services/slackService';
import { config } from '../config';
import { MutatingResponse } from '../types';

const router = Router();

router.post('/invoices', adminGuard, async (req: Request, res: Response) => {
  // ── 1. Validate ───────────────────────────────────────────────────────────
  const parsed = invoiceSchema.safeParse(req.body);
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
      console.error('[invoices] Slack channel setup failed:', (err as Error).message);
    }
  }

  // ── 4. Post in-progress ───────────────────────────────────────────────────
  if (channelId) {
    await postProgress(channelId, 'Issuing and sending invoice…');
  }

  // ── 5. Call Maxio ─────────────────────────────────────────────────────────
  try {
    const invoiceResult = await issueAndSendInvoice({
      subscriptionId: txn.maxioSubscriptionId,
    });

    // ── 6a. Success: post to Slack ────────────────────────────────────────────
    if (channelId) {
      await postCompletion(
        channelId,
        buildInvoiceIssuedBlocks({
          amountDue: `$${invoiceResult.amountDue}`,
          dueDate: invoiceResult.dueDate,
          payUrl: invoiceResult.publicUrl,
        }),
        `Invoice ${invoiceResult.invoiceNumber} — $${invoiceResult.amountDue} due ${invoiceResult.dueDate}`
      );
    }

    sessionStore.put(sessionId, {
      lastResult: invoiceResult as unknown as Record<string, unknown>,
    });

    res.status(200).json({
      status: 'ok',
      txnId: txn.txnId,
      channelId,
      channelName,
      invoiceUid: invoiceResult.invoiceUid,
      invoiceNumber: invoiceResult.invoiceNumber,
      invoiceStatus: invoiceResult.status,
      amountDue: invoiceResult.amountDue,
      dueDate: invoiceResult.dueDate,
      publicUrl: invoiceResult.publicUrl,
      wasIssued: invoiceResult.wasIssued,
      maxioUrl: invoiceResult.maxioUrl,
    } satisfies MutatingResponse);
  } catch (err) {
    // ── 6b. Failure ───────────────────────────────────────────────────────────
    const errorMessage = (err as Error).message;
    console.error('[invoices] Maxio issueAndSendInvoice failed:', errorMessage);

    if (channelId) await postFailure(channelId, 'Invoice Issue & Send', errorMessage);

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
