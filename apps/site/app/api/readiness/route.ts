// /api/readiness — Designesy AI Readiness Score
//
// Scores a URL for design-system AI readiness by probing for machine-readable
// artifacts: token files, llms.txt, agent.json, MCP endpoint, DESIGN.md,
// sitemap, robots.txt, and social meta tags.
//
// All 10 checks are HTTP probes — no browser needed.
//
// Contract: /contracts/readiness.json (designesy.readiness; the version is lib/readiness-contract's)

import { NextResponse } from 'next/server';
import { unstable_cache } from 'next/cache';
import { normalizeInputUrl, isValidUrl, safeFetch, textWithin } from '../../lib/url-guard';
import { clientKey } from '../../lib/rate-limit';

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

const MiB = 1024 * 1024;

// Each GET probe, and r04's read of the MCP endpoint, holds at most this many
// body bytes, given to url-guard as maxBodyBytes and counted after decoding
// when url-guard decodes the body (a compressed 2xx body). A body longer than
// the limit is not read: its check reports WARN and says the file was not
// read, never "not found" for a file that answered ok, and a partial body is
// never read as if it were whole.
//
// 4 MiB. The largest token files measured are 1,674,878 bytes
// (@primer/primitives 11.10.0, dist/styleLint/functional/themes/light.json)
// and 1,039,520 bytes (@adobe/spectrum-tokens 15.6.0,
// dist/json/variables.json). The largest of the seven documents the MCP
// route reads from this site measured 100,907 bytes
// (/contracts/design-system.json, as its route wrote it on 2026-10-24). This
// site's home page, which a scan of it reads, measured 392,061 bytes, and
// its /changelog page 460,417 bytes, each served with no content coding on
// 2026-10-25.
const READ_LIMIT = 4 * 1024 * 1024;

/** The detail of a check whose file answered with a body longer than READ_LIMIT. */
function notRead(what: string): string {
  return `${what} is larger than the ${READ_LIMIT / MiB} MiB read limit and was not read`;
}

/**
 * What a probe found. `tooLarge`: a GET whose body is longer than READ_LIMIT,
 * whatever its status; it has no body, because the body was not read.
 */
type Probe = { ok: boolean; status: number; body?: string; tooLarge?: true };

