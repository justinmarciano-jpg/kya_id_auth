# Testing KYA ID Auth in practice

These examples show how to **run the full flow** and **simulate the MCP/tool layer** that verifies agent JWTs.

## No Node/npm on your machine?

Use **Docker only** (see [Docker-only test flow](#docker-only-test-flow) below). Otherwise install Node.js (includes npm): [nodejs.org](https://nodejs.org) or a version manager like [nvm](https://github.com/nvm-sh/nvm) / [fnm](https://github.com/Schniz/fnm), then open a new terminal so `node` and `npm` are in your PATH.

## Prerequisites (non-Docker)

- KYA server running: from repo root, `npm run db:up` then `npm run dev`
- If the server uses `KYA_REGISTRATION_SECRET`, set that env when registering (see below)

## 1. Install example deps

```bash
cd examples && npm install
```

## 2. One-shot test flow (register + verifier)

From the `examples/` directory:

```bash
bash test-flow.sh
# or: chmod +x test-flow.sh && ./test-flow.sh
```

This will:

1. Register an agent with capabilities `read:notion`, `write:slack` and prohibited `write:database`
2. Run the verifier for `read:notion` → **allowed**
3. Run the verifier for `read:email` → **denied** (not in capabilities)
4. Run the verifier for `write:database` → **denied** (prohibited)
5. Run the verifier for `write:slack` → **allowed**

If the server requires a registration secret:

```bash
KYA_REGISTRATION_SECRET=your-secret ./test-flow.sh
```

## 3. Manual verifier (your “MCP layer”)

The verifier is the minimal code **you** would add in front of MCPs/tools: fetch JWKS, verify the JWT, then allow/deny based on capabilities.

```bash
# Get a token first (e.g. from curl or test-flow.sh output)
export KYA_TOKEN="eyJhbGciOiJSUzI1NiIs..."

# Check an action (allowed)
KYA_SERVER_URL=http://localhost:3000 node verifier.mjs read:notion

# Check an action (denied)
KYA_SERVER_URL=http://localhost:3000 node verifier.mjs write:database
```

Exit code: `0` = allowed, `1` = denied, `2` = verification error (invalid/expired token).

## 4. Using the SDK in the agent

From your **agent** side (e.g. a Node script or service), use the SDK so the agent only calls tools it’s allowed to use:

```bash
cd ../packages/sdk && npm install
```

```javascript
import { KYAClient } from '@kya-id/sdk'; // or from relative path

const kya = new KYAClient({
  token: process.env.KYA_TOKEN,
  apiUrl: 'http://localhost:3000',
  logToServer: true,
});

// Only runs if allowed
const result = await kya.execute('read:notion', async () => {
  return await callNotionMCP();
});

// Or check first
if (kya.isAllowed('write:slack')) {
  await postToSlack(...);
}
```

In practice: the **agent** uses the SDK (or sends the JWT to your backend). Your **gateway** (or the verifier logic) uses the same rules as `verifier.mjs` to allow or deny each MCP/tool call.

---

## Docker-only test flow

If you don’t have Node/npm installed, you can run everything with Docker:

**1. From the repo root, start Postgres and the KYA server:**

```bash
docker compose up -d
```

**2. Run the test flow in a one-off container (Node runs inside the container):**

```bash
docker compose -f docker-compose.yml -f examples/docker-compose.test.yml run --rm test-flow
```

This registers an agent and runs the verifier for allowed/denied actions. You only need `docker` and `docker compose` on your machine.
