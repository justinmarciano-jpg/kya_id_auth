import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { Server } from 'node:http';
import { createApp } from '../app.js';

const DATABASE_URL =
  process.env.TEST_DATABASE_URL || 'postgres://kya:kya_dev@localhost:5432/kya_id_auth_test';

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

beforeAll(async () => {
  const app = createApp({ port: 0, databaseUrl: DATABASE_URL });
  const result = await app.start();
  server = result.server;
  port = result.port;
  shutdown = app.shutdown;

  // Clean tables for a fresh test run
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
  it('POST /v1/agents/register creates an agent and returns JWT', async () => {
    const { status, json } = await api('POST', '/v1/agents/register', {
      agent_name: 'test-agent',
      creator_identity: 'test@example.com',
      model_version: 'claude-sonnet-4',
      capabilities: ['read:notion', 'write:slack'],
      prohibited: ['write:database'],
      metadata: { environment: 'test' },
    });

    expect(status).toBe(201);
    expect(json.agent_id).toMatch(/^agt_[a-f0-9]{8}$/);
    expect(json.token).toBeDefined();
    // JWT has 3 dot-separated parts
    expect(json.token.split('.').length).toBe(3);
    expect(json.agent_name).toBe('test-agent');
    expect(json.created_at).toBeDefined();
  });

  it('JWT contains correct claims', async () => {
    const { json } = await api('POST', '/v1/agents/register', {
      agent_name: 'claims-agent',
      creator_identity: 'claims@example.com',
      model_version: 'gpt-4o',
      capabilities: ['read:files'],
      prohibited: ['write:database'],
      metadata: { env: 'test' },
    });

    // Decode the JWT payload (middle part)
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

  it('rejects invalid body', async () => {
    const { status, json } = await api('POST', '/v1/agents/register', {
      agent_name: 'x',
    });

    expect(status).toBe(400);
    expect(json.error).toBe('Validation failed');
    expect(json.details.length).toBeGreaterThan(0);
  });

  it('rejects empty body', async () => {
    const { status, json } = await api('POST', '/v1/agents/register', {});

    expect(status).toBe(400);
    expect(json.details.length).toBeGreaterThan(0);
  });
});

describe('Agent Lookup', () => {
  let agentId: string;
  let token: string;

  beforeAll(async () => {
    const { json } = await api('POST', '/v1/agents/register', {
      agent_name: 'lookup-agent',
      creator_identity: 'lookup@example.com',
      model_version: 'gpt-4o',
      capabilities: ['read:email'],
      prohibited: ['write:database'],
    });
    agentId = json.agent_id;
    token = json.token;
  });

  it('GET /v1/agents/:id returns agent profile', async () => {
    const { status, json } = await api('GET', `/v1/agents/${agentId}`, undefined, {
      Authorization: `Bearer ${token}`,
    });

    expect(status).toBe(200);
    expect(json.agent_id).toBe(agentId);
    expect(json.agent_name).toBe('lookup-agent');
    expect(json.capabilities).toEqual(['read:email']);
    expect(json.prohibited).toEqual(['write:database']);
    expect(json.revoked_at).toBeNull();
    // Should not expose token
    expect(json.token).toBeUndefined();
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

  it('returns 404 for nonexistent agent', async () => {
    const { status } = await api('GET', '/v1/agents/agt_00000000', undefined, {
      Authorization: `Bearer ${token}`,
    });
    expect(status).toBe(404);
  });

  it('returns 400 for invalid agent_id format', async () => {
    const { status } = await api('GET', '/v1/agents/bad_id', undefined, {
      Authorization: `Bearer ${token}`,
    });
    expect(status).toBe(400);
  });
});

describe('Audit Logs', () => {
  let agentId: string;
  let token: string;

  beforeAll(async () => {
    const { json } = await api('POST', '/v1/agents/register', {
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
    // Submit another log
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

    // Check log entries
    const blocked = json.logs.find((l: any) => l.status === 'blocked');
    expect(blocked).toBeDefined();
    expect(blocked.action).toBe('write:database');
    expect(blocked.within_scope).toBe(false);
  });

  it('GET /v1/agents/:id/logs rejects wrong token', async () => {
    // Register a different agent
    const { json: other } = await api('POST', '/v1/agents/register', {
      agent_name: 'other-agent',
      creator_identity: 'other@example.com',
      model_version: 'gpt-4o',
      capabilities: ['read:files'],
      prohibited: [],
    });

    // Try to read log-agent's logs with other-agent's token
    const { status } = await api(
      'GET',
      `/v1/agents/${agentId}/logs`,
      undefined,
      { Authorization: `Bearer ${other.token}` },
    );
    expect(status).toBe(403);
  });
});
