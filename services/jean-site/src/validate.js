/**
 * FILE / ROOT: services/jean-site/src/validate.js
 * DESCRIPTION: Two jobs. (1) validateRequest: checks the visitor's POST /ask body against
 *   the API contract. (2) parseModelJson + validateModelOutput: robustly extracts the
 *   model's JSON and turns it into a safe response — sources/actions whose targets are
 *   not in the index or not on the email allowlist are dropped, lengths are clamped,
 *   markup is stripped. An empty answer is rejected (never replaced with a made-up one).
 */

import { normalizePath } from './index-store.js';

export const LIMITS = Object.freeze({
  questionMax: 500,
  visibleMax: 12,
  historyMax: 6,
  historyTextMax: 1000,
  pagePathMax: 300,
  pageTitleMax: 300,
  sectionIdMax: 200,
  answerMax: 900,
  sourcesMax: 3,
  labelMax: 60,
  subjectMax: 120,
  emailBodyMax: 1200,
});

const isPlainObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

/**
 * @returns {{ ok: true, value: object } | { ok: false, detail: string }}
 */
export function validateRequest(body) {
  const fail = (detail) => ({ ok: false, detail });
  if (!isPlainObject(body)) return fail('body must be a JSON object');

  if (typeof body.question !== 'string') return fail('question must be a string');
  const question = body.question.trim();
  if (question.length < 1) return fail('question must not be empty');
  if (question.length > LIMITS.questionMax) return fail(`question must be at most ${LIMITS.questionMax} characters`);

  if (!isPlainObject(body.page)) return fail('page must be an object with path and title');
  if (typeof body.page.path !== 'string' || body.page.path.length > LIMITS.pagePathMax) {
    return fail('page.path must be a string');
  }
  if (typeof body.page.title !== 'string' || body.page.title.length > LIMITS.pageTitleMax) {
    return fail('page.title must be a string');
  }

  const visibleRaw = body.visible === undefined ? [] : body.visible;
  if (!Array.isArray(visibleRaw)) return fail('visible must be an array of section ids');
  if (visibleRaw.length > LIMITS.visibleMax) return fail(`visible must have at most ${LIMITS.visibleMax} ids`);
  for (const id of visibleRaw) {
    if (typeof id !== 'string' || id.length < 1 || id.length > LIMITS.sectionIdMax) {
      return fail('visible must contain only non-empty string ids');
    }
  }

  const historyRaw = body.history === undefined ? [] : body.history;
  if (!Array.isArray(historyRaw)) return fail('history must be an array');
  if (historyRaw.length > LIMITS.historyMax) return fail(`history must have at most ${LIMITS.historyMax} turns`);
  const history = [];
  for (const turn of historyRaw) {
    if (!isPlainObject(turn)) return fail('each history turn must be an object');
    if (turn.role !== 'user' && turn.role !== 'jean') return fail('history role must be "user" or "jean"');
    if (typeof turn.text !== 'string') return fail('history text must be a string');
    if (turn.text.length > LIMITS.historyTextMax) return fail(`history text must be at most ${LIMITS.historyTextMax} characters`);
    history.push({ role: turn.role, text: turn.text });
  }

  return {
    ok: true,
    value: {
      question,
      page: { path: normalizePath(body.page.path), title: body.page.title.trim() },
      visible: [...new Set(visibleRaw)],
      history,
    },
  };
}

// ---------------------------------------------------------------- model output

/**
 * Extracts the first balanced JSON object from model text. Strips <think> blocks and code
 * fences. Returns the parsed object, or null if none can be parsed.
 */
export function parseModelJson(text) {
  if (typeof text !== 'string') return null;
  let s = text.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();
  const fence = s.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) s = fence[1].trim();

  // Try each '{' as a start and scan for its balanced close, respecting strings.
  for (let start = s.indexOf('{'); start !== -1; start = s.indexOf('{', start + 1)) {
    let depth = 0;
    let inStr = false;
    let esc = false;
    for (let i = start; i < s.length; i++) {
      const c = s[i];
      if (inStr) {
        if (esc) esc = false;
        else if (c === '\\') esc = true;
        else if (c === '"') inStr = false;
        continue;
      }
      if (c === '"') inStr = true;
      else if (c === '{') depth++;
      else if (c === '}') {
        depth--;
        if (depth === 0) {
          try {
            const obj = JSON.parse(s.slice(start, i + 1));
            if (isPlainObject(obj)) return obj;
          } catch {
            /* try next start */
          }
          break;
        }
      }
    }
  }
  return null;
}

