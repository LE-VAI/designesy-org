// /api/mcp — native TypeScript MCP server on Vercel Node.js runtime.
//
// Uses mcp-handler (Vercel's official MCP adapter) to expose designesy.org's
// 17 design-intelligence tools + 1 MCP App UI resource. No Python, no child
// processes, no mcp-proxy bridge — runs natively on the same Vercel project.
//
// MCP spec 2026-07-28 — stateless protocol core. No initialize/initialized
// handshake, no Mcp-Session-Id header, no sessions. Every request is self-
// contained (protocol version + client info in _meta). Any Vercel instance
// can handle any request — perfect for serverless. mcp-handler 2.x serves
// the 2026-07-28 spec natively and transparently falls back to stateless
// Streamable HTTP for 2025-era clients (one handler, both protocols).
//
// MCP Apps (SEP-1865, ext io.modelcontextprotocol/ui) — the designesy_report
// tool declares _meta.ui.resourceUri so Apps-capable hosts (Claude Desktop,
// Cursor v2.6+, VS Code, Goose) render an interactive dashboard inline. The
// ui://designesy/report-app resource serves the HTML5 dashboard.
//
// 7 read-only tools fetch public machine exports from designesy.org.
// 10 executable tools call internal API engines (score, drift, readiness,
//   guardrails, monitor, compare, report, tokens, a11y, motion).
// 1 UI resource (ui://designesy/report-app) renders the report dashboard.
//
// TOOL DEFINITIONS (the quality pass for 1.13.9)
// - The ten scoring tools declare an outputSchema (app/lib/mcp-tool-
//   definitions.ts) and return the same JSON twice: as the text block they
//   always returned, and as structuredContent. The SDK refuses a success
//   result that has an outputSchema but no structuredContent, or whose
//   structuredContent does not match, so every success path below goes
//   through structured() and every failure through toolError(), which sets
//   isError and carries no structuredContent.
// - Every failure says whether one retry can help (retryable, and the same in
//   the text) and what to do next, read from the failure itself: the HTTP
//   status an engine or a file host returned, or the error a fetch threw.
// - A tool without parameters declares {"type":"object","additionalProperties":false},
//   the input schema MCP 2025-11-25 recommends for that case.
// - Each description states, in order: what the tool does, "Use this when",
//   when not to use it (naming the sibling tool), behaviour, errors, return
//   shape. scripts/check-mcp-accuracy.js holds each one to 2,048 characters
//   (Claude Code truncates there), to the golden the PyPI server shares, and
//   to the rate limits the engine routes enforce.
//
// MCP Registry: io.github.LE-VAI/designesy-org (version: lib/mcp-version.ts; auto-republished on tag via OIDC)
// Endpoint:     https://www.designesy.org/api/mcp

import { CONTRACT_VERSION, designSystemContract } from '../../lib/design-system-contract';
import { MCP_SERVER_VERSION } from '../../lib/mcp-version';
import { designReviewRubric, publishedJson, publishedText } from '../../lib/mcp-reference';
// Every error a tool returns passes through sanitizeErrorText, so no result
// carries a path on the machine that ran it (check-mcp-tool-parity.js).
import { sanitizeErrorText } from '../../lib/error-text';
import { openIndex } from '../../lib/open-index';
import { createMcpHandler } from 'mcp-handler';
import { fromJsonSchema } from '@modelcontextprotocol/server';
import { after } from 'next/server';
import { recordUsage, toolCallNames } from '../../lib/usage';
import { z } from 'zod';
import { buildReportAppHtml } from '../../lib/report-app-html';
import { safeFetch } from '../../lib/url-guard';
import { ENGINE_CHECK_COUNT } from '../../lib/check-definitions';
import { mcpToolDisplay } from '../../lib/mcp-tool-registry';
import { MCP_OUTPUT_SCHEMAS, MCP_SERVER_INSTRUCTIONS, NO_PARAMETER_INPUT_SCHEMA, type McpScoringTool } from '../../lib/mcp-tool-definitions';
import { motionContract } from '../../lib/motion-contract';
import { scoreLottie } from '../../lib/motion-score';
import { a11yContract } from '../../lib/a11y-contract';
import { tokensContract } from '../../lib/tokens-contract';
import { scoreTokens } from '../../lib/tokens-score';
import { GUARDRAILS_PARTS, REPORT_DETAILS, guardrailsPartNames, guardrailsParts, reportSummary } from '../../lib/mcp-trim';

// ── Configuration ─────────────────────────────────────────────────────────────

const BASE_URL = 'https://www.designesy.org';

// 5-minute in-memory cache (per instance; Vercel Fluid Compute reuses instances)
const CACHE_TTL = 300_000; // 5 minutes in ms
const cache = new Map<string, { ts: number; data: unknown }>();

async function cachedFetch(url: string, asJson: boolean = true): Promise<unknown> {
  const now = Date.now();
  const cached = cache.get(url);
  if (cached && now - cached.ts < CACHE_TTL) {
    return cached.data;
  }

  // SSRF-safe fetch: connection-level IP-pinned + URL/DNS guarded (shared by
  // the URL-fetching MCP tools).
  const res = await safeFetch(url, {
    headers: {
      'Accept': asJson ? 'application/json' : 'text/plain, */*',
      'User-Agent': `designesy-mcp/${MCP_SERVER_VERSION} (https://www.designesy.org)`,
    },
  });

  if (!res.ok) {
    throw new Error(`Fetch failed: ${res.status} ${res.statusText} for ${url}`);
  }

  const data = asJson ? await res.json() : await res.text();
  cache.set(url, { ts: now, data });
  return data;
}

// The full contract's size and top-level keys, DERIVED from the contract this
// deployment serves at /contracts/design-system.json, so designesy_contract's
// description and its enum cannot drift from what the tool returns. The tool
// returns JSON.stringify(contract, null, 2); tokens are estimated at 4
// characters each.
const CONTRACT_KEYS = Object.keys(designSystemContract) as [string, ...string[]];
const CONTRACT_JSON_CHARS = JSON.stringify(designSystemContract, null, 2).length;
const CONTRACT_SIZE = `about ${Math.round(CONTRACT_JSON_CHARS / 1000)} KB (roughly ${Math.round(CONTRACT_JSON_CHARS / 4000)}k tokens)`;

// The rate limits the engine routes enforce per calling address, per hour
// (each route's own RATE_LIMIT; middleware.ts enforces the same number at the
// edge, except for /api/score, where the edge allows 100 a minute).
// scripts/check-mcp-accuracy.js reads each route's RATE_LIMIT and fails when a
// number here, or in a description, differs.
const ENGINE_HOURLY_LIMITS = {
  score: 100,
  drift: 50,
  readiness: 50,
  guardrails: 50,
  monitor: 50,
  compare: 30,
  report: 20,
} as const;

/** One JSON text content block: what the reference tools return. */
function jsonContent(value: unknown) {
  return { content: [{ type: 'text' as const, text: JSON.stringify(value, null, 2) }] };
}

/**
 * A scoring tool's success: the JSON as the text block it always returned, and
 * the same object as structuredContent, which the SDK checks against the
 * tool's outputSchema.
 */
function structured(value: Record<string, unknown>) {
  return { ...jsonContent(value), structuredContent: value };
}

/** The output schema of a scoring tool, as the SDK takes it. */
function outputSchema(name: McpScoringTool) {
  return fromJsonSchema(MCP_OUTPUT_SCHEMAS[name]);
}

// ── Errors ───────────────────────────────────────────────────────────────────
//
// A failure is what happened, whether one retry can help, and what to do next.
// The three answers come from the failure itself: an engine's HTTP status and
// the error it wrote, a file host's HTTP status, or the error a fetch threw.
// "Needs the user" is a failure that is not retryable and whose next step is a
// question for the person (a login wall, a blocked or mistyped address).

interface ToolFailure {
  what: string;
  retryable: boolean;
  next?: string;
}

const sentence = (s: string) => (/[.!?]$/.test(s) ? s : `${s}.`);

/** A tool error: isError set, no structuredContent, and whether one retry can help. */
function toolError(f: ToolFailure, extra: Record<string, unknown> = {}) {
  const text = `${sentence(f.what)} Retryable: ${f.retryable ? 'yes, once' : 'no'}.${f.next ? ` ${sentence(f.next)}` : ''}`;
  return {
    ...jsonContent({ success: false, error: sanitizeErrorText(text), retryable: f.retryable, ...extra }),
    isError: true as const,
  };
}

const messageOf = (e: unknown) => (e instanceof Error ? e.message : String(e));

