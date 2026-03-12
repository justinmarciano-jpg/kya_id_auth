import type { Pool } from 'pg';
import type { JWK } from 'jose';

// ── API Request/Response Types ──────────────────────────────────────────────

export interface RegisterRequest {
  agent_name: string;
  creator_identity: string;
  model_version: string;
  capabilities: string[];
  prohibited: string[];
  metadata?: Record<string, unknown>;
}

export interface RegisterResponse {
  agent_id: string;
  token: string;
  agent_name: string;
  created_at: string;
}

export interface AgentResponse {
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

export interface LogRequest {
  action: string;
  timestamp: string;
  input_hash: string;
  output_hash: string;
  within_scope: boolean;
  status: 'success' | 'blocked' | 'error';
}

export interface LogResponse {
  success: true;
  log_id: number;
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

export interface HealthResponse {
  status: 'ok';
  timestamp: string;
}

export interface ErrorResponse {
  error: string;
  details?: string[];
}

// ── Database Row Types ──────────────────────────────────────────────────────

export interface AgentRow {
  agent_id: string;
  agent_name: string;
  creator_identity: string;
  model_version: string;
  capabilities: string[];
  prohibited: string[];
  token: string;
  metadata: Record<string, unknown>;
  created_at: Date;
  revoked_at: Date | null;
}

// ── JWT Types ───────────────────────────────────────────────────────────────

export interface KyaJwtPayload {
  sub?: string;
  iss?: string;
  agent_name: string;
  creator_identity: string;
  model_version: string;
  capabilities: string[];
  prohibited: string[];
  metadata: Record<string, unknown>;
}

export interface LogRow {
  id: string; // bigint comes as string from pg
  agent_id: string;
  action: string;
  timestamp: Date;
  input_hash: string;
  output_hash: string;
  within_scope: boolean;
  status: string;
  server_received_at: Date;
}

// ── Server Internals ────────────────────────────────────────────────────────

export interface ServerConfig {
  port: number;
  databaseUrl: string;
  issuer: string;
  keyFile: string;
  rateLimitWindowMs: number;
  rateLimitRegister: number;
  rateLimitGeneral: number;
  allowedOrigins: string[] | null;
  trustProxy: boolean;
}

export interface Deps {
  pool: Pool;
  keys: { privateKey: CryptoKey; publicJwk: JWK };
  issuer: string;
  rateLimit: (max: number) => import('express').RequestHandler;
  config: ServerConfig;
}
