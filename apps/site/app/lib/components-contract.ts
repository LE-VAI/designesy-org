/**
 * Components contract — the machine-readable form of the design system
 * contract's `components` section.
 *
 * WHY THIS IS DERIVED RATHER THAN AUTHORED
 * The components list already exists once, in design-system-contract.ts. This
 * module reads it and adds machine-readable structure (per-state token
 * bindings, accessibility obligations, press-scale values) instead of
 * restating it. Two frozen copies of one fact is the contradiction the
 * hero-stats module was created to kill elsewhere in this codebase, and this
 * lane has spent two sessions removing exactly that shape — hardcoded numbers
 * that drifted from the thing they described.
 *
 * WHY IT EXISTS AT ALL
 * The readiness engine's r07 checks for a machine-readable component contract
 * and returned WARN because none was published, while /contracts/design-system
 * carried the same information as prose. A token file tells an agent which
 * values are legal; it does not tell it which COMBINATIONS are — that a card
 * presses at 0.985 while a button presses at 0.96, or that a sound toggle
 * carries an aria-pressed obligation a nav link does not. Those rules were
 * machine-invisible.
 *
 * SCOPE: this is the published contract, not an inventory of every component
 * in the codebase. It lists what the system DEFINES as canonical, which is the
 * question a conformance check asks. Adding a component here is a contract
 * change and should be deliberate.
 */

import { designSystemContract } from './design-system-contract';

/** Press scales, from the contract's takt section. Cells/buttons vs cards/rows. */
const TAKT_RULES: readonly string[] = designSystemContract.takt.rules;
const pressScaleFor = (kind: 'cell' | 'card'): number | null => {
  const rule = TAKT_RULES.find((r) => r.includes('Press scale'));
  if (!rule) return null;
  const m = rule.match(/(0\.\d+)\s*on\s*cells and buttons;?\s*(0\.\d+)\s*on\s*cards and rows/);
  if (!m) return null;
  return kind === 'cell' ? parseFloat(m[1]) : parseFloat(m[2]);
};

/**
 * Token bindings per component, keyed by the state names the design system
 * contract uses in its `states` prose. Kept beside the prose rather than
 * parsed out of it: the prose is written for a reader and rewording it should
 * not silently change the machine contract.
 */
const BINDINGS: Record<string, { state: string; tokens: string[]; obligation?: string }[]> = {
  'Primary button': [
    { state: 'default', tokens: ['--signal', '--paper-on-signal'] },
    { state: 'hover', tokens: ['--signal-light'] },
    { state: 'active', tokens: [], obligation: 'press scale, see takt.press_scale.cell' },
    { state: 'focus-visible', tokens: ['--signal-light'], obligation: '2px outline, 2px offset' },
  ],
  'Ghost button': [
    { state: 'default', tokens: ['--line-strong'] },
    { state: 'hover', tokens: ['--surface-hover'] },
    { state: 'active', tokens: [], obligation: 'press scale, see takt.press_scale.cell' },
  ],
  'Nav link': [
    { state: 'default', tokens: ['--muted'] },
    { state: 'hover', tokens: ['--ink', '--surface-hover'] },
    { state: 'scrolled', tokens: [], obligation: 'sticky topbar blur' },
  ],
  'Card / pillar': [
    { state: 'default', tokens: ['--surface', '--line'] },
    { state: 'hover', tokens: ['--surface-raised', '--line-strong'], obligation: 'fine pointer only — gated on (hover: hover) and (pointer: fine)' },
    { state: 'active', tokens: [], obligation: 'press scale, see takt.press_scale.card' },
  ],
  'Sound toggle': [
    { state: 'off', tokens: ['--muted-dim'], obligation: 'aria-pressed="false"; Cuelume setEnabled(false)' },
    { state: 'on', tokens: ['--signal-light'], obligation: 'aria-pressed="true"; Cuelume setEnabled(true)' },
  ],
  'Definition block': [
    { state: 'default', tokens: ['--surface', '--line'] },
    { state: 'hover', tokens: ['--line-strong'] },
    { state: 'label', tokens: ['--muted-dim'], obligation: 'uppercase, letter-spacing 0.18em' },
  ],
};

/** Accessibility obligations that apply to every component, from accessibility[]. */
const GLOBAL_A11Y: readonly string[] = designSystemContract.accessibility;

export const componentsContract = {
  id: 'designesy.components',
  version: '0.1.0',
  status: 'public' as const,
  name: 'Designesy Components Contract',
  kind: 'contract' as const,
  public_url: 'https://www.designesy.org/contracts/components',
  machine_url: 'https://www.designesy.org/contracts/components.json',
  updated: '2026-09-24',
  source_authority: {
    derived_from: 'designesy.design-system',
    contract_version: designSystemContract.version,
    note:
      'The component list and its state prose come from the design system ' +
      'contract. This export adds machine-readable bindings; it does not ' +
      'restate the list, so the two cannot disagree about which components exist.',
  },
  // Read straight from the source contract — not retyped.
  components: designSystemContract.components.map((c) => ({
    name: c.name,
    states: c.states,
    ...(BINDINGS[c.name] ? { state_bindings: BINDINGS[c.name] } : {}),
  })),
  press_scale: {
    cell: pressScaleFor('cell'),
    card: pressScaleFor('card'),
    floor: 0.95,
    note: 'Read from takt.rules. Never below the 0.95 floor.',
  },
  accessibility: GLOBAL_A11Y,
  permission: 'read-only by default; write scope requires explicit operator grant',
  cite: {
    short: 'Designesy components contract (designesy.org/contracts/components)',
    machine: 'https://www.designesy.org/contracts/components.json',
  },
};
