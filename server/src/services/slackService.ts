import { WebClient, ErrorCode } from '@slack/web-api';
import { config } from '../config';
import { transactionStore } from '../stores/transactionStore';
import { Transaction } from '../types';

// ── Singleton Slack client ────────────────────────────────────────────────────

const slackClient = new WebClient(config.slack.botToken);

// ── Types ─────────────────────────────────────────────────────────────────────

export interface TxnChannelResult {
  channelId: string;
  channelName: string;
  clientInvited: boolean;
  consultantInvited: boolean;
}

export interface BlockKitBlock {
  type: string;
  [key: string]: unknown;
}

// ── Name helpers ──────────────────────────────────────────────────────────────

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9-_]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 20);
}

export function buildChannelName(consultantId: string, clientEmail: string): string {
  const clientSlug = slugify(clientEmail.split('@')[0]);
  const consultantSlug = slugify(consultantId);
  const raw = `txn-${consultantSlug}-${clientSlug}-001`;
  return raw.slice(0, 80);
}

// ── User resolution ───────────────────────────────────────────────────────────

async function resolveUserId(email: string): Promise<string | null> {
  if (!email) return null;
  try {
    const res = await slackClient.users.lookupByEmail({ email });
    return res.user?.id ?? null;
  } catch (err: unknown) {
    const slackErr = err as { code?: string; data?: { error?: string } };
    if (
      slackErr.code === ErrorCode.PlatformError &&
      (slackErr.data?.error === 'users_not_found' ||
        slackErr.data?.error === 'user_not_found')
    ) {
      return null;
    }
    throw err;
  }
}

// ── Channel create / reuse ────────────────────────────────────────────────────

async function createOrReuseChannel(name: string): Promise<{ id: string; name: string }> {
  try {
    const res = await slackClient.conversations.create({ name, is_private: true });
    if (!res.channel?.id || !res.channel?.name) {
      throw new Error('conversations.create returned no channel id/name');
    }
    return { id: res.channel.id, name: res.channel.name };
  } catch (err: unknown) {
    const slackErr = err as { code?: string; data?: { error?: string } };
    if (
      slackErr.code === ErrorCode.PlatformError &&
      slackErr.data?.error === 'name_taken'
    ) {
      // Channel already exists — find it by listing and matching name
      const listRes = await slackClient.conversations.list({
        types: 'private_channel',
        limit: 200,
      });
      const existing = listRes.channels?.find((c) => c.name === name);
      if (existing?.id && existing?.name) {
        return { id: existing.id, name: existing.name };
      }
      throw new Error(`Channel name "${name}" is taken but could not be found in the listing`);
    }
    throw err;
  }
}

// ── Invite party (tier 1 → tier 2 fallback) ──────────────────────────────────

interface InviteOutcome {
  invited: boolean;
  reason?: string;
}

async function inviteParty(
  channelId: string,
  email: string,
  label: string
): Promise<InviteOutcome> {
  const userId = await resolveUserId(email);
  if (!userId) {
    console.log(`[slack] ${label} (${email}) not in workspace — tier-2 fallback (email-only)`);
    return { invited: false, reason: 'user_not_in_workspace' };
  }
  try {
    await slackClient.conversations.invite({ channel: channelId, users: userId });
    return { invited: true };
  } catch (err: unknown) {
    const slackErr = err as { code?: string; data?: { error?: string } };
    const errCode = slackErr.data?.error ?? 'unknown';
    if (errCode === 'already_in_channel') {
      return { invited: true };
    }
    console.warn(`[slack] Failed to invite ${label} (${email}): ${errCode}`);
    return { invited: false, reason: errCode };
  }
}

// ── Core: ensureTxnChannel ────────────────────────────────────────────────────