async function probeUrl(url: string, method: 'HEAD' | 'GET' = 'HEAD'): Promise<Probe> {
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
      // A HEAD has no body, and is read as before.
      maxBodyBytes: method === 'GET' ? READ_LIMIT : undefined,
    });
    if (method !== 'GET') return { ok: resp.ok, status: resp.status, body: undefined };
    // The limit holds for any status: r10 reads the home page's body whatever
    // its status. The checks that need an ok response test ok first, so a
    // large 404 is still "not found".
    const body = await textWithin(resp, READ_LIMIT);
    if (body === null) return { ok: resp.ok, status: resp.status, tooLarge: true };
    return { ok: resp.ok, status: resp.status, body };
  } catch {
    return { ok: false, status: 0 };
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * The first of `paths` that answers ok with more than 10 characters. A path
 * that answers ok with a body longer than READ_LIMIT ends the search: it is
 * returned with tooLarge and no body, so its check can say it was not read.
 */
async function probePaths(origin: string, paths: string[]): Promise<{ found: boolean; url?: string; status: number; body?: string; tooLarge?: true }> {
  for (const path of paths) {
    const url = new URL(path, origin).href;
    const result = await probeUrl(url, 'GET');
    if (result.ok && result.tooLarge) {
      return { found: true, url, status: result.status, tooLarge: true };
    }
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
  if (result.tooLarge) {
    return { id: 'r01', item: 'Machine-readable token file exposed', category: 'tokens', status: 'WARN', detail: notRead(`Token file at ${result.url}`) };
  }
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
  if (result.tooLarge) {
    return { id: 'r02', item: 'llms.txt present', category: 'discovery', status: 'WARN', detail: notRead(`llms.txt at ${result.url}`) };
  }
  if (!result.found) {
    return { id: 'r02', item: 'llms.txt present', category: 'discovery', status: 'FAIL', detail: 'No /llms.txt found: agents have no orientation brief' };
  }
  return { id: 'r02', item: 'llms.txt present', category: 'discovery', status: 'PASS', detail: `/llms.txt returns ${result.body?.length || 0} bytes of agent-facing brief` };
}

async function checkR03AgentJson(origin: string): Promise<CheckResult> {
  const result = await probePaths(origin, ['/.well-known/agent.json', '/agent.json']);
  if (result.tooLarge) {
    return { id: 'r03', item: 'agent.json present', category: 'discovery', status: 'WARN', detail: notRead(`agent.json at ${result.url}`) };
  }
  if (!result.found) {
    return { id: 'r03', item: 'agent.json present', category: 'discovery', status: 'FAIL', detail: 'No /.well-known/agent.json: agents have no discovery endpoint' };
  }
  const hasIdentity = result.body?.includes('identity') || result.body?.includes('authority');
  if (hasIdentity) {
    return { id: 'r03', item: 'agent.json present', category: 'discovery', status: 'PASS', detail: `/.well-known/agent.json returns discovery document with identity/authority fields` };
  }
  return { id: 'r03', item: 'agent.json present', category: 'discovery', status: 'WARN', detail: `agent.json found but missing standard fields (identity, authority)` };
}

async function checkR04McpEndpoint(origin: string): Promise<CheckResult> {
  // The MCP Streamable HTTP transport REQUIRES Accept to list both
  // application/json and text/event-stream. This probe previously sent only
  // Content-Type, so a spec-compliant server correctly answered 406 Not
  // Acceptable — "Client must accept both application/json and
  // text/event-stream" — and r04 read that as "did not respond with a tool
  // list" and returned WARN.
  //
  // The effect: this check passed only on servers lenient enough to ignore a
  // required header, and penalised the ones implementing the spec exactly. It
  // marked designesy.org's own compliant endpoint as WARN, which is how it was
  // found. Every correct MCP server on the web was getting a false WARN.
  //
  // Fixed 2026-09-24 and verified from an independent network path:
  //   POST /api/mcp, Content-Type only                          -> 406
  //   POST /api/mcp, + Accept: application/json, text/event-stream -> 200 + tools
  //
  // KNOWN REMAINING, and it is NOT this header: when the site scores its OWN
  // origin, this probe reports 400 (or 401 against a *.vercel.app alias).
  // That was read as a self-request-path artifact, not a conformance failure:
  // the tools/list request sent from outside Vercel returns 200 with the full
  // tool list, and a third-party origin that lacks an MCP endpoint is
  // correctly reported as 404/405. Vercel serves deployment-protected and
  // loopback self-requests differently from external ones. The probe's
  // request was not the one sent from outside, though: see SELF-CASE below.
  // Do not "fix" this by loosening the Accept header again; the header is now
  // correct and the external behaviour is proven. If it is to be closed, it
  // needs the self-case to skip the probe or resolve through the public
  // hostname, which is a routing decision rather than a header one.
  //
  // Same defect class as d06 (which counted var() spellings as distinct
  // families): a check measuring the target's conformance to the adapter's
  // assumption rather than to the standard.
  // SELF-CASE: verify locally instead of over the network.
  //
  // When the target IS this deployment, the probe POSTs to /api/mcp on its own
  // origin. That arrives as an internal subrequest and was answered 400,
  // while the tools/list request sent from outside returns 200 with the full
  // tool list. Compared:
  //
  //   POST /api/mcp from outside                -> 200 (tools listed)
  //   POST /api/mcp from inside the deployment  -> 400
  //   GET  /api/score      from inside          -> 200 (self-score works)
  //   GET  /api/guardrails from inside          -> 200 (self-score works)
  //
  // So it was read as specific to POSTing this SDK-backed route from inside
  // itself, not a general self-fetch failure and not the Accept header (#102
  // fixed that and it is verified). Guessing further at the bundled SDK's
  // internal request normalisation is a poor use of effort when the check's
  // actual question ("does this endpoint answer tools/list with a tool
  // list?") can be answered without a network hop at all.
  //
  // The two POSTs were not the same request. url-guard used to end every
  // request without writing its body, so this probe's tools/list POST reached
  // every endpoint, this deployment's included, with an empty body, while the
  // one sent from outside carried it. An endpoint built with mcp-handler, the
  // package this site's MCP route uses, answers a tools/list POST with no
  // body with 400 (measured locally by check-fetch-bounds.mjs). url-guard now
  // sends the body. Whether the missing body is the whole of the 400 above
  // was not measured on the deployment; the self-case stands either way.
  //
  // The honest way to skip a probe is to answer its question from the source of
  // truth, not to assume PASS. mcp-handler registers the tools this route
  // serves in-process, so for the self-case we ask that registry directly.
  // If the registry is unavailable we still fall through to the network probe
  // rather than fabricate a verdict.
  const isSelfOrigin = (() => {
    try {
      const h = new URL(origin).hostname.replace(/^www\./, '');
      return h === 'designesy.org';
    } catch {
      return false;
    }
  })();

  if (isSelfOrigin) {
    try {
      const { getMcpToolsForReadiness } = await import('../../lib/mcp-tool-registry');
      const names = getMcpToolsForReadiness();
      if (Array.isArray(names) && names.length > 0) {
        return {
          id: 'r04',
          item: 'MCP endpoint responds to tools/list',
          category: 'mcp',
          status: 'PASS',
          detail: `MCP endpoint at /api/mcp serves ${names.length} tool(s) (self-verified in-process: no network hop)`,
        };
      }
    } catch {
      // Registry unavailable — fall through to the network probe below.
    }
  }

  const mcpUrl = new URL('/api/mcp', origin).href;
  try {
    const resp = await safeFetch(mcpUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        // Both are required by the transport spec; omitting either earns a 406.
        Accept: 'application/json, text/event-stream',
      },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list' }),
      signal: AbortSignal.timeout(8000),
      maxBodyBytes: READ_LIMIT,
    });
    if (resp.ok) {
      const data = await textWithin(resp, READ_LIMIT);
      if (data === null) {
        return { id: 'r04', item: 'MCP endpoint responds to tools/list', category: 'mcp', status: 'WARN', detail: notRead('The tools/list answer from /api/mcp') };
      }
      // Streamable HTTP answers as either a single JSON body or an SSE frame
      // (`event: message` / `data: {...}`). The previous test was a substring
      // search for "tools"/"result", which appears in both framings — but it
      // never parsed the body, so a 200 carrying a JSON-RPC *error* also
      // satisfied it. Parse, then assert on the result shape.
      let parsed: { result?: { tools?: unknown[] }; error?: { message?: string } } | null = null;
      const jsonBody =
        data.startsWith('event:') || data.includes('\ndata:')
          ? data.slice(data.indexOf('data:') + 5).split('\n')[0].trim()
          : data;
      try {
        parsed = JSON.parse(jsonBody);
      } catch {
        parsed = null;
      }
      const tools = parsed?.result?.tools;
      if (Array.isArray(tools)) {
        return { id: 'r04', item: 'MCP endpoint responds to tools/list', category: 'mcp', status: 'PASS', detail: `MCP endpoint at /api/mcp responds to tools/list with ${tools.length} tool(s)` };
      }
      if (parsed?.error) {
        return { id: 'r04', item: 'MCP endpoint responds to tools/list', category: 'mcp', status: 'WARN', detail: `MCP endpoint answered tools/list with a JSON-RPC error: ${parsed.error.message || 'unspecified'}` };
      }
    }
    return { id: 'r04', item: 'MCP endpoint responds to tools/list', category: 'mcp', status: 'WARN', detail: `Endpoint exists but did not respond with a tool list (HTTP ${resp.status})` };
  } catch {
    return { id: 'r04', item: 'MCP endpoint responds to tools/list', category: 'mcp', status: 'FAIL', detail: 'No MCP endpoint detected at /api/mcp' };
  }
}

