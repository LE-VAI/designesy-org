// The engine pages' instruments are drawn from this module, and this module is
// drawn from each engine's published contract (lib/*-contract.ts, served as
// /contracts/*.json). Nothing here is invented: ids, order, pass criteria and
// counts come from the contracts; what this file adds is presentation only:
// a short label per check in the site's voice, the group each check is drawn
// in, the path each readiness probe looks at, and the file each guardrails
// check emits. scripts/check-engine-registry.js asserts the labels and groups
// cover every contract check and that every readiness path is one the route
// probes.
//
// Data only. Server components import it and pass slices to client components
// as props, so the contract modules never ship in a client bundle.

import { CHECKS } from '../check-definitions';
import { logLabel } from '../check-labels';
import { designSystemContract } from '../design-system-contract';
import { driftContract } from '../drift-contract';
import { readinessContract } from '../readiness-contract';
import { guardrailsContract } from '../guardrails-contract';
import { monitorContract } from '../monitor-contract';
import { compareContract } from '../compare-contract';
import { reportContract } from '../report-contract';
import { display } from './types';

export type EngineKey =
  | 'score'
  | 'drift'
  | 'readiness'
  | 'guardrails'
  | 'monitor'
  | 'compare'
  | 'report'
  | 'maturity'
  | 'm3-bridge';

export type RegistryCheck = {
  id: string;
  /** Short label in the site's voice. */
  label: string;
  /** The contract's own item text, dashes set as colons for display. */
  item: string;
  /** What a PASS means, from the contract. */
  pass: string;
  group: string;
  /** readiness: where the probe looks. */
  path?: string;
  /** guardrails: the file this check emits. */
  file?: string;
};

export type RegistryGroup = { id: string; label: string; hint: string };

export type EngineRegistry = {
  key: EngineKey;
  checks: RegistryCheck[];
  groups: RegistryGroup[];
  count: number;
  version: string;
  status: string;
  machine: string;
};

type ContractCheck = { id: string; item: string; pass: string; fail: string; warn?: string };


function build(
  key: EngineKey,
  contract: { version: string; status: string; machine_url: string; verification: { checks: readonly ContractCheck[] } },
  labels: Record<string, string>,
  groupOf: Record<string, string>,
  groups: RegistryGroup[],
  extra: Record<string, Partial<RegistryCheck>> = {},
): EngineRegistry {
  const checks = contract.verification.checks.map((c) => {
    const label = labels[c.id];
    const group = groupOf[c.id];
    if (!label || !group) throw new Error(`engine registry: ${key} ${c.id} has no label or group`);
    return { id: c.id, label, item: display(c.item), pass: display(c.pass), group, ...extra[c.id] };
  });
  return {
    key,
    checks,
    groups,
    count: checks.length,
    version: contract.version,
    status: contract.status,
    machine: new URL(contract.machine_url).pathname,
  };
}

// ── Drift: does the system resolve, and do its values cluster? ─────────────
const DRIFT = build(
  'drift',
  driftContract,
  {
    d01: 'Token registry declared',
    d02: 'No invented tokens',
    d03: 'Inline colors kept few',
    d04: 'Spacing on a scale',
    d05: 'One value per color role',
    d06: 'Font stacks kept few',
    d07: 'Radii on a scale',
    d08: 'Shadows kept few',
    d09: 'Motion timing on a scale',
    d10: 'Stacking order in range',
    d11: 'Undeclared references rare',
    d12: 'Alias chains resolve',
  },
  {
    d01: 'resolve', d02: 'resolve', d11: 'resolve', d12: 'resolve',
    d03: 'cluster', d04: 'cluster', d05: 'cluster', d06: 'cluster',
    d07: 'cluster', d08: 'cluster', d09: 'cluster', d10: 'cluster',
  },
  [
    { id: 'resolve', label: 'Tokens resolve', hint: 'Every name the CSS uses is declared somewhere.' },
    { id: 'cluster', label: 'Values cluster', hint: 'Colors, spacing, radii, shadows and timing stay on a few steps.' },
  ],
);

// ── Readiness: what an agent finds at the origin ───────────────────────────
const READINESS = build(
  'readiness',
  readinessContract,
  {
    r01: 'Token file',
    r02: 'llms.txt',
    r03: 'agent.json',
    r04: 'MCP tools',
    r05: 'DESIGN.md',
    r06: 'Token descriptions',
    r07: 'Component schema',
    r08: 'Sitemap',
    r09: 'robots.txt',
    r10: 'Share cards',
  },
  {
    r01: 'files', r06: 'files', r07: 'files',
    r02: 'briefs', r05: 'briefs',
    r03: 'discovery', r08: 'discovery', r09: 'discovery', r10: 'discovery',
    r04: 'tools',
  },
  [
    { id: 'files', label: 'Machine files', hint: 'Tokens and components an agent can parse.' },
    { id: 'briefs', label: 'Briefs', hint: 'Plain-text orientation written for agents.' },
    { id: 'discovery', label: 'Discovery', hint: 'How an agent finds its way around the site.' },
    { id: 'tools', label: 'Tools', hint: 'Endpoints an agent can call.' },
  ],
  {
    r01: { path: '/tokens.json' },
    r02: { path: '/llms.txt' },
    r03: { path: '/.well-known/agent.json' },
    r04: { path: '/api/mcp' },
    r05: { path: '/DESIGN.md' },
    r06: { path: '/tokens.json' },
    r07: { path: '/components.json' },
    r08: { path: '/sitemap.xml' },
    r09: { path: '/robots.txt' },
    r10: { path: '<head>' },
  },
);

