import { Router, Request, Response } from 'express';
import { config } from '../config';
import { sessionStore } from '../stores/sessionStore';
import { transactionStore } from '../stores/transactionStore';

const router = Router();

let cachedProducts: Array<{ handle: string; name: string; price: number; interval: string }> = [];
let slackHealthy = false;

export function setCachedProducts(
  products: Array<{ handle: string; name: string; price: number; interval: string }>
): void {
  cachedProducts = products;
}

export function setSlackHealthy(ok: boolean): void {
  slackHealthy = ok;
}

router.get('/health', (_req: Request, res: Response) => {
  res.json({
    status: 'ok',
    sessions: sessionStore.size(),
    transactions: transactionStore.size(),
    maxioSite: config.maxio.siteSubdomain,
    slackOk: slackHealthy,
  });
});

router.get('/products', (_req: Request, res: Response) => {
  res.json({ status: 'ok', products: cachedProducts });
});

router.get('/consultants', (_req: Request, res: Response) => {
  res.json({ status: 'ok', consultants: config.consultants });
});

export default router;
