/**
 * FILE / ROOT: services/jean-site/src/config.js
 * DESCRIPTION: Reads and validates every environment variable the service uses, applies
 *   defaults, and returns one frozen config object. Fails fast (throws ConfigError) on
 *   values that would otherwise make the service misbehave at request time.
 */

export class ConfigError extends Error {
  constructor(message) {
    super(message);
    this.name = 'ConfigError';
  }
}

export const DEFAULT_ALLOWED_ORIGINS = ['https://myasolutions.org', 'https://www.myasolutions.org'];

/** Addresses Jean may propose drafting an email to. Anything else is dropped by validate.js. */
export const ALLOWED_EMAILS = Object.freeze([
  'contactus@myasolutions.org',
  'ir@myasolutions.org',
  'careers@myasolutions.org',
  'arudolph@myasolutions.org',
]);

const DEFAULT_MODELS = {
  anthropic: 'claude-haiku-4-5-20251001',
};

function str(env, name, fallback) {
  const v = env[name];
  return v === undefined ? fallback : String(v).trim();
}

function int(env, name, fallback, { min = 0, max = Number.MAX_SAFE_INTEGER } = {}) {
  const raw = env[name];
  if (raw === undefined || String(raw).trim() === '') return fallback;
  const n = Number(raw);
  if (!Number.isInteger(n) || n < min || n > max) {
    throw new ConfigError(`${name} must be an integer between ${min} and ${max} (got "${raw}")`);
  }
  return n;
}

function flag(env, name) {
  const v = str(env, name, '');
  return v === '1' || v.toLowerCase() === 'true';
}

function list(env, name, fallback) {
  const v = env[name];
  if (v === undefined || String(v).trim() === '') return fallback;
  return String(v)
    .split(',')
    .map((s) => s.trim().replace(/\/+$/, ''))
    .filter(Boolean);
}

/**
 * @param {Record<string,string|undefined>} env  usually process.env
 */
export function loadConfig(env = process.env) {
  const provider = str(env, 'JEAN_PROVIDER', 'anthropic') || 'anthropic';
  const nodeEnv = str(env, 'NODE_ENV', '');

  const model = str(env, 'JEAN_MODEL', '') || DEFAULT_MODELS[provider] || '';
  if (!model && provider !== 'test-double') {
    throw new ConfigError(`JEAN_MODEL is required when JEAN_PROVIDER=${provider}`);
  }

  const xffPosition = str(env, 'JEAN_XFF_POSITION', 'first') || 'first';
  if (xffPosition !== 'first' && xffPosition !== 'last') {
    throw new ConfigError('JEAN_XFF_POSITION must be "first" or "last"');
  }

  const config = {
    port: int(env, 'PORT', 8080, { min: 1, max: 65535 }),
    nodeEnv,
    dev: flag(env, 'JEAN_DEV'),

    provider,
    model: model || 'test-double',
    timeoutMs: int(env, 'JEAN_TIMEOUT_MS', 20000, { min: 1000, max: 120000 }),
    maxTokens: int(env, 'JEAN_MAX_TOKENS', 600, { min: 64, max: 4096 }),
    temperature: 0.2,

    anthropicApiKey: str(env, 'ANTHROPIC_API_KEY', ''),
    anthropicBaseUrl: (str(env, 'JEAN_ANTHROPIC_BASE_URL', '') || 'https://api.anthropic.com').replace(/\/+$/, ''),

    openaiBaseUrl: (str(env, 'JEAN_OPENAI_BASE_URL', '') || 'http://localhost:11434/v1').replace(/\/+$/, ''),
    openaiApiKey: str(env, 'JEAN_OPENAI_API_KEY', ''),
    openaiJsonMode: flag(env, 'JEAN_OPENAI_JSON_MODE'),

    // Empty JEAN_INDEX_URL disables remote loading (bundled file only).
    indexUrl: str(env, 'JEAN_INDEX_URL', 'https://myasolutions.org/assets/jean/site-index.json'),
    indexFile: str(env, 'JEAN_INDEX_FILE', './site-index.json') || './site-index.json',
    indexRefreshS: int(env, 'JEAN_INDEX_REFRESH_S', 600, { min: 0, max: 86400 }),

    allowedOrigins: list(env, 'JEAN_ALLOWED_ORIGINS', DEFAULT_ALLOWED_ORIGINS),
    ratePerMin: int(env, 'JEAN_RATE_PER_MIN', 10, { min: 1, max: 10000 }),
    rateBurst: int(env, 'JEAN_RATE_BURST', 5, { min: 1, max: 10000 }),
    dailyLimit: int(env, 'JEAN_DAILY_LIMIT', 2000, { min: 1, max: 10_000_000 }),
    xffPosition,

    maxBodyBytes: 8 * 1024,
    requestTimeoutMs: int(env, 'JEAN_REQUEST_TIMEOUT_MS', 30000, { min: 5000, max: 300000 }),

    allowedEmails: ALLOWED_EMAILS,
  };

  if (provider === 'anthropic' && !config.anthropicApiKey) {
    throw new ConfigError('ANTHROPIC_API_KEY is required when JEAN_PROVIDER=anthropic');
  }
  if (provider === 'test-double' && nodeEnv !== 'test') {
    throw new ConfigError('JEAN_PROVIDER=test-double is only allowed when NODE_ENV=test');
  }
  if (config.timeoutMs >= config.requestTimeoutMs) {
    throw new ConfigError('JEAN_TIMEOUT_MS must be smaller than JEAN_REQUEST_TIMEOUT_MS');
  }

  return Object.freeze(config);
}
