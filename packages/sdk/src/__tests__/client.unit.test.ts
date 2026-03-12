import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { KYAClient, KYABlockedError } from '../client.js';

/**
 * Create a mock JWT that decodeJwt() can parse.
 * No real signature — just base64url-encoded header + payload + dummy sig.
 */
function mockJwt(claims: Record<string, unknown> = {}): string {
  const header = Buffer.from(JSON.stringify({ alg: 'RS256', typ: 'JWT' })).toString('base64url');
  const payload = Buffer.from(
    JSON.stringify({
      sub: 'agt_12345678',
      iss: 'https://kya.dev',
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + 86400,
      agent_name: 'test-agent',
      creator_identity: 'test@example.com',
      model_version: 'claude-sonnet-4',
      capabilities: ['read:notion', 'write:slack', 'search:*'],
      prohibited: ['write:database', 'admin:*'],
      metadata: {},
      ...claims,
    }),
  ).toString('base64url');
  const signature = Buffer.from('mock-signature').toString('base64url');
  return `${header}.${payload}.${signature}`;
}

function makeClient(overrides: Record<string, unknown> = {}) {
  const token = (overrides.token as string) ?? mockJwt(overrides.jwtClaims as Record<string, unknown>);
  return new KYAClient({
    token,
    apiUrl: 'http://localhost:3000',
    logToServer: false,
    ...overrides,
  });
}

describe('KYAClient.isAllowed', () => {
  const kya = makeClient();

  it('allows exact capability match', () => {
    expect(kya.isAllowed('read:notion')).toBe(true);
    expect(kya.isAllowed('write:slack')).toBe(true);
  });

  it('allows wildcard capability match', () => {
    expect(kya.isAllowed('search:docs')).toBe(true);
    expect(kya.isAllowed('search:anything')).toBe(true);
  });

  it('blocks exact prohibited match', () => {
    expect(kya.isAllowed('write:database')).toBe(false);
  });

  it('blocks wildcard prohibited match', () => {
    expect(kya.isAllowed('admin:users')).toBe(false);
    expect(kya.isAllowed('admin:settings')).toBe(false);
  });

  it('denies actions not in capabilities (default deny)', () => {
    expect(kya.isAllowed('delete:users')).toBe(false);
    expect(kya.isAllowed('read:email')).toBe(false);
  });

  it('prohibited takes priority over capabilities', () => {
    const kya2 = makeClient({
      token: mockJwt({
        capabilities: ['write:*'],
        prohibited: ['write:database'],
      }),
    });
    expect(kya2.isAllowed('write:slack')).toBe(true);
    expect(kya2.isAllowed('write:database')).toBe(false);
  });
});

describe('KYAClient.execute', () => {
  it('executes allowed actions and returns result', async () => {
    const kya = makeClient();
    const result = await kya.execute('read:notion', () => ({ data: 'page content' }));

    expect(result.allowed).toBe(true);
    expect(result.action).toBe('read:notion');
    expect(result.result).toEqual({ data: 'page content' });
  });

  it('executes async handlers', async () => {
    const kya = makeClient();
    const result = await kya.execute('write:slack', async () => {
      return { ok: true, ts: '123456' };
    });

    expect(result.allowed).toBe(true);
    expect(result.result).toEqual({ ok: true, ts: '123456' });
  });

  it('throws KYABlockedError for prohibited actions', async () => {
    const kya = makeClient();
    await expect(
      kya.execute('write:database', () => 'should not run'),
    ).rejects.toThrow(KYABlockedError);

    try {
      await kya.execute('write:database', () => 'nope');
    } catch (err) {
      expect(err).toBeInstanceOf(KYABlockedError);
      expect((err as KYABlockedError).action).toBe('write:database');
      expect((err as KYABlockedError).reason).toBe('prohibited');
    }
  });

  it('throws KYABlockedError for undeclared actions', async () => {
    const kya = makeClient();
    try {
      await kya.execute('delete:users', () => 'nope');
    } catch (err) {
      expect(err).toBeInstanceOf(KYABlockedError);
      expect((err as KYABlockedError).reason).toBe('denied');
    }
  });

  it('does not execute handler when blocked', async () => {
    const kya = makeClient();
    const handler = vi.fn(() => 'should not be called');

    await expect(kya.execute('write:database', handler)).rejects.toThrow();
    expect(handler).not.toHaveBeenCalled();
  });

  it('returns error instead of throwing when throwOnBlocked is false', async () => {
    const kya = makeClient({ throwOnBlocked: false });
    const result = await kya.execute('write:database', () => 'nope');

    expect(result.allowed).toBe(false);
    expect(result.action).toBe('write:database');
    expect(result.error).toContain('prohibited');
    expect(result.result).toBeUndefined();
  });

  it('re-throws handler errors for allowed actions', async () => {
    const kya = makeClient();
    await expect(
      kya.execute('read:notion', () => {
        throw new Error('Notion API is down');
      }),
    ).rejects.toThrow('Notion API is down');
  });
});

