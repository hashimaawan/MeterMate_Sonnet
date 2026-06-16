/**
 * Unit tests for slackService — Slack client is fully mocked.
 * Covers: channel creation, tier-1 invite, tier-2 fallback, channel reuse,
 * name_taken handling, and all Block Kit builder shapes.
 */

import { Transaction } from '../../src/types';

// ── Mock @slack/web-api ───────────────────────────────────────────────────────

const mockAuthTest = jest.fn();
const mockLookupByEmail = jest.fn();
const mockConversationsCreate = jest.fn();
const mockConversationsList = jest.fn();
const mockConversationsInvite = jest.fn();
const mockConversationsSetTopic = jest.fn();
const mockChatPostMessage = jest.fn();

jest.mock('@slack/web-api', () => ({
  WebClient: jest.fn().mockImplementation(() => ({
    auth: { test: mockAuthTest },
    users: { lookupByEmail: mockLookupByEmail },
    conversations: {
      create: mockConversationsCreate,
      list: mockConversationsList,
      invite: mockConversationsInvite,
      setTopic: mockConversationsSetTopic,
    },
    chat: { postMessage: mockChatPostMessage },
  })),
  ErrorCode: {
    PlatformError: 'slack_webapi_platform_error',
    HTTPError: 'slack_webapi_http_error',
    RateLimitedError: 'slack_webapi_rate_limited_error',
    RequestError: 'slack_webapi_request_error',
    FileUploadInvalidArgumentsError: 'slack_webapi_file_upload_invalid_args_error',
    FileUploadReadFileDataError: 'slack_webapi_file_upload_read_file_data_error',
  },
}));

// ── Mock transactionStore ────────────────────────────────────────────────────

const mockGetChannelForPair = jest.fn();
const mockUpdate = jest.fn();

jest.mock('../../src/stores/transactionStore', () => ({
  transactionStore: {
    getChannelForPair: mockGetChannelForPair,
    update: mockUpdate,
    put: jest.fn(),
    get: jest.fn(),
    findByRef: jest.fn(),
    size: jest.fn(),
    sweep: jest.fn(),
  },
}));

// ── Mock config ───────────────────────────────────────────────────────────────

jest.mock('../../src/config', () => ({
  config: {
    slack: { botToken: 'xoxb-test-token', digestChannel: '' },
    maxio: { apiKey: 'k', siteSubdomain: 'test', environment: 'US', defaultProductFamily: 'f' },
    admin: { user: 'admin', password: 'pw' },
    session: { ttlMinutes: 30 },
    demoMode: true,
    digestCron: '0 9 * * 1',
    port: 4000,
    consultants: [],
  },
}));

// ── Import service AFTER mocks ────────────────────────────────────────────────

