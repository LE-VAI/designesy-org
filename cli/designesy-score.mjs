#!/usr/bin/env node
// designesy-score v1.0.0 — CLI for the Designesy 40-check design-contract engine.
//
// v1.0.0 BREAKING CHANGE: the engine now runs LOCALLY — no server required.
// Fetches the target URL, extracts CSS + :root tokens, runs all 40 checks
// in-process, and prints a formatted report. Zero dependencies (Node built-ins only).
//
// The --api flag and $SCORE_API env var remain as a REMOTE FALLBACK for anyone
// who relied on the old API client behavior (pre-1.0.0). When --api is set,
// the CLI POSTs to the remote /api/score endpoint instead of running locally.
//
// Subcommands:
//   verify <url>     Run the v37 DESIGN.md spec-layer check (local or remote)
//
// Usage:
//   node cli/designesy-score.mjs <url> [options]
//   npx designesy-score <url> [options]
//   npx designesy-score verify <url> [options]
//
// Options:
//   --format <f>      Emission format: designesy (default), canonical, review, google
//   --scope <s>       Scoring scope: contract (strict) or universal (fair, default auto)
//                     [NEW in 1.0.0 — only for local engine]
//   --api <url>       Remote fallback: use a scoring server instead of local engine
//                     (default: $SCORE_API or disabled. Set to use the old API client mode)
//   --min-score <n>   Fail (exit 1) if score < n (default: 0 = disabled)
//   --min-grade <g>   Fail (exit 1) if grade is worse than g (default: "" = disabled)
//   --json            Output raw JSON (no formatted report)
//   --quiet           Only output on failure (for CI noise reduction)

import { scoreUrl, normalizeInputUrl, isValidUrl, emitDesignesy, emitCanonical, emitGoogle, emitReview } from '../packages/score/dist/engine.js';
import https from 'node:https';

const GRADE_RANK = { A: 5, B: 4, C: 3, D: 2, F: 1 };

const RESET = '\x1b[0m';
const DIM = '\x1b[2m';
const BOLD = '\x1b[1m';

function gradeColor(grade) {
  const colors = { A: '\x1b[32m', B: '\x1b[36m', C: '\x1b[33m', D: '\x1b[35m', F: '\x1b[31m' };
  return colors[grade] || '\x1b[0m';
}

function statusIcon(status) {
  switch (status) {
    case 'PASS': return '\x1b[32m✓\x1b[0m';
    case 'FAIL': return '\x1b[31m✗\x1b[0m';
    case 'WARN': return '\x1b[33m⚠\x1b[0m';
    case 'SKIP': return '\x1b[2m○\x1b[0m';
    case 'MANUAL': return '\x1b[2m?\x1b[0m';
    default: return '?';
  }
}

function normalizeGrade(g) {
  return String(g || '').trim().toUpperCase().charAt(0);
}

