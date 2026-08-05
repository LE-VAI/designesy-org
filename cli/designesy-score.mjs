#!/usr/bin/env node
// designesy-score — CLI for the Designesy design-contract verification engine.
//
// Scores a URL against the 40-check engine at /api/score (same engine that
// powers designesy.org). Prints a formatted report to stdout. Exits with code 1
// when the score drops below --min-score or the grade drops below --min-grade.
//
// Subcommands:
//   verify <url>     Check if a site serves a valid /DESIGN.md (spec-layer only)
//
// Zero dependencies — Node built-ins only (matches the action's dist/index.js).
//
// Usage:
//   node cli/designesy-score.mjs <url> [options]
//   npx designesy-score <url> [options]          (after npm publish)
//   npx designesy-score verify <url> [options]   (DESIGN.md spec-layer check)
//
// Options:
//   --format <f>      Emission format: designesy (default), canonical, review, google
//   --api <url>       Scoring engine base URL (default: https://www.designesy.org
//                     or $SCORE_API if set)
//   --min-score <n>   Fail (exit 1) if score < n (default: 0 = disabled)
//   --min-grade <g>   Fail (exit 1) if grade is worse than g (default: "" = disabled)
//   --json            Output raw JSON (no formatted report)
//   --quiet           Only output on failure (for CI noise reduction)

const GRADE_RANK = { A: 5, B: 4, C: 3, D: 2, F: 1 };

function parseArgs(argv) {
  const args = { url: '', format: 'designesy', api: '', minScore: 0, minGrade: '', json: false, quiet: false };
  const rest = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--format') { args.format = argv[++i]; continue; }
    if (a === '--api') { args.api = argv[++i]; continue; }
    if (a === '--min-score') { args.minScore = parseFloat(argv[++i]) || 0; continue; }
    if (a === '--min-grade') { args.minGrade = (argv[++i] || '').toUpperCase().charAt(0); continue; }
    if (a === '--json') { args.json = true; continue; }
    if (a === '--quiet') { args.quiet = true; continue; }
    if (a === '--help' || a === '-h') {
      printUsage();
      process.exit(0);
    }
    if (a.startsWith('--')) {
      console.error(`Unknown option: ${a}`);
      process.exit(2);
    }
    rest.push(a);
  }
  if (rest.length > 0) args.url = rest[0];
  return args;
}

function printUsage() {
  console.log(`
designesy-score — Score a URL against the Designesy 40-check engine.

Usage:
  designesy-score <url> [options]

Options:
  --format <f>      Emission format: designesy (default), canonical, review, google
  --api <url>       Scoring engine base URL (default: $SCORE_API or https://www.designesy.org)
  --min-score <n>   Exit 1 if score < n (default: 0 = disabled)
  --min-grade <g>   Exit 1 if grade worse than g (A/B/C/D/F, default: disabled)
  --json            Output raw JSON (no formatted report)
  --quiet           Only output on failure
  --help, -h        Show this help

Environment:
  SCORE_API         Base URL override (same env var as rescore-leaderboard.mjs)

Examples:
  designesy-score designesy.org
  designesy-score linear.app --min-score 70 --min-grade B
  designesy-score vercel.com --format canonical --json

Subcommands:
  verify <url>     Check if a site serves a valid /DESIGN.md (spec-layer only)
`);
}

function printVerifyUsage() {
  console.log(`
designesy-score verify — Check if a site serves a valid /DESIGN.md.

Usage:
  designesy-score verify <url> [options]

Options:
  --api <url>   Scoring engine base URL (default: $SCORE_API or https://www.designesy.org)
  --json        Output raw JSON (no formatted report)
  --quiet       Only output on failure
  --help, -h    Show this help

What it checks:
  Fetches /DESIGN.md from the target URL's origin and runs Google's
  @google/design.md linter (11 rules: broken-ref, missing-primary,
  contrast-ratio, orphaned-tokens, section-order, etc.).

  PASS  — /DESIGN.md served, linted clean (0 errors, 0 warnings)
  WARN  — /DESIGN.md served, lint warnings (0 errors)
  FAIL  — /DESIGN.md served, lint errors
  SKIP  — /DESIGN.md not served (no public convention requires it)

Exit codes:
  0  PASS, WARN, or SKIP
  1  FAIL (lint errors) or engine unreachable
  2  Invalid arguments

Examples:
  designesy-score verify designesy.org
  designesy-score verify linear.app --json
`);
}

function normalizeGrade(g) {
  return String(g || '').trim().toUpperCase().charAt(0);
}

function gradeColor(grade) {
  // ANSI colors for terminal output
  const colors = { A: '\x1b[32m', B: '\x1b[36m', C: '\x1b[33m', D: '\x1b[35m', F: '\x1b[31m' };
  return colors[grade] || '\x1b[0m';
}

const RESET = '\x1b[0m';
const DIM = '\x1b[2m';
const BOLD = '\x1b[1m';

