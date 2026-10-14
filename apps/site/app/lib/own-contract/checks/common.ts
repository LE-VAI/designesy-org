// What every fidelity check shares (engine spec 6.2): the result shape, the
// share thresholds, the SKIP reasons, and evidence capped at 20 entries.

import type { Binding } from '../bind';
import type { PageCss } from '../css';
import { FIDELITY_DEFS, SHARE_PASS_AT, SHARE_WARN_AT, type FidelityDef } from '../formula';
import { EVIDENCE_CAP } from '../limits';
import type { GroupName, OwnContract } from '../types';

export type Status = 'PASS' | 'WARN' | 'FAIL' | 'SKIP';
export type SkipReason = 'not_declared' | 'not_located' | 'not_applicable';
export interface Evidence { path?: string; value: string; where?: string[]; uses?: number }
export type Finding = Record<string, string | number | null>;

/** CheckResult (the engine's shape) plus the own-contract fields (engine spec 10.3). */
export interface CheckResultV2 {
  id: string;
  item: string;
  category: string;
  status: Status | 'MANUAL';
  detail: string;
  layer: 'fidelity' | 'baseline';
  reads?: string[];
  declared?: Evidence[];
  shipped?: Evidence[];
  derivedFrom?: string[];
  skipReason?: SkipReason;
  remediation?: string;
  evidence?: { findings: Finding[]; truncated: number };
}

export interface Ctx {
  contract: OwnContract;
  page: PageCss;
  html: string;
  bindings: Binding[];
  byPath: Map<string, Binding>;
  notes: string[];
  /** Distinct shipped values each group's check compared (coverage.groups[g].shippedCompared). */
  compared: Partial<Record<GroupName, number>>;
}

const DEF: Record<string, FidelityDef> = Object.fromEntries(FIDELITY_DEFS.map((d) => [d.id, d]));

export function capList<T>(list: T[]): { items: T[]; truncated: number } {
  return { items: list.slice(0, EVIDENCE_CAP), truncated: Math.max(0, list.length - EVIDENCE_CAP) };
}

export function result(id: string, ctx: Ctx, status: Status, detail: string, extra: Partial<CheckResultV2> = {}): CheckResultV2 {
  const d = DEF[id];
  const out: CheckResultV2 = {
    id,
    item: d.title,
    category: d.category,
    status,
    detail,
    layer: 'fidelity',
    reads: d.reads[ctx.contract.format],
    derivedFrom: d.derivedFrom,
    ...extra,
  };
  // A fix text with a placeholder (f09, f10: {need}) arrives filled in extra.remediation.
  if (status !== 'PASS' && status !== 'SKIP') out.remediation = extra.remediation ?? d.fix;
  else delete out.remediation;
  for (const k of ['declared', 'shipped'] as const) {
    const list = out[k];
    if (list && list.length > EVIDENCE_CAP) out[k] = list.slice(0, EVIDENCE_CAP);
  }
  return out;
}

export function skip(id: string, ctx: Ctx, reason: SkipReason, detail: string, extra: Partial<CheckResultV2> = {}): CheckResultV2 {
  return result(id, ctx, 'SKIP', detail, { ...extra, skipReason: reason });
}

/** PASS at 0.90 or more, WARN from 0.70, FAIL below (over distinct shipped values). */
export function shareStatus(inContract: number, total: number, passAt = SHARE_PASS_AT, warnAt = SHARE_WARN_AT): Status {
  const s = inContract / total;
  // A hair of tolerance so 9/10 is exactly 0.9 however it is computed.
  return s >= passAt - 1e-9 ? 'PASS' : s >= warnAt - 1e-9 ? 'WARN' : 'FAIL';
}

/** The omission for a group, as the contract states it (DESIGN.md `omitted`). */
export function omission(ctx: Ctx, group: string): { reason?: string } | null {
  return ctx.contract.omitted.find((o) => o.group === group) ?? null;
}

export function notDeclared(id: string, ctx: Ctx, group: string, what: string): CheckResultV2 {
  const o = omission(ctx, group);
  const why = o ? `your contract omits ${what}${o.reason ? `: ${o.reason}` : '.'}` : `your contract declares no ${what}.`;
  return skip(id, ctx, 'not_declared', `Not declared: ${why}${why.endsWith('.') ? '' : '.'} ${id} did not run.`);
}

export const px = (n: number) => `${Math.round(n * 100) / 100}px`;
export const plural = (n: number, one: string, many: string) => (n === 1 ? one : many);
export const pct = (x: number) => `${Math.round(x * 100)}%`;
