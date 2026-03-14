import { randomBytes } from 'node:crypto';
import type { Express } from 'express';
import type { Deps } from '../types.js';
import { signAgentToken } from '../auth.js';
import { validateRegisterBody } from '../validation.js';

export function registerRoutes(app: Express, deps: Deps): void {
  const { pool, keys, issuer, rateLimit, config } = deps;

  app.post('/v1/agents/register', rateLimit(config.rateLimitRegister), async (req, res) => {
    try {
      if (config.registrationSecret) {
        const secret = req.headers['x-registration-secret'];
        if (secret !== config.registrationSecret) {
          res.status(401).json({ error: 'Invalid or missing registration secret' });
          return;
        }
      }

      const errors = validateRegisterBody(req.body);
      if (errors.length > 0) {
        res.status(400).json({ error: 'Validation failed', details: errors });
        return;
      }

      const { agent_name, creator_identity, model_version, capabilities, prohibited, metadata } =
        req.body;

      const agent_id = 'agt_' + randomBytes(16).toString('hex');
      const created_at = new Date().toISOString();

      const token = await signAgentToken(
        {
          agent_id,
          agent_name,
          creator_identity,
          model_version,
          capabilities,
          prohibited,
          metadata: metadata ?? {},
        },
        keys.privateKey,
        issuer,
      );

      await pool.query(
        `INSERT INTO agents
          (agent_id, agent_name, creator_identity, model_version,
           capabilities, prohibited, token, metadata, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [
          agent_id,
          agent_name,
          creator_identity,
          model_version,
          JSON.stringify(capabilities),
          JSON.stringify(prohibited),
          token,
          JSON.stringify(metadata ?? {}),
          created_at,
        ],
      );

      res.status(201).json({ agent_id, token, agent_name, created_at });
    } catch (err) {
      console.error('Register error:', err);
      res.status(500).json({ error: 'Registration failed' });
    }
  });
}
