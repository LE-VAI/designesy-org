#!/usr/bin/env node
/**
 * Voice ratchet: no page may gain em dashes or rhetorical negation pivots.
 *
 * WHY THIS EXISTS
 * On 2026-09-28 the older pages carried 872 lines with an em dash and 160
 * "not X, but Y" pivots in their visible copy (every disclosure opened). A
 * voice pass and an editorial contract revision (v0.4.1) took that to what the
 * baseline below records. Nothing stopped the next page from bringing them
 * back: agent-written copy reaches for both by reflex, and neither breaks a
 * build, a type check or the prose gate.
 *
 * WHAT IT COUNTS
 * The visible text of every prerendered page (the prose gate's extractor, so
 * both gates read the same characters; <head> is left out, so route metadata
 * is not counted), per route:
 *   - em dashes;
 *   - negation pivots: "not X, but Y", "not just/only/merely", "isn't X. It's
 *     Y", "are not X. They are Y", and ", not x" used for emphasis.
 * Factual negatives ("It does not store your URL") do not match these.
 *
 * A RATCHET, NOT A BAN
 * scripts/voice-baseline.json records each route's counts. A route that goes
 * above its baseline fails, and the gate prints every hit on that route so
 * the new one is easy to find. A route that drops below it passes and says so;
 * `node scripts/check-voice.js --update` then lowers the baseline in the same
 * commit. What remains is quotation, route text that mirrors engine output,
 * and pages not yet revised, each of which can only shrink.
 *
 * Usage:  node scripts/check-voice.js [--update] [--json]
 * Exits 1 when any route rises above its baseline.
 */

const fs = require('node:fs');
const path = require('node:path');
const { visibleText } = require('./prose-lint.js');

const APP = path.join(__dirname, '..');
const NEXT_APP = path.join(APP, '.next', 'server', 'app');
const BASELINE = path.join(__dirname, 'voice-baseline.json');

const PIVOTS = [
  /\bnot\b[^.!?\n]{1,80}?,\s*but\b/gi,
  /\bnot (?:just|only|merely)\b/gi,
  /\b(?:is|are|was|were)n'?t\b[^.!?\n]{1,60}[.;]\s+(?:it|they|this|that)(?:'s| is| are)\b/gi,
  /\bare not\b[^.!?\n]{1,60}\.\s+(?:They|It) (?:are|is)\b/gi,
  /,\s*not\s+[a-z]/gi,
];

function hits(text) {
  const out = { emDash: [], pivot: [] };
  const around = (i, n) => text.slice(Math.max(0, i - 60), Math.min(text.length, i + n + 60)).trim();
  for (const m of text.matchAll(/—/g)) out.emDash.push(around(m.index, 1));
  for (const re of PIVOTS) for (const m of text.matchAll(re)) out.pivot.push(around(m.index, m[0].length));
  return out;
}

function routes() {
  const files = [];
  (function walk(dir) {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) walk(p);
      else if (e.name.endsWith('.html') && !e.name.startsWith('_')) files.push(p);
    }
  })(NEXT_APP);
  return files.map((f) => {
    const html = fs.readFileSync(f, 'utf8');
    const body = html.slice(Math.max(0, html.indexOf('<body')));
    const route = '/' + path.relative(NEXT_APP, f).replace(/\.html$/, '').replace(/\\/g, '/');
    return { route: route === '/index' ? '/' : route, ...hits(visibleText(body)) };
  });
}

function main() {
  if (!fs.existsSync(NEXT_APP)) {
    console.error('[voice] .next/server/app not found - run the build first');
    process.exit(1);
  }
  const now = routes().sort((a, b) => a.route.localeCompare(b.route));
  const counts = Object.fromEntries(now.filter((r) => r.emDash.length || r.pivot.length).map((r) => [r.route, [r.emDash.length, r.pivot.length]]));

  if (process.argv.includes('--update')) {
    const doc = {
      _about: 'Per-route [em dashes, negation pivots] in visible copy. check-voice.js fails a route that rises above these; lower them with --update when a route improves.',
      routes: counts,
    };
    fs.writeFileSync(BASELINE, JSON.stringify(doc, null, 1) + '\n');
    console.log(`[voice] baseline written: ${Object.keys(counts).length} route(s) with a remaining hit`);
    return;
  }

  const base = fs.existsSync(BASELINE) ? JSON.parse(fs.readFileSync(BASELINE, 'utf8')).routes : {};
  const worse = [];
  const better = [];
  let em = 0, pv = 0, bem = 0, bpv = 0;
  for (const r of now) {
    const [be, bp] = base[r.route] || [0, 0];
    em += r.emDash.length; pv += r.pivot.length; bem += be; bpv += bp;
    if (r.emDash.length > be || r.pivot.length > bp) worse.push({ ...r, be, bp });
    else if (r.emDash.length < be || r.pivot.length < bp) better.push(r.route);
  }

  if (process.argv.includes('--json')) {
    console.log(JSON.stringify({ worse, better, totals: { emDash: em, pivot: pv, baseline: { emDash: bem, pivot: bpv } } }, null, 2));
    process.exit(worse.length ? 1 : 0);
  }
  for (const w of worse) {
    console.log(`  FAIL ${w.route}: em dashes ${w.emDash.length} (baseline ${w.be}), pivots ${w.pivot.length} (baseline ${w.bp})`);
    if (w.emDash.length > w.be) for (const c of w.emDash.slice(0, 8)) console.log(`       — ${c}`);
    if (w.pivot.length > w.bp) for (const c of w.pivot.slice(0, 8)) console.log(`       not ${c}`);
  }
  if (better.length) {
    console.log(`[voice] ${better.length} route(s) below baseline (${better.slice(0, 6).join(', ')}${better.length > 6 ? ', ...' : ''}): run --update to lower it`);
  }
  console.log(
    worse.length
      ? `[voice] ${worse.length} route(s) gained em dashes or negation pivots: rewrite them (a colon, a period, parentheses; the positive claim)`
      : `[voice] OK - ${now.length} routes; em dashes ${em} (baseline ${bem}), pivots ${pv} (baseline ${bpv})`,
  );
  process.exit(worse.length ? 1 : 0);
}

main();