import {
  ensureTxnChannel,
  buildChannelName,
  buildTransactionStartedBlocks,
  buildSubscriptionActiveBlocks,
  buildUsageRecordedBlocks,
  buildPlanChangePreviewBlocks,
  buildPlanChangedBlocks,
  buildLifecycleBlocks,
  buildInvoiceIssuedBlocks,
  buildDigestBlocks,
  buildFailureBlocks,
} from '../../src/services/slackService';

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeTxn(overrides: Partial<Transaction> = {}): Transaction {
  return {
    txnId: 'txn-001',
    consultantId: 'consultant-1',
    clientEmail: 'client@example.com',
    type: 'subscription',
    state: 'started',
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

function platformError(errorCode: string) {
  const err = new Error(errorCode) as Error & { code: string; data: { error: string } };
  err.code = 'slack_webapi_platform_error';
  err.data = { error: errorCode };
  return err;
}

// ── Tests ─────────────────────────────────────────────────────────────────────

beforeEach(() => {
  jest.clearAllMocks();
  mockGetChannelForPair.mockReturnValue(undefined);
  mockUpdate.mockImplementation((_id: string, patch: Partial<Transaction>) => patch);
  mockChatPostMessage.mockResolvedValue({ ok: true });
  mockConversationsSetTopic.mockResolvedValue({ ok: true });
});

// ── buildChannelName ──────────────────────────────────────────────────────────

describe('buildChannelName', () => {
  it('produces a lowercase sanitized name ≤ 80 chars', () => {
    const name = buildChannelName('consultant-1', 'client@example.com');
    expect(name).toMatch(/^[a-z0-9-_]+$/);
    expect(name.length).toBeLessThanOrEqual(80);
    expect(name).toContain('txn-');
  });

  it('sanitizes special characters in email', () => {
    const name = buildChannelName('c1', 'user+tag@my-company.io');
    expect(name).toMatch(/^[a-z0-9-_]+$/);
  });
});

// ── ensureTxnChannel — tier 1 (both parties are workspace members) ────────────

describe('ensureTxnChannel — tier 1 (both members)', () => {
  it('creates channel, invites both parties, posts started message', async () => {
    mockConversationsCreate.mockResolvedValue({
      ok: true,
      channel: { id: 'C001', name: 'txn-consultant-1-client-001' },
    });
    mockLookupByEmail
      .mockResolvedValueOnce({ ok: true, user: { id: 'U_CONSULTANT' } })  // consultant
      .mockResolvedValueOnce({ ok: true, user: { id: 'U_CLIENT' } });      // client
    mockConversationsInvite.mockResolvedValue({ ok: true });

    const txn = makeTxn();
    const result = await ensureTxnChannel(txn, 'consultant@example.com');

    expect(result.channelId).toBe('C001');
    expect(result.consultantInvited).toBe(true);
    expect(result.clientInvited).toBe(true);
    expect(mockConversationsCreate).toHaveBeenCalledWith(
      expect.objectContaining({ is_private: true })
    );
    expect(mockConversationsInvite).toHaveBeenCalledTimes(2);
    expect(mockChatPostMessage).toHaveBeenCalled();
  });
});

// ── ensureTxnChannel — tier 2 (client not in workspace) ──────────────────────

describe('ensureTxnChannel — tier 2 (client not in workspace)', () => {
  it('posts fallback note when client lookup returns users_not_found', async () => {
    mockConversationsCreate.mockResolvedValue({
      ok: true,
      channel: { id: 'C002', name: 'txn-consultant-1-unknown-001' },
    });
    mockLookupByEmail
      .mockResolvedValueOnce({ ok: true, user: { id: 'U_CONSULTANT' } }) // consultant found
      .mockRejectedValueOnce(platformError('users_not_found'));           // client not found

    mockConversationsInvite.mockResolvedValue({ ok: true });

    const txn = makeTxn({ clientEmail: 'unknown@external.com' });
    const result = await ensureTxnChannel(txn, 'consultant@example.com');

    expect(result.clientInvited).toBe(false);
    expect(result.consultantInvited).toBe(true);
    // Should post both the started message AND the tier-2 fallback note
    expect(mockChatPostMessage).toHaveBeenCalledTimes(2);
    const fallbackCall = mockChatPostMessage.mock.calls[1][0];
    expect(fallbackCall.text).toMatch(/email/i);
  });

  it('does not throw when both parties are absent from workspace', async () => {
    mockConversationsCreate.mockResolvedValue({
      ok: true,
      channel: { id: 'C003', name: 'txn-c1-ext-001' },
    });
    mockLookupByEmail.mockRejectedValue(platformError('users_not_found'));

    const txn = makeTxn({ clientEmail: 'ext@external.com' });
    await expect(ensureTxnChannel(txn, 'ext-consultant@external.com')).resolves.toMatchObject({
      clientInvited: false,
      consultantInvited: false,
    });
  });
});

// ── ensureTxnChannel — name_taken → reuse ────────────────────────────────────

describe('ensureTxnChannel — name_taken', () => {
  it('falls back to listing and reusing the existing channel', async () => {
    mockConversationsCreate.mockRejectedValue(platformError('name_taken'));
    mockConversationsList.mockResolvedValue({
      ok: true,
      channels: [
        { id: 'C_EXISTING', name: 'txn-consultant-1-client-001' },
      ],
    });
    mockLookupByEmail.mockResolvedValue({ ok: true, user: { id: 'U_USER' } });
    mockConversationsInvite.mockResolvedValue({ ok: true });

    const txn = makeTxn();
    const result = await ensureTxnChannel(txn, 'consultant@example.com');

    expect(result.channelId).toBe('C_EXISTING');
    expect(mockConversationsList).toHaveBeenCalled();
  });
});

// ── ensureTxnChannel — channel reuse via store ────────────────────────────────

describe('ensureTxnChannel — channel reuse', () => {
  it('reuses existing channel without calling conversations.create', async () => {
    mockGetChannelForPair.mockReturnValue('C_STORED');
    mockUpdate.mockReturnValue({ channelId: 'C_STORED', channelName: 'txn-consultant-1-client-001' });

    const txn = makeTxn();
    const result = await ensureTxnChannel(txn, 'consultant@example.com');

    expect(result.channelId).toBe('C_STORED');
    expect(mockConversationsCreate).not.toHaveBeenCalled();
    expect(mockLookupByEmail).not.toHaveBeenCalled();
  });
});

// ── Block Kit builders ────────────────────────────────────────────────────────

describe('Block Kit builders', () => {
  const txn = makeTxn();

  it('buildTransactionStartedBlocks includes txn id and type', () => {
    const blocks = buildTransactionStartedBlocks(txn);
    const json = JSON.stringify(blocks);
    expect(json).toContain(txn.txnId);
    expect(json).toContain(txn.type);
    expect(blocks.length).toBeGreaterThan(0);
  });

  it('buildSubscriptionActiveBlocks includes plan and MRR', () => {
    const blocks = buildSubscriptionActiveBlocks({
      customerName: 'Alice',
      plan: 'basic',
      mrr: '$99.00',
      state: 'active',
      nextBillDate: '2025-07-01',
      maxioUrl: 'https://app.chargify.com/subscriptions/123',
    });
    const json = JSON.stringify(blocks);
    expect(json).toContain('basic');
    expect(json).toContain('$99.00');
    expect(json).toContain('View in Maxio');
  });

  it('buildSubscriptionActiveBlocks works without maxioUrl', () => {
    const blocks = buildSubscriptionActiveBlocks({
      customerName: 'Bob',
      plan: 'pro',
      mrr: '$299.00',
      state: 'active',
      nextBillDate: '2025-07-01',
    });
    const json = JSON.stringify(blocks);
    expect(json).not.toContain('View in Maxio');
  });

  it('buildUsageRecordedBlocks includes component and quantity', () => {
    const blocks = buildUsageRecordedBlocks({
      component: 'consulting-minutes',
      quantity: 30,
      periodTotal: 90,
      unitName: 'minute',
    });
    const json = JSON.stringify(blocks);
    expect(json).toContain('consulting-minutes');
    expect(json).toContain('30');
  });

  it('buildPlanChangePreviewBlocks includes old and new plan', () => {
    const blocks = buildPlanChangePreviewBlocks({
      oldPlan: 'basic',
      newPlan: 'pro',
      proratedAmount: '$50.00',
      timing: 'prorate',
    });
    const json = JSON.stringify(blocks);
    expect(json).toContain('basic');
    expect(json).toContain('pro');
    expect(json).toContain('Preview only');
  });

  it('buildPlanChangedBlocks includes View in Maxio button when url provided', () => {
    const blocks = buildPlanChangedBlocks({
      oldPlan: 'basic',
      newPlan: 'pro',
      effectiveDate: '2025-06-01',
      proration: '$50.00',
      maxioUrl: 'https://app.chargify.com',
    });
    const json = JSON.stringify(blocks);
    expect(json).toContain('View in Maxio');
  });

  it('buildLifecycleBlocks shows state transition', () => {
    const blocks = buildLifecycleBlocks({
      action: 'cancel',
      oldState: 'active',
      newState: 'canceled',
      reason: 'test',
      effectiveDate: '2025-06-01',
    });
    const json = JSON.stringify(blocks);
    expect(json).toContain('active');
    expect(json).toContain('canceled');
  });

  it('buildInvoiceIssuedBlocks contains Pay Invoice button', () => {
    const blocks = buildInvoiceIssuedBlocks({
      amountDue: '$99.00',
      dueDate: '2025-07-01',
      payUrl: 'https://invoice.example.com/pay',
    });
    const json = JSON.stringify(blocks);
    expect(json).toContain('Pay Invoice');
    expect(json).toContain('https://invoice.example.com/pay');
  });

  it('buildDigestBlocks includes MRR and active count', () => {
    const blocks = buildDigestBlocks({
      consultantId: 'consultant-1',
      activeCount: 5,
      mrr: '$1,485.00',
      newSignups: 2,
      churn: 0,
      overdueInvoices: 1,
    });
    const json = JSON.stringify(blocks);
    expect(json).toContain('5');
    expect(json).toContain('$1,485.00');
    expect(json).toContain('Reporting data may lag');
  });

  it('buildFailureBlocks includes error message', () => {
    const blocks = buildFailureBlocks('UC1 Book', 'Product handle not found');
    const json = JSON.stringify(blocks);
    expect(json).toContain('Product handle not found');
    expect(json).toContain(':warning:');
  });
});
