import type { Express } from 'express';
import type { Deps } from '../types.js';

export function jwksRoutes(app: Express, deps: Deps): void {
  app.get('/.well-known/jwks.json', (_req, res) => {
    res.json({ keys: [deps.keys.publicJwk] });
  });
}
