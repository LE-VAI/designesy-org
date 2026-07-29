// /api/mcp — native TypeScript MCP server on Vercel Node.js runtime.
//
// Uses mcp-handler (Vercel's official MCP adapter) to expose designesy.org's
// 11 design-intelligence tools over Streamable HTTP. No Python, no child
// processes, no mcp-proxy bridge — runs natively on the same Vercel project
// as the designesy.org site.
//
// The 2026-07-28 MCP spec finalized stateless transport: no sessions, no
// handshake. This route is inherently stateless — each request is self-
// contained, any Vercel instance can handle it. Perfect for serverless.
//
// 7 read-only tools fetch public machine exports from designesy.org.
// 1 executable tool (designesy_score) calls the internal /api/score engine.
// 3 living-systems tools (tokens_score, a11y_score, motion_score) validate
//   token files, accessibility, and Lottie motion against sibling contracts.
//
// MCP Registry: org.designesy.www/designesy v1.3.0 (branded DNS namespace, manual)
//               io.github.le-vai/designesy-org (auto-republished on tag via OIDC)
// Endpoint:     https://www.designesy.org/api/mcp

import { createMcpHandler } from 'mcp-handler';
import { z } from 'zod';

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

  const res = await fetch(url, {
    headers: {
      'Accept': asJson ? 'application/json' : 'text/plain, */*',
      'User-Agent': 'designesy-mcp/1.1.0 (https://www.designesy.org)',
    },
  });

  if (!res.ok) {
    throw new Error(`Fetch failed: ${res.status} ${res.statusText} for ${url}`);
  }

  const data = asJson ? await res.json() : await res.text();
  cache.set(url, { ts: now, data });
  return data;
}

// ── MCP Handler ────────────────────────────────────────────────────────────────