function formatReport(result, url) {
  const lines = [];
  lines.push(`${BOLD}Designesy Contract Check${RESET}`);
  lines.push(`${DIM}URL:${RESET}    ${url}`);
  lines.push(`${DIM}Score:${RESET}  ${gradeColor(result.grade)}${BOLD}${result.score}${RESET} ${gradeColor(result.grade)}${BOLD}${result.grade}${RESET}`);
  lines.push(`${DIM}Checks:${RESET} ${result.pass} pass · ${result.warn} warn · ${result.fail} fail · ${result.skip} skip ${DIM}(of ${result.total})${RESET}`);
  if (result.a11yFloorApplied) lines.push(`${DIM}a11y floor applied (score capped at C)${RESET}`);

  // Slop + originality
  if (result.slop && result.slop.total > 0) {
    lines.push(`${DIM}Anti-slop:${RESET} -${result.slop.total}pts (${result.slop.convergences || 'none'})`);
  }
  if (result.originality && result.originality.points > 0) {
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

function parseArgs(argv) {
  const args = { url: '', format: 'designesy', scope: '', api: '', minScore: 0, minGrade: '', json: false, quiet: false };
  const rest = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--format') { args.format = argv[++i]; continue; }
    if (a === '--scope') { args.scope = argv[++i]; continue; }
    if (a === '--api') { args.api = argv[++i]; continue; }
    if (a === '--min-score') { args.minScore = parseFloat(argv[++i]) || 0; continue; }
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

function printUsage() {
  console.log(`
designesy-score v1.0.0 — 40-check design-contract scoring engine.

Runs LOCALLY — no server required. Fetches the URL, extracts CSS + tokens,
and runs all 40 checks in one process. Zero dependencies.

Usage:
  designesy-score <url> [options]

Options:
  --format <f>      Emission format: designesy (default), canonical, review, google
  --scope <s>       Scoring scope: contract (strict) or universal (fair, default auto)
                    [NEW in 1.0.0]
  --api <url>       Remote fallback: use a scoring server instead of local engine
                    (default: $SCORE_API or disabled — set to use old API client mode)
  --min-score <n>   Exit 1 if score < n (default: 0 = disabled)
  --min-grade <g>   Exit 1 if grade worse than g (A/B/C/D/F, default: disabled)
  --json            Output raw JSON (no formatted report)
  --quiet           Only output on failure
  --help, -h        Show this help

Environment:
  SCORE_API         If set, uses remote API client mode (same as --api)

Examples:
  designesy-score designesy.org
  designesy-score linear.app --min-score 70 --min-grade B
  designesy-score vercel.com --format canonical --json
  designesy-score stripe.com --format review
  designesy-score example.com --scope universal

Subcommands:
  verify <url>     Run the v37 DESIGN.md spec-layer check

What's new in 1.0.0:
  • Local engine — no server dependency, no rate limits, works offline*
  • --scope flag (contract vs universal) for strict or fair scoring
  • Anti-slop deductions + originality lifts in the report
  • Zero dependencies (Node built-ins only)
  * The target URL is fetched over the network; the engine itself runs locally.
 `);
}

function printVerifyUsage() {
  console.log(`
designesy-score verify — Check if a site serves a valid /DESIGN.md.

Runs the local engine's v37 spec-layer check. Fetches /DESIGN.md from the
target URL's origin and lints it (YAML frontmatter + optional Google linter).

Usage:
  designesy-score verify <url> [options]

Options:
  --api <url>   Remote fallback (default: $SCORE_API or local)
  --json        Output raw JSON (no formatted report)
  --quiet       Only output on failure
  --help, -h    Show this help

What it checks:
  Fetches /DESIGN.md and checks for YAML frontmatter. If
  @google/design.md/linter is installed, runs 11 lint rules
  (broken-ref, missing-primary, contrast-ratio, orphaned-tokens, etc.).

  PASS  — /DESIGN.md served, linted clean (0 errors, 0 warnings)
  WARN  — /DESIGN.md served, lint warnings (0 errors)
  FAIL  — /DESIGN.md served, lint errors
  SKIP  — /DESIGN.md not served (no public convention requires it)

Exit codes:
  0  PASS, WARN, or SKIP
  1  FAIL (lint errors) or fetch error
  2  Invalid arguments

Examples:
  designesy-score verify designesy.org
  designesy-score verify linear.app --json
`);
}

// ── Remote fallback (pre-1.0.0 API client mode) ───────────────────────────
// Uses node:https (not fetch) to avoid the Windows libuv crash:
//   Assertion failed: !(handle->flags & UV_HANDLE_CLOSING), src\win\async.c

function httpsPost(apiBase, body, timeoutMs = 15000) {
  return new Promise((resolve, reject) => {
    const url = new URL(`${apiBase}/api/score`);
    const payload = JSON.stringify(body);
    const req = https.request({
      hostname: url.hostname,
      port: url.port || 443,
      path: url.pathname,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json, text/markdown',
        'Content-Length': Buffer.byteLength(payload),
      },
      timeout: timeoutMs,
    }, (res) => {
      let text = '';
      res.setEncoding('utf-8');
      res.on('data', (chunk) => { text += chunk; });
      res.on('end', () => resolve({ ok: (res.statusCode || 0) < 400, status: res.statusCode || 0, text }));
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('Request timed out')); });
    req.write(payload);
    req.end();
  });
}

async function scoreRemote(apiBase, url, format) {
  const res = await httpsPost(apiBase, { url, format });
  if (format === 'review') return { ok: res.ok, markdown: res.text, json: null };
  let body;
  try { body = JSON.parse(res.text); } catch { throw new Error(`Non-JSON response (HTTP ${res.status}): ${res.text.slice(0, 300)}`); }
  if (!res.ok || body.ok === false) throw new Error(body.error || `HTTP ${res.status}`);
  return { ok: true, json: body, markdown: null };
}

async function verifyRemote(apiBase, url) {
  const res = await httpsPost(apiBase, { url, format: 'google' });
  let body;
  try { body = JSON.parse(res.text); } catch { throw new Error(`Non-JSON response (HTTP ${res.status}): ${res.text.slice(0, 300)}`); }
  if (!res.ok || body.ok === false) throw new Error(body.error || `HTTP ${res.status}`);
  return body;
}

// ── Verify subcommand ──────────────────────────────────────────────────────

async function runVerify(argv) {
  let url = '';
  let api = '';
  let json = false;
  let quiet = false;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--api') { api = argv[++i]; continue; }
    if (a === '--json') { json = true; continue; }
    if (a === '--quiet') { quiet = true; continue; }
    if (a === '--help' || a === '-h') { printVerifyUsage(); process.exit(0); }
    if (a.startsWith('--')) { console.error(`Unknown option: ${a}`); process.exit(2); }
    if (!url) { url = a; } else { console.error(`Error: unexpected argument "${a}".`); process.exit(2); }
  }

  if (!url) {
    console.error('Error: URL is required. Use "designesy-score verify --help" for usage.');
    process.exit(2);
  }

  if (!/^https?:\/\//i.test(url)) url = 'https://' + url;
  const normalized = normalizeInputUrl(url);
  if (!normalized || !isValidUrl(normalized)) {
    console.error(`Error: Invalid URL "${url}".`);
    process.exit(2);
  }

  // Remote fallback mode
  if (api || process.env.SCORE_API) {
    const apiBase = (api || process.env.SCORE_API || 'https://www.designesy.org').replace(/\/$/, '');
    if (!quiet) console.log(`${DIM}Verifying /DESIGN.md at ${url} (remote: ${apiBase}/api/score)…${RESET}`);
    let body;
    try {
      body = await verifyRemote(apiBase, url);
    } catch (e) {
      console.error(`Error: ${e.message}`);
      process.exit(1);
    }
    const findings = body.findings || [];
    const specFinding = findings.find(f => f.path === 'spec');
    if (json) {
      console.log(JSON.stringify({ url, finding: specFinding || null, summary: body.summary || null }, null, 2));
      process.exit(specFinding && specFinding.severity === 'error' ? 1 : 0);
    }
    outputSpecFinding(specFinding, body.summary, quiet);
    process.exit(0);
  }

  // Local mode — run the full engine and extract the v37 spec check
  if (!quiet) console.log(`${DIM}Verifying /DESIGN.md at ${url} (local engine)…${RESET}`);
  let result;
  try {
    result = await scoreUrl(normalized);
  } catch (e) {
    console.error(`Error: Could not verify ${url}: ${e.message}`);
    process.exit(1);
  }

  const specCheck = result.checks.find(c => c.id === 'v37');
  if (!specCheck) {
    console.log(`${DIM}No DESIGN.md spec-layer check found.${RESET}`);
    process.exit(0);
  }

  const finding = {
    severity: specCheck.status === 'FAIL' ? 'error' : specCheck.status === 'WARN' ? 'warning' : 'info',
    path: 'spec',
    message: specCheck.detail || '',
  };

  if (json) {
    console.log(JSON.stringify({ url, finding, summary: { errors: result.fail, warnings: result.warn, infos: result.pass } }, null, 2));
    process.exit(finding.severity === 'error' ? 1 : 0);
  }

  outputSpecFinding(finding, { errors: result.fail, warnings: result.warn, infos: result.pass }, quiet);
}

function outputSpecFinding(specFinding, summary, quiet) {
  if (!specFinding) {
    console.log(`${DIM}No DESIGN.md spec-layer check in the response.${RESET}`);
    process.exit(0);
  }

  const msg = specFinding.message || '';
  const severity = specFinding.severity || 'info';

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
    const errors = summary?.errors ?? 0;
    console.log(`\n${BOLD}\x1b[31mFAIL${RESET} — ${errors} error(s) in /DESIGN.md`);
    console.log(`${DIM}${msg}${RESET}`);
    process.exit(1);
  }

  if (isWarn) {
    const warnings = summary?.warnings ?? 0;
    console.log(`\n${BOLD}\x1b[33mWARN${RESET} — ${warnings} warning(s) in /DESIGN.md`);
    console.log(`${DIM}${msg}${RESET}`);
    process.exit(0);
  }

  // PASS
  const infos = summary?.infos ?? 0;
  if (!quiet) {
    console.log(`\n${BOLD}\x1b[32mPASS${RESET} — /DESIGN.md linted clean`);
    console.log(`${DIM}${infos} info(s), 0 errors, 0 warnings${RESET}`);
    console.log(`${DIM}Google validates the file; designesy validates the design system.${RESET}`);
  }
  process.exit(0);
}