export async function ensureTxnChannel(
  txn: Transaction,
  consultantEmail: string
): Promise<TxnChannelResult> {
  // Reuse existing channel for this consultant↔client pair
  const existingChannelId = transactionStore.getChannelForPair(txn.consultantId, txn.clientEmail);
  if (existingChannelId) {
    const txnUpdated = transactionStore.update(txn.txnId, { channelId: existingChannelId });
    const channelName = txnUpdated?.channelName ?? buildChannelName(txn.consultantId, txn.clientEmail);
    console.log(`[slack] Reusing channel ${existingChannelId} for ${txn.consultantId}↔${txn.clientEmail}`);
    return { channelId: existingChannelId, channelName, clientInvited: true, consultantInvited: true };
  }

  // Create new channel
  const channelName = buildChannelName(txn.consultantId, txn.clientEmail);
  const channel = await createOrReuseChannel(channelName);

  // Invite consultant + client in parallel (two-tier each)
  const [consultantOutcome, clientOutcome] = await Promise.all([
    inviteParty(channel.id, consultantEmail, 'consultant'),
    inviteParty(channel.id, txn.clientEmail, 'client'),
  ]);

  // Set topic
  try {
    await slackClient.conversations.setTopic({
      channel: channel.id,
      topic: `Transaction ${txn.txnId} · ${txn.type} · ${txn.consultantId} ↔ ${txn.clientEmail}`,
    });
  } catch {
    // Non-fatal
  }

  // Persist channel in transaction record
  transactionStore.update(txn.txnId, { channelId: channel.id, channelName: channel.name });

  // Post "transaction started" message
  const startBlocks = buildTransactionStartedBlocks(txn);
  await postMessage(channel.id, startBlocks, `Transaction started: ${txn.type}`);

  // If client couldn't be invited, note it in the channel
  if (!clientOutcome.invited) {
    await postMessage(
      channel.id,
      buildTierFallbackBlocks(txn.clientEmail),
      `Client ${txn.clientEmail} notified by email.`
    );
  }

  return {
    channelId: channel.id,
    channelName: channel.name,
    clientInvited: clientOutcome.invited,
    consultantInvited: consultantOutcome.invited,
  };
}

// ── Message posting ───────────────────────────────────────────────────────────

export async function postMessage(
  channelId: string,
  blocks: BlockKitBlock[],
  fallbackText: string
): Promise<void> {
  try {
    await slackClient.chat.postMessage({
      channel: channelId,
      blocks,
      text: fallbackText,
    });
  } catch (err: unknown) {
    // Slack failures are non-fatal — billing is source of truth
    console.error('[slack] postMessage failed:', (err as Error).message);
  }
}

export async function postProgress(channelId: string, message: string): Promise<void> {
  await postMessage(channelId, buildProgressBlocks(message), message);
}

export async function postCompletion(
  channelId: string,
  blocks: BlockKitBlock[],
  summary: string
): Promise<void> {
  await postMessage(channelId, blocks, summary);
}

export async function postFailure(channelId: string, ucLabel: string, errorMessage: string): Promise<void> {
  await postMessage(channelId, buildFailureBlocks(ucLabel, errorMessage), `${ucLabel} failed: ${errorMessage}`);
}

// ── Health check ──────────────────────────────────────────────────────────────

export async function checkSlackHealth(): Promise<boolean> {
  try {
    const res = await slackClient.auth.test();
    return res.ok === true;
  } catch {
    return false;
  }
}

// ── Block Kit builders (pure functions — no Slack imports needed) ──────────────

function contextBlock(text: string): BlockKitBlock {
  return {
    type: 'context',
    elements: [{ type: 'mrkdwn', text }],
  };
}

function headerBlock(text: string): BlockKitBlock {
  return { type: 'header', text: { type: 'plain_text', text, emoji: true } };
}

function sectionBlock(text: string): BlockKitBlock {
  return { type: 'section', text: { type: 'mrkdwn', text } };
}

function fieldsBlock(fields: string[]): BlockKitBlock {
  return {
    type: 'section',
    fields: fields.map((f) => ({ type: 'mrkdwn', text: f })),
  };
}

function buttonBlock(text: string, url: string): BlockKitBlock {
  return {
    type: 'actions',
    elements: [
      {
        type: 'button',
        text: { type: 'plain_text', text, emoji: true },
        url,
        action_id: 'button_link',
      },
    ],
  };
}

function divider(): BlockKitBlock {
  return { type: 'divider' };
}

// Transaction started (channel opened)
export function buildTransactionStartedBlocks(txn: Transaction): BlockKitBlock[] {
  return [
    headerBlock(':wave: Transaction started'),
    fieldsBlock([
      `*Type:* ${txn.type}`,
      `*Consultant:* ${txn.consultantId}`,
      `*Client:* ${txn.clientEmail}`,
      `*Txn ID:* \`${txn.txnId}\``,
    ]),
    contextBlock(`Started at ${new Date().toISOString()}`),
  ];
}

// Tier-2 fallback note
export function buildTierFallbackBlocks(clientEmail: string): BlockKitBlock[] {
  return [
    sectionBlock(`:information_source: *Client not in workspace*\n${clientEmail} is not a member of this Slack workspace — they will be notified by email instead.`),
  ];
}

// In-progress
export function buildProgressBlocks(message: string): BlockKitBlock[] {
  return [sectionBlock(`:hourglass_flowing_sand: ${message}`)];
}

