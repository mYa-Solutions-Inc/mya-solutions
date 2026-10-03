/**
 * FILE / ROOT: services/jean-site/test/providers.test.js
 * DESCRIPTION: Unit tests for the real anthropic and openai-compatible providers. Each test
 *   replaces globalThis.fetch with a recording interceptor (restored afterwards) and asserts
 *   the exact URL, headers and body sent — including cache_control on the Anthropic system
 *   block — and the parsing of each provider's response format and error handling.
 */

import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { loadConfig } from '../src/config.js';
import { createProvider, ProviderError } from '../src/providers/index.js';

const realFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = realFetch;
});

/** Installs a fetch interceptor returning the given responses in order; records every call. */
function interceptFetch(...responses) {
  const calls = [];
  globalThis.fetch = async (url, init) => {
    calls.push({ url: String(url), init, body: init && init.body ? JSON.parse(init.body) : null });
    const r = responses.shift();
    if (r instanceof Error) throw r;
    return new Response(typeof r.body === 'string' ? r.body : JSON.stringify(r.body), {
      status: r.status || 200,
      headers: { 'content-type': 'application/json' },
    });
  };
  return calls;
}

const messages = [{ role: 'user', content: 'SITE SECTIONS ... <visitor_question>"hi"</visitor_question>' }];

test('anthropic: exact request URL, headers and body (with cache_control on system)', async () => {
  const config = loadConfig({ ANTHROPIC_API_KEY: 'sk-ant-test-key' });
  const provider = await createProvider(config);
  const calls = interceptFetch({
    body: {
      id: 'msg_1',
      type: 'message',
      role: 'assistant',
      content: [{ type: 'text', text: '{"answer":' }, { type: 'text', text: '"ok"}' }],
      stop_reason: 'end_turn',
      usage: { input_tokens: 1234, output_tokens: 56, cache_read_input_tokens: 1000, cache_creation_input_tokens: 0 },
    },
  });

  const out = await provider.complete({ system: 'STATIC SYSTEM', messages, maxTokens: 600 });

  assert.equal(provider.name, 'anthropic');
  assert.equal(provider.model, 'claude-haiku-4-5-20251001');
  assert.equal(calls.length, 1);
  const c = calls[0];
  assert.equal(c.url, 'https://api.anthropic.com/v1/messages');
  assert.equal(c.init.method, 'POST');
  assert.deepEqual(c.init.headers, {
    'content-type': 'application/json',
    'x-api-key': 'sk-ant-test-key',
    'anthropic-version': '2023-06-01',
  });
  assert.ok(c.init.signal instanceof AbortSignal, 'request carries a timeout signal');
  assert.deepEqual(c.body, {
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 600,
    temperature: 0.2,
    system: [{ type: 'text', text: 'STATIC SYSTEM', cache_control: { type: 'ephemeral' } }],
    messages,
  });

  assert.equal(out.text, '{"answer":"ok"}');
  assert.deepEqual(out.usage, { inputTokens: 1234, outputTokens: 56, cacheReadTokens: 1000, cacheWriteTokens: 0 });
});

test('anthropic: JEAN_MODEL overrides the default model', async () => {
  const provider = await createProvider(loadConfig({ ANTHROPIC_API_KEY: 'k', JEAN_MODEL: 'claude-other' }));
  const calls = interceptFetch({ body: { content: [{ type: 'text', text: 'x' }], usage: {} } });
  await provider.complete({ system: 's', messages });
  assert.equal(calls[0].body.model, 'claude-other');
  assert.equal(calls[0].body.max_tokens, 600, 'default max tokens');
});

test('anthropic: HTTP error becomes ProviderError with status, body not surfaced', async () => {
  const provider = await createProvider(loadConfig({ ANTHROPIC_API_KEY: 'k' }));
  interceptFetch({ status: 529, body: { type: 'error', error: { type: 'overloaded_error', message: 'Overloaded' } } });
  await assert.rejects(provider.complete({ system: 's', messages }), (err) => {
    assert.ok(err instanceof ProviderError);
    assert.equal(err.status, 529);
    assert.equal(err.code, 'http_529');
    assert.match(err.message, /overloaded_error/);
    return true;
  });
});

test('anthropic: network failure and malformed body become ProviderError', async () => {
  const provider = await createProvider(loadConfig({ ANTHROPIC_API_KEY: 'k' }));
  interceptFetch(new TypeError('fetch failed'));
  await assert.rejects(provider.complete({ system: 's', messages }), (e) => e instanceof ProviderError && e.code === 'network');
  interceptFetch({ body: { nothing: true } });
  await assert.rejects(provider.complete({ system: 's', messages }), (e) => e instanceof ProviderError && e.code === 'bad_body');
});