async function checkR05DesignMd(origin: string): Promise<CheckResult> {
  const result = await probePaths(origin, ['/DESIGN.md', '/design.md']);
  if (result.tooLarge) {
    return { id: 'r05', item: 'DESIGN.md present (the DESIGN.md format)', category: 'discovery', status: 'WARN', detail: notRead(`DESIGN.md at ${result.url}`) };
  }
  if (!result.found) {
    return { id: 'r05', item: 'DESIGN.md present (the DESIGN.md format)', category: 'discovery', status: 'FAIL', detail: 'No /DESIGN.md: missing the machine-readable design brief' };
  }
  return { id: 'r05', item: 'DESIGN.md present (the DESIGN.md format)', category: 'discovery', status: 'PASS', detail: `/DESIGN.md found (${result.body?.length || 0} bytes)` };
}

async function checkR06TokenDescription(origin: string): Promise<CheckResult> {
  // This is checked alongside r01 — if tokens were found, check for $description
  const tokenResult = await probePaths(origin, ['/tokens.json', '/design-tokens.json', '/contracts/tokens.json', '/export/tokens.json']);
  if (tokenResult.tooLarge) {
    return { id: 'r06', item: 'Token documentation: tokens carry $description', category: 'tokens', status: 'WARN', detail: notRead(`Token file at ${tokenResult.url}`) };
  }
  if (!tokenResult.found || !tokenResult.body) {
    return { id: 'r06', item: 'Token documentation: tokens carry $description', category: 'tokens', status: 'FAIL', detail: 'No token file found to check for $description' };
  }
  const hasDescription = tokenResult.body.includes('$description');
  if (hasDescription) {
    return { id: 'r06', item: 'Token documentation: tokens carry $description', category: 'tokens', status: 'PASS', detail: 'Tokens found with $description metadata' };
  }
  return { id: 'r06', item: 'Token documentation: tokens carry $description', category: 'tokens', status: 'WARN', detail: 'Tokens found but no $description: agents lack context' };
}

