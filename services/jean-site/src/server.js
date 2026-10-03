/**
 * FILE / ROOT: services/jean-site/src/server.js
 * DESCRIPTION: HTTP entry point for jean-site. Routes POST /ask, GET /health and OPTIONS
 *   preflight; enforces CORS allowlist, body-size limit, per-IP rate limit and global daily
 *   cap; retrieves site sections, calls the configured LLM provider (one corrective retry on
 *   unparseable output), validates the result and returns JSON. Never fabricates an answer:
 *   any model failure is an honest 503. Logs one JSON line per request with no visitor
 *   text, history or IP.
 */

import http from 'node:http';
import { pathToFileURL } from 'node:url';
import { loadConfig } from './config.js';
import { IndexStore } from './index-store.js';
import { retrieve } from './retrieve.js';
import { SYSTEM_PROMPT, CORRECTIVE_MESSAGE, buildMessages } from './prompt.js';
import { validateRequest, parseModelJson, validateModelOutput } from './validate.js';
import { RateLimiter, DailyCap } from './ratelimit.js';
import { createProvider } from './providers/index.js';

const SECURITY_HEADERS = {
  'content-type': 'application/json; charset=utf-8',
  'cache-control': 'no-store',
  'x-content-type-options': 'nosniff',
  'referrer-policy': 'no-referrer',
  'x-frame-options': 'DENY',
  'content-security-policy': "default-src 'none'; frame-ancestors 'none'",
  'cross-origin-resource-policy': 'cross-origin',
};

const MAX_BAD_REPLY_ECHO = 2000; // chars of an unparseable reply echoed back in the corrective retry

export function defaultLog(entry) {
  process.stdout.write(JSON.stringify({ ts: new Date().toISOString(), ...entry }) + '\n');
}

function isDevOrigin(origin) {
  return /^http:\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d{1,5})?$/.test(origin);
}

class HttpError extends Error {
  constructor(status, payload, headers = {}) {
    super(payload.error);
    this.status = status;
    this.payload = payload;
    this.headers = headers;
  }
}

function readBody(req, maxBytes) {
  return new Promise((resolve, reject) => {
    const declared = Number(req.headers['content-length']);
    if (Number.isFinite(declared) && declared > maxBytes) {
      req.resume();
      reject(new HttpError(413, { error: 'payload_too_large', detail: `body must be at most ${maxBytes} bytes` }, { connection: 'close' }));
      return;
    }
    const chunks = [];
    let size = 0;
    let done = false;
    const onData = (chunk) => {
      size += chunk.length;
      if (size > maxBytes) {
        done = true;
        req.off('data', onData);
        req.resume();
        reject(new HttpError(413, { error: 'payload_too_large', detail: `body must be at most ${maxBytes} bytes` }, { connection: 'close' }));
        return;
      }
      chunks.push(chunk);
    };
    req.on('data', onData);
    req.on('end', () => {
      if (!done) resolve(Buffer.concat(chunks));
    });
    req.on('error', (err) => {
      if (!done) reject(err);
    });
  });
}

/**
 * Builds the request handler. Dependencies are injected so tests can run it end to end.
 * @param {{ config: object, indexStore: IndexStore, provider: object, log?: Function, now?: () => number }} deps
 */
