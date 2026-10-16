# designesy-score

> **Deprecated.** `designesy-score` is superseded by [`@designesy/score`](https://www.npmjs.com/package/@designesy/score), which runs the same 45-check engine. The `designesy-score` package on npm is deprecated: its last release, 1.0.5, carries an older engine and gets no updates.

## Use @designesy/score instead

```bash
npx @designesy/score designesy.org
npx @designesy/score linear.app --min-score 70 --min-grade B
npx @designesy/score vercel.com --format canonical --json
```

The flags are the same, except `--api`, which `@designesy/score` does not have. See [`packages/score/README.md`](../packages/score/README.md) for the full reference.

## Running this file from a clone

`cli/designesy-score.mjs` stays in the repo for existing users and for the `verify` subcommand, which `@designesy/score` does not have. It imports the engine from `packages/score/dist/`, which is not committed, so build the engine first:

```bash
npm --prefix packages/score ci
npm run build:score
node cli/designesy-score.mjs designesy.org
```

The engine runs locally, with no Designesy server: every check that needs no browser runs in-process, and the browser checks return MANUAL. Node built-ins only.

## Verify a DESIGN.md

Check whether a site serves a valid `/DESIGN.md` at its origin root.
Runs the v37 spec-layer check from the local engine.

```bash
node cli/designesy-score.mjs verify designesy.org
node cli/designesy-score.mjs verify linear.app --json
```

| Result | Meaning | Exit |
|---|---|---|
| **PASS** | `/DESIGN.md` served, linted clean (0 errors, 0 warnings) | `0` |
| **WARN** | `/DESIGN.md` served, lint warnings (0 errors) | `0` |
| **FAIL** | `/DESIGN.md` served, lint errors | `1` |
| **SKIP** | `/DESIGN.md` not served (no public convention requires it) | `0` |

This checks the **spec layer** (file format). For the full 45-check
design-system contract score, score the URL itself.

## Options

| Flag | Default | Description |
|---|---|---|
| `--format <f>` | `designesy` | Emission format: `designesy` (native), `canonical` (review-findings.json), `review` (markdown), `google` (design.md-compatible) |
| `--scope <s>` | `auto` | Scoring scope: `contract` (strict, penalizes absence), `universal` (fair, SKIPs optional features). `auto` detects Designesy tokens. |
| `--api <url>` | disabled | Remote fallback: send the URL to a scoring server instead of scoring locally. Also reads the `SCORE_API` env var. Off unless you set it. |
| `--min-score <n>` | `0` | Exit 1 if score < n. `0` disables the score floor. |
| `--min-grade <g>` | `""` | Exit 1 if grade is worse than g (`A`/`B`/`C`/`D`/`F`). Empty disables. |
| `--json` | off | Output raw JSON (no formatted report). |
| `--quiet` | off | Only output on failure. |
| `--help`, `-h` | n/a | Show help. |

## Exit codes

- `0`: score meets all gates (or no gates set)
- `1`: score below `--min-score`, grade worse than `--min-grade`, or engine error
- `2`: invalid arguments

## What it scores

The Designesy v0.4.7 design-system contract, with 45 deterministic checks across 14 weighted categories: tokens, motion, accessibility, cadence, takt, poise, identity, interaction, performance, responsive, semantic, security, spec, copywriting. No LLM in the loop: every check is a published, deterministic rule, so the same page gives the same verdicts.

See the [full methodology](https://www.designesy.org/methodology). The upgrade notes from 0.4.2 to 1.0.0 are in the [migration guide](../MIGRATION.md).

## Related

- [@designesy/score](https://www.npmjs.com/package/@designesy/score): the engine and CLI, current
- [@designesy/cli](https://www.npmjs.com/package/@designesy/cli): one CLI for tokens and score
- [GitHub Action](https://github.com/LE-VAI/designesy-org/tree/main/action): the same engine as a CI quality gate
- [MCP server](https://www.designesy.org/api/mcp): 17 tools for AI agents
- [Contract](https://www.designesy.org/contracts/design-system): the design-system contract
- [designesy.org](https://www.designesy.org)