async function checkR07ComponentContract(origin: string): Promise<CheckResult> {
  const result = await probePaths(origin, ['/components.json', '/contracts/components.json', '/component-schema.json']);
  if (result.tooLarge) {
    return { id: 'r07', item: 'Component contract (machine-readable schema)', category: 'components', status: 'WARN', detail: notRead(`Component schema at ${result.url}`) };
  }
  if (!result.found) {
    // Fallback: check if /open.json or /agent.json mentions components
    const openResult = await probePaths(origin, ['/open.json', '/.well-known/agent.json']);
    if (openResult.tooLarge) {
      return { id: 'r07', item: 'Component contract (machine-readable schema)', category: 'components', status: 'WARN', detail: notRead(`${openResult.url}`) };
    }
    const mentionsComponents = openResult.body?.includes('component');
    if (mentionsComponents) {
      return { id: 'r07', item: 'Component contract (machine-readable schema)', category: 'components', status: 'WARN', detail: 'Component documentation found but not machine-readable' };
    }
    return { id: 'r07', item: 'Component contract (machine-readable schema)', category: 'components', status: 'FAIL', detail: 'No machine-readable component contract' };
  }
  return { id: 'r07', item: 'Component contract (machine-readable schema)', category: 'components', status: 'PASS', detail: `Machine-readable component schema detected at ${result.url}` };
}

