/**
 * FILE / ROOT: services/jean-site/test/helpers.js
 * DESCRIPTION: Shared test helpers: loads the site-index fixture, builds an IndexStore and
 *   a test config, and starts a real HTTP server on an ephemeral port wired to the
 *   provider TEST DOUBLE (resolved through the real provider registry).
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { loadConfig } from '../src/config.js';
import { IndexStore } from '../src/index-store.js';
import { createProvider } from '../src/providers/index.js';
import { createServer } from '../src/server.js';

export const FIXTURE_PATH = fileURLToPath(new URL('./fixtures/site-index.json', import.meta.url));
export const fixture = () => JSON.parse(readFileSync(FIXTURE_PATH, 'utf8'));

export function fixtureStore() {
  const store = new IndexStore({});
  store.setIndex(fixture(), 'fixture');
  return store;
}

export function testConfig(overrides = {}) {
  return loadConfig({
    NODE_ENV: 'test',
    JEAN_PROVIDER: 'test-double',
    JEAN_INDEX_URL: '',
    ...overrides,
  });
}

/**
 * Starts a server on 127.0.0.1:<random>. Returns { url, provider, logs, server, close }.
 */
export async function startTestServer({ env = {}, store = fixtureStore(), now } = {}) {
  const config = testConfig(env);
  const provider = await createProvider(config);
  const logs = [];
  const server = createServer({ config, indexStore: store, provider, log: (e) => logs.push(e), now });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const { port } = server.address();
  return {
    url: `http://127.0.0.1:${port}`,
    provider,
    logs,
    server,
    close: () => new Promise((r) => server.close(r)),
  };
}

export const ORIGIN = 'https://myasolutions.org';

export function goodBody(overrides = {}) {
  return {
    question: 'How much does lifetime cost?',
    page: { path: 'products/pricing.html', title: 'Pricing — JeanOS and BethanyShell' },
    visible: ['lifetime-founder-s-circle'],
    history: [],
    ...overrides,
  };
}

export async function ask(base, body, { origin = ORIGIN, headers = {} } = {}) {
  const h = { 'content-type': 'application/json', ...headers };
  if (origin) h.origin = origin;
  const res = await fetch(`${base}/ask`, {
    method: 'POST',
    headers: h,
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
  const text = await res.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    /* non-JSON */
  }
  return { res, json, text };
}
