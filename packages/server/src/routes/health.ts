import type { Express } from 'express';
import type { Deps } from '../types.js';

export function healthRoutes(app: Express, _deps: Deps): void {
  app.get('/healthz', (_req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
  });
}