/** Removes HTML tags, angle brackets and markdown emphasis/heading/list/link syntax. */
export function stripMarkup(input, { multiline = true } = {}) {
  let s = String(input ?? '');
  s = s.replace(/<[^>]*>/g, ' ');               // HTML tags
  s = s.replace(/[<>]/g, '');                    // stray angle brackets
  s = s.replace(/!?\[([^\]]*)\]\(([^)]*)\)/g, '$1'); // [text](url) -> text
  s = s.replace(/```+/g, '').replace(/`/g, '');  // code fences / inline code
  s = s.replace(/\*\*|__/g, '');                 // bold
  s = s.replace(/(^|[\s(])[*_]([^*_\n]+)[*_](?=[\s).,!?;:]|$)/gm, '$1$2'); // *italic* / _italic_
  s = s.replace(/^[ \t]*#{1,6}[ \t]*/gm, '');    // leading headings
  s = s.replace(/^[ \t]*(?:[-*+•]|\d+[.)])[ \t]+/gm, ''); // list markers
  s = s.replace(/^[ \t]*>[ \t]?/gm, '');         // blockquotes
  if (multiline) {
    s = s.replace(/[ \t]+/g, ' ').replace(/ *\n */g, '\n').replace(/\n{3,}/g, '\n\n');
  } else {
    s = s.replace(/\s+/g, ' ');
  }
  return s.trim();
}

/** Clamps to max characters, preferring a sentence or word boundary, adding an ellipsis when cut. */
export function clamp(s, max) {
  if (s.length <= max) return s;
  const cut = s.slice(0, max - 1);
  const sentence = Math.max(cut.lastIndexOf('. '), cut.lastIndexOf('! '), cut.lastIndexOf('? '));
  if (sentence > max * 0.6) return cut.slice(0, sentence + 1);
  const space = cut.lastIndexOf(' ');
  return (space > max * 0.6 ? cut.slice(0, space) : cut).replace(/[\s,;:]+$/, '') + '…';
}

/** Accepts {path,id}, {path:"a.html#id"}, {id:"a.html#id"} or "a.html#id"; returns a section or null. */
function resolveTarget(ref, indexStore) {
  let path;
  let id;
  if (typeof ref === 'string') {
    [path, id] = ref.replace(/^\[|\]$/g, '').split('#');
  } else if (isPlainObject(ref)) {
    path = typeof ref.path === 'string' ? ref.path : '';
    id = typeof ref.id === 'string' ? ref.id : '';
    if (path.includes('#') && !id) [path, id] = path.split('#');
    else if (id.includes('#')) [path, id] = id.split('#');
  }
  if (!path || !id) return null;
  return indexStore.get(normalizePath(path), id.replace(/^#/, '').trim());
}

/**
 * Turns a parsed model object into a contract-safe response.
 * @returns {{ answer: string, sources: object[], action: object|null } | null}  null => unusable
 */
export function validateModelOutput(obj, indexStore, allowedEmails) {
  if (!isPlainObject(obj) || typeof obj.answer !== 'string') return null;
  const answer = clamp(stripMarkup(obj.answer), LIMITS.answerMax);
  if (!answer) return null;

  const sources = [];
  const seen = new Set();
  for (const ref of Array.isArray(obj.sources) ? obj.sources : []) {
    const s = resolveTarget(ref, indexStore);
    if (!s) continue;
    const key = `${s.path}#${s.id}`;
    if (seen.has(key)) continue;
    seen.add(key);
    sources.push({ path: s.path, id: s.id, heading: s.heading });
    if (sources.length >= LIMITS.sourcesMax) break;
  }

  let action = null;
  const a = obj.action;
  if (isPlainObject(a) && a.type === 'show') {
    const s = resolveTarget(a, indexStore);
    if (s) {
      const label = clamp(stripMarkup(a.label, { multiline: false }), LIMITS.labelMax) ||
        clamp(`Show me: ${s.heading}`, LIMITS.labelMax);
      action = { type: 'show', path: s.path, id: s.id, label };
    }
  } else if (isPlainObject(a) && a.type === 'draft_email') {
    const to = typeof a.to === 'string' ? a.to.trim().toLowerCase().replace(/^mailto:/, '') : '';
    const subject = clamp(stripMarkup(a.subject, { multiline: false }), LIMITS.subjectMax);
    const body = clamp(stripMarkup(a.body), LIMITS.emailBodyMax);
    if (allowedEmails.includes(to) && subject && body) {
      const label = clamp(stripMarkup(a.label, { multiline: false }), LIMITS.labelMax) || 'Draft an email';
      action = { type: 'draft_email', to, subject, body, label };
    }
  }

  return { answer, sources, action };
}