export function createApp({ config, indexStore, provider, log = defaultLog, now = Date.now }) {
  const rateLimiter = new RateLimiter({ ratePerMin: config.ratePerMin, burst: config.rateBurst, now });
  const dailyCap = new DailyCap({ limit: config.dailyLimit, now });

  function originAllowed(origin) {
    if (config.allowedOrigins.includes(origin)) return true;
    return config.dev && isDevOrigin(origin);
  }

  function clientKey(req) {
    const xff = req.headers['x-forwarded-for'];
    if (typeof xff === 'string' && xff.trim()) {
      const parts = xff.split(',').map((s) => s.trim()).filter(Boolean);
      if (parts.length) return config.xffPosition === 'last' ? parts[parts.length - 1] : parts[0];
    }
    return req.socket.remoteAddress || 'unknown';
  }

  async function askModel({ messages, signal, entry }) {
    let convo = messages;
    for (let attempt = 1; attempt <= 2; attempt++) {
      entry.attempts = attempt;
      let result;
      try {
        result = await provider.complete({ system: SYSTEM_PROMPT, messages: convo, maxTokens: config.maxTokens, signal });
      } catch (err) {
        entry.error = `provider_error:${err && err.code ? err.code : 'exception'}`;
        throw new HttpError(503, { error: 'unavailable', reason: 'provider_error' });
      }
      const u = result.usage || {};
      entry.input_tokens = (entry.input_tokens || 0) + (u.inputTokens || 0);
      entry.output_tokens = (entry.output_tokens || 0) + (u.outputTokens || 0);
      if (u.cacheReadTokens) entry.cache_read_tokens = (entry.cache_read_tokens || 0) + u.cacheReadTokens;
      if (u.cacheWriteTokens) entry.cache_write_tokens = (entry.cache_write_tokens || 0) + u.cacheWriteTokens;

      const text = typeof result.text === 'string' ? result.text : '';
      const parsed = parseModelJson(text);
      const safe = parsed && validateModelOutput(parsed, indexStore, config.allowedEmails);
      if (safe) return safe;

      convo = [
        ...messages,
        { role: 'assistant', content: text.trim().slice(0, MAX_BAD_REPLY_ECHO) || '(empty reply)' },
        { role: 'user', content: CORRECTIVE_MESSAGE },
      ];
    }
    entry.error = 'provider_error:unparseable';
    throw new HttpError(503, { error: 'unavailable', reason: 'provider_error' });
  }

  async function handleAsk(req, entry, signal) {
    const rl = rateLimiter.take(clientKey(req));
    if (!rl.ok) {
      entry.error = 'rate_limited';
      throw new HttpError(429, { error: 'rate_limited', retryAfter: rl.retryAfter }, { 'retry-after': String(rl.retryAfter) });
    }

    const raw = await readBody(req, config.maxBodyBytes);
    let body;
    try {
      body = JSON.parse(raw.toString('utf8'));
    } catch {
      entry.error = 'bad_json';
      throw new HttpError(400, { error: 'bad_request', detail: 'body must be valid JSON' });
    }
    const v = validateRequest(body);
    if (!v.ok) {
      entry.error = 'bad_request';
      throw new HttpError(400, { error: 'bad_request', detail: v.detail });
    }

    const index = indexStore.current;
    if (!index) {
      entry.error = 'index_unavailable';
      throw new HttpError(503, { error: 'unavailable', reason: 'index_unavailable' });
    }

    const sections = retrieve(index, v.value);
    entry.retrieved = sections.length;

    if (!dailyCap.tryConsume()) {
      entry.error = 'daily_limit';
      const ra = dailyCap.secondsUntilReset();
      throw new HttpError(503, { error: 'unavailable', reason: 'daily_limit' }, { 'retry-after': String(ra) });
    }

    const messages = buildMessages({ ...v.value, sections });
    const out = await askModel({ messages, signal, entry });
    return { answer: out.answer, sources: out.sources, action: out.action, mode: 'live' };
  }

  function health() {
    const index = indexStore.current;
    const ok = Boolean(index);
    return {
      status: ok ? 200 : 503,
      payload: {
        ok,
        provider: provider.name,
        model: provider.model,
        index: { sections: index ? index.sections.length : 0, generated: index ? index.generated : null },
      },
    };
  }

  async function handler(req, res) {
    const started = performance.now();
    const pathname = (() => {
      try {
        return new URL(req.url, 'http://localhost').pathname.replace(/\/+$/, '') || '/';
      } catch {
        return '/';
      }
    })();
    const entry = {
      severity: 'INFO',
      method: req.method,
      route: pathname === '/ask' || pathname === '/health' ? pathname : 'other',
      status: 0,
      latency_ms: 0,
      provider: provider.name,
      model: provider.model,
      input_tokens: null,
      output_tokens: null,
      retrieved: null,
      attempts: 0,
      error: null,
    };

    const ac = new AbortController();
    res.on('close', () => {
      if (!res.writableEnded) ac.abort();
    });

    const headers = { ...SECURITY_HEADERS };
    const send = (status, payload, extra = {}) => {
      entry.status = status;
      if (res.headersSent || res.destroyed) return;
      res.writeHead(status, { ...headers, ...extra });
      res.end(payload === undefined ? undefined : JSON.stringify(payload));
    };

    try {
      const origin = req.headers.origin;
      if (origin !== undefined) {
        if (!originAllowed(origin)) {
          entry.error = 'forbidden_origin';
          req.resume();
          send(403, { error: 'forbidden', detail: 'origin not allowed' });
          return;
        }
        headers['access-control-allow-origin'] = origin;
        headers.vary = 'Origin';
      }

      const known = { '/ask': 'POST', '/health': 'GET' };
      if (!(pathname in known)) {
        req.resume();
        send(404, { error: 'not_found' });
        return;
      }

      if (req.method === 'OPTIONS') {
        req.resume();
        send(204, undefined, {
          'access-control-allow-methods': `${known[pathname]}, OPTIONS`,
          'access-control-allow-headers': 'Content-Type',
          'access-control-max-age': '600',
        });
        return;
      }

      if (req.method !== known[pathname]) {
        req.resume();
        send(405, { error: 'method_not_allowed' }, { allow: `${known[pathname]}, OPTIONS` });
        return;
      }

      if (pathname === '/health') {
        const h = health();
        send(h.status, h.payload);
        return;
      }

      const payload = await handleAsk(req, entry, ac.signal);
      send(200, payload);
    } catch (err) {
      req.resume(); // discard any unread body so the connection can finish cleanly
      if (err instanceof HttpError) {
        send(err.status, err.payload, err.headers);
      } else {
        entry.error = 'internal';
        send(500, { error: 'internal' });
      }
    } finally {
      if (ac.signal.aborted && !entry.error) entry.error = 'client_closed';
      entry.latency_ms = Math.round(performance.now() - started);
      entry.severity = entry.status >= 500 ? 'ERROR' : entry.status >= 400 ? 'WARNING' : 'INFO';
      try {
        log(entry);
      } catch {
        /* logging must never break a response */
      }
    }
  }

  return { handler, rateLimiter, dailyCap };
}

