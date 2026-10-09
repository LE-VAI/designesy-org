/**
 * MCP tool registry — the canonical list of tools this deployment serves at
 * /api/mcp.
 *
 * WHY THIS EXISTS
 * The readiness engine's r04 check asks one question: "does the target's MCP
 * endpoint answer tools/list with a tool list?" For a third-party target it
 * must make a network request. For THIS deployment it does not — but it was
 * making one anyway, POSTing to its own /api/mcp from inside the deployment,
 * which returns 400 while the byte-identical request from outside returns 200.
 *
 * Skipping that hop is correct, but only if the skip still ANSWERS THE QUESTION
 * rather than assuming the answer. Assuming PASS on the self-case would be the
 * same defect class as the bugs this lane keeps finding — a check reporting a
 * verdict about a sample it never examined. So the self-case reads this
 * registry: if the list is non-empty, the endpoint genuinely does serve tools.
 *
 * DRIFT IS THE RISK, AND IT IS GATED
 * Tool names are string literals in app/api/mcp/route.ts. A registry that
 * duplicated them by hand would go stale the first time a tool was added or
 * renamed, and r04 would then report a confident PASS for a list that no longer
 * matches what the endpoint serves. scripts/check-mcp-tool-parity.js asserts
 * this list matches the route's registerTool() calls exactly, in both
 * directions, and runs in the build. Adding a tool to the route without adding
 * it here fails the build, which is the intended behaviour.
 *
 * The same file carries each tool's title and annotation hints
 * (MCP_TOOL_ANNOTATIONS, below), which the route applies with mcpToolDisplay().
 */

export const MCP_TOOL_NAMES = [
  'designesy_catalog',
  'designesy_contract',
  'designesy_design_review',
  'designesy_skill_md',
  'designesy_agent_json',
  'designesy_llms_txt',
  'designesy_llms_full_txt',
  'designesy_score',
  'designesy_tokens_score',
  'designesy_a11y_score',
  'designesy_motion_score',
  'designesy_drift_score',
  'designesy_readiness_score',
  'designesy_guardrails',
  'designesy_monitor_score',
  'designesy_compare',
  'designesy_report',
] as const;

/**
 * Read-only accessor for the readiness engine's self-case. Returns a copy so a
 * consumer cannot mutate the canonical list.
 */
export function getMcpToolsForReadiness(): string[] {
  return [...MCP_TOOL_NAMES];
}

export type McpToolName = (typeof MCP_TOOL_NAMES)[number];

/**
 * A tool's display title and behaviour hints, as MCP 2025-06-18 defines them
 * (Tool.title and ToolAnnotations).
 *
 *   readOnlyHint     true: the tool does not modify its environment.
 *   destructiveHint  true: it may make destructive updates; false: additive
 *                    only. Meaningful only when readOnlyHint is false.
 *   idempotentHint   true: repeating a call with the same arguments has no
 *                    additional effect. Meaningful only when readOnlyHint is
 *                    false.
 *   openWorldHint    true: it may interact with external entities beyond this
 *                    server (here, any URL the caller supplies).
 *
 * All four are written out on every tool, even where the spec default would
 * give the same answer, so no hint is ever left to a default a client may not
 * share. Clients and directories show these to a person deciding whether to
 * let a tool run, so each value is read from the handler and the API route it
 * calls, never from the tool's description.
 */
export interface McpToolAnnotation {
  readonly title: string;
  readonly readOnlyHint: boolean;
  readonly destructiveHint: boolean;
  readonly idempotentHint: boolean;
  readonly openWorldHint: boolean;
}

/**
 * Titles and hints for every tool in MCP_TOOL_NAMES. `satisfies` makes the
 * compiler reject a missing or extra tool; scripts/check-mcp-tool-parity.js
 * also checks that each hint is an explicit literal, that the route applies the
 * right entry to each tool, and that packages/designesy-mcp (the PyPI stdio
 * server) serves the same titles and hints. Keep one entry per line: the
 * parity check reads this table line by line.
 *
 * Why each value holds:
 * - catalog, contract, design_review, skill_md, agent_json, llms_txt,
 *   llms_full_txt: GET a fixed designesy.org export. Closed world.
 * - a11y_score: GETs the a11y contract only. The url argument is written into
 *   the returned Playwright script and never fetched here. Closed world.
 * - score, drift_score, readiness_score, guardrails, compare, report: POST to
 *   this site's own engine routes, which fetch the caller's URL(s) and return a
 *   verdict. readiness also sends a JSON-RPC tools/list to the target's
 *   /api/mcp, which is a read. Open world.
 * - tokens_score, motion_score: fetch the caller's url when given (or parse the
 *   inline JSON). Open world.
 * - monitor_score: NOT read-only. /api/monitor sends a drift-alert email
 *   through Resend when the caller passes `email`, an alert fires (one needs a
 *   non-empty `history`), RESEND_API_KEY is set on the server, and the same
 *   (url, email, alert set) was not sent from that instance in the last hour.
 *   Sending mail is additive, so destructiveHint is false; the cooldown lives
 *   in one instance's memory, so a repeated call can send another email and
 *   idempotentHint is false.
 *
 * Every tools/call also increments this site's privacy-preserving usage
 * counters (lib/usage.ts). That is the operator's own telemetry and does not
 * change anything the caller can see, so it does not count against
 * readOnlyHint.
 */
export const MCP_TOOL_ANNOTATIONS = {
  designesy_catalog: { title: 'List Designesy packages', readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  designesy_contract: { title: 'Get design contract', readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  designesy_design_review: { title: 'Get design review rubric', readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  designesy_skill_md: { title: 'Get contract as SKILL.md', readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  designesy_agent_json: { title: 'Get agent discovery document', readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  designesy_llms_txt: { title: 'Get llms.txt brief', readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  designesy_llms_full_txt: { title: 'Get llms-full.txt brief', readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  designesy_score: { title: 'Score URL against contract', readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
  designesy_tokens_score: { title: 'Validate DTCG tokens', readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
  designesy_a11y_score: { title: 'Get WCAG audit kit', readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  designesy_motion_score: { title: 'Validate Lottie animation', readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
  designesy_drift_score: { title: 'Score UI drift', readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
  designesy_readiness_score: { title: 'Score AI readiness', readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
  designesy_guardrails: { title: 'Generate build-contract bundle', readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
  designesy_monitor_score: { title: 'Monitor drift with email alerts', readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
  designesy_compare: { title: 'Compare two design systems', readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
  designesy_report: { title: 'Build composite design report', readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
} as const satisfies Record<McpToolName, McpToolAnnotation>;

/**
 * The `title` and `annotations` fields for one tool's registerTool() config.
 *
 * The title goes in both places the spec reads it from: Tool.title (2025-06-18)
 * and annotations.title (2025-03-26, which clients on that revision still read).
 * Display precedence is title, then annotations.title, then name, so the two
 * must agree, and taking both from one entry keeps them equal.
 */
export function mcpToolDisplay(name: McpToolName): { title: string; annotations: McpToolAnnotation } {
  const entry = MCP_TOOL_ANNOTATIONS[name];
  return { title: entry.title, annotations: { ...entry } };
}
