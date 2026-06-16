import { useId, useRef, useState } from 'react';
import {
  type LifecycleAction,
  type CancelType,
  type LifecycleSuccess,
  postLifecycle,
} from '../api/lifecycleApi';

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

  actionGrid: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: '0.75rem',
  } as React.CSSProperties,

  cancelGrid: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: '0.75rem',
  } as React.CSSProperties,

  optionCard: (selected: boolean, danger?: boolean): React.CSSProperties => ({
    border: `2px solid ${selected ? (danger ? '#ef4444' : '#6366f1') : '#e2e8f0'}`,
    borderRadius: 8,
    padding: '0.85rem 1rem',
    cursor: 'pointer',
    background: selected ? (danger ? '#fef2f2' : '#eef2ff') : '#fafafa',
    transition: 'border-color 0.15s, background 0.15s',
  }),

  optionTitle: {
    fontWeight: 700,
    fontSize: 14,
    color: '#111827',
  } as React.CSSProperties,

  optionSub: {
    fontSize: 12,
    color: '#6b7280',
    marginTop: 2,
  } as React.CSSProperties,

  btn: (loading: boolean, variant: 'primary' | 'danger' | 'secondary' = 'primary'): React.CSSProperties => ({
    flex: 1,
    padding: '10px 0',
    background:
      loading
        ? '#a5b4fc'
        : variant === 'danger'
        ? '#ef4444'
        : variant === 'secondary'
        ? '#f3f4f6'
        : '#6366f1',
    color: variant === 'secondary' ? '#374151' : '#fff',
    border: variant === 'secondary' ? '1px solid #d1d5db' : 'none',
    borderRadius: 7,
    fontSize: 15,
    fontWeight: 600,
    cursor: loading ? 'not-allowed' : 'pointer',
    transition: 'background 0.15s',
    width: '100%',
  }),

  successBanner: {
    background: '#f0fdf4',
    border: '1px solid #86efac',
    borderRadius: 10,
    padding: '1.25rem 1.5rem',
  } as React.CSSProperties,

  failBanner: {
    background: '#fefce8',
    border: '1px solid #fde047',
    borderRadius: 10,
    padding: '1.25rem 1.5rem',
    marginTop: '1rem',
  } as React.CSSProperties,

  expiredBanner: {
    background: '#fff7ed',
    border: '1px solid #fdba74',
    borderRadius: 10,
    padding: '1rem 1.25rem',
    marginTop: '1rem',
    fontSize: 14,
    color: '#9a3412',
  } as React.CSSProperties,

  errorBanner: {
    background: '#fef2f2',
    border: '1px solid #fca5a5',
    borderRadius: 10,
    padding: '1rem 1.25rem',
    marginTop: '1rem',
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

  metaKey: { color: '#6b7280', fontWeight: 500 } as React.CSSProperties,
  metaVal: { fontWeight: 600, color: '#111827' } as React.CSSProperties,

  link: {
    color: '#6366f1',
    textDecoration: 'none',
    fontWeight: 600,
    fontSize: 13,
  } as React.CSSProperties,

  divider: {
    border: 'none',
    borderTop: '1px solid #e5e7eb',
    margin: '1rem 0',
  } as React.CSSProperties,

  sectionLabel: {
    fontSize: 12,
    fontWeight: 600,
    color: '#9ca3af',
    textTransform: 'uppercase' as const,
    letterSpacing: '0.05em',
    marginBottom: '0.5rem',
  } as React.CSSProperties,
} as const;

// ── Data ──────────────────────────────────────────────────────────────────────

const ACTIONS: {
  value: LifecycleAction;
  title: string;
  sub: string;
  danger?: boolean;
}[] = [
  { value: 'pause', title: 'Pause', sub: 'Put subscription on hold' },
  { value: 'resume', title: 'Resume', sub: 'Reactivate a paused subscription' },
  { value: 'reactivate', title: 'Reactivate', sub: 'Restore a cancelled subscription' },
  { value: 'cancel', title: 'Cancel', sub: 'End this subscription', danger: true },
];