// UC1: Subscription active
export function buildSubscriptionActiveBlocks(params: {
  customerName: string;
  plan: string;
  mrr: string;
  state: string;
  nextBillDate: string;
  maxioUrl?: string;
}): BlockKitBlock[] {
  const blocks: BlockKitBlock[] = [
    headerBlock(':tada: Subscription active'),
    fieldsBlock([
      `*Customer:* ${params.customerName}`,
      `*Plan:* ${params.plan}`,
      `*MRR:* ${params.mrr}`,
      `*State:* ${params.state}`,
      `*Next bill:* ${params.nextBillDate}`,
    ]),
    divider(),
  ];
  if (params.maxioUrl) {
    blocks.push(buttonBlock('View in Maxio', params.maxioUrl));
  }
  return blocks;
}

// UC2: Usage recorded
export function buildUsageRecordedBlocks(params: {
  component: string;
  quantity: number | string;
  periodTotal: number | string;
  unitName: string;
}): BlockKitBlock[] {
  return [
    headerBlock(':bar_chart: Usage recorded'),
    fieldsBlock([
      `*Component:* ${params.component}`,
      `*Recorded:* ${params.quantity} ${params.unitName}`,
      `*Period total:* ${params.periodTotal} ${params.unitName}`,
    ]),
    contextBlock('Accrues to next invoice.'),
  ];
}

// UC3: Plan change preview
export function buildPlanChangePreviewBlocks(params: {
  oldPlan: string;
  newPlan: string;
  proratedAmount: string;
  timing: string;
}): BlockKitBlock[] {
  return [
    headerBlock(':mag: Plan change preview'),
    fieldsBlock([
      `*From:* ${params.oldPlan}`,
      `*To:* ${params.newPlan}`,
      `*Prorated charge:* ${params.proratedAmount}`,
      `*Timing:* ${params.timing}`,
    ]),
    contextBlock('Preview only — not yet committed.'),
  ];
}

// UC3: Plan changed
export function buildPlanChangedBlocks(params: {
  oldPlan: string;
  newPlan: string;
  effectiveDate: string;
  proration: string;
  maxioUrl?: string;
}): BlockKitBlock[] {
  const blocks: BlockKitBlock[] = [
    headerBlock(':arrows_counterclockwise: Plan changed'),
    fieldsBlock([
      `*From:* ${params.oldPlan}`,
      `*To:* ${params.newPlan}`,
      `*Effective:* ${params.effectiveDate}`,
      `*Proration:* ${params.proration}`,
    ]),
    divider(),
  ];
  if (params.maxioUrl) {
    blocks.push(buttonBlock('View in Maxio', params.maxioUrl));
  }
  return blocks;
}

// UC4: Lifecycle transition
export function buildLifecycleBlocks(params: {
  action: string;
  oldState: string;
  newState: string;
  reason?: string;
  effectiveDate: string;
}): BlockKitBlock[] {
  const fields = [
    `*Action:* ${params.action}`,
    `*Transition:* ${params.oldState} → ${params.newState}`,
    `*Effective:* ${params.effectiveDate}`,
  ];
  if (params.reason) fields.push(`*Reason:* ${params.reason}`);
  return [
    headerBlock(`:vertical_traffic_light: ${params.oldState} → ${params.newState}`),
    fieldsBlock(fields),
  ];
}

// UC5: Invoice issued
export function buildInvoiceIssuedBlocks(params: {
  amountDue: string;
  dueDate: string;
  payUrl: string;
}): BlockKitBlock[] {
  return [
    headerBlock(':receipt: Invoice issued'),
    fieldsBlock([
      `*Amount due:* ${params.amountDue}`,
      `*Due date:* ${params.dueDate}`,
    ]),
    divider(),
    buttonBlock('Pay Invoice', params.payUrl),
  ];
}

// UC6: Billing digest
export function buildDigestBlocks(params: {
  consultantId: string;
  activeCount: number;
  mrr: string;
  newSignups: number;
  churn: number;
  overdueInvoices: number;
}): BlockKitBlock[] {
  return [
    headerBlock(':chart_with_upwards_trend: Billing digest'),
    sectionBlock(`*Consultant:* ${params.consultantId}`),
    fieldsBlock([
      `*Active subs:* ${params.activeCount}`,
      `*MRR:* ${params.mrr}`,
      `*New signups:* ${params.newSignups}`,
      `*Churn:* ${params.churn}`,
      `*Overdue invoices:* ${params.overdueInvoices}`,
    ]),
    contextBlock('Reporting data may lag live state slightly.'),
  ];
}

// Any failure
export function buildFailureBlocks(ucLabel: string, errorMessage: string): BlockKitBlock[] {
  return [
    headerBlock(`:warning: ${ucLabel} failed`),
    sectionBlock(`*Error:* ${errorMessage}`),
  ];
}
