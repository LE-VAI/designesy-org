# Designesy

[designesy.org](https://www.designesy.org) — design intelligence infrastructure.

Designesy turns sources into principles, principles into contracts, and contracts into tools, systems, and artifacts that improve quality of life.

## Live

- **Site:** [designesy.org](https://www.designesy.org)
- **Contract:** [designesy.org/contracts/design-system](https://www.designesy.org/contracts/design-system)
- **Machine export:** [designesy.org/contracts/design-system.json](https://www.designesy.org/contracts/design-system.json)
- **AI Studio:** [designesy.ai.studio](https://designesy.ai.studio)
- **Labs:** [Poise](https://www.designesy.org/labs/poise) · [Takt](https://www.designesy.org/labs/takt) · [Cadence](https://www.designesy.org/labs/cadence) · [Acoustics](https://www.designesy.org/labs/acoustics)

## Contract verification

![Designesy Score](https://img.shields.io/badge/contract%20score-100%25-A%20grade-brightgreen)

The live site is verified against the design system contract — 23 automated checks with provenance back to tokens. Current score: **100% (Grade A)** — 19 passed, 0 failed, 7 skipped (browser-only checks).

Run the verification engine:

```bash
npx @designesy/mcp designesy_score --url https://www.designesy.org/
```

## Contract v0.3.0

- **23 verification checks** — token values, focus-visible, reduced-motion, contrast, press scale, font smoothing, rem scale, line-height, text-wrap, tabular-nums, ::selection, duration tokens
- **10 Non-Negotiable Motion Standards** — deliberate easing, explicit properties, opacity entrances, keyboard stillness, no layout animation, touch gating, bounded duration, reduced-motion paths, asymmetric press, no ease-in
- **10 acoustic cues** — custom `$type: sound` (net-new vs W3C DTCG 2025.10), Cuelume v0.1.0 engine, interaction-only
- **9 open tensions** — documented, not hidden
- **Spring physics** — default + momentum tokens via custom `$type: spring`
- **Machine-readable** — W3C DTCG 2025.10 format + custom extensions

See the [v0.3.0 release](https://github.com/LE-VAI/designesy-org/releases/tag/v0.3.0) for the full adoption history.

## Repository

This is the controlled public root for Designesy — a Next.js 15 App Router site (React 19, Turbopack, Vercel deploy).

```
apps/site          Next.js application
docs/designesy     context, architecture, logs, registries
DESIGN.md          the design contract (human-readable)
AGENTS.md          agent operating rules
```

## What Designesy is not

Designesy is not a template gallery. Designesy is not a generic AI design tool. Designesy is not a moodboard.

Designesy is a system.

## License

All rights reserved. The contract is public; the code is not open-source. See [designesy.org](https://www.designesy.org) for usage terms.