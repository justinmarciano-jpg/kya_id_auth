import { SignJWT, jwtVerify, importJWK } from 'jose';
import type { JWK, JWTPayload } from 'jose';
import type { Request } from 'express';
import type { Pool } from 'pg';
import type { AgentRow, KyaJwtPayload } from './types.js';

export async function signAgentToken(
  payload: {
    agent_id: string;
    agent_name: string;
    creator_identity: string;
    model_version: string;
    capabilities: string[];
    prohibited: string[];
    metadata: Record<string, unknown>;
  },
  privateKey: CryptoKey,
  issuer: string,
): Promise<string> {
  return new SignJWT({
    agent_name: payload.agent_name,
    creator_identity: payload.creator_identity,
    model_version: payload.model_version,
    capabilities: payload.capabilities,
    prohibited: payload.prohibited,
    metadata: payload.metadata,
  })
    .setProtectedHeader({ alg: 'RS256', kid: 'kya-signing-key' })
    .setSubject(payload.agent_id)
    .setIssuer(issuer)
    .setIssuedAt()
    .setExpirationTime('365d')
    .sign(privateKey);
}

export async function verifyToken(
  token: string,
  publicJwk: JWK,
): Promise<KyaJwtPayload & JWTPayload> {
  const publicKey = await importJWK(publicJwk, 'RS256');
  const { payload } = await jwtVerify(token, publicKey, { algorithms: ['RS256'] });
  return payload as KyaJwtPayload & JWTPayload;
}

export function extractToken(req: Request): string | null {
  const auth = req.headers.authorization;
  if (!auth?.startsWith('Bearer ')) return null;
  return auth.slice(7);
}

export async function authenticateAgent(
  req: Request,
  pool: Pool,
  publicJwk: JWK,
): Promise<{ agent: AgentRow; payload: KyaJwtPayload & JWTPayload } | { error: string; status: number }> {
  const token = extractToken(req);
  if (!token) {
    return { error: 'Authorization header required (Bearer <jwt>)', status: 401 };
  }

  let payload: KyaJwtPayload & JWTPayload;
  try {
    payload = await verifyToken(token, publicJwk);
  } catch {
    return { error: 'Invalid or expired token', status: 403 };
  }

  const agentId = payload.sub;
  if (!agentId) {
    return { error: 'Token missing sub claim', status: 403 };
  }

  const result = await pool.query<AgentRow>(
    'SELECT * FROM agents WHERE agent_id = $1',
    [agentId],
  );

  if (result.rows.length === 0) {
    return { error: 'Agent not found', status: 404 };
  }

  const agent = result.rows[0];
  if (agent.revoked_at) {
    return { error: 'Agent revoked', status: 403 };
  }

  return { agent, payload };
}
