#!/usr/bin/env node
/**
 * Console tally gate: the verify console's accessible name says the same
 * numbers its window shows.
 *
 * WHY THIS EXISTS (2026-10-11)
 * The homepage console (lib/verify-console.tsx) is a role="img" figure. Its
 * window shows a tally, and its aria-label is what a screen reader hears
 * instead. When the self-score's counts do not reconcile with the check
 * registry, the window resolves every automated check to a neutral "ran" and
 * shows "41 ran"; the aria-label was built from the seed counts beside it and
 * said "40 pass, 1 warn, 0 fail". Both were true, and they were two different
 * numbers for one fact, depending on whether you could see the screen. The
 * label is now built from the tally the window shows (the visible tally is
 * canonical), and this gate holds the two together.
 *
 * WHAT IT ASSERTS, ON THE PRERENDERED HOME PAGE (.next/server/app/index.html)
 * The window renders each tally line as <li data-tally="<label>"> holding a
 * digit strip whose shown value is data-value. For every line, the label must
 * contain "<value> ... <label>" (a spoken phrase that ends with the visible
 * word, such as "<value> automated checks ran"). And in the other direction, every
 * "<number> ... pass|warn|fail|ran|by a person" the label says must be a line
 * the window shows, with the same number. So a label that adds a count, drops
 * one or changes one fails.
 *
 * A gate that cannot fail proves nothing: before reading the build it runs the
 * same comparison on a known-good pair and on the shipped defect, and exits 1
 * if it misjudges either.
 *
 * Usage: node scripts/check-console-tally-name.js   (after next build; exit 1 on a mismatch)
 */

const fs = require('node:fs');
const path = require('node:path');

const HTML = path.join(__dirname, '..', '.next', 'server', 'app', 'index.html');
const WORDS = ['by a person', 'pass', 'warn', 'fail', 'ran'];

const decode = (s) =>
  s.replace(/&quot;/g, '"').replace(/&#x27;/g, "'").replace(/&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');

/** The visible tally lines: [{ label, value }]. */
function visibleTally(html) {
  const ul = html.match(/<ul class="vc-tally">([\s\S]*?)<\/ul>/);
  if (!ul) return null;
  const lines = [];
  const re = /<li[^>]*\bdata-tally="([^"]+)"[^>]*>([\s\S]*?)<\/li>/g;
  let m;
  while ((m = re.exec(ul[1]))) {
    const v = m[2].match(/data-value="(\d+)"/);
    lines.push({ label: decode(m[1]), value: v ? Number(v[1]) : NaN });
  }
  return lines;
}

/** The console window's accessible name. */
function windowName(html) {
  const tag = html.match(/<div[^>]*class="vc-window"[^>]*>/);
  if (!tag) return null;
  const name = tag[0].match(/aria-label="([^"]*)"/);
  return name ? decode(name[1]) : null;
}

/** The counts the name states: [{ label, value }]. */
function spokenCounts(name) {
  const out = [];
  const re = new RegExp(`(\\d+) (?:[a-z ]*? )?(${WORDS.join('|')})\\b`, 'g');
  let m;
  while ((m = re.exec(name))) out.push({ label: m[2], value: Number(m[1]) });
  return out;
}

function compare(lines, name) {
  const problems = [];
  if (!lines || lines.length === 0) return ['the window shows no tally lines'];
  if (!name) return ['the console window has no aria-label'];
  const said = spokenCounts(name);
  for (const l of lines) {
    if (!Number.isFinite(l.value)) problems.push(`tally line "${l.label}" has no data-value`);
    else if (!said.some((s) => s.label === l.label && s.value === l.value))
      problems.push(`the window shows "${l.value} ${l.label}", the accessible name does not say it`);
  }
  for (const s of said) {
    if (!lines.some((l) => l.label === s.label && l.value === s.value))
      problems.push(`the accessible name says "${s.value} ... ${s.label}", the window does not show it`);
  }
  return problems;
}

// Self-test: the comparison must pass the fixed pair and fail the shipped defect
// (the counts are variables so the count-literal gate reads no claim here).
const AUTO = 41;
const PERSON = 3;
const good = compare([{ label: 'ran', value: AUTO }], `x verified against contract v1: ${AUTO} automated checks ran. Score 100%, grade A.`);
const defect = compare([{ label: 'ran', value: AUTO }], `x verified against contract v1: ${AUTO - 1} pass, 1 warn, 0 fail. Score 100%, grade A.`);
const reconciledGood = compare(
  [{ label: 'pass', value: AUTO }, { label: 'by a person', value: PERSON }, { label: 'warn', value: 0 }, { label: 'fail', value: 0 }],
  `x: ${AUTO} automated checks pass, ${PERSON} checks are run by a person, 0 warn and 0 fail. Score 100%.`
);
if (good.length || reconciledGood.length || defect.length === 0) {
  console.error('[console-tally] self-test failed: the comparison misjudged a known pair', { good, reconciledGood, defect });
  process.exit(1);
}

if (!fs.existsSync(HTML)) {
  console.error(`[console-tally] ${path.relative(process.cwd(), HTML)} not found: run next build first`);
  process.exit(1);
}
const html = fs.readFileSync(HTML, 'utf8');
const lines = visibleTally(html);
const name = windowName(html);
const problems = compare(lines, name);
if (problems.length) {
  console.error('[console-tally] FAIL: the verify console says one thing and shows another');
  for (const p of problems) console.error('  - ' + p);
  console.error(`  name: ${name}`);
  process.exit(1);
}
console.log(`[console-tally] OK - the accessible name states the tally the window shows: ${lines.map((l) => `${l.value} ${l.label}`).join(', ')}`);
