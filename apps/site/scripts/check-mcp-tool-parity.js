#!/usr/bin/env node
/**
 * mcp-tool-parity gate — assert the MCP tool registry matches the route.
 *
 * WHY THIS EXISTS
 * The readiness engine's r04 check needs to know whether this deployment's MCP
 * endpoint serves tools. For the self-case it now reads
 * app/lib/mcp-tool-registry.ts instead of POSTing to itself (the self-POST
 * returns 400 while the identical external request returns 200 — see the
 * comment on checkR04McpEndpoint).
 *
 * That skip is only honest while the registry actually matches what the
 * endpoint serves. Tool names are string literals in app/api/mcp/route.ts, so a
 * hand-maintained registry WILL go stale the first time a tool is added or
 * renamed. When it does, r04 keeps reporting a confident PASS — a verdict about
 * a list that no longer exists. That is the exact defect class this lane keeps
 * finding: a check reporting on a sample it never examined.
 *
 * So the registry is gated. This asserts set equality in BOTH directions:
 *   - every registered tool appears in the registry (no silent additions)
 *   - every registry entry is registered in the route (no silent removals)
 * A one-directional check would let the other half drift.
 *
 * Usage:  node scripts/check-mcp-tool-parity.js [--json]
 * Exits 1 on any finding, so it can gate CI.
 */

const fs = require('node:fs');
const path = require('node:path');

const APP = path.join(__dirname, '..');
const ROUTE = path.join(APP, 'app', 'api', 'mcp', 'route.ts');
const REGISTRY = path.join(APP, 'app', 'lib', 'mcp-tool-registry.ts');

/**
 * Strip comments so a tool name in prose cannot satisfy the assertion.
 *
 * WALKED LINE-BY-LINE, NOT REGEXED. A previous `/\*[\s\S]*?\*\//g` version
 * collapsed this 72KB route to 5.5KB: the file contains `/*` sequences inside
 * STRING LITERALS (URL patterns), which paired across the file and swallowed
 * everything between them. The gate then found zero registered tools and
 * flagged all 16 registry entries as phantoms — a false alarm that looked like
 * a real finding, on code that was correct.
 *
 * That is the same failure this lane keeps finding in other forms: a check
 * whose instrument silently misreports its own coverage. A comment stripper
 * that deletes live code makes every downstream assertion meaningless, and it
 * fails in the direction that produces findings rather than silence.
 *
 * In-string state is tracked so a `//` inside a URL string is not treated as a
 * comment, and only line comments are removed. Block comments are handled by
 * tracking whether we are inside one, without a regex that can span strings.
 */
function stripComments(src) {
  const out = [];
  let inBlock = false;
  let inLine = false;
  let inString = null; // quote char when inside a string literal
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    const next = src[i + 1];

    if (inLine) {
      if (c === '\n') {
        inLine = false;
        out.push(c);
      }
      continue;
    }
    if (inBlock) {
      if (c === '*' && next === '/') {
        inBlock = false;
        i++;
      }
      continue;
    }
    if (inString) {
      out.push(c);
      if (c === '\\') {
        // keep the escaped char and skip its special meaning
        if (next !== undefined) {
          out.push(next);
          i++;
        }
        continue;
      }
      if (c === inString) inString = null;
      continue;
    }

    if (c === '"' || c === "'" || c === '`') {
      inString = c;
      out.push(c);
      continue;
    }
    if (c === '/' && next === '/') {
      inLine = true;
      i++;
      continue;
    }
    if (c === '/' && next === '*') {
      inBlock = true;
      i++;
      continue;
    }
    out.push(c);
  }
  return out.join('');
}

/** Extract tool names from server.registerTool('name', ...) calls. */
function routeToolNames(src) {
  const code = stripComments(src);
  const names = new Set();
  // The name sits on its OWN line after the opening paren — the calls are
  // formatted multi-line. A same-line pattern matched nothing, which made this
  // gate report "no tools found" and then flag every registry entry as a
  // phantom: a false alarm that looked like a real finding. Allow whitespace
  // across the boundary.
  const re = /registerTool\(\s*'([a-z0-9_]+)'/g;
  let m;
  while ((m = re.exec(code)) !== null) names.add(m[1]);
  return names;
}

/** Extract names from the registry's MCP_TOOL_NAMES array literal. */
function registryToolNames(src) {
  const code = stripComments(src);
  const arr = code.match(/MCP_TOOL_NAMES\s*=\s*\[([\s\S]*?)\]/);
  if (!arr) return null;
  const names = new Set();
  const re = /'([a-z0-9_]+)'/g;
  let m;
  while ((m = re.exec(arr[1])) !== null) names.add(m[1]);
  return names;
}

function main() {
  const asJson = process.argv.includes('--json');

  for (const f of [ROUTE, REGISTRY]) {
    if (!fs.existsSync(f)) {
      const msg = `mcp-tool-parity: missing ${f}`;
      if (asJson) console.log(JSON.stringify({ ok: false, error: msg }, null, 2));
      else console.error(msg);
      process.exit(1);
    }
  }

  const registered = routeToolNames(fs.readFileSync(ROUTE, 'utf8'));
  const declared = registryToolNames(fs.readFileSync(REGISTRY, 'utf8'));

  const findings = [];
  if (declared === null) {
    findings.push({
      id: 'registry-array-unreadable',
      why: 'Could not find the MCP_TOOL_NAMES array literal in the registry — the parity assertion cannot run, so it must fail rather than pass quietly.',
      fix: 'Restore `export const MCP_TOOL_NAMES = [...] as const;` in app/lib/mcp-tool-registry.ts.',
    });
  } else {
    if (registered.size === 0) {
      findings.push({
        id: 'no-tools-found-in-route',
        why: 'No registerTool() calls matched in the MCP route. Either every tool was removed (r04 would then PASS vacuously) or the call shape changed and this gate is now blind.',
        fix: 'Check app/api/mcp/route.ts still calls server.registerTool(\'name\', ...).',
      });
    }
    for (const n of registered) {
      if (!declared.has(n)) {
        findings.push({
          id: `unregistered-tool:${n}`,
          why: `"${n}" is registered in the MCP route but absent from the registry. Self-case r04 would report a tool count that omits it.`,
          fix: `Add '${n}' to MCP_TOOL_NAMES in app/lib/mcp-tool-registry.ts.`,
        });
      }
    }
    for (const n of declared) {
      if (!registered.has(n)) {
        findings.push({
          id: `phantom-tool:${n}`,
          why: `"${n}" is in the registry but not registered in the MCP route. Self-case r04 would report a tool that does not exist — a fabricated PASS.`,
          fix: `Remove '${n}' from MCP_TOOL_NAMES, or register it in app/api/mcp/route.ts.`,
        });
      }
    }
  }

  if (asJson) {
    console.log(
      JSON.stringify(
        { ok: findings.length === 0, registered: registered.size, declared: declared ? declared.size : null, findings },
        null,
        2,
      ),
    );
  } else if (findings.length === 0) {
    console.log(`mcp-tool-parity: OK — ${registered.size} tool(s) match in both the route and the registry`);
  } else {
    console.error(`mcp-tool-parity: ${findings.length} finding(s)\n`);
    for (const f of findings) {
      console.error(`  [${f.id}]`);
      console.error(`    why: ${f.why}`);
      console.error(`    fix: ${f.fix}\n`);
    }
  }

  process.exit(findings.length === 0 ? 0 : 1);
}

main();
