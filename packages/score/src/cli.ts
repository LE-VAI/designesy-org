#!/usr/bin/env node
/**
 * @designesy/score CLI — Score a URL against the 42-check Designesy engine.
 *
 * Runs the full 42-check scoring engine locally — no server required.
 * Fetches the target URL, extracts CSS + :root tokens, runs all checks,
 * and prints a formatted report. Exits with code 1 when the score drops
 * below --min-score or the grade drops below --min-grade.
 *
 * Usage:
 *   designesy-score <url> [options]
 *   npx designesy-score linear.app --min-score 70 --min-grade B
 *   npx designesy-score designesy.org --format canonical --json
 *
 * Options:
 *   --format <f>      Emission format: designesy (default), canonical, review, google
 *   --scope <s>       Scoring scope: contract (strict) or universal (fair, default auto)
 *   --min-score <n>   Fail (exit 1) if score < n (default: 0 = disabled)
 *   --min-grade <g>   Fail (exit 1) if grade is worse than g (default: "" = disabled)
 *   --json            Output raw JSON (no formatted report)
 *   --quiet           Only output on failure (for CI noise reduction)
 *   --help, -h        Show this help
 */

import { scoreUrl, normalizeInputUrl, isValidUrl, emitDesignesy, emitCanonical, emitGoogle, emitReview, type ScoreScope } from './engine.js';

const GRADE_RANK: Record<string, number> = { A: 5, B: 4, C: 3, D: 2, F: 1 };
const RESET = '\x1b[0m';
const DIM = '\x1b[2m';
const BOLD = '\x1b[1m';

function gradeColor(grade: string): string {
  const colors: Record<string, string> = { A: '\x1b[32m', B: '\x1b[36m', C: '\x1b[33m', D: '\x1b[35m', F: '\x1b[31m' };
  return colors[grade] || '\x1b[0m';
}

function statusIcon(status: string): string {
  switch (status) {
    case 'PASS': return '\x1b[32m✓\x1b[0m';
    case 'FAIL': return '\x1b[31m✗\x1b[0m';
    case 'WARN': return '\x1b[33m⚠\x1b[0m';
    case 'SKIP': return '\x1b[2m○\x1b[0m';
    case 'MANUAL': return '\x1b[2m?\x1b[0m';
    default: return '?';
  }
}

function formatReport(result: Awaited<ReturnType<typeof scoreUrl>>, url: string): string {
  const lines: string[] = [];
  lines.push(`${BOLD}Designesy Contract Check${RESET}`);
  lines.push(`${DIM}URL:${RESET}    ${url}`);
  lines.push(`${DIM}Score:${RESET}  ${gradeColor(result.grade)}${BOLD}${result.score}${RESET} ${gradeColor(result.grade)}${BOLD}${result.grade}${RESET}`);
  lines.push(`${DIM}Checks:${RESET} ${result.pass} pass · ${result.warn} warn · ${result.fail} fail · ${result.skip} skip ${DIM}(of ${result.total})${RESET}`);
  if (result.a11yFloorApplied) lines.push(`${DIM}a11y floor applied (score capped at C)${RESET}`);
  if (result.hardFailCeilingApplied && result.hardFailCeilingReason) lines.push(`${DIM}hard-fail ceiling: ${result.hardFailCeilingReason}${RESET}`);

  // Slop + originality
  if (result.slop.total > 0) {
    lines.push(`${DIM}Anti-slop:${RESET} -${result.slop.total}pts (${result.slop.convergences || 'none'})`);
  }
  if (result.originality.points > 0) {
    lines.push(`${DIM}Originality:${RESET} +${result.originality.points}pts (${result.originality.summary})`);
  }

  // Category breakdown
  if (result.categoryScores) {
    lines.push('');
    lines.push(`${BOLD}Categories${RESET}`);
    const catEntries = Object.entries(result.categoryScores).sort((a, b) => (b[1]?.weight ?? 0) - (a[1]?.weight ?? 0));
    for (const [cat, info] of catEntries) {
      if (!info || info.score === null) continue;
      const catScore = info.score;
      const catGrade = catScore >= 90 ? 'A' : catScore >= 80 ? 'B' : catScore >= 70 ? 'C' : catScore >= 60 ? 'D' : 'F';
      const w = info.weight ?? 0;
      const p = info.pass ?? 0, f = info.fail ?? 0, wn = info.warn ?? 0, s = info.skip ?? 0;
      lines.push(`  ${gradeColor(catGrade)}${String(catScore).padStart(5)}${RESET} ${DIM}w${w}${RESET}  ${cat.padEnd(16)} ${p}p/${wn}w/${f}f/${s}s`);
    }
  }

  // Per-check detail (only show FAIL and WARN; PASS/SKIP are noise)
  if (result.checks && Array.isArray(result.checks)) {
    const issues = result.checks.filter(c => c.status === 'FAIL' || c.status === 'WARN');
    if (issues.length > 0) {
      lines.push('');
      lines.push(`${BOLD}Findings${RESET}`);
      for (const c of issues) {
        lines.push(`  ${statusIcon(c.status)} ${c.id} ${BOLD}${c.item}${RESET} ${DIM}[${c.category}]${RESET}`);
        if (c.detail) lines.push(`     ${DIM}${c.detail}${RESET}`);
        if (c.remediation) lines.push(`     ${DIM}→ ${c.remediation}${RESET}`);
      }
    }
  }

  return lines.join('\n');
}

