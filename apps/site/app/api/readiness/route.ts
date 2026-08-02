// /api/readiness — Designesy AI Readiness Score
//
// Scores a URL for design-system AI readiness by probing for machine-readable
// artifacts: token files, llms.txt, agent.json, MCP endpoint, DESIGN.md,
// sitemap, robots.txt, and social meta tags.
//
// All 10 checks are HTTP probes — no browser needed.
//
// Contract: /contracts/readiness.json (designesy.readiness v0.1.0)

import { NextResponse } from 'next/server';
import { unstable_cache } from 'next/cache';
import { normalizeInputUrl, isValidUrl, safeFetch } from '../../lib/url-guard';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

// ── URL utilities (shared hardened guard — see app/lib/url-guard.ts) ──────────
// Imported above. Closes IPv6 loopback/link-local/ULA, cloud metadata
// (169.254.169.254), full 172.16.0.0/12, and encoded-IP bypass paths.

// ── Rate limiting ─────────────────────────────────────────────────────────────

const RATE_LIMIT = 50;
const RATE_WINDOW = 60 * 60 * 1000;
const hits = new Map<string, number[]>();

function rateLimited(ip: string): boolean {
  const now = Date.now();
  const arr = hits.get(ip) || [];
  const recent = arr.filter((t) => now - t < RATE_WINDOW);
  if (recent.length >= RATE_LIMIT) return true;
  recent.push(now);
  hits.set(ip, recent);
  return false;
}

// ── HTTP probing helpers ──────────────────────────────────────────────────────

async function probeUrl(url: string, method: 'HEAD' | 'GET' = 'HEAD'): Promise<{ ok: boolean; status: number; body?: string }> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);
  try {
    const resp = await safeFetch(url, {
      method,
      headers: {
        'User-Agent': 'designesy-readiness/1.0 (https://www.designesy.org)',
        'Accept': '*/*',
      },
      signal: controller.signal,
    });
    const body = method === 'GET' ? await resp.text() : undefined;
    return { ok: resp.ok, status: resp.status, body };
  } catch {
    return { ok: false, status: 0 };
  } finally {
    clearTimeout(timeout);
  }
}

async function probePaths(origin: string, paths: string[]): Promise<{ found: boolean; url?: string; status: number; body?: string }> {
  for (const path of paths) {
    const url = new URL(path, origin).href;
    const result = await probeUrl(url, 'GET');
    if (result.ok && result.body && result.body.length > 10) {
      return { found: true, url, status: result.status, body: result.body };
    }
  }
  return { found: false, status: 0 };
}

// ── CheckResult type ─────────────────────────────────────────────────────────

type CheckResult = {
  id: string;
  item: string;
  category: string;
  status: 'PASS' | 'FAIL' | 'WARN';
  detail: string;
};

// ── The 10 readiness checks ───────────────────────────────────────────────────

async function checkR01TokenFile(origin: string): Promise<CheckResult> {
  const result = await probePaths(origin, ['/tokens.json', '/design-tokens.json', '/contracts/tokens.json', '/export/tokens.json']);
  if (!result.found) {
    return { id: 'r01', item: 'Machine-readable token file exposed', category: 'tokens', status: 'FAIL', detail: 'No machine-readable token file detected at common paths' };
  }
  // Check if it's DTCG format
  const isDtcg = result.body?.includes('$type') || result.body?.includes('$value');
  if (isDtcg) {
    return { id: 'r01', item: 'Machine-readable token file exposed', category: 'tokens', status: 'PASS', detail: `Token file found at ${result.url} (DTCG format)` };
  }
  return { id: 'r01', item: 'Machine-readable token file exposed', category: 'tokens', status: 'WARN', detail: `Token file found at ${result.url} but not in DTCG format` };
}

async function checkR02LlmsTxt(origin: string): Promise<CheckResult> {
  const result = await probePaths(origin, ['/llms.txt', '/.well-known/llms.txt']);
  if (!result.found) {
    return { id: 'r02', item: 'llms.txt present', category: 'discovery', status: 'FAIL', detail: 'No /llms.txt found — agents have no orientation brief' };
  }
  return { id: 'r02', item: 'llms.txt present', category: 'discovery', status: 'PASS', detail: `/llms.txt returns ${result.body?.length || 0} bytes of agent-facing brief` };
}

