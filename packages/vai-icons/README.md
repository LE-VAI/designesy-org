# @vai/icons

<picture>
  <source media="(prefers-reduced-motion: reduce)" srcset="https://www.designesy.org/hero-icons-static.png">
  <img src="https://www.designesy.org/hero-icons.gif" alt="VAI Icons — eight authored, motion-bearing icons on five principles" width="960">
</picture>

Eight hand-authored, motion-bearing icons for the VAI command surface. **Each icon carries its motion contract** — the principle it belongs to, the reduce tier it occupies, and the rationale that justifies both.

```bash
npm install @vai/icons
```

## Why this exists

Every animated icon library in 2026 is copy-paste tweens. Generic spin-on-hover, generic pulse-once, generic fade. None ship *motion rationale per icon* as part of the icon's public metadata.

VAI Icons ship every icon with a `motion.json` contract sidecar. The principle, the tier, the reduce strategy — readable without running the code. **The motion is the meaning. The reduction is also the meaning.**

## The five principles

Built on `@vai/motion`. Each icon belongs to one principle family:

| Principle | Family |
|---|---|
| `waveform-trace` | data line that plots itself — signal arrives, then rests |
| `field-breath` | ambient atmosphere breathes — slow opacity swell and release |
| `mark-settle` | object resolves — blur-to-sharp iris settle, then stillness |
| `block-settle` | items settle left-to-right — staggered weighted drop |
| `grain-shift` | ambient material drift — texture, not decoration |

## The three tiers

Every icon declares its reduce tier. The tier declares how the icon behaves under `prefers-reduced-motion: reduce`:

| Tier | Strategy | Example |
|---|---|---|
| `tier1` | **REMOVE** — decoration | `cursor-trace`, `scan-line`, `grain-ambient` |
| `tier2` | **SOFTEN** — ≤200ms | `signal-bell`, `brand-mark`, `tab-row`, `menu-to-x` |
| `tier3` | **KEEP** — motion IS the meaning | `pulse-presence` (the keystone) |

The keystone test: if `pulse-presence` is silently collapsed under reduce, the tier system is broken. Every other tier contract in the library would be negotiable. This is what makes the tier system **real**, not a euphemism for "remove everything."

## The eight icons

| Icon | Principle | Tier | Reduce |
|---|---|---|---|
| `cursor-trace` | waveform-trace | tier1 | remove |
| `signal-bell` | field-breath | tier2 | soften-to-200ms-once |
| `brand-mark` | mark-settle | tier2 | remove-entrance |
| `tab-row` | block-settle | tier2 | single-frame-render |
| `grain-ambient` | grain-shift | tier1 | remove |
| `scan-line` | waveform-trace | tier1 | remove |
| `pulse-presence` | field-breath | **tier3** | **keep** |
| `menu-to-x` | mark-settle | tier2 | collapse-to-120ms-opacity |

## Usage

```js
import { mountIcon, manifest, resolveTier } from '@vai/icons';

// Mount an icon into a host element
await mountIcon('pulse-presence', document.getElementById('here'));

// Read the icon's contract
const c = iconContract('pulse-presence');
console.log(c);  // { name: 'pulse-presence', principle: 'field-breath', tier: 'tier3', reduce: 'keep', keystone: true }

// Resolve the tier under the user's current motion preference
console.log(resolveTier('pulse-presence'));
// { class: 'vai-icon-tier3-keep', reducedMotion: false | true, raw: {...} }

// Browse the manifest
console.log(manifest.icons.length);  // 8
```

## CSS-only path

```html
<link rel="stylesheet" href="node_modules/@vai/icons/styles/vai-icons.css" />

<svg class="vai-icon"
     data-vai-icon="pulse-presence"
     data-vai-tier="tier3"
     viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="1.5">
  <!-- icon body -->
</svg>
```

The CSS handles all keyframes and the tiered `prefers-reduced-motion` block.

## License

MIT — Designesy. Part of the [designesy-org](https://github.com/LE-VAI/designesy-org) monorepo.
