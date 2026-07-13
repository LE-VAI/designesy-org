# Acoustic Tokens

> Designesy acoustic token system — the sound parallel to the visual token system in DESIGN.md §7.
> Version 0.1.1 · 2026-07-12 · Powered by [Cuelume](https://github.com/Danilaa1/cuelume) v0.1.0 (MIT)

## Purpose

Visual tokens name colors, spacing, and motion. Acoustic tokens name sounds and their interaction roles. Together they form a complete sensory system: what the eye sees and what the ear hears are both designed, both documented, both inspectable.

This document locks the Cuelume sound palette into Designesy doctrine. No sound appears on a Designesy surface without a token name and a rationale here.

## Token Reference

| Token | Cuelume cue | Character | Interaction role | Where used |
| --- | --- | --- | --- | --- |
| `--cue:brand` | `sparkle` | Bright playful accent | Brand wordmark contact | Hero wordmark, topbar logo, footer mark, Open field card hover |
| `--cue:nav` | `tick` | Crisp instant tick | Navigation and wayfinding | Topbar nav links, surface footer links, secondary CTAs |
| `--cue:invite` | `chime` | Soft default chime | Primary invitation / machine surfaces | Primary hero CTA hover, kit field card, machine footer links |
| `--cue:action` | `press` | Dull muted knock | Pointer-down on actionable surfaces | Buttons, field cards, surface cards |
| `--cue:resolve` | `release` | Brighter springy tick | Pointer-up default resolve | Most buttons and cards |
| `--cue:complete` | `success` | Warm three-note confirmation | High-value resolve | Primary Open CTA release, Open/Kit field card release |
| `--cue:reveal` | `bloom` | Warm slow swell | Content / experiment reveal | Pillar cards, Lab field card hover |
| `--cue:list` | `whisper` | Breathy quiet swell | Dense list / surface scan | Surface cards, principle rails, dense lists |
| `--cue:switch` | `toggle` | Mechanical click-clack | State toggle | Sound preference button |
| `--cue:contact` | `droplet` | Soft dismissive droplet | Contact / outbound mail | Footer mail, privacy mail |

## Reserved / situational

| Cuelume cue | Notes |
| --- | --- |
| `chime` | Also the library default hover fallback. Used intentionally for invite/machine surfaces. |
| `droplet` | Used for mail/contact. Still reserved for future dismiss/collapse UI. |

## Mapping rules

1. **Brand marks earn `sparkle`.** Hero wordmark, topbar logo, and footer mark are brand contact — not generic nav ticks.
2. **One primary cue family per role.** Nav stays `tick`. Brand stays `sparkle`. Dense lists stay `whisper`. Do not randomize per page without updating this document.
3. **Hover sounds are fine-pointer only upstream.** Cuelume's `data-cuelume-hover` fires on `pointerenter` with mouse type only. On coarse/touch pointers, Designesy's binder maps the same hover cue to a single tap (`click`) so nav and brand marks still acknowledge contact.
4. **Press/release on touch.** Upstream Cuelume marks press/release mouse-only. Designesy's binder plays the same cues on touch/pen `pointerdown` / `pointerup`.
5. **Toggle sounds fire via preference hook.** The sound button does **not** use `data-cuelume-toggle` (capture-phase play ran before enable flipped). `useSoundPreference` calls `setEnabled` then `play('toggle')`.
6. **No ambient audio.** Cuelume is interaction-only. No background music, no mood beds, no loading sounds.
7. **Preference is user-owned.** Designesy stores the sound preference in `localStorage` under `designesy:sound`. Cuelume's `setEnabled()` applies it. Reduced-motion users default to sound off.
8. **Audio unlock on first real cue.** Mobile Safari keeps `AudioContext` suspended until a user gesture. The first `play()` during that gesture resumes the engine.
9. **Every cue must trace to this document.** If a sound appears in the markup without a token here, it is a contract violation.

## Accessibility

- **Reduced motion → sound off.** `prefers-reduced-motion: reduce` is treated as an acoustic-reduction proxy. The user can still enable sound manually via the toggle.
- **No focus sounds.** Sounds fire on pointer and click events, not on focus. Screen reader users navigate by focus and are not bombarded with hover cues.
- **Toggle is keyboard-accessible.** The sound toggle button uses `aria-pressed` and plays via the preference hook on click (includes keyboard activation).
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
- v0.1.1: brand sparkle, invite chime, complete success, contact droplet variety pass