async function checkR03AgentJson(origin: string): Promise<CheckResult> {
  const result = await probePaths(origin, ['/.well-known/agent.json', '/agent.json']);
  if (!result.found) {
    return { id: 'r03', item: 'agent.json present', category: 'discovery', status: 'FAIL', detail: 'No /.well-known/agent.json — agents have no discovery endpoint' };
  }
  const hasIdentity = result.body?.includes('identity') || result.body?.includes('authority');
  if (hasIdentity) {
    return { id: 'r03', item: 'agent.json present', category: 'discovery', status: 'PASS', detail: `/.well-known/agent.json returns discovery document with identity/authority fields` };
  }
  return { id: 'r03', item: 'agent.json present', category: 'discovery', status: 'WARN', detail: `agent.json found but missing standard fields (identity, authority)` };
}

async function checkR04McpEndpoint(origin: string): Promise<CheckResult> {
  const mcpUrl = new URL('/api/mcp', origin).href;
  try {
    const resp = await safeFetch(mcpUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list' }),
      signal: AbortSignal.timeout(8000),
    });
    if (resp.ok) {
      const data = await resp.text();
      if (data.includes('tools') || data.includes('result')) {
        return { id: 'r04', item: 'MCP endpoint responds to tools/list', category: 'mcp', status: 'PASS', detail: `MCP endpoint at /api/mcp responds to tools/list` };
      }
    }
    return { id: 'r04', item: 'MCP endpoint responds to tools/list', category: 'mcp', status: 'WARN', detail: 'Endpoint exists but did not respond with a tool list' };
  } catch {
    return { id: 'r04', item: 'MCP endpoint responds to tools/list', category: 'mcp', status: 'FAIL', detail: 'No MCP endpoint detected at /api/mcp' };
  }
}

async function checkR05DesignMd(origin: string): Promise<CheckResult> {
  const result = await probePaths(origin, ['/DESIGN.md', '/design.md']);
  if (!result.found) {
    return { id: 'r05', item: 'DESIGN.md present (Google design.md standard)', category: 'discovery', status: 'FAIL', detail: 'No /DESIGN.md — missing the machine-readable design brief' };
  }
  return { id: 'r05', item: 'DESIGN.md present (Google design.md standard)', category: 'discovery', status: 'PASS', detail: `/DESIGN.md found (${result.body?.length || 0} bytes)` };
}

async function checkR06TokenDescription(origin: string): Promise<CheckResult> {
  // This is checked alongside r01 — if tokens were found, check for $description
  const tokenResult = await probePaths(origin, ['/tokens.json', '/design-tokens.json', '/contracts/tokens.json', '/export/tokens.json']);
  if (!tokenResult.found || !tokenResult.body) {
    return { id: 'r06', item: 'Token documentation — tokens carry $description', category: 'tokens', status: 'FAIL', detail: 'No token file found to check for $description' };
  }
  const hasDescription = tokenResult.body.includes('$description');
  if (hasDescription) {
    return { id: 'r06', item: 'Token documentation — tokens carry $description', category: 'tokens', status: 'PASS', detail: 'Tokens found with $description metadata' };
  }
  return { id: 'r06', item: 'Token documentation — tokens carry $description', category: 'tokens', status: 'WARN', detail: 'Tokens found but no $description — agents lack context' };
}

async function checkR07ComponentContract(origin: string): Promise<CheckResult> {
  const result = await probePaths(origin, ['/components.json', '/contracts/components.json', '/component-schema.json']);
  if (!result.found) {
    // Fallback: check if /open.json or /agent.json mentions components
    const openResult = await probePaths(origin, ['/open.json', '/.well-known/agent.json']);
    const mentionsComponents = openResult.body?.includes('component');
    if (mentionsComponents) {
      return { id: 'r07', item: 'Component contract (machine-readable schema)', category: 'components', status: 'WARN', detail: 'Component documentation found but not machine-readable' };
    }
    return { id: 'r07', item: 'Component contract (machine-readable schema)', category: 'components', status: 'FAIL', detail: 'No machine-readable component contract' };
  }
  return { id: 'r07', item: 'Component contract (machine-readable schema)', category: 'components', status: 'PASS', detail: `Machine-readable component schema detected at ${result.url}` };
}

async function checkR08Sitemap(origin: string): Promise<CheckResult> {
  const result = await probeUrl(new URL('/sitemap.xml', origin).href, 'GET');
  if (result.ok && result.body && result.body.includes('<urlset')) {
    return { id: 'r08', item: 'Sitemap.xml present', category: 'crawlability', status: 'PASS', detail: '/sitemap.xml found — site is crawlable' };
  }
  return { id: 'r08', item: 'Sitemap.xml present', category: 'crawlability', status: 'FAIL', detail: 'No /sitemap.xml — agents cannot discover pages' };
}

