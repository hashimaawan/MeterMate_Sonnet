import { useId, useRef, useState } from 'react';
import {
  type PlanHandle,
  type Timing,
  type PlanChangePreviewSuccess,
  type PlanChangeApplySuccess,
  postPlanChangePreview,
  postPlanChangeApply,
} from '../api/planChangeApi';

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

  planGrid: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: '0.75rem',
  } as React.CSSProperties,

  optionCard: (selected: boolean, disabled?: boolean): React.CSSProperties => ({
    border: `2px solid ${selected ? '#6366f1' : '#e2e8f0'}`,
    borderRadius: 8,
    padding: '0.85rem 1rem',
    cursor: disabled ? 'default' : 'pointer',
    background: selected ? '#eef2ff' : disabled ? '#f9fafb' : '#fafafa',
    opacity: disabled ? 0.5 : 1,
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

  timingGrid: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: '0.75rem',
  } as React.CSSProperties,

  btn: (loading: boolean, variant: 'primary' | 'secondary' = 'primary'): React.CSSProperties => ({
    flex: 1,
    padding: '10px 0',
    background:
      loading
        ? '#a5b4fc'
        : variant === 'primary'
        ? '#6366f1'
        : '#f3f4f6',
    color: variant === 'primary' ? '#fff' : '#374151',
    border: variant === 'secondary' ? '1px solid #d1d5db' : 'none',
    borderRadius: 7,
    fontSize: 15,
    fontWeight: 600,
    cursor: loading ? 'not-allowed' : 'pointer',
    transition: 'background 0.15s',
  }),

  btnRow: {
    display: 'flex',
    gap: '0.75rem',
    marginTop: '0.5rem',
  } as React.CSSProperties,

  previewBox: {
    background: '#f8fafc',
    border: '1px solid #e2e8f0',
    borderRadius: 10,
    padding: '1.25rem 1.5rem',
    marginBottom: '1.25rem',
  } as React.CSSProperties,

  arrow: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.75rem',
    fontSize: 15,
    fontWeight: 700,
    color: '#111827',
    marginBottom: '0.75rem',
  } as React.CSSProperties,

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

// ── Data ──────────────────────────────────────────────────────────────────────

const PLANS: { handle: PlanHandle; name: string; price: string }[] = [
  { handle: 'basic', name: 'Basic Plan', price: '$99 / mo' },
  { handle: 'pro', name: 'Pro Plan', price: '$299 / mo' },
];

const TIMINGS: { value: Timing; title: string; sub: string }[] = [
  { value: 'prorate', title: 'Change now', sub: 'Prorated charge applied immediately' },
  { value: 'at-renewal', title: 'At renewal', sub: 'No charge now — takes effect next billing cycle' },
];

// ── Component ─────────────────────────────────────────────────────────────────

type Step = 'form' | 'confirm' | 'success';

interface FormState {
  txnRef: string;
  targetHandle: PlanHandle;
  timing: Timing;
}

interface Props {
  defaultTxnRef?: string;
}

