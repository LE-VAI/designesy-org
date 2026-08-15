#!/usr/bin/env node
/**
 * @designesy/tokens CLI — DTCG 2025.10 token validator.
 *
 * Usage:
 *   npx @designesy/tokens <file>           Validate a local tokens.json
 *   npx @designesy/tokens <url>            Validate a remote token file
 *   npx @designesy/tokens <file> --json    Output raw JSON
 *   npx @designesy/tokens <file> --min-score 80   Fail if score < 80
 *
 * Zero dependencies — Node built-ins only.
 */

import { validateTokenString, type ValidationResult } from './validator.js';
import { readFileSync } from 'node:fs';
import { get } from 'node:https';

function parseArgs(argv: string[]) {
  const args = { source: '', json: false, minScore: 0, quiet: false, help: false };
  const rest: string[] = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--json') { args.json = true; continue; }
    if (a === '--quiet') { args.quiet = true; continue; }
    if (a === '--help' || a === '-h') { args.help = true; continue; }
    if (a === '--min-score') { args.minScore = parseFloat(argv[++i]) || 0; continue; }
    if (a.startsWith('--')) {
      console.error(`Unknown option: ${a}`);
      process.exit(2);
    }
    rest.push(a);
  }
  if (rest.length > 0) args.source = rest[0];
  return args;
}

function printUsage() {
  console.log(`
@designesy/tokens — DTCG 2025.10 token validator

Validate a design token file against 10 conformance checks from the
W3C Design Tokens Format Module 2025.10 stable spec.

Usage:
  npx @designesy/tokens <file>           Validate a local tokens.json
  npx @designesy/tokens <url>            Validate a remote token file
  npx @designesy/tokens <file> --json    Output raw JSON (for CI/piping)
  npx @designesy/tokens <file> --min-score 80   Exit 1 if score < 80
  npx @designesy/tokens <file> --quiet   Only output on failure

Checks (t01-t10):
  t01  Every token has $type (direct or inherited)
  t02  Every token has $value
  t03  Semantic tokens have $description
  t04  Color tokens use OKLCH or Display-P3
  t05  Custom types namespaced under $extensions
  t06  Aliases ($ref) resolve to valid typed tokens
  t07  $schema property present
  t08  DTCG 2025.10 structural validation
  t09  No type drift between themes
  t10  Dimension units are px or rem only

Scoring: 10 checks. PASS=1, WARN=0.5, FAIL=0. Score = (points/10) × 100.
Grades: A≥90, B≥80, C≥70, D≥60, F<60.

Options:
  --json         Output raw JSON result (no formatted table)
  --min-score N  Exit code 1 if score < N (for CI gates)
  --quiet        Only output if score < 100 or any FAIL
  --help, -h     Show this help

Examples:
  npx @designesy/tokens tokens.json
  npx @designesy/tokens tokens.json --min-score 80 --json
  npx @designesy/tokens https://example.com/tokens.json

Exit codes:
  0  All checks pass (or score ≥ --min-score)
  1  Any FAIL, or score < --min-score
  2  Invalid arguments or file not found
`);
}

const STATUS_ICONS: Record<string, string> = {
  PASS: '\u2713',
  FAIL: '\u2717',
  WARN: '~',
};

function formatReport(result: ValidationResult): string {
  const lines: string[] = [];
  const source = result.file || result.url || '(stdin)';
  lines.push(`Designesy Tokens Validator \u2014 DTCG 2025.10`);
  lines.push(`Source: ${source}`);
  lines.push(`Tokens: ${result.tokensCount}`);
  lines.push('');
  lines.push(`Score: ${result.score}/100  Grade: ${result.grade}  \u2014  ${result.pass} pass, ${result.warn} warn, ${result.fail} fail`);
  lines.push('');
  for (const check of result.checks) {
    const icon = STATUS_ICONS[check.status] ?? '?';
    lines.push(`  ${icon} ${check.id}  ${check.status.padEnd(4)}  ${check.item}`);
    if (check.detail && check.status !== 'PASS') {
      lines.push(`         ${check.detail}`);
    }
  }
  lines.push('');
  if (result.fail > 0) {
    lines.push(`Result: FAIL \u2014 ${result.fail} check(s) failed`);
  } else if (result.warn > 0) {
    lines.push(`Result: PASS with ${result.warn} warning(s)`);
  } else {
    lines.push(`Result: All checks passed`);
  }
  return lines.join('\n');
}

function fetchTokenFile(url: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const req = get(url, { headers: { Accept: 'application/json' } }, (res) => {
      if (res.statusCode && res.statusCode >= 400) {
        reject(new Error(`HTTP ${res.statusCode} ${res.statusMessage}`));
        res.resume();
        return;
      }
      let body = '';
      res.setEncoding('utf-8');
      res.on('data', (chunk: string) => { body += chunk; });
      res.on('end', () => resolve(body));
    });
    req.on('error', reject);
    req.setTimeout(10000, () => {
      req.destroy(new Error('Request timeout (10s)'));
    });
  });
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  if (args.help || !args.source) {
    printUsage();
    process.exit(args.help ? 0 : 2);
  }

  let jsonStr: string;

  if (args.source.startsWith('http://') || args.source.startsWith('https://')) {
    try {
      jsonStr = await fetchTokenFile(args.source);
    } catch (err) {
      console.error(`Error fetching ${args.source}: ${err instanceof Error ? err.message : String(err)}`);
      process.exit(2);
    }
  } else {
    try {
      jsonStr = readFileSync(args.source, 'utf-8');
    } catch (err) {
      console.error(`Error reading ${args.source}: ${err instanceof Error ? err.message : String(err)}`);
      process.exit(2);
    }
  }

  const result = validateTokenString(jsonStr, args.source);

  if ('error' in result) {
    console.error(result.error);
    process.exit(2);
  }

  if (args.json) {
    console.log(JSON.stringify(result, null, 2));
  } else if (!args.quiet || result.fail > 0 || result.score < 100) {
    console.log(formatReport(result));
  }

  // Exit code logic
  const failed = result.fail > 0 || (args.minScore > 0 && result.score < args.minScore);
  process.exit(failed ? 1 : 0);
}

main().catch((err) => {
  console.error(`Fatal: ${err instanceof Error ? err.message : String(err)}`);
  process.exit(2);
});