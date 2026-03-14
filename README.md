# KYA ID Auth

Identity and permission system for autonomous AI agents. Like OAuth for AI — agents register, receive signed JWTs containing their capabilities, and platforms verify credentials via standard JWKS without KYA-specific code.

## How It Works

1. **Agent registers** with the KYA server and receives a signed JWT
2. **JWT contains** agent identity, capabilities, and prohibited actions
3. **Platforms verify** the JWT using the standard `/.well-known/jwks.json` endpoint
4. **SDK enforces** permissions locally — blocked actions never execute

```
┌─────────┐     register      ┌────────────┐
│  Agent   │ ───────────────→ │ KYA Server │
│          │ ←─────────────── │            │
│          │    signed JWT     │  (RS256)   │
└─────────┘                   └────────────┘
     │                              │
     │  Authorization: Bearer <jwt> │  /.well-known/jwks.json
     ▼                              ▼
┌──────────────────────────────────────────┐
│              Platform / Tool             │
│  Decodes JWT → reads capabilities →      │
│  verifies signature against JWKS         │
└──────────────────────────────────────────┘
```

## Quick Start

```bash
# Start Postgres
npm run db:up

# Install dependencies
npm install

# Start the server (auto-migrates DB)
npm run dev

# Server runs at http://localhost:3000
```

## Testing in practice

To see the full flow (register → verify token → allow/deny an action):

**Option A — With Node/npm:**  
With the server running (`npm run dev`), in another terminal:
```bash
cd examples && npm install && bash test-flow.sh
```

**Option B — Docker only (no Node/npm on your machine):**
```bash
docker compose up -d
docker compose -f docker-compose.yml -f examples/docker-compose.test.yml run --rm test-flow
```

Both register an agent, then run a **minimal verifier** (the “MCP/tool layer” you’d build) that fetches JWKS, verifies the JWT, and checks capabilities. You’ll see allowed vs denied for different actions.

See [examples/README.md](examples/README.md) for troubleshooting (`command not found: npm`), manual verifier usage, and SDK usage from the agent side.

## JWT Structure

Every registered agent receives a JWT with these claims:

```json
{
  "sub": "agt_3f73b8da",
  "iss": "https://kya.dev",
  "iat": 1710000000,
  "exp": 1741536000,
  "agent_name": "notion-sync-agent",
  "creator_identity": "engineering@company.com",
  "model_version": "claude-sonnet-4",
  "capabilities": ["read:notion", "write:slack"],
  "prohibited": ["write:database"],
  "metadata": { "environment": "production" }
}
```

Platforms read `capabilities` and `prohibited` directly from the token. No server call required.

**Important for platforms:** For any untrusted or third-party token, **verify the JWT signature** using the server’s public key from `GET /.well-known/jwks.json` (e.g. with `jose` or your JWKS client). The SDK decodes the token locally for performance; server-side verification ensures the token was issued by this KYA server and has not been tampered with.

## API Endpoints

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `POST` | `/v1/agents/register` | None | Register agent, returns signed JWT |
| `GET` | `/v1/agents/:id` | Bearer JWT | Get agent profile |
| `POST` | `/v1/logs` | Bearer JWT | Submit audit log entry |
| `GET` | `/v1/agents/:id/logs` | Bearer JWT | Retrieve logs (paginated) |
| `GET` | `/.well-known/jwks.json` | None | Public key for JWT verification |
| `GET` | `/healthz` | None | Health check |

### Rate limits and errors

- **Registration:** `KYA_RATE_REGISTER` requests per window (default 10).
- **All other v1 endpoints:** `KYA_RATE_GENERAL` per window (default 60).
- Window is 1 minute (sliding). When exceeded, the server returns **429 Too Many Requests** with:
  - `Retry-After` header (seconds until the window resets).
  - `X-Request-Id` and `request_id` in the JSON body for support/debugging.
- All responses include **X-Request-Id** for tracing; 5xx bodies include `request_id` when available.

### Register an Agent

```bash
curl -X POST http://localhost:3000/v1/agents/register \
  -H "Content-Type: application/json" \
  -d '{
    "agent_name": "my-agent",
    "creator_identity": "dev@company.com",
    "model_version": "claude-sonnet-4",
    "capabilities": ["read:notion", "write:slack"],
    "prohibited": ["write:database"],
    "metadata": {}
  }'
```

Response:
```json
{
  "agent_id": "agt_3f73b8da",
  "token": "eyJhbGciOiJSUzI1NiIs...",
  "agent_name": "my-agent",
  "created_at": "2026-03-11T00:00:00.000Z"
}
```

## SDK

The SDK decodes the JWT locally — just pass `token` and `apiUrl`:

```typescript
import { KYAClient } from '@kya/sdk';

const kya = new KYAClient({
  token: process.env.KYA_TOKEN,
  apiUrl: 'http://localhost:3000',
});

// agent_id, capabilities, prohibited all come from the JWT
console.log(kya.id); // "agt_3f73b8da"

// Execute with enforcement — blocked actions never run
const result = await kya.execute('read:notion', async () => {
  return await notion.pages.retrieve({ page_id: '...' });
});

// Check permissions without executing
if (kya.isAllowed('write:slack')) {
  // safe to proceed
}

// Verify identity with server
const info = await kya.verify();

// Retrieve audit logs
const { logs, total } = await kya.getLogs({ limit: 50 });
```

### Permission Model

- **Prohibited** actions are always blocked (highest priority)
- **Capabilities** define what's allowed (wildcard patterns like `read:*`)
- Everything else is **denied by default**

```typescript
// "write:*" capability + "write:database" prohibited
kya.isAllowed('write:slack');     // true  — matches write:*
kya.isAllowed('write:database');  // false — prohibited overrides
kya.isAllowed('admin:users');     // false — default deny
```

## CLI

```bash
# Initialize a .kya.yaml manifest
kya init

# Register with the server
kya register [-s http://localhost:3000]

# Verify agent status
kya verify

# View audit logs
kya logs [-l 20]
```

## Project Structure

```
packages/
  server/   Express + Postgres API (JWT signing, JWKS, audit logs)
  sdk/      TypeScript client (local JWT decode, capability enforcement)
  cli/      Command-line tool (register, verify, logs)
```

## Environment Variables

```bash
PORT=3000
DATABASE_URL=postgres://kya:kya_dev@localhost:5432/kya_id_auth
KYA_RATE_REGISTER=10        # Rate limit for registration (per IP per window)
KYA_RATE_GENERAL=60         # Rate limit for other v1 endpoints (per IP per window)
KYA_TRUST_PROXY=false       # Trust X-Forwarded-* headers (set true behind a reverse proxy)
# KYA_ALLOWED_ORIGINS=...   # CORS origins (optional)
# KYA_REGISTRATION_SECRET=  # When set, registration requires X-Registration-Secret header
```

## Docker

Run Postgres and the server with Docker Compose (production-like):

```bash
docker compose up -d
# Server: http://localhost:3000 — waits for Postgres to be healthy, then runs migrations
```

Build the server image only:

```bash
docker build -t kya-id-auth-server .
docker run --rm -e DATABASE_URL=postgres://kya:kya_dev@host.docker.internal:5432/kya_id_auth -p 3000:3000 kya-id-auth-server
```

For persistent signing keys, mount a directory or set `KYA_KEY_FILE` to a path that the container can read/write (keys are generated on first run if the file is missing).

## Development

```bash
npm run dev          # Start server with auto-reload
npm run build        # Build all packages
npm test             # Run all tests
npm run db:up        # Start Postgres
npm run db:down      # Stop Postgres
```
