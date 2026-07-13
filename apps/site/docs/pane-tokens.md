# Pane tokens — progressive true glass

Lab Three. **Geometric rim bend + optional chroma, not fog.**

## Architecture (required)

```
.pane-surface.pane-refract
  ├─ .pane-backdrop   ← backdrop-filter + filter:url(#pane-*)
  └─ .pane-content    ← labels stay sharp
```

Never apply refraction to the same node as type.

## Tiers

| Tier | Name | When | Behavior |
|------|------|------|----------|
| 0 | Solid | reduced-transparency | Opaque fill |
| 1 | Frost | Safari / Firefox | Blur on backdrop layer only |
| 2 | Refract | Chromium | Light frost sample + SVG displacement on backdrop |

`document.documentElement.dataset.paneTier`

## CSS tokens

```css
--pane-fill: rgba(12, 12, 16, 0.28);
--pane-fill-raised: rgba(14, 14, 18, 0.32);
--pane-fill-solid: rgba(10, 10, 10, 0.96);
--pane-blur: 12px;
--pane-saturate: 155%;
--pane-edge: rgba(255, 255, 255, 0.12);
--pane-highlight: rgba(255, 255, 255, 0.07);
--pane-inset: inset 0 1px 0 rgba(255, 255, 255, 0.1);
```

## Components

- `PaneRoot` — mounts `#pane-sheet|card|chip|lens` filters
- `PaneSurface` — layered shell (`kind`: sheet/card/chip/lens)

## Optics

- Rim-weighted RG map, blob: URL, sRGB filters
- Chromatic R/G/B scales ~1.3× / 1× / 0.7×
- `primitiveUnits=userSpaceOnUse` + pixel displacement scale

## Production

- Scrolled topbar: layered `.pane-sheet.pane-refract`
- Lab: `/labs/pane`
