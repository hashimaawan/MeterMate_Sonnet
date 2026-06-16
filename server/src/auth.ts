import { Request, Response, NextFunction } from 'express';
import { config } from './config';

export function adminGuard(req: Request, res: Response, next: NextFunction): void {
  const authHeader = req.headers['authorization'];
  if (!authHeader || !authHeader.startsWith('Basic ')) {
    res.status(401).json({ status: 'invalid', error: 'Admin authentication required' });
    return;
  }

  const base64 = authHeader.slice('Basic '.length);
  let decoded: string;
  try {
    decoded = Buffer.from(base64, 'base64').toString('utf8');
  } catch {
    res.status(401).json({ status: 'invalid', error: 'Malformed authorization header' });
    return;
  }

  const colon = decoded.indexOf(':');
  if (colon === -1) {
    res.status(401).json({ status: 'invalid', error: 'Malformed authorization header' });
    return;
  }

  const user = decoded.slice(0, colon);
  const password = decoded.slice(colon + 1);

  if (user !== config.admin.user || password !== config.admin.password) {
    res.status(403).json({ status: 'invalid', error: 'Invalid admin credentials' });
    return;
  }

  next();
}
