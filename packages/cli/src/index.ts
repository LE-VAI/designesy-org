#!/usr/bin/env node
/**
 * @designesy/cli — Unified entry point for the Designesy design-verification toolkit.
 *
 * Single bin that dispatches to subcommands:
 *   designesy tokens <url|file>  DTCG 2025.10 token validation (10 checks)
 *   designesy score <url>        40-check design-contract scoring engine
 *   designesy help               Show usage
 *
 * Each subcommand delegates to its respective package:
 *   tokens → @designesy/tokens (DTCG validator)
 *   score  → @designesy/score (40-check engine)
 *
 * This package is a thin dispatcher — zero logic, zero dependencies on the
 * engine code. It imports the subpackages and forwards argv.
 *
 * Usage:
 *   npx designesy tokens https://example.com/export/dtcg
 *   npx designesy score linear.app --min-grade B
 *   npx designesy help
 */

import { spawn } from 'node:child_process';
import { resolve, dirname } from 'node:path';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

const HELP = `
designesy — Design verification toolkit for design-system contracts.

Usage:
  designesy <command> [options]

Commands:
  tokens <url|file>   Validate a DTCG 2025.10 token file (10 conformance checks)
  score <url>         Score a URL against the 40-check design-contract engine
  help                Show this help message
  version             Show version

Options for 'tokens':
  --json              Output raw JSON (no formatted report)
  --quiet             Only output on failure
  --min-score <n>     Exit 1 if score < n
  --help, -h          Show tokens-specific help

Options for 'score':
  --format <f>        Emission format: designesy (default), canonical, review, google
  --scope <s>         Scoring scope: contract (strict) or universal (fair, default auto)
  --min-score <n>     Exit 1 if score < n
  --min-grade <g>     Exit 1 if grade worse than g (A/B/C/D/F)
  --json              Output raw JSON (no formatted report)
  --quiet             Only output on failure
  --help, -h          Show score-specific help

Examples:
  designesy tokens https://www.designesy.org/export/dtcg
  designesy tokens ./tokens.json --json
  designesy score designesy.org
  designesy score linear.app --min-score 70 --min-grade B
  designesy score stripe.com --format review

Packages:
  @designesy/tokens   DTCG 2025.10 token validator (zero dependencies)
  @designesy/score    40-check design-contract scoring engine (zero dependencies)
`;

function runSubcommand(cmd: string, args: string[]): void {
  // Resolve the subcommand's CLI entry point. Try locations in order:
  //   1. ../../node_modules/@designesy/<cmd>/dist/cli.js (npm flat-hoist — the common case)
  //   2. ../../../node_modules/@designesy/<cmd>/dist/cli.js (deeper nesting)
  //   3. ../node_modules/@designesy/<cmd>/dist/cli.js (sibling inside this pkg)
  //   4. ../../node_modules/<mirror>/dist/cli.js (unscoped mirror flat-hoist)
  //   5. ../../../node_modules/<mirror>/dist/cli.js (unscoped mirror deeper)
  //   6. ../../<cmd>/dist/cli.js (monorepo sibling — dev)
  // __dirname is .../node_modules/designesy-cli/dist (or .../packages/cli/dist in dev).
  // npm flat-hoists subpackage deps to the project-root node_modules/, which is
  // 3 levels up from dist: dist → designesy-cli → node_modules → <project>/node_modules.
  const mirror = cmd === 'tokens' ? 'designesy-tokens' : 'designesy-score-local';
  const candidates = [
    resolve(__dirname, '..', '..', '..', 'node_modules', '@designesy', cmd, 'dist', 'cli.js'),
    resolve(__dirname, '..', '..', '..', '..', 'node_modules', '@designesy', cmd, 'dist', 'cli.js'),
    resolve(__dirname, '..', 'node_modules', '@designesy', cmd, 'dist', 'cli.js'),
    resolve(__dirname, '..', '..', '..', 'node_modules', mirror, 'dist', 'cli.js'),
    resolve(__dirname, '..', '..', '..', '..', 'node_modules', mirror, 'dist', 'cli.js'),
    resolve(__dirname, '..', '..', cmd, 'dist', 'cli.js'),     // monorepo sibling (dev)
  ];

  let cliPath: string | null = null;
  for (const p of candidates) {
    if (existsSync(p)) { cliPath = p; break; }
  }

  if (!cliPath) {
    console.error(`Error: Could not find the '${cmd}' subcommand engine.`);
    console.error(`Install the subpackage: npm install @designesy/${cmd}`);
    console.error(`Or install the unscoped mirror: npm install designesy-${cmd === 'tokens' ? 'tokens' : 'score-local'}`);
    process.exit(1);
  }

  const child = spawn(process.execPath, [cliPath, ...args], {
    stdio: 'inherit',
    env: process.env,
  });

  child.on('error', (err) => {
    console.error(`Error: Could not run 'designesy ${cmd}' — ${err.message}`);
    console.error(`The @designesy/${cmd} package may not be installed or built.`);
    console.error(`Install it: npm install @designesy/${cmd}`);
    process.exit(1);
  });

  child.on('exit', (code) => {
    process.exit(code ?? 1);
  });
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const cmd = argv[0];

  if (!cmd || cmd === 'help' || cmd === '--help' || cmd === '-h') {
    console.log(HELP);
    process.exit(0);
  }

  if (cmd === 'version' || cmd === '--version' || cmd === '-v') {
    // Read version from this package's package.json
    try {
      const pkgPath = resolve(__dirname, '..', 'package.json');
      const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8'));
      console.log(`designesy ${pkg.version}`);
    } catch {
      console.log('designesy 0.1.0');
    }
    process.exit(0);
  }

  if (cmd === 'tokens' || cmd === 'score') {
    runSubcommand(cmd, argv.slice(1));
    return;
  }

  console.error(`Unknown command: "${cmd}". Use 'designesy help' for usage.`);
  process.exit(2);
}

main().catch((e) => {
  console.error(`Unhandled error: ${e instanceof Error ? e.message : String(e)}`);
  process.exit(1);
});