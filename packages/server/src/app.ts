import express from 'express';
import type { Server } from 'node:http';
import { loadConfig } from './config.js';
import { createPool } from './db.js';
import { migrate } from './migrate.js';
import { loadOrGenerateKeys } from './keys.js';
import { createRateLimiter } from './rate-limit.js';
import { healthRoutes } from './routes/health.js';
import { registerRoutes } from './routes/register.js';
import { agentRoutes } from './routes/agents.js';
import { logsRoutes } from './routes/logs.js';
import { jwksRoutes } from './routes/jwks.js';
import type { ServerConfig, Deps } from './types.js';

export function createApp(overrides: Partial<ServerConfig> = {}) {
  const config = loadConfig(overrides);
  const pool = createPool(config.databaseUrl);
  const { rateLimit, cleanup: rateLimitCleanup } = createRateLimiter(config.rateLimitWindowMs);

  const app = express();

  if (config.trustProxy) {
    app.set('trust proxy', true);
  }

  // Security headers
  app.use((_req, res, next) => {
    res.removeHeader('X-Powered-By');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
    next();
  });

  // CORS
  app.use((req, res, next) => {
    if (config.allowedOrigins) {
      const origin = req.headers.origin;
      if (origin && config.allowedOrigins.includes(origin)) {
        res.setHeader('Access-Control-Allow-Origin', origin);
        res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
        res.setHeader('Access-Control-Max-Age', '86400');
      }
      if (req.method === 'OPTIONS') {
        res.sendStatus(204);
        return;
      }
    }
    next();
  });

  // Request logging
  app.use((req, res, next) => {
    const start = Date.now();
    res.on('finish', () => {
      console.log(`${req.method} ${req.path} ${res.statusCode} ${Date.now() - start}ms`);
    });
    next();
  });

  app.use(express.json({ limit: '1mb' }));

  // Deps placeholder — keys loaded async in start()
  const deps: Deps = {
    pool,
    keys: null as any, // set in start()
    issuer: config.issuer,
    rateLimit,
    config,
  };

  // Register routes (deps.keys populated before server starts listening)
  healthRoutes(app, deps);
  jwksRoutes(app, deps);
  registerRoutes(app, deps);
  agentRoutes(app, deps);
  logsRoutes(app, deps);

  let server: Server | null = null;

  async function start(): Promise<{ server: Server; port: number }> {
    // Load or generate RSA signing keys
    const keys = await loadOrGenerateKeys(config.keyFile);
    deps.keys = keys;

    await migrate(pool);

    return new Promise((resolve) => {
      server = app.listen(config.port, () => {
        const addr = server!.address();
        const actualPort = typeof addr === 'object' && addr ? addr.port : config.port;
        console.log(`KYA ID Auth server listening on port ${actualPort}`);
        resolve({ server: server!, port: actualPort });
      });
    });
  }

  async function shutdown(signal?: string): Promise<void> {
    if (signal) console.log(`${signal} received — shutting down gracefully …`);
    rateLimitCleanup();
    if (server) await new Promise<void>((resolve) => server!.close(() => resolve()));
    await pool.end();
  }

  return { app, pool, start, shutdown };
}