// ── Main ───────────────────────────────────────────────────────────────────

async function main() {
  const argv = process.argv.slice(2);

  // Subcommand dispatch
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

  // Remote fallback mode (pre-1.0.0 behavior)
  if (args.api || process.env.SCORE_API) {
    const apiBase = (args.api || process.env.SCORE_API || 'https://www.designesy.org').replace(/\/$/, '');
    const url = args.url;
    if (!args.quiet) console.log(`${DIM}Scoring ${url} (remote: ${apiBase}/api/score, format=${args.format})…${RESET}`);
    let res;
    try {
      res = await scoreRemote(apiBase, url, args.format);
    } catch (e) {
      console.error(`Error: Could not reach ${apiBase}/api/score: ${e.message}`);
      process.exit(1);
    }
    if (args.format === 'review') {
      if (args.json) console.log(JSON.stringify({ ok: true, markdown: res.markdown }));
      else console.log(res.markdown);
      process.exit(0);
    }
    const body = res.json;
    const score = typeof body.score === 'number' ? body.score
      : (body.summary && typeof body.summary.score === 'number') ? body.summary.score : NaN;
    const grade = normalizeGrade(body.grade) || (body.summary && body.summary.grade ? normalizeGrade(body.summary.grade) : '');
    if (args.json) console.log(JSON.stringify(body, null, 2));
    else if (!args.quiet || (args.minScore > 0 && score < args.minScore) || (args.minGrade && grade && GRADE_RANK[grade] < GRADE_RANK[args.minGrade])) {
      if (args.format === 'google') {
        console.log(`${BOLD}Designesy Contract Check${RESET}`);
        console.log(`${DIM}URL:${RESET}    ${url}`);
        console.log(`${DIM}Format:${RESET} google (design.md-compatible)`);
        console.log(`${DIM}Result:${RESET} ${body.summary?.errors ?? 0} errors · ${body.summary?.warnings ?? 0} warnings · ${body.summary?.infos ?? 0} infos`);
      } else if (!Number.isNaN(score) && grade) {
        console.log(formatReport(body, url));
      } else {
        console.log(JSON.stringify(body, null, 2));
      }
    }
    if (!Number.isNaN(score) && grade) {
      if (args.minScore > 0 && score < args.minScore) { console.error(`\n${BOLD}Quality gate failed${RESET}: score ${score} below ${args.minScore}.`); process.exit(1); }
      if (args.minGrade && GRADE_RANK[grade] < GRADE_RANK[args.minGrade]) { console.error(`\n${BOLD}Quality gate failed${RESET}: grade ${grade} worse than ${args.minGrade}.`); process.exit(1); }
    }
    if (!args.quiet) console.log(`\n${BOLD}Quality gate passed${RESET}`);
    process.exit(0);
  }

  // Local engine mode (v1.0.0 default)
  const normalized = normalizeInputUrl(args.url);
  if (!normalized || !isValidUrl(normalized)) {
    console.error(`Error: Invalid URL "${args.url}". Enter a valid domain like designesy.org or nike.com.`);
    process.exit(2);
  }

  let scope;
  if (args.scope === 'contract' || args.scope === 'universal') scope = args.scope;

  if (!args.quiet) {
    console.log(`${DIM}Scoring ${normalized} locally (40-check engine, scope=${scope || 'auto'})…${RESET}`);
  }

  let result;
  try {
    result = await scoreUrl(normalized, scope);
  } catch (e) {
    console.error(`Error: Could not score ${normalized}: ${e.message}`);
    process.exit(1);
  }

  // Output by format
  if (args.format === 'review') {
    const markdown = emitReview(normalized, result);
    if (args.json) console.log(JSON.stringify({ ok: true, markdown }));
    else console.log(markdown);
  } else if (args.format === 'google') {
    const out = emitGoogle(result);
    if (args.json || !args.quiet) console.log(JSON.stringify(out, null, 2));
  } else if (args.format === 'canonical') {
    const out = emitCanonical(normalized, result);
    if (args.json || !args.quiet) console.log(JSON.stringify(out, null, 2));
  } else {
    // designesy (default)
    if (args.json) {
      const out = emitDesignesy(result);
      console.log(JSON.stringify(out, null, 2));
    } else if (!args.quiet) {
      console.log(formatReport(result, normalized));
    }
  }

  // Gate check
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

  if (!args.quiet) console.log(`\n${BOLD}Quality gate passed${RESET}`);
}

main().catch((e) => {
  console.error(`Unhandled error: ${e instanceof Error ? e.message : String(e)}`);
  process.exit(1);
});