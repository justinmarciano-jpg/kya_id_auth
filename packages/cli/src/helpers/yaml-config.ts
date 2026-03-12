import fs from 'node:fs';
import path from 'node:path';
import yaml from 'js-yaml';
import { KYA_YAML_FILE } from '../config.js';

export interface KyaManifest {
  agent_name: string;
  creator_identity: string;
  model_version: string;
  capabilities: string[];
  prohibited: string[];
  metadata?: Record<string, unknown>;
}

export function loadManifest(dir: string = process.cwd()): KyaManifest | null {
  const filePath = path.join(dir, KYA_YAML_FILE);
  if (!fs.existsSync(filePath)) return null;
  const content = fs.readFileSync(filePath, 'utf-8');
  return yaml.load(content) as KyaManifest;
}

export function saveManifest(manifest: KyaManifest, dir: string = process.cwd()): void {
  const filePath = path.join(dir, KYA_YAML_FILE);
  const content = yaml.dump(manifest, { lineWidth: 120, noRefs: true });
  fs.writeFileSync(filePath, content, 'utf-8');
}
