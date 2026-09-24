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