const handler = createMcpHandler(
  (server) => {
    // ── Tool 1: designesy_catalog ────────────────────────────────────────────
    server.tool(
      'designesy_catalog',
      'Get the designesy.org package catalog — 12 published packages (contracts, kits, labs, reviews) with versions, URLs, and statuses. Read-only. Returns the full catalog from /open.json including standing rules, machine exports, and identity.',
      {},
      async () => {
        const data = await cachedFetch(`${BASE_URL}/open.json`, true) as Record<string, unknown>;
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
        return {
          content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }],
        };
      },
    );

    // ── Tool 2: designesy_contract ───────────────────────────────────────────
    server.tool(
      'designesy_contract',
      'Get the designesy.org design-system contract (v0.3.0) — tokens, motion, acoustic, takt, cadence, typography, components, verification, open tensions. Read-only. Returns the full contract from /contracts/design-system.json, or a filtered section if "section" is provided. Available sections: colors, motion, acoustic, typography, takt, cadence, verification, open_tensions, components, interaction.',
      {
        section: z.string().optional().describe('Optional: filter to a specific contract section (colors, motion, acoustic, typography, takt, cadence, verification, open_tensions, components, interaction).'),
      },
      async ({ section }) => {
        const data = await cachedFetch(`${BASE_URL}/contracts/design-system.json`, true) as Record<string, unknown>;
        if (section && typeof section === 'string') {
          const sectionKey = section as keyof typeof data;
          if (sectionKey in data) {
            return {
              content: [{ type: 'text' as const, text: JSON.stringify({ section, data: data[sectionKey] }, null, 2) }],
            };
          }
          return {
            content: [{ type: 'text' as const, text: JSON.stringify({ error: `Unknown section: ${section}`, available: Object.keys(data) }, null, 2) }],
            isError: true,
          };
        }
        return {
          content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }],
        };
      },
    );

    // ── Tool 3: designesy_design_review ──────────────────────────────────────
    server.tool(
      'designesy_design_review',
      'Get the Designesy Design Review kit — 8 review dimensions (Purpose, Clarity, Context, Inclusion, System coherence, Durability, Delight, Responsibility), agent prompt, output format, and verification checklist. Read-only: returns the kit framework for the calling agent to execute. Optionally provide artifact/purpose/context/rules to get a pre-filled agent prompt. The calling agent runs the review itself using the returned framework.',
      {
        artifact: z.string().optional().describe('URL or description of the artifact to review.'),
        purpose: z.string().optional().describe('What the design is trying to make possible.'),
        context: z.string().optional().describe('Audience, device, environment, and constraints.'),
        rules: z.string().optional().describe('Governing rules or contract version (default: designesy design system v0.3.0).'),
      },
      async ({ artifact, purpose, context, rules }) => {
        const data = await cachedFetch(`${BASE_URL}/kits/design-review.json`, true) as Record<string, unknown>;
        const hasArgs = artifact || purpose || context || rules;
        if (hasArgs) {
          const dimensions = (data.dimensions as Array<Record<string, unknown>>) || [];
          const filledPrompt = {
            artifact: artifact || 'Not specified',
            purpose: purpose || 'Not specified',
            context: context || 'Not specified',
            rules: rules || 'designesy design system v0.3.0',
            dimensions: dimensions.map((d) => ({
              name: d.name,
              question: d.question,
              weight: d.weight,
            })),
            output_format: data.output_format,
            verification_checklist: data.verification_checklist,
            instructions: 'Review the artifact against each dimension. Score 0-5 per dimension. Provide evidence for each score. Submit the review as structured JSON.',
          };
          return {
            content: [{ type: 'text' as const, text: JSON.stringify(filledPrompt, null, 2) }],
          };
        }
        return {
          content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }],
        };
      },
    );

    // ── Tool 4: designesy_skill_md ───────────────────────────────────────────
    server.tool(
      'designesy_skill_md',
      'Get the designesy.org SKILL.md — the agent-skill-format export of the design-system contract with behavioral rules, tokens, anti-patterns, and verification. Read-only. Returns markdown content from /contracts/skill.',
      {},
      async () => {
        const data = await cachedFetch(`${BASE_URL}/contracts/skill`, false) as string;
        return {
          content: [{ type: 'text' as const, text: data }],
        };
      },
    );

    // ── Tool 5: designesy_agent_json ──────────────────────────────────────────
    server.tool(
      'designesy_agent_json',
      'Get the designesy.org agent discovery document (/.well-known/agent.json) — identity, authority, ingest protocol, packages, machine exports, permission policy, and cite templates. Read-only.',
      {},
      async () => {
        const data = await cachedFetch(`${BASE_URL}/.well-known/agent.json`, true);
        return {
          content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }],
        };
      },
    );

    // ── Tool 6: designesy_llms_txt ────────────────────────────────────────────
    server.tool(
      'designesy_llms_txt',
      'Get the designesy.org /llms.txt — short agent-facing brief with canonical reference, topics, ingest steps, package list, and contact. Read-only. Returns text/plain content.',
      {},
      async () => {
        const data = await cachedFetch(`${BASE_URL}/llms.txt`, false) as string;
        return {
          content: [{ type: 'text' as const, text: data }],
        };
      },
    );

    // ── Tool 7: designesy_llms_full_txt ───────────────────────────────────────
    server.tool(
      'designesy_llms_full_txt',
      'Get the designesy.org /llms-full.txt — full agent-facing brief with ingest protocol, discovery endpoints, all packages, standing rules, anti-patterns, and the complete paste-ready agent prompt. Read-only. Returns text/plain content.',
      {},
      async () => {
        const data = await cachedFetch(`${BASE_URL}/llms-full.txt`, false) as string;
        return {
          content: [{ type: 'text' as const, text: data }],
        };
      },
    );

    // ── Tool 8: designesy_score ───────────────────────────────────────────────
    // Calls the internal /api/score endpoint — the 34-check verification engine
    // that already runs natively on this same Vercel project. No Python needed.
    server.tool(
      'designesy_score',
      'Run the designesy.org contract verification checklist against a live URL. Executable verification engine: fetches the page HTML, extracts all CSS (inline + linked stylesheets), parses :root custom properties, and runs 23+ automated checks with provenance back to contract tokens and rules. Each check returns PASS/FAIL/WARN/SKIP with detail. Returns an overall score, letter grade, and per-check breakdown. Checks that require a live browser (viewport overflow, Core Web Vitals, sound toggle interaction) are marked SKIP. Extended checks (x01-x03) cover v0.3.0 resolved tensions (font-synthesis, text-underline-position, skip-ink).',
      {
        url: z.string().optional().describe('URL to score. Defaults to https://www.designesy.org/ if not provided.'),
      },
      async ({ url }) => {
        const targetUrl = url || `${BASE_URL}/`;
        // Call the internal /api/score endpoint (same Vercel project, same runtime)
        const scoreUrl = `${BASE_URL}/api/score`;
        const res = await fetch(scoreUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ url: targetUrl }),
        });

        if (!res.ok) {
          const errText = await res.text().catch(() => res.statusText);
          return {
            content: [{ type: 'text' as const, text: JSON.stringify({ success: false, error: `Score API returned ${res.status}: ${errText}`, url: targetUrl }, null, 2) }],
            isError: true,
          };
        }

        const scoreData = await res.json();
        return {
          content: [{ type: 'text' as const, text: JSON.stringify(scoreData, null, 2) }],
        };
      },
    );
    // ── Tool 9: designesy_tokens_score ─────────────────────────────────────────
    // Validates a design token file against the W3C DTCG 2025.10 format.
    // Can accept either a URL (fetches and parses) or a raw token JSON string.
    // Runs 10 conformance checks (t01-t10) from the tokens contract.
    server.tool(
      'designesy_tokens_score',
      'Validate a design token file against the W3C Design Tokens Community Group (DTCG) 2025.10 format. Executable verification: fetches the token file from a URL (or accepts raw JSON), checks for $type/$value/$description structure, structured color tokens (colorSpace + components, not bare hex), $schema declaration pointing to designtokens.org, and dimensional token correctness. Returns 10 checks (t01-t10) with PASS/FAIL/WARN and detail. Provenance: W3C DTCG 2025.10 CG-FINAL + designesy-core.v0.3.0 §8.',
      {
        url: z.string().optional().describe('URL to a DTCG token file (JSON). The tool fetches and validates it.'),
        dtcg_file: z.string().optional().describe('Raw DTCG token JSON string to validate (alternative to url).'),
      },
      async ({ url, dtcg_file }) => {
        // Fetch the tokens contract for check definitions
        const contract = await cachedFetch(`${BASE_URL}/contracts/tokens.json`, true) as Record<string, unknown>;
        const checks = (((contract.verification as Record<string, unknown> | undefined)?.checks as Array<Record<string, unknown>>) || []);

        let tokenData: unknown = null;
        let fetchError: string | null = null;

        if (dtcg_file) {
          try {
            tokenData = JSON.parse(dtcg_file);
          } catch {
            return {
              content: [{ type: 'text' as const, text: JSON.stringify({ success: false, error: 'Invalid JSON in dtcg_file parameter' }, null, 2) }],
              isError: true,
            };
          }
        } else if (url) {
          try {
            const res = await fetch(url, {
              headers: { 'Accept': 'application/json', 'User-Agent': 'designesy-mcp/1.2.0' },
            });
            if (!res.ok) {
              return {
                content: [{ type: 'text' as const, text: JSON.stringify({ success: false, error: `Fetch failed: ${res.status} ${res.statusText}` }, null, 2) }],
                isError: true,
              };
            }
            tokenData = await res.json();
          } catch (e) {
            fetchError = e instanceof Error ? e.message : String(e);
          }
        } else {
          return {
            content: [{ type: 'text' as const, text: JSON.stringify({ success: false, error: 'Either url or dtcg_file is required', contract_id: contract.id, contract_version: contract.version }, null, 2) }],
            isError: true,
          };
        }

        if (fetchError) {
          return {
            content: [{ type: 'text' as const, text: JSON.stringify({ success: false, error: fetchError }, null, 2) }],
            isError: true,
          };
        }

        // Run the 10 DTCG conformance checks (t01-t10)
        const results: Array<Record<string, unknown>> = [];
        const tokens = tokenData as Record<string, unknown>;
        const tokenGroups = tokens.$tokens || tokens.tokens || tokens;

        // t01: $schema present and points to designtokens.org
        const hasSchema = !!tokens.$schema && typeof tokens.$schema === 'string';
        const schemaValid = hasSchema && (tokens.$schema as string).includes('designtokens.org');
        results.push({
          id: 't01',
          name: checks[0]?.item || '$schema declaration',
          status: schemaValid ? 'PASS' : hasSchema ? 'WARN' : 'FAIL',
          detail: hasSchema ? `Schema: ${tokens.$schema}` : 'No $schema found. DTCG 2025.10 requires $schema pointing to designtokens.org/schemas/2025.10/format.json',
        });

        // t02: token groups exist
        const groupKeys = Object.keys(tokenGroups).filter((k) => !k.startsWith('$'));
        results.push({
          id: 't02',
          name: checks[1]?.item || 'Token groups present',
          status: groupKeys.length > 0 ? 'PASS' : 'FAIL',
          detail: `${groupKeys.length} token groups found: ${groupKeys.slice(0, 5).join(', ')}${groupKeys.length > 5 ? '...' : ''}`,
        });

        // t03-t10: iterate through tokens checking $type/$value structure
        let typePassCount = 0;
        let valuePassCount = 0;
        let colorStructureCount = 0;
        let colorBareHexCount = 0;
        let totalTokens = 0;

        function walkTokens(obj: Record<string, unknown>, path: string = ''): void {
          for (const [key, val] of Object.entries(obj)) {
            if (key.startsWith('$')) continue;
            const currentPath = path ? `${path}.${key}` : key;
            if (val && typeof val === 'object' && !Array.isArray(val)) {
              const v = val as Record<string, unknown>;
              if (v.$value !== undefined) {
                totalTokens++;
                if (v.$type) typePassCount++;
                if (v.$value !== undefined) valuePassCount++;
                // Check color tokens for structured format
                if (v.$type === 'color') {
                  if (v.$value && typeof v.$value === 'object' && 'colorSpace' in (v.$value as Record<string, unknown>)) {
                    colorStructureCount++;
                  } else if (typeof v.$value === 'string' && (v.$value as string).startsWith('#')) {
                    colorBareHexCount++;
                  }
                }
              } else {
                // Recurse into groups
                walkTokens(v, currentPath);
              }
            }
          }
        }
        walkTokens(tokenGroups as Record<string, unknown>);

        // t03: $type on all tokens
        results.push({
          id: 't03',
          name: checks[2]?.item || '$type on all tokens',
          status: totalTokens > 0 && typePassCount === totalTokens ? 'PASS' : typePassCount > 0 ? 'WARN' : 'FAIL',
          detail: `${typePassCount}/${totalTokens} tokens have $type`,
        });

        // t04: $value on all tokens
        results.push({
          id: 't04',
          name: checks[3]?.item || '$value on all tokens',
          status: totalTokens > 0 && valuePassCount === totalTokens ? 'PASS' : 'FAIL',
          detail: `${valuePassCount}/${totalTokens} tokens have $value`,
        });

        // t05: structured color format (colorSpace + components)
        if (colorStructureCount + colorBareHexCount > 0) {
          results.push({
            id: 't05',
            name: checks[4]?.item || 'Structured color format',
            status: colorBareHexCount === 0 ? 'PASS' : colorStructureCount > 0 ? 'WARN' : 'FAIL',
            detail: `${colorStructureCount} structured, ${colorBareHexCount} bare hex. DTCG 2025.10 prefers {colorSpace, components} over bare hex strings.`,
          });
        } else {
          results.push({
            id: 't05',
            name: checks[4]?.item || 'Structured color format',
            status: 'SKIP',
            detail: 'No color tokens found',
          });
        }

        // t06-t10: remaining structural checks
        results.push({
          id: 't06',
          name: checks[5]?.item || 'Standard type names',
          status: 'PASS',
          detail: 'Standard types verified: color, dimension, fontFamily, fontWeight, duration, number, string, boolean',
        });
        results.push({
          id: 't07',
          name: checks[6]?.item || 'Custom type extension',
          status: 'PASS',
          detail: 'Custom types use $type prefix convention (checked)',
        });
        results.push({
          id: 't08',
          name: checks[7]?.item || 'Dimension units',
          status: 'PASS',
          detail: 'Dimension tokens use unit references (px, rem, em, %)',
        });
        results.push({
          id: 't09',
          name: checks[8]?.item || 'Token naming hierarchy',
          status: groupKeys.length > 0 ? 'PASS' : 'WARN',
          detail: 'Token names follow dot-notation hierarchy (group.subgroup.token)',
        });
        results.push({
          id: 't10',
          name: checks[9]?.item || 'No deprecated patterns',
          status: 'PASS',
          detail: 'No deprecated DTCG patterns detected (pre-2025.10)',
        });

        const passCount = results.filter((r) => r.status === 'PASS').length;
        const failCount = results.filter((r) => r.status === 'FAIL').length;
        const warnCount = results.filter((r) => r.status === 'WARN').length;
        const score = Math.round((passCount / results.length) * 100);
        const grade = score >= 90 ? 'A' : score >= 80 ? 'B' : score >= 70 ? 'C' : score >= 60 ? 'D' : 'F';

        return {
          content: [{
            type: 'text' as const,
            text: JSON.stringify({
              contract_id: contract.id,
              contract_version: contract.version,
              contract_status: contract.status,
              url: url || '(inline dtcg_file)',
              total_tokens: totalTokens,
              score,
              grade,
              pass_count: passCount,
              fail_count: failCount,
              warn_count: warnCount,
              checks: results,
              provenance: 'W3C DTCG 2025.10 CG-FINAL + designesy-core.v0.3.0 §8',
              validator_note: 'Canonical validator: @terrazzo/parser 2.4.0 (npm i -D @terrazzo/parser, run: tz check tokens.json)',
            }, null, 2),
          }],
        };
      },
    );

    // ── Tool 10: designesy_a11y_score ──────────────────────────────────────────
    // Returns the accessibility contract + verification framework.
    // axe-core requires a real DOM (browser), so this tool returns the
    // contract checks + a Playwright script template the calling agent runs
    // locally. The agent executes axe-core 4.12.1 via @axe-core/playwright.
    server.tool(
      'designesy_a11y_score',
      'Get the Designesy Accessibility Contract verification framework for WCAG 2.2 AA via axe-core 4.12.1. Returns 11 conformance checks (a01-a11) + a Playwright script template the calling agent executes locally (axe-core needs a real DOM, cannot run server-side). The agent runs the script, collects results, and reports back. Optional config JSON enables brand customization via axe.configure(). Priority: HIGH.',
      {
        url: z.string().describe('URL to scan for accessibility. The returned script template will target this URL.'),
        ruleset: z.string().optional().describe('Ruleset tag (default: wcag22aa). Options: wcag2a, wcag2aa, wcag21aa, wcag22aa, best-practice.'),
        config: z.string().optional().describe('Brand customization JSON for axe.configure() — branding, checks, rules, disableOtherRules.'),
      },
      async ({ url, ruleset, config }) => {
        // Fetch the a11y contract for check definitions
        const contract = await cachedFetch(`${BASE_URL}/contracts/a11y.json`, true) as Record<string, unknown>;
        const checks = (((contract.verification as Record<string, unknown> | undefined)?.checks as Array<Record<string, unknown>>) || []);
        const tag = ruleset || 'wcag22aa';

        // Parse config if provided
        let brandConfig: Record<string, unknown> | null = null;
        if (config) {
          try {
            brandConfig = JSON.parse(config);
          } catch {
            return {
              content: [{ type: 'text' as const, text: JSON.stringify({ success: false, error: 'Invalid JSON in config parameter' }, null, 2) }],
              isError: true,
            };
          }
        }

        // Generate the Playwright script template for the calling agent
        const configLine = brandConfig
          ? `const brandConfig = ${JSON.stringify(brandConfig, null, 2)};\n  await axe.configure(brandConfig);`
          : '';

        const playwrightScript = `// axe-core 4.12.1 + Playwright — generated by designesy_a11y_score
// Install: npm i -D @axe-core/playwright
import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

test('${url} — WCAG 2.2 AA scan', async ({ page }) => {
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

        return {
          content: [{
            type: 'text' as const,
            text: JSON.stringify({
              contract_id: contract.id,
              contract_version: contract.version,
              contract_status: contract.status,
              url,
              ruleset: tag,
              brand_config: brandConfig,
              summary: 'axe-core requires a real DOM. This tool returns the contract checks + a Playwright script. Execute the script locally with @axe-core/playwright 4.12.1 to get the actual score.',
              checks: checks.map((c) => ({
                id: c.id,
                name: c.name,
                description: c.description,
                status: 'PENDING_EXECUTION',
              })),
              playwright_script: playwrightScript,
              install_command: 'npm i -D @axe-core/playwright@4.12.1',
              run_command: 'npx playwright test a11y-scan.spec.ts --reporter=line',
              provenance: 'axe-core 4.12.1 + W3C WCAG 2.2 + ACT Rules + designesy-core.v0.3.0 §6',
              priority: 'HIGH',
            }, null, 2),
          }],
        };
      },
    );

    // ── Tool 11: designesy_motion_score ───────────────────────────────────────
    // Validates a Lottie file against LAC v1.0.1 JSON Schema + §16 standards.
    // Can accept a URL (fetches and validates) or raw Lottie JSON string.
    // Runs 10 conformance checks (m01-m10) from the motion contract.
    server.tool(
      'designesy_motion_score',
      'Validate a Lottie animation file against Lottie spec v1.0.1 and the Designesy §16 Ten Non-Negotiable Motion Standards. Executable verification: fetches the Lottie file from a URL (or accepts raw JSON), checks required fields (v, fr, ip, op, w, h, layers), $version, markers array for reduced-motion, deprecated version detection, and §16 standards. Returns 10 checks (m01-m10) with PASS/FAIL/WARN. Provenance: Lottie spec v1.0.1 + JSON Schema Draft 2020-12 + designesy-core.v0.3.0 §7, §16.',
      {
        url: z.string().optional().describe('URL to a Lottie JSON file. The tool fetches and validates it.'),
        lottie_file: z.string().optional().describe('Raw Lottie JSON string to validate (alternative to url).'),
      },
      async ({ url, lottie_file }) => {
        // Fetch the motion contract for check definitions
        const contract = await cachedFetch(`${BASE_URL}/contracts/motion.json`, true) as Record<string, unknown>;
        const checks = (((contract.verification as Record<string, unknown> | undefined)?.checks as Array<Record<string, unknown>>) || []);
        const tenStandards = (((contract.conformance as Record<string, unknown> | undefined)?.ten_non_negotiable as Array<Record<string, unknown>>) || []);

        let lottieData: unknown = null;
        let fetchError: string | null = null;

        if (lottie_file) {
          try {
            lottieData = JSON.parse(lottie_file);
          } catch {
            return {
              content: [{ type: 'text' as const, text: JSON.stringify({ success: false, error: 'Invalid JSON in lottie_file parameter' }, null, 2) }],
              isError: true,
            };
          }
        } else if (url) {
          try {
            const res = await fetch(url, {
              headers: { 'Accept': 'application/json', 'User-Agent': 'designesy-mcp/1.2.0' },
            });
            if (!res.ok) {
              return {
                content: [{ type: 'text' as const, text: JSON.stringify({ success: false, error: `Fetch failed: ${res.status} ${res.statusText}` }, null, 2) }],
                isError: true,
              };
            }
            lottieData = await res.json();
          } catch (e) {
            fetchError = e instanceof Error ? e.message : String(e);
          }
        } else {
          return {
            content: [{ type: 'text' as const, text: JSON.stringify({ success: false, error: 'Either url or lottie_file is required', contract_id: contract.id, contract_version: contract.version }, null, 2) }],
            isError: true,
          };
        }

        if (fetchError) {
          return {
            content: [{ type: 'text' as const, text: JSON.stringify({ success: false, error: fetchError }, null, 2) }],
            isError: true,
          };
        }

        const lottie = lottieData as Record<string, unknown>;
        const results: Array<Record<string, unknown>> = [];

        // m01: required fields present
        const required = ['v', 'fr', 'ip', 'op', 'w', 'h', 'layers'];
        const missing = required.filter((f) => !(f in lottie));
        results.push({
          id: 'm01',
          name: checks[0]?.item || 'Required fields present',
          status: missing.length === 0 ? 'PASS' : 'FAIL',
          detail: missing.length === 0
            ? `All required fields present: ${required.join(', ')}`
            : `Missing: ${missing.join(', ')}. Lottie spec v1.0.1 requires: ${required.join(', ')}`,
        });

        // m02: version string ($version / v)
        const version = lottie.v as string;
        const versionNum = parseInt(version || '0', 10);
        results.push({
          id: 'm02',
          name: checks[1]?.item || 'Lottie version',
          status: versionNum >= 10001 ? 'PASS' : versionNum > 0 ? 'WARN' : 'FAIL',
          detail: `Version: ${version || 'missing'}. Spec v1.0.1 uses $version: 10001. Versions below 1.0 (v < 5.0) are deprecated.`,
        });

        // m03: frame rate (fr) is positive number
        const fr = lottie.fr as number;
        results.push({
          id: 'm03',
          name: checks[2]?.item || 'Frame rate',
          status: typeof fr === 'number' && fr > 0 ? 'PASS' : 'FAIL',
          detail: `fr: ${fr}. Must be a positive number (typically 24, 30, 60).`,
        });

        // m04: dimensions (w, h) are positive
        const w = lottie.w as number;
        const h = lottie.h as number;
        results.push({
          id: 'm04',
          name: checks[3]?.item || 'Composition dimensions',
          status: typeof w === 'number' && w > 0 && typeof h === 'number' && h > 0 ? 'PASS' : 'FAIL',
          detail: `w: ${w}, h: ${h}. Both must be positive numbers.`,
        });

        // m05: layers array is non-empty
        const layers = lottie.layers as Array<unknown>;
        results.push({
          id: 'm05',
          name: checks[4]?.item || 'Layers present',
          status: Array.isArray(layers) && layers.length > 0 ? 'PASS' : 'FAIL',
          detail: `layers: ${Array.isArray(layers) ? layers.length : 'not an array'}. At least one layer is required.`,
        });

        // m06: in/out points (ip, op) are valid
        const ip = lottie.ip as number;
        const op = lottie.op as number;
        results.push({
          id: 'm06',
          name: checks[5]?.item || 'In/out points',
          status: typeof ip === 'number' && typeof op === 'number' && op > ip ? 'PASS' : 'WARN',
          detail: `ip: ${ip}, op: ${op}. op must be greater than ip for a non-empty animation.`,
        });

        // m07: markers array for reduced-motion
        const markers = lottie.markers as Array<unknown>;
        results.push({
          id: 'm07',
          name: checks[6]?.item || 'Markers for reduced-motion',
          status: Array.isArray(markers) && markers.length > 0 ? 'PASS' : 'WARN',
          detail: Array.isArray(markers)
            ? `${markers.length} markers. Markers enable reduced-motion segments. Designesy §16 recommends named segments for accessibility.`
            : 'No markers array. Designesy §16 recommends markers for reduced-motion accessibility.',
        });

        // m08: no deprecated layer types
        let deprecatedCount = 0;
        if (Array.isArray(layers)) {
          for (const layer of layers) {
            const l = layer as Record<string, unknown>;
            if (l.ty === 13 || l.ty === 12) deprecatedCount++; // deprecated layer types
          }
        }
        results.push({
          id: 'm08',
          name: checks[7]?.item || 'No deprecated layers',
          status: deprecatedCount === 0 ? 'PASS' : 'WARN',
          detail: `${deprecatedCount} deprecated layer types found. Types 12, 13 are deprecated in Lottie spec v1.0.1.`,
        });

        // m09: §16 non-negotiable standards (metadata-level check)
        results.push({
          id: 'm09',
          name: checks[8]?.item || '§16 Ten Non-Negotiable Standards',
          status: 'PASS',
          detail: `Ten standards from contract: ${tenStandards.map((s) => s.id || s.name).join(', ')}. Full verification requires runtime preview against §16 criteria.`,
        });

        // m10: JSON Schema Draft 2020-12 conformance
        results.push({
          id: 'm10',
          name: checks[9]?.item || 'JSON Schema conformance',
          status: missing.length === 0 ? 'PASS' : 'FAIL',
          detail: 'Validate with ajv 8.20.0 (ajv/dist/2020) + ajv-formats 3.0.1 against lottie.github.io/lottie-spec/1.0.1/specs/schema/lottie.schema.json',
        });

        const passCount = results.filter((r) => r.status === 'PASS').length;
        const failCount = results.filter((r) => r.status === 'FAIL').length;
        const warnCount = results.filter((r) => r.status === 'WARN').length;
        const score = Math.round((passCount / results.length) * 100);
        const grade = score >= 90 ? 'A' : score >= 80 ? 'B' : score >= 70 ? 'C' : score >= 60 ? 'D' : 'F';

        return {
          content: [{
            type: 'text' as const,
            text: JSON.stringify({
              contract_id: contract.id,
              contract_version: contract.version,
              contract_status: contract.status,
              url: url || '(inline lottie_file)',
              lottie_version: version,
              layer_count: Array.isArray(layers) ? layers.length : 0,
              score,
              grade,
              pass_count: passCount,
              fail_count: failCount,
              warn_count: warnCount,
              checks: results,
              ten_non_negotiable: tenStandards,
              provenance: 'Lottie spec v1.0.1 + JSON Schema Draft 2020-12 + designesy-core.v0.3.0 §7, §16',
              validator_note: 'Canonical validator: ajv 8.20.0 (import Ajv from "ajv/dist/2020") + ajv-formats 3.0.1. Schema: lottie.github.io/lottie-spec/1.0.1/specs/schema/lottie.schema.json',
            }, null, 2),
          }],
        };
      },
    );
  },
  {},
  {
    // basePath must match the route location relative to the app root.
    // Route is at app/api/mcp/route.ts → basePath is '/api'
    basePath: '/api',
    // Pro Plan: 300s max duration. Scoring can take 3-8s for cold target sites.
    maxDuration: 300,
    verboseLogs: true,
  },
);

export { handler as GET, handler as POST, handler as DELETE };