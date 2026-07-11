# Acoustic Tokens

> Designesy acoustic token system — the sound parallel to the visual token system in DESIGN.md §7.
> Version 0.1.0 · 2026-07-11 · Powered by [Cuelume](https://github.com/Danilaa1/cuelume) v0.1.0 (MIT)

## Purpose

Visual tokens name colors, spacing, and motion. Acoustic tokens name sounds and their interaction roles. Together they form a complete sensory system: what the eye sees and what the ear hears are both designed, both documented, both inspectable.

This document locks the Cuelume sound palette into Designesy doctrine. No sound appears on a Designesy surface without a token name and a rationale here.

## Token Reference

| Token            | Cuelume cue  | Character                       | Interaction role            | Where used                              |
| ---------------- | ------------ | ------------------------------- | --------------------------- | --------------------------------------- |
| `--cue:nav`      | `tick`       | Crisp instant tick              | Navigation and link hover   | Topbar nav links, wordmark, footer link |
| `--cue:action`   | `press`      | Dull muted knock                | Button pointer-down         | All CTAs (primary and ghost)            |
| `--cue:resolve`  | `release`    | Brighter springy tick           | Button pointer-up           | All CTAs (paired with `--cue:action`)   |
| `--cue:reveal`   | `bloom`      | Warm slow swell                 | Card hover (content reveal) | Pillar cards on homepage                |
| `--cue:list`     | `whisper`    | Breathy quiet swell             | Dense list item hover       | Principle items, surface cards          |
| `--cue:switch`   | `toggle`     | Mechanical click-clack          | State toggle                | Sound toggle button                     |
| `--cue:success`  | `success`    | Warm three-note confirmation    | Action completed            | Future: copy-to-clipboard, form submit  |

## Unused cues (reserved)

| Cuelume cue  | Reason for reservation                                  |
| ------------ | ------------------------------------------------------- |
| `chime`      | Default hover sound — overridden by `tick` everywhere. Reserved for future use if a softer hover is needed for non-nav elements. |
| `sparkle`    | Playful accent — no current surface earns it. Reserved for Labs experiments or interactive demos. |
| `droplet`    | Dismiss/collapse — no dismissible UI exists yet. Reserved for future collapsible sections or modal close. |

## Mapping rules

1. **One cue per interaction type.** Nav hover is always `tick`. Button press is always `press` + `release`. No per-page variation.
2. **Hover sounds are fine-pointer only.** Cuelume's `data-cuelume-hover` fires on `pointerenter` with mouse type only. Touch users never hear hover sounds.
3. **Toggle sounds fire on click.** This includes keyboard activation (Tab + Enter) and touch. Accessible by default.
4. **No ambient audio.** Cuelume is interaction-only. No background music, no mood beds, no loading sounds.
5. **Preference is user-owned.** Designesy stores the sound preference in `localStorage` under `designesy:sound`. Cuelume's `setEnabled()` applies it. Reduced-motion users default to sound off.
6. **Every cue must trace to this document.** If a sound appears in the markup without a token here, it is a contract violation.

## Accessibility

- **Reduced motion → sound off.** `prefers-reduced-motion: reduce` is treated as an acoustic-reduction proxy. The user can still enable sound manually via the toggle.
- **No focus sounds.** Sounds fire on pointer and click events, not on focus. Screen reader users navigate by focus and are not bombarded with hover cues.
- **Toggle is keyboard-accessible.** The sound toggle button uses `aria-pressed` and fires `data-cuelume-toggle` on click, which includes keyboard activation.
- **Silent fallback.** If Web Audio is blocked or unavailable, all sounds become no-ops. No errors, no degradation of visual experience.
- **Volume is not adjustable.** Cuelume synthesizes at fixed gain levels tuned for subtlety. If a user finds sounds too loud, they can mute via the toggle.

## Provenance

- Library: `cuelume@0.1.0` (MIT, Daniel Belyi)
- npm: https://www.npmjs.com/package/cuelume
- Repo: https://github.com/Danilaa1/cuelume
- Installed: 2026-07-11 in `designesy-org/apps/site`
- Consideration packet: `D:\1ATLAS\outputs\docs\2026-07-11_cuelume-interaction-sounds-consideration-packet.md`
- Visual token system: `DESIGN.md` §7
- Design intelligence gate (Interaction Design section): `DESIGN_INTELLIGENCE_GATE.md` (hardened 2026-07-11)