/**
 * FILE / ROOT: services/jean-site/src/retrieve.js
 * DESCRIPTION: Deterministic BM25 retrieval over the site index. Scores heading, summary,
 *   text, page title and path; boosts sections on the visitor's current page and sections
 *   currently visible; always includes the visible sections of the current page (capped).
 *   Returns the top sections with text truncated for the prompt.
 */

const K1 = 1.2;
const B = 0.75;

export const DEFAULT_TOP_K = 8;
export const MAX_SECTION_CHARS = 1200;
export const MAX_FORCED_VISIBLE = 4;

const FIELD_WEIGHTS = { heading: 3, path: 2, page: 1, summary: 1, text: 1 };
const PAGE_BOOST = 1.25;      // multiplicative, section is on the visitor's page
const VISIBLE_BOOST = 1.5;    // multiplicative, section is on screen
const VISIBLE_BASE = 2;       // additive, for the (capped) forced visible sections
const HISTORY_WEIGHT = 0.35;  // weight of terms from earlier visitor turns

const STOPWORDS = new Set(
  ('a an and are as at be been but by can could did do does doing for from had has have how i if in into is it its ' +
    "me my of on or our so than that the their them then there these they this to too us was we were what when where " +
    'which who whom why will with would you your yours about any also just much many more most some such very ' +
    'tell know want like get got please hi hello hey jean mya solutions mean means page site website').split(/\s+/),
);

// Small, explicit query expansion for words visitors use that the site phrases differently.
const SYNONYMS = {
  cost: ['price', 'pricing'],
  costs: ['price', 'pricing'],
  price: ['pricing', 'cost'],
  prices: ['pricing', 'cost'],
  pricing: ['price'],
  pay: ['price', 'pricing'],
  expensive: ['price', 'pricing'],
  cheap: ['price', 'pricing'],
  job: ['careers', 'hiring'],
  jobs: ['careers', 'hiring'],
  hiring: ['careers'],
  hire: ['careers', 'hiring'],
  email: ['contact', 'contactus'],
  contact: ['contactus'],
  reach: ['contact'],
  invest: ['investor', 'investors'],
  investing: ['investor', 'investors'],
  investment: ['investor', 'investors'],
  boat: ['marine'],
  underwater: ['marine'],
  ocean: ['marine'],
  sea: ['marine'],
  robot: ['robotics'],
  robots: ['robotics'],
  teacher: ['education'],
  teachers: ['education'],
  school: ['education', 'schools'],
  classroom: ['education'],
  founded: ['founder', 'team'],
  founder: ['team'],
  ceo: ['founder', 'team'],
  started: ['founder', 'story'],
  security: ['bethanyshell'],
  cybersecurity: ['bethanyshell', 'defense'],
};

function stem(t) {
  if (t.length > 4 && t.endsWith('ies')) return t.slice(0, -3) + 'y';
  if (t.length > 3 && t.endsWith('s') && !t.endsWith('ss') && !t.endsWith('us')) return t.slice(0, -1);
  return t;
}

