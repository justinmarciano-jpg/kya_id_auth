import fs from 'node:fs';
import path from 'node:path';
import { KYA_CREDENTIALS_FILE } from '../config.js';

export interface KyaCredentials {
  agent_id: string;
  token: string;
}

export function loadCredentials(dir: string = process.cwd()): KyaCredentials | null {
  const filePath = path.join(dir, KYA_CREDENTIALS_FILE);
  if (!fs.existsSync(filePath)) return null;
  const content = fs.readFileSync(filePath, 'utf-8');
  return JSON.parse(content) as KyaCredentials;
}

export function saveCredentials(creds: KyaCredentials, dir: string = process.cwd()): void {
  const filePath = path.join(dir, KYA_CREDENTIALS_FILE);
  fs.writeFileSync(filePath, JSON.stringify(creds, null, 2) + '\n', { mode: 0o600 });
}
