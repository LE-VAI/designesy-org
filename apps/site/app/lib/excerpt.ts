/**
 * Search excerpts for the command palette's "Mentioned on" rows.
 *
 * Pagefind returns a window of about thirty words around the match, with the
 * match wrapped in <mark>. The window starts and ends wherever the word count
 * lands, so a raw excerpt opens mid-string on stray punctuation and, cut again
 * to fit one line, ends mid-word:
 *
 *     here", "learn more", "here")Parses anchor el
 *     format. 04 Inclusion. Observation. Dark def
 *
 * tidyExcerpt reads that HTML into characters with a marked flag, then:
 *   1. starts at a sentence boundary when one is close enough before the
 *      match, otherwise at a word boundary a short lead before it, so the
 *      match always sits early in the line and is never cut;
 *   2. ends at a sentence end when one is in reach, otherwise at the last word
 *      boundary that fits;
 *   3. separates text nodes Pagefind joined without a space (`")Parses`);
 *   4. drops quotes and brackets the cut left unbalanced (opening after an
 *      orphan closer before the match, ending before an orphan opener after
 *      it), and stray punctuation at either edge;
 *   5. adds an ellipsis on a side that begins or ends mid-sentence.
 * Pagefind marks whole tokens with their punctuation (`<mark>more",</mark>`);
 * only the word stays marked. The result is escaped text with only <mark> as
 * markup.
 *
 * Text with no spaces (CJK) breaks between any two of its characters.
 */

type Ch = { c: string; m: boolean };

export type ExcerptOptions = {
  /** Most characters kept, in regular-weight widths, ellipses excluded. */
  max?: number;
  /** Most characters kept before the first match when no sentence starts closer. */
  lead?: number;
  /** How far before the match a sentence start may be and still be used. */
  reach?: number;
};

/** How much wider a bold (matched) character sets than a regular one. */
const BOLD_WIDTH = 1.15;

const ELLIPSIS = '\u2026';

const ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
  hellip: ELLIPSIS,
  mdash: '\u2014',
  ndash: '\u2013',
  lsquo: '\u2018',
  rsquo: '\u2019',
  ldquo: '\u201c',
  rdquo: '\u201d',
};

function decode(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (all, name: string) => {
    if (name[0] === '#') {
      const n = name[1] === 'x' || name[1] === 'X' ? parseInt(name.slice(2), 16) : parseInt(name.slice(1), 10);
      return Number.isFinite(n) && n > 0 && n <= 0x10ffff ? String.fromCodePoint(n) : all;
    }
    return ENTITIES[name.toLowerCase()] ?? all;
  });
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/** Characters, each flagged when it sits inside a <mark>. Other tags drop. */
function parse(html: string): Ch[] {
  const out: Ch[] = [];
  let marked = false;
  const re = /<(\/?)([a-z][a-z0-9]*)\b[^>]*>|([^<]+)|</gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) {
    if (m[2]) {
      if (m[2].toLowerCase() === 'mark') marked = m[1] !== '/';
      continue;
    }
    const text = decode(m[3] ?? m[0]);
    for (const c of Array.from(text)) out.push({ c: /\s/.test(c) ? ' ' : c, m: marked });
  }
  return out;
}

/**
 * Pagefind marks whole tokens, punctuation included: `<mark>more",</mark>`,
 * `<mark>motion.</mark>`. Only the letters and digits stay marked, so the
 * highlight is the word and the punctuation is free to balance and trim.
 */
function trimMarks(chars: Ch[]): Ch[] {
  const word = /[\p{L}\p{N}]/u;
  let i = 0;
  while (i < chars.length) {
    if (!chars[i].m) {
      i += 1;
      continue;
    }
    let j = i;
    while (j < chars.length && chars[j].m) j += 1;
    let a = i;
    let b = j;
    while (a < b && !word.test(chars[a].c)) chars[a++].m = false;
    while (b > a && !word.test(chars[b - 1].c)) chars[--b].m = false;
    i = j;
  }
  return chars;
}

