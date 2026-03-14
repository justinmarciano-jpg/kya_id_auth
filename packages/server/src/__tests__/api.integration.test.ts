import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { Server } from 'node:http';
import { createApp } from '../app.js';

const DATABASE_URL =
  process.env.TEST_DATABASE_URL || 'postgres://kya:kya_dev@localhost:5432/kya_id_auth_test';

const REGISTRATION_SECRET = 'test-secret-for-integration';

let server: Server;
let port: number;
let shutdown: (signal?: string) => Promise<void>;

function url(path: string): string {
  return `http://localhost:${port}${path}`;
}

async function api(
  method: string,
  path: string,
  body?: unknown,
  headers: Record<string, string> = {},
) {
  const opts: RequestInit = {
    method,
    headers: { 'Content-Type': 'application/json', ...headers },
  };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(url(path), opts);
  const json = await res.json();
  return { status: res.status, json };
}

/** Register an agent with the correct registration secret. */
async function registerAgent(data: Record<string, unknown>) {
  return api('POST', '/v1/agents/register', data, {
    'X-Registration-Secret': REGISTRATION_SECRET,
  });
}

beforeAll(async () => {
  const app = createApp({
    port: 0,
    databaseUrl: DATABASE_URL,
    registrationSecret: REGISTRATION_SECRET,
  });
  const result = await app.start();
  server = result.server;
  port = result.port;
  shutdown = app.shutdown;

  await app.pool.query('DELETE FROM logs');
  await app.pool.query('DELETE FROM agents');
});

afterAll(async () => {
  await shutdown();
});

describe('Health', () => {
  it('GET /healthz returns ok', async () => {
    const { status, json } = await api('GET', '/healthz');
    expect(status).toBe(200);
    expect(json.status).toBe('ok');
    expect(json.timestamp).toBeDefined();
  });
});

describe('JWKS', () => {
  it('GET /.well-known/jwks.json returns public key', async () => {
    const { status, json } = await api('GET', '/.well-known/jwks.json');
    expect(status).toBe(200);
    expect(json.keys).toBeInstanceOf(Array);
    expect(json.keys.length).toBe(1);
    expect(json.keys[0].kty).toBe('RSA');
    expect(json.keys[0].kid).toBe('kya-signing-key');
    expect(json.keys[0].alg).toBe('RS256');
    expect(json.keys[0].use).toBe('sig');
  });
});

