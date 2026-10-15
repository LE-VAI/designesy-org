// POST /api/score with a `contract` field: own-contract mode (engine spec
// sections 10 to 13). The hosted route calls handleOwnContract() from its POST
// handler and passes in the pieces only it holds (the page fetch, the legacy
// check functions, v36's confusable helper, the detail sanitizer), so every
// own-contract unit lives here and route.ts gains no new top-level function
// (packages/score/scripts/source-drift.mjs compares the two engine copies).
//
// Order (engine spec 10.1): body size (413) -> scope conflict (400) ->
// contract shape (400) -> the mode's rate limit (429) -> intake (413, 422) ->
// page fetch -> scoring. Never through the cached scoreUrl: nothing about a
// contract run is stored (owner decision D4). Responses carry
// Cache-Control: no-store. Nothing here logs contract-derived data, the
// scored URL or the contract URL (section 13).

import { CONTRACT_VERSION } from '../design-system-contract';
import { ENGINE_VERSION } from '../check-definitions';
import { fixedWindow, getLimiter } from '../rate-limit';
import { buildReceipt, type Receipt } from '../receipt';
import { readContract, type IntakeOptions } from './index';
import { fetchContract, type Fetcher } from './fetch-contract';
import { LINTER_VERSION } from './design-md';
import { MAX_BODY_BYTES } from './limits';
import { problem } from './problems';
import { scoreOwnContract, type OwnContractRun } from './run';
import type { BaselineInput } from './baseline';
import type { OwnContract, Problem } from './types';

/** The mode's own limits per IP (engine spec 12): 20 per minute and 300 per day. */
export const CONTRACT_LIMITS = {
  minute: { prefix: 'score-contract-min', tokens: 20, window: '60 s' as const },
  day: { prefix: 'score-contract-day', tokens: 300, window: '1 d' as const },
};

/** What the route hands over: its own fetch and checks, unchanged. */
export interface RouteDeps {
  /** fetchPageResilient: the page and its stylesheets, or why there is no page. */
  fetchPage: (url: string) => Promise<
    | { ok: true; html: string; css: string; stylesheetsFetched: number; stylesheetsTotal: number; stylesheetsTruncated: boolean }
    | { ok: false; reason: 'http_error' | 'timeout' | 'network' | 'empty_body'; status?: number; attempted: string[] }
  >;
  /** The legacy checks the baseline layer reads, run on one page (any superset of the 18). */
  legacyChecks: (page: { html: string; css: string }) => BaselineInput[];
  /** url-guard's safeFetch: the only fetcher a contract URL may use. */
  safeFetch: Fetcher;
  /** v36's per-string helper. */
  findConfusables: IntakeOptions['findConfusables'];
  /** IntakeOptions.lint, for tests; the route leaves it out (loaded lazily). */
  lint?: IntakeOptions['lint'];
}

export interface ContractRequest {
  /** The parsed request body. */
  body: Record<string, unknown>;
  /** The body's size in bytes, as received. */
  bodyBytes: number;
  /** The normalized, validated page URL. */
  url: string;
  /** The caller's IP, for the mode limiter only (never stored). */
  ip: string;
}

export type OwnContractResponse = { status: number; body: unknown; headers: Record<string, string> };

const NO_STORE = { 'Cache-Control': 'no-store' };

function reply(status: number, body: unknown, headers: Record<string, string> = {}): OwnContractResponse {
  return { status, body, headers: { ...NO_STORE, ...headers } };
}

function requestError(status: number, code: string, error: string): OwnContractResponse {
  return reply(status, { ok: false, error, code });
}

/** The `contract` object as the API takes it, or why it is not one (400 contract_shape). */
export function readContractField(raw: unknown): { ok: true; value: { content?: string; url?: string; format: 'auto' | 'design.md' | 'dtcg'; tokenMap: Record<string, string> | null } } | { ok: false; error: string } {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return { ok: false, error: '`contract` must be an object with `content` or `url`.' };
  const o = raw as Record<string, unknown>;
  const hasContent = typeof o.content === 'string';
  const hasUrl = typeof o.url === 'string';
  if (hasContent === hasUrl) return { ok: false, error: 'Send exactly one of `contract.content` and `contract.url`.' };
  if (o.content !== undefined && !hasContent) return { ok: false, error: '`contract.content` must be a string.' };
  if (o.url !== undefined && !hasUrl) return { ok: false, error: '`contract.url` must be a string.' };
  const format = o.format === undefined ? 'auto' : o.format;
  if (format !== 'auto' && format !== 'design.md' && format !== 'dtcg') return { ok: false, error: '`contract.format` must be "auto", "design.md" or "dtcg".' };
  let tokenMap: Record<string, string> | null = null;
  if (o.tokenMap !== undefined && o.tokenMap !== null) {
    if (typeof o.tokenMap !== 'object' || Array.isArray(o.tokenMap)) return { ok: false, error: '`contract.tokenMap` must be an object of contract paths to CSS variable names.' };
    // Copied key by key into a null-prototype object: never spread caller input.
    tokenMap = Object.create(null) as Record<string, string>;
    for (const k of Object.keys(o.tokenMap as object)) {
      const v = (o.tokenMap as Record<string, unknown>)[k];
      if (typeof v !== 'string') return { ok: false, error: '`contract.tokenMap` values must be strings.' };
      tokenMap[k] = v;
    }
  }
  return { ok: true, value: { ...(hasContent ? { content: o.content as string } : { url: o.url as string }), format, tokenMap } };
}

