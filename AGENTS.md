# Designesy Agent Rules

You are operating inside Designesy.

This is not a typical web project.

Designesy is design intelligence infrastructure.

## Core Understanding

Designesy turns:
sources → principles → contracts → tools → systems → better designed work

## Do Not

- Do not generate generic AI SaaS layouts.
- Do not assume this is a normal startup project.
- Do not build UI before structure and contracts exist.
- Do not invent design systems without source or rationale.
- Do not treat Labs as a blog or gallery.

## Always

- Start from purpose, context, and system role.
- Use contracts (DESIGN.md) before inventing decisions.
- Prefer structure over surface.
- Encode reusable rules instead of one-off styling.
- Separate observed facts from derived design decisions.
- Verify outputs when visual quality matters.

## Public Copy

- No em dashes in visible copy. A colon sits between a label and its
  description; a period, comma, semicolon or parentheses carries the rest; a
  middot joins a name to its descriptor.
- State the positive claim. Keep a negative when it carries a fact (a privacy
  guarantee, a scope limit, a prohibition, a disclaimer); rewrite "not X, but
  Y" pivots.
- Number ranges read "to" (5 to 10), in prose and in tables.
- Say a missing value in words. In a dense table use `NotMeasured` from
  `apps/site/app/lib/data/figure.tsx`: a dash for the eye, words for a screen
  reader.
- Quotations stay verbatim. Contract text changes only with its contract: the
  `*-contract.ts` modules and the `/contracts` pages move together.
- The build holds the line: `scripts/check-voice.js` fails a page that gains
  em dashes or pivots beyond `scripts/voice-baseline.json`, and
  `scripts/check-jsx-glue.js` fails a sentence that wraps so JSX glues two
  words together (add `{' '}` at the boundary).

## Contract Versions

- A published contract version names one content. A change to a value, role
  or rule in `apps/site/app/lib/design-system-contract.ts` ships with a raised
  `version` and an `adoption_history` entry for it, in the same pull request.
- The build holds the line: `scripts/check-contract-lock.js` hashes the
  contract's normative content and fails when the hash moves while `version`
  stays put. `scripts/design-system-contract.lock.json` records the pair.
- After a bump, refresh the lock from `apps/site`:
  `npm run update-contract-lock`. The refresh refuses to record a new hash
  under the old version, so the fix for a failing lock is always a bump.
- What the hash covers, and the metadata it leaves out (dates, history,
  provenance, addresses, the engine's check registry), is listed with reasons
  at the top of the gate.

## Workflow Expectation

1. Understand the system layer (docs/designesy)
2. Identify artifact type (contract, lab, review, system)
3. Build structure first
4. Then refine output
5. Then verify

## Output Standard

Work should feel:

- intentional
- structured
- system-aware
- non-generic
- extensible

If unsure, ask before proceeding.