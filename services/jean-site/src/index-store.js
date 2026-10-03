/**
 * FILE / ROOT: services/jean-site/src/index-store.js
 * DESCRIPTION: Holds the site index (pages + sections) in memory. Loads it from
 *   JEAN_INDEX_URL, refreshes it every JEAN_INDEX_REFRESH_S seconds, keeps the last good
 *   copy when a refresh fails, and falls back to the bundled JEAN_INDEX_FILE on first boot.
 *   Each loaded index is pre-processed once for retrieval (see retrieve.js).
 */

import { readFile } from 'node:fs/promises';
import { buildSearchIndex } from './retrieve.js';

const FETCH_TIMEOUT_MS = 10000;

/** Normalises a section address: strips origin/leading slash, so "/products/x.html" === "products/x.html". */
export function normalizePath(p) {
  if (typeof p !== 'string') return '';
  let s = p.trim();
  s = s.replace(/^https?:\/\/[^/]+/i, '');
  s = s.split('?')[0];
  s = s.replace(/^\/+/, '');
  if (s === '') s = 'index.html';
  return s;
}

export function sectionKey(path, id) {
  return `${normalizePath(path)}#${id}`;
}

/**
 * Validates raw JSON and returns a cleaned, immutable index. Throws on unusable input.
 */
export function parseIndex(raw) {
  if (!raw || typeof raw !== 'object') throw new Error('index is not an object');
  if (raw.version !== 1) throw new Error(`unsupported index version ${raw.version}`);
  if (!Array.isArray(raw.sections)) throw new Error('index.sections is not an array');

  const sections = [];
  const byKey = new Map();
  for (const s of raw.sections) {
    if (!s || typeof s.id !== 'string' || typeof s.path !== 'string' || !s.id || !s.path) continue;
    const section = Object.freeze({
      id: s.id,
      path: normalizePath(s.path),
      page: typeof s.page === 'string' ? s.page : '',
      heading: typeof s.heading === 'string' ? s.heading.trim() : '',
      summary: typeof s.summary === 'string' ? s.summary : '',
      text: typeof s.text === 'string' ? s.text : '',
    });
    const key = `${section.path}#${section.id}`;
    if (byKey.has(key)) continue; // first occurrence wins; deterministic
    byKey.set(key, section);
    sections.push(section);
  }
  if (sections.length === 0) throw new Error('index has no usable sections');

  const pages = Array.isArray(raw.pages)
    ? raw.pages
        .filter((p) => p && typeof p.path === 'string')
        .map((p) => Object.freeze({ path: normalizePath(p.path), title: String(p.title || ''), description: String(p.description || '') }))
    : [];

  const index = {
    version: 1,
    site: typeof raw.site === 'string' ? raw.site : '',
    generated: typeof raw.generated === 'string' ? raw.generated : null,
    pages,
    sections,
    byKey,
  };
  index.search = buildSearchIndex(index);
  return Object.freeze(index);
}

export class IndexStore {
  /**
   * @param {{ url?: string, file?: string, refreshS?: number, fetchImpl?: typeof fetch,
   *           log?: (obj: object) => void }} opts
   */
  constructor({ url = '', file = '', refreshS = 600, fetchImpl, log = () => {} } = {}) {
    this.url = url;
    this.file = file;
    this.refreshS = refreshS;
    this.fetchImpl = fetchImpl || ((...a) => globalThis.fetch(...a));
    this.log = log;
    this.index = null;
    this.source = null; // 'url' | 'file' | 'inline'
    this.timer = null;
  }

  /** Sets the index directly (used by tests and by callers that already hold the data). */
  setIndex(raw, source = 'inline') {
    this.index = parseIndex(raw);
    this.source = source;
    return this.index;
  }

  get current() {
    return this.index;
  }

  get(path, id) {
    return this.index ? this.index.byKey.get(sectionKey(path, id)) || null : null;
  }

  async fetchRemote() {
    const res = await this.fetchImpl(this.url, {
      headers: { accept: 'application/json' },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return parseIndex(await res.json());
  }

  async readBundled() {
    const text = await readFile(this.file, 'utf8');
    return parseIndex(JSON.parse(text));
  }

  /** Loads the index once: URL first, then (only if nothing is loaded yet) the bundled file. */
  async load() {
    if (this.url) {
      try {
        this.index = await this.fetchRemote();
        this.source = 'url';
        this.log({ event: 'index_loaded', source: 'url', sections: this.index.sections.length, generated: this.index.generated });
        return true;
      } catch (err) {
        this.log({ event: 'index_fetch_failed', severity: 'WARNING', error: String(err && err.message || err) });
      }
    }
    if (!this.index && this.file) {
      try {
        this.index = await this.readBundled();
        this.source = 'file';
        this.log({ event: 'index_loaded', source: 'file', sections: this.index.sections.length, generated: this.index.generated });
        return true;
      } catch (err) {
        this.log({ event: 'index_file_failed', severity: 'ERROR', error: String(err && err.message || err) });
      }
    }
    return false;
  }

  /** Starts periodic refresh. Keeps the last good copy if a refresh fails. */
  start() {
    if (this.timer || !this.url || !this.refreshS) return;
    this.timer = setInterval(() => {
      this.load().catch(() => {});
    }, this.refreshS * 1000);
    this.timer.unref();
  }

  stop() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }
}
