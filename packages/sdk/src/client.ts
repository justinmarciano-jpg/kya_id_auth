import { createHash } from 'node:crypto';
import { decodeJwt } from 'jose';
import type {
  KYAClientConfig,
  ExecuteResult,
  AgentInfo,
  LogsListResponse,
  DecodedKyaToken,
} from './types.js';

export class KYABlockedError extends Error {
  public readonly action: string;
  public readonly reason: 'prohibited' | 'denied';

  constructor(action: string, reason: 'prohibited' | 'denied') {
    const msg =
      reason === 'prohibited'
        ? `Action '${action}' is prohibited by agent capabilities`
        : `Action '${action}' is not in declared capabilities (denied by default)`;
    super(msg);
    this.name = 'KYABlockedError';
    this.action = action;
    this.reason = reason;
  }
}

interface PendingLog {
  action: string;
  timestamp: string;
  input_hash: string;
  output_hash: string;
  within_scope: boolean;
  status: 'success' | 'blocked' | 'error';
  retries: number;
}

export class KYAClient {
  private readonly token: string;
  private readonly agentId: string;
  private readonly apiUrl: string;
  private readonly capabilities: string[];
  private readonly prohibited: string[];
  private readonly throwOnBlocked: boolean;
  private readonly logToServer: boolean;
  private readonly maxRetries: number;
  private readonly retryDelayMs: number;
  private readonly queue: PendingLog[] = [];
  private flushing = false;
  private flushTimer: ReturnType<typeof setInterval> | null = null;

  constructor(config: KYAClientConfig) {
    this.token = config.token;
    this.apiUrl = config.apiUrl.replace(/\/$/, '');
    this.throwOnBlocked = config.throwOnBlocked ?? true;
    this.logToServer = config.logToServer ?? true;
    this.maxRetries = config.retries ?? 2;
    this.retryDelayMs = config.retryDelayMs ?? 1000;

    // Decode JWT locally to extract agent identity and permissions (no signature verify here)
    const payload = decodeJwt(this.token) as DecodedKyaToken;
    this.agentId = payload.sub ?? '';
    this.capabilities = Array.isArray(payload.capabilities) ? payload.capabilities : [];
    this.prohibited = Array.isArray(payload.prohibited) ? payload.prohibited : [];

    if (this.logToServer) {
      this.flushTimer = setInterval(() => this.flush(), 30_000);
      this.flushTimer.unref();
    }
  }

  /** The agent_id extracted from the JWT sub claim. */
  get id(): string {
    return this.agentId;
  }

  /**
   * Execute an action with capability enforcement.
   * Prohibited actions and non-declared actions are blocked.
   * The handler is only called if the action is allowed.
   */
  async execute<T>(action: string, handler: () => T | Promise<T>): Promise<ExecuteResult<T>> {
    const check = this.checkAction(action);

    if (check !== 'allowed') {
      this.enqueueLog(action, '{}', '{}', false, 'blocked');
      if (this.throwOnBlocked) {
        throw new KYABlockedError(action, check);
      }
      return { allowed: false, action, error: new KYABlockedError(action, check).message };
    }

    try {
      const result = await handler();
      const outputStr = safeStringify(result);
      this.enqueueLog(action, '{}', outputStr, true, 'success');
      return { allowed: true, action, result };
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      this.enqueueLog(action, '{}', safeStringify({ error: errMsg }), true, 'error');
      throw err;
    }
  }

  /** Check if an action would be allowed without executing it. */
  isAllowed(action: string): boolean {
    return this.checkAction(action) === 'allowed';
  }

  /** Verify this agent's identity with the server. */
  async verify(): Promise<AgentInfo> {
    const res = await fetch(`${this.apiUrl}/v1/agents/${this.agentId}`, {
      headers: { Authorization: `Bearer ${this.token}` },
    });
    if (!res.ok) {
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      throw new Error(`Verification failed (${res.status}): ${body.error ?? 'Unknown'}`);
    }
    return res.json() as Promise<AgentInfo>;
  }

  /** Retrieve audit logs for this agent. */
  async getLogs(options?: { limit?: number; offset?: number }): Promise<LogsListResponse> {
    const params = new URLSearchParams();
    if (options?.limit != null) params.set('limit', String(options.limit));
    if (options?.offset != null) params.set('offset', String(options.offset));

    const qs = params.toString();
    const res = await fetch(
      `${this.apiUrl}/v1/agents/${this.agentId}/logs${qs ? '?' + qs : ''}`,
      { headers: { Authorization: `Bearer ${this.token}` } },
    );
    if (!res.ok) {
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      throw new Error(`Failed to fetch logs (${res.status}): ${body.error ?? 'Unknown'}`);
    }
    return res.json() as Promise<LogsListResponse>;
  }

  /** Flush pending log entries and clean up. */
  async destroy(): Promise<void> {
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
      this.flushTimer = null;
    }
    await this.flush();
  }

  // ── Private ───────────────────────────────────────────────────────────────

  private checkAction(action: string): 'allowed' | 'prohibited' | 'denied' {
    for (const pattern of this.prohibited) {
      if (matchPattern(action, pattern)) return 'prohibited';
    }
    for (const pattern of this.capabilities) {
      if (matchPattern(action, pattern)) return 'allowed';
    }
    return 'denied';
  }

  private enqueueLog(
    action: string,
    inputStr: string,
    outputStr: string,
    withinScope: boolean,
    status: 'success' | 'blocked' | 'error',
  ): void {
    if (!this.logToServer) return;

    this.queue.push({
      action,
      timestamp: new Date().toISOString(),
      input_hash: sha256(inputStr),
      output_hash: sha256(outputStr),
      within_scope: withinScope,
      status,
      retries: 0,
    });

    // Trigger async flush
    void this.flush();
  }

  private async flush(): Promise<void> {
    if (this.flushing || this.queue.length === 0) return;
    this.flushing = true;

    while (this.queue.length > 0) {
      const entry = this.queue[0];
      try {
        const res = await fetch(`${this.apiUrl}/v1/logs`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${this.token}`,
          },
          body: JSON.stringify({
            action: entry.action,
            timestamp: entry.timestamp,
            input_hash: entry.input_hash,
            output_hash: entry.output_hash,
            within_scope: entry.within_scope,
            status: entry.status,
          }),
        });

        if (res.ok) {
          this.queue.shift();
        } else {
          entry.retries++;
          if (entry.retries > this.maxRetries) {
            this.queue.shift();
          } else {
            await sleep(this.retryDelayMs * entry.retries);
          }
        }
      } catch {
        entry.retries++;
        if (entry.retries > this.maxRetries) {
          this.queue.shift();
        } else {
          break;
        }
      }
    }

    this.flushing = false;
  }
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function matchPattern(action: string, pattern: string): boolean {
  if (pattern === action) return true;
  if (pattern.endsWith(':*')) {
    const prefix = pattern.slice(0, -1);
    return action.startsWith(prefix);
  }
  return false;
}

function sha256(input: string): string {
  return createHash('sha256').update(input).digest('hex');
}

function safeStringify(val: unknown): string {
  try {
    return JSON.stringify(val);
  } catch {
    return '{}';
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
