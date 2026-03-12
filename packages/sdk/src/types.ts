export interface KYAClientConfig {
  /** Signed JWT from agent registration */
  token: string;
  /** KYA server URL */
  apiUrl: string;
  /** Throw KYABlockedError when an action is blocked. Default: true */
  throwOnBlocked?: boolean;
  /** Auto-log actions to the KYA server. Default: true */
  logToServer?: boolean;
  /** Number of retries for failed log submissions. Default: 2 */
  retries?: number;
  /** Delay between retries in ms. Default: 1000 */
  retryDelayMs?: number;
}

export interface ExecuteResult<T = unknown> {
  allowed: boolean;
  action: string;
  result?: T;
  error?: string;
}

export interface AgentInfo {
  agent_id: string;
  agent_name: string;
  creator_identity: string;
  model_version: string;
  capabilities: string[];
  prohibited: string[];
  metadata: Record<string, unknown>;
  created_at: string;
  revoked_at: string | null;
}

export interface LogEntry {
  id: number;
  agent_id: string;
  action: string;
  timestamp: string;
  input_hash: string;
  output_hash: string;
  within_scope: boolean;
  status: 'success' | 'blocked' | 'error';
  server_received_at: string;
}

export interface LogsListResponse {
  agent_id: string;
  logs: LogEntry[];
  total: number;
  limit: number;
  offset: number;
}
