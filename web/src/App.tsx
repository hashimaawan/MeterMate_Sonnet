import { useState } from 'react';
import BookForm from './components/BookForm';
import UsageForm from './components/UsageForm';
import PlanChangeForm from './components/PlanChangeForm';
import LifecycleForm from './components/LifecycleForm';
import InvoicesForm from './components/InvoicesForm';
import DigestForm from './components/DigestForm';

type Tab = 'book' | 'usage' | 'plan-change' | 'lifecycle' | 'invoices' | 'digest';

const TABS: { id: Tab; label: string }[] = [
  { id: 'book', label: 'Book & Subscribe' },
  { id: 'usage', label: 'Record Usage' },
  { id: 'plan-change', label: 'Plan Change' },
  { id: 'lifecycle', label: 'Lifecycle' },
  { id: 'invoices', label: 'Invoice' },
  { id: 'digest', label: 'Digest' },
];

export default function App() {
  const [activeTab, setActiveTab] = useState<Tab>('book');
  const [lastTxnId, setLastTxnId] = useState<string>('');

  function handleBooked(txnId: string) {
    setLastTxnId(txnId);
    setActiveTab('usage');
  }

  return (
    <div
      style={{
        minHeight: '100vh',
        background: '#f8fafc',
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
        padding: '2rem 1rem',
        boxSizing: 'border-box',
      }}
    >
      <div style={{ maxWidth: 600, margin: '0 auto' }}>
        <header style={{ marginBottom: '1.75rem' }}>
          <h1 style={{ margin: 0, fontSize: 28, color: '#111827', fontWeight: 800 }}>
            MeterMate
          </h1>
          <p style={{ margin: '4px 0 0', color: '#6b7280', fontSize: 14 }}>
            Billing concierge — powered by Maxio &amp; Slack
          </p>
        </header>

        {/* Tab bar */}
        <div
          style={{
            display: 'flex',
            gap: 4,
            background: '#e5e7eb',
            borderRadius: 10,
            padding: 4,
            marginBottom: '1.5rem',
          }}
        >
          {TABS.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              style={{
                flex: 1,
                padding: '7px 0',
                border: 'none',
                borderRadius: 7,
                fontSize: 14,
                fontWeight: 600,
                cursor: 'pointer',
                background: activeTab === tab.id ? '#fff' : 'transparent',
                color: activeTab === tab.id ? '#111827' : '#6b7280',
                boxShadow: activeTab === tab.id ? '0 1px 3px rgba(0,0,0,.1)' : 'none',
                transition: 'background 0.15s, color 0.15s',
              }}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {activeTab === 'book' && <BookForm onBooked={handleBooked} />}
        {activeTab === 'usage' && <UsageForm defaultTxnRef={lastTxnId} />}
        {activeTab === 'plan-change' && <PlanChangeForm defaultTxnRef={lastTxnId} />}
        {activeTab === 'lifecycle' && <LifecycleForm defaultTxnRef={lastTxnId} />}
        {activeTab === 'invoices' && <InvoicesForm defaultTxnRef={lastTxnId} />}
        {activeTab === 'digest' && <DigestForm defaultTxnRef={lastTxnId} />}
      </div>
    </div>
  );
}
