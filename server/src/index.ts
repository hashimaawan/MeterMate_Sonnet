import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { rateLimit } from 'express-rate-limit';
import path from 'path';

import { config } from './config';
import { sessionStore } from './stores/sessionStore';
import { transactionStore } from './stores/transactionStore';
import metaRouter, { setCachedProducts, setSlackHealthy } from './routes/meta';
import bookRouter from './routes/book';
import usageRouter from './routes/usage';
import planChangeRouter from './routes/planChange';
import lifecycleRouter from './routes/lifecycle';
import invoicesRouter from './routes/invoices';
import digestRouter from './routes/digest';

const app = express();

// ── Security middleware ──────────────────────────────────────────────────────
app.use(helmet());
app.use(cors({ origin: 'http://localhost:5173', credentials: true }));
app.use(
  rateLimit({
    windowMs: 60 * 1000,
    max: 100,
    standardHeaders: true,
    legacyHeaders: false,
  })
);
app.use(express.json({ limit: '1mb' }));

// ── API routes ───────────────────────────────────────────────────────────────
app.use('/api', metaRouter);
app.use('/api', bookRouter);
app.use('/api', usageRouter);
app.use('/api', planChangeRouter);
app.use('/api', lifecycleRouter);
app.use('/api', invoicesRouter);
app.use('/api', digestRouter);

// ── Static SPA (production) ──────────────────────────────────────────────────
const webDist = path.resolve(__dirname, '../../web/dist');
app.use(express.static(webDist));
app.get('*', (_req: Request, res: Response) => {
  res.sendFile(path.join(webDist, 'index.html'));
});

// ── Global error handler ─────────────────────────────────────────────────────
app.use((err: Error & { statusCode?: number; code?: string }, _req: Request, res: Response, _next: NextFunction) => {
  const statusCode = err.statusCode ?? 500;
  console.error(`[ERROR] ${err.code ?? 'INTERNAL'}: ${err.message}`);
  res.status(statusCode).json({
    status: 'invalid',
    error: err.message,
    code: err.code ?? 'INTERNAL_ERROR',
  });
});

// ── TTL sweep (runs every 5 minutes) ────────────────────────────────────────
setInterval(() => {
  const sessions = sessionStore.sweep(config.session.ttlMinutes);
  const txns = transactionStore.sweep(config.session.ttlMinutes);
  if (sessions > 0 || txns > 0) {
    console.log(`[sweep] Removed ${sessions} sessions, ${txns} transactions`);
  }
}, 5 * 60 * 1000);

// ── Boot sequence ─────────────────────────────────────────────────────────────
async function boot(): Promise<void> {
  // Phase 1 will wire up Maxio + Slack health checks here.
  // For Phase 0, we mark Slack as unchecked and products as empty.
  setSlackHealthy(false);
  setCachedProducts([]);

  app.listen(config.port, () => {
    console.log(`[MeterMate] Server listening on http://localhost:${config.port}`);
    console.log(`[MeterMate] Maxio site: ${config.maxio.siteSubdomain} (${config.maxio.environment})`);
    console.log(`[MeterMate] Demo mode: ${config.demoMode}`);
  });
}

boot().catch((err: Error) => {
  console.error('[FATAL] Boot failed:', err.message);
  process.exit(1);
});

export { app };