function printUsage(): void {
  console.log(`
designesy-score — Score a URL against the 42-check Designesy engine.

Runs locally — no server required. Fetches the URL, extracts CSS + tokens,
and runs all 42 checks in one process.

Usage:
  designesy-score <url> [options]

Options:
  --format <f>      Emission format: designesy (default), canonical, review, google
  --scope <s>       Scoring scope: contract (strict) or universal (fair, default auto)
  --min-score <n>   Exit 1 if score < n (default: 0 = disabled)
  --min-grade <g>   Exit 1 if grade worse than g (A/B/C/D/F, default: disabled)
  --json            Output raw JSON (no formatted report)
  --quiet           Only output on failure
  --help, -h        Show this help

Examples:
  designesy-score designesy.org
  designesy-score linear.app --min-score 70 --min-grade B
  designesy-score vercel.com --format canonical --json
  designesy-score stripe.com --format review
`);
}

interface ParsedArgs {
  url: string;
  format: string;
  scope: string;
  minScore: number;
  minGrade: string;
  json: boolean;
  quiet: boolean;
}

function parseArgs(argv: string[]): ParsedArgs {
  const args: ParsedArgs = { url: '', format: 'designesy', scope: '', minScore: 0, minGrade: '', json: false, quiet: false };
  const rest: string[] = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--format') { args.format = argv[++i] || ''; continue; }
    if (a === '--scope') { args.scope = argv[++i] || ''; continue; }
    if (a === '--min-score') { args.minScore = parseFloat(argv[++i] || '0') || 0; continue; }
    if (a === '--min-grade') { args.minGrade = (argv[++i] || '').toUpperCase().charAt(0); continue; }
    if (a === '--json') { args.json = true; continue; }
    if (a === '--quiet') { args.quiet = true; continue; }
    if (a === '--help' || a === '-h') { printUsage(); process.exit(0); }
    if (a.startsWith('--')) { console.error(`Unknown option: ${a}`); process.exit(2); }
    rest.push(a);
  }
  if (rest.length > 0) args.url = rest[0];
  return args;
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const args = parseArgs(argv);

  if (!args.url) {
    console.error('Error: URL is required. Use --help for usage.');
    process.exit(2);
  }

  const VALID_FORMATS = ['designesy', 'canonical', 'review', 'google'];
  if (!VALID_FORMATS.includes(args.format)) {
    console.error(`Error: --format must be one of ${VALID_FORMATS.join(', ')} (got "${args.format}").`);
    process.exit(2);
  }

  if (args.minGrade && !(args.minGrade in GRADE_RANK)) {
    console.error(`Error: --min-grade must be one of A, B, C, D, F (got "${args.minGrade}").`);
    process.exit(2);
  }

  const url = normalizeInputUrl(args.url);
  if (!url || !isValidUrl(url)) {
    console.error(`Error: Invalid URL "${args.url}". Enter a valid domain like designesy.org or nike.com.`);
    process.exit(2);
  }

  let scope: ScoreScope | undefined;
  if (args.scope === 'contract' || args.scope === 'universal') scope = args.scope;

  if (!args.quiet) {
    console.log(`${DIM}Scoring ${url} locally (42-check engine, scope=${scope || 'auto'})…${RESET}`);
  }

  let result;
  try {
    result = await scoreUrl(url, scope);
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Unknown error';
    console.error(`Error: Could not score ${url}: ${msg}`);
    process.exit(1);
  }

  if (args.format === 'review') {
    const markdown = emitReview(url, result);
    if (args.json) {
      console.log(JSON.stringify({ ok: true, markdown }));
    } else {
      console.log(markdown);
    }
  } else if (args.format === 'google') {
    const out = emitGoogle(result);
    if (args.json || !args.quiet) console.log(JSON.stringify(out, null, 2));
  } else if (args.format === 'canonical') {
    const out = emitCanonical(url, result);
    if (args.json || !args.quiet) console.log(JSON.stringify(out, null, 2));
  } else {
    // designesy (default)
    const out = emitDesignesy(result);
    if (args.json) {
      console.log(JSON.stringify(out, null, 2));
    } else if (!args.quiet) {
      console.log(formatReport(result, url));
    }
  }

  // Gate check (exit code)
  const score = result.score;
  const grade = result.grade;
  if (args.minScore > 0 && score < args.minScore) {
    console.error(`\n${BOLD}Quality gate failed${RESET}: score ${score} is below the ${args.minScore} floor.`);
    process.exit(1);
  }
  if (args.minGrade && GRADE_RANK[grade] < GRADE_RANK[args.minGrade]) {
    console.error(`\n${BOLD}Quality gate failed${RESET}: grade ${grade} is worse than the ${args.minGrade} minimum.`);
    process.exit(1);
  }

  if (!args.quiet) {
    console.log(`\n${BOLD}Quality gate passed${RESET}`);
  }
}

main().catch((e) => {
  console.error(`Unhandled error: ${e instanceof Error ? e.message : String(e)}`);
  process.exit(1);
});