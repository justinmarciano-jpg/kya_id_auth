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

      // Authenticate via JWT
      const auth = await authenticateAgent(req, pool, keys.publicJwk);
      if ('error' in auth) {
        res.status(auth.status).json({ error: auth.error });
        return;
      }

      // Fetch the requested agent (any authenticated agent can look up any other)
      const result = await pool.query<AgentRow>(
        'SELECT * FROM agents WHERE agent_id = $1',
        [id],
      );

      if (result.rows.length === 0) {
        res.status(404).json({ error: 'Agent not found' });
        return;
      }

      const agent = result.rows[0];

      res.json({
        agent_id: agent.agent_id,
        agent_name: agent.agent_name,
        creator_identity: agent.creator_identity,
        model_version: agent.model_version,
        capabilities: agent.capabilities,
        prohibited: agent.prohibited,
        metadata: agent.metadata,
        created_at: agent.created_at,
        revoked_at: agent.revoked_at,
      });
    } catch (err) {
      console.error('Agent lookup error:', err);
      res.status(500).json({ error: 'Agent lookup failed' });
    }
  });
}
