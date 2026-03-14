#!/usr/bin/env bash
# End-to-end test: register an agent, then verify allowed vs denied actions.
# Prerequisites: KYA server running (npm run dev), optional KYA_REGISTRATION_SECRET set on server.

set -e
KYA_URL="${KYA_SERVER_URL:-http://localhost:3000}"
REG_SECRET="${KYA_REGISTRATION_SECRET:-}"

if ! command -v node >/dev/null 2>&1; then
  echo "Error: 'node' not found. Install Node.js (https://nodejs.org) or use Docker: docker compose -f docker-compose.yml -f examples/docker-compose.test.yml run --rm test-flow"
  exit 1
fi

echo "=== 1. Register an agent ==="
REG_HEADERS=(-H "Content-Type: application/json")
if [ -n "$REG_SECRET" ]; then REG_HEADERS+=(-H "X-Registration-Secret: $REG_SECRET"); fi

REG_RESP=$(curl -s -X POST "$KYA_URL/v1/agents/register" "${REG_HEADERS[@]}" -d '{
  "agent_name": "test-agent",
  "creator_identity": "you@example.com",
  "model_version": "claude-sonnet-4",
  "capabilities": ["read:notion", "write:slack"],
  "prohibited": ["write:database"],
  "metadata": {}
}')

if ! echo "$REG_RESP" | grep -q '"token"'; then
  echo "Registration failed. Is the server running? Response: $REG_RESP"
  exit 1
fi

# Extract token and agent_id (works without node: grep/sed)
TOKEN=$(echo "$REG_RESP" | sed -n 's/.*"token"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p')
AGENT_ID=$(echo "$REG_RESP" | sed -n 's/.*"agent_id"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p')
echo "Registered agent: $AGENT_ID"
echo ""

echo "=== 2. Verifier (your MCP/tool layer): check allowed action ==="
KYA_SERVER_URL="$KYA_URL" KYA_TOKEN="$TOKEN" node verifier.mjs read:notion
echo ""

echo "=== 3. Verifier: check denied action (not in capabilities) ==="
KYA_SERVER_URL="$KYA_URL" KYA_TOKEN="$TOKEN" node verifier.mjs read:email || true
echo ""

echo "=== 4. Verifier: check prohibited action ==="
KYA_SERVER_URL="$KYA_URL" KYA_TOKEN="$TOKEN" node verifier.mjs write:database || true
echo ""

echo "=== 5. Verifier: allowed wildcard ==="
KYA_SERVER_URL="$KYA_URL" KYA_TOKEN="$TOKEN" node verifier.mjs write:slack
echo ""

echo "Done. Agent token (for manual tests): $TOKEN"