export default function PlanChangeForm({ defaultTxnRef = '' }: Props) {
  const sessionId = useRef(crypto.randomUUID());
  const formId = useId();

  const [form, setForm] = useState<FormState>({
    txnRef: defaultTxnRef,
    targetHandle: 'pro',
    timing: 'prorate',
  });
  const [step, setStep] = useState<Step>('form');
  const [previewing, setPreviewing] = useState(false);
  const [applying, setApplying] = useState(false);
  const [preview, setPreview] = useState<PlanChangePreviewSuccess | null>(null);
  const [applyResult, setApplyResult] = useState<PlanChangeApplySuccess | null>(null);
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

  // ── Step 1: submit preview ─────────────────────────────────────────────────

  async function handlePreview(e: React.FormEvent) {
    e.preventDefault();
    setErrorMsg(null);
    setExpiredMsg(null);
    setFieldErrors({});

    if (!form.txnRef.trim()) {
      setFieldErrors({ txnRef: ['Transaction ID is required'] });
      return;
    }

    setPreviewing(true);
    try {
      const res = await postPlanChangePreview({
        sessionId: sessionId.current,
        txnRef: form.txnRef.trim(),
        targetHandle: form.targetHandle,
        timing: form.timing,
      });

      if (res.status === 'ok') {
        setPreview(res);
        setStep('confirm');
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
      setPreviewing(false);
    }
  }

  // ── Step 2: apply the change ───────────────────────────────────────────────

  async function handleApply() {
    if (!preview) return;
    setErrorMsg(null);
    setApplying(true);
    try {
      const res = await postPlanChangeApply({
        sessionId: sessionId.current,
        txnRef: form.txnRef.trim(),
        targetHandle: form.targetHandle,
        timing: form.timing,
      });

      if (res.status === 'ok') {
        setApplyResult(res);
        setStep('success');
        sessionId.current = crypto.randomUUID();
      } else if (res.status === 'session_expired') {
        setExpiredMsg(res.error);
        setStep('form');
      } else {
        setErrorMsg(res.error ?? 'Unknown error');
      }
    } catch (err) {
      setErrorMsg((err as Error).message);
    } finally {
      setApplying(false);
    }
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div style={s.card}>
      <h2 style={{ margin: '0 0 1.5rem', fontSize: 20, color: '#111827' }}>
        Plan Change
      </h2>

      {/* ── Step 1: configure ── */}
      {step === 'form' && (
        <form id={formId} onSubmit={(e) => void handlePreview(e)} noValidate>
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

          {/* Target plan */}
          <div style={s.field}>
            <span style={s.label}>Switch to plan</span>
            <div style={s.planGrid}>
              {PLANS.map(({ handle, name, price }) => (
                <div
                  key={handle}
                  style={s.optionCard(form.targetHandle === handle)}
                  onClick={() => setField('targetHandle', handle)}
                  role="radio"
                  aria-checked={form.targetHandle === handle}
                  tabIndex={0}
                  onKeyDown={(e) => e.key === 'Enter' && setField('targetHandle', handle)}
                >
                  <div style={s.optionTitle}>{name}</div>
                  <div style={s.optionSub}>{price}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Timing */}
          <div style={s.field}>
            <span style={s.label}>When to change</span>
            <div style={s.timingGrid}>
              {TIMINGS.map(({ value, title, sub }) => (
                <div
                  key={value}
                  style={s.optionCard(form.timing === value)}
                  onClick={() => setField('timing', value)}
                  role="radio"
                  aria-checked={form.timing === value}
                  tabIndex={0}
                  onKeyDown={(e) => e.key === 'Enter' && setField('timing', value)}
                >
                  <div style={s.optionTitle}>{title}</div>
                  <div style={s.optionSub}>{sub}</div>
                </div>
              ))}
            </div>
          </div>

          <button type="submit" disabled={previewing} style={s.btn(previewing)}>
            {previewing ? 'Fetching preview…' : 'Preview change'}
          </button>
        </form>
      )}

      {/* ── Step 2: confirm ── */}
      {step === 'confirm' && preview && (
        <div>
          <div style={s.previewBox}>
            {/* Plan transition */}
            <div style={s.arrow}>
              <span>{preview.currentPlan}</span>
              <span style={{ color: '#6366f1' }}>→</span>
              <span>{preview.targetPlan}</span>
            </div>

            <div style={s.metaRow}>
              <span style={s.metaKey}>Timing</span>
              <span style={s.metaVal}>
                {preview.timing === 'prorate' ? 'Change now (prorated)' : 'At next renewal'}
              </span>
            </div>
            <div style={s.metaRow}>
              <span style={s.metaKey}>
                {preview.timing === 'prorate' ? 'Amount due' : 'Immediate charge'}
              </span>
              <span style={s.metaVal}>{preview.proratedDisplay}</span>
            </div>
            <div style={s.metaRow}>
              <span style={s.metaKey}>Effective date</span>
              <span style={s.metaVal}>{preview.effectiveDate}</span>
            </div>
            {preview.channelName && (
              <div style={s.metaRow}>
                <span style={s.metaKey}>Slack channel</span>
                <span style={s.metaVal}>#{preview.channelName}</span>
              </div>
            )}

            <div
              style={{
                marginTop: '0.75rem',
                padding: '0.6rem 0.85rem',
                background: '#fffbeb',
                border: '1px solid #fde68a',
                borderRadius: 6,
                fontSize: 12,
                color: '#92400e',
              }}
            >
              Preview only — the change has not been applied yet.
            </div>
          </div>

          <div style={s.btnRow}>
            <button
              onClick={() => { setStep('form'); setPreview(null); setErrorMsg(null); }}
              disabled={applying}
              style={s.btn(false, 'secondary')}
            >
              Back
            </button>
            <button
              onClick={() => void handleApply()}
              disabled={applying}
              style={s.btn(applying)}
            >
              {applying ? 'Applying…' : 'Confirm change'}
            </button>
          </div>
        </div>
      )}

      {/* ── Step 3: success ── */}
      {step === 'success' && applyResult && (
        <div style={s.successBanner}>
          <div style={{ fontWeight: 700, fontSize: 15, color: '#15803d', marginBottom: '0.75rem' }}>
            Plan changed
          </div>
          <div style={s.metaRow}>
            <span style={s.metaKey}>Change</span>
            <span style={s.metaVal}>{applyResult.oldPlan} → {applyResult.newPlan}</span>
          </div>
          <div style={s.metaRow}>
            <span style={s.metaKey}>Timing</span>
            <span style={s.metaVal}>
              {applyResult.timing === 'prorate' ? 'Prorated immediately' : 'Scheduled at renewal'}
            </span>
          </div>
          {applyResult.mrr && (
            <div style={s.metaRow}>
              <span style={s.metaKey}>New MRR</span>
              <span style={s.metaVal}>{applyResult.mrr} / mo</span>
            </div>
          )}
          <div style={s.metaRow}>
            <span style={s.metaKey}>Effective</span>
            <span style={s.metaVal}>{applyResult.effectiveDate}</span>
          </div>
          <div style={s.metaRow}>
            <span style={s.metaKey}>Proration</span>
            <span style={s.metaVal}>{applyResult.proration}</span>
          </div>
          {applyResult.channelName && (
            <div style={s.metaRow}>
              <span style={s.metaKey}>Slack channel</span>
              <span style={s.metaVal}>#{applyResult.channelName}</span>
            </div>
          )}
          <hr style={s.divider} />
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <a href={applyResult.maxioUrl} target="_blank" rel="noreferrer" style={s.link}>
              View subscription in Maxio →
            </a>
            <button
              onClick={() => {
                setStep('form');
                setPreview(null);
                setApplyResult(null);
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
              Change again
            </button>
          </div>
        </div>
      )}

      {/* ── Errors ── */}
      {expiredMsg && (
        <div style={s.expiredBanner}>
          {expiredMsg}
        </div>
      )}

      {errorMsg && !expiredMsg && (
        step === 'confirm' ? (
          <div style={s.failBanner}>
            <div style={{ fontWeight: 700, color: '#854d0e', marginBottom: 6 }}>
              Maxio error — change not applied
            </div>
            <div style={{ fontSize: 13, color: '#713f12' }}>{errorMsg}</div>
          </div>
        ) : (
          <div style={s.errorBanner}>{errorMsg}</div>
        )
      )}
    </div>
  );
}
