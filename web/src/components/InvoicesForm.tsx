import { useId, useRef, useState } from 'react';
import { type InvoiceSuccess, postInvoice } from '../api/invoicesApi';

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

  adminBox: {
    background: '#f8fafc',
    border: '1px solid #e2e8f0',
    borderRadius: 8,
    padding: '1rem 1.25rem',
    marginBottom: '1.1rem',
  } as React.CSSProperties,

  adminLabel: {
    display: 'block',
    fontSize: 12,
    fontWeight: 600,
    color: '#9ca3af',
    textTransform: 'uppercase' as const,
    letterSpacing: '0.05em',
    marginBottom: '0.75rem',
  } as React.CSSProperties,

  adminRow: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: '0.75rem',
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
    transition: 'background 0.15s',
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

  authBanner: {
    background: '#fef2f2',
    border: '1px solid #fca5a5',
    borderRadius: 10,
    padding: '1rem 1.25rem',
    marginTop: '1rem',
    fontSize: 14,
    color: '#991b1b',
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
} as const;

// ── Component ─────────────────────────────────────────────────────────────────

interface Props {
  defaultTxnRef?: string;
}

export default function InvoicesForm({ defaultTxnRef = '' }: Props) {
  const sessionId = useRef(crypto.randomUUID());
  const formId = useId();

  const [txnRef, setTxnRef] = useState(defaultTxnRef);
  const [adminUser, setAdminUser] = useState('admin');
  const [adminPassword, setAdminPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<InvoiceSuccess | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [authError, setAuthError] = useState<string | null>(null);
  const [expiredMsg, setExpiredMsg] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({});

  // Sync defaultTxnRef when parent updates it
  const prevDefault = useRef(defaultTxnRef);
  if (defaultTxnRef !== prevDefault.current) {
    prevDefault.current = defaultTxnRef;
    if (defaultTxnRef) setTxnRef(defaultTxnRef);
  }

  function clearErrors() {
    setErrorMsg(null);
    setAuthError(null);
    setExpiredMsg(null);
    setFieldErrors({});
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    clearErrors();
    setResult(null);

    if (!txnRef.trim()) {
      setFieldErrors({ txnRef: ['Transaction ID is required'] });
      return;
    }
    if (!adminPassword.trim()) {
      setFieldErrors({ adminPassword: ['Admin password is required'] });
      return;
    }

    setLoading(true);
    try {
      const res = await postInvoice(
        { sessionId: sessionId.current, txnRef: txnRef.trim() },
        adminUser.trim(),
        adminPassword
      );

      if (res.status === 'ok') {
        setResult(res);
        sessionId.current = crypto.randomUUID();
      } else if (res.status === 'session_expired') {
        setExpiredMsg(res.error);
      } else if (res.status === 'invalid') {
        // 401/403 come back as invalid with error text
        const msg = (res as { error?: string }).error ?? '';
        if (msg.toLowerCase().includes('admin') || msg.toLowerCase().includes('auth')) {
          setAuthError(msg);
        } else if (res.details) {
          setFieldErrors(res.details);
        } else {
          setErrorMsg(msg);
        }
      } else {
        setErrorMsg((res as { error?: string }).error ?? 'Unknown error');
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
          Invoice Issue &amp; Send
        </h2>
        <div style={s.successBanner}>
          <div style={{ fontWeight: 700, fontSize: 15, color: '#15803d', marginBottom: '0.75rem' }}>
            Invoice {result.wasIssued ? 'issued and sent' : 'sent'}
          </div>
          <div style={s.metaRow}>
            <span style={s.metaKey}>Invoice #</span>
            <span style={s.metaVal}>{result.invoiceNumber}</span>
          </div>
          <div style={s.metaRow}>
            <span style={s.metaKey}>Status</span>
            <span style={s.metaVal}>{result.invoiceStatus}</span>
          </div>
          <div style={s.metaRow}>
            <span style={s.metaKey}>Amount due</span>
            <span style={s.metaVal}>${result.amountDue}</span>
          </div>
          <div style={s.metaRow}>
            <span style={s.metaKey}>Due date</span>
            <span style={s.metaVal}>{result.dueDate}</span>
          </div>
          {result.channelName && (
            <div style={s.metaRow}>
              <span style={s.metaKey}>Slack channel</span>
              <span style={s.metaVal}>#{result.channelName}</span>
            </div>
          )}
          <hr style={s.divider} />
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem' }}>
            <a href={result.publicUrl} target="_blank" rel="noreferrer" style={s.link}>
              Pay invoice →
            </a>
            <a href={result.maxioUrl} target="_blank" rel="noreferrer" style={{ ...s.link, color: '#9ca3af' }}>
              View in Maxio →
            </a>
            <button
              onClick={() => {
                setResult(null);
                clearErrors();
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
              Send another
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
        Invoice Issue &amp; Send
      </h2>

      <form id={formId} onSubmit={(e) => void handleSubmit(e)} noValidate>
        {/* Transaction ID */}
        <div style={s.field}>
          <label htmlFor={`${formId}-txnRef`} style={s.label}>Transaction ID</label>
          <input
            id={`${formId}-txnRef`}
            type="text"
            value={txnRef}
            onChange={(e) => { setTxnRef(e.target.value); setFieldErrors((f) => { const n = { ...f }; delete n.txnRef; return n; }); }}
            style={{
              ...s.input,
              fontFamily: 'monospace',
              fontSize: 12,
              ...(fieldErrors.txnRef ? s.inputError : {}),
            }}
            placeholder="Paste txnId from a completed booking"
          />
          {defaultTxnRef && txnRef === defaultTxnRef && (
            <p style={s.hint}>Pre-filled from your last booking</p>
          )}
          {fieldErrors.txnRef && <p style={s.fieldError}>{fieldErrors.txnRef[0]}</p>}
        </div>

        {/* Admin credentials */}
        <div style={s.adminBox}>
          <span style={s.adminLabel}>Admin credentials</span>
          <div style={s.adminRow}>
            <div>
              <label htmlFor={`${formId}-user`} style={s.label}>Username</label>
              <input
                id={`${formId}-user`}
                type="text"
                value={adminUser}
                onChange={(e) => setAdminUser(e.target.value)}
                style={s.input}
                autoComplete="username"
              />
            </div>
            <div>
              <label htmlFor={`${formId}-pass`} style={s.label}>Password</label>
              <input
                id={`${formId}-pass`}
                type="password"
                value={adminPassword}
                onChange={(e) => { setAdminPassword(e.target.value); setFieldErrors((f) => { const n = { ...f }; delete n.adminPassword; return n; }); }}
                style={{
                  ...s.input,
                  ...(fieldErrors.adminPassword ? s.inputError : {}),
                }}
                autoComplete="current-password"
                placeholder="••••••••"
              />
              {fieldErrors.adminPassword && (
                <p style={s.fieldError}>{fieldErrors.adminPassword[0]}</p>
              )}
            </div>
          </div>
        </div>

        <button type="submit" disabled={loading} style={s.btn(loading)}>
          {loading ? 'Issuing & sending…' : 'Issue & send invoice'}
        </button>
      </form>

      {authError && (
        <div style={s.authBanner}>
          <strong>Authentication failed:</strong> {authError}
        </div>
      )}

      {expiredMsg && <div style={s.expiredBanner}>{expiredMsg}</div>}

      {errorMsg && !authError && !expiredMsg && (
        <div style={s.failBanner}>
          <div style={{ fontWeight: 700, color: '#854d0e', marginBottom: 6 }}>
            Maxio error — invoice not sent
          </div>
          <div style={{ fontSize: 13, color: '#713f12' }}>{errorMsg}</div>
        </div>
      )}
    </div>
  );
}