describe('Registration', () => {
  it('rejects registration without secret', async () => {
    const { status, json } = await api('POST', '/v1/agents/register', {
      agent_name: 'no-secret-agent',
      creator_identity: 'test@example.com',
      model_version: 'claude-sonnet-4',
      capabilities: ['read:notion'],
      prohibited: [],
    });
    expect(status).toBe(401);
    expect(json.error).toContain('registration secret');
  });

  it('rejects registration with wrong secret', async () => {
    const { status } = await api('POST', '/v1/agents/register', {
      agent_name: 'wrong-secret-agent',
      creator_identity: 'test@example.com',
      model_version: 'claude-sonnet-4',
      capabilities: ['read:notion'],
      prohibited: [],
    }, { 'X-Registration-Secret': 'wrong-secret' });
    expect(status).toBe(401);
  });

  it('POST /v1/agents/register creates an agent with correct secret', async () => {
    const { status, json } = await registerAgent({
      agent_name: 'test-agent',
      creator_identity: 'test@example.com',
      model_version: 'claude-sonnet-4',
      capabilities: ['read:notion', 'write:slack'],
      prohibited: ['write:database'],
      metadata: { environment: 'test' },
    });

    expect(status).toBe(201);
    expect(json.agent_id).toMatch(/^agt_[a-f0-9]{32}$/);
    expect(json.token).toBeDefined();
    expect(json.token.split('.').length).toBe(3);
    expect(json.agent_name).toBe('test-agent');
    expect(json.created_at).toBeDefined();
  });

  it('JWT contains correct claims', async () => {
    const { json } = await registerAgent({
      agent_name: 'claims-agent',
      creator_identity: 'claims@example.com',
      model_version: 'gpt-4o',
      capabilities: ['read:files'],
      prohibited: ['write:database'],
      metadata: { env: 'test' },
    });

    const payload = JSON.parse(Buffer.from(json.token.split('.')[1], 'base64url').toString());
    expect(payload.sub).toBe(json.agent_id);
    expect(payload.agent_name).toBe('claims-agent');
    expect(payload.creator_identity).toBe('claims@example.com');
    expect(payload.model_version).toBe('gpt-4o');
    expect(payload.capabilities).toEqual(['read:files']);
    expect(payload.prohibited).toEqual(['write:database']);
    expect(payload.iss).toBeDefined();
    expect(payload.exp).toBeDefined();
    expect(payload.iat).toBeDefined();
  });

  it('rejects metadata exceeding 4KB', async () => {
    const { status, json } = await registerAgent({
      agent_name: 'big-metadata-agent',
      creator_identity: 'test@example.com',
      model_version: 'claude-sonnet-4',
      capabilities: ['read:notion'],
      prohibited: [],
      metadata: { big: 'x'.repeat(5000) },
    });
    expect(status).toBe(400);
    expect(json.details).toContain('metadata must not exceed 4KB when serialized');
  });

  it('rejects invalid body', async () => {
    const { status, json } = await registerAgent({ agent_name: 'x' });
    expect(status).toBe(400);
    expect(json.error).toBe('Validation failed');
    expect(json.details.length).toBeGreaterThan(0);
  });

  it('rejects empty body', async () => {
    const { status, json } = await registerAgent({});
    expect(status).toBe(400);
    expect(json.details.length).toBeGreaterThan(0);
  });

  it('rejects capabilities with non-string element', async () => {
    const { status, json } = await registerAgent({
      agent_name: 'cap-nonstring',
      creator_identity: 'test@example.com',
      model_version: 'claude-sonnet-4',
      capabilities: ['read:notion', 123],
      prohibited: [],
    });
    expect(status).toBe(400);
    expect(json.details.some((d: string) => d.includes('capabilities') && d.includes('string'))).toBe(true);
  });

  it('rejects capabilities with empty string element', async () => {
    const { status, json } = await registerAgent({
      agent_name: 'cap-empty',
      creator_identity: 'test@example.com',
      model_version: 'claude-sonnet-4',
      capabilities: ['read:notion', ''],
      prohibited: [],
    });
    expect(status).toBe(400);
    expect(json.details.some((d: string) => d.includes('capabilities') && d.includes('empty'))).toBe(true);
  });

  it('rejects capabilities exceeding max items', async () => {
    const { status, json } = await registerAgent({
      agent_name: 'cap-many',
      creator_identity: 'test@example.com',
      model_version: 'claude-sonnet-4',
      capabilities: Array.from({ length: 201 }, (_, i) => `cap:${i}`),
      prohibited: [],
    });
    expect(status).toBe(400);
    expect(json.details.some((d: string) => d.includes('capabilities') && d.includes('200'))).toBe(true);
  });

  it('rejects prohibited with non-string element', async () => {
    const { status, json } = await registerAgent({
      agent_name: 'prohib-nonstring',
      creator_identity: 'test@example.com',
      model_version: 'claude-sonnet-4',
      capabilities: ['read:notion'],
      prohibited: ['write:db', {}],
    });
    expect(status).toBe(400);
    expect(json.details.some((d: string) => d.includes('prohibited') && d.includes('string'))).toBe(true);
  });
});

