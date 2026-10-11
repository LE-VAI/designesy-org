/**
 * Word boundaries for the search index.
 *
 * React writes no whitespace between elements, and Pagefind adds a space only
 * at the block elements it knows (p, div, li, headings). Everything else is
 * read as one run of text: two spans the stylesheet sets on separate lines,
 * two table cells, a dt and its dd, a button and the link beside it. So the
 * index held 5,610 such run-ons on 93 pages, among them:
 *
 *     designesy.org/frameworks/mozaika-designmozaika.designDesign Systemsscored
 *     08Scroll padding-top        (a check card's number, then its title)
 *     Score it againVisit         (two buttons)
 *     Wordmark breathCollapses    (a card title, then its note)
 *
 * which breaks search for every word involved ("visit" does not find
 * "againVisit") and puts the run-together text in the palette's excerpts.
 *
 * Measured on every indexed page, rendered at 1440 (2026-10-11): of 19,607
 * places where a letter or digit meets a letter or digit across an element
 * boundary, 16,751 render apart (another line or a visible gap), 2,856 are
 * not rendered (screen-reader text, closed disclosures) and none render
 * touching. So at such a boundary a reader always sees two words, and the
 * index should too. separateWords() adds that one space to the copy of each
 * page Pagefind indexes (scripts/postbuild-pagefind.js); the pages served to
 * readers are not changed.
 *
 * Where punctuation meets a word ("--ink" then ",", "/labs/" then
 * "poise.json"), the same measurement found both, so those boundaries are
 * left as they are.
 *
 * Not separated: a boundary whose tags are all inline formatting (FORMATTING:
 * <em>un</em>believable, x<sup>2</sup>, de<mark>sign</mark>, a lone <wbr>),
 * text inside <sup>, <sub> or <abbr>, two CJK characters (those scripts put
 * no space between words), anything inside <pre>, and a name in
 * JOINED_NAMES. Every space that is added must render apart in the served
 * page: scripts/check-word-boundaries-render.js measures each one in CI and
 * fails the build on one that renders touching.
 */

'use strict';

const WORD = /[\p{L}\p{N}]/u;

/** Scripts written without spaces between words: a space between two of their characters is wrong. */
const CJK = /[\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff\uac00-\ud7af\uf900-\ufaff]/u;

/**
 * Names that stay one word even if markup ever splits them. Each entry says
 * why. A boundary inside one of these is styling, never a separator.
 */
const JOINED_NAMES = [
  { name: 'JavaScript', reason: 'a product name written as one word; a boundary inside it would be styling, never two words' },
  { name: 'TypeScript', reason: 'a product name written as one word; a boundary inside it would be styling, never two words' },
];

/**
 * Inline formatting: these mark part of a run of text (a stressed syllable,
 * an exponent, a highlighted fragment), so text on either side of their tags
 * can be one word: <em>un</em>believable, x<sup>2</sup>, de<mark>sign</mark>.
 * A boundary whose tags are all of these is never separated. span, a, small,
 * code and time are not on the list: on this site they carry separate items
 * (a card's title and its note, two buttons, a label and its suffix), and the
 * render gate (check-word-boundaries-render.js) fails the build if a space
 * lands where the two sides render touching.
 */
const FORMATTING = new Set(['b', 'strong', 'i', 'em', 'u', 's', 'mark', 'sup', 'sub', 'abbr', 'cite', 'dfn', 'q', 'ins', 'del', 'var', 'kbd', 'wbr']);

/** Text inside these is never split, whatever the tags around it. */
const NEVER_INSIDE = new Set(['sup', 'sub', 'abbr']);

const SKIP = new Set(['script', 'style', 'template', 'textarea', 'pre', 'noscript', 'head']);
const VOID = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'source', 'track', 'wbr']);

function decode(s) {
  return s
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&(quot|apos|lt|gt|nbsp|amp);/g, (_, n) => ({ quot: '"', apos: "'", lt: '<', gt: '>', nbsp: ' ', amp: '&' })[n]);
}

function joinedName(tail, head) {
  const run = tail + head;
  return JOINED_NAMES.some(({ name }) => {
    for (let i = run.indexOf(name); i >= 0; i = run.indexOf(name, i + 1)) {
      if (i < tail.length && i + name.length > tail.length) return true;
    }
    return false;
  });
}

