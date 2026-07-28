// /api/mcp — native TypeScript MCP server on Vercel Node.js runtime.
//
// Uses mcp-handler (Vercel's official MCP adapter) to expose designesy.org's
// 8 design-intelligence tools over Streamable HTTP. No Python, no child
// processes, no mcp-proxy bridge — runs natively on the same Vercel project
// as the designesy.org site.
//
// The 2026-07-28 MCP spec finalized stateless transport: no sessions, no
// handshake. This route is inherently stateless — each request is self-
// contained, any Vercel instance can handle it. Perfect for serverless.
//
// 7 read-only tools fetch public machine exports from designesy.org.
// 1 executable tool (designesy_score) calls the internal /api/score engine.
//
// MCP Registry: org.designesy.www/designesy v1.1.0
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