describe('Agent Lookup', () => {
  let agentId: string;
  let token: string;

  beforeAll(async () => {
    const { json } = await registerAgent({
      agent_name: 'lookup-agent',
      creator_identity: 'lookup@example.com',
      model_version: 'gpt-4o',
      capabilities: ['read:email'],
      prohibited: ['write:database'],
    });
    agentId = json.agent_id;
    token = json.token;
  });

  it('GET /v1/agents/:id returns own agent profile', async () => {
    const { status, json } = await api('GET', `/v1/agents/${agentId}`, undefined, {
      Authorization: `Bearer ${token}`,
    });

    expect(status).toBe(200);
    expect(json.agent_id).toBe(agentId);
    expect(json.agent_name).toBe('lookup-agent');
    expect(json.capabilities).toEqual(['read:email']);
    expect(json.prohibited).toEqual(['write:database']);
    expect(json.revoked_at).toBeNull();
    expect(json.token).toBeUndefined();
  });

  it('returns 403 when looking up a different agent', async () => {
    const { json: other } = await registerAgent({
      agent_name: 'other-lookup-agent',
      creator_identity: 'other@example.com',
      model_version: 'gpt-4o',
      capabilities: ['read:files'],
      prohibited: [],
    });

    // Try to look up other agent's profile with our token
    const { status } = await api('GET', `/v1/agents/${other.agent_id}`, undefined, {
      Authorization: `Bearer ${token}`,
    });
    expect(status).toBe(403);
  });

  it('returns 401 without auth', async () => {
    const { status } = await api('GET', `/v1/agents/${agentId}`);
    expect(status).toBe(401);
  });

  it('returns 403 with invalid token', async () => {
    const { status } = await api('GET', `/v1/agents/${agentId}`, undefined, {
      Authorization: 'Bearer invalid.jwt.token',
    });
    expect(status).toBe(403);
  });

  it('returns 400 for invalid agent_id format', async () => {
    const { status } = await api('GET', '/v1/agents/bad_id', undefined, {
      Authorization: `Bearer ${token}`,
    });
    expect(status).toBe(400);
  });
});

describe('Agent Revocation', () => {
  it('agent can revoke itself', async () => {
    const { json: reg } = await registerAgent({
      agent_name: 'self-revoke-agent',
      creator_identity: 'revoke@example.com',
      model_version: 'claude-sonnet-4',
      capabilities: ['read:notion'],
      prohibited: [],
    });

    const { status, json } = await api('POST', `/v1/agents/${reg.agent_id}/revoke`, undefined, {
      Authorization: `Bearer ${reg.token}`,
    });

    expect(status).toBe(200);
    expect(json.agent_id).toBe(reg.agent_id);
    expect(json.revoked_at).toBeDefined();

    // Verify the agent can no longer authenticate
    const { status: lookupStatus } = await api('GET', `/v1/agents/${reg.agent_id}`, undefined, {
      Authorization: `Bearer ${reg.token}`,
    });
    expect(lookupStatus).toBe(403);
  });

  it('admin can revoke any agent via registration secret', async () => {
    const { json: reg } = await registerAgent({
      agent_name: 'admin-revoke-agent',
      creator_identity: 'admin@example.com',
      model_version: 'claude-sonnet-4',
      capabilities: ['read:notion'],
      prohibited: [],
    });

    const { status, json } = await api('POST', `/v1/agents/${reg.agent_id}/revoke`, undefined, {
      'X-Registration-Secret': REGISTRATION_SECRET,
    });

    expect(status).toBe(200);
    expect(json.revoked_at).toBeDefined();
  });

  it('returns 409 when revoking already-revoked agent', async () => {
    const { json: reg } = await registerAgent({
      agent_name: 'double-revoke-agent',
      creator_identity: 'double@example.com',
      model_version: 'claude-sonnet-4',
      capabilities: ['read:notion'],
      prohibited: [],
    });

    await api('POST', `/v1/agents/${reg.agent_id}/revoke`, undefined, {
      'X-Registration-Secret': REGISTRATION_SECRET,
    });

    const { status, json } = await api('POST', `/v1/agents/${reg.agent_id}/revoke`, undefined, {
      'X-Registration-Secret': REGISTRATION_SECRET,
    });
    expect(status).toBe(409);
    expect(json.error).toContain('already revoked');
  });

  it('agent cannot revoke a different agent', async () => {
    const { json: agent1 } = await registerAgent({
      agent_name: 'agent-one',
      creator_identity: 'one@example.com',
      model_version: 'claude-sonnet-4',
      capabilities: ['read:notion'],
      prohibited: [],
    });
    const { json: agent2 } = await registerAgent({
      agent_name: 'agent-two',
      creator_identity: 'two@example.com',
      model_version: 'claude-sonnet-4',
      capabilities: ['read:notion'],
      prohibited: [],
    });

    const { status } = await api('POST', `/v1/agents/${agent2.agent_id}/revoke`, undefined, {
      Authorization: `Bearer ${agent1.token}`,
    });
    expect(status).toBe(403);
  });
});