export function createServer(deps) {
  const app = createApp(deps);
  const server = http.createServer(app.handler);
  server.requestTimeout = deps.config.requestTimeoutMs;
  server.headersTimeout = Math.min(10000, deps.config.requestTimeoutMs);
  server.keepAliveTimeout = 5000;
  server.app = app;
  return server;
}

export async function main(env = process.env) {
  const config = loadConfig(env);
  const indexStore = new IndexStore({
    url: config.indexUrl,
    file: config.indexFile,
    refreshS: config.indexRefreshS,
    log: defaultLog,
  });
  await indexStore.load();
  indexStore.start();
  const provider = await createProvider(config);
  const server = createServer({ config, indexStore, provider });

  await new Promise((resolve) => server.listen(config.port, resolve));
  defaultLog({
    severity: 'INFO',
    event: 'listening',
    port: config.port,
    provider: provider.name,
    model: provider.model,
    index_sections: indexStore.current ? indexStore.current.sections.length : 0,
  });

  const shutdown = () => {
    indexStore.stop();
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(0), 10000).unref();
  };
  process.once('SIGTERM', shutdown);
  process.once('SIGINT', shutdown);
  return server;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((err) => {
    defaultLog({ severity: 'CRITICAL', event: 'startup_failed', error: String(err && err.message || err) });
    process.exit(1);
  });
}
