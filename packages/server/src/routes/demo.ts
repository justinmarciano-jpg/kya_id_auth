import type { Express } from 'express';
import type { Deps } from '../types.js';
import { verifyToken } from '../auth.js';

type ActionResult = 'allowed' | 'prohibited' | 'denied';

function checkAction(
  payload: { capabilities?: string[]; prohibited?: string[] },
  actionStr: string,
): ActionResult {
  const prohibited = payload.prohibited ?? [];
  const capabilities = payload.capabilities ?? [];
  for (const p of prohibited) if (matchPattern(actionStr, p)) return 'prohibited';
  for (const c of capabilities) if (matchPattern(actionStr, c)) return 'allowed';
  return 'denied';
}

function matchPattern(actionStr: string, pattern: string): boolean {
  if (pattern === actionStr) return true;
  if (pattern.endsWith(':*')) return actionStr.startsWith(pattern.slice(0, -1));
  return false;
}

export function demoRoutes(app: Express, deps: Deps): void {
  const { keys, rateLimit, config } = deps;

  /**
   * Demo endpoint: verify a token and check if an action is allowed.
   * Used by the dashboard to illustrate "try the verifier" without running a separate script.
   * Rate limited; no auth (the token in the body is what we verify).
   */
  app.post(
    '/v1/demo/check-action',
    rateLimit(config.rateLimitGeneral),
    async (req, res) => {
      try {
        const { token, action } = req.body ?? {};
        if (typeof token !== 'string' || token.length === 0) {
          res.status(400).json({ error: 'Missing or invalid token' });
          return;
        }
        if (typeof action !== 'string' || action.length === 0) {
          res.status(400).json({ error: 'Missing or invalid action' });
          return;
        }

        const payload = await verifyToken(token, keys.publicJwk);
        const result = checkAction(payload, action);

        res.json({
          allowed: result === 'allowed',
          result,
          agent_id: payload.sub,
        });
      } catch {
        res.status(403).json({ error: 'Invalid or expired token', allowed: false, result: 'denied' });
      }
    },
  );
}
