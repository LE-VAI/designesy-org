---
name: VAI Icons Design Contract
version: 1.0.0
updated: 2026-08-13
status: active
role: Contract surface for @vai/icons — animated icon library on authored principles
source_skillbase: D:\DESIGN
source_package: D:\DESIGNESY_PUBLIC\designesy-org\packages\vai-icons
peer_package: D:\DESIGNESY_PUBLIC\designesy-org\packages\vai-motion
contract: https://www.designesy.org/contract
design_tokens: D:\1ATLAS\docs\ATLAS_DESIGN_TOKENS.md
governs: every icon published from this package
---

# VAI Icons Design Contract

## Core Position

`@vai/icons` ships hand-authored, motion-bearing icons for the VAI command surface.

Each icon is a **named principle in motion** — a small gesture family with a contract.

Not animated Lucide. Not copy-paste tweens. **Each icon carries its own motion rationale.**

## The Principle System

Five named motion principles, inherited from `@vai/motion`:

| Principle | Description | Typical use |
|---|---|---|
| `waveform-trace` | data line that plots itself — signal arrives, then rests | signal, sync, retry |
| `field-breath` | ambient atmosphere breathes — slow opacity swell and release | idle, presence, notification |
| `mark-settle` | object resolves — blur-to-sharp iris settle, then stillness | logo, brand, app icon |
| `block-settle` | items settle left-to-right — staggered weighted drop | row stagger, toolbars, tab bars |
| `grain-shift` | ambient material drift — texture, not decoration | ambient layer under icon group |

## The Tier System

Each icon occupies exactly one **reduce tier**. The tier declares how the
icon must behave under `prefers-reduced-motion: reduce`.

| Tier | Strategy | Meaning |
|---|---|---|
| `tier1` | **REMOVE** | the motion was decoration; the static glyph carries the meaning |
| `tier2` | **SOFTEN** | collapse to ≤200ms, transform/opacity only; the meaning survives |
| `tier3` | **KEEP** | motion IS the meaning; do not collapse |

**The keystone test:** the tier system is real only if `tier3` is honored.
If `pulse-presence` were silently collapsed to a static dot under reduce,
the live indicator would lose its meaning, and every other tier contract
in the library would be negotiable.

`pulse-presence` is the keystone icon in v0.1.0. It is the contract.

## Public Surface

Three exports:

- `@vai/icons` — runtime (manifest, tier resolution, mount helpers)
- `@vai/icons/manifest` — the `_index.json` master list
- `@vai/icons/core` — same as root, framework-agnostic

Zero dependencies. Tree-shakeable. Peer dependency: `@vai/motion@^0.1.0`.

## Per-Icon Contract

For each shipped icon, the package ships:

1. **SVG source** — `icons/<name>.svg`, 24×24 viewBox, stroke-based, hand-authored geometry
2. **Motion contract** — `icons/<name>.motion.json`, the principle + tier + reduce strategy + rationale
3. **CSS keyframes** — `styles/vai-icons.css`, with the full per-icon duration AND a tiered `prefers-reduced-motion` block

Consumers can read the motion contract *without running the code*:

```json
{
  "name": "pulse-presence",
  "principle": "field-breath",
  "tier": "tier3",
  "reduce": "keep",
  "rationale": "..."
}
```

## Non-Negotiables

- **No generic decoration.** No rotation-or-pulse-on-hover as default.
  Every animation is the gesture of the object the icon represents.
- **No `prefers-reduced-motion` removal without a tier declaration.**
  Every icon must declare its tier in its motion.json sidecar.
- **No substituted VAI mark.** The `brand-mark` icon in this package is
  a generic focal placeholder. The VAI wordmark lives in
  `D:\VAI\BRAND_ACTIVE\logos\` and is a deterministic asset, not a glyph
  rendered from text.
- **No layout animation.** Animations use transform/opacity only.
- **No anonymous keyframes.** Every keyframe is named and traceable.

## Glyph Spec

| Property | Value |
|---|---|
| viewBox | `0 0 24 24` |
| stroke-width | `1.5` |
| stroke-linecap | `round` |
| stroke-linejoin | `round` |
| fill | `none` (stroke-only) |
| color | `currentColor` (consumer-driven) |
| grid origin | 24px (Lucide standard) |

## Anti-Patterns (rejected, with reasons)

| Pattern | Why rejected |
|---|---|
| Spin-on-hover for static icons | contract anti-pattern; matches the 2026 slop tell "fake-liveness pulse" |
| Continuous looping scan | every AI default does this; waveform-trace draws and rests |
| Tier3 collapse under reduce | erases meaning; breaks the keystone test |
| Animated V or letters as brand marks | per operator rule: brand marks are deterministic assets, not glyph substitutions |
| 5+ icons sharing the same gesture | gesture is principle-bound; if it fits more, the principle is too broad |

## Tiered Reduced-Motion Contract

The `prefers-reduced-motion: reduce` media query **must** implement the
declared tier for each icon. The audit recipe is simple: load the demo,
toggle the checkbox on the filter bar (`force reduce-motion`), and verify:

- tier1 icons animate once on mount then stop (or never animate)
- tier2 icons collapse to ≤200ms, transform/opacity only
- tier3 `pulse-presence` STILL pulses — at the slower rhythm and opacity-only

## License

MIT — Designesy. Part of the [designesy-org](https://github.com/LE-VAI/designesy-org) monorepo.