const CJK = /[\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff\uac00-\ud7af\uf900-\ufaff\uff00-\uffef]/;
const SENTENCE_END = /[.!?\u3002\uff01\uff1f]/;
const CLOSERS_AFTER_END = /["'\u201d\u2019)\]]/;
const UPPER = /\p{Lu}/u;
const LOWER = /\p{Ll}/u;
const START_OK = /[\p{L}\p{N}"'\u201c\u2018(\[<&#@$`*/\u2014\u2013-]/u;
// Straight quotes are left to balance(): after it, a quote at an edge has a partner.
const LEAD_STRIP = /[\s)\]}\u201d\u2019,.;:!?\u3001\u3002\u2014\u2013-]/;
const TAIL_STRIP = /[\s(\[{\u201c\u2018,;:\u3001\u2014\u2013-]/;

/** Insert a space where Pagefind glued two text nodes: `")Parses`, `.Machine`. */
function unglue(chars: Ch[]): Ch[] {
  const out: Ch[] = [];
  for (let i = 0; i < chars.length; i++) {
    out.push(chars[i]);
    const a = chars[i].c;
    const b = chars[i + 1]?.c;
    const b2 = chars[i + 2]?.c;
    if (!b) continue;
    const afterClose = /[)\]\u201d]/.test(a) && UPPER.test(b);
    // ".Machine" yes, ".NET" and "e.g" no.
    const afterStop = /[.!?]/.test(a) && UPPER.test(b) && !!b2 && LOWER.test(b2) && i > 0 && /[\p{L}\p{N})"\u201d]/u.test(chars[i - 1].c);
    if (afterClose || afterStop) out.push({ c: ' ', m: chars[i].m && chars[i + 1].m });
  }
  return out;
}

function collapse(chars: Ch[]): Ch[] {
  const out: Ch[] = [];
  for (const ch of chars) {
    if (ch.c === ' ' && (out.length === 0 || out[out.length - 1].c === ' ')) continue;
    out.push(ch);
  }
  while (out.length && out[out.length - 1].c === ' ') out.pop();
  return out;
}

/** A break may fall before index i: after a space, or between two CJK characters. */
function canBreakBefore(chars: Ch[], i: number): boolean {
  if (i <= 0 || i >= chars.length) return true;
  if (chars[i - 1].c === ' ' || chars[i].c === ' ') return true;
  return CJK.test(chars[i - 1].c) || CJK.test(chars[i].c);
}

/** The text at index i opens a sentence (the previous one ended just before). */
function sentenceStartsAt(chars: Ch[], i: number): boolean {
  if (i === 0) return true;
  let j = i - 1;
  const cjkStop = SENTENCE_END.test(chars[j].c) && CJK.test(chars[j].c);
  if (cjkStop) return true;
  if (chars[j].c !== ' ') return false;
  j -= 1;
  while (j >= 0 && CLOSERS_AFTER_END.test(chars[j].c)) j -= 1;
  if (j < 0 || !SENTENCE_END.test(chars[j].c)) return false;
  return opensSentence(chars, i);
}

/** The text ends a sentence at index i (inclusive). */
function sentenceEndsAt(chars: Ch[], i: number): boolean {
  let j = i;
  while (j >= 0 && CLOSERS_AFTER_END.test(chars[j].c)) j -= 1;
  if (j < 0 || !SENTENCE_END.test(chars[j].c)) return false;
  // "e.g." and "v1." are not sentence ends: a stop after a single letter or a digit.
  const prev = chars[j - 1]?.c;
  const prev2 = chars[j - 2]?.c;
  if (chars[j].c === '.' && prev && /\p{N}/u.test(prev) && !CJK.test(prev)) return false;
  if (chars[j].c === '.' && prev && /\p{L}/u.test(prev) && (!prev2 || prev2 === ' ' || prev2 === '.')) return false;
  const next = chars[i + 1];
  return !next || next.c === ' ' || CJK.test(chars[j].c);
}

const PAIRS: Record<string, string> = { ')': '(', ']': '[', '}': '{', '\u201d': '\u201c', '\u2019': '\u2018' };
const OPENERS = new Set(Object.values(PAIRS));

/**
 * Brackets and quotes with no partner inside the excerpt, and what to do with
 * them. An orphan closer before the first match means the window opened inside
 * a quote or bracket: the excerpt starts after it (`here", "learn more"` reads
 * `"learn more"`). An orphan opener after the last match means the window
 * closed inside one: the excerpt ends before it. Any other orphan is dropped
 * on its own. A match is never cut.
 */
function balance(chars: Ch[], cutStart: boolean): Ch[] {
  const drop = new Set<number>();
  const closers = new Set<number>();
  const stack: number[] = [];
  chars.forEach((ch, i) => {
    if (OPENERS.has(ch.c)) {
      stack.push(i);
    } else if (PAIRS[ch.c]) {
      const want = PAIRS[ch.c];
      // A right single quote doubles as the apostrophe; only a partnered one closes.
      if (ch.c === '\u2019' && !(stack.length && chars[stack[stack.length - 1]].c === want)) return;
      let k = stack.length - 1;
      while (k >= 0 && chars[stack[k]].c !== want) k -= 1;
      if (k < 0) {
        drop.add(i);
        closers.add(i);
      } else stack.splice(k);
    }
  });
  for (const i of stack) drop.add(i);
  // Straight double quotes have no direction: an odd count means the cut took
  // one partner. It is the first quote when the start was cut, else the last.
  const quotes = chars.map((ch, i) => (ch.c === '"' ? i : -1)).filter((i) => i >= 0);
  if (quotes.length % 2 === 1) {
    const q = cutStart ? quotes[0] : quotes[quotes.length - 1];
    drop.add(q);
    if (cutStart) closers.add(q);
  }
  if (!drop.size) return chars;

  const firstMark = chars.findIndex((ch) => ch.m);
  let head = 0;
  let tail = chars.length;
  if (firstMark >= 0) {
    let lastMark = chars.length - 1;
    while (!chars[lastMark].m) lastMark -= 1;
    for (const i of drop) {
      if (closers.has(i) && i < firstMark) head = Math.max(head, i + 1);
      else if (!closers.has(i) && i > lastMark) tail = Math.min(tail, i);
    }
  }
  return chars.slice(head, tail).filter((_, k) => !drop.has(k + head));
}

function trimEdges(chars: Ch[]): Ch[] {
  let a = 0;
  let b = chars.length;
  // Never strip a marked character: the match stays whole.
  while (a < b && !chars[a].m && (LEAD_STRIP.test(chars[a].c) || !START_OK.test(chars[a].c))) a += 1;
  while (b > a && !chars[b - 1].m && TAIL_STRIP.test(chars[b - 1].c)) b -= 1;
  return chars.slice(a, b);
}

function serialize(chars: Ch[]): string {
  let out = '';
  let run = '';
  let marked = false;
  const flush = () => {
    if (!run) return;
    out += marked ? `<mark>${escapeHtml(run)}</mark>` : escapeHtml(run);
    run = '';
  };
  for (const ch of chars) {
    if (ch.m !== marked) {
      flush();
      marked = ch.m;
    }
    run += ch.c;
  }
  flush();
  return out;
}

/**
 * True when the text at index i opens a sentence, judged from the text alone:
 * its first letter or digit, past any opening quote or bracket, is a capital,
 * a digit or a no-space script character. ("learn more" opens mid-sentence.)
 */
function opensSentence(chars: Ch[], i = 0): boolean {
  let k = i;
  while (k < chars.length && /["'\u201c\u2018(\[]/.test(chars[k].c)) k += 1;
  const c = chars[k]?.c ?? '';
  return UPPER.test(c) || /\p{N}/u.test(c) || CJK.test(c);
}

/**
 * Tidy a Pagefind excerpt (HTML with <mark>) into one readable line of HTML.
 * Returns '' for empty input.
 */
export function tidyExcerpt(html: string, options: ExcerptOptions = {}): string {
  const max = options.max ?? 88;
  const lead = options.lead ?? 28;
  const reach = options.reach ?? 48;

  const chars = collapse(unglue(collapse(trimMarks(parse(html ?? '')))));
  if (!chars.length) return '';

  const firstMark = chars.findIndex((ch) => ch.m);
  const s0 = firstMark < 0 ? 0 : firstMark;
  let e0 = s0;
  if (firstMark >= 0) while (e0 < chars.length && chars[e0].m) e0 += 1;

  // Pagefind's window opens wherever its word count lands; a capital or a
  // digit first (past any opening quote) is taken as a sentence start.
  const rawOpensSentence = opensSentence(chars);

  // --- start ---------------------------------------------------------------
  let start = 0;
  let startAtSentence = rawOpensSentence;
  if (s0 > lead || !rawOpensSentence) {
    let found = -1;
    for (let i = s0; i >= Math.max(0, s0 - reach); i -= 1) {
      if (i === 0 ? rawOpensSentence : sentenceStartsAt(chars, i)) {
        found = i;
        break;
      }
    }
    if (found >= 0) {
      start = found;
      startAtSentence = true;
    } else if (s0 > lead) {
      // The first break at or after (match - lead), never past the match.
      let i = s0 - lead;
      while (i < s0 && !canBreakBefore(chars, i)) i += 1;
      start = i;
      startAtSentence = false;
    }
  }

  // --- end -----------------------------------------------------------------
  const markEnd = Math.max(e0, s0);
  let end = chars.length;
  let endAtSentence = sentenceEndsAt(chars, chars.length - 1);
  // The budget is in plain-character widths; a match is set bold, so each of
  // its characters counts a little wider.
  let fit = start;
  for (let used = 0; fit < chars.length; fit += 1) {
    used += chars[fit].m ? BOLD_WIDTH : 1;
    if (used > max) break;
  }
  if (fit < chars.length) {
    const limit = Math.max(fit, markEnd);
    let best = -1;
    // Prefer the last sentence end in reach that keeps the match and at least
    // half the budget.
    for (let i = limit - 1; i >= Math.max(markEnd - 1, start + Math.floor(max / 2)); i -= 1) {
      if (sentenceEndsAt(chars, i)) {
        best = i + 1;
        break;
      }
    }
    if (best > 0) {
      end = best;
      endAtSentence = true;
    } else {
      let i = limit;
      while (i > markEnd && !canBreakBefore(chars, i)) i -= 1;
      end = i;
      endAtSentence = false;
    }
  }

  let win = chars.slice(start, end);
  const cutStart = !startAtSentence;
  win = trimEdges(win);
  win = balance(win, cutStart);
  win = collapse(trimEdges(collapse(win)));
  if (!win.length) return '';

  const leading = !startAtSentence || !opensSentence(win);
  const trailing = !endAtSentence || !sentenceEndsAt(win, win.length - 1);
  const body = serialize(win);
  return `${leading ? ELLIPSIS : ''}${body}${trailing ? ELLIPSIS : ''}`;
}
