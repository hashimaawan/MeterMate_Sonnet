import { useId, useRef, useState } from 'react';
import {
  type ComponentHandle,
  type UsageRequest,
  type UsageResponse,
  COMPONENT_OPTIONS,
  postUsage,
} from '../api/usageApi';

// ── Styles ────────────────────────────────────────────────────────────────────

const s = {
  card: {
    background: '#fff',
    border: '1px solid #e2e8f0',
    borderRadius: 12,
    padding: '2rem',
    maxWidth: 560,
    width: '100%',
    boxShadow: '0 1px 3px rgba(0,0,0,.08)',
  } as React.CSSProperties,

  label: {
    display: 'block',
    fontSize: 13,
    fontWeight: 600,
    color: '#374151',
    marginBottom: 4,
  } as React.CSSProperties,

  hint: {
    fontSize: 11,
    color: '#9ca3af',
    marginTop: 3,
  } as React.CSSProperties,

  input: {
    width: '100%',
    padding: '8px 12px',
    fontSize: 14,
    border: '1px solid #d1d5db',
    borderRadius: 6,
    outline: 'none',
    boxSizing: 'border-box',
    color: '#111827',
    background: '#fff',
  } as React.CSSProperties,

  inputError: {
    borderColor: '#ef4444',
  } as React.CSSProperties,

  fieldError: {
    fontSize: 12,
    color: '#ef4444',
    marginTop: 3,
  } as React.CSSProperties,

  field: {
    marginBottom: '1.1rem',
  } as React.CSSProperties,

  componentGrid: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: '0.75rem',
  } as React.CSSProperties,

  componentCard: (selected: boolean): React.CSSProperties => ({
    border: `2px solid ${selected ? '#6366f1' : '#e2e8f0'}`,
    borderRadius: 8,
    padding: '0.85rem 1rem',
    cursor: 'pointer',
    background: selected ? '#eef2ff' : '#fafafa',
    transition: 'border-color 0.15s, background 0.15s',
  }),

  componentName: {
    fontWeight: 700,
    fontSize: 14,
    color: '#111827',
  } as React.CSSProperties,

  componentRate: {
    fontSize: 12,
    color: '#6b7280',
    marginTop: 2,
  } as React.CSSProperties,

  btn: (loading: boolean): React.CSSProperties => ({
    width: '100%',
    padding: '10px 0',
    background: loading ? '#a5b4fc' : '#6366f1',
    color: '#fff',
    border: 'none',
    borderRadius: 7,
    fontSize: 15,
    fontWeight: 600,
    cursor: loading ? 'not-allowed' : 'pointer',
    marginTop: '0.5rem',
    transition: 'background 0.15s',
  }),

  successBanner: {
    background: '#f0fdf4',
    border: '1px solid #86efac',
    borderRadius: 10,
    padding: '1.25rem 1.5rem',
    marginTop: '1.5rem',
  } as React.CSSProperties,

  failBanner: {
    background: '#fefce8',
    border: '1px solid #fde047',
    borderRadius: 10,
    padding: '1.25rem 1.5rem',
    marginTop: '1.5rem',
  } as React.CSSProperties,

  expiredBanner: {
    background: '#fff7ed',
    border: '1px solid #fdba74',
    borderRadius: 10,
    padding: '1rem 1.25rem',
    marginTop: '1.5rem',
    fontSize: 14,
    color: '#9a3412',
  } as React.CSSProperties,

  errorBanner: {
    background: '#fef2f2',
    border: '1px solid #fca5a5',
    borderRadius: 10,
    padding: '1rem 1.25rem',
    marginTop: '1.5rem',
    fontSize: 14,
    color: '#991b1b',
  } as React.CSSProperties,

  metaRow: {
    display: 'flex',
    justifyContent: 'space-between',
    fontSize: 13,
    marginBottom: '0.4rem',
    color: '#374151',
  } as React.CSSProperties,

  metaKey: {
    color: '#6b7280',
    fontWeight: 500,
  } as React.CSSProperties,

  metaVal: {
    fontWeight: 600,
    color: '#111827',
  } as React.CSSProperties,
} as const;

