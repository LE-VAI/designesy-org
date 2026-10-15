#!/usr/bin/env node
/**
 * Comment provenance ratchet: no tracked source file may gain a citation of
 * something a reader of this repository cannot open.
 *
 * THE RULE
 * A comment explains the code to a stranger, using only things that stranger
 * can open: what the code does and why (the constraint it guards), a spec or
 * standard, a file or route in this repo, a public URL, a CHANGELOG version.
 * It does not cite decision IDs from a record outside the repo, attribute a
 * rule to a person ("owner decision", "operator feedback"), point at an
 * unpublished spec or handoff document by section number, or name an internal
 * review. State the rule itself instead: "no coloured edge stripes on cards",
 * "No A while any check FAILs (engine 1.3.0, see CHANGELOG)". The test: could
 * an outside contributor act on this comment without asking anyone?
 *
 * WHAT IT COUNTS
 * Every file `git ls-files` lists under apps/, packages/, scripts/, .github/,
 * cli/ and action/ with a source or text extension (.ts .tsx .js .mjs .cjs
 * .css .py .yml .yaml .json .md), except CHANGELOG.md files (release history),
 * test fixtures, node_modules, dist, this file and its baseline. In each, the
 * matches of PATTERN below, case-insensitive. The whole file is read, not only
 * its comments: the same words in a string or a doc are the same reference.
 *
 * A RATCHET, NOT A BAN
 * scripts/comment-provenance-baseline.json records each file's count. A file
 * that goes above its count, or a file with a match that is not in the
 * baseline, fails, and the gate prints every match in it so the new one is easy
 * to find. A file that drops below its count passes and says so; run
 * `node scripts/check-comment-provenance.js --update` in the same commit to
 * lower the baseline. `--update` refuses to record a rise, so the baseline can
 * only go down. What remains is known debt (for example the own-contract
 * modules' section references to the engine spec, which is not yet published).
 *
 * A GATE THAT CANNOT FAIL PROVES NOTHING
 * Every run first checks PATTERN against strings it must match and strings it
 * must not (product words such as the homepage's system state ledger and the
 * word "operator" alone), and fails if it misjudges either.
 *
 * CI only: it reads files outside apps/site and needs git, and a Vercel build
 * may upload only apps/site (see CI_ONLY in check-gate-parity.js).
 *
 * Usage (from apps/site):
 *   node scripts/check-comment-provenance.js            the gate; exit 1 on a rise
 *   node scripts/check-comment-provenance.js --update   lower the baseline after a cleanup
 *   node scripts/check-comment-provenance.js --json     machine-readable result
 */

const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const SITE = path.join(__dirname, '..');
const BASELINE = path.join(__dirname, 'comment-provenance-baseline.json');

const PATTERN =
  /brand ledger|ledger D[0-9]|owner[- ](decision|approved|ruling)|owner decisions?|operator (decision|feedback|brief|correction)|explicitly rejected|engine spec|HANDOFF [0-9O]|brand review|\bVWP\b|landing task/gi;

const ROOTS = ['apps', 'packages', 'scripts', '.github', 'cli', 'action'];
const EXTENSIONS = new Set(['.ts', '.tsx', '.js', '.mjs', '.cjs', '.css', '.py', '.yml', '.yaml', '.json', '.md']);

const MUST_MATCH = [
  '// (brand ledger D62)',
  '/* ledger D5 */',
  '(owner decision 2026-10-11)',
  'owner-approved layout',
  'Owner decisions D1, D3',
  'an operator decision, 2026-09-30',
  'which the operator explicitly rejected',
  '(engine spec 6.3)',
  '(HANDOFF 10.2)',
  'HANDOFF O2',
  'the set the brand review approved',
  'VWP Stage-1 receipt',
  "the owner's Monday landing task",
];
const MUST_NOT_MATCH = [
  '.home-ledger-fact a',
  "The homepage's system state ledger: its fact links",
  'the operator runs the browser',
  "relationship: 'operator'",
  'Atlassian design tokens',
  'the open handoff pack',
  'a brand colour',
];

function selfTest() {
  const bad = [];
  for (const s of MUST_MATCH) if (!new RegExp(PATTERN.source, 'i').test(s)) bad.push(`should match: ${s}`);
  for (const s of MUST_NOT_MATCH) if (new RegExp(PATTERN.source, 'i').test(s)) bad.push(`should not match: ${s}`);
  return bad;
}

function repoRoot() {
  return execFileSync('git', ['rev-parse', '--show-toplevel'], { cwd: SITE, encoding: 'utf8' }).trim();
}

