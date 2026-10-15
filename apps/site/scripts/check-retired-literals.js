#!/usr/bin/env node
/**
 * retired literals: no retired brand colour ships.
 *
 * WHY THIS EXISTS
 * Identity v1 retired the old signal blue and its light tint, the old
 * activation yellow, the indigo pass and head hues and the orange grade D.
 * The token swap moved every token,
 * but a token swap cannot see a literal: a hard-coded hex in a share card,
 * a favicon, a badge, a demo swatch or a lab preset kept painting the
 * retired colour after the tokens had moved. Before this gate the site carried the old blue 16 times in 12
 * files, its rgb() form 9 times and the old yellow 5 times. Migration exits
 * only when this reads 0 (brand verdict, ruling H).
 *
 * WHAT IT MATCHES
 * Each retired colour as a hex (#rrggbb, or #rrggbbaa with an alpha), case
 * insensitive, and the old blues' rgb()/rgba() forms with commas or spaces.
 * A longer hex that merely starts with the same digits does not match.
 *
 * WHAT IT READS
 * Shipped site code and public assets: app/, public/ (including the per-page
 * markdown generate-markdown.js writes there, when it has run),
 * middleware.ts and next.config.ts. Not scripts/: the gates are not shipped,
 * and several of them quote a retired value on purpose to explain what they
 * guard against.
 *
 * THE LIST
 * The colours are not written here. They live in retired-literals.json next
 * to this script, the one list every retired-literal gate reads (this one,
 * scripts/check-retired-literals-packages.js at the repo root for every
 * package, and designesy/score-action at a pinned commit), so the copies
 * cannot drift. The list carries its own self-test vectors.
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

// The retired colours, their patterns and the self-test vectors come from
// the one canonical list (retired-literals.json), shared
// with the packages gate and with designesy/score-action.
const { buildPatterns, selfTest, matchLine } = require('./lib/retired-literals');

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
  {
    file: 'app/globals.css',
    includes: 'It was --signal-light (#3358e8), which on the dark theme measured',
    reason:
      'A comment, not a paint: the focus-ring note records which value --signal-access replaced and the contrast it measured, so a later reader knows why the ring moved. History states what was.',
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
      for (const m of matchLine(line, patterns)) {
        findings.push({ file: rel, line: i + 1, literal: m.literal, retired: m.retired, why: m.why, text: line.trim().slice(0, 160) });
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
