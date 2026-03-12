import { DEFAULT_API_URL } from '../config.js';
import { loadCredentials } from '../helpers/credentials.js';
import { heading, field, error } from '../helpers/output.js';

export async function logs(opts: { agent?: string; limit?: string; server?: string }): Promise<void> {
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

  const limit = opts.limit || '20';
  const res = await fetch(`${apiUrl}/v1/agents/${agentId}/logs?limit=${limit}`, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: 'Unknown error' }));
    error(`Failed to fetch logs (${res.status}): ${(body as any).error}`);
    process.exit(1);
  }

  const data = (await res.json()) as {
    agent_id: string;
    logs: Array<{
      id: number;
      action: string;
      timestamp: string;
      within_scope: boolean;
      status: string;
    }>;
    total: number;
  };

  heading(`Audit Logs for ${agentId}`);
  field('Total entries', String(data.total));
  console.log('');

  if (data.logs.length === 0) {
    console.log('  No log entries found.\n');
    return;
  }

  // Table header
  console.log(
    '  ' +
      'ID'.padEnd(8) +
      'Action'.padEnd(25) +
      'Status'.padEnd(10) +
      'Scope'.padEnd(8) +
      'Timestamp',
  );
  console.log('  ' + '-'.repeat(75));

  for (const entry of data.logs) {
    const scope = entry.within_scope ? 'yes' : '\x1b[31mNO\x1b[0m';
    const statusColor =
      entry.status === 'blocked' ? `\x1b[31m${entry.status}\x1b[0m` : entry.status;
    const ts = new Date(entry.timestamp).toISOString().replace('T', ' ').slice(0, 19);

    console.log(
      '  ' +
        String(entry.id).padEnd(8) +
        entry.action.padEnd(25) +
        statusColor.padEnd(entry.status === 'blocked' ? 19 : 10) +
        scope.padEnd(entry.within_scope ? 8 : 17) +
        ts,
    );
  }
  console.log('');
}