function statusIcon(status) {
  switch (status) {
    case 'PASS': return '\x1b[32m✓\x1b[0m';
    case 'FAIL': return '\x1b[31m✗\x1b[0m';
    case 'WARN': return '\x1b[33m⚠\x1b[0m';
    case 'SKIP': return '\x1b[2m○\x1b[0m';
    default: return '?';
  }
}

function formatReport(data, url) {
  const lines = [];
  const score = data.score;
  const grade = data.grade;
  const pass = data.pass ?? 0;
  const fail = data.fail ?? 0;
  const warn = data.warn ?? 0;
  const skip = data.skip ?? 0;
  const total = data.total ?? 40;
  const a11yFloor = data.a11yFloorApplied;

  lines.push(`${BOLD}Designesy Contract Check${RESET}`);
  lines.push(`${DIM}URL:${RESET}    ${url}`);
  lines.push(`${DIM}Score:${RESET}  ${gradeColor(grade)}${BOLD}${score}${RESET} ${gradeColor(grade)}${BOLD}${grade}${RESET}`);
  lines.push(`${DIM}Checks:${RESET} ${pass} pass · ${warn} warn · ${fail} fail · ${skip} skip ${DIM}(of ${total})${RESET}`);
  if (a11yFloor) lines.push(`${DIM}a11y floor applied (score capped at C)${RESET}`);

  // Category breakdown
  if (data.categoryScores) {
    lines.push('');
    lines.push(`${BOLD}Categories${RESET}`);
    const cats = data.categoryScores;
    const catEntries = Object.entries(cats).sort((a, b) => (b[1]?.weight ?? 0) - (a[1]?.weight ?? 0));
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
  if (data.checks && Array.isArray(data.checks)) {
    const issues = data.checks.filter(c => c.status === 'FAIL' || c.status === 'WARN');
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

async function runVerify(argv) {
  // Parse verify-specific args (url + --api + --json + --quiet + --help)
  let url = '';
  let api = '';
  let json = false;
  let quiet = false;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--api') { api = argv[++i]; continue; }
    if (a === '--json') { json = true; continue; }
    if (a === '--quiet') { quiet = true; continue; }
    if (a === '--help' || a === '-h') {
      printVerifyUsage();
      process.exit(0);
    }
    if (a.startsWith('--')) {
      console.error(`Unknown option: ${a}`);
      process.exit(2);
    }
    if (!url) { url = a; } else {
      console.error(`Error: unexpected argument "${a}". Use --help for usage.`);
      process.exit(2);
    }
  }

  if (!url) {
    console.error('Error: URL is required. Use "designesy-score verify --help" for usage.');
    process.exit(2);
  }

  // Normalize URL — prepend https:// if no scheme
  if (!/^https?:\/\//i.test(url)) url = 'https://' + url;

  const apiBase = (api || process.env.SCORE_API || 'https://www.designesy.org').replace(/\/$/, '');

  if (!quiet) {
    console.log(`${DIM}Verifying /DESIGN.md at ${url} (${apiBase}/api/score, format=google)…${RESET}`);
  }

  // POST to /api/score with format=google — the response contains
  // { findings: [{severity, path, message}], summary: {errors, warnings, infos} }
  // The v37 DESIGN.md check is the finding where path === 'spec'.
  let res, text;
  try {
    res = await fetch(`${apiBase}/api/score`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ url, format: 'google' }),
    });
    text = await res.text();
  } catch (e) {
    console.error(`Error: Could not reach ${apiBase}/api/score: ${e.message}`);
    process.exit(1);
  }

  let body;
  try {
    body = JSON.parse(text);
  } catch {
    console.error(`Error: Non-JSON response (HTTP ${res.status}): ${text.slice(0, 300)}`);
    process.exit(1);
  }

  if (!res.ok || body.ok === false) {
    console.error(`Error: ${body.error || `HTTP ${res.status}`}`);
    process.exit(1);
  }

  // Filter for the v37 spec-layer finding
  const findings = body.findings || [];
  const specFinding = findings.find(f => f.path === 'spec');

  if (json) {
    console.log(JSON.stringify({ url, finding: specFinding || null, summary: body.summary || null }, null, 2));
    // Exit 1 if the spec finding is an error
    process.exit(specFinding && specFinding.severity === 'error' ? 1 : 0);
  }

  if (!specFinding) {
    // No spec finding at all — shouldn't happen, but handle gracefully
    console.log(`${DIM}No DESIGN.md spec-layer check in the response.${RESET}`);
    process.exit(0);
  }

  const msg = specFinding.message || '';
  const severity = specFinding.severity || 'info';

  // Determine verdict: SKIP (not served), PASS (clean), WARN (warnings), FAIL (errors)
  const isSkip = msg.includes('not publicly served') || msg.includes('not served');
  const isFail = severity === 'error';
  const isWarn = severity === 'warning' && !isFail;

  if (isSkip) {
    if (!quiet) {
      console.log(`\n${DIM}SKIP${RESET} — /DESIGN.md not publicly served`);
      console.log(`${DIM}No public convention requires it yet.${RESET}`);
    }
    process.exit(0);
  }

  if (isFail) {
    const errors = body.summary?.errors ?? 0;
    console.log(`\n${BOLD}\x1b[31mFAIL${RESET} — ${errors} error(s) in /DESIGN.md`);
    console.log(`${DIM}${msg}${RESET}`);
    process.exit(1);
  }

  if (isWarn) {
    const warnings = body.summary?.warnings ?? 0;
    console.log(`\n${BOLD}\x1b[33mWARN${RESET} — ${warnings} warning(s) in /DESIGN.md`);
    console.log(`${DIM}${msg}${RESET}`);
    process.exit(0);
  }

  // PASS — clean lint
  const infos = body.summary?.infos ?? 0;
  if (!quiet) {
    console.log(`\n${BOLD}\x1b[32mPASS${RESET} — /DESIGN.md linted clean`);
    console.log(`${DIM}${infos} info(s), 0 errors, 0 warnings${RESET}`);
    console.log(`${DIM}Google validates the file; designesy validates the design system.${RESET}`);
  }
  process.exit(0);
}