async function checkR09RobotsTxt(origin: string): Promise<CheckResult> {
  const result = await probeUrl(new URL('/robots.txt', origin).href, 'GET');
  if (!result.ok || !result.body) {
    return { id: 'r09', item: 'robots.txt permissive for agents', category: 'crawlability', status: 'FAIL', detail: 'No /robots.txt — crawling rules undefined' };
  }
  const disallowAll = /User-agent:\s*\*\s*\n\s*Disallow:\s*\//i.test(result.body);
  if (disallowAll) {
    return { id: 'r09', item: 'robots.txt permissive for agents', category: 'crawlability', status: 'WARN', detail: 'robots.txt found but restricts all agents' };
  }
  return { id: 'r09', item: 'robots.txt permissive for agents', category: 'crawlability', status: 'PASS', detail: '/robots.txt found and allows agent crawling' };
}

async function checkR10OpenGraph(html: string): Promise<CheckResult> {
  const hasOg = /<meta\s+property=["']og:/i.test(html);
  const hasTwitter = /<meta\s+name=["']twitter:/i.test(html);
  if (hasOg && hasTwitter) {
    return { id: 'r10', item: 'Open Graph + Twitter card meta tags', category: 'social', status: 'PASS', detail: 'OG and Twitter card meta tags present' };
  }
  if (hasOg || hasTwitter) {
    return { id: 'r10', item: 'Open Graph + Twitter card meta tags', category: 'social', status: 'WARN', detail: 'Partial social meta (OG or Twitter, not both)' };
  }
  return { id: 'r10', item: 'Open Graph + Twitter card meta tags', category: 'social', status: 'FAIL', detail: 'No social meta tags — missing share context' };
}

// ── Score computation ────────────────────────────────────────────────────────

function computeGrade(score: number): string {
  if (score >= 90) return 'A';
  if (score >= 80) return 'B';
  if (score >= 70) return 'C';
  if (score >= 60) return 'D';
  return 'F';
}

async function scoreReadinessUncached(targetUrl: string) {
  const origin = new URL(targetUrl).origin;

  // Fetch the homepage HTML for r10 (meta tags)
  const homeResult = await probeUrl(targetUrl, 'GET');
  const html = homeResult.body || '';

  if (!html && homeResult.status === 0) {
    return {
      ok: false,
      error: 'Could not fetch the target URL. Check that the URL is correct and the site is publicly accessible.',
    };
  }

  const checks: CheckResult[] = await Promise.all([
    checkR01TokenFile(origin),
    checkR02LlmsTxt(origin),
    checkR03AgentJson(origin),
    checkR04McpEndpoint(origin),
    checkR05DesignMd(origin),
    checkR06TokenDescription(origin),
    checkR07ComponentContract(origin),
    checkR08Sitemap(origin),
    checkR09RobotsTxt(origin),
    checkR10OpenGraph(html),
  ]);

  const pass = checks.filter((c) => c.status === 'PASS').length;
  const warn = checks.filter((c) => c.status === 'WARN').length;
  const fail = checks.filter((c) => c.status === 'FAIL').length;
  const points = pass + warn * 0.5;
  const score = Math.round((points / checks.length) * 100);
  const grade = computeGrade(score);

  return {
    ok: true,
    url: targetUrl,
    score,
    grade,
    pass,
    warn,
    fail,
    total: checks.length,
    checks,
  };
}

// ── Cached wrapper ───────────────────────────────────────────────────────────

const READINESS_TTL = 60 * 60 * 24; // 24h

const scoreReadiness = unstable_cache(scoreReadinessUncached, ['designesy-readiness'], {
  revalidate: READINESS_TTL,
  tags: ['readiness'],
});

// ── POST handler ─────────────────────────────────────────────────────────────

export async function POST(request: Request) {
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
  if (rateLimited(ip)) {
    return NextResponse.json(
      { ok: false, error: 'Rate limit exceeded. Maximum 50 readiness scans per hour.' },
      { status: 429, headers: { 'Cache-Control': 'no-store' } },
    );
  }

  let body: { url?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { ok: false, error: 'Invalid JSON body.' },
      { status: 400, headers: { 'Cache-Control': 'no-store' } },
    );
  }

  const targetUrl = normalizeInputUrl(body.url || '');
  if (!isValidUrl(targetUrl)) {
    return NextResponse.json(
      { ok: false, error: 'Invalid URL. Provide a public http(s) URL.' },
      { status: 400, headers: { 'Cache-Control': 'no-store' } },
    );
  }

  const result = await scoreReadiness(targetUrl);

  return NextResponse.json(result, {
    status: result.ok ? 200 : 502,
    headers: { 'Cache-Control': 'no-store' },
  });
}