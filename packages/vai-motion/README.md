# @vai/motion

<picture>
  <source media="(prefers-reduced-motion: reduce)" srcset="https://www.designesy.org/labs/poise">
  <img src="https://www.designesy.org/hero-score-gate.gif" alt="VAI Motion — five authored principles" width="960">
</picture>

Five authored, named motion principles from the VAI command surface. **Not components — principles.** Each one ships with its contract backing, its provenance (which audit produced it, what it replaced and why), and its reduced-motion tier.

The counter-library to AI-default motion: every AI generator produces scanner beams by default. These five are the authored alternative.

```bash
npm install @vai/motion
```

## Why principles, not components

Component catalogs sell you a scroll reveal. VAI Motion sells you the *named principle* — with its contract entry, its anti-patterns, and its accessibility tiering. Where a component is copy-paste, a principle is *understand, then apply*.

## The five principles

| Principle | What it does | Tier |
|---|---|---|
| **waveform-trace** | A data line plots itself across the surface — signal arrives, then rests. Retired scan-beam/signal-sweep. | 1 · remove |
| **field-breath** | The ambient atmosphere breathes — slow opacity swell and release. Background presence, never a demand. Retired the fake-liveness pulse. | 2 · soften |
| **mark-settle** | The mark resolves — blur-to-sharp iris settle. Arrive sharp, then rest. | 2 · soften |
| **block-settle** | Content blocks settle into place — one composed, weighted drop onto the grid. Not scattered identical entrances. | 2 · soften |
| **grain-shift** | Ambient grain shifts over the surface — material, not decoration. | 1 · remove |

## Tiered reduced-motion — first-class API

The industry default is a binary kill-switch (`prefers-reduced-motion: reduce` → every duration becomes 0.01ms). That obliterates meaning along with motion.

VAI tiers it:

```js
import { prefersReducedMotion, resolveDuration, REDUCED_MOTION } from '@vai/motion';

// tier 1 → 0ms (removed) · tier 2 → ≤200ms (softened) · tier 3 → full
const ms = resolveDuration('tier2', 600); // 200 under reduce, 600 full
```

- **tier 1 · remove** — decorative motion with no information; disabled entirely
- **tier 2 · soften** — ≤200ms, transform/opacity only; the meaning survives
- **tier 3 · keep** — essential motion; the motion IS the information

No other motion library tiers reduced motion as a first-class API. CSS-only consumers get the same tiers via `styles/vai-motion.css` media queries.

## Usage

### JS (zero dependencies, WAAPI-driven)

```js
import { waveformTrace, fieldBreath, markSettle, blockSettle, grainShift } from '@vai/motion';

// Plot an SVG path drawing itself
await waveformTrace.plotPath(document.querySelector('path'));

// Breathe an ambient field; returns a stop function
const stop = fieldBreath.loop(document.querySelector('.hero-bg'));

// Settle a logo mark (blur → sharp)
await markSettle.settle(document.querySelector('.logo'));

// Settle a set of blocks with contract stagger
await blockSettle.settleAll(document.querySelectorAll('.card'));

// Shift ambient grain over a surface
grainShift.apply(document.querySelector('.stage'));
```

### CSS-only (classes, keyframes, tiered media queries)

```html
<link rel="stylesheet" href="node_modules/@vai/motion/styles/vai-motion.css" />

<div class="vai-block-settle vai-block-settle--stagger">
  <div>…</div><div>…</div>
</div>
<div class="vai-field-breath">…</div>
```

## Contract backing

Every principle cites the designesy.org design-system contract (v0.4.0) — the machine-readable contract with 40 verification checks:

- **motion §ten_standards** — easing is deliberate; properties are explicit (transform/opacity only); entrances have opacity (never scale(0)); reduced-motion is handled
- **--duration tokens** — 150/250/350/400/600ms; UI stays ≤300ms unless justified
- **--ease tokens** — the four named cubic-beziers
- **Stagger** — 30–80ms interval between sequential items

## Provenance

- **Audit:** VAI aesthetic audit, 2026-08-09 — retired scan-beam, signal-sweep, and fake-liveness pulse for matching 3 named 2026 slop tells
- **Doctrine:** ONE authored moment per composition, not scattered identical entrances. Character-led motion (breathing/alive), not interface decoration.

## License

MIT — Designesy. Part of the [designesy-org](https://github.com/LE-VAI/designesy-org) monorepo.
