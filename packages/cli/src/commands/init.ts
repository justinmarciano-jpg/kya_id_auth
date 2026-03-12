import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';
import { KYA_YAML_FILE } from '../config.js';
import { saveManifest } from '../helpers/yaml-config.js';
import { heading, success, error, ask } from '../helpers/output.js';

export async function init(opts: { force?: boolean }): Promise<void> {
  const filePath = path.join(process.cwd(), KYA_YAML_FILE);

  if (fs.existsSync(filePath) && !opts.force) {
    error(`${KYA_YAML_FILE} already exists. Use --force to overwrite.`);
    process.exit(1);
  }

  heading('KYA Agent Init');

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

  try {
    const agent_name = await ask(rl, 'Agent name', path.basename(process.cwd()));
    const creator_identity = await ask(rl, 'Creator identity (email)');
    const model_version = await ask(rl, 'Model version', 'claude-sonnet-4');
    const capsStr = await ask(rl, 'Capabilities (comma separated)', '');
    const prohibStr = await ask(rl, 'Prohibited actions (comma separated)', '');
    const environment = await ask(rl, 'Environment', 'development');

    const capabilities = capsStr
      ? capsStr.split(',').map((s) => s.trim()).filter(Boolean)
      : [];
    const prohibited = prohibStr
      ? prohibStr.split(',').map((s) => s.trim()).filter(Boolean)
      : [];

    saveManifest({
      agent_name,
      creator_identity,
      model_version,
      capabilities,
      prohibited,
      metadata: { environment },
    });

    success(`Generated ${KYA_YAML_FILE}`);
    console.log('  Run `kya register` to register this agent.\n');
  } finally {
    rl.close();
  }
}
