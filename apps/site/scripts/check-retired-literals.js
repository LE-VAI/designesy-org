#!/usr/bin/env node
/**
 * retired literals: no retired brand colour ships.
 *
 * WHY THIS EXISTS
 * Identity v1 retired the old signal blue, the old activation yellow, the
 * indigo pass and head hues and the orange grade D (brand ledger D4, D5, D19,
 * D33). The token swap moved every token, but a token swap cannot see a
 * literal: a hard-coded hex in a share card, a favicon, a badge, a demo
 * swatch or a lab preset kept painting the retired colour after the tokens
 * had moved. Before this gate the site carried the old blue 16 times in 12
 * files, its rgb() form 9 times and the old yellow 5 times. Migration exits
 * only when this reads 0 (brand verdict, ruling H).
 *
 * WHAT IT MATCHES
 * Each retired colour as a hex (#rrggbb, or #rrggbbaa with an alpha), case
 * insensitive, and the old blue's rgb()/rgba() form with commas or spaces.
 * A longer hex that merely starts with the same digits does not match.
 *
 * WHAT IT READS
 * Shipped site code and public assets: app/, public/ (including the per-page
 * markdown generate-markdown.js writes there, when it has run),
 * middleware.ts and next.config.ts. Not scripts/: the gates are not shipped,
 * and several of them quote a retired value on purpose to explain what they
 * guard against.
 *
 * THE ALLOWLIST
 * Explicit, per file and per line, each with its reason. An entry that no
 * longer matches anything fails the gate too, so the list cannot outlive the
 * lines it excuses.
 *
 * Usage:  node scripts/check-retired-literals.js [--json] [--root <site dir>]
 *         node scripts/check-retired-literals.js --self-test
 * Exits 1 on any finding outside the allowlist, or on a stale allowlist entry.
 */

const fs = require('node:fs');
const path = require('node:path');

/** The retired colours, with the decision that retired each. */
const RETIRED_HEX = [
  { hex: '0133cb', why: 'old signal blue (D19)' },
  { hex: 'fecc34', why: 'old activation yellow (D4, retired)' },
  { hex: 'fecc35', why: 'the share-card yellow asterisk (D24)' },
  { hex: '2c50ec', why: 'old indigo pass hue (D33)' },
  { hex: '5b7cff', why: 'old indigo pass hue (D33)' },
  { hex: '3a63f5', why: 'old indigo pass hue (D33)' },
  { hex: '8aa0ff', why: 'old indigo head hue (D33)' },
  { hex: 'ea580c', why: 'old grade D orange, light (D5)' },
  { hex: 'fb923c', why: 'old grade D orange, dark (D5)' },
  { hex: 'f97316', why: 'old grade D glow (D5)' },
];

function buildPatterns() {
  const pats = RETIRED_HEX.map(({ hex, why }) => ({
    label: `#${hex}`,
    why,
    // #rrggbb or #rrggbbaa, and not the first six digits of a longer hex.
    re: new RegExp(`#${hex}(?:[0-9a-f]{2})?(?![0-9a-f])`, 'gi'),
  }));
  pats.push({
    label: 'rgb(1,51,203)',
    why: 'old signal blue, rgb form (D19)',
    // rgb(1,51,203) rgba(1, 51, 203, .2) rgb(1 51 203 / .4)
    re: /rgba?\(\s*1\s*[,\s]\s*51\s*[,\s]\s*203(?![0-9])/gi,
  });
  for (const p of pats) {
    // A pattern that cannot match anything is a gate that cannot fail.
    if (!(p.re instanceof RegExp)) throw new Error(`pattern for ${p.label} did not compile`);
  }
  return pats;
}

/**
 * Lines allowed to carry a retired literal. `file` is relative to the site
 * root (forward slashes); `includes` must appear on the line itself.
 */
const ALLOWLIST = [
  {
    file: 'app/lib/design-system-contract.ts',
    includes: 'Azure #0A94FF replaces #0133cb as --signal',
    reason:
      'Changelog history: the contract adoption_history entry for v0.4.4 records which value Azure replaced. History states what was, so it keeps the old value.',
  },
  {
    file: 'public/changelog.md',
    includes: 'Azure #0A94FF replaces #0133cb as --signal',
    reason:
      'The same v0.4.4 history entry, as the /changelog page renders it into its generated markdown (generate-markdown.js). Present only after a build.',
    optional: true,
  },
  {
    file: 'public/contracts/design-system.md',
    includes: 'Azure #0A94FF replaces #0133cb as --signal',
    reason:
      'The same v0.4.4 history entry, as /contracts/design-system lists the adoption history in its generated markdown. Present only after a build.',
    optional: true,
  },
];

const ROOT_FILES = ['middleware.ts', 'next.config.ts'];
const ROOT_DIRS = ['app', 'public'];
const TEXT_EXT = new Set([
  '.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.css', '.svg', '.json', '.md', '.txt',
  '.html', '.xml', '.webmanifest', '.yml', '.yaml',
]);

function walk(dir, out) {
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const e of entries) {
    if (e.name === 'node_modules' || e.name === '.next') continue;
    const full = path.join(dir, e.name);
    if (e.isDirectory()) walk(full, out);
    else if (TEXT_EXT.has(path.extname(e.name).toLowerCase())) out.push(full);
  }
  return out;
}

