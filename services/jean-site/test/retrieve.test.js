/**
 * FILE / ROOT: services/jean-site/test/retrieve.test.js
 * DESCRIPTION: Retrieval relevance and behaviour tests against the real site-index fixture:
 *   expected pages surface for representative questions, visible sections are forced in,
 *   page boosts apply, truncation and determinism hold.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { retrieve, tokenize, MAX_SECTION_CHARS, MAX_FORCED_VISIBLE, DEFAULT_TOP_K } from '../src/retrieve.js';
import { fixtureStore } from './helpers.js';

const index = fixtureStore().current;
const home = { path: 'index.html', title: 'Home' };

function top(question, opts = {}) {
  return retrieve(index, { question, page: opts.page || home, visible: opts.visible || [], history: opts.history || [] });
}

const cases = [
  ['how much does lifetime cost', 'products/pricing.html', 1],
  ['marine station keeping drift', 'products/marine.html', 1],
  ['are you hiring?', 'company/careers.html', 3],
  ['who founded the company', 'company/team.html', 1],
  ['when is the commercial launch', 'index.html', 1],
  ['what is the B Corp ten percent bylaw', 'impact/b-corp.html', 3],
  ['BethanyShell false positives block rate', 'products/bethanyshell.html', 1],
  ['how do I email investor relations', 'company/contact.html', 3],
];

for (const [q, expectedPath, within] of cases) {
  test(`"${q}" surfaces ${expectedPath} in the top ${within}`, () => {
    const r = top(q);
    assert.ok(r.length > 0, 'no results');
    const paths = r.slice(0, within).map((s) => s.path);
    assert.ok(paths.includes(expectedPath), `top ${within} were ${paths.join(', ')}`);
  });
}

test('lifetime pricing section itself is retrieved', () => {
  const keys = top('how much does lifetime cost').map((s) => s.key);
  assert.ok(keys.includes('products/pricing.html#lifetime-founder-s-circle'));
});

test('returns at most the default top-k and every result has a path#id key', () => {
  const r = top('jean physical intelligence robotics marine ground air proof');
  assert.ok(r.length <= DEFAULT_TOP_K);
  for (const s of r) assert.equal(s.key, `${s.path}#${s.id}`);
});

test('section text is truncated for the prompt', () => {
  const r = top('every defect was at an interface marine honest');
  for (const s of r) assert.ok(s.text.length <= MAX_SECTION_CHARS + 2, `${s.key} is ${s.text.length}`);
  assert.ok(r.some((s) => s.text.endsWith('…')), 'expected at least one truncated long section');
});

test('visible sections of the current page are always included, even with no term match', () => {
  const page = { path: 'products/marine.html', title: 'Marine' };
  const r = top('what does this mean', { page, visible: ['proof', 'method'] });
  const keys = r.map((s) => s.key);
  assert.ok(keys.includes('products/marine.html#proof'));
  assert.ok(keys.includes('products/marine.html#method'));
});

test('forced visible sections are capped', () => {
  const page = { path: 'products/marine.html', title: 'Marine' };
  const visible = ['steady-in-the-deep', 'the-same-engine-pointed-at-the-deep', 'one-engine-a-new-substrate', 'method', 'proof', 'deciding'];
  const r = top('zzzz qqqq', { page, visible });
  assert.equal(r.filter((s) => visible.includes(s.id)).length, MAX_FORCED_VISIBLE);
});

test('visible ids from a different page are not forced in', () => {
  const r = top('zzzz qqqq', { page: home, visible: ['method'] });
  assert.ok(!r.some((s) => s.key === 'products/marine.html#method'));
});

test('current-page boost breaks ties toward the visitor\'s page', () => {
  // "Security that never leaves your building." exists on both index.html and bethanyshell.html.
  const onShell = top('security that never leaves your building', { page: { path: 'products/bethanyshell.html', title: '' } });
  assert.equal(onShell[0].path, 'products/bethanyshell.html');
  const onHome = top('security that never leaves your building', { page: home });
  const firstHome = onHome.findIndex((s) => s.key === 'index.html#security-that-never-leaves-your-building');
  const firstShell = onHome.findIndex((s) => s.key === 'products/bethanyshell.html#security-that-never-leaves-your-building');
  assert.ok(firstHome !== -1 && firstHome < firstShell);
});

test('history terms help a follow-up question', () => {
  const r = top('how much is it', { history: [{ role: 'user', text: 'Tell me about BethanyShell' }] });
  assert.ok(r.slice(0, 3).some((s) => s.path === 'products/bethanyshell.html' || s.path === 'products/pricing.html'));
});

test('an off-topic question yields only weak current-page fallback, not random matches', () => {
  const r = top('weather forecast paris tomorrow', { page: home });
  assert.ok(r.length <= 3);
  for (const s of r) assert.equal(s.path, 'index.html');
});

test('deterministic: same input gives identical output', () => {
  const a = JSON.stringify(top('physical intelligence proof'));
  const b = JSON.stringify(top('physical intelligence proof'));
  assert.equal(a, b);
});

test('tokenize lower-cases, strips diacritics and stopwords, stems plurals', () => {
  assert.deepEqual(tokenize('The Résumés of teachers!'), ['resume', 'teacher']);
});
