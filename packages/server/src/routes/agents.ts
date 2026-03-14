import type { Express } from 'express';
import type { Deps, AgentRow } from '../types.js';
import { authenticateAgent } from '../auth.js';
import { AGENT_ID_RE } from '../validation.js';

export function agentRoutes(app: Express, deps: Deps): void {
  const { pool, keys, rateLimit, config } = deps;

  app.get('/v1/agents/:id', rateLimit(config.rateLimitGeneral), async (req, res) => {
    try {
      const id = String(req.params.id);
      if (!AGENT_ID_RE.test(id)) {
        res.status(400).json({ error: 'Invalid agent_id format' });
        return;
      }

      const auth = await authenticateAgent(req, pool, keys.publicJwk);
      if ('error' in auth) {
        res.status(auth.status).json({ error: auth.error });
        return;
      }

      // Self-only: agent can only look up its own profile
      if (auth.payload.sub !== id) {
        res.status(403).json({ error: 'Token does not match requested agent' });
        return;
      }

      res.json({
        agent_id: auth.agent.agent_id,
        agent_name: auth.agent.agent_name,
        creator_identity: auth.agent.creator_identity,
        model_version: auth.agent.model_version,
        capabilities: auth.agent.capabilities,
        prohibited: auth.agent.prohibited,
        metadata: auth.agent.metadata,
        created_at: auth.agent.created_at,
        revoked_at: auth.agent.revoked_at,
      });
    } catch (err) {
      const requestId = (res.locals as { requestId?: string }).requestId;
      console.error('[Agent lookup error]', { requestId, err });
      res.status(500).json({ error: 'Agent lookup failed', ...(requestId && { request_id: requestId }) });
    }
  });

  app.post('/v1/agents/:id/revoke', rateLimit(config.rateLimitGeneral), async (req, res) => {
    try {
      const id = String(req.params.id);
      if (!AGENT_ID_RE.test(id)) {
        res.status(400).json({ error: 'Invalid agent_id format' });
        return;
      }

      // Two auth paths: own JWT or registration secret (admin)
      const adminSecret = req.headers['x-registration-secret'];
      const isAdmin = config.registrationSecret && adminSecret === config.registrationSecret;

      if (!isAdmin) {
        // Must be the agent revoking itself
        const auth = await authenticateAgent(req, pool, keys.publicJwk);
        if ('error' in auth) {
          res.status(auth.status).json({ error: auth.error });
          return;
        }
        if (auth.payload.sub !== id) {
          res.status(403).json({ error: 'Token does not match requested agent' });
          return;
        }
      }

      const result = await pool.query<AgentRow>(
        'UPDATE agents SET revoked_at = now() WHERE agent_id = $1 AND revoked_at IS NULL RETURNING *',
        [id],
      );

      if (result.rows.length === 0) {
        // Check if agent exists at all
        const exists = await pool.query('SELECT agent_id, revoked_at FROM agents WHERE agent_id = $1', [id]);
        if (exists.rows.length === 0) {
          res.status(404).json({ error: 'Agent not found' });
        } else {
          res.status(409).json({ error: 'Agent already revoked' });
        }
        return;
      }

      const agent = result.rows[0];
      res.json({
        agent_id: agent.agent_id,
        revoked_at: agent.revoked_at,
      });
    } catch (err) {
      const requestId = (res.locals as { requestId?: string }).requestId;
      console.error('[Agent revoke error]', { requestId, err });
      res.status(500).json({ error: 'Failed to revoke agent', ...(requestId && { request_id: requestId }) });
    }
  });
}
