# Haptic Tokens

> Designesy haptic token system — the touch parallel to acoustic tokens.
> Version 0.1.0 · 2026-07-12 · Powered by [web-haptics](https://www.npmjs.com/package/web-haptics) v0.0.6 (MIT)

## Purpose

Acoustic tokens name what the ear hears. Haptic tokens name what the hand feels on supported devices. Both are interaction-only, preference-owned, and silent when unsupported.

## Support detection

- Engine uses `WebHaptics.isSupported` (Vibration API).
- When unsupported, the haptics toggle **does not render** and all triggers are no-ops.
- No desktop debug audio (library `debug` stays off) — keeps chrome quiet on fine-pointer machines.

## Preference

| Key | Storage | Default |
| --- | --- | --- |
| `designesy:haptics` | `localStorage` | **on** when supported |

- `prefers-reduced-motion: reduce` defaults haptics **off** (same non-essential motion proxy as sound). User can still enable manually.
- Explicit `true` / `false` in storage always wins.

## Role map (cue → haptic)

| Acoustic cue / role | Haptic preset | When |
| --- | --- | --- |
| `press` | `light` | Pointer-down on actionable surfaces |
| `release` | `soft` | Default pointer-up |
| `success` | `success` | High-value resolve (Open CTA, Open/Kit cards) |
| `sparkle` (brand) | `selection` | Brand wordmark tap (coarse only) |
| `tick` (nav) | `selection` | Nav / wayfinding tap (coarse only) |
| `chime` (invite) | `soft` | Invite / machine tap |
| `toggle` | `rigid` | Preference toggle confirm |
| `droplet` (contact) | `soft` | Mail / contact tap |
| `bloom` (reveal) | `medium` | Lab / pillar reveal press |
| `whisper` (list) | `selection` | Dense list tap |

**Never used on chrome:** `buzz`, `error`, long patterns.

## Mapping rules

1. **Press/tap only.** No haptics on fine-pointer hover. Hover remains sound-only on desktop.
2. **Coarse taps** on hover-only targets (nav, brand) get one haptic paired with the mapped cue.
3. **One role family per contact** — do not stack multiple patterns on a single gesture.
4. **Preference is user-owned.** Designesy stores it; web-haptics only vibrates when enabled.
5. **Fail closed.** Unsupported API → no UI, no vibration, no errors.
6. **Every haptic must trace to this document.**

## Provenance

- Library: `web-haptics@0.0.6` (MIT, Lochie Axon)
- Vendored at `apps/site/vendor/web-haptics` (file dependency for lock-safe installs)
- Acoustic sibling: `docs/acoustic-tokens.md`
- Interaction binder: `app/lib/cuelume-binder.tsx` + `app/lib/haptics-engine.ts`
