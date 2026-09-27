// Shared shapes for the engine pages' client components. The registry types
// come from registry.ts (server data); these describe a run.
import type { RegistryCheck, RegistryGroup } from './registry';

export type { RegistryCheck, RegistryGroup };

export type Status = 'PASS' | 'WARN' | 'FAIL' | 'SKIP' | 'MANUAL';

export type Phase = 'idle' | 'running' | 'done' | 'error';

export type Outcome = { status: Status; detail: string };

export type Outcomes = Record<string, Outcome>;

export type VerdictData = {
  score: number;
  grade: string;
  pass: number;
  warn: number;
  fail: number;
  skip?: number;
  manual?: number;
  total: number;
};

/** The slice of a registry a client component needs. */
export type RegistryView = {
  checks: RegistryCheck[];
  groups: RegistryGroup[];
  machine: string;
};

/** Contract and engine prose uses em dashes; the site's visible copy does not. */
export function display(s: string): string {
  return s.replace(/\s*—\s*/g, ': ').replace(/\s+/g, ' ').trim();
}

export function isStatus(s: unknown): s is Status {
  return s === 'PASS' || s === 'WARN' || s === 'FAIL' || s === 'SKIP' || s === 'MANUAL';
}

/** API check lists to an id-keyed map; unknown statuses are dropped, not guessed. */
export function toOutcomes(checks: { id: string; status: string; detail?: string }[] | undefined): Outcomes {
  const out: Outcomes = {};
  for (const c of checks ?? []) if (isStatus(c.status)) out[c.id] = { status: c.status, detail: c.detail ?? '' };
  return out;
}

export function hostOf(url: string): string {
  try {
    return new URL(/^https?:\/\//i.test(url) ? url : `https://${url}`).host.replace(/^www\./, '');
  } catch {
    return url;
  }
}

/** A=pass tone, C/D warn, F fail: the band a grade lights on the scale. */
export function bandOf(grade: string): 'pass' | 'warn' | 'fail' {
  if (grade === 'A' || grade === 'B') return 'pass';
  if (grade === 'C' || grade === 'D') return 'warn';
  return 'fail';
}