/** The mode limiter: fail open (as the edge limiter does) when Upstash is absent or does not answer. */
async function limited(ip: string): Promise<{ limited: false } | { limited: true; retryAfter: number }> {
  for (const l of [CONTRACT_LIMITS.minute, CONTRACT_LIMITS.day]) {
    try {
      const limiter = getLimiter(l.prefix, fixedWindow(l.tokens, l.window));
      if (!limiter) continue;
      const d = await limiter.limit(`${l.prefix}:${ip}`);
      if (!d.success) return { limited: true, retryAfter: Math.max(1, Math.ceil((d.reset - Date.now()) / 1000)) };
    } catch {
      // Fail open: a missing or dead limiter must not take the mode down.
    }
  }
  return { limited: false };
}

const sentence = (p: Problem[]) => (p.length ? p[0].message : 'Your contract cannot be scored yet.');

type OwnContractReceipt = Receipt & {
  own_contract: { digest: string; format: OwnContract['format']; source: 'inline' | 'url'; url?: string; linter?: string };
};

/** The receipt (engine spec 11.3): the verdict digest over fidelity then baseline, and the contract's own digest. */
export function ownContractReceipt(url: string, contract: OwnContract, checks: Array<{ id: string; status: string }>, at: Date): OwnContractReceipt {
  const base = buildReceipt({ requestedUrl: url, contractVersion: CONTRACT_VERSION, scope: 'own-contract', checks }, at);
  return {
    ...base,
    own_contract: {
      digest: contract.digest,
      format: contract.format,
      source: contract.source.kind,
      ...(contract.source.url ? { url: contract.source.url } : {}),
      ...(contract.linter ? { linter: `${contract.linter.package}@${contract.linter.version}` } : {}),
    },
    verify: {
      method: 're-run',
      endpoint: '/api/score',
      instructions: base.digest === null
        ? base.verify.instructions
        : 'POST the same URL with the same contract to /api/score. Compare own_contract.digest first: if it differs, the contract changed. Then compare digest: if it differs while engine_version matches, the page changed.',
    },
  };
}

/** The 200 body, `format=designesy` (engine spec 10.3). */
export function ownContractBody(url: string, contract: OwnContract, run: OwnContractRun | null, page: { htmlBytes: number; cssBytes: number }, at: Date, unreachable?: { reason: string; detail: string }) {
  const checks = run ? run.checks : [];
  const tokens = {
    colors: contract.stats.byGroup.colors, typography: contract.stats.byGroup.typography, radii: contract.stats.byGroup.radii,
    spacing: contract.stats.byGroup.spacing, sizes: contract.stats.byGroup.sizes, durations: contract.stats.byGroup.durations,
    easings: contract.stats.byGroup.easings, pairs: contract.pairs.length, aliases: contract.aliases.length,
  };
  const emptyLayer = (detail: string) => ({
    score: null, grade: null, scored: 0, total: 0, pass: 0, warn: 0, fail: 0, skip: 0, manual: 0, categoryScores: {},
    ceilingApplied: false, ceilingReason: null, uncappedScore: null, nullReason: { code: 'site_unreachable' as const, detail },
  });
  const fidelity = run ? run.fidelity : emptyLayer(unreachable!.detail);
  const baseline = run ? run.baseline : { ...emptyLayer(unreachable!.detail), a11yFloorApplied: false };
  return {
    ok: true as const,
    mode: 'own-contract' as const,
    scope: 'own-contract' as const,
    contractVersion: CONTRACT_VERSION,
    engineVersion: ENGINE_VERSION,
    score: fidelity.score,
    grade: fidelity.grade,
    fidelity,
    baseline,
    coverage: run ? run.coverage : null,
    ownContract: {
      name: contract.name,
      format: contract.format,
      formatVersion: contract.formatVersion,
      source: contract.source.kind,
      ...(contract.source.url ? { url: contract.source.url } : {}),
      bytes: contract.source.bytes,
      digest: contract.digest,
      tokens,
      omitted: contract.omitted.map((o) => o.group),
      linter: contract.linter,
      problems: contract.problems,
    },
    site: {
      requestedUrl: url,
      htmlBytes: page.htmlBytes,
      cssBytes: page.cssBytes,
      stylesheetsFetched: run ? run.site.stylesheetsFetched : 0,
      stylesheetsTotal: run ? run.site.stylesheetsTotal : 0,
      stylesheetsTruncated: run ? run.site.stylesheetsTruncated : false,
    },
    ...(unreachable ? { unreachable: true, unreachableReason: unreachable.reason, unreachableDetail: unreachable.detail } : {}),
    checks,
    pass: run ? run.pass : 0, warn: run ? run.warn : 0, fail: run ? run.fail : 0, skip: run ? run.skip : 0, manual: run ? run.manual : 0,
    total: run ? run.total : 0, scored: run ? run.scored : 0,
    tokensExtracted: run ? run.tokensExtracted : 0,
    receipt: ownContractReceipt(url, contract, checks, at),
  };
}