describe('KYAClient.verify', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('calls verify endpoint and returns agent info', async () => {
    const mockAgent = {
      agent_id: 'agt_12345678',
      agent_name: 'test-agent',
      creator_identity: 'test@example.com',
      model_version: 'claude-sonnet-4',
      capabilities: ['read:notion'],
      prohibited: [],
      metadata: {},
      created_at: '2026-01-01T00:00:00Z',
      revoked_at: null,
    };

    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(mockAgent),
      }),
    );

    const kya = makeClient();
    const info = await kya.verify();
    expect(info.agent_id).toBe('agt_12345678');
    expect(info.agent_name).toBe('test-agent');

    expect(fetch).toHaveBeenCalledWith('http://localhost:3000/v1/agents/agt_12345678', {
      headers: { Authorization: expect.stringContaining('Bearer ey') },
    });
  });

  it('throws on verification failure', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 403,
        json: () => Promise.resolve({ error: 'Invalid token' }),
      }),
    );

    const kya = makeClient();
    await expect(kya.verify()).rejects.toThrow('Verification failed (403)');
  });
});

describe('KYAClient.getLogs', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('fetches logs with pagination', async () => {
    const mockResponse = {
      agent_id: 'agt_12345678',
      logs: [{ id: 1, action: 'read:notion', status: 'success' }],
      total: 1,
      limit: 50,
      offset: 0,
    };

    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(mockResponse),
      }),
    );

    const kya = makeClient();
    const result = await kya.getLogs({ limit: 50, offset: 0 });
    expect(result.logs).toHaveLength(1);
    expect(result.total).toBe(1);

    expect(fetch).toHaveBeenCalledWith(
      'http://localhost:3000/v1/agents/agt_12345678/logs?limit=50&offset=0',
      { headers: { Authorization: expect.stringContaining('Bearer ey') } },
    );
  });
});

describe('KYAClient logging', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('sends log entries to the server when logToServer is true', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve({}) });
    vi.stubGlobal('fetch', fetchMock);

    const kya = makeClient({ logToServer: true });
    await kya.execute('read:notion', () => ({ page: 'data' }));

    // Give the async flush a moment
    await new Promise((r) => setTimeout(r, 50));

    // Should have called POST /v1/logs
    const logCall = fetchMock.mock.calls.find(
      (call: any[]) => typeof call[0] === 'string' && call[0].includes('/v1/logs'),
    );
    expect(logCall).toBeDefined();

    const body = JSON.parse(logCall![1].body);
    expect(body.action).toBe('read:notion');
    expect(body.status).toBe('success');
    expect(body.within_scope).toBe(true);
    expect(body.input_hash).toMatch(/^[a-f0-9]{64}$/);
    expect(body.output_hash).toMatch(/^[a-f0-9]{64}$/);

    await kya.destroy();
  });
});

describe('KYAClient JWT decoding', () => {
  it('extracts agent_id from JWT sub claim', () => {
    const kya = makeClient();
    expect(kya.id).toBe('agt_12345678');
  });

  it('extracts capabilities and prohibited from JWT', () => {
    const kya = makeClient();
    expect(kya.isAllowed('read:notion')).toBe(true);
    expect(kya.isAllowed('write:database')).toBe(false);
  });

  it('works with custom claims in JWT', () => {
    const token = mockJwt({
      sub: 'agt_custom01',
      capabilities: ['admin:*'],
      prohibited: [],
    });
    const kya = makeClient({ token });
    expect(kya.id).toBe('agt_custom01');
    expect(kya.isAllowed('admin:anything')).toBe(true);
  });
});
