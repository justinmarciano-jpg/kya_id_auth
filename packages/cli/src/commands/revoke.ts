import { DEFAULT_API_URL } from '../config.js';
import { loadCredentials } from '../helpers/credentials.js';
import { heading, field, success, error } from '../helpers/output.js';

export async function revoke(opts: { agent?: string; server?: string }): Promise<void> {
  const apiUrl = opts.server || DEFAULT_API_URL;
  const creds = loadCredentials();

  if (!creds && !opts.agent) {
    error('No .kya-credentials found. Run `kya register` first, or pass --agent <id>.');
    process.exit(1);
  }

  const agentId = opts.agent || creds!.agent_id;
  const token = creds?.token;

  const headers: Record<string, string> = {};
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  if (process.env.KYA_REGISTRATION_SECRET) {
    headers['X-Registration-Secret'] = process.env.KYA_REGISTRATION_SECRET;
  }

  if (!token && !process.env.KYA_REGISTRATION_SECRET) {
    error('No token or registration secret found. Provide credentials to revoke.');
    process.exit(1);
  }

  heading('Revoking Agent');
  field('Agent ID', agentId);
  field('Server', apiUrl);

  const res = await fetch(`${apiUrl}/v1/agents/${agentId}/revoke`, {
    method: 'POST',
    headers,
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: 'Unknown error' }));
    error(`Revocation failed (${res.status}): ${(body as any).error}`);
    process.exit(1);
  }

  const data = (await res.json()) as { agent_id: string; revoked_at: string };
  success('Agent revoked');
  field('Revoked At', data.revoked_at);
}
