#!/usr/bin/env node
/**
 * Run a designesy_a11y_score Playwright script without a browser.
 *
 * WHY THIS EXISTS
 * Both MCP servers return a Playwright script for the caller to run. Nothing
 * ever ran it, and with a `config` argument it called axe.configure() in the
 * test body, where nothing defines axe: every run threw a ReferenceError. A
 * string check cannot see that, so this executes the script.
 *
 * HOW
 * The script is written to a temporary directory next to stand-ins for the
 * three packages it may import: @playwright/test (test() records the body,
 * expect() records the assertion), @axe-core/playwright (AxeBuilder records
 * its constructor argument and tags and returns `passes` and `violations`
 * rules) and axe-core (`source` is a marker string). The script is imported as
 * a real ES module, so a missing import or an undefined name fails here as it
 * would for the caller. Each test body runs with a page whose goto() records
 * the URL. If AxeBuilder was handed an axeSource, that source runs in a fresh
 * VM context with an `axe` whose configure() records what it receives: the
 * configuration has to reach axe.configure() inside the page.
 *
 * Usage:
 *   node scripts/lib/run-a11y-script.mjs <script-file> [passes] [violations]
 * prints one JSON object: { tests, goto, tags, axeSource, configured, output,
 * expects }, and exits 1 if the script threw.
 *
 * Used by scripts/check-mcp-accuracy.js (hosted route) and by
 * packages/designesy-mcp/test/test_a11y_score.py (the PyPI server).
 */
import { mkdtempSync, writeFileSync, mkdirSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
import vm from 'node:vm';

export const AXE_SOURCE_MARKER = '/* axe-core source */';

function stub(root, name, body) {
  const dir = join(root, 'node_modules', ...name.split('/'));
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'package.json'), JSON.stringify({ name, type: 'module', main: 'index.js' }));
  writeFileSync(join(dir, 'index.js'), body);
}

/** Run one generated script. Resolves to what it did; rejects if it threw. */
export async function runA11yScript(script, { passes = 3, violations = 1 } = {}) {
  const root = mkdtempSync(join(tmpdir(), 'a11y-script-'));
  const state = { tests: [], expects: [], builder: null, goto: [], logs: [], counts: { passes, violations } };
  const key = `__a11yScript${Math.random().toString(36).slice(2)}`;
  globalThis[key] = state;
  const g = `globalThis[${JSON.stringify(key)}]`;
  try {
    stub(root, '@playwright/test', [
      `export function test(name, fn) { ${g}.tests.push({ name, fn }); }`,
      `export function expect(value) { return { toBe(want) { ${g}.expects.push({ value, want }); } }; }`,
    ].join('\n'));
    stub(root, '@axe-core/playwright', [
      'export default class AxeBuilder {',
      `  constructor(params) { ${g}.builder = { params, tags: null }; }`,
      `  withTags(tags) { ${g}.builder.tags = tags; return this; }`,
      '  async analyze() {',
      `    const n = ${g}.counts;`,
      "    const violations = Array.from({ length: n.violations }, (_, i) => ({ id: `rule-${i}`, description: '', help: '', impact: 'minor', nodes: [], tags: [] }));",
      '    return { violations, passes: Array.from({ length: n.passes }, () => ({})), incomplete: [] };',
      '  }',
      '}',
    ].join('\n'));
    stub(root, 'axe-core', `export default { version: '4.13.0', source: ${JSON.stringify(AXE_SOURCE_MARKER)} };`);
    const file = join(root, 'a11y-scan.spec.mjs');
    writeFileSync(file, script);
    await import(pathToFileURL(file).href);

    const page = { goto: async (url) => { state.goto.push(url); } };
    const log = console.log;
    console.log = (...args) => { state.logs.push(args.join(' ')); };
    try {
      for (const t of state.tests) await t.fn({ page });
    } finally {
      console.log = log;
    }

    const params = (state.builder && state.builder.params) || {};
    let configured = null;
    if (typeof params.axeSource === 'string') {
      const context = { axe: { configure: (c) => { configured = c; } } };
      vm.runInNewContext(params.axeSource, context);
    }
    return {
      tests: state.tests.map((t) => t.name),
      goto: state.goto,
      tags: state.builder ? state.builder.tags : null,
      axeSource: typeof params.axeSource === 'string' ? params.axeSource.startsWith(AXE_SOURCE_MARKER) : false,
      configured,
      output: state.logs.length ? JSON.parse(state.logs[0]) : null,
      expects: state.expects,
    };
  } finally {
    delete globalThis[key];
    rmSync(root, { recursive: true, force: true });
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  const [file, passes, violations] = process.argv.slice(2);
  runA11yScript(readFileSync(file, 'utf8'), {
    passes: passes === undefined ? 3 : Number(passes),
    violations: violations === undefined ? 1 : Number(violations),
  }).then(
    (r) => { console.log(JSON.stringify(r)); },
    (e) => { console.error(`run-a11y-script: the script threw: ${e && e.message ? e.message : e}`); process.exit(1); },
  );
}
