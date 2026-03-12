import {
  generateKeyPair,
  exportJWK,
  exportPKCS8,
  importPKCS8,
  exportSPKI,
  importSPKI,
} from 'jose';
import type { JWK } from 'jose';
import fs from 'node:fs';

export interface SigningKeys {
  privateKey: CryptoKey;
  publicJwk: JWK;
}

export async function loadOrGenerateKeys(keyFile: string): Promise<SigningKeys> {
  if (fs.existsSync(keyFile)) {
    console.log(`Loading signing keys from ${keyFile}`);
    const stored = JSON.parse(fs.readFileSync(keyFile, 'utf8'));
    const privateKey = await importPKCS8(stored.privatePem, 'RS256');
    const publicKey = await importSPKI(stored.publicPem, 'RS256');
    const jwk = await exportJWK(publicKey);
    const publicJwk: JWK = { ...jwk, kid: 'kya-signing-key', alg: 'RS256', use: 'sig' };
    return { privateKey, publicJwk };
  }

  console.log('Generating new RS256 signing keypair …');
  const kp = await generateKeyPair('RS256');

  const privatePem = await exportPKCS8(kp.privateKey);
  const publicPem = await exportSPKI(kp.publicKey);

  fs.writeFileSync(keyFile, JSON.stringify({ privatePem, publicPem }), { mode: 0o600 });
  console.log(`Keypair saved to ${keyFile} (mode 0600)`);

  const jwk = await exportJWK(kp.publicKey);
  const publicJwk: JWK = { ...jwk, kid: 'kya-signing-key', alg: 'RS256', use: 'sig' };
  return { privateKey: kp.privateKey, publicJwk };
}