// ── Component ─────────────────────────────────────────────────────────────────

interface Props {
  defaultTxnRef?: string;
}

interface FormState {
  txnRef: string;
  componentHandle: ComponentHandle;
  quantity: string;
  memo: string;
}

export default function UsageForm({ defaultTxnRef = '' }: Props) {
  const sessionId = useRef(crypto.randomUUID());
  const formId = useId();

  const [form, setForm] = useState<FormState>({
    txnRef: defaultTxnRef,
    componentHandle: 'metermate-consulting-minutes',
    quantity: '',
    memo: '',
  });
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<UsageResponse | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({});

  // Keep txnRef in sync when parent provides a new booking
  const prevDefaultRef = useRef(defaultTxnRef);
  if (defaultTxnRef !== prevDefaultRef.current) {
    prevDefaultRef.current = defaultTxnRef;
    if (defaultTxnRef) {
      setForm((f) => ({ ...f, txnRef: defaultTxnRef }));
    }
  }

  function set<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((f) => ({ ...f, [key]: value }));
    setFieldErrors((e) => {
      const next = { ...e };
      delete next[key];
      return next;
    });
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setResult(null);
    setFieldErrors({});

    const qty = parseFloat(form.quantity);
    if (!form.txnRef.trim()) {
      setFieldErrors({ txnRef: ['Transaction ID is required'] });
      return;
    }
    if (!form.quantity || isNaN(qty) || qty <= 0) {
      setFieldErrors({ quantity: ['Quantity must be a positive number'] });
      return;
    }

    setSubmitting(true);

    const payload: UsageRequest = {
      sessionId: sessionId.current,
      txnRef: form.txnRef.trim(),
      componentHandle: form.componentHandle,
      quantity: qty,
      ...(form.memo.trim() ? { memo: form.memo.trim() } : {}),
    };

    try {
      const res = await postUsage(payload);
      setResult(res);
      if (res.status === 'invalid' && res.details) {
        setFieldErrors(res.details);
      }
      if (res.status === 'ok') {
        setForm((f) => ({ ...f, quantity: '', memo: '' }));
        sessionId.current = crypto.randomUUID();
      }
    } catch (err) {
      setResult({ status: 'invalid', error: (err as Error).message });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div style={s.card}>
      <h2 style={{ margin: '0 0 1.5rem', fontSize: 20, color: '#111827' }}>
        Record Usage
      </h2>

      <form id={formId} onSubmit={(e) => void handleSubmit(e)} noValidate>
        {/* Transaction ID */}
        <div style={s.field}>
          <label htmlFor={`${formId}-txnRef`} style={s.label}>
            Transaction ID
          </label>
          <input
            id={`${formId}-txnRef`}
            type="text"
            value={form.txnRef}
            onChange={(e) => set('txnRef', e.target.value)}
            style={{
              ...s.input,
              fontFamily: 'monospace',
              fontSize: 12,
              ...(fieldErrors.txnRef ? s.inputError : {}),
            }}
            placeholder="Paste txnId from a completed booking"
          />
          {defaultTxnRef && form.txnRef === defaultTxnRef && (
            <p style={s.hint}>Pre-filled from your last booking</p>
          )}
          {fieldErrors.txnRef && (
            <p style={s.fieldError}>{fieldErrors.txnRef[0]}</p>
          )}
        </div>

        {/* Component */}
        <div style={s.field}>
          <span style={s.label}>Component</span>
          <div style={s.componentGrid}>
            {COMPONENT_OPTIONS.map(({ handle, label, rate }) => {
              const selected = form.componentHandle === handle;
              return (
                <div
                  key={handle}
                  style={s.componentCard(selected)}
                  onClick={() => set('componentHandle', handle)}
                  role="radio"
                  aria-checked={selected}
                  tabIndex={0}
                  onKeyDown={(e) => e.key === 'Enter' && set('componentHandle', handle)}
                >
                  <div style={s.componentName}>{label}</div>
                  <div style={s.componentRate}>{rate}</div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Quantity */}
        <div style={s.field}>
          <label htmlFor={`${formId}-quantity`} style={s.label}>
            Quantity{' '}
            <span style={{ fontWeight: 400, color: '#9ca3af' }}>
              ({form.componentHandle === 'metermate-consulting-minutes' ? 'minutes' : 'calls'})
            </span>
          </label>
          <input
            id={`${formId}-quantity`}
            type="number"
            min="1"
            step="1"
            value={form.quantity}
            onChange={(e) => set('quantity', e.target.value)}
            style={{
              ...s.input,
              ...(fieldErrors.quantity ? s.inputError : {}),
            }}
            placeholder="e.g. 30"
          />
          {fieldErrors.quantity && (
            <p style={s.fieldError}>{fieldErrors.quantity[0]}</p>
          )}
        </div>

        {/* Memo */}
        <div style={s.field}>
          <label htmlFor={`${formId}-memo`} style={s.label}>
            Memo{' '}
            <span style={{ fontWeight: 400, color: '#9ca3af' }}>(optional)</span>
          </label>
          <input
            id={`${formId}-memo`}
            type="text"
            value={form.memo}
            onChange={(e) => set('memo', e.target.value)}
            style={s.input}
            placeholder="e.g. Strategy call — Q3 roadmap"
          />
        </div>

        <button type="submit" disabled={submitting} style={s.btn(submitting)}>
          {submitting ? 'Recording usage…' : 'Record Usage'}
        </button>
      </form>

      {/* ── Result ── */}
      {result?.status === 'ok' && (
        <div style={s.successBanner}>
          <div style={{ fontWeight: 700, fontSize: 15, color: '#15803d', marginBottom: '0.75rem' }}>
            Usage recorded
          </div>
          <div style={s.metaRow}>
            <span style={s.metaKey}>Component</span>
            <span style={s.metaVal}>
              {COMPONENT_OPTIONS.find((o) => o.handle === result.componentHandle)?.label ??
                result.componentHandle}
            </span>
          </div>
          <div style={s.metaRow}>
            <span style={s.metaKey}>Quantity</span>
            <span style={s.metaVal}>
              {result.quantity} {result.unitName}(s)
            </span>
          </div>
          <div style={s.metaRow}>
            <span style={s.metaKey}>Period total</span>
            <span style={s.metaVal}>
              {result.unitBalance} {result.unitName}(s)
            </span>
          </div>
          {result.memo && (
            <div style={s.metaRow}>
              <span style={s.metaKey}>Memo</span>
              <span style={s.metaVal}>{result.memo}</span>
            </div>
          )}
          {result.channelName && (
            <div style={s.metaRow}>
              <span style={s.metaKey}>Slack channel</span>
              <span style={s.metaVal}>#{result.channelName}</span>
            </div>
          )}
          <div style={{ fontSize: 12, color: '#15803d', marginTop: '0.5rem' }}>
            Accrues to next invoice
          </div>
        </div>
      )}

      {result?.status === 'maxio_failed' && (
        <div style={s.failBanner}>
          <div style={{ fontWeight: 700, color: '#854d0e', marginBottom: 6 }}>
            Maxio error — usage not recorded
          </div>
          <div style={{ fontSize: 13, color: '#713f12' }}>{result.error}</div>
        </div>
      )}

      {result?.status === 'session_expired' && (
        <div style={s.expiredBanner}>
          Transaction not found. Complete a booking first, then paste the Transaction ID above.
        </div>
      )}

      {result?.status === 'invalid' && !result.details && (
        <div style={s.errorBanner}>{result.error}</div>
      )}
    </div>
  );
}