/**
 * Walk an HTML document and call visit(boundary) at every place where two
 * text runs meet across element tags with no whitespace between them.
 * boundary = { at, tail, head, tags, names, inside } where `at` is the index
 * in html where the second run starts, tail/head are the words on either
 * side (decoded), tags is the markup between them, names the element names
 * in that markup, and inside the elements open around either run.
 */
function walkBoundaries(html, visit) {
  const re = /<!--[\s\S]*?-->|<(\/?)([a-zA-Z][\w-]*)((?:[^>"']|"[^"]*"|'[^']*')*)>|([^<]+)|</g;
  let m;
  const skip = []; // names of open skipped elements
  const open = []; // names of open elements, outermost first
  let prev = null; // decoded text of the previous run
  let prevOpen = []; // open elements around it
  let tags = ''; // markup since the previous run
  let names = [];
  while ((m = re.exec(html))) {
    if (m[0].startsWith('<!--')) continue; // React's <!-- --> joins one text run
    if (m[2]) {
      const name = m[2].toLowerCase();
      const closing = m[1] === '/';
      const selfClose = /\/\s*$/.test(m[3] || '') || VOID.has(name);
      if (SKIP.has(name) && !selfClose) {
        if (closing) {
          if (skip[skip.length - 1] === name) skip.pop();
        } else skip.push(name);
        prev = null;
        tags = '';
        names = [];
        continue;
      }
      if (skip.length) continue;
      if (!selfClose) {
        if (closing) {
          const k = open.lastIndexOf(name);
          if (k >= 0) open.length = k;
        } else open.push(name);
      }
      if (name === 'br') prev = null;
      tags += m[0];
      names.push(name);
      continue;
    }
    if (skip.length) continue;
    const text = decode(m[4] ?? m[0]);
    if (!text.trim()) {
      prev = null; // whitespace between the runs: already two words
      tags = '';
      names = [];
      continue;
    }
    if (prev !== null && tags) {
      const tail = (prev.match(/(\S{1,40})$/) || ['', ''])[1];
      const head = (text.match(/^(\S{1,40})/) || ['', ''])[1];
      if (tail && head) visit({ at: m.index, tail, head, tags, names, inside: [...new Set([...prevOpen, ...open])] });
    }
    prev = text;
    prevOpen = open.slice();
    tags = '';
    names = [];
  }
}

/**
 * True when a space belongs at the boundary: a word meets a word, the tags
 * between are not all inline formatting, neither run sits in sup, sub or
 * abbr, the two characters are not both CJK, and no name keeps them one.
 */
function glues({ tail, head, names = [], inside = [] }) {
  const a = tail.slice(-1);
  const b = head[0];
  if (!WORD.test(a) || !WORD.test(b)) return false;
  if (CJK.test(a) && CJK.test(b)) return false;
  if (names.length && names.every((n) => FORMATTING.has(n))) return false;
  if (inside.some((n) => NEVER_INSIDE.has(n))) return false;
  return !joinedName(tail, head);
}

/** Where separateWords puts a space: indexes into html, ascending. */
function separationPoints(html) {
  const at = [];
  walkBoundaries(html, (b) => {
    if (glues(b)) at.push(b.at);
  });
  return at;
}

/** html with `insert` placed at each of the ascending indexes `at`. */
function insertAt(html, at, insert) {
  let out = '';
  let last = 0;
  for (const i of at) {
    out += html.slice(last, i) + insert;
    last = i;
  }
  return out + html.slice(last);
}

/** The document with one space added at every boundary that glues two words. */
function separateWords(html) {
  const at = separationPoints(html);
  return { html: insertAt(html, at, ' '), inserted: at.length };
}

/** Every boundary in a document that glues two words: [{ tail, head, tags }]. */
function gluedBoundaries(html) {
  const out = [];
  walkBoundaries(html, (b) => {
    if (glues(b)) out.push(b);
  });
  return out;
}

module.exports = { WORD, CJK, JOINED_NAMES, FORMATTING, NEVER_INSIDE, separateWords, separationPoints, insertAt, gluedBoundaries, walkBoundaries };
