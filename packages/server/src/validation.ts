export const AGENT_ID_RE = /^agt_[a-f0-9]{8}$/;
export const SHA256_HEX_RE = /^[a-f0-9]{64}$/;
const VALID_STATUSES = new Set(['success', 'blocked', 'error']);

function requireString(
  val: unknown,
  name: string,
  opts: { min?: number; max?: number } = {},
): string | null {
  const { min = 1, max = 2000 } = opts;
  if (typeof val !== 'string') return `${name} must be a string`;
  if (val.length < min) return `${name} must be at least ${min} characters`;
  if (val.length > max) return `${name} must be at most ${max} characters`;
  return null;
}

function requireArray(val: unknown, name: string): string | null {
  if (!Array.isArray(val)) return `${name} must be an array`;
  return null;
}

export function validateRegisterBody(body: unknown): string[] {
  if (!body || typeof body !== 'object') return ['Request body is required'];

  const b = body as Record<string, unknown>;
  const errs: string[] = [];
  const push = (e: string | null) => {
    if (e) errs.push(e);
  };

  push(requireString(b.agent_name, 'agent_name', { max: 200 }));
  push(requireString(b.creator_identity, 'creator_identity', { max: 500 }));
  push(requireString(b.model_version, 'model_version', { max: 200 }));
  push(requireArray(b.capabilities, 'capabilities'));
  push(requireArray(b.prohibited, 'prohibited'));

  if (b.metadata != null && (typeof b.metadata !== 'object' || Array.isArray(b.metadata))) {
    errs.push('metadata must be an object');
  }

  return errs;
}

export function validateLogBody(body: unknown): string[] {
  if (!body || typeof body !== 'object') return ['Request body is required'];

  const b = body as Record<string, unknown>;
  const errs: string[] = [];
  const push = (e: string | null) => {
    if (e) errs.push(e);
  };

  push(requireString(b.action, 'action', { max: 500 }));
  push(requireString(b.timestamp, 'timestamp', { max: 100 }));
  push(requireString(b.input_hash, 'input_hash', { min: 64, max: 64 }));
  push(requireString(b.output_hash, 'output_hash', { min: 64, max: 64 }));

  if (typeof b.within_scope !== 'boolean') {
    errs.push('within_scope must be a boolean');
  }

  if (typeof b.status !== 'string' || !VALID_STATUSES.has(b.status)) {
    errs.push('status must be one of: success, blocked, error');
  }

  if (typeof b.timestamp === 'string' && isNaN(Date.parse(b.timestamp))) {
    errs.push('timestamp must be a valid ISO 8601 date string');
  }

  if (typeof b.input_hash === 'string' && !SHA256_HEX_RE.test(b.input_hash)) {
    errs.push('input_hash must be a 64-character lowercase hex SHA-256 hash');
  }

  if (typeof b.output_hash === 'string' && !SHA256_HEX_RE.test(b.output_hash)) {
    errs.push('output_hash must be a 64-character lowercase hex SHA-256 hash');
  }

  return errs;
}