/** Lower-cases, strips diacritics, splits on non-alphanumerics, drops stopwords, light stemming. */
export function tokenize(text) {
  if (!text) return [];
  const norm = String(text)
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/['’]/g, '');
  const out = [];
  for (const raw of norm.split(/[^a-z0-9]+/)) {
    if (!raw || raw.length < 2 && !/\d/.test(raw)) continue;
    if (STOPWORDS.has(raw)) continue;
    out.push(stem(raw));
  }
  return out;
}

function pathTokens(path) {
  return tokenize(path.replace(/\.html?$/i, '').replace(/\//g, ' '));
}

/** Pre-computes term frequencies and document frequencies for an index. */
export function buildSearchIndex(index) {
  const docs = [];
  const df = new Map();
  let totalLen = 0;
  for (const s of index.sections) {
    const tf = new Map();
    let len = 0;
    const add = (tokens, w) => {
      for (const t of tokens) {
        tf.set(t, (tf.get(t) || 0) + w);
        len += w;
      }
    };
    add(tokenize(s.heading), FIELD_WEIGHTS.heading);
    add(pathTokens(s.path), FIELD_WEIGHTS.path);
    add(tokenize(s.page), FIELD_WEIGHTS.page);
    add(tokenize(s.summary), FIELD_WEIGHTS.summary);
    add(tokenize(s.text), FIELD_WEIGHTS.text);
    for (const t of tf.keys()) df.set(t, (df.get(t) || 0) + 1);
    docs.push({ tf, len });
    totalLen += len;
  }
  return { docs, df, n: docs.length, avgLen: docs.length ? totalLen / docs.length : 0 };
}

function queryWeights(question, history) {
  const weights = new Map();
  const add = (t, w) => weights.set(t, Math.max(weights.get(t) || 0, w));
  for (const t of tokenize(question)) {
    add(t, 1);
    for (const syn of SYNONYMS[t] || []) add(stem(syn), 0.6);
  }
  const userTurns = (history || []).filter((h) => h && h.role === 'user').slice(-2);
  for (const turn of userTurns) {
    for (const t of tokenize(turn.text)) add(t, HISTORY_WEIGHT);
  }
  return weights;
}

export function truncateText(text, max = MAX_SECTION_CHARS) {
  const s = String(text || '').replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim();
  if (s.length <= max) return s;
  const cut = s.slice(0, max);
  const sp = cut.lastIndexOf(' ');
  return (sp > max * 0.8 ? cut.slice(0, sp) : cut) + ' …';
}

/**
 * @param {object} index  parsed index from index-store (must carry .search)
 * @param {{ question: string, page?: {path:string}, visible?: string[], history?: object[] }} q
 * @param {{ topK?: number }} [opts]
 * @returns {Array<{ key, path, id, page, heading, text, score }>}
 */
export function retrieve(index, { question, page, visible = [], history = [] }, { topK = DEFAULT_TOP_K } = {}) {
  const { docs, df, n, avgLen } = index.search;
  const currentPath = page && page.path ? page.path : '';
  const visibleSet = new Set(visible);
  const weights = queryWeights(question, history);

  const scored = index.sections.map((s, i) => {
    const doc = docs[i];
    let score = 0;
    for (const [term, qw] of weights) {
      const f = doc.tf.get(term);
      if (!f) continue;
      const d = df.get(term) || 0;
      const idf = Math.log(1 + (n - d + 0.5) / (d + 0.5));
      score += qw * idf * ((f * (K1 + 1)) / (f + K1 * (1 - B + (B * doc.len) / (avgLen || 1))));
    }
    const onPage = s.path === currentPath;
    const isVisible = onPage && visibleSet.has(s.id);
    if (onPage) score *= PAGE_BOOST;
    if (isVisible) score *= VISIBLE_BOOST;
    return { s, i, score, isVisible, onPage };
  });

  // Visible sections of the current page are always included (capped, in page order) and get
  // an additive bonus so they rank near the top even when the question shares no terms with them.
  const forced = scored.filter((r) => r.isVisible).slice(0, MAX_FORCED_VISIBLE);
  for (const r of forced) r.score += VISIBLE_BASE;

  const byScore = (a, b) => b.score - a.score || a.i - b.i;
  const ranked = scored.filter((r) => r.score > 0).sort(byScore);

  const chosen = new Map();
  for (const r of forced) chosen.set(r.i, r);
  for (const r of ranked) {
    if (chosen.size >= topK) break;
    chosen.set(r.i, r);
  }

  // Nothing matched and nothing visible: give the model the opening of the current page so it
  // can still answer "what is this page about?" (or say honestly that it doesn't know).
  if (chosen.size === 0 && currentPath) {
    for (const r of scored.filter((x) => x.onPage).slice(0, 3)) chosen.set(r.i, r);
  }

  return [...chosen.values()].sort(byScore).map(({ s, score }) => ({
    key: `${s.path}#${s.id}`,
    path: s.path,
    id: s.id,
    page: s.page,
    heading: s.heading,
    text: truncateText(s.text),
    score: Math.round(score * 1000) / 1000,
  }));
}
