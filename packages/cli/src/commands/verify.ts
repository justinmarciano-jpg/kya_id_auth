import { DEFAULT_API_URL } from '../config.js';
import { loadCredentials } from '../helpers/credentials.js';
import { heading, field, success, error } from '../helpers/output.js';

export async function verify(opts: { agent?: string; server?: string }): Promise<void> {
  const apiUrl = opts.server || DEFAULT_API_URL;
  const creds = loadCredentials();

  if (!creds && !opts.agent) {
    error('No .kya-credentials found. Run `kya register` first, or pass --agent <id>.');
    process.exit(1);
  }

  const agentId = opts.agent || creds!.agent_id;
  const token = creds?.token;

  if (!token) {
    error('No token found. Run `kya register` first.');
    process.exit(1);
  }

  const res = await fetch(`${apiUrl}/v1/agents/${agentId}`, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: 'Unknown error' }));
    error(`Verification failed (${res.status}): ${(body as any).error}`);
    process.exit(1);
  }

  const agent = (await res.json()) as Record<string, unknown>;

  heading('Agent Profile');
  field('Agent ID', agent.agent_id as string);
  field('Name', agent.agent_name as string);
  field('Creator', agent.creator_identity as string);
  field('Model', agent.model_version as string);
  field('Capabilities', (agent.capabilities as string[]).join(', ') || '(none)');
  field('Prohibited', (agent.prohibited as string[]).join(', ') || '(none)');
  field('Created', String(agent.created_at));

  if (agent.revoked_at) {
    field('Revoked', String(agent.revoked_at));
    console.log('\n  \x1b[31mThis agent has been revoked.\x1b[0m\n');
  } else {
    success('Agent is active');
  }
}
