#!/usr/bin/env node
/**
 * Minimal "MCP/tool layer" verifier — what you'd build in practice.
 * Fetches JWKS from KYA server, verifies the Bearer JWT, checks if an action is allowed.
 *
 * Usage:
 *   KYA_SERVER_URL=http://localhost:3000 KYA_TOKEN=<jwt> node verifier.mjs read:notion
 *   KYA_SERVER_URL=http://localhost:3000 KYA_TOKEN=<jwt> node verifier.mjs write:database
 */

import { createRemoteJWKSet, jwtVerify } from 'jose';

const KYA_SERVER_URL = (process.env.KYA_SERVER_URL || 'http://localhost:3000').replace(/\/$/, '');
const token = process.env.KYA_TOKEN;
const action = process.argv[2] || 'read:notion';

if (!token) {
  console.error('Set KYA_TOKEN (e.g. from registration response)');
  process.exit(1);
}

function matchPattern(actionStr, pattern) {
  if (pattern === actionStr) return true;
  if (pattern.endsWith(':*')) return actionStr.startsWith(pattern.slice(0, -1));
  return false;
}

function checkAction(payload, actionStr) {
  const prohibited = payload.prohibited ?? [];
  const capabilities = payload.capabilities ?? [];
  for (const p of prohibited) if (matchPattern(actionStr, p)) return 'prohibited';
  for (const c of capabilities) if (matchPattern(actionStr, c)) return 'allowed';
  return 'denied';
}

async function main() {
  const jwksUrl = new URL('/.well-known/jwks.json', KYA_SERVER_URL).href;
  const JWKS = createRemoteJWKSet(new URL(jwksUrl));

  try {
    const { payload } = await jwtVerify(token, JWKS, { algorithms: ['RS256'] });
    const result = checkAction(payload, action);

    console.log('Agent:', payload.sub);
    console.log('Action:', action);
    console.log('Result:', result);
    console.log('Allowed:', result === 'allowed');

    if (result === 'allowed') {
      console.log('\n✓ Would allow this MCP/tool call');
    } else {
      console.log('\n✗ Would deny this MCP/tool call');
    }
    process.exit(result === 'allowed' ? 0 : 1);
  } catch (err) {
    console.error('Verification failed:', err.message);
    process.exit(2);
  }
}

main();
