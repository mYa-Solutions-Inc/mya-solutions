/**
 * FILE / ROOT: services/jean-site/test/request-validation.test.js
 * DESCRIPTION: Unit tests for validateRequest — the accepted shape and every rejected case
 *   of the POST /ask contract.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateRequest } from '../src/validate.js';
import { goodBody } from './helpers.js';

test('accepts a well-formed request and normalises it', () => {
  const r = validateRequest(goodBody({
    question: '  How much?  ',
    page: { path: '/products/pricing.html', title: ' Pricing ' },
    visible: ['a', 'a', 'b'],
    history: [{ role: 'user', text: 'hi' }, { role: 'jean', text: 'hello' }],
  }));
  assert.equal(r.ok, true);
  assert.equal(r.value.question, 'How much?');
  assert.deepEqual(r.value.page, { path: 'products/pricing.html', title: 'Pricing' });
  assert.deepEqual(r.value.visible, ['a', 'b']);
  assert.equal(r.value.history.length, 2);
});

test('visible and history are optional', () => {
  const r = validateRequest({ question: 'q', page: { path: 'index.html', title: 't' } });
  assert.equal(r.ok, true);
  assert.deepEqual(r.value.visible, []);
  assert.deepEqual(r.value.history, []);
});

test('accepts the maximum sizes exactly', () => {
  const r = validateRequest(goodBody({
    question: 'x'.repeat(500),
    visible: Array.from({ length: 12 }, (_, i) => `s${i}`),
    history: Array.from({ length: 6 }, () => ({ role: 'user', text: 'y'.repeat(1000) })),
  }));
  assert.equal(r.ok, true);
});

const bad = [
  ['body is an array', []],
  ['body is null', null],
  ['body is a string', 'hello'],
  ['question missing', goodBody({ question: undefined })],
  ['question not a string', goodBody({ question: 42 })],
  ['question blank after trim', goodBody({ question: '   ' })],
  ['question too long', goodBody({ question: 'x'.repeat(501) })],
  ['page missing', goodBody({ page: undefined })],
  ['page not object', goodBody({ page: 'index.html' })],
  ['page.path missing', goodBody({ page: { title: 't' } })],
  ['page.title missing', goodBody({ page: { path: 'index.html' } })],
  ['page.title not string', goodBody({ page: { path: 'index.html', title: 5 } })],
  ['visible not array', goodBody({ visible: 'a' })],
  ['visible too many', goodBody({ visible: Array.from({ length: 13 }, (_, i) => `s${i}`) })],
  ['visible contains non-string', goodBody({ visible: ['a', 3] })],
  ['visible contains empty id', goodBody({ visible: [''] })],
  ['history not array', goodBody({ history: {} })],
  ['history too many turns', goodBody({ history: Array.from({ length: 7 }, () => ({ role: 'user', text: 'x' })) })],
  ['history turn not object', goodBody({ history: ['hi'] })],
  ['history bad role', goodBody({ history: [{ role: 'assistant', text: 'x' }] })],
  ['history text not string', goodBody({ history: [{ role: 'user', text: 1 }] })],
  ['history text too long', goodBody({ history: [{ role: 'user', text: 'x'.repeat(1001) }] })],
];

for (const [name, body] of bad) {
  test(`rejects: ${name}`, () => {
    const r = validateRequest(body);
    assert.equal(r.ok, false);
    assert.equal(typeof r.detail, 'string');
    assert.ok(r.detail.length > 0);
  });
}
