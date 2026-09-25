#!/usr/bin/env node
/**
 * use-client-first gate — assert the `'use client'` directive has no code before it.
 *
 * WHY THIS EXISTS
 * On 2026-09-24 a count-migration batch inserted an import ABOVE the
 * `'use client'` directive in app/lib/command-palette.tsx. That file is imported
 * by the topbar, so EVERY page in the site returned 500 — a full outage from one
 * misplaced line. SWC's message names it precisely:
 *
 *   "The 'use client' directive must be placed before other expressions."
 *
 * It cost real time to recover, and it was caught only because I happened to run
 * tsc before committing. Nothing in the build guarded the rule, and the failure
 * mode is maximal: one file takes down every route that transitively imports it.
 *
 * WHY THIS IS WORTH A DEDICATED GATE
 * The directive-ordering rule is a Next.js/React constraint, not a TypeScript
 * one, so tsc alone does not catch it — tsc reported the symptom as unrelated
 * module errors elsewhere. And the blast radius is the whole site rather than a
 * page, which makes it the highest-severity static defect available in this
 * codebase.
 *
 * THE RULE, VERIFIED AGAINST THIS REPO
 * Comments before the directive ARE legal: app/score/score-form.tsx has two
 * file-header comments above `'use client'` and builds in production. Imports
 * and statements are not. So this gate flags only non-comment, non-blank
 * content preceding the directive — flagging comments would break a
 * legitimate file that ships today.
 *
 * Scope: 56 files in this app carry the directive. The 6+ files this session's
 * migration scripts touched are the ones at risk, because the insertion
 * heuristic ("after the last import") lands in exactly the wrong place.
 *
 * Usage:  node scripts/check-use-client-first.js [--json]
 * Exits 1 on any finding, so it can gate CI.
 */

const fs = require('node:fs');
const path = require('node:path');

const APP = path.join(__dirname, '..');
const SCAN_ROOT = path.join(APP, 'app');
const SKIP_DIRS = new Set(['node_modules', '.next', '.git', 'public']);

const DIRECTIVE_RE = /^\s*['"]use client['"];?\s*$/;

function* walk(dir) {
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const e of entries) {
    if (SKIP_DIRS.has(e.name)) continue;
    const full = path.join(dir, e.name);
    if (e.isDirectory()) yield* walk(full);
    else if (/\.(tsx?|jsx?)$/.test(e.name)) yield full;
  }
}

/**
 * True when a line contributes no executable content: blank, or a comment.
 * Note this treats a standalone `*` (a block-comment continuation) as a comment
 * line, which is how the two pre-directive header comments in score-form.tsx
 * are written.
 */
function isCommentOrBlank(line) {
  const t = line.trim();
  if (t === '') return true;
  if (t.startsWith('//')) return true;
  if (t.startsWith('/*')) return true;
  if (t.startsWith('*')) return true;
  return false;
}

function main() {
  const asJson = process.argv.includes('--json');
  const findings = [];
  let scanned = 0;
  let withDirective = 0;

  for (const file of walk(SCAN_ROOT)) {
    scanned++;
    let src;
    try {
      src = fs.readFileSync(file, 'utf8');
    } catch {
      continue;
    }
    const lines = src.split(/\r?\n/);
    // The directive must be near the top; anything further down is prose.
    const limit = Math.min(lines.length, 20);
    let dirIdx = -1;
    for (let i = 0; i < limit; i++) {
      if (DIRECTIVE_RE.test(lines[i])) {
        dirIdx = i;
        break;
      }
    }
    if (dirIdx === -1) continue;
    withDirective++;

    const preceding = [];
    for (let i = 0; i < dirIdx; i++) {
      if (!isCommentOrBlank(lines[i])) preceding.push({ line: i + 1, text: lines[i].trim().slice(0, 90) });
    }
    if (preceding.length > 0) {
      findings.push({
        file: path.relative(APP, file),
        directiveLine: dirIdx + 1,
        preceding,
      });
    }
  }

  if (asJson) {
    console.log(JSON.stringify({ ok: findings.length === 0, scanned, withDirective, findings }, null, 2));
  } else if (findings.length === 0) {
    console.log(`use-client-first: OK — ${withDirective} client component(s) have the directive before any code (${scanned} files scanned)`);
  } else {
    console.error(`use-client-first: ${findings.length} file(s) have CODE before 'use client'\n`);
    for (const f of findings) {
      console.error(`  ${f.file}: directive on line ${f.directiveLine}, but line ${f.preceding[0].line} precedes it:`);
      for (const p of f.preceding.slice(0, 3)) console.error(`      L${p.line}: ${p.text}`);
    }
    console.error(`\n  Fix: move 'use client' above every import and statement.`);
    console.error(`  Comments may stay above it (score-form.tsx does this and builds).`);
    console.error(`  Next.js fails these files with: "The 'use client' directive must be placed before other expressions."`);
  }

  process.exit(findings.length === 0 ? 0 : 1);
}

main();
