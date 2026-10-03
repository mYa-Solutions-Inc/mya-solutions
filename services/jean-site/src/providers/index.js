/**
 * FILE / ROOT: services/jean-site/src/providers/index.js
 * DESCRIPTION: Provider registry. JEAN_PROVIDER selects one entry. Every provider module
 *   exports createProvider(config) returning
 *     { name, model, async complete({ system, messages, maxTokens, signal }) -> { text, usage } }
 *   where usage = { inputTokens, outputTokens, cacheReadTokens?, cacheWriteTokens? }.
 *   To add a provider: write one file in this folder and add one line to REGISTRY.
 *   The test double is resolved only when NODE_ENV=test and lives under test/doubles/.
 */

export class ProviderError extends Error {
  /** @param {string} message  @param {{ status?: number, code?: string, cause?: unknown }} [info] */
  constructor(message, { status, code = 'provider_error', cause } = {}) {
    super(message, { cause });
    this.name = 'ProviderError';
    this.status = status;
    this.code = code;
  }
}

const REGISTRY = {
  anthropic: () => import('./anthropic.js'),
  'openai-compatible': () => import('./openai-compatible.js'),
};

export const PROVIDER_NAMES = Object.keys(REGISTRY);

export async function createProvider(config) {
  if (config.provider === 'test-double') {
    if (config.nodeEnv !== 'test') throw new Error('test-double provider is only available when NODE_ENV=test');
    const mod = await import(new URL('../../test/doubles/provider-double.js', import.meta.url));
    return mod.createProvider(config);
  }
  const load = REGISTRY[config.provider];
  if (!load) {
    throw new Error(`Unknown JEAN_PROVIDER "${config.provider}". Known: ${PROVIDER_NAMES.join(', ')}`);
  }
  const mod = await load();
  return mod.createProvider(config);
}

/** Runs fetch with a timeout and an optional caller signal; maps failures to ProviderError. */
export async function fetchWithTimeout(url, init, { timeoutMs, signal }) {
  const signals = [AbortSignal.timeout(timeoutMs)];
  if (signal) signals.push(signal);
  try {
    return await globalThis.fetch(url, { ...init, signal: AbortSignal.any(signals) });
  } catch (err) {
    const timedOut = err && (err.name === 'TimeoutError' || err.name === 'AbortError');
    throw new ProviderError(timedOut ? 'provider request timed out or was aborted' : 'provider request failed', {
      code: timedOut ? 'timeout' : 'network',
      cause: err,
    });
  }
}

/** Reads a non-2xx response into a ProviderError without surfacing response bodies to visitors. */
export async function errorFromResponse(res, providerName) {
  let type = '';
  try {
    const data = await res.json();
    type = (data && data.error && (data.error.type || data.error.code)) || '';
  } catch {
    /* ignore unparseable error bodies */
  }
  return new ProviderError(`${providerName} returned HTTP ${res.status}${type ? ` (${type})` : ''}`, {
    status: res.status,
    code: `http_${res.status}`,
  });
}