async function checkR08Sitemap(origin: string): Promise<CheckResult> {
  const url = new URL('/sitemap.xml', origin).href;
  const result = await probeUrl(url, 'GET');
  if (result.ok && result.tooLarge) {
    return { id: 'r08', item: 'Sitemap.xml present', category: 'crawlability', status: 'WARN', detail: notRead(`Sitemap at ${url}`) };
  }
  if (result.ok && result.body && result.body.includes('<urlset')) {
    return { id: 'r08', item: 'Sitemap.xml present', category: 'crawlability', status: 'PASS', detail: '/sitemap.xml found: site is crawlable' };
  }
  return { id: 'r08', item: 'Sitemap.xml present', category: 'crawlability', status: 'FAIL', detail: 'No /sitemap.xml: agents cannot discover pages' };
}

async function checkR09RobotsTxt(origin: string): Promise<CheckResult> {
  const url = new URL('/robots.txt', origin).href;
  const result = await probeUrl(url, 'GET');
  if (result.ok && result.tooLarge) {
    return { id: 'r09', item: 'robots.txt permissive for agents', category: 'crawlability', status: 'WARN', detail: notRead(`robots.txt at ${url}`) };
  }
  if (!result.ok || !result.body) {
    return { id: 'r09', item: 'robots.txt permissive for agents', category: 'crawlability', status: 'FAIL', detail: 'No /robots.txt: crawling rules undefined' };
  }
  const disallowAll = /User-agent:\s*\*\s*\n\s*Disallow:\s*\//i.test(result.body);
  if (disallowAll) {
    return { id: 'r09', item: 'robots.txt permissive for agents', category: 'crawlability', status: 'WARN', detail: 'robots.txt found but restricts all agents' };
  }
  return { id: 'r09', item: 'robots.txt permissive for agents', category: 'crawlability', status: 'PASS', detail: '/robots.txt found and allows agent crawling' };
}

async function checkR10OpenGraph(home: Probe, url: string): Promise<CheckResult> {
  // The page's body is read whatever its status, as before, so a page longer
  // than the read limit is reported for any status.
  if (home.tooLarge) {
    return { id: 'r10', item: 'Open Graph + Twitter card meta tags', category: 'social', status: 'WARN', detail: notRead(`The page at ${url}`) };
  }
  const html = home.body || '';
  const hasOg = /<meta\s+property=["']og:/i.test(html);
  const hasTwitter = /<meta\s+name=["']twitter:/i.test(html);
  if (hasOg && hasTwitter) {
    return { id: 'r10', item: 'Open Graph + Twitter card meta tags', category: 'social', status: 'PASS', detail: 'OG and Twitter card meta tags present' };
  }
  if (hasOg || hasTwitter) {
    return { id: 'r10', item: 'Open Graph + Twitter card meta tags', category: 'social', status: 'WARN', detail: 'Partial social meta (OG or Twitter, not both)' };
  }
  return { id: 'r10', item: 'Open Graph + Twitter card meta tags', category: 'social', status: 'FAIL', detail: 'No social meta tags: missing share context' };
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
    checkR10OpenGraph(homeResult, targetUrl),
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

// The second key part names the result format. A result cached before the
// read limit could be wrong for a site with a file past it: a probe whose
// gzip, deflate or br body decoded past 4 MiB failed, so its check reported
// a file that exists as not found, and a home page that did so failed the
// whole scan as not fetched. Under this key no result cached before the
// read limit is read. Next.js 16.4.2 puts the function's source in the key
// too, and the read limit edits this function, so on that version the old
// entries are not read under either key. This part keeps them unread
// whatever the framework does with the source; without both, such a result
// would be served until 24 h after it was cached and once more, to the
// request that starts a new scan.
const scoreReadiness = unstable_cache(scoreReadinessUncached, ['designesy-readiness', 'read-limit-4mib'], {
  revalidate: READINESS_TTL,
  tags: ['readiness'],
});

// ── POST handler ─────────────────────────────────────────────────────────────

export async function POST(request: Request) {
  const caller = await clientKey(request.headers);
  if (rateLimited(caller)) {
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