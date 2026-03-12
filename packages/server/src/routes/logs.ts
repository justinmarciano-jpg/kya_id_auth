import type { Express } from 'express';
import type { Deps, LogRow } from '../types.js';
import { authenticateAgent } from '../auth.js';
import { AGENT_ID_RE, validateLogBody } from '../validation.js';

export function logsRoutes(app: Express, deps: Deps): void {
  const { pool, keys, rateLimit, config } = deps;

  // Submit audit log entry
  app.post('/v1/logs', rateLimit(config.rateLimitGeneral), async (req, res) => {
    try {
      // Authenticate via JWT
      const auth = await authenticateAgent(req, pool, keys.publicJwk);
      if ('error' in auth) {
        res.status(auth.status).json({ error: auth.error });
        return;
      }

      // Validate body
      const errors = validateLogBody(req.body);
      if (errors.length > 0) {
        res.status(400).json({ error: 'Validation failed', details: errors });
        return;
      }

      const { action, timestamp, input_hash, output_hash, within_scope, status } = req.body;

      const result = await pool.query<{ id: string }>(
        `INSERT INTO logs
          (agent_id, action, timestamp, input_hash, output_hash, within_scope, status)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         RETURNING id`,
        [auth.agent.agent_id, action, timestamp, input_hash, output_hash, within_scope, status],
      );

      res.status(201).json({ success: true, log_id: Number(result.rows[0].id) });
    } catch (err) {
      console.error('Log error:', err);
      res.status(500).json({ error: 'Failed to store log' });
    }
  });

  // Retrieve logs for an agent
  app.get('/v1/agents/:id/logs', rateLimit(config.rateLimitGeneral), async (req, res) => {
    try {
      const id = String(req.params.id);
      if (!AGENT_ID_RE.test(id)) {
        res.status(400).json({ error: 'Invalid agent_id format' });
        return;
      }

      // Authenticate via JWT — only the agent itself can view its logs
      const auth = await authenticateAgent(req, pool, keys.publicJwk);
      if ('error' in auth) {
        res.status(auth.status).json({ error: auth.error });
        return;
      }

      // Verify the JWT's sub matches the requested agent
      if (auth.payload.sub !== id) {
        res.status(403).json({ error: 'Token does not match requested agent' });
        return;
      }

      const limit = Math.min(Math.max(parseInt(req.query.limit as string, 10) || 100, 1), 1000);
      const offset = Math.max(parseInt(req.query.offset as string, 10) || 0, 0);

      const countResult = await pool.query<{ total: string }>(
        'SELECT COUNT(*) as total FROM logs WHERE agent_id = $1',
        [id],
      );

      const logsResult = await pool.query<LogRow>(
        'SELECT * FROM logs WHERE agent_id = $1 ORDER BY timestamp DESC LIMIT $2 OFFSET $3',
        [id, limit, offset],
      );

      const logs = logsResult.rows.map((row) => ({
        id: Number(row.id),
        agent_id: row.agent_id,
        action: row.action,
        timestamp: row.timestamp,
        input_hash: row.input_hash,
        output_hash: row.output_hash,
        within_scope: row.within_scope,
        status: row.status,
        server_received_at: row.server_received_at,
      }));

      res.json({
        agent_id: id,
        logs,
        total: Number(countResult.rows[0].total),
        limit,
        offset,
      });
    } catch (err) {
      console.error('Logs fetch error:', err);
      res.status(500).json({ error: 'Failed to fetch logs' });
    }
  });
}