async function main() {
  const argv = process.argv.slice(2);

  // Subcommand dispatch — intercept 'verify' before the flat-arg parser,
  // otherwise 'verify' gets mis-parsed as a URL.
  if (argv[0] === 'verify') {
    return runVerify(argv.slice(1));
  }

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

  const api = (args.api || process.env.SCORE_API || 'https://www.designesy.org').replace(/\/$/, '');
  const url = args.url;

  if (!args.quiet) {
    console.log(`${DIM}Scoring ${url} against the Designesy 40-check engine (${api}/api/score, format=${args.format})…${RESET}`);
  }

  let res, text;
  try {
    res = await fetch(`${api}/api/score`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json, text/markdown' },
      body: JSON.stringify({ url, format: args.format }),
    });
    text = await res.text();
  } catch (e) {
    console.error(`Error: Could not reach ${api}/api/score: ${e.message}`);
    process.exit(1);
  }

  // review format returns markdown, not JSON
  if (args.format === 'review') {
    if (args.json) {
      console.log(JSON.stringify({ ok: true, markdown: text }));
    } else {
      console.log(text);
    }
    process.exit(0);
  }

  let body;
  try {
    body = JSON.parse(text);
  } catch {
    console.error(`Error: Non-JSON response (HTTP ${res.status}): ${text.slice(0, 300)}`);
    process.exit(1);
  }

  if (!res.ok || body.ok === false) {
    console.error(`Error: ${body.error || `HTTP ${res.status}`}`);
    process.exit(1);
  }

  // Extract score/grade across designesy/canonical/google formats
  const score = typeof body.score === 'number' ? body.score
    : (body.summary && typeof body.summary.score === 'number') ? body.summary.score
    : NaN;
  const grade = normalizeGrade(body.grade)
    || (body.summary && body.summary.grade ? normalizeGrade(body.summary.grade) : '');

  if (args.json) {
    console.log(JSON.stringify(body, null, 2));
  } else if (!args.quiet || (args.minScore > 0 && score < args.minScore) || (args.minGrade && grade && GRADE_RANK[grade] < GRADE_RANK[args.minGrade])) {
    // Print formatted report (always in non-quiet mode, or on failure in quiet mode)
    if (args.format === 'google') {
      const gErr = body.summary?.errors ?? 0;
      const gWarn = body.summary?.warnings ?? 0;
      const gInfo = body.summary?.infos ?? 0;
      console.log(`${BOLD}Designesy Contract Check${RESET}`);
      console.log(`${DIM}URL:${RESET}    ${url}`);
      console.log(`${DIM}Format:${RESET} google (design.md-compatible)`);
      console.log(`${DIM}Result:${RESET} ${gErr} errors · ${gWarn} warnings · ${gInfo} infos`);
    } else if (!Number.isNaN(score) && grade) {
      console.log(formatReport(body, url));
    } else {
      console.log(JSON.stringify(body, null, 2));
    }
  }

  // Gate check (exit code)
  if (!Number.isNaN(score) && grade) {
    if (args.minScore > 0 && score < args.minScore) {
      console.error(`\n${BOLD}Quality gate failed${RESET}: score ${score} is below the ${args.minScore} floor.`);
      process.exit(1);
    }
    if (args.minGrade && GRADE_RANK[grade] < GRADE_RANK[args.minGrade]) {
      console.error(`\n${BOLD}Quality gate failed${RESET}: grade ${grade} is worse than the ${args.minGrade} minimum.`);
      process.exit(1);
    }
  }

  if (!args.quiet) {
    console.log(`\n${BOLD}Quality gate passed${RESET}`);
  }
}

main().catch((e) => {
  console.error(`Unhandled error: ${e.message}`);
  process.exit(1);
});