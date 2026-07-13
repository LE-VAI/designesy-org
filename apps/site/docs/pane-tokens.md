# Pane tokens — progressive true glass

Lab Three material system. **Bend, not fog.**

## Tiers

| Tier | Name | When | Behavior |
|------|------|------|----------|
| 0 | Solid | `prefers-reduced-transparency` or no backdrop-filter | Opaque fill, no blur |
| 1 | Frost | Safari, Firefox, baseline capable | Blur + saturate + edge |
| 2 | Refract | Chromium family | SVG `feDisplacementMap` on backdrop + soft blur |

Capability is written to `document.documentElement.dataset.paneTier`.

## CSS tokens

```css
--pane-fill: rgba(8, 8, 10, 0.58);
--pane-fill-raised: rgba(12, 12, 14, 0.64);
--pane-fill-solid: rgba(10, 10, 10, 0.96);
--pane-blur: 14px;
--pane-blur-soft: 10px;
--pane-saturate: 145%;
--pane-edge: rgba(255, 255, 255, 0.09);
--pane-edge-strong: rgba(255, 255, 255, 0.14);
--pane-highlight: rgba(255, 255, 255, 0.045);
--pane-inset: inset 0 1px 0 rgba(255, 255, 255, 0.06);
```

## Classes

| Class | Role |
|-------|------|
| `.pane-sheet` | Full-width chrome (topbar) |
| `.pane-card` | Raised card / field |
| `.pane-chip` | Pill / toggle shell |
| `.pane-lens` | Soft demo lens |
| `.pane-refract` | Opt-in true displacement at tier 2 |

## Optics

- Squircle (default) / convex / lip / frost profiles
- Snell–Descartes bend from surface slope, IOR 1.5
- RG displacement maps, 128 neutral
- Delivered as **blob:** URLs for WebKit `feImage`
- Filters forced to **sRGB**
- Cached by shape key (`width×height×radius×bezel×profile×ior`)

## Filter ids (tier 2)

- `#pane-sheet`
- `#pane-card`
- `#pane-chip`
- `#pane-lens`

Mounted by `PaneRoot` in the root layout.

## Accessibility

- `prefers-reduced-transparency: reduce` → solid (tier 0 path)
- `prefers-reduced-motion` does **not** remove glass material (only motion)
- Text contrast is owned by fill opacity, not by the filter

## Production use (current)

- Scrolled topbar: `.pane-sheet.pane-refract`
- Lab Three demo: lens + card compare at `/labs/pane`

## Provenance (ingested, not copied)

- kube.io — Snell, squircle bezel, RG maps
- Outpace / Aave — blob maps, sRGB, architecture notes
- rdev liquid-glass-react — edge displacement patterns
- Designesy restraint — dark foundation, low scale, progressive tiers