// ── Guardrails: the six files of the build contract ────────────────────────
const GUARDRAILS = build(
  'guardrails',
  guardrailsContract,
  {
    g01: 'Tokens as DTCG',
    g02: 'Lint rules',
    g03: 'Agent rules',
    g04: 'Component contract',
    g05: 'Anti-patterns',
    // The file's name is its cell title; the label says what it is.
    g06: 'Design spec for agents',
  },
  { g01: 'bundle', g02: 'bundle', g03: 'bundle', g04: 'bundle', g05: 'bundle', g06: 'bundle' },
  [{ id: 'bundle', label: 'Build contract', hint: 'Six files an AI coding agent reads before it writes UI.' }],
  {
    g01: { file: 'tokens.json' },
    g02: { file: 'stylelint.json' },
    g03: { file: 'AGENTS.md' },
    g04: { file: 'components.json' },
    g05: { file: 'anti-patterns.json' },
    g06: { file: 'DESIGN.md' },
  },
);

// ── Monitor: is the watch working, and what changed? ───────────────────────
const MONITOR = build(
  'monitor',
  monitorContract,
  {
    m01: 'Watch registered',
    m02: 'Run on time',
    m03: 'Against the baseline',
    m04: 'Three-run trend',
    m05: 'New failures',
    m06: 'Newly passing',
    m07: 'Drop threshold',
    m08: 'Token set stable',
    m09: 'Contract version',
    m10: 'Alert delivered',
  },
  {
    m01: 'watch', m02: 'watch', m10: 'watch',
    m03: 'trend', m04: 'trend', m07: 'trend',
    m05: 'change', m06: 'change', m08: 'change', m09: 'change',
  },
  [
    { id: 'watch', label: 'The watch', hint: 'The monitor is registered, running, and can reach you.' },
    { id: 'trend', label: 'The trend', hint: 'Where the score is heading across runs.' },
    { id: 'change', label: 'What changed', hint: 'Checks, tokens and contract since the last run.' },
  ],
);

// ── Compare: eight dimensions of a two-site diff ───────────────────────────
const COMPARE = build(
  'compare',
  compareContract,
  {
    c01: 'Both sites fetched',
    c02: 'Tokens extracted',
    c03: 'Token diff',
    c04: 'Renames found',
    c05: 'Scale stops',
    c06: 'Structure',
    c07: 'Contrast drift',
    c08: 'Score delta',
  },
  {
    c01: 'read', c02: 'read',
    c03: 'diff', c04: 'diff', c05: 'diff', c06: 'diff', c07: 'diff', c08: 'diff',
  },
  [
    { id: 'read', label: 'Read both', hint: 'Both sites fetched and their tokens extracted.' },
    { id: 'diff', label: 'Diff', hint: 'Six ways the two systems can differ.' },
  ],
);

// ── Report: three engines, one weighted grade ──────────────────────────────
const REPORT = build(
  'report',
  reportContract,
  {
    rp01: 'URL accepted',
    rp02: 'Contract score ran',
    rp03: 'Drift radar ran',
    rp04: 'Readiness ran',
    rp05: 'Composite computed',
    rp06: 'Grade derived',
    rp07: 'Checks collected',
    rp08: 'Grades agree',
  },
  {
    rp01: 'run', rp02: 'run', rp03: 'run', rp04: 'run',
    rp05: 'synth', rp06: 'synth', rp07: 'synth', rp08: 'synth',
  },
  [
    { id: 'run', label: 'Engines', hint: 'The URL, then three engines in parallel.' },
    { id: 'synth', label: 'Synthesis', hint: 'The composite, its grade, and a coherence check.' },
  ],
);

// ── Score: the contract checks, by category ─────────────────────────────────
function scoreRegistry(): EngineRegistry {
  const order: string[] = [];
  for (const c of CHECKS) if (!order.includes(c.category)) order.push(c.category);
  const groups = order.map((cat) => ({ id: cat, label: cat, hint: '' }));
  const checks = CHECKS.map((c) => ({
    id: c.id,
    label: logLabel(c),
    item: display(c.item),
    pass: display(c.pass),
    group: c.category,
  }));
  return {
    key: 'score',
    checks,
    groups,
    count: checks.length,
    version: designSystemContract.version,
    status: 'live',
    machine: '/contracts/design-system.json',
  };
}

const REGISTRIES: Partial<Record<EngineKey, EngineRegistry>> = {
  drift: DRIFT,
  readiness: READINESS,
  guardrails: GUARDRAILS,
  monitor: MONITOR,
  compare: COMPARE,
  report: REPORT,
  score: scoreRegistry(),
};

export function registry(key: EngineKey): EngineRegistry {
  const r = REGISTRIES[key];
  if (!r) throw new Error(`engine registry: no registry for ${key}`);
  return r;
}
