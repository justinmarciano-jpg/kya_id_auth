import type { Pool } from 'pg';

const DDL = `
CREATE TABLE IF NOT EXISTS agents (
  agent_id           TEXT        PRIMARY KEY,
  agent_name         TEXT        NOT NULL,
  creator_identity   TEXT        NOT NULL,
  model_version      TEXT        NOT NULL,
  capabilities       JSONB       NOT NULL DEFAULT '[]',
  prohibited         JSONB       NOT NULL DEFAULT '[]',
  token              TEXT        NOT NULL,
  metadata           JSONB       NOT NULL DEFAULT '{}',
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  revoked_at         TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_agents_creator ON agents(creator_identity);

CREATE TABLE IF NOT EXISTS logs (
  id                 BIGSERIAL   PRIMARY KEY,
  agent_id           TEXT        NOT NULL REFERENCES agents(agent_id),
  action             TEXT        NOT NULL,
  timestamp          TIMESTAMPTZ NOT NULL,
  input_hash         TEXT        NOT NULL,
  output_hash        TEXT        NOT NULL,
  within_scope       BOOLEAN     NOT NULL,
  status             TEXT        NOT NULL CHECK (status IN ('success', 'blocked', 'error')),
  server_received_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_logs_agent_id ON logs(agent_id);
CREATE INDEX IF NOT EXISTS idx_logs_agent_timestamp ON logs(agent_id, timestamp DESC);
`;

export async function migrate(pool: Pool): Promise<void> {
  await pool.query(DDL);
  console.log('Database migrations applied.');
}