test('anthropic: times out via AbortSignal', async () => {
  const provider = await createProvider(loadConfig({ ANTHROPIC_API_KEY: 'k', JEAN_TIMEOUT_MS: '1000' }));
  globalThis.fetch = (url, init) =>
    new Promise((_, reject) => init.signal.addEventListener('abort', () => reject(init.signal.reason)));
  // AbortSignal.timeout() timers are unref'd; keep the event loop alive while waiting for it.
  const keepAlive = setInterval(() => {}, 100);
  try {
    const t0 = Date.now();
    await assert.rejects(provider.complete({ system: 's', messages }), (e) => e instanceof ProviderError && e.code === 'timeout');
    assert.ok(Date.now() - t0 < 3000);
  } finally {
    clearInterval(keepAlive);
  }
});

test('config: anthropic without a key fails fast', () => {
  assert.throws(() => loadConfig({}), /ANTHROPIC_API_KEY is required/);
});

test('openai-compatible: exact request to an Ollama-style base URL, no key, no JSON mode', async () => {
  const config = loadConfig({
    JEAN_PROVIDER: 'openai-compatible',
    JEAN_OPENAI_BASE_URL: 'http://localhost:11434/v1/',
    JEAN_MODEL: 'llama3.1:8b',
  });
  const provider = await createProvider(config);
  const calls = interceptFetch({
    body: {
      id: 'chatcmpl-1',
      object: 'chat.completion',
      choices: [{ index: 0, message: { role: 'assistant', content: '{"answer":"local"}' }, finish_reason: 'stop' }],
      usage: { prompt_tokens: 900, completion_tokens: 40, total_tokens: 940 },
    },
  });

  const out = await provider.complete({ system: 'STATIC SYSTEM', messages, maxTokens: 600 });

  assert.equal(provider.name, 'openai-compatible');
  assert.equal(provider.model, 'llama3.1:8b');
  const c = calls[0];
  assert.equal(c.url, 'http://localhost:11434/v1/chat/completions');
  assert.equal(c.init.method, 'POST');
  assert.deepEqual(c.init.headers, { 'content-type': 'application/json' });
  assert.deepEqual(c.body, {
    model: 'llama3.1:8b',
    messages: [{ role: 'system', content: 'STATIC SYSTEM' }, ...messages],
    max_tokens: 600,
    temperature: 0.2,
    stream: false,
  });
  assert.equal(out.text, '{"answer":"local"}');
  assert.deepEqual(out.usage, { inputTokens: 900, outputTokens: 40 });
});

test('openai-compatible: bearer key and response_format when JSON mode is on', async () => {
  const provider = await createProvider(loadConfig({
    JEAN_PROVIDER: 'openai-compatible',
    JEAN_OPENAI_BASE_URL: 'https://vllm.internal/v1',
    JEAN_OPENAI_API_KEY: 'local-secret',
    JEAN_OPENAI_JSON_MODE: '1',
    JEAN_MODEL: 'qwen2.5-7b-instruct',
  }));
  const calls = interceptFetch({ body: { choices: [{ message: { content: '{}' } }] } });
  await provider.complete({ system: 's', messages });
  assert.equal(calls[0].url, 'https://vllm.internal/v1/chat/completions');
  assert.deepEqual(calls[0].init.headers, { 'content-type': 'application/json', authorization: 'Bearer local-secret' });
  assert.deepEqual(calls[0].body.response_format, { type: 'json_object' });
});

test('openai-compatible: missing content and HTTP errors become ProviderError', async () => {
  const provider = await createProvider(loadConfig({ JEAN_PROVIDER: 'openai-compatible', JEAN_MODEL: 'm' }));
  interceptFetch({ body: { choices: [] } });
  await assert.rejects(provider.complete({ system: 's', messages }), (e) => e instanceof ProviderError && e.code === 'bad_body');
  interceptFetch({ status: 404, body: { error: { message: 'model "m" not found', type: 'not_found_error' } } });
  await assert.rejects(provider.complete({ system: 's', messages }), (e) => e instanceof ProviderError && e.status === 404);
});

test('config: openai-compatible requires JEAN_MODEL', () => {
  assert.throws(() => loadConfig({ JEAN_PROVIDER: 'openai-compatible' }), /JEAN_MODEL is required/);
});
