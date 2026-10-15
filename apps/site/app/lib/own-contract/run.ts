// One own-contract run over a fetched page (contract-mode spec §5 to §9):
// read the page, bind the contract, run f01 to f14, take the baseline layer
// from the legacy checks the route computed, score both layers, apply the
// page-level null rules and report coverage. Pure: no fetch, no clock, no
// logging; the route does the I/O and builds the receipt.

import { bindContract } from './bind';
import { baselineChecks, type BaselineInput } from './baseline';
import { FIDELITY_CHECKS, paletteLine, type CheckResultV2, type Ctx } from './checks';
import { readPageCss } from './css';
import { NULL_DETAIL, hasNoCss, isEmptyShell } from './nulls';
import { nullLayer, scoreBaseline, scoreFidelity, type LayerResult } from './score';
import type { GroupName, OwnContract } from './types';

export { paletteLine };
export type { CheckResultV2, Ctx };

export interface SiteFacts {
  stylesheetsFetched?: number;
  stylesheetsTotal?: number;
  stylesheetsTruncated?: boolean;
  /** The page or a stylesheet was longer than the hosted engine reads, and was read up to its byte cap (engine 1.5.1). */
  bytesTruncated?: boolean;
}

export interface Coverage {
  declared: number;
  located: number;
  byMap: number;
  byName: number;
  byValue: number;
  ratio: number;
  groups: Record<GroupName, { declared: number; located: number; shippedCompared: number }>;
  notes: string[];
  hint: string | null;
}

/** The stylesheet cap the hosted route applies (route.ts MAX_STYLESHEETS). */
export const STYLESHEET_CAP = 60;

export function buildContext(contract: OwnContract, page: { html: string; css: string }): Ctx {
  const css = readPageCss(page.css);
  const { bindings, notes } = bindContract(contract, css);
  return { contract, page: css, html: page.html, bindings, byPath: new Map(bindings.map((b) => [b.path, b])), notes, compared: {} };
}

export function runFidelityChecks(ctx: Ctx): CheckResultV2[] {
  return FIDELITY_CHECKS.map((check) => check(ctx));
}

const GROUPS: GroupName[] = ['colors', 'typography', 'radii', 'spacing', 'sizes', 'durations', 'easings'];

export function coverageOf(ctx: Ctx, site: SiteFacts = {}): Coverage {
  const groups = Object.fromEntries(GROUPS.map((g) => [g, { declared: 0, located: 0, shippedCompared: ctx.compared[g] ?? 0 }])) as Coverage['groups'];
  let byMap = 0;
  let byName = 0;
  let byValue = 0;
  const count = (how: 'map' | 'name' | 'value' | null) => {
    if (how === 'map') byMap++;
    else if (how === 'name') byName++;
    else if (how === 'value') byValue++;
  };
  // Faces count once each (located when any token naming the face is).
  const faces = new Map<string, 'map' | 'name' | 'value' | null>();
  const rank = { map: 3, name: 2, value: 1 } as const;
  for (const b of ctx.bindings) {
    if (!b.group) continue;
    if (b.kind === 'family') {
      const k = b.faceKey ?? b.path;
      const prev = faces.get(k) ?? null;
      if (!faces.has(k) || (b.located && (!prev || rank[b.located] > rank[prev]))) faces.set(k, b.located);
      continue;
    }
    groups[b.group].declared++;
    if (b.located) groups[b.group].located++;
    count(b.located);
  }
  for (const how of faces.values()) {
    groups.typography.declared++;
    if (how) groups.typography.located++;
    count(how);
  }
  const declared = GROUPS.reduce((a, g) => a + groups[g].declared, 0);
  const located = byMap + byName + byValue;
  const ratio = declared ? Math.round((located / declared) * 1000) / 1000 : 0;
  const notes = [...ctx.notes];
  const total = site.stylesheetsTotal ?? 0;
  const fetched = site.stylesheetsFetched ?? total;
  if (site.stylesheetsTruncated) notes.push(`STYLESHEET_CAP: the page links ${total} stylesheets; the first ${STYLESHEET_CAP} were read.`);
  if (site.bytesTruncated) notes.push('DOCUMENT_CAP: the page or its stylesheets are longer than the hosted engine reads; each was read up to its byte cap.');
  const expected = Math.min(total, STYLESHEET_CAP);
  if (fetched < expected) notes.push(`STYLESHEETS_MISSING: ${expected - fetched} of ${expected} stylesheets could not be read before the deadline or answered with an error.`);
  const hint = declared && ratio < 0.2
    ? `Only ${located} of ${declared} declared tokens were found on this page. If your CSS variables have other names, add a token map.`
    : null;
  return { declared, located, byMap, byName, byValue, ratio, groups, notes, hint };
}

export interface OwnContractRun {
  fidelity: LayerResult;
  baseline: LayerResult & { a11yFloorApplied: boolean };
  coverage: Coverage;
  checks: Array<CheckResultV2 | (BaselineInput & { layer: 'baseline' })>;
  site: Required<Pick<SiteFacts, 'stylesheetsFetched' | 'stylesheetsTotal' | 'stylesheetsTruncated'>>;
  pass: number;
  warn: number;
  fail: number;
  skip: number;
  manual: number;
  total: number;
  scored: number;
  tokensExtracted: number;
}

/**
 * Score one page against one contract. `baselineChecks` are the legacy check
 * results the hosted route computed for this page (any superset of the
 * baseline set); the baseline layer takes its eighteen.
 */
export function scoreOwnContract(input: { contract: OwnContract; page: { html: string; css: string; site?: SiteFacts }; baselineChecks: BaselineInput[] }): OwnContractRun {
  const ctx = buildContext(input.contract, input.page);
  const fidelityChecks = runFidelityChecks(ctx);
  const base = baselineChecks(input.baselineChecks);
  let fidelity = scoreFidelity(fidelityChecks);
  let baseline = scoreBaseline(base);
  if (isEmptyShell(input.page.html)) {
    fidelity = nullLayer(fidelity, 'empty_shell', NULL_DETAIL.empty_shell);
    baseline = { ...nullLayer(baseline, 'empty_shell', NULL_DETAIL.empty_shell), a11yFloorApplied: false };
  } else if (hasNoCss(input.page.css)) {
    const bytes = new TextEncoder().encode(input.page.css.trim()).length;
    fidelity = nullLayer(fidelity, 'no_css', NULL_DETAIL.no_css(bytes));
    baseline = { ...nullLayer(baseline, 'no_css', NULL_DETAIL.no_css(bytes)), a11yFloorApplied: false };
  }
  const checks = [...fidelityChecks, ...base];
  const n = (s: string) => checks.filter((c) => c.status === s).length;
  const site = input.page.site ?? {};
  return {
    fidelity,
    baseline,
    coverage: coverageOf(ctx, site),
    checks,
    site: {
      stylesheetsFetched: site.stylesheetsFetched ?? 0,
      stylesheetsTotal: site.stylesheetsTotal ?? 0,
      stylesheetsTruncated: site.stylesheetsTruncated ?? false,
    },
    pass: n('PASS'), warn: n('WARN'), fail: n('FAIL'), skip: n('SKIP'), manual: n('MANUAL'),
    total: checks.length,
    scored: n('PASS') + n('WARN') + n('FAIL'),
    tokensExtracted: ctx.page.rootVars.size,
  };
}