export async function handleOwnContract(req: ContractRequest, deps: RouteDeps): Promise<OwnContractResponse> {
  // ── Request checks ──
  if (req.bodyBytes > MAX_BODY_BYTES) {
    return requestError(413, 'body_too_large', problem('body_too_large').message);
  }
  const scopeRaw = typeof req.body.scope === 'string' ? req.body.scope.toLowerCase() : '';
  if (scopeRaw === 'contract') {
    return requestError(400, 'scope_conflict', problem('scope_conflict').message);
  }
  const field = readContractField(req.body.contract);
  if (!field.ok) return requestError(400, 'contract_shape', field.error);
  const lim = await limited(req.ip);
  if (lim.limited) {
    return reply(429, { ok: false, error: 'Too many contract runs. Try again in a minute.', code: 'rate_limited' }, { 'Retry-After': String(lim.retryAfter) });
  }

  // ── Intake ──
  let content: string;
  let source: { kind: 'inline' | 'url'; url?: string };
  if (field.value.url !== undefined) {
    const fetched = await fetchContract(field.value.url, deps.safeFetch);
    if (!fetched.ok) {
      const p = fetched.problem;
      if (fetched.status === 413) return reply(413, { ok: false, error: p.message, code: p.code });
      return reply(422, { ok: false, error: 'Your contract cannot be scored yet.', code: 'contract_not_scoreable', problems: [p], warnings: [] });
    }
    content = fetched.content;
    source = { kind: 'url', url: field.value.url };
  } else {
    content = field.value.content!;
    source = { kind: 'inline' };
  }
  const intake = await readContract(
    { content, format: field.value.format, tokenMap: field.value.tokenMap, source },
    { findConfusables: deps.findConfusables, ...(deps.lint ? { lint: deps.lint } : {}) },
  );
  if (!intake.ok) {
    if (intake.status === 413) return reply(413, { ok: false, error: sentence(intake.problems), code: intake.problems[0]?.code ?? 'contract_too_large' });
    // linter: the totals the DESIGN.md format linter reported (null when it did not
    // read the file), for the page's provenance line (brand D75).
    return reply(422, { ok: false, error: 'Your contract cannot be scored yet.', code: 'contract_not_scoreable', problems: intake.problems, warnings: intake.warnings, linter: intake.linter ?? null });
  }
  const contract = intake.contract;

  // ── The page ──
  const page = await deps.fetchPage(req.url);
  const at = new Date();
  if (!page.ok) {
    const why =
      page.reason === 'http_error' ? `the server returned HTTP ${page.status ?? 'error'} for every candidate URL`
        : page.reason === 'timeout' ? 'the request timed out'
          : page.reason === 'empty_body' ? 'the response body was empty or too small to be a page'
            : 'the request failed at the network level';
    const detail = `Could not read ${req.url}: ${why}. No score is reported, because a site that cannot be fetched cannot be graded.`;
    return reply(200, ownContractBody(req.url, contract, null, { htmlBytes: 0, cssBytes: 0 }, at, { reason: page.reason, detail }));
  }
  const run = scoreOwnContract({
    contract,
    page: { html: page.html, css: page.css, site: { stylesheetsFetched: page.stylesheetsFetched, stylesheetsTotal: page.stylesheetsTotal, stylesheetsTruncated: page.stylesheetsTruncated } },
    baselineChecks: deps.legacyChecks({ html: page.html, css: page.css }),
  });
  const bytes = (s: string) => new TextEncoder().encode(s).length;
  return reply(200, ownContractBody(req.url, contract, run, { htmlBytes: bytes(page.html), cssBytes: bytes(page.css) }, at));
}

export { LINTER_VERSION };