describe('Audit Logs', () => {
  let agentId: string;
  let token: string;

  beforeAll(async () => {
    const { json } = await registerAgent({
      agent_name: 'log-agent',
      creator_identity: 'log@example.com',
      model_version: 'claude-sonnet-4',
      capabilities: ['read:notion'],
      prohibited: ['write:database'],
    });
    agentId = json.agent_id;
    token = json.token;
  });

  it('POST /v1/logs submits a log entry', async () => {
    const { status, json } = await api(
      'POST',
      '/v1/logs',
      {
        action: 'read:notion',
        timestamp: new Date().toISOString(),
        input_hash: 'a'.repeat(64),
        output_hash: 'b'.repeat(64),
        within_scope: true,
        status: 'success',
      },
      { Authorization: `Bearer ${token}` },
    );

    expect(status).toBe(201);
    expect(json.success).toBe(true);
    expect(json.log_id).toBeGreaterThan(0);
  });

  it('POST /v1/logs rejects without auth', async () => {
    const { status } = await api('POST', '/v1/logs', {
      action: 'read:notion',
      timestamp: new Date().toISOString(),
      input_hash: 'a'.repeat(64),
      output_hash: 'b'.repeat(64),
      within_scope: true,
      status: 'success',
    });
    expect(status).toBe(401);
  });

  it('POST /v1/logs rejects invalid body', async () => {
    const { status, json } = await api(
      'POST',
      '/v1/logs',
      { action: 'read:notion' },
      { Authorization: `Bearer ${token}` },
    );
    expect(status).toBe(400);
    expect(json.details.length).toBeGreaterThan(0);
  });

  it('GET /v1/agents/:id/logs retrieves log entries', async () => {
    await api(
      'POST',
      '/v1/logs',
      {
        action: 'write:database',
        timestamp: new Date().toISOString(),
        input_hash: 'c'.repeat(64),
        output_hash: 'd'.repeat(64),
        within_scope: false,
        status: 'blocked',
      },
      { Authorization: `Bearer ${token}` },
    );

    const { status, json } = await api(
      'GET',
      `/v1/agents/${agentId}/logs?limit=10`,
      undefined,
      { Authorization: `Bearer ${token}` },
    );

    expect(status).toBe(200);
    expect(json.agent_id).toBe(agentId);
    expect(json.logs.length).toBe(2);
    expect(json.total).toBe(2);
    expect(json.limit).toBe(10);
    expect(json.offset).toBe(0);

    const blocked = json.logs.find((l: { status: string }) => l.status === 'blocked');
    expect(blocked).toBeDefined();
    expect(blocked.action).toBe('write:database');
    expect(blocked.within_scope).toBe(false);
  });

  it('GET /v1/agents/:id/logs rejects wrong token', async () => {
    const { json: other } = await registerAgent({
      agent_name: 'other-log-agent',
      creator_identity: 'other@example.com',
      model_version: 'gpt-4o',
      capabilities: ['read:files'],
      prohibited: [],
    });

    const { status } = await api(
      'GET',
      `/v1/agents/${agentId}/logs`,
      undefined,
      { Authorization: `Bearer ${other.token}` },
    );
    expect(status).toBe(403);
  });
});

describe('Rate limiting', () => {
  it('returns 429 with Retry-After and request_id when exceeding limit', async () => {
    const { json: reg } = await registerAgent({
      agent_name: 'rate-limit-agent',
      creator_identity: 'ratelimit@example.com',
      model_version: 'claude-sonnet-4',
      capabilities: ['read:notion'],
      prohibited: [],
    });
    const authHeader = { Authorization: `Bearer ${reg.token}` };
    const limit = 60; // rateLimitGeneral default
    for (let i = 0; i < limit; i++) {
      await api('GET', `/v1/agents/${reg.agent_id}`, undefined, authHeader);
    }
    const res = await fetch(url(`/v1/agents/${reg.agent_id}`), {
      headers: { ...authHeader, 'Content-Type': 'application/json' },
    });
    const json = await res.json();
    expect(res.status).toBe(429);
    expect(json.error).toContain('Too many requests');
    expect(res.headers.get('Retry-After')).toBeTruthy();
    expect(json.request_id).toBeDefined();
  });
});

describe('Request ID', () => {
  it('includes X-Request-Id on success response', async () => {
    const res = await fetch(url('/healthz'));
    expect(res.status).toBe(200);
    expect(res.headers.get('X-Request-Id')).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    );
  });
});
