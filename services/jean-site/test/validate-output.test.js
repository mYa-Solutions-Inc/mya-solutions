/**
 * FILE / ROOT: services/jean-site/test/validate-output.test.js
 * DESCRIPTION: Unit tests for model-output handling: robust JSON extraction, dropping of
 *   nonexistent targets and disallowed emails, markup stripping and length clamping.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseModelJson, validateModelOutput, stripMarkup, clamp, LIMITS } from '../src/validate.js';
import { ALLOWED_EMAILS } from '../src/config.js';
import { fixtureStore } from './helpers.js';

const store = fixtureStore();
const v = (obj) => validateModelOutput(obj, store, ALLOWED_EMAILS);

test('parseModelJson: plain, fenced, prefixed, think-tagged, nested braces in strings', () => {
  assert.deepEqual(parseModelJson('{"answer":"a"}'), { answer: 'a' });
  assert.deepEqual(parseModelJson('```json\n{"answer":"b"}\n```'), { answer: 'b' });
  assert.deepEqual(parseModelJson('Sure! Here it is: {"answer":"c","sources":[]} hope that helps'), { answer: 'c', sources: [] });
  assert.deepEqual(parseModelJson('<think>maybe {x}</think>{"answer":"d"}'), { answer: 'd' });
  assert.deepEqual(parseModelJson('{"answer":"has } and { inside"}'), { answer: 'has } and { inside' });
  assert.deepEqual(parseModelJson('{broken {"answer":"e"}'), { answer: 'e' });
});

test('parseModelJson: returns null for garbage', () => {
  for (const s of ['', 'I am not JSON', '{"answer": ', '[1,2,3]', null, undefined, 42]) {
    assert.equal(parseModelJson(s), null, String(s));
  }
});

test('keeps valid sources, fills heading from the index, accepts path#id forms', () => {
  const out = v({
    answer: 'Lifetime is $515.',
    sources: [
      { path: 'products/pricing.html', id: 'lifetime-founder-s-circle' },
      { path: '/products/pricing.html#monthly' },
      'products/pricing.html#annual',
    ],
    action: null,
  });
  assert.deepEqual(out.sources, [
    { path: 'products/pricing.html', id: 'lifetime-founder-s-circle', heading: "Lifetime · Founder's circle" },
    { path: 'products/pricing.html', id: 'monthly', heading: 'Monthly' },
    { path: 'products/pricing.html', id: 'annual', heading: 'Annual' },
  ]);
});

test('drops nonexistent sources, dedupes, caps at 3', () => {
  const out = v({
    answer: 'x',
    sources: [
      { path: 'products/pricing.html', id: 'does-not-exist' },
      { path: 'nope.html', id: 'pricing' },
      { path: 'products/pricing.html', id: 'monthly' },
      { path: 'products/pricing.html', id: 'monthly' },
      { path: 'products/pricing.html', id: 'annual' },
      { path: 'products/pricing.html', id: 'jeanos' },
      { path: 'products/pricing.html', id: 'organisations' },
      42,
    ],
  });
  assert.deepEqual(out.sources.map((s) => s.id), ['monthly', 'annual', 'jeanos']);
  assert.ok(out.sources.length <= LIMITS.sourcesMax);
});

test('non-array sources become []', () => {
  assert.deepEqual(v({ answer: 'x', sources: 'products/pricing.html#monthly' }).sources, []);
});

test('show action: kept when target exists, dropped when not', () => {
  const ok = v({ answer: 'x', action: { type: 'show', path: 'products/marine.html', id: 'proof', label: 'Show the runs' } });
  assert.deepEqual(ok.action, { type: 'show', path: 'products/marine.html', id: 'proof', label: 'Show the runs' });
  assert.equal(v({ answer: 'x', action: { type: 'show', path: 'products/marine.html', id: 'fake' } }).action, null);
  assert.equal(v({ answer: 'x', action: { type: 'open_url', url: 'https://evil.example' } }).action, null);
});

test('show action without a label gets one from the heading', () => {
  const out = v({ answer: 'x', action: { type: 'show', path: 'products/marine.html', id: 'proof' } });
  assert.match(out.action.label, /^Show me: Three runs/);
  assert.ok(out.action.label.length <= LIMITS.labelMax);
});

test('draft_email: allowed address kept (case-insensitive), disallowed dropped', () => {
  const ok = v({ answer: 'x', action: { type: 'draft_email', to: 'IR@myasolutions.org', subject: 'Briefing', body: 'Hello', label: 'Draft it' } });
  assert.deepEqual(ok.action, { type: 'draft_email', to: 'ir@myasolutions.org', subject: 'Briefing', body: 'Hello', label: 'Draft it' });
  for (const to of ['attacker@evil.example', 'ir@myasolutions.org.evil.example', 'contactus@myasolutions.org, x@evil.example', '', null]) {
    assert.equal(v({ answer: 'x', action: { type: 'draft_email', to, subject: 's', body: 'b' } }).action, null, String(to));
  }
});

test('draft_email: empty subject or body is dropped; lengths clamped', () => {
  assert.equal(v({ answer: 'x', action: { type: 'draft_email', to: 'careers@myasolutions.org', subject: '', body: 'b' } }).action, null);
  const long = v({
    answer: 'x',
    action: { type: 'draft_email', to: 'careers@myasolutions.org', subject: 'S '.repeat(200), body: 'word '.repeat(600), label: 'L'.repeat(100) },
  }).action;
  assert.ok(long.subject.length <= LIMITS.subjectMax);
  assert.ok(long.body.length <= LIMITS.emailBodyMax);
  assert.ok(long.label.length <= LIMITS.labelMax);
});

test('strips HTML and markdown from the answer', () => {
  const out = v({ answer: '## Pricing\n**Lifetime** is <b>$515</b> <script>alert(1)</script>. See [pricing](https://x.y) and `code`.\n- one\n- two' });
  assert.equal(out.answer.includes('<'), false);
  assert.equal(out.answer.includes('>'), false);
  assert.equal(out.answer.includes('**'), false);
  assert.equal(out.answer.includes('#'), false);
  assert.equal(out.answer.includes('`'), false);
  assert.equal(out.answer.includes(']('), false);
  assert.match(out.answer, /^Pricing\nLifetime is \$515/);
  assert.match(out.answer, /See pricing and code\./);
});

test('stripMarkup leaves ordinary prose untouched', () => {
  const s = "We're in Oakland, California. Lifetime is $515 — one payment.";
  assert.equal(stripMarkup(s), s);
});

test('answer is clamped to the limit at a boundary', () => {
  const out = v({ answer: 'This is a sentence. '.repeat(100) });
  assert.ok(out.answer.length <= LIMITS.answerMax);
  assert.ok(out.answer.endsWith('.'));
  assert.equal(clamp('abcdef', 10), 'abcdef');
});

test('empty, missing or markup-only answer is rejected (null), never filled in', () => {
  assert.equal(v({ answer: '' }), null);
  assert.equal(v({ answer: '   ' }), null);
  assert.equal(v({ answer: '<b></b> **' }), null);
  assert.equal(v({ sources: [] }), null);
  assert.equal(v({ answer: 5 }), null);
  assert.equal(v(null), null);
});