function scan(siteRoot, patterns) {
  const files = [];
  for (const d of ROOT_DIRS) walk(path.join(siteRoot, d), files);
  for (const f of ROOT_FILES) if (fs.existsSync(path.join(siteRoot, f))) files.push(path.join(siteRoot, f));

  const findings = [];
  for (const full of files) {
    const rel = path.relative(siteRoot, full).split(path.sep).join('/');
    const lines = fs.readFileSync(full, 'utf8').split(/\r?\n/);
    lines.forEach((line, i) => {
      for (const p of patterns) {
        p.re.lastIndex = 0;
        let m;
        while ((m = p.re.exec(line))) {
          findings.push({ file: rel, line: i + 1, literal: m[0], retired: p.label, why: p.why, text: line.trim().slice(0, 160) });
        }
      }
    });
  }
  return { files: files.length, findings };
}

function classify(findings) {
  const used = new Set();
  const blocked = [];
  const allowed = [];
  for (const f of findings) {
    const idx = ALLOWLIST.findIndex((a) => a.file === f.file && f.text.includes(a.includes));
    if (idx === -1) blocked.push(f);
    else {
      used.add(idx);
      allowed.push({ ...f, reason: ALLOWLIST[idx].reason });
    }
  }
  const stale = ALLOWLIST.filter((a, i) => !used.has(i) && !a.optional);
  return { blocked, allowed, stale };
}

function selfTest(patterns) {
  // Every form the gate claims to catch, and the near misses it must not.
  const must = [
    '#0133CB', '#0133cb', '#0133cb24', '#FECC34', '#fecc35', '#2c50ec', '#5B7CFF', '#3a63f5',
    '#8aa0ff', '#EA580C', '#fb923c', '#F97316', 'rgb(1,51,203)', 'rgba(1, 51, 203, 0.14)',
    'rgb(1 51 203 / .42)', 'RGB( 1 , 51 , 203 )',
  ];
  const mustNot = ['#0133cb2', '#0133cbab12', '#0A94FF', '#FFC400', 'rgb(1,51,2030)', 'rgb(11,51,203)', '#fecc3', '#36A7FF'];
  const hit = (s) => patterns.some((p) => { p.re.lastIndex = 0; return p.re.test(s); });
  const missed = must.filter((s) => !hit(s));
  const falsePos = mustNot.filter((s) => hit(s));
  const ok = missed.length === 0 && falsePos.length === 0;
  console.log(`retired-literals self-test: ${must.length - missed.length}/${must.length} caught, ${falsePos.length} false positives`);
  if (missed.length) console.log('  missed: ' + missed.join(', '));
  if (falsePos.length) console.log('  false positives: ' + falsePos.join(', '));
  return ok;
}

function main() {
  const args = process.argv.slice(2);
  const asJson = args.includes('--json');
  const rootIdx = args.indexOf('--root');
  const siteRoot = rootIdx !== -1 ? path.resolve(args[rootIdx + 1]) : path.join(__dirname, '..');
  const patterns = buildPatterns();

  if (args.includes('--self-test')) process.exit(selfTest(patterns) ? 0 : 1);
  // The gate also proves its patterns on every run, so a broken pattern can
  // never read as a clean site.
  if (!selfTest(patterns)) process.exit(1);

  const { files, findings } = scan(siteRoot, patterns);
  const { blocked, allowed, stale } = classify(findings);
  const ok = blocked.length === 0 && stale.length === 0;

  if (asJson) {
    console.log(JSON.stringify({ ok, files, blocked, allowed, stale }, null, 2));
  } else {
    const byLiteral = {};
    for (const f of blocked) byLiteral[f.retired] = (byLiteral[f.retired] || 0) + 1;
    console.log(`retired-literals: ${files} files read, ${blocked.length} blocked, ${allowed.length} allowlisted, ${stale.length} stale allowlist entries`);
    for (const p of patterns) console.log(`  ${p.label.padEnd(14)} ${byLiteral[p.label] || 0}`);
    for (const f of blocked) console.log(`  BLOCKED ${f.file}:${f.line}  ${f.literal}  (${f.why})`);
    for (const f of allowed) console.log(`  allowed ${f.file}:${f.line}  ${f.literal}`);
    for (const a of stale) console.log(`  STALE allowlist entry: ${a.file} "${a.includes}"`);
  }
  process.exit(ok ? 0 : 1);
}

main();
