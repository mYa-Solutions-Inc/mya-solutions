/**
 * FILE / ROOT: services/jean-site/test/doubles/provider-double.js
 * DESCRIPTION: TEST DOUBLE — NOT A REAL MODEL. A scripted stand-in for an LLM provider,
 *   registered as JEAN_PROVIDER=test-double and loadable only when NODE_ENV=test (enforced
 *   in src/config.js and src/providers/index.js). Tests queue exact replies or failures with
 *   script(); every call is recorded in calls[]. With nothing queued it returns one fixed,
 *   clearly-labelled canned reply so a locally started test server can be exercised by curl.
 *   It is excluded from the container image by .dockerignore.
 */

export const DOUBLE_LABEL = 'TEST DOUBLE';

export const DEFAULT_CANNED_REPLY = JSON.stringify({
  answer: '[TEST DOUBLE reply, not a real model] Lifetime membership in the founder\'s circle is a one-time payment of $515, per the pricing page.',
  sources: [{ path: 'products/pricing.html', id: 'lifetime-founder-s-circle' }],
  action: { type: 'show', path: 'products/pricing.html', id: 'lifetime-founder-s-circle', label: 'Show me lifetime pricing' },
});

/**
 * Step shapes accepted by script():
 *   { text: string, usage?: object }  -> resolves with that text
 *   { throw: Error }                  -> rejects with that error
 */
export function createProvider(config = {}) {
  const queue = [];
  const calls = [];
  return {
    name: 'test-double',
    model: config.model || 'test-double',
    isTestDouble: true,
    calls,
    script(...steps) {
      queue.push(...steps);
      return this;
    },
    reset() {
      queue.length = 0;
      calls.length = 0;
    },
    async complete(req) {
      calls.push(req);
      const step = queue.length ? queue.shift() : { text: DEFAULT_CANNED_REPLY };
      if (step.throw) throw step.throw;
      return { text: step.text, usage: step.usage || { inputTokens: 100, outputTokens: 20 } };
    },
  };
}
