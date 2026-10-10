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
 * TITLES AND ANNOTATIONS (added 2026-10-09)
 * MCP clients and directories show a tool's title and its behaviour hints
 * (readOnlyHint, destructiveHint, idempotentHint, openWorldHint) to the person
 * deciding whether to let it run. Directories reject a tool that lacks a title
 * or a readOnlyHint/destructiveHint. A missing hint falls back to the spec
 * default, which is the least safe reading (readOnlyHint false, destructiveHint
 * true), and a wrong hint misinforms that person. So this gate also asserts:
 *   - every tool has an MCP_TOOL_ANNOTATIONS entry with a title that follows
 *     the copy rules and all four hints written as true/false literals, and a
 *     read-only tool is never marked destructive;
 *   - every registerTool() config spreads mcpToolDisplay() for its OWN name and
 *     does not override title or annotations after it;
 *   - packages/designesy-mcp (the PyPI stdio server) declares the same title
 *     and the same four hints for every tool. Its own test suite asserts the
 *     same agreement from the other side, so either CI job catches a drift.
 * The PyPI file sits outside apps/site. A missing file fails this gate, except
 * in a Vercel build (VERCEL=1), which may upload only apps/site; there the
 * agreement check prints NOT EVALUATED instead of passing silently.
 *
 * REFERENCE-DATA OUTPUT (added for designesy-mcp 1.13.3)
 * The document tools wrap what they return as labeled reference data and leave
 * out any part written as steps or a prompt for an AI agent (Anthropic
 * Software Directory Policy 2F). The hosted endpoint does it in
 * app/lib/mcp-reference.ts, the PyPI server in its own Python. So this gate
 * also:
 *   - asserts both declare the same AGENT_DIRECTIVE_PATTERN_SOURCES;
 *   - runs mcp-reference.ts (loaded with Node's type stripping) on the
 *     published-document fixtures in packages/designesy-mcp/test/fixtures/
 *     published-docs/ and compares its output with expected.json there, the
 *     golden the Python suite checks its own output against. Same input, same
 *     golden, two implementations: they agree or one of the two jobs fails.
 * Outside a Vercel build the fixtures must be present.
 *
 * Usage:  node scripts/check-mcp-tool-parity.js [--json]
 * Exits 1 on any finding, so it can gate CI.
 */

const fs = require('node:fs');
const path = require('node:path');

const APP = path.join(__dirname, '..');
const ROUTE = path.join(APP, 'app', 'api', 'mcp', 'route.ts');
const REGISTRY = path.join(APP, 'app', 'lib', 'mcp-tool-registry.ts');
const PYPI = path.join(APP, '..', '..', 'packages', 'designesy-mcp', 'designesy_mcp_server.py');
const REFERENCE_LIB = path.join(APP, 'app', 'lib', 'mcp-reference.ts');
const DOC_FIXTURES = path.join(APP, '..', '..', 'packages', 'designesy-mcp', 'test', 'fixtures', 'published-docs');
// The origin both servers fetch from; part of the hashed design_review output.
const BASE_URL = 'https://www.designesy.org';

const HINTS = ['readOnlyHint', 'destructiveHint', 'idempotentHint', 'openWorldHint'];
const TITLE_MAX_WORDS = 5;

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

/**
 * Replace the contents of string literals with spaces (quotes kept), so a
 * description or .describe() text cannot look like a `title:` key or a brace.
 * Input must already be comment-free and must start outside a string.
 */
function blankStrings(code) {
  const out = [];
  let inString = null;
  for (let i = 0; i < code.length; i++) {
    const c = code[i];
    if (inString) {
      if (c === '\\') {
        out.push(' ', ' ');
        i++;
        continue;
      }
      if (c === inString) {
        inString = null;
        out.push(c);
        continue;
      }
      out.push(c === '\n' ? '\n' : ' ');
      continue;
    }
    if (c === '"' || c === "'" || c === '`') inString = c;
    out.push(c);
  }
  return out.join('');
}

/**
 * Keep only the characters at the top level of the first object literal in
 * `code` (depth 1), blanking everything nested deeper. Used to find the keys of
 * a registerTool() config without matching keys inside its inputSchema.
 */
function topLevelOfObject(code) {
  let depth = 0;
  const out = [];
  for (const c of code) {
    if (c === '{' || c === '(' || c === '[') {
      depth++;
      out.push(depth === 1 ? c : ' ');
      continue;
    }
    if (c === '}' || c === ')' || c === ']') {
      out.push(depth === 1 ? c : ' ');
      depth--;
      continue;
    }
    out.push(depth === 1 ? c : c === '\n' ? '\n' : ' ');
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

/**
 * For each registerTool() call: which mcpToolDisplay() names its config spreads,
 * and which top-level keys of the config would override that spread.
 * The config is the text between the tool name and the handler (`async (`).
 */
function routeToolConfigs(src) {
  const code = stripComments(src);
  const re = /registerTool\(\s*'([a-z0-9_]+)'\s*,/g;
  const starts = [];
  let m;
  while ((m = re.exec(code)) !== null) starts.push({ name: m[1], from: m.index + m[0].length, at: m.index });
  const configs = new Map();
  starts.forEach((s, i) => {
    const end = i + 1 < starts.length ? starts[i + 1].at : code.length;
    const segment = code.slice(s.from, end);
    const handlerAt = segment.search(/\basync\s*\(/);
    const config = handlerAt >= 0 ? segment.slice(0, handlerAt) : segment;
    const spreads = [...config.matchAll(/\.\.\.\s*mcpToolDisplay\(\s*'([a-z0-9_]+)'\s*\)/g)].map((x) => x[1]);
    const top = topLevelOfObject(blankStrings(config));
    const overrides = [...top.matchAll(/(?:^|[\s,{])(title|annotations)\s*:/g)].map((x) => x[1]);
    configs.set(s.name, { spreads, overrides, handlerFound: handlerAt >= 0 });
  });
  return configs;
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

/**
 * Read a one-entry-per-line annotation table: the lines between `startRe` and
 * the first line that is a bare closing brace. Returns null when the table is
 * not found, else { entries: Map(name -> {title, hints}), unreadable: [lines] }.
 *
 * `quote` is the string quote the language uses, and `bool` maps its boolean
 * literals to JS booleans. A hint whose value is anything but a literal is
 * recorded as such, never coerced.
 */
function readAnnotationTable(lines, startRe, entryRe, quote, bool) {
  const start = lines.findIndex((l) => startRe.test(l));
  if (start < 0) return null;
  const entries = new Map();
  const unreadable = [];
  const titleRe = new RegExp(`${quote === '"' ? '"title"' : 'title'}\\s*:\\s*${quote}((?:[^${quote}\\\\]|\\\\.)*)${quote}`);
  const literals = Object.keys(bool).join('|');
  for (let i = start + 1; i < lines.length; i++) {
    const line = lines[i];
    if (/^\s*\}/.test(line)) break;
    if (/^\s*$/.test(line) || /^\s*(#|\/\/)/.test(line)) continue;
    const m = line.match(entryRe);
    if (!m) {
      unreadable.push(line.trim());
      continue;
    }
    const body = m[2];
    const t = body.match(titleRe);
    const hints = {};
    for (const h of HINTS) {
      const key = quote === '"' ? `"${h}"` : h;
      const hm = body.match(new RegExp(`${key}\\s*:\\s*([^,}\\s]+)`));
      if (!hm) continue;
      hints[h] = new RegExp(`^(${literals})$`).test(hm[1]) ? bool[hm[1]] : `not a literal: ${hm[1]}`;
    }
    entries.set(m[1], { title: t ? t[1] : null, hints });
  }
  return { entries, unreadable };
}

function registryAnnotations(src) {
  const code = stripComments(src);
  return readAnnotationTable(
    code.split(/\r?\n/),
    /MCP_TOOL_ANNOTATIONS\s*=\s*\{\s*$/,
    /^\s*([a-z0-9_]+)\s*:\s*\{(.*)\}\s*,?\s*$/,
    "'",
    { true: true, false: false },
  );
}

function pypiAnnotations(src) {
  return readAnnotationTable(
    src.split(/\r?\n/),
    /^TOOL_ANNOTATIONS\b.*=\s*\{\s*$/,
    /^\s*"([a-z0-9_]+)"\s*:\s*\{(.*)\}\s*,?\s*$/,
    '"',
    { True: true, False: false },
  );
}

/** House copy rules for a tool title. Returns a list of problems. */
function titleProblems(title) {
  const problems = [];
  if (!title || !title.trim()) return ['empty'];
  if (title.includes('\u2014')) problems.push('contains an em dash');
  const words = title.trim().split(/\s+/);
  if (words.length > TITLE_MAX_WORDS) problems.push(`${words.length} words (at most ${TITLE_MAX_WORDS})`);
  const articles = words.filter((w) => /^(a|an|the)$/i.test(w));
  if (articles.length) problems.push(`uses the article "${articles[0]}"`);
  return problems;
}

function annotationFindings(registered, ann, configs) {
  const findings = [];
  if (ann === null) {
    findings.push({
      id: 'annotations-table-unreadable',
      why: 'Could not find `export const MCP_TOOL_ANNOTATIONS = {` in the registry, so no title or hint can be checked. The gate fails rather than passing quietly.',
      fix: 'Restore the MCP_TOOL_ANNOTATIONS table in app/lib/mcp-tool-registry.ts, one entry per line.',
    });
    return findings;
  }
  for (const line of ann.unreadable) {
    findings.push({
      id: 'annotations-line-unreadable',
      why: `This line of MCP_TOOL_ANNOTATIONS is not a one-line \`name: { ... },\` entry, so its values cannot be checked: ${line}`,
      fix: 'Write each tool\'s entry on a single line.',
    });
  }
  const titles = new Map();
  for (const n of registered) {
    const e = ann.entries.get(n);
    if (!e) {
      findings.push({
        id: `annotation-missing:${n}`,
        why: `"${n}" is registered in the MCP route but has no MCP_TOOL_ANNOTATIONS entry, so clients see no title and fall back to the least safe hints.`,
        fix: `Add a one-line '${n}' entry with title, readOnlyHint, destructiveHint, idempotentHint and openWorldHint to MCP_TOOL_ANNOTATIONS.`,
      });
      continue;
    }
    if (!e.title) {
      findings.push({
        id: `title-missing:${n}`,
        why: `"${n}" has no title. Directories reject a tool without one.`,
        fix: `Give '${n}' a short human title in MCP_TOOL_ANNOTATIONS.`,
      });
    } else {
      const problems = titleProblems(e.title);
      if (problems.length) {
        findings.push({
          id: `title-copy:${n}`,
          why: `The title "${e.title}" breaks the copy rules: ${problems.join('; ')}.`,
          fix: `Rewrite it in at most ${TITLE_MAX_WORDS} words, without articles or em dashes.`,
        });
      }
      if (titles.has(e.title)) {
        findings.push({
          id: `title-duplicate:${n}`,
          why: `"${n}" and "${titles.get(e.title)}" share the title "${e.title}", so a person cannot tell them apart.`,
          fix: 'Give each tool its own title.',
        });
      } else {
        titles.set(e.title, n);
      }
    }
    for (const h of HINTS) {
      if (typeof e.hints[h] !== 'boolean') {
        findings.push({
          id: `hint-missing:${n}:${h}`,
          why: `"${n}" does not set ${h} to a true/false literal (${e.hints[h] === undefined ? 'absent' : e.hints[h]}). A client would apply the spec default instead of a decision read from the code.`,
          fix: `Set ${h}: true or false on '${n}' in MCP_TOOL_ANNOTATIONS.`,
        });
      }
    }
    if (e.hints.readOnlyHint === true && e.hints.destructiveHint === true) {
      findings.push({
        id: `hint-contradiction:${n}`,
        why: `"${n}" is marked both read-only and destructive.`,
        fix: 'A read-only tool makes no updates: set destructiveHint: false, or readOnlyHint: false if it does write.',
      });
    }
    const c = configs.get(n);
    if (c) {
      if (!c.spreads.includes(n)) {
        findings.push({
          id: `route-not-annotated:${n}`,
          why: `The registerTool('${n}', ...) config does not spread mcpToolDisplay('${n}'), so the endpoint serves it without its title and hints.`,
          fix: `Add \`...mcpToolDisplay('${n}'),\` as the first entry of its config in app/api/mcp/route.ts.`,
        });
      }
      for (const other of c.spreads.filter((s) => s !== n)) {
        findings.push({
          id: `route-annotation-mismatch:${n}`,
          why: `The registerTool('${n}', ...) config spreads mcpToolDisplay('${other}'), so it would serve another tool's title and hints.`,
          fix: `Change it to mcpToolDisplay('${n}').`,
        });
      }
      for (const key of c.overrides) {
        findings.push({
          id: `route-annotation-override:${n}:${key}`,
          why: `The registerTool('${n}', ...) config sets \`${key}\` itself, which overrides the registry entry and is invisible to this gate.`,
          fix: `Remove \`${key}\` from the config and change MCP_TOOL_ANNOTATIONS instead.`,
        });
      }
      if (!c.handlerFound) {
        findings.push({
          id: `route-config-unreadable:${n}`,
          why: `Could not find the handler (\`async (\`) after registerTool('${n}', ...), so its config boundary is unknown.`,
          fix: 'Keep the handler an `async (...) => {}` function, or update this gate.',
        });
      }
    }
  }
  for (const n of ann.entries.keys()) {
    if (!registered.has(n)) {
      findings.push({
        id: `annotation-phantom:${n}`,
        why: `"${n}" has an MCP_TOOL_ANNOTATIONS entry but is not registered in the MCP route.`,
        fix: `Remove '${n}' from MCP_TOOL_ANNOTATIONS, or register it in app/api/mcp/route.ts.`,
      });
    }
  }
  return findings;
}

function pypiFindings(remote, pypi) {
  const findings = [];
  if (pypi === null) {
    findings.push({
      id: 'pypi-annotations-unreadable',
      why: 'Could not find `TOOL_ANNOTATIONS ... = {` in packages/designesy-mcp/designesy_mcp_server.py, so the two servers cannot be compared.',
      fix: 'Restore the TOOL_ANNOTATIONS table there, one entry per line.',
    });
    return { findings, agreedTitles: 0, agreedHints: 0 };
  }
  for (const line of pypi.unreadable) {
    findings.push({
      id: 'pypi-annotations-line-unreadable',
      why: `This line of the PyPI TOOL_ANNOTATIONS is not a one-line \`"name": { ... },\` entry: ${line}`,
      fix: 'Write each tool\'s entry on a single line.',
    });
  }
  let agreedTitles = 0;
  let agreedHints = 0;
  const names = new Set([...remote.entries.keys(), ...pypi.entries.keys()]);
  for (const n of names) {
    const r = remote.entries.get(n);
    const p = pypi.entries.get(n);
    if (!p) {
      findings.push({
        id: `pypi-annotation-missing:${n}`,
        why: `"${n}" is annotated for the hosted endpoint but not in the PyPI server.`,
        fix: `Add '${n}' to TOOL_ANNOTATIONS in packages/designesy-mcp/designesy_mcp_server.py with the same title and hints.`,
      });
      continue;
    }
    if (!r) {
      findings.push({
        id: `pypi-annotation-extra:${n}`,
        why: `"${n}" is annotated in the PyPI server but not in the hosted endpoint's registry.`,
        fix: `Add it to MCP_TOOL_ANNOTATIONS, or remove it from the PyPI TOOL_ANNOTATIONS.`,
      });
      continue;
    }
    if (r.title !== p.title) {
      findings.push({
        id: `pypi-title-disagrees:${n}`,
        why: `"${n}" is titled "${r.title}" on the hosted endpoint and "${p.title}" in the PyPI server.`,
        fix: 'Use one title on both surfaces.',
      });
    } else {
      agreedTitles++;
    }
    for (const h of HINTS) {
      if (r.hints[h] !== p.hints[h]) {
        findings.push({
          id: `pypi-hint-disagrees:${n}:${h}`,
          why: `"${n}" has ${h} ${String(r.hints[h])} on the hosted endpoint and ${String(p.hints[h])} in the PyPI server. Both proxy the same engines, so one of them misinforms the person approving the call.`,
          fix: `Re-read the code for '${n}' and set the same ${h} on both surfaces.`,
        });
      } else if (typeof r.hints[h] === 'boolean') {
        agreedHints++;
      }
    }
  }
  return { findings, agreedTitles, agreedHints };
}

/** The r"..." sources in the PyPI AGENT_DIRECTIVE_PATTERN_SOURCES tuple, or null. */
function pypiDirectiveSources(src) {
  const m = src.match(/^AGENT_DIRECTIVE_PATTERN_SOURCES\s*=\s*\(\r?\n([\s\S]*?)^\)/m);
  if (!m) return null;
  return [...m[1].matchAll(/^\s*r"((?:[^"\\]|\\.)*)",?\s*$/gm)].map((x) => x[1]);
}

/** JSON with keys sorted and no spaces, as Python's json.dumps(sort_keys=True, separators=(",", ":")). */
function canonical(v) {
  if (Array.isArray(v)) return `[${v.map(canonical).join(',')}]`;
  if (v !== null && typeof v === 'object') {
    return `{${Object.keys(v).sort().map((k) => `${JSON.stringify(k)}:${canonical(v[k])}`).join(',')}}`;
  }
  return JSON.stringify(v);
}

function sha256(v) {
  return require('node:crypto').createHash('sha256').update(typeof v === 'string' ? v : canonical(v), 'utf8').digest('hex');
}

/**
 * Run the hosted endpoint's reference-data rules on the shared fixtures and
 * compare with the golden. Returns { findings, evaluated, reason, compared }.
 */
async function referenceFindings(pypiSrc) {
  const findings = [];
  if (!fs.existsSync(DOC_FIXTURES)) {
    if (process.env.VERCEL === '1') {
      return { findings, evaluated: false, reason: `${path.relative(APP, DOC_FIXTURES)} is not in this Vercel build` };
    }
    findings.push({
      id: 'reference-fixtures-missing',
      why: `${DOC_FIXTURES} is missing, so the two servers' reference-data output cannot be compared.`,
      fix: 'Run this gate from a full checkout of the repository.',
    });
    return { findings, evaluated: false, reason: 'fixtures missing' };
  }
  let lib;
  try {
    lib = await import(require('node:url').pathToFileURL(REFERENCE_LIB).href);
  } catch (e) {
    // A deploy is not the place to fail on the build image's Node version;
    // CI runs this gate on a Node that strips types and fails there.
    if (process.env.VERCEL === '1') {
      return { findings, evaluated: false, reason: `this Node cannot load mcp-reference.ts (${e.code || e.message})` };
    }
    findings.push({
      id: 'reference-lib-unloadable',
      why: `Could not load app/lib/mcp-reference.ts with Node's type stripping (${e.code || e.message}), so the hosted endpoint's reference-data rules cannot be checked.`,
      fix: 'Run on Node 22.18 or later, and keep mcp-reference.ts free of imports and of syntax that type stripping cannot erase.',
    });
    return { findings, evaluated: false, reason: 'library unloadable' };
  }

  const pySources = pypiSrc === null ? null : pypiDirectiveSources(pypiSrc);
  if (pySources === null) {
    findings.push({
      id: 'reference-patterns-unreadable',
      why: 'Could not read AGENT_DIRECTIVE_PATTERN_SOURCES from the PyPI server, so the two servers\' directive patterns cannot be compared.',
      fix: 'Keep the tuple at the top level of designesy_mcp_server.py, one r"..." source per line.',
    });
  } else if (JSON.stringify(pySources) !== JSON.stringify([...lib.AGENT_DIRECTIVE_PATTERN_SOURCES])) {
    findings.push({
      id: 'reference-patterns-disagree',
      why: `The directive patterns differ. Hosted: ${JSON.stringify(lib.AGENT_DIRECTIVE_PATTERN_SOURCES)}. PyPI: ${JSON.stringify(pySources)}.`,
      fix: 'Use the same pattern sources in app/lib/mcp-reference.ts and designesy_mcp_server.py.',
    });
  }

  const golden = JSON.parse(fs.readFileSync(path.join(DOC_FIXTURES, 'expected.json'), 'utf8'));
  const readText = (n) => fs.readFileSync(path.join(DOC_FIXTURES, n), 'utf8');
  const readJson = (n) => JSON.parse(readText(n));
  const disagree = (what, expected, actual) => findings.push({
    id: `reference-golden:${what}`,
    why: `The hosted endpoint's ${what} differs from the golden the PyPI suite checks (expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}).`,
    fix: 'Change both servers together, then regenerate the golden: python test/test_reference_data.py --write-golden.',
  });
  let compared = 0;
  for (const [name, want] of Object.entries(golden.text)) {
    const out = lib.publishedText(`${BASE_URL}/${name}`, 'text/plain', readText(name));
    if (JSON.stringify(out.omitted_sections) !== JSON.stringify(want.omitted_sections)) disagree(`${name} omitted_sections`, want.omitted_sections, out.omitted_sections);
    if (sha256(out) !== want.output_sha256) disagree(`${name} output`, want.output_sha256, sha256(out));
    compared++;
  }
  const agent = lib.publishedJson(`${BASE_URL}/.well-known/agent.json`, readJson('agent.json'));
  if (JSON.stringify(agent.omitted_fields) !== JSON.stringify(golden.agent_json.omitted_fields)) disagree('agent.json omitted_fields', golden.agent_json.omitted_fields, agent.omitted_fields);
  if (sha256(agent) !== golden.agent_json.output_sha256) disagree('agent.json output', golden.agent_json.output_sha256, sha256(agent));
  compared++;
  for (const c of golden.design_review) {
    const out = lib.designReviewRubric(readJson('design-review.json'), `${BASE_URL}/kits/design-review.json`, c.inputs, golden.fixture_rules);
    if (sha256(out) !== c.output_sha256) disagree(`design_review ${JSON.stringify(c.inputs)} output`, c.output_sha256, sha256(out));
    compared++;
  }
  return { findings, evaluated: true, compared };
}

async function main() {
  const asJson = process.argv.includes('--json');

  for (const f of [ROUTE, REGISTRY]) {
    if (!fs.existsSync(f)) {
      const msg = `mcp-tool-parity: missing ${f}`;
      if (asJson) console.log(JSON.stringify({ ok: false, error: msg }, null, 2));
      else console.error(msg);
      process.exit(1);
    }
  }

  const routeSrc = fs.readFileSync(ROUTE, 'utf8');
  const registrySrc = fs.readFileSync(REGISTRY, 'utf8');
  const registered = routeToolNames(routeSrc);
  const declared = registryToolNames(registrySrc);

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

  // Titles and annotation hints, on the hosted endpoint.
  const remoteAnn = registryAnnotations(registrySrc);
  const annFindings = annotationFindings(registered, remoteAnn, routeToolConfigs(routeSrc));
  findings.push(...annFindings);
  const annotated = remoteAnn
    ? [...registered].filter((n) => !annFindings.some((f) => f.id.endsWith(`:${n}`) || f.id.includes(`:${n}:`))).length
    : 0;

  // Agreement with the PyPI stdio server.
  const pypiSrc = fs.existsSync(PYPI) ? fs.readFileSync(PYPI, 'utf8') : null;
  let pypi;
  if (fs.existsSync(PYPI)) {
    if (remoteAnn === null) {
      pypi = { evaluated: false, reason: 'the hosted registry table is unreadable (reported above)' };
    } else {
      const res = pypiFindings(remoteAnn, pypiAnnotations(pypiSrc));
      findings.push(...res.findings);
      pypi = { evaluated: true, agreedTitles: res.agreedTitles, agreedHints: res.agreedHints };
    }
  } else if (process.env.VERCEL === '1') {
    pypi = { evaluated: false, reason: `${path.relative(APP, PYPI)} is not in this Vercel build` };
  } else {
    findings.push({
      id: 'pypi-server-missing',
      why: `${PYPI} is missing, so the hosted and PyPI titles and hints cannot be compared. Outside a Vercel build the file is expected to be present.`,
      fix: 'Run this gate from a full checkout of the repository.',
    });
    pypi = { evaluated: false, reason: 'file missing' };
  }

  // Reference-data output: same rules, same fixtures, same golden.
  const reference = await referenceFindings(pypiSrc);
  findings.push(...reference.findings);

  if (asJson) {
    console.log(
      JSON.stringify(
        {
          ok: findings.length === 0,
          registered: registered.size,
          declared: declared ? declared.size : null,
          annotated,
          pypi,
          reference: { evaluated: reference.evaluated, compared: reference.compared ?? 0, reason: reference.reason },
          findings,
        },
        null,
        2,
      ),
    );
  } else if (findings.length === 0) {
    console.log(`mcp-tool-parity: OK — ${registered.size} tool(s) match in both the route and the registry`);
    console.log(`mcp-tool-parity: OK — ${annotated} tool(s) carry a title and all four annotation hints, applied in the route`);
    if (pypi.evaluated) {
      console.log(`mcp-tool-parity: OK — the PyPI server agrees on ${pypi.agreedTitles} title(s) and ${pypi.agreedHints} hint value(s)`);
    } else {
      console.log(`mcp-tool-parity: [NOT EVALUATED] PyPI agreement: ${pypi.reason}`);
    }
    if (reference.evaluated) {
      console.log(`mcp-tool-parity: OK — the hosted reference-data rules match the shared golden on ${reference.compared} output(s), with the PyPI server's directive patterns`);
    } else {
      console.log(`mcp-tool-parity: [NOT EVALUATED] reference-data agreement: ${reference.reason}`);
    }
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

main().catch((e) => {
  console.error(`mcp-tool-parity: ${e && e.stack ? e.stack : e}`);
  process.exit(1);
});
