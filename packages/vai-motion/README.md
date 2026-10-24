# @vai/motion

Five authored, named motion principles from the VAI command surface. **Not components — principles.** Each one ships with its contract backing, its provenance (which audit produced it, what it replaced and why), and its reduced-motion tier.

The counter-library to AI-default motion: every AI generator produces scanner beams by default. These five are the authored alternative.

Not yet published to npm. Install it from a clone of this repo:

```bash
git clone https://github.com/LE-VAI/designesy-org.git
npm install ./designesy-org/packages/vai-motion
```

To see the five principles run, use `npm run demo` in `packages/vai-motion` and open http://localhost:4173. `npm test` runs the timing and easing tests (Node's built-in test runner, Node 18.13 or later, no dependencies).

## Why principles, not components

Component catalogs sell you a scroll reveal. VAI Motion sells you the *named principle* — with its contract entry, its anti-patterns, and its accessibility tiering. Where a component is copy-paste, a principle is *understand, then apply*.

## The five principles

| Principle | What it does | Tier |
|---|---|---|
| **waveform-trace** | A data line plots itself across the surface — signal arrives, then rests. Retired scan-beam/signal-sweep. | 1 · remove |
| **field-breath** | The ambient atmosphere breathes — a slow opacity swell. Background presence, never a demand. Retired the fake-liveness pulse. | 2 · soften |
| **mark-settle** | The mark resolves — blur-to-sharp iris settle. Arrive sharp, then rest. | 2 · soften |
| **block-settle** | Content blocks settle into place — one composed, weighted drop onto the grid. Not scattered identical entrances. | 2 · soften |
| **grain-shift** | Ambient grain shifts over the surface — material, not decoration. | 1 · remove |

## Tiered reduced-motion — first-class API

The industry default is a binary kill-switch (`prefers-reduced-motion: reduce` → every duration becomes 0.01ms). That obliterates meaning along with motion.

VAI tiers it:

```js
import { prefersReducedMotion, resolveDuration, REDUCED_MOTION } from '@vai/motion';

// tier 1 → 0ms (removed) · tier 2 → ≤200ms (softened, never longer than full) · tier 3 → full
const ms = resolveDuration('tier2', 600); // 200 under reduce, 600 full
```

- **tier 1 · remove** — decorative motion with no information; disabled entirely
- **tier 2 · soften** — ≤200ms, transform/opacity only; the meaning survives
- **tier 3 · keep** — essential motion; the motion IS the information

No other motion library tiers reduced motion as a first-class API. CSS-only consumers get the same tiers via `styles/vai-motion.css` media queries.

## Usage

### JS (zero dependencies; requestAnimationFrame-driven, except grain-shift, which adds CSS classes)

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

`settleAll` starts block i at `delay + i × stagger` ms (stagger 80 by default) and resolves when the last block lands, so three blocks at 600ms take about 760ms. Every block takes its from-state (opacity 0) at the call, so with many blocks the last one waits a while: 20 blocks keep the last one hidden for 1520ms. Under reduced motion the stagger and any `delay` you pass are dropped, and all blocks settle at once in 200ms: tier 2 promises 200ms or less, and the CSS layer does the same.

An option that is left out or passed as `undefined` takes its default. Numbers must be finite, and `duration` 0 or more; `'80ms'`, `null` or `NaN` is a `TypeError`.

`ease` takes `cubic-bezier(x1, y1, x2, y2)` with x1 and x2 in [0, 1], one of the CSS keywords `linear`, `ease`, `ease-in`, `ease-out`, `ease-in-out`, or a function of t that returns a finite number. The keywords are there for parity with CSS; the contract asks for the `EASE` tokens and rules out `ease-in` on UI motion. A bad option is a `TypeError` before any style is written: the returned promise rejects (`fieldBreath.loop` throws at the call). An ease function that stops returning a finite number partway stops the motion on that frame, and the promise rejects. There is no fallback curve, so a typo cannot quietly run a curve you did not choose.

A new run on an element stops the run already on it, on its next frame, and the older promise resolves. The stop function from `fieldBreath.loop` also takes effect on the next frame.

### CSS-only (classes, keyframes, tiered media queries)

```html
<link rel="stylesheet" href="node_modules/@vai/motion/styles/vai-motion.css" />

<div class="vai-block-settle vai-block-settle--stagger">
  <div>…</div><div>…</div>
</div>
<div class="vai-field-breath">…</div>
```

## Contract backing

Every principle cites the designesy.org design-system contract (v0.4.0), the machine-readable contract scored by the designesy.org verification engine:

- **motion §ten_standards** — easing is deliberate; properties are explicit (transform/opacity only); entrances have opacity (never scale(0)); reduced-motion is handled
- **--duration tokens** — 150/250/350/400/600ms; UI stays ≤300ms unless justified
- **--ease tokens** — the four named cubic-beziers
- **Stagger** — 30–80ms interval between sequential items

## Provenance

- **Audit:** VAI aesthetic audit, 2026-08-09 — retired scan-beam, signal-sweep, and fake-liveness pulse for matching 3 named 2026 slop tells
- **Doctrine:** ONE authored moment per composition, not scattered identical entrances. Character-led motion (breathing/alive), not interface decoration.

## License

MIT — Designesy. Part of the [designesy-org](https://github.com/LE-VAI/designesy-org) monorepo.
