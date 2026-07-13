# Pane tokens — progressive true glass

Lab Three material system. **Bend + dispersion, not fog.**

If the rim does not warp backdrop structure and split R/B slightly on Chromium, it is frost — not Pane.

## Tiers

| Tier | Name | When | Behavior |
|------|------|------|----------|
| 0 | Solid | `prefers-reduced-transparency` or no backdrop-filter | Opaque fill, no blur |
| 1 | Frost | Safari, Firefox | Blur + saturate + edge only |
| 2 | Refract | Chromium family | SVG `feDisplacementMap` + chromatic split; **no stacked heavy blur** |

Capability is written to `document.documentElement.dataset.paneTier`.

## CSS tokens

```css
--pane-fill: rgba(255, 255, 255, 0.045);
--pane-fill-raised: rgba(255, 255, 255, 0.06);
--pane-fill-solid: rgba(10, 10, 10, 0.96);
--pane-blur: 12px;          /* frost path only */
--pane-blur-soft: 8px;
--pane-saturate: 160%;
--pane-edge: rgba(255, 255, 255, 0.14);
--pane-edge-strong: rgba(255, 255, 255, 0.2);
--pane-highlight: rgba(255, 255, 255, 0.08);
--pane-inset: inset 0 1px 0 rgba(255, 255, 255, 0.12);
```

## Classes

| Class | Role |
|-------|------|
| `.pane-sheet` | Full-width chrome (topbar) |
| `.pane-card` | Raised card / field |
| `.pane-chip` | Pill / toggle shell |
| `.pane-lens` | Demo lens |
| `.pane-refract` | Opt-in true displacement at tier 2 |

## Optics

- Default profile: **rim** (steep edge, flat center)
- Snell–Descartes bend from surface slope, IOR 1.5, gain ~1.4–1.6
- Wide bezel (0.26–0.34 of min side) so bend is visible
- RG displacement maps, 128 neutral; display scale ~28–72px
- Chromatic filter: R/G/B displaced at 1.18× / 1× / 0.82× scale
- Delivered as **blob:** URLs for `feImage`
- Filters forced to **sRGB**
- **Never** stack large `blur()` on tier-2 refract — blur erases the bend

## Filter ids (tier 2)

- `#pane-sheet` · `#pane-card` · `#pane-chip` · `#pane-lens`

Mounted by `PaneRoot` in the root layout.

## Accessibility

- `prefers-reduced-transparency: reduce` → solid
- `prefers-reduced-motion` does not remove glass material
- Labels sit above the glass layer; only backdrop is filtered

## Production use

- Scrolled topbar: `.pane-sheet.pane-refract`
- Lab Three: high-contrast grid field at `/labs/pane`

## Provenance

- kube.io — Snell, bezel maps
- Outpace / Aave — blob maps, sRGB
- rdev — chromatic multi-pass displacement
- Designesy — progressive tiers; clear glass fill so bend is visible