/** The error text an engine wrote ({ ok: false, error }), else its body, clipped. */
function engineSaid(body: string): string {
  let said = body.trim();
  try {
    const parsed = JSON.parse(body) as { error?: unknown } | null;
    if (parsed && typeof parsed.error === 'string') said = parsed.error;
  } catch {
    // Not JSON (a platform error page): keep the text.
  }
  return said.length > 300 ? `${said.slice(0, 300)}...` : said;
}

/** Why a call to one of this site's engines failed, from its HTTP status and body. */
function engineStatusFailure(engine: string, status: number, body: string, retryAfter: string | null): ToolFailure {
  const said = engineSaid(body);
  const what = `The ${engine} engine returned HTTP ${status}${said ? `: ${said}` : ''}`;
  if (status === 429) {
    return { what, retryable: true, next: retryAfter && /^\d+$/.test(retryAfter) ? `Wait ${retryAfter} seconds first` : 'Wait for the rate-limit window to pass first' };
  }
  if (status === 408) return { what, retryable: true };
  if (status >= 400 && status < 500) {
    return { what, retryable: false, next: 'Correct the input as the message says: a URL must be a public http(s) address with a domain name' };
  }
  if (status === 502 && /could not (?:fetch|read|generate)/i.test(said)) {
    return { what, retryable: true, next: 'If it fails again, the page probably blocks automated requests or needs a login, or the URL is mistyped: check the URL with the user' };
  }
  return { what, retryable: true, next: 'The engine failed or timed out; if the retry fails too, try again later' };
}

type EngineReply =
  | { ok: true; data: Record<string, unknown>; text: string }
  | { ok: false; failure: ToolFailure };

/**
 * POST a JSON body to one of this site's engine routes. With raw, a 2xx body
 * is returned as text (format review is markdown); otherwise it must be a JSON
 * object.
 */
