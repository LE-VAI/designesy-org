/**
 * The retired-literal patterns, built from the one canonical list.
 *
 * Both retired-literal gates in this repo (the site's and the packages') load
 * the list through here, so neither carries its own copy of the colours. The
 * list itself is data, in ../retired-literals.json, so a consumer outside this
 * repo (designesy/score-action) can read the same file without running this
 * code.
 */

const fs = require('node:fs');
const path = require('node:path');

const LIST_PATH = path.join(__dirname, '..', 'retired-literals.json');

/** Reads and checks the canonical list. Throws on any malformed entry. */
function loadList(file = LIST_PATH) {
  const list = JSON.parse(fs.readFileSync(file, 'utf8'));
  if (list.schema !== 1) throw new Error(`${file}: unknown schema ${list.schema}`);
  if (!Array.isArray(list.hex) || list.hex.length === 0) throw new Error(`${file}: hex list is empty`);
  for (const h of list.hex) {
    if (!/^[0-9a-f]{6}$/.test(h.hex) || !h.why) throw new Error(`${file}: bad hex entry ${JSON.stringify(h)}`);
  }
  for (const r of list.rgb || []) {
    const ok = Array.isArray(r.rgb) && r.rgb.length === 3 && r.rgb.every((c) => Number.isInteger(c) && c >= 0 && c <= 255);
    if (!ok || !r.label || !r.why) throw new Error(`${file}: bad rgb entry ${JSON.stringify(r)}`);
  }
  const st = list.selfTest || {};
  if (!Array.isArray(st.mustMatch) || !st.mustMatch.length || !Array.isArray(st.mustNotMatch) || !st.mustNotMatch.length) {
    throw new Error(`${file}: selfTest.mustMatch and selfTest.mustNotMatch must both be non-empty`);
  }
  return list;
}

function buildPatterns(list = loadList()) {
  const pats = list.hex.map(({ hex, why }) => ({
    label: `#${hex}`,
    why,
    // #rrggbb or #rrggbbaa, and not the first six digits of a longer hex.
    re: new RegExp(`#${hex}(?:[0-9a-f]{2})?(?![0-9a-f])`, 'gi'),
  }));
  for (const { label, rgb, why } of list.rgb || []) {
    const [r, g, b] = rgb;
    pats.push({
      label,
      why,
      // rgb(1,51,203) rgba(1, 51, 203, .2) rgb(1 51 203 / .4)
      re: new RegExp(`rgba?\\(\\s*${r}\\s*[,\\s]\\s*${g}\\s*[,\\s]\\s*${b}(?![0-9])`, 'gi'),
    });
  }
  for (const p of pats) {
    // A pattern that cannot match anything is a gate that cannot fail.
    if (!(p.re instanceof RegExp)) throw new Error(`pattern for ${p.label} did not compile`);
  }
  return pats;
}

/**
 * Proves the patterns against the list's own vectors: every mustMatch string
 * is caught, no mustNotMatch string is, and every pattern catches at least
 * one vector (a pattern no vector exercises is a pattern nothing proves).
 * Prints one summary line; returns true when all three hold.
 */
function selfTest(patterns, list = loadList(), tag = 'retired-literals') {
  const must = list.selfTest.mustMatch;
  const mustNot = list.selfTest.mustNotMatch;
  const test = (p, s) => { p.re.lastIndex = 0; return p.re.test(s); };
  const hit = (s) => patterns.some((p) => test(p, s));
  const missed = must.filter((s) => !hit(s));
  const falsePos = mustNot.filter((s) => hit(s));
  const unproved = patterns.filter((p) => !must.some((s) => test(p, s))).map((p) => p.label);
  const ok = missed.length === 0 && falsePos.length === 0 && unproved.length === 0;
  console.log(`${tag} self-test: ${must.length - missed.length}/${must.length} caught, ${falsePos.length} false positives`);
  if (missed.length) console.log('  missed: ' + missed.join(', '));
  if (falsePos.length) console.log('  false positives: ' + falsePos.join(', '));
  if (unproved.length) console.log('  patterns no mustMatch vector exercises: ' + unproved.join(', '));
  return ok;
}

/** Every retired literal on one line of text, in pattern order. */
function matchLine(line, patterns) {
  const out = [];
  for (const p of patterns) {
    p.re.lastIndex = 0;
    let m;
    while ((m = p.re.exec(line))) out.push({ literal: m[0], retired: p.label, why: p.why });
  }
  return out;
}

module.exports = { LIST_PATH, loadList, buildPatterns, selfTest, matchLine };
