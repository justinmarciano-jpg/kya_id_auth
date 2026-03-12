import type { ServerConfig } from './types.js';

export function loadConfig(overrides: Partial<ServerConfig> = {}): ServerConfig {
  return {
    port: overrides.port ?? (Number(process.env.PORT) || 3000),
    databaseUrl:
      overrides.databaseUrl ??
      process.env.DATABASE_URL ??
      'postgres://kya:kya_dev@localhost:5432/kya_id_auth',
    issuer: overrides.issuer ?? process.env.KYA_ISSUER ?? 'https://kya.dev',
    keyFile: overrides.keyFile ?? process.env.KYA_KEY_FILE ?? 'kya-keys.json',
    rateLimitWindowMs: overrides.rateLimitWindowMs ?? 60_000,
    rateLimitRegister:
      overrides.rateLimitRegister ?? (Number(process.env.KYA_RATE_REGISTER) || 10),
    rateLimitGeneral:
      overrides.rateLimitGeneral ?? (Number(process.env.KYA_RATE_GENERAL) || 60),
    allowedOrigins:
      overrides.allowedOrigins ??
      (process.env.KYA_ALLOWED_ORIGINS
        ? process.env.KYA_ALLOWED_ORIGINS.split(',').map((o) => o.trim())
        : null),
    trustProxy: overrides.trustProxy ?? process.env.KYA_TRUST_PROXY === 'true',
  };
}