async function callEngine(engine: string, path: string, body: unknown, headers: Record<string, string>, raw = false): Promise<EngineReply> {
  let res: Response;
  try {
    res = await fetch(`${BASE_URL}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...headers },
      body: JSON.stringify(body),
    });
  } catch (e) {
    return { ok: false, failure: { what: `Could not reach the ${engine} engine at www.designesy.org (${messageOf(e)})`, retryable: true } };
  }
  const text = await res.text().catch(() => '');
  if (!res.ok) return { ok: false, failure: engineStatusFailure(engine, res.status, text || res.statusText, res.headers.get('retry-after')) };
  if (raw) return { ok: true, data: {}, text };
  try {
    const data = JSON.parse(text) as unknown;
    if (data !== null && typeof data === 'object' && !Array.isArray(data)) return { ok: true, data: data as Record<string, unknown>, text };
  } catch {
    // Falls through to the failure below.
  }
  return { ok: false, failure: { what: `The ${engine} engine returned HTTP ${res.status} with a body that is not a JSON object`, retryable: true } };
}

/**
 * Why reading a published document from www.designesy.org failed. cachedFetch
 * throws "Fetch failed: <status> ..." for an HTTP error; anything else is the
 * network or the parse.
 */
function documentFailure(source: string, e: unknown): ToolFailure {
  const msg = messageOf(e);
  const status = Number(/^Fetch failed: (\d{3})/.exec(msg)?.[1] ?? 0);
  const what = `Could not read ${source} (${msg})`;
  if (status >= 400 && status < 500 && status !== 408 && status !== 429) return { what, retryable: false, next: 'The published document is missing; the tool cannot work until the site serves it again' };
  return { what, retryable: true };
}

/** Why fetching the caller's file (a token file or a Lottie file) threw. */
function fileFetchFailure(url: string, e: unknown, inline: string): ToolFailure {
  const msg = messageOf(e);
  const what = `Could not read ${url} (${msg})`;
  if (/^SSRF guard: blocked URL/.test(msg)) {
    return { what: `${url} is not a public http(s) URL`, retryable: false, next: 'Private, loopback and IP-literal addresses and host names without a dot are refused; use the file\'s public address' };
  }
  if (/^SSRF guard: blocked DNS resolution|has no public address/.test(msg)) {
    return { what: `The host in ${url} did not resolve to a public address`, retryable: false, next: 'The name may be mistyped or may not exist, or it points at a private network: check the URL with the user' };
  }
  if (/exceeded \d+ redirects/.test(msg)) return { what, retryable: false, next: 'The address redirects too many times; ask the user for the file\'s direct URL' };
  if (/timeout|timed out|ETIMEDOUT|ECONNRESET|ECONNREFUSED|EAI_AGAIN|socket hang up|aborted/i.test(msg)) return { what, retryable: true };
  return { what, retryable: false, next: `Check the URL with the user, or pass the file's contents as ${inline}` };
}

/** Why the caller's file host answered with an error status. */
function fileStatusFailure(url: string, status: number, statusText: string, retryAfter: string | null, inline: string): ToolFailure {
  const what = `${url} returned HTTP ${status}${statusText ? ` ${statusText}` : ''}`;
  if (status === 429) return { what, retryable: true, next: retryAfter && /^\d+$/.test(retryAfter) ? `Wait ${retryAfter} seconds first` : undefined };
  if (status === 408 || status >= 500) return { what, retryable: true };
  if (status === 401 || status === 403) return { what, retryable: false, next: `The file needs a login or blocks automated requests: ask the user for a public copy, or pass its contents as ${inline}` };
  return { what, retryable: false, next: 'Check the URL with the user' };
}

/**
 * Read the caller's JSON file through the SSRF guard: the parsed object, or
 * the failure. No cache: the file is read on every call.
 */
async function readJsonFile(url: string, inline: string): Promise<{ ok: true; data: Record<string, unknown> } | { ok: false; failure: ToolFailure }> {
  let res: Response;
  try {
    // SSRF-safe fetch: connection-level IP-pinned + URL/DNS guarded.
    res = await safeFetch(url, {
      headers: { 'Accept': 'application/json', 'User-Agent': `designesy-mcp/${MCP_SERVER_VERSION}` },
    });
  } catch (e) {
    return { ok: false, failure: fileFetchFailure(url, e, inline) };
  }
  if (!res.ok) return { ok: false, failure: fileStatusFailure(url, res.status, res.statusText, res.headers.get('retry-after'), inline) };
  let data: unknown;
  try {
    data = await res.json();
  } catch {
    return { ok: false, failure: { what: `${url} did not return JSON`, retryable: false, next: `Check that the URL points at the raw JSON file, or pass its contents as ${inline}` } };
  }
  if (data === null || typeof data !== 'object' || Array.isArray(data)) {
    return { ok: false, failure: { what: `${url} returned JSON that is not an object`, retryable: false, next: 'The file must be a JSON object' } };
  }
  return { ok: true, data: data as Record<string, unknown> };
}

/** A designesy_contract input error, with the keys that would work. */
function contractError(message: string, unknown: string[], valid: string[]) {
  return toolError(
    { what: `${message} Valid sections: ${valid.join(', ')}.`, retryable: false },
    { unknown_sections: unknown, valid_sections: valid },
  );
}

/** A designesy_guardrails parts error, with the names that would work. */
function partsError(message: string, unknown: string[]) {
  return toolError(
    { what: `${message} Valid parts: ${GUARDRAILS_PARTS.join(', ')}.`, retryable: false },
    { unknown_parts: unknown, valid_parts: [...GUARDRAILS_PARTS] },
  );
}

// ── Shared description text ──────────────────────────────────────────────────

/** The errors clause of a tool that sends a page to one of the engines. */
function pageEngineErrors(engine: keyof typeof ENGINE_HOURLY_LIMITS, unit: string): string {
  return `Errors: a timeout, HTTP 5xx or HTTP 429 (the ${engine} engine allows ${ENGINE_HOURLY_LIMITS[engine]} ${unit} an hour per address) is worth one retry; HTTP 400 (not a public http(s) URL) is final; a page the engine could not fetch is worth one retry, after which it needs the user: the page may block automated requests or need a login, or the URL may be mistyped.`;
}

const READS_DOCUMENT = 'Takes no parameters; reads the file from www.designesy.org, cached for 5 minutes by this server.';
const RETURNS_SCHEMA = 'Returns JSON described by the output schema.';

// Parameter descriptions shared by the tools that take a page URL.
const PAGE_URL = (what: string) => `${what}, for example "https://example.com/". Defaults to https://www.designesy.org/.`;

// ── MCP Handler ────────────────────────────────────────────────────────────────

const handler = createMcpHandler(
  (server) => {
    // ── Tool 1: designesy_catalog ────────────────────────────────────────────
    server.registerTool(
      'designesy_catalog',
      {
        ...mcpToolDisplay('designesy_catalog'),
        // The count is DERIVED from the catalog this tool serves, never restated.
        // It read a hardcoded "23 published packages" and went stale when the
        // catalog reached 24, so the description and the payload disagreed about
        // the same fact. Same class as the catalog's version fields: a number
        // written twice, with nothing comparing the two.
        description: `List the ${openIndex.packages.length} packages Designesy publishes (contracts, kits, labs, reviews and tools), each with its version, status, and human and machine URLs. Use this when you need to see what Designesy publishes before reading one item. When not to use: for the design-system contract itself, use designesy_contract; for the org's discovery manifest, use designesy_agent_json. Behaviour: reads https://www.designesy.org/open.json, cached for 5 minutes by this server; takes no parameters. If designesy.org cannot be reached, the error says whether a retry can help. Returns JSON: { package_count, packages[{ id, kind, number, title, version, status, lede, human_url, machine_url }], machine_exports[], standing_rules[], catalog_version, updated, identity, thesis, public_url }.`,
        inputSchema: fromJsonSchema(NO_PARAMETER_INPUT_SCHEMA),
      },
      async () => {
        const source = `${BASE_URL}/open.json`;
        let data: Record<string, unknown>;
        try {
          data = await cachedFetch(source, true) as Record<string, unknown>;
        } catch (e) {
          return toolError(documentFailure(source, e));
        }
        const packages = (data.packages as Array<Record<string, unknown>>) || [];
        const machineExports = (data.machine_exports as Array<Record<string, unknown>>) || [];
        const result = {
          catalog_version: data.version,
          updated: data.updated,
          identity: data.identity,
          thesis: data.thesis,
          public_url: data.public_url,
          package_count: packages.length,
          packages: packages.map((p) => ({
            id: p.id,
            kind: p.kind,
            number: p.number,
            title: p.title,
            version: p.version,
            status: p.status,
            lede: p.lede,
            human_url: p.human_url,
            machine_url: p.machine_url,
          })),
          machine_exports: machineExports,
          standing_rules: data.standing_rules || [],
        };
        return jsonContent(result);
      },
    );

    // ── Tool 2: designesy_contract ───────────────────────────────────────────
    server.registerTool(
      'designesy_contract',
      {
        ...mcpToolDisplay('designesy_contract'),
        // The size and the key list are derived (CONTRACT_SIZE, CONTRACT_KEYS
        // above). This read "cached ~24h server-side" while the server cached
        // for 5 minutes, and offered no way to return less than ~25k tokens
        // beyond a single named section. The keys are an enum since 1.13.9;
        // the unknown-key error below stays for a contract that lacks a key
        // this deployment knows (a deploy running ahead of the served file).
        description: `Get the Designesy design-system contract: its top-level sections such as colors, motion, typography, takt, cadence, acoustic, components, accessibility and verification. Use this when you need the contract's actual values (token names and values, motion timings, accessibility rules) to build, check or cite a design. When not to use: for a pass/fail score of a live page, use designesy_score; for the same rules as an agent skill file, use designesy_skill_md. Behaviour: reads https://www.designesy.org/contracts/design-system.json, cached for 5 minutes by this server. With no arguments it returns the whole contract, ${CONTRACT_SIZE}. To return less, pass sections, a list of top-level keys such as ["motion", "colors"]: the result holds id, version and only those keys. section (one key) is the older form and returns { section, data }. Both take only the contract's top-level keys, listed in the parameter's enum; an unknown key returns an error that lists every valid key. Returns JSON: the contract object, or the slice asked for.`,
        inputSchema: z.object({
          sections: z.array(z.enum(CONTRACT_KEYS)).optional().describe('Optional: the top-level keys to return, for example ["motion", "colors"]. The result holds id, version and only these keys. Omit for the whole contract.'),
          section: z.enum(CONTRACT_KEYS).optional().describe('Optional, older form: one top-level key, for example "motion"; returns { section, data }. Prefer sections.'),
        }),
      },
      async ({ sections, section }) => {
        const source = `${BASE_URL}/contracts/design-system.json`;
        let data: Record<string, unknown>;
        try {
          data = await cachedFetch(source, true) as Record<string, unknown>;
        } catch (e) {
          return toolError(documentFailure(source, e));
        }
        const valid = Object.keys(data);
        // Own keys only: `in` would also accept inherited names such as "constructor".
        const has = (k: string) => Object.prototype.hasOwnProperty.call(data, k);
        if (sections !== undefined) {
          // section, when also given, joins the list; duplicates are dropped.
          const names = [...new Set([...(section ? [section] : []), ...sections])];
          if (names.length === 0) {
            return contractError('sections is empty; name at least one section, or omit it for the full contract.', [], valid);
          }
          const unknown = names.filter((n) => !has(n));
          if (unknown.length > 0) {
            return contractError(`Unknown contract section(s): ${unknown.join(', ')}.`, unknown, valid);
          }
          const slice: Record<string, unknown> = { id: data.id, version: data.version };
          for (const n of names) slice[n] = data[n];
          return jsonContent(slice);
        }
        if (section) {
          if (has(section)) return jsonContent({ section, data: data[section] });
          return contractError(`Unknown contract section: ${section}.`, [section], valid);
        }
        return jsonContent(data);
      },
    );

    // ── Tool 3: designesy_design_review ──────────────────────────────────────
    server.registerTool(
      'designesy_design_review',
      {
        ...mcpToolDisplay('designesy_design_review'),
        // Returns the kit's rubric without its agent_prompt (see
        // designReviewRubric in lib/mcp-reference.ts for why). The Returns
        // shape below is the object designReviewRubric builds.
        description: 'Get the Designesy Design Review rubric for a qualitative critique: eight dimensions (Purpose, Clarity, Context, Inclusion, System coherence, Durability, Delight, Responsibility), the output format, the verification checklist, anti-patterns and rationalizations, from the published Design Review kit. Use this when a design needs a structured, holistic critique rather than a numeric score. When not to use: for a deterministic score of a live page, use designesy_score. Behaviour: reads https://www.designesy.org/kits/design-review.json, cached for 5 minutes by this server, and returns it as reference data; it evaluates nothing. The kit\'s copy-ready review prompt is left out; kit_prompt_url is the page where a person can read it. artifact, purpose, context and rules are optional and are only recorded in inputs (rules defaults to the current contract version). Returns JSON: { kind: "review_rubric", source_url, note, inputs (only when one is passed), kit { id, title, version, status, purpose, quality_bar, permission }, when_to_use[], required_inputs[], dimensions[8] { num, title, desc }, output_format[], verification_checklist[], anti_patterns[], rationalizations[], kit_prompt_url, kit_prompt_note, omitted_fields[] }.',
        inputSchema: z.object({
          artifact: z.string().optional().describe('Optional: the URL or a short description of the design to review, for example "https://example.com/pricing".'),
          purpose: z.string().optional().describe('Optional: what the design is meant to make possible, for example "let a visitor compare plans and start a trial".'),
          context: z.string().optional().describe('Optional: audience, device, environment and constraints, for example "first-time visitors on mobile, slow networks".'),
          rules: z.string().optional().describe('Optional: the governing rules or contract version, for example "WCAG 2.2 AA and the team style guide". Defaults to the current Designesy contract version.'),
        }),
      },
      async ({ artifact, purpose, context, rules }) => {
        const source = `${BASE_URL}/kits/design-review.json`;
        let kit: Record<string, unknown>;
        try {
          kit = await cachedFetch(source, true) as Record<string, unknown>;
        } catch (e) {
          return toolError(documentFailure(source, e));
        }
        return jsonContent(designReviewRubric(kit, source, { artifact, purpose, context, rules }, 'designesy design system ' + CONTRACT_VERSION));
      },
    );

    // ── Tools 4-7: the published documents ────────────────────────────────────
    // Each description says what the document is for, how big the result is
    // (scripts/check-mcp-accuracy.js renders each document from this checkout
    // and holds the stated size to it), and when one of the other three suits
    // better: llms.txt (short prose), llms-full.txt (long prose), agent.json
    // (structured fields), SKILL.md (the design rules for a coding agent).
    server.registerTool(
      'designesy_skill_md',
      {
        ...mcpToolDisplay('designesy_skill_md'),
        description: `Get the Designesy SKILL.md: the design-system contract written as an agent skill file in markdown (tokens, rules, anti-patterns and verification), for a person to save into a project's skills folder or a system prompt so a coding agent builds UI to the contract. Use this when the user wants the contract in that form; it is about the design rules, not about Designesy as an org, and runs to about 31,000 characters. When not to use: for the contract's raw values as JSON, use designesy_contract; for an overview of Designesy, use designesy_llms_txt; for a score, use designesy_score. Behaviour: ${READS_DOCUMENT} Any section written as steps or a prompt for an AI agent is replaced by a one-line marker and named in omitted_sections. Returns JSON: { kind: "published_document", source_url, media_type: "text/markdown", note, omitted_sections[], content }.`,
        inputSchema: fromJsonSchema(NO_PARAMETER_INPUT_SCHEMA),
      },
      async () => {
        const source = `${BASE_URL}/contracts/skill`;
        let text: string;
        try {
          text = await cachedFetch(source, false) as string;
        } catch (e) {
          return toolError(documentFailure(source, e));
        }
        return jsonContent(publishedText(source, 'text/markdown', text));
      },
    );

    server.registerTool(
      'designesy_agent_json',
      {
        ...mcpToolDisplay('designesy_agent_json'),
        // The Returns shape named ingest_protocol, package_index,
        // permission_policy and citation_templates; the published document's
        // keys are ingest, packages, permission and cite.
        description: `Get the Designesy agent discovery document (/.well-known/agent.json): the org's identity, authority, discovery endpoints, package index, machine exports, permission policy, contact and citation templates, as JSON. Use this when a program or integration needs those facts as structured fields; the result is about 13,000 characters. When not to use: for the package list alone, use designesy_catalog; for a prose overview, use designesy_llms_txt or designesy_llms_full_txt; for the design rules, use designesy_contract. Behaviour: ${READS_DOCUMENT} Any field written as steps for an AI agent (such as ingest.steps) is removed and its path listed in omitted_fields. Returns JSON: { kind: "published_document", source_url, media_type: "application/json", note, omitted_fields[], document }.`,
        inputSchema: fromJsonSchema(NO_PARAMETER_INPUT_SCHEMA),
      },
      async () => {
        const source = `${BASE_URL}/.well-known/agent.json`;
        let doc: unknown;
        try {
          doc = await cachedFetch(source, true);
        } catch (e) {
          return toolError(documentFailure(source, e));
        }
        return jsonContent(publishedJson(source, doc));
      },
    );

    server.registerTool(
      'designesy_llms_txt',
      {
        ...mcpToolDisplay('designesy_llms_txt'),
        // It read "~500 tokens" while the file was ~6,900 characters.
        description: `Get the Designesy /llms.txt brief: a short plain-text overview of what Designesy is, its canonical links, topics, published packages, machine exports, standing rules and contact. Use this when you know little about Designesy and want the cheapest orientation, about 7,000 characters. When not to use: for more depth in prose, use designesy_llms_full_txt (about 14,000 characters); for the same facts as structured JSON (endpoints, permission policy, citation templates), use designesy_agent_json; for the design rules themselves, use designesy_contract or designesy_skill_md. Behaviour: ${READS_DOCUMENT} Any section written as steps for an AI agent (such as the ingest steps) is replaced by a one-line marker and named in omitted_sections. Returns JSON: { kind: "published_document", source_url, media_type: "text/plain", note, omitted_sections[], content }.`,
        inputSchema: fromJsonSchema(NO_PARAMETER_INPUT_SCHEMA),
      },
      async () => {
        const source = `${BASE_URL}/llms.txt`;
        let text: string;
        try {
          text = await cachedFetch(source, false) as string;
        } catch (e) {
          return toolError(documentFailure(source, e));
        }
        return jsonContent(publishedText(source, 'text/plain', text));
      },
    );

    server.registerTool(
      'designesy_llms_full_txt',
      {
        ...mcpToolDisplay('designesy_llms_full_txt'),
        // It read "~3000 tokens" while the file was ~16,000 characters, and it
        // promised the paste-ready agent prompt, which is left out of tool output.
        description: `Get the Designesy /llms-full.txt brief: the long plain-text overview, with authority, discovery endpoints, topics, every published package with its links, standing rules and anti-patterns. Use this when the short brief is not enough and prose suits the task better than JSON; it is about 14,000 characters. When not to use: for a quick orientation, use designesy_llms_txt (about 7,000 characters); for structured fields, use designesy_agent_json; for the design rules themselves, use designesy_contract or designesy_skill_md. Behaviour: ${READS_DOCUMENT} Any section written as steps or a prompt for an AI agent (such as the ingest protocol and the paste-ready agent prompt) is replaced by a one-line marker and named in omitted_sections. Returns JSON: { kind: "published_document", source_url, media_type: "text/plain", note, omitted_sections[], content }.`,
        inputSchema: fromJsonSchema(NO_PARAMETER_INPUT_SCHEMA),
      },
      async () => {
        const source = `${BASE_URL}/llms-full.txt`;
        let text: string;
        try {
          text = await cachedFetch(source, false) as string;
        } catch (e) {
          return toolError(documentFailure(source, e));
        }
        return jsonContent(publishedText(source, 'text/plain', text));
      },
    );

    // ── Tool 8: designesy_score ───────────────────────────────────────────────
    // Calls the internal /api/score endpoint — the contract verification engine
    // that already runs natively on this same Vercel project. No Python needed.
    // A page the engine cannot read is a 200 with score null and unreachable
    // true (see scoreUrlUncached), so it is a result here, not an error.
    server.registerTool(
      'designesy_score',
      {
        ...mcpToolDisplay('designesy_score'),
        description: `Score a live web page against the Designesy design contract with the ${ENGINE_CHECK_COUNT}-check rule engine: a 0-100 score, an A-F grade, and each check's verdict and remediation. Use this when a website or AI-built UI needs a numeric, repeatable audit (tokens, motion, accessibility, cadence, takt, typography, copywriting). When not to use: for a token file, use designesy_tokens_score; for a Lottie file, designesy_motion_score; for drift within a site's own tokens, designesy_drift_score; for a qualitative critique, designesy_design_review. Behaviour: the engine at www.designesy.org reads the page and its stylesheets and caches the result for about 24 hours per URL and scope. Checks that need a live browser return MANUAL and checks that do not apply return SKIP; neither counts toward the score. The score subtracts the slop deduction, itemized in slop: generic, template-like patterns (an overused font family, for example), up to 5 points each and 20 in all. A page the engine cannot read (blocked, behind a login, timed out) returns score null with unreachable true and the reason, not an error. format selects the output: designesy (default, the engine's JSON), canonical, google, or review (a markdown report). Errors: a timeout, HTTP 5xx or HTTP 429 (the score engine allows ${ENGINE_HOURLY_LIMITS.score} scores an hour per address) is worth one retry; HTTP 400 (not a public http(s) URL) is final. ${RETURNS_SCHEMA}`,
        // format and scope are the /api/score body fields of the same names.
        inputSchema: z.object({
          url: z.string().optional().describe(PAGE_URL('The page to score')),
          format: z.enum(['designesy', 'canonical', 'review', 'google']).default('designesy').describe('Output format, for example "canonical". designesy (the default): the engine\'s JSON. canonical: the review-findings.json schema. review: a markdown report. google: findings and a summary in the design.md linter\'s shape.'),
          scope: z.enum(['contract', 'universal']).optional().describe('Scoring scope, for example "universal". contract: every check counts absence against the site. universal: optional features and Designesy-specific token checks return SKIP when absent. Omit to auto-detect: contract for designesy.org, universal for every other site.'),
        }),
        outputSchema: outputSchema('designesy_score'),
      },
      async ({ url, format, scope }) => {
        const targetUrl = url || `${BASE_URL}/`;
        const outputFormat = format ?? 'designesy';
        const reply = await callEngine(
          'score',
          '/api/score',
          // scope is sent only when given, so the engine's auto-detection still applies.
          { url: targetUrl, format: outputFormat, ...(scope ? { scope } : {}) },
          // The user agent names this surface for the usage counters (lib/usage.ts).
          { 'User-Agent': `designesy-mcp/${MCP_SERVER_VERSION} (https://www.designesy.org)` },
          outputFormat === 'review',
        );
        if (!reply.ok) return toolError(reply.failure, { url: targetUrl });
        // The review format is markdown (text/markdown): the text block is the
        // report as the engine wrote it, and structuredContent carries it too,
        // because a tool with an outputSchema returns structuredContent on
        // every success.
        if (outputFormat === 'review') {
          return { content: [{ type: 'text' as const, text: reply.text }], structuredContent: { format: 'review', markdown: reply.text } };
        }
        return structured(reply.data);
      },
    );

    // ── Tool 9: designesy_tokens_score ─────────────────────────────────────────
    // Validates a design token file against the W3C DTCG 2025.10 format: the
    // tokens contract's ten checks (t01-t10), run by app/lib/tokens-score.ts.
    // The checks used to be computed here; the PyPI server ports the module,
    // and scripts/check-mcp-tool-parity.js holds the two to one golden. The
    // contract is the one this deployment serves at /contracts/tokens.json.
    // A SKIP is not scored: a clean file whose t07 has no custom types to
    // check used to score 90, not 100. A WARN counts half (it counted zero
    // until 1.13.8), as in designesy_motion_score and the score engine.
    // The description named a $description check that none of t01-t10 runs
    // (fixed in 1.13.9).
    server.registerTool(
      'designesy_tokens_score',
      {
        ...mcpToolDisplay('designesy_tokens_score'),
        description: 'Validate one design token file against the W3C Design Tokens Community Group format (DTCG 2025.10, the first stable version) with the tokens contract\'s ten checks (t01-t10): a $schema pointing at designtokens.org, groups, $type and $value on every token, structured colors (colorSpace and components, not bare hex), standard types, namespaced custom types, dimension units, a nested naming hierarchy, and no pre-2025.10 patterns. Use this when you have a tokens.json or any DTCG export and need to know whether it is well formed. When not to use: for a whole live site rather than its token file, use designesy_score; for drift in a site\'s CSS tokens, use designesy_drift_score. Behaviour: pass url (the file is read from that address) or dtcg_file (the JSON text); if both are given, dtcg_file is used. No browser. Score: PASS=1, WARN=0.5, FAIL=0, SKIP is not scored; points / scored checks x 100. Errors: a timeout, HTTP 429 or 5xx from the file\'s host is worth one retry; a private or non-http(s) URL, a host name that does not resolve, a 404, or a reply that is not a JSON object is final; HTTP 401 or 403 needs the user (pass the file\'s contents as dtcg_file instead). Returns JSON described by the output schema: score, grade, the four counts (pass_count, fail_count, warn_count, skip_count), scoring and checks[{ id, name, status, detail }].',
        inputSchema: z.object({
          url: z.string().optional().describe('URL of a DTCG token file (JSON), for example "https://example.com/tokens.json". Use this or dtcg_file.'),
          dtcg_file: z.string().optional().describe('The token file\'s JSON as a string, for example "{\\"color\\": {\\"ink\\": {\\"$type\\": \\"color\\", \\"$value\\": {\\"colorSpace\\": \\"srgb\\", \\"components\\": [0, 0, 0]}}}}". Used instead of url when both are given.'),
        }),
        outputSchema: outputSchema('designesy_tokens_score'),
      },
      async ({ url, dtcg_file }) => {
        let tokenData: Record<string, unknown>;
        if (dtcg_file) {
          let parsed: unknown;
          try {
            parsed = JSON.parse(dtcg_file);
          } catch {
            return toolError({ what: 'Invalid JSON in dtcg_file parameter', retryable: false, next: 'Pass the token file as valid JSON text' });
          }
          if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
            return toolError({ what: 'Token file is not a JSON object', retryable: false, next: 'The file must be a JSON object' });
          }
          tokenData = parsed as Record<string, unknown>;
        } else if (url) {
          const file = await readJsonFile(url, 'dtcg_file');
          if (!file.ok) return toolError(file.failure, { url });
          tokenData = file.data;
        } else {
          return toolError(
            { what: 'Either url or dtcg_file is required', retryable: false, next: 'Pass the token file\'s URL as url, or its JSON text as dtcg_file' },
            { contract_id: tokensContract.id, contract_version: tokensContract.version },
          );
        }
        return structured(scoreTokens(tokenData, tokensContract, url || '(inline dtcg_file)'));
      },
    );

    // ── Tool 10: designesy_a11y_score ──────────────────────────────────────────
    // Returns the accessibility contract + verification framework.
    // axe-core requires a real DOM (browser), so this tool returns the
    // contract checks + a Playwright script template the calling agent runs
    // locally. The agent executes axe-core 4.13.0 via @axe-core/playwright.
    //
    // Each check is { id, name, status }, the name being the contract's own
    // (its `item`). The route used to fetch the contract untyped and read
    // c.name, which the contract rows do not have, so every check came back
    // as { id, status }. It now reads the contract this deployment serves at
    // /contracts/a11y.json, typed, so a field the rows lack does not compile.
    server.registerTool(
      'designesy_a11y_score',
      {
        ...mcpToolDisplay('designesy_a11y_score'),
        description: 'Get the Designesy WCAG 2.2 AA accessibility kit: the contract\'s eleven checks (a01-a11) and a ready-to-run Playwright test that scans a URL with axe-core 4.13.0 and prints a score. Use this when a page needs an accessibility audit and a browser test can run locally (npm i -D @axe-core/playwright). When not to use: for a full design-contract score of a live page, use designesy_score. Behaviour: this tool scans nothing; axe-core needs a real browser, so every check comes back PENDING_EXECUTION and the score comes from running the script. url is written into the script and is not fetched here; ruleset picks the axe-core tag (default wcag22aa); config is JSON written into the script as an axe.configure() call. Errors: config that is not valid JSON is final (correct it and call again). Returns JSON described by the output schema: checks[{id (a01-a11), name, status: "PENDING_EXECUTION"}], playwright_script, install_command and run_command.',
        inputSchema: z.object({
          url: z.string().describe('The page the generated script will scan, for example "https://example.com/". Written into the script; not fetched by this tool.'),
          ruleset: z.enum(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa', 'best-practice']).optional().describe('The axe-core tag the script runs, for example "wcag21aa". Default wcag22aa.'),
          config: z.string().optional().describe('Optional JSON, as a string, for an axe.configure() call in the script, for example "{\\"rules\\": [{\\"id\\": \\"color-contrast\\", \\"enabled\\": false}]}". Omit for the standard WCAG 2.2 AA run.'),
        }),
        outputSchema: outputSchema('designesy_a11y_score'),
      },
      async ({ url, ruleset, config }) => {
        const contract = a11yContract;
        const tag = ruleset || 'wcag22aa';

        // Parse config if provided
        let brandConfig: Record<string, unknown> | null = null;
        if (config) {
          try {
            brandConfig = JSON.parse(config);
          } catch {
            return toolError({ what: 'Invalid JSON in config parameter', retryable: false, next: 'Pass config as valid JSON text, or omit it' });
          }
        }

        // Generate the Playwright script template for the calling agent
        const configLine = brandConfig
          ? `const brandConfig = ${JSON.stringify(brandConfig, null, 2)};\n  await axe.configure(brandConfig);`
          : '';

        const playwrightScript = `// axe-core 4.13.0 + Playwright: generated by designesy_a11y_score
// Install: npm i -D @axe-core/playwright
import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

test('${url}: WCAG 2.2 AA scan', async ({ page }) => {
  await page.goto('${url}');
  ${configLine}
  const results = await new AxeBuilder({ page })
    .withTags(['${tag}'])
    .analyze();

  const violations = results.violations;
  const passCount = results.passes.length;
  const failCount = violations.length;
  const incompleteCount = results.incomplete.length;
  const score = Math.round((passCount / (passCount + failCount)) * 100);
  const grade = score >= 90 ? 'A' : score >= 80 ? 'B' : score >= 70 ? 'C' : score >= 60 ? 'D' : 'F';

  console.log(JSON.stringify({
    url: '${url}',
    ruleset: '${tag}',
    score, grade,
    pass_count: passCount,
    fail_count: failCount,
    incomplete_count: incompleteCount,
    violations: violations.map(v => ({
      id: v.id,
      description: v.description,
      help: v.help,
      impact: v.impact,
      nodes: v.nodes.length,
      tags: v.tags,
    })),
  }, null, 2));

  expect(violations.filter(v => v.impact === 'critical').length).toBe(0);
});`;

        return structured({
          contract_id: contract.id,
          contract_version: contract.version,
          contract_status: contract.status,
          url,
          ruleset: tag,
          brand_config: brandConfig,
          summary: 'axe-core requires a real DOM. This tool returns the contract checks + a Playwright script. Execute the script locally with @axe-core/playwright 4.13.0 to get the actual score.',
          checks: contract.verification.checks.map((c) => ({
            id: c.id,
            name: c.item,
            status: 'PENDING_EXECUTION',
          })),
          playwright_script: playwrightScript,
          install_command: 'npm i -D @axe-core/playwright@4.13.0',
          run_command: 'npx playwright test a11y-scan.spec.ts --reporter=line',
          provenance: 'axe-core 4.13.0 + W3C WCAG 2.2 + ACT Rules + designesy-core.v0.4.0 §6',
          priority: 'HIGH',
        });
      },
    );

    // ── Tool 11: designesy_motion_score ───────────────────────────────────────
    // Runs the motion contract's ten checks (m01-m10) on one Lottie file. The
    // checks live in app/lib/motion-score.ts: each computes its own verdict under
    // its own id and the contract's name for that id. They used to be computed
    // here as a different list of ten and labelled with the contract's names by
    // array position, so every verdict sat under another check's name. The
    // contract is the one this deployment serves at /contracts/motion.json.
    server.registerTool(
      'designesy_motion_score',
      {
        ...mcpToolDisplay('designesy_motion_score'),
        description: 'Validate one Lottie animation file against the Designesy motion contract: its ten checks (m01-m10), drawn from the Lottie spec v1.0.1 and the Designesy Ten Non-Negotiable Motion Standards, each PASS, FAIL, WARN or SKIP under the contract\'s own name: m01 the top-level animation object (layer contents are not validated, so a clean file returns SKIP), m02 required fields (v, fr, ip, op, w, h, layers), m03 no deprecated 4.x Bodymovin version, m04 a markers array, m05 a meta object, m06 a reduced-motion path, m07 keyframe easing (linear, ease and ease-in fail), m08 duration within 300 ms (longer is WARN), and m09 and m10 SKIP (they concern the embedding page). Use this when a motion asset must be well formed and carry reduced-motion support. When not to use: for the motion CSS of a whole site, use designesy_score. Behaviour: pass url (read from that address) or lottie_file (the JSON text); if both are given, lottie_file is used. No browser. Score: PASS=1, WARN=0.5, FAIL=0, SKIP is not scored; points / scored checks x 100. Errors: a timeout, HTTP 429 or 5xx from the file\'s host is worth one retry; a private or non-http(s) URL, an unresolvable host, a 404, or a reply that is not a JSON object is final; HTTP 401 or 403 needs the user (pass the file\'s contents as lottie_file). Returns JSON described by the output schema.',
        inputSchema: z.object({
          url: z.string().optional().describe('URL of a Lottie JSON file, for example "https://example.com/hero.json". Use this or lottie_file.'),
          lottie_file: z.string().optional().describe('The Lottie JSON as a string, for example "{\\"v\\": \\"5.12.0\\", \\"fr\\": 60, \\"ip\\": 0, \\"op\\": 18, \\"w\\": 100, \\"h\\": 100, \\"layers\\": []}". Used instead of url when both are given.'),
        }),
        outputSchema: outputSchema('designesy_motion_score'),
      },
      async ({ url, lottie_file }) => {
        let lottieData: Record<string, unknown>;
        if (lottie_file) {
          let parsed: unknown;
          try {
            parsed = JSON.parse(lottie_file);
          } catch {
            return toolError({ what: 'Invalid JSON in lottie_file parameter', retryable: false, next: 'Pass the Lottie file as valid JSON text' });
          }
          if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
            return toolError({ what: 'Lottie file is not a JSON object', retryable: false, next: 'The file must be a JSON object' });
          }
          lottieData = parsed as Record<string, unknown>;
        } else if (url) {
          const file = await readJsonFile(url, 'lottie_file');
          if (!file.ok) return toolError(file.failure, { url });
          lottieData = file.data;
        } else {
          return toolError(
            { what: 'Either url or lottie_file is required', retryable: false, next: 'Pass the Lottie file\'s URL as url, or its JSON text as lottie_file' },
            { contract_id: motionContract.id, contract_version: motionContract.version },
          );
        }
        return structured(scoreLottie(lottieData, motionContract, url || '(inline lottie_file)'));
      },
    );

    // ── Tool 12: designesy_drift_score ──────────────────────────────────────────
    // Scores a live URL for AI-generated UI drift — 12 checks against compiled
    // CSS detecting the four drift failure modes.
    server.registerTool(
      'designesy_drift_score',
      {
        ...mcpToolDisplay('designesy_drift_score'),
        description: `Score a live page for AI-generated UI drift: twelve checks (d01-d12) on its CSS for the four drift failure modes: token fabrication (var() references, with no fallback, to custom properties declared nowhere), within-session drift (spacing, color and radius value variance), between-session amnesia (inconsistent font stacks, shadows and transitions), and silent breaking changes (z-index chaos, alias chains that end in an undeclared property). Use this when a site, especially an AI-built one, may be drifting off its own declared tokens. When not to use: for the full ${ENGINE_CHECK_COUNT}-check contract score, use designesy_score; for a token file's format, use designesy_tokens_score; for drift over time against earlier runs, use designesy_monitor_score. Behaviour: the engine at www.designesy.org reads the page, its <style> blocks, linked stylesheets and style attributes, and caches the result for about 24 hours per URL. No browser. ${pageEngineErrors('drift', 'scans')} ${RETURNS_SCHEMA}`,
        inputSchema: z.object({
          url: z.string().optional().describe(PAGE_URL('The page to scan for drift')),
        }),
        outputSchema: outputSchema('designesy_drift_score'),
      },
      async ({ url }) => {
        const targetUrl = url || `${BASE_URL}/`;
        const reply = await callEngine('drift', '/api/drift', { url: targetUrl }, {});
        if (!reply.ok) return toolError(reply.failure, { url: targetUrl });
        return structured(reply.data);
      },
    );

    // ── Tool 13: designesy_readiness_score ───────────────────────────────────────
    // Scores a URL for design-system AI readiness — probes for machine-readable
    // artifacts (tokens, llms.txt, agent.json, MCP, DESIGN.md, sitemap, robots).
    server.registerTool(
      'designesy_readiness_score',
      {
        ...mcpToolDisplay('designesy_readiness_score'),
        description: `Score a site for design-system AI readiness: ten probes (r01-r10) of its origin for machine-readable files: a DTCG token file, llms.txt, agent.json, an MCP endpoint answering tools/list, DESIGN.md, token $description, a component schema, sitemap.xml, robots.txt, and Open Graph and Twitter meta. Use this when you need to know whether AI tools can find and read a design system, rather than how the page is designed. When not to use: for the contract score of the page, use designesy_score; for drift in its tokens, use designesy_drift_score. Behaviour: the engine at www.designesy.org requests each path on the URL's origin and caches the result for about 24 hours per URL. No browser. ${pageEngineErrors('readiness', 'scans')} ${RETURNS_SCHEMA}`,
        inputSchema: z.object({
          url: z.string().optional().describe(PAGE_URL('A page on the site to probe')),
        }),
        outputSchema: outputSchema('designesy_readiness_score'),
      },
      async ({ url }) => {
        const targetUrl = url || `${BASE_URL}/`;
        const reply = await callEngine('readiness', '/api/readiness', { url: targetUrl }, {});
        if (!reply.ok) return toolError(reply.failure, { url: targetUrl });
        return structured(reply.data);
      },
    );

    // ── Tool 14: designesy_guardrails ───────────────────────────────────────────
    // Emits a frozen build-contract bundle (DTCG tokens, Stylelint config,
    // AGENTS.md rules, component contract, anti-patterns, DESIGN.md) from a live URL.
    // `parts` returns only the named bundle files (app/lib/mcp-trim.ts): the full
    // bundle measured about 10 KB to about 500 KB across ten sites, and a client
    // that caps tool output cut designesy.org's 90 KB off.
    server.registerTool(
      'designesy_guardrails',
      {
        ...mcpToolDisplay('designesy_guardrails'),
        description: `Generate a build-contract bundle for AI coding agents from a live page's :root custom properties: tokens (a DTCG token file), lintConfig (a Stylelint config), agentRules (AGENTS.md rules with a token allowlist), componentContract (allowed prop patterns), antiPatterns (fabricated tokens included) and designMd (a DESIGN.md: YAML front matter and a markdown body). Use this when a design system must become the files AI agents read and the lint that enforces them. When not to use: for a contract score, use designesy_score; for token-file validation, use designesy_tokens_score; for drift, use designesy_drift_score. Behaviour: the engine at www.designesy.org reads the page and its stylesheets and caches the result for about 24 hours per URL. No browser. The full bundle grows with the number of tokens a site declares: about 7 KB to about 530 KB of JSON on the 26 sites measured (about 110 KB for designesy.org). To trim it, pass parts, a list of bundle file names such as ["designMd"]: the result keeps score, grade, counts and checks, and its bundle holds only those files, in the order asked. Valid parts: ${GUARDRAILS_PARTS.join(', ')}. ${pageEngineErrors('guardrails', 'bundles')} ${RETURNS_SCHEMA}`,
        inputSchema: z.object({
          url: z.string().optional().describe(PAGE_URL('The page whose tokens to turn into the bundle')),
          parts: z.array(z.enum(GUARDRAILS_PARTS)).optional().describe('Optional: the bundle files to return, for example ["designMd"] or ["tokens", "lintConfig"]. Omit for the whole bundle.'),
        }),
        outputSchema: outputSchema('designesy_guardrails'),
      },
      async ({ url, parts }) => {
        // An empty list is refused before the engine runs (unknown names are
        // refused by the schema's enum).
        let names: string[] | null = null;
        if (parts !== undefined) {
          const picked = guardrailsPartNames(parts);
          if ('error' in picked) return partsError(picked.error, picked.unknown);
          names = picked.names;
        }
        const targetUrl = url || `${BASE_URL}/`;
        const reply = await callEngine('guardrails', '/api/guardrails', { url: targetUrl }, {});
        if (!reply.ok) return toolError(reply.failure, { url: targetUrl });
        return structured((names ? guardrailsParts(reply.data, names) : reply.data) as Record<string, unknown>);
      },
    );

    // ── Tool 15: designesy_monitor_score ───────────────────────────────────────
    // Continuous design-drift monitor — re-runs drift checks on a URL and
    // computes 10 governance checks (m01-m10) comparing the current run
    // against snapshot history supplied by the caller. /api/monitor sends an
    // email alert through Resend when drift is detected, an email is given and
    // a Resend key is configured. That email is a side effect outside this
    // server, so this is the one tool annotated readOnlyHint: false (see
    // MCP_TOOL_ANNOTATIONS). Nothing is scheduled: m01 ("Schedule registered")
    // passes on every run, and the caller keeps the history.
    server.registerTool(
      'designesy_monitor_score',
      {
        ...mcpToolDisplay('designesy_monitor_score'),
        description: `Score one monitoring run of a live page: the twelve drift checks (d01-d12) plus ten governance checks (m01-m10), most of them comparing this run with the snapshots passed in history: drift since the baseline, the 3-run trend, new and resolved violations, score degradation, token-set changes, the contract version, and whether an alert was delivered. Use this when a design system is watched over time: each call is one run, and the caller keeps the snapshots (pass each run's currentSnapshot back in history, oldest first). When not to use: for a single point-in-time drift check, use designesy_drift_score; for a contract score, use designesy_score. Behaviour: nothing is scheduled or stored by this tool. The engine at www.designesy.org reads the page and caches the result for about 24 hours per URL and history. Side effect: when email is given, an alert fires (it needs a non-empty history) and a Resend key is configured on www.designesy.org, an HTML alert email goes to that address; a repeat of the same alerts within an hour is suppressed only per server instance, so a repeated call can send another. ${pageEngineErrors('monitor', 'runs')} ${RETURNS_SCHEMA}`,
        inputSchema: z.object({
          url: z.string().optional().describe(PAGE_URL('The page to monitor')),
          email: z.string().optional().describe('Optional: an address for the alert email, for example "design-team@example.com". Mail is sent only when an alert fires and a Resend key is configured on www.designesy.org; without an address, alerts appear only in the result.'),
          history: z.array(z.object({
            timestamp: z.string(),
            score: z.number(),
            grade: z.string(),
            tokensExtracted: z.number(),
            checks: z.array(z.object({
              id: z.string(),
              item: z.string(),
              category: z.string(),
              status: z.enum(['PASS', 'FAIL', 'WARN']),
              detail: z.string(),
            })),
          })).optional().describe('Optional: earlier runs\' currentSnapshot objects, oldest first, for example [{"timestamp": "2026-10-01T09:00:00.000Z", "score": 92, "grade": "A", "tokensExtracted": 120, "checks": [...]}]. Omit for a first run, which sets the baseline.'),
        }),
        outputSchema: outputSchema('designesy_monitor_score'),
      },
      async ({ url, history, email }) => {
        const targetUrl = url || `${BASE_URL}/`;
        const reply = await callEngine('monitor', '/api/monitor', { url: targetUrl, history: history || [], ...(email ? { email } : {}) }, {});
        if (!reply.ok) return toolError(reply.failure, { url: targetUrl });
        return structured(reply.data);
      },
    );

    // ── Tool 16: designesy_compare ──────────────────────────────────────────────
    // The diff engine — fetches two URLs, extracts their :root token systems,
    // and produces a structured diff (added, removed, renamed, value-changed,
    // scale drift, contrast drift, structure delta, score delta).
    server.registerTool(
      'designesy_compare',
      {
        ...mcpToolDisplay('designesy_compare'),
        description: `Diff the design tokens of two live pages: reads both, extracts their :root custom properties, and reports tokens added (in A, not B), removed (in B, not A), likely renamed (name distance 2 or less), changed in value, scale size changes (spacing, radius, color), contrast change for shared color tokens, structure (counts and categories), and the score difference (designesy_score on both). Use this when you need to know what changed between two design systems, or how one differs from a reference. When not to use: for drift within one site, use designesy_drift_score; for one site over time, use designesy_monitor_score. Behaviour: the engine at www.designesy.org reads both pages and caches the result for about 24 hours per URL pair; the two URLs must differ. No browser. ${pageEngineErrors('compare', 'comparisons')} ${RETURNS_SCHEMA}`,
        inputSchema: z.object({
          urlA: z.string().describe('The first page, for example "https://example.com/" (the design system under review).'),
          urlB: z.string().describe('The second page, for example "https://www.designesy.org/" (a reference); it must differ from urlA.'),
        }),
        outputSchema: outputSchema('designesy_compare'),
      },
      async ({ urlA, urlB }) => {
        const reply = await callEngine('compare', '/api/compare', { urlA, urlB }, {});
        if (!reply.ok) return toolError(reply.failure, { urlA, urlB });
        return structured(reply.data);
      },
    );

    // ── Tool 17: designesy_report ───────────────────────────────────────────────
    // The synthesis capstone — fetch one URL, fire score + drift + readiness
    // in parallel, and produce a unified report with a composite grade.
    //
    // MCP Apps (SEP-1865, ext io.modelcontextprotocol/ui): declares a UI
    // resource at ui://designesy/report-app so Apps-capable hosts (Claude
    // Desktop, Cursor v2.6+, VS Code, Goose) render an interactive dashboard
    // inline instead of dumping JSON. The dashboard HTML is served by
    // /api/report/app?url=... — a self-contained HTML5 document that bundles
    // its own JS, calls back via postMessage for re-runs, and works as a
    // standalone browser URL for hosts that don't support Apps yet.
    //
    // The tool still returns the full JSON payload as text content so legacy
    // clients (no Apps support) get the same data they always did. Apps-aware
    // clients ignore the text and render the UI resource instead.
    //
    // It declares an outputSchema because a success is always one JSON object
    // with stable top-level keys (ok, url, the composite, the three engine
    // results, the totals, checks, synthesis and appUrl; detail "summary" keeps
    // the same keys with fewer rows). /api/report answers ok: false with HTTP
    // 502 (unreadable page, every engine failed), which is an error here.
    server.registerTool(
      'designesy_report',
      {
        ...mcpToolDisplay('designesy_report'),
        description: `Build one design-intelligence report for a live page: runs the score (${ENGINE_CHECK_COUNT}-check), drift (12-check) and readiness (10-check) engines and weights them into a composite: score x 0.5 + drift x 0.3 + readiness x 0.2. Use this when one holistic verdict is wanted instead of three separate calls, or to share a result. When not to use: for one engine's result alone, use designesy_score, designesy_drift_score or designesy_readiness_score. Behaviour: the engines at www.designesy.org each read the page, and the result is cached for about 24 hours per URL. The full result is large: about 75 to 100 KB of JSON on the ten sites measured, because it carries each engine's whole result beside the merged check list. detail "summary" keeps the composite, the totals, each engine's score, grade and counts, and only the checks and synthesis entries that did not PASS: about 4 to 31 KB on the same sites. Hosts that support MCP Apps (io.modelcontextprotocol/ui) show an interactive dashboard; appUrl opens it in a browser. ${pageEngineErrors('report', 'reports')} ${RETURNS_SCHEMA}`,
        inputSchema: z.object({
          url: z.string().describe('The page to report on, for example "https://example.com/".'),
          detail: z.enum(REPORT_DETAILS).optional().describe('Optional, for example "summary". "full" (the default) returns everything; "summary" returns the composite, the totals, each engine\'s score, grade and counts, and only the checks that did not PASS.'),
        }),
        outputSchema: outputSchema('designesy_report'),
        // MCP Apps (SEP-1865) — declare the UI resource. Apps-capable hosts
        // fetch ui://designesy/report-app (served by /api/report/app) and
        // render it inline. visibility:["model"] keeps the tool callable by
        // the agent; the app can also call it via postMessage.
        _meta: {
          ui: {
            resourceUri: 'ui://designesy/report-app',
            visibility: ['model', 'app'],
          },
        },
      },
      async ({ url, detail }) => {
        const reply = await callEngine('report', '/api/report', { url }, {});
        if (!reply.ok) return toolError(reply.failure, { url });
        // Attach the standalone app URL so non-Apps clients can still open
        // the interactive dashboard in a browser. Apps-aware hosts ignore
        // this — they render the ui:// resource inline.
        const payload = { ...reply.data, appUrl: `${BASE_URL}/api/report/app?url=${encodeURIComponent(url)}` };
        // detail "summary" (app/lib/mcp-trim.ts): the full report measured about
        // 75 to 100 KB across ten sites, and a client that caps tool output cut
        // designesy.org's 100 KB off.
        return structured((detail === 'summary' ? reportSummary(payload) : payload) as Record<string, unknown>);
      },
    );

    // ── UI Resource: ui://designesy/report-app (MCP Apps, SEP-1865) ────────────
    // Apps-capable hosts fetch this resource via resources/read when they
    // render the designesy_report tool's UI. The resource returns the same
    // self-contained HTML5 dashboard served by /api/report/app — we fetch
    // it internally so the host gets it over the MCP channel (no cross-
    // origin fetch from the host). The iframe then calls back via
    // postMessage to re-run reports on new URLs.
    server.registerResource(
      'report-app',
      'ui://designesy/report-app',
      {
        title: 'Designesy Report Dashboard',
        description: 'Interactive design-intelligence report dashboard: composite grade, sub-engine scores, and check-by-check breakdown with tabbed navigation. The synthesis capstone rendered inline.',
        mimeType: 'text/html;profile=mcp-app',
        // CSP for the sandboxed iframe. The dashboard bundles its own JS
        // inline (script-src 'self' 'unsafe-inline') and fetches only the
        // designesy.org /api/report endpoint (connect-src 'self'). No
        // external resources, no frames, no plugins.
        _meta: {
          ui: {
            csp: {
              connectDomains: ['https://www.designesy.org'],
              resourceDomains: ['https://www.designesy.org'],
              frameDomains: [],
              baseUriDomains: ['https://www.designesy.org'],
            },
          },
        },
      },
      async () => {
        // Build the dashboard HTML directly via the shared lib — no self-
        // fetch round-trip. The HTML is identical to what /api/report/app
        // serves. No url param here: the dashboard reads its initial URL
        // from the tool call result pushed by the host via postMessage.
        const html = buildReportAppHtml('', BASE_URL);
        return {
          contents: [
            {
              uri: 'ui://designesy/report-app',
              text: html,
              mimeType: 'text/html;profile=mcp-app',
            },
          ],
        };
      },
    );
  },
  {
    // Stateless 2026-07-28: server identity reported via server/discover.
    serverInfo: {
      name: 'designesy',
      version: MCP_SERVER_VERSION,
    },
    // The same text the PyPI server returns from initialize (one golden holds
    // both to it); at most 2,048 characters, which Claude Code shows in full.
    instructions: MCP_SERVER_INSTRUCTIONS,
    verboseLogs: true,
  },
);

// ── Protocol compatibility shim ───────────────────────────────────────────────
//
// The SDK's modern path (2026-07-28) strictly requires:
//   1. MCP-Protocol-Version header naming a modern revision (2026-07-28)
//   2. A _meta envelope with keys io.modelcontextprotocol/protocolVersion,
//      io.modelcontextprotocol/clientInfo, io.modelcontextprotocol/clientCapabilities
//
// Clients that send the modern header but don't form the envelope correctly
// (missing _meta, using bare key names like "protocolVersion" instead of the
// io.modelcontextprotocol/ prefixed names, or omitting clientCapabilities)
// get a hard 400 rejection from the modern path.
//
// This shim intercepts those requests BEFORE they reach the SDK handler and
// downgrades them to the legacy stateless path by stripping the modern header.
// The legacy path supports all protocol versions (2025-06-18 through
// 2026-07-28) and doesn't require the envelope — it uses the 2025-era
// initialize handshake instead.
//
// Requests with a properly-formed envelope pass through untouched.
// Requests with no MCP-Protocol-Version header pass through untouched
// (the SDK classifies them as legacy automatically).

const MODERN_PROTOCOL_VERSION = '2026-07-28';
const META_PROTOCOL_VERSION_KEY = 'io.modelcontextprotocol/protocolVersion';
const META_CLIENT_CAPABILITIES_KEY = 'io.modelcontextprotocol/clientCapabilities';
const META_CLIENT_INFO_KEY = 'io.modelcontextprotocol/clientInfo';

/**
 * Checks whether a JSON-RPC request body carries a valid modern-era _meta envelope.
 * Returns true only if _meta exists and contains all three required keys.
 */
function hasValidModernEnvelope(body: unknown): boolean {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) return false;
  const params = (body as { params?: unknown }).params;
  if (typeof params !== 'object' || params === null || Array.isArray(params)) return false;
  const meta = (params as Record<string, unknown>)._meta;
  if (typeof meta !== 'object' || meta === null || Array.isArray(meta)) return false;
  const m = meta as Record<string, unknown>;
  return (
    META_PROTOCOL_VERSION_KEY in m &&
    META_CLIENT_CAPABILITIES_KEY in m &&
    META_CLIENT_INFO_KEY in m
  );
}

/**
 * Pre-processes a POST request to downgrade modern-header-without-envelope
 * requests to the legacy path. Strips the MCP-Protocol-Version header so
 * the SDK classifies the request as legacy (no-claim) and routes it to the
 * stateless fallback, which supports all protocol versions.
 */
async function compatibilityShim(request: Request): Promise<Response> {
  const protocolVersionHeader = request.headers.get('mcp-protocol-version');

  // Only intercept POSTs with the modern protocol version header.
  // All other requests (GET, no header, old header) pass through untouched.
  if (
    request.method !== 'POST' ||
    !protocolVersionHeader ||
    protocolVersionHeader !== MODERN_PROTOCOL_VERSION
  ) {
    return handler(request);
  }

  // Read the body once. We must reconstruct a fresh Request afterward because
  // consuming the body via .text() disturbs the original Request — the SDK
  // can't read it again. We always build from request.url (not from `request`)
  // to avoid the "disturbed body" TypeError on Vercel's Node.js runtime.
  const bodyText = await request.text();
  const headers = new Headers(request.headers);

  let body: unknown;
  let parseFailed = false;
  try {
    body = bodyText.length > 0 ? JSON.parse(bodyText) : undefined;
  } catch {
    parseFailed = true;
    body = undefined;
  }

  // If the body has a valid modern envelope, pass through untouched.
  // Build a fresh Request with the original headers (including the modern
  // protocol version header) so the SDK's modern path handles it correctly.
  if (!parseFailed && hasValidModernEnvelope(body)) {
    const response = await handler(new Request(request.url, {
      method: 'POST',
      headers,
      body: bodyText,
    }));
    response.headers.set('X-MCP-Shim', 'passthrough-modern');
    return response;
  }

  // The request has the modern header but lacks a valid envelope (or JSON
  // was unparseable). Strip the MCP-Protocol-Version header so the SDK
  // classifies this as a legacy request (no-claim) and routes it to the
  // stateless fallback. The legacy path accepts all protocol versions and
  // doesn't require the envelope — it uses the 2025-era initialize handshake.
  headers.delete('mcp-protocol-version');

  const response = await handler(new Request(request.url, {
    method: 'POST',
    headers,
    body: bodyText,
  }));
  response.headers.set('X-MCP-Shim', 'downgraded-to-legacy');
  return response;
}

// Stateless protocol: GET (discover/stream) and POST (requests).
// No DELETE — there are no sessions to close.
// F7 usage counters (lib/usage.ts): count each tools/call by tool name. The body
// is read once here and handed on in a fresh Request, as the shim above does,
// because a consumed body cannot be read again on Vercel's Node.js runtime.
async function countedPost(request: Request): Promise<Response> {
  if (request.method !== 'POST') return compatibilityShim(request);
  const bodyText = await request.text();
  for (const name of toolCallNames(bodyText)) {
    after(() => recordUsage(`mcp:${name}`, request));
  }
  return compatibilityShim(new Request(request.url, {
    method: 'POST',
    headers: new Headers(request.headers),
    body: bodyText,
  }));
}

export { handler as GET, countedPost as POST };