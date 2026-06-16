import { useEffect, useId, useRef, useState } from 'react';
import {
  type BookRequest,
  type BookResponse,
  type Consultant,
  type Product,
  fetchConsultants,
  fetchProducts,
  postBook,
} from '../api/bookApi';

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

  row: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: '1rem',
  } as React.CSSProperties,

  field: {
    marginBottom: '1.1rem',
  } as React.CSSProperties,

  planGrid: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: '0.75rem',
  } as React.CSSProperties,

  planCard: (selected: boolean): React.CSSProperties => ({
    border: `2px solid ${selected ? '#6366f1' : '#e2e8f0'}`,
    borderRadius: 8,
    padding: '0.85rem 1rem',
    cursor: 'pointer',
    background: selected ? '#eef2ff' : '#fafafa',
    transition: 'border-color 0.15s, background 0.15s',
  }),

  planName: {
    fontWeight: 700,
    fontSize: 15,
    color: '#111827',
  } as React.CSSProperties,

  planPrice: {
    fontSize: 13,
    color: '#6b7280',
    marginTop: 2,
  } as React.CSSProperties,

  radioRow: {
    display: 'flex',
    gap: '1.5rem',
    alignItems: 'center',
  } as React.CSSProperties,

  radioLabel: {
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    fontSize: 14,
    cursor: 'pointer',
    color: '#374151',
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

interface FormState {
  firstName: string;
  lastName: string;
  email: string;
  consultantId: string;
  productHandle: 'basic' | 'pro';
  collectionMethod: 'automatic' | 'remittance';
  couponCode: string;
}

const DEFAULT_FORM: FormState = {
  firstName: '',
  lastName: '',
  email: '',
  consultantId: '',
  productHandle: 'basic',
  collectionMethod: 'automatic',
  couponCode: '',
};

interface Props {
  onBooked?: (txnId: string) => void;
}

export default function BookForm({ onBooked }: Props) {
  const sessionId = useRef(crypto.randomUUID());
  const formId = useId();

  const [form, setForm] = useState<FormState>(DEFAULT_FORM);
  const [consultants, setConsultants] = useState<Consultant[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<BookResponse | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({});

  useEffect(() => {
    Promise.all([fetchConsultants(), fetchProducts()])
      .then(([c, p]) => {
        setConsultants(c);
        setProducts(p);
        if (c.length > 0) setForm((f) => ({ ...f, consultantId: c[0].id }));
      })
      .catch((err: Error) => setLoadError(err.message));
  }, []);

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
    setSubmitting(true);

    const payload: BookRequest = {
      sessionId: sessionId.current,
      firstName: form.firstName.trim(),
      lastName: form.lastName.trim(),
      email: form.email.trim(),
      consultantId: form.consultantId,
      productHandle: form.productHandle,
      collectionMethod: form.collectionMethod,
      ...(form.couponCode.trim() ? { couponCode: form.couponCode.trim() } : {}),
    };

    try {
      const res = await postBook(payload);
      setResult(res);
      if (res.status === 'invalid' && res.details) {
        setFieldErrors(res.details);
      }
      if (res.status === 'ok') {
        onBooked?.(res.txnId);
        setForm(DEFAULT_FORM);
        sessionId.current = crypto.randomUUID();
      }
    } catch (err) {
      setResult({
        status: 'invalid',
        error: (err as Error).message,
      });
    } finally {
      setSubmitting(false);
    }
  }

  const planMap = Object.fromEntries(products.map((p) => [p.handle, p]));

  if (loadError) {
    return <div style={s.errorBanner}>Could not load form data: {loadError}</div>;
  }

  return (
    <div style={s.card}>
      <h2 style={{ margin: '0 0 1.5rem', fontSize: 20, color: '#111827' }}>
        Book &amp; Subscribe
      </h2>

      <form id={formId} onSubmit={(e) => void handleSubmit(e)} noValidate>
        {/* Consultant */}
        <div style={s.field}>
          <label htmlFor={`${formId}-consultant`} style={s.label}>
            Consultant
          </label>
          <select
            id={`${formId}-consultant`}
            value={form.consultantId}
            onChange={(e) => set('consultantId', e.target.value)}
            style={{ ...s.input, background: '#fff' }}
            required
          >
            {consultants.length === 0 && (
              <option value="">Loading…</option>
            )}
            {consultants.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>

        {/* Name row */}
        <div style={s.row}>
          <div style={s.field}>
            <label htmlFor={`${formId}-firstName`} style={s.label}>
              First name
            </label>
            <input
              id={`${formId}-firstName`}
              type="text"
              value={form.firstName}
              onChange={(e) => set('firstName', e.target.value)}
              style={{
                ...s.input,
                ...(fieldErrors.firstName ? s.inputError : {}),
              }}
              autoComplete="given-name"
              required
            />
            {fieldErrors.firstName && (
              <p style={s.fieldError}>{fieldErrors.firstName[0]}</p>
            )}
          </div>

          <div style={s.field}>
            <label htmlFor={`${formId}-lastName`} style={s.label}>
              Last name
            </label>
            <input
              id={`${formId}-lastName`}
              type="text"
              value={form.lastName}
              onChange={(e) => set('lastName', e.target.value)}
              style={{
                ...s.input,
                ...(fieldErrors.lastName ? s.inputError : {}),
              }}
              autoComplete="family-name"
              required
            />
            {fieldErrors.lastName && (
              <p style={s.fieldError}>{fieldErrors.lastName[0]}</p>
            )}
          </div>
        </div>

        {/* Email */}
        <div style={s.field}>
          <label htmlFor={`${formId}-email`} style={s.label}>
            Client email
          </label>
          <input
            id={`${formId}-email`}
            type="email"
            value={form.email}
            onChange={(e) => set('email', e.target.value)}
            style={{
              ...s.input,
              ...(fieldErrors.email ? s.inputError : {}),
            }}
            autoComplete="email"
            required
          />
          {fieldErrors.email && (
            <p style={s.fieldError}>{fieldErrors.email[0]}</p>
          )}
        </div>

        {/* Plan */}
        <div style={s.field}>
          <span style={s.label}>Plan</span>
          <div style={s.planGrid}>
            {(['basic', 'pro'] as const).map((handle) => {
              const product = planMap[handle];
              const selected = form.productHandle === handle;
              return (
                <div
                  key={handle}
                  style={s.planCard(selected)}
                  onClick={() => set('productHandle', handle)}
                  role="radio"
                  aria-checked={selected}
                  tabIndex={0}
                  onKeyDown={(e) => e.key === 'Enter' && set('productHandle', handle)}
                >
                  <div style={s.planName}>
                    {product ? product.name : handle.charAt(0).toUpperCase() + handle.slice(1)}
                  </div>
                  <div style={s.planPrice}>
                    {product
                      ? `$${product.price.toFixed(2)} / ${product.interval}`
                      : '—'}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Collection method */}
        <div style={s.field}>
          <span style={s.label}>Collection method</span>
          <div style={s.radioRow}>
            {(['automatic', 'remittance'] as const).map((method) => (
              <label key={method} style={s.radioLabel}>
                <input
                  type="radio"
                  name={`${formId}-collection`}
                  value={method}
                  checked={form.collectionMethod === method}
                  onChange={() => set('collectionMethod', method)}
                />
                {method.charAt(0).toUpperCase() + method.slice(1)}
              </label>
            ))}
          </div>
        </div>

        {/* Coupon code */}
        <div style={s.field}>
          <label htmlFor={`${formId}-coupon`} style={s.label}>
            Coupon code{' '}
            <span style={{ fontWeight: 400, color: '#9ca3af' }}>(optional)</span>
          </label>
          <input
            id={`${formId}-coupon`}
            type="text"
            value={form.couponCode}
            onChange={(e) => set('couponCode', e.target.value)}
            style={s.input}
            placeholder="e.g. LAUNCH25"
          />
        </div>

        <button type="submit" disabled={submitting} style={s.btn(submitting)}>
          {submitting ? 'Creating subscription…' : 'Book & Subscribe'}
        </button>
      </form>

      {/* ── Result ── */}
      {result?.status === 'ok' && (
        <div style={s.successBanner}>
          <div
            style={{ fontWeight: 700, fontSize: 15, color: '#15803d', marginBottom: '0.75rem' }}
          >
            Subscription active
          </div>
          <div style={s.metaRow}>
            <span style={s.metaKey}>Customer</span>
            <span style={s.metaVal}>{result.customerName}</span>
          </div>
          <div style={s.metaRow}>
            <span style={s.metaKey}>Plan</span>
            <span style={s.metaVal}>{result.plan}</span>
          </div>
          <div style={s.metaRow}>
            <span style={s.metaKey}>MRR</span>
            <span style={s.metaVal}>{result.mrr} / mo</span>
          </div>
          <div style={s.metaRow}>
            <span style={s.metaKey}>State</span>
            <span style={s.metaVal}>{result.state}</span>
          </div>
          <div style={s.metaRow}>
            <span style={s.metaKey}>Next bill</span>
            <span style={s.metaVal}>{result.nextBillDate}</span>
          </div>
          {result.channelName && (
            <div style={s.metaRow}>
              <span style={s.metaKey}>Slack channel</span>
              <span style={s.metaVal}>#{result.channelName}</span>
            </div>
          )}
          <hr style={s.divider} />
          <a href={result.maxioUrl} target="_blank" rel="noreferrer" style={s.link}>
            View subscription in Maxio →
          </a>
        </div>
      )}

      {result?.status === 'maxio_failed' && (
        <div style={s.failBanner}>
          <div style={{ fontWeight: 700, color: '#854d0e', marginBottom: 6 }}>
            Maxio error — subscription not created
          </div>
          <div style={{ fontSize: 13, color: '#713f12' }}>{result.error}</div>
          {result.channelName && (
            <div style={{ fontSize: 12, color: '#92400e', marginTop: 6 }}>
              Failure logged to #{result.channelName}
            </div>
          )}
        </div>
      )}

      {result?.status === 'invalid' && !result.details && (
        <div style={s.errorBanner}>{result.error}</div>
      )}
    </div>
  );
}
