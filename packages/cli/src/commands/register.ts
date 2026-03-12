import { DEFAULT_API_URL } from '../config.js';
import { loadManifest } from '../helpers/yaml-config.js';
import { saveCredentials } from '../helpers/credentials.js';
import { heading, field, success, error } from '../helpers/output.js';

export async function register(opts: { server?: string }): Promise<void> {
  const apiUrl = opts.server || DEFAULT_API_URL;
  const manifest = loadManifest();

  if (!manifest) {
    error('No .kya.yaml found. Run `kya init` first.');
    process.exit(1);
  }

  heading('KYA Agent Registration');
  field('Agent', manifest.agent_name);
  field('Server', apiUrl);

  const res = await fetch(`${apiUrl}/v1/agents/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      agent_name: manifest.agent_name,
      creator_identity: manifest.creator_identity,
      model_version: manifest.model_version,
      capabilities: manifest.capabilities,
      prohibited: manifest.prohibited,
      metadata: manifest.metadata ?? {},
    }),
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: 'Unknown error' }));
    error(`Registration failed (${res.status}): ${(body as any).error}`);
    if ((body as any).details) {
      for (const d of (body as any).details) {
        console.error(`    - ${d}`);
      }
    }
    process.exit(1);
  }

  const data = (await res.json()) as {
    agent_id: string;
    token: string;
    agent_name: string;
    created_at: string;
  };

  saveCredentials({ agent_id: data.agent_id, token: data.token });

  success('Agent registered');
  field('Agent ID', data.agent_id);
  field('Token', data.token.slice(0, 40) + '...');
  field('Created', data.created_at);
  console.log('\n  Credentials saved to .kya-credentials (mode 0600)');
  console.log('  Add .kya-credentials to your .gitignore!\n');
}
