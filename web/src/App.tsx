import BookForm from './components/BookForm';

export default function App() {
  return (
    <div
      style={{
        minHeight: '100vh',
        background: '#f8fafc',
        fontFamily:
          '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
        padding: '2rem 1rem',
        boxSizing: 'border-box',
      }}
    >
      <div style={{ maxWidth: 600, margin: '0 auto' }}>
        <header style={{ marginBottom: '2rem' }}>
          <h1 style={{ margin: 0, fontSize: 28, color: '#111827', fontWeight: 800 }}>
            MeterMate
          </h1>
          <p style={{ margin: '4px 0 0', color: '#6b7280', fontSize: 14 }}>
            Billing concierge — powered by Maxio &amp; Slack
          </p>
        </header>

        <BookForm />
      </div>
    </div>
  );
}