function trackedFiles(root) {
  const out = execFileSync('git', ['ls-files', '-z', '--', ...ROOTS], { cwd: root, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  const self = path.relative(root, __filename).split(path.sep).join('/');
  const base = path.relative(root, BASELINE).split(path.sep).join('/');
  return out
    .split('\0')
    .filter(Boolean)
    .filter((f) => EXTENSIONS.has(path.extname(f).toLowerCase()))
    .filter((f) => path.basename(f) !== 'CHANGELOG.md')
    .filter((f) => !/(^|\/)(node_modules|dist|fixtures|__fixtures__)\//.test(f))
    .filter((f) => f !== self && f !== base);
}

function scan(root) {
  const counts = {};
  const lines = {};
  for (const f of trackedFiles(root)) {
    const abs = path.join(root, f);
    if (!fs.existsSync(abs)) continue;
    const text = fs.readFileSync(abs, 'utf8');
    const hits = [];
    text.split(/\r?\n/).forEach((line, i) => {
      const n = (line.match(PATTERN) || []).length;
      if (n) hits.push({ line: i + 1, n, text: line.trim().slice(0, 160) });
    });
    if (hits.length) {
      counts[f] = hits.reduce((a, h) => a + h.n, 0);
      lines[f] = hits;
    }
  }
  return { counts, lines };
}

function sum(obj) {
  return Object.values(obj).reduce((a, b) => a + b, 0);
}

function main() {
  const asJson = process.argv.includes('--json');
  const update = process.argv.includes('--update');

  const broken = selfTest();
  if (broken.length) {
    console.error('[comment-provenance] the pattern self-test failed, so a clean scan would prove nothing:');
    for (const b of broken) console.error('  ' + b);
    process.exit(1);
  }

  let root;
  try {
    root = repoRoot();
  } catch (e) {
    console.error(`[comment-provenance] git is required to list tracked files (${e.message.split('\n')[0]})`);
    process.exit(1);
  }

  const { counts, lines } = scan(root);
  const base = fs.existsSync(BASELINE) ? JSON.parse(fs.readFileSync(BASELINE, 'utf8')).files || {} : {};

  const worse = Object.keys(counts)
    .filter((f) => counts[f] > (base[f] || 0))
    .sort()
    .map((f) => ({ file: f, count: counts[f], baseline: base[f] || 0, hits: lines[f] }));
  const better = Object.keys(base)
    .filter((f) => (counts[f] || 0) < base[f])
    .sort();

  if (update) {
    // With no baseline yet, the first --update records the current debt.
    if (worse.length && fs.existsSync(BASELINE)) {
      console.error(`[comment-provenance] not updating: ${worse.length} file(s) rose above the baseline. Rewrite those references first.`);
      for (const w of worse) console.error(`  ${w.file}: ${w.count} (baseline ${w.baseline})`);
      process.exit(1);
    }
    const sorted = Object.fromEntries(Object.keys(counts).sort().map((f) => [f, counts[f]]));
    const doc = {
      _about:
        'Per-file match counts for check-comment-provenance.js. A file may not rise above its count and no new file may appear; lower the counts with --update after a cleanup.',
      files: sorted,
    };
    fs.writeFileSync(BASELINE, JSON.stringify(doc, null, 1) + '\n');
    console.log(`[comment-provenance] baseline written: ${Object.keys(sorted).length} file(s), ${sum(sorted)} match(es)`);
    return;
  }

  if (asJson) {
    console.log(JSON.stringify({ ok: worse.length === 0, worse, better, totals: { files: Object.keys(counts).length, matches: sum(counts), baseline: { files: Object.keys(base).length, matches: sum(base) } } }, null, 2));
    process.exit(worse.length ? 1 : 0);
  }

  for (const w of worse) {
    console.error(`  FAIL ${w.file}: ${w.count} match(es) (baseline ${w.baseline})`);
    for (const h of w.hits) console.error(`       ${w.file}:${h.line}: ${h.text}`);
  }
  if (better.length) {
    console.log(`[comment-provenance] ${better.length} file(s) below baseline (${better.slice(0, 6).join(', ')}${better.length > 6 ? ', ...' : ''}): run --update to lower it`);
  }
  if (worse.length) {
    console.error(`[comment-provenance] ${worse.length} file(s) gained a reference a reader cannot open.`);
    console.error('  Fix: state the rule the reference stands for (what the code guards, and why), and cite only what');
    console.error('  a reader can open: a file or route in this repo, a public URL, a spec or standard, a CHANGELOG version.');
    console.error('  Drop decision IDs, "owner decision" style attributions, handoff and review names. The header of');
    console.error('  scripts/check-comment-provenance.js has the full rule.');
    process.exit(1);
  }
  console.log(
    `[comment-provenance] OK - ${Object.keys(counts).length} file(s), ${sum(counts)} match(es) (baseline ${Object.keys(base).length} file(s), ${sum(base)} match(es))`,
  );
}

main();