const CANCEL_TYPES: { value: CancelType; title: string; sub: string }[] = [
  { value: 'immediate', title: 'Immediate', sub: 'Cancel right now' },
  { value: 'end-of-period', title: 'End of period', sub: 'Cancel at next billing date' },
];

// ── Component ─────────────────────────────────────────────────────────────────

interface FormState {
  txnRef: string;
  action: LifecycleAction;
  cancelType: CancelType;
  reasonCode: string;
}

interface Props {
  defaultTxnRef?: string;
}

export default function LifecycleForm({ defaultTxnRef = '' }: Props) {
  const sessionId = useRef(crypto.randomUUID());
  const formId = useId();

  const [form, setForm] = useState<FormState>({
    txnRef: defaultTxnRef,
    action: 'pause',
    cancelType: 'end-of-period',
    reasonCode: '',
  });
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<LifecycleSuccess | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [expiredMsg, setExpiredMsg] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({});

  // Sync defaultTxnRef when parent updates it
  const prevDefault = useRef(defaultTxnRef);
  if (defaultTxnRef !== prevDefault.current) {
    prevDefault.current = defaultTxnRef;
    if (defaultTxnRef) setForm((f) => ({ ...f, txnRef: defaultTxnRef }));
  }

  function setField<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((f) => ({ ...f, [key]: value }));
    setFieldErrors((e) => { const n = { ...e }; delete n[key]; return n; });
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErrorMsg(null);
    setExpiredMsg(null);
    setFieldErrors({});
    setResult(null);

    if (!form.txnRef.trim()) {
      setFieldErrors({ txnRef: ['Transaction ID is required'] });
      return;
    }

    setLoading(true);
    try {
      const res = await postLifecycle({
        sessionId: sessionId.current,
        txnRef: form.txnRef.trim(),
        action: form.action,
        ...(form.action === 'cancel' ? { cancelType: form.cancelType } : {}),
        ...(form.reasonCode.trim() ? { reasonCode: form.reasonCode.trim() } : {}),
      });

      if (res.status === 'ok') {
        setResult(res);
        sessionId.current = crypto.randomUUID();
      } else if (res.status === 'session_expired') {
        setExpiredMsg(res.error);
      } else if (res.status === 'invalid') {
        if (res.details) setFieldErrors(res.details);
        else setErrorMsg(res.error);
      } else {
        setErrorMsg(res.error);
      }
    } catch (err) {
      setErrorMsg((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  // ── Success view ───────────────────────────────────────────────────────────

  if (result) {
    return (
      <div style={s.card}>
        <h2 style={{ margin: '0 0 1.5rem', fontSize: 20, color: '#111827' }}>
          Lifecycle Control
        </h2>
        <div style={s.successBanner}>
          <div style={{ fontWeight: 700, fontSize: 15, color: '#15803d', marginBottom: '0.75rem' }}>
            {result.action.charAt(0).toUpperCase() + result.action.slice(1)} applied
          </div>
          <div style={s.metaRow}>
            <span style={s.metaKey}>Transition</span>
            <span style={s.metaVal}>{result.oldState} → {result.newState}</span>
          </div>
          <div style={s.metaRow}>
            <span style={s.metaKey}>Effective</span>
            <span style={s.metaVal}>{result.effectiveDate}</span>
          </div>
          {result.channelName && (
            <div style={s.metaRow}>
              <span style={s.metaKey}>Slack channel</span>
              <span style={s.metaVal}>#{result.channelName}</span>
            </div>
          )}
          <hr style={s.divider} />
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <a href={result.maxioUrl} target="_blank" rel="noreferrer" style={s.link}>
              View subscription in Maxio →
            </a>
            <button
              onClick={() => {
                setResult(null);
                setErrorMsg(null);
                sessionId.current = crypto.randomUUID();
              }}
              style={{
                background: 'none',
                border: 'none',
                color: '#6b7280',
                fontSize: 13,
                cursor: 'pointer',
                textDecoration: 'underline',
              }}
            >
              Another action
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ── Form view ──────────────────────────────────────────────────────────────

  return (
    <div style={s.card}>
      <h2 style={{ margin: '0 0 1.5rem', fontSize: 20, color: '#111827' }}>
        Lifecycle Control
      </h2>

      <form id={formId} onSubmit={(e) => void handleSubmit(e)} noValidate>
        {/* Transaction ID */}
        <div style={s.field}>
          <label htmlFor={`${formId}-txnRef`} style={s.label}>Transaction ID</label>
          <input
            id={`${formId}-txnRef`}
            type="text"
            value={form.txnRef}
            onChange={(e) => setField('txnRef', e.target.value)}
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
          {fieldErrors.txnRef && <p style={s.fieldError}>{fieldErrors.txnRef[0]}</p>}
        </div>

        {/* Action */}
        <div style={s.field}>
          <span style={s.label}>Action</span>
          <div style={s.actionGrid}>
            {ACTIONS.map(({ value, title, sub, danger }) => (
              <div
                key={value}
                style={s.optionCard(form.action === value, danger)}
                onClick={() => setField('action', value)}
                role="radio"
                aria-checked={form.action === value}
                tabIndex={0}
                onKeyDown={(e) => e.key === 'Enter' && setField('action', value)}
              >
                <div style={s.optionTitle}>{title}</div>
                <div style={s.optionSub}>{sub}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Cancel type — only shown when action is cancel */}
        {form.action === 'cancel' && (
          <div style={s.field}>
            <span style={s.label}>When to cancel</span>
            <div style={s.cancelGrid}>
              {CANCEL_TYPES.map(({ value, title, sub }) => (
                <div
                  key={value}
                  style={s.optionCard(form.cancelType === value, true)}
                  onClick={() => setField('cancelType', value)}
                  role="radio"
                  aria-checked={form.cancelType === value}
                  tabIndex={0}
                  onKeyDown={(e) => e.key === 'Enter' && setField('cancelType', value)}
                >
                  <div style={s.optionTitle}>{title}</div>
                  <div style={s.optionSub}>{sub}</div>
                </div>
              ))}
            </div>
            {fieldErrors.cancelType && (
              <p style={s.fieldError}>{fieldErrors.cancelType[0]}</p>
            )}
          </div>
        )}

        {/* Reason code — optional */}
        <div style={s.field}>
          <label htmlFor={`${formId}-reason`} style={s.label}>
            Reason <span style={{ fontWeight: 400, color: '#9ca3af' }}>(optional)</span>
          </label>
          <input
            id={`${formId}-reason`}
            type="text"
            value={form.reasonCode}
            onChange={(e) => setField('reasonCode', e.target.value)}
            style={s.input}
            placeholder="e.g. client-request, budget-freeze"
          />
        </div>

        <button
          type="submit"
          disabled={loading}
          style={s.btn(loading, form.action === 'cancel' ? 'danger' : 'primary')}
        >
          {loading
            ? 'Working…'
            : form.action === 'pause'
            ? 'Pause subscription'
            : form.action === 'resume'
            ? 'Resume subscription'
            : form.action === 'reactivate'
            ? 'Reactivate subscription'
            : form.cancelType === 'immediate'
            ? 'Cancel immediately'
            : 'Schedule cancellation'}
        </button>
      </form>

      {expiredMsg && <div style={s.expiredBanner}>{expiredMsg}</div>}

      {errorMsg && !expiredMsg && (
        <div style={s.failBanner}>
          <div style={{ fontWeight: 700, color: '#854d0e', marginBottom: 6 }}>
            Maxio error — action not applied
          </div>
          <div style={{ fontSize: 13, color: '#713f12' }}>{errorMsg}</div>
        </div>
      )}
    </div>
  );
}
