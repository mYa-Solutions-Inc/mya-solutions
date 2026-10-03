/**
 * FILE / ROOT: services/jean-site/test/index-store.test.js
 * DESCRIPTION: Tests for IndexStore: loads from URL, falls back to the bundled file on first
 *   boot, keeps the last good copy when a refresh fails or returns junk, and rejects
 *   malformed indexes. fetch is replaced by an injected interceptor, not the network.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { IndexStore, parseIndex, normalizePath } from '../src/index-store.js';
import { fixture, FIXTURE_PATH } from './helpers.js';

const okResponse = (body) => new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } });

test('loads from the URL when it works', async () => {
  const seen = [];
  const store = new IndexStore({
    url: 'https://example.test/site-index.json',
    file: FIXTURE_PATH,
    fetchImpl: async (u) => {
      seen.push(String(u));
      return okResponse(fixture());
    },
  });
  assert.equal(await store.load(), true);
  assert.equal(store.source, 'url');
  assert.deepEqual(seen, ['https://example.test/site-index.json']);
  assert.equal(store.current.sections.length, 158);
  assert.equal(store.current.generated, '2026-10-03T08:20:35Z');
});

test('first boot: URL fails -> bundled file', async () => {
  const store = new IndexStore({ url: 'https://example.test/x', file: FIXTURE_PATH, fetchImpl: async () => { throw new Error('offline'); } });
  assert.equal(await store.load(), true);
  assert.equal(store.source, 'file');
  assert.ok(store.get('products/pricing.html', 'monthly'));
});

test('refresh failure or junk keeps the last good copy', async () => {
  let mode = 'good';
  const store = new IndexStore({
    url: 'https://example.test/x',
    file: '/nonexistent/site-index.json',
    fetchImpl: async () => {
      if (mode === 'good') return okResponse(fixture());
      if (mode === 'http500') return new Response('oops', { status: 500 });
      return okResponse({ version: 1, sections: [] });
    },
  });
  await store.load();
  const first = store.current;
  mode = 'http500';
  assert.equal(await store.load(), false, 'no fresh copy was loaded');
  assert.equal(store.current, first, 'last good copy kept');
  mode = 'empty';
  await store.load();
  assert.equal(store.current, first);
});

test('nothing loadable -> no index, load() returns false', async () => {
  const store = new IndexStore({ url: '', file: '/nonexistent/site-index.json' });
  assert.equal(await store.load(), false);
  assert.equal(store.current, null);
});

test('parseIndex rejects bad versions/shapes and skips malformed sections', () => {
  assert.throws(() => parseIndex(null));
  assert.throws(() => parseIndex({ version: 2, sections: [] }), /version/);
  assert.throws(() => parseIndex({ version: 1 }), /sections/);
  const idx = parseIndex({
    version: 1,
    sections: [{ id: 'a', path: '/p.html', heading: 'A', text: 't' }, { id: '', path: 'p.html' }, { path: 'p.html' }],
  });
  assert.equal(idx.sections.length, 1);
  assert.ok(idx.byKey.get('p.html#a'));
});

test('normalizePath strips origin, leading slash and query', () => {
  assert.equal(normalizePath('https://myasolutions.org/products/marine.html?x=1'), 'products/marine.html');
  assert.equal(normalizePath('/'), 'index.html');
  assert.equal(normalizePath('company/team.html'), 'company/team.html');
});
