# Designesy Contract Check (GitHub Action)

Score a URL against the **Designesy design-system contract** — 40 deterministic checks covering tokens, motion, accessibility, cadence, takt, typography, and copywriting — and fail your workflow when the score or grade drops below your threshold. A design-contract quality gate for CI, exactly like a test threshold but for design compliance.

Supports **4 emission formats** so the result integrates with any downstream tool: `designesy` (default native shape), `canonical` (the [review-findings.json schema](https://www.designesy.org/specs/review-findings.json) — the standard for design verification findings), `review` (jakubkrehel better-interface markdown), and `google` (`@google/design.md`-compatible `{findings, summary, designSystem}`).

## Usage

```yaml
- uses: LE-VAI/designesy-org@v1
  with:
    url: https://your-app.vercel.app
    min-score: 70      # fail if score < 70
    min-grade: C       # fail if grade is worse than C (D or F)
```

Emit the canonical review-findings schema (for aggregation across multiple verifiers):

```yaml
- uses: LE-VAI/designesy-org@v1
  with:
    url: https://your-app.vercel.app
    format: canonical  # review-findings.json schema (see /specs/review-findings.json)
    min-score: 70
```

Gate a deploy preview on every pull request:

```yaml
name: design-contract
on: [pull_request]
permissions:
  contents: read
  pull-requests: write
jobs:
  score:
    runs-on: ubuntu-latest
    steps:
      - uses: LE-VAI/designesy-org@v1
        with:
          url: https://preview-${{ github.event.number }}.your-app.vercel.app
          min-score: 60
          post-comment: true   # posts a summary comment on the PR (default)
```

## Inputs

| input | required | default | description |
|---|---|---|---|
| `url` | yes | — | URL to score against the design contract |
| `min-score` | no | `0` | Minimum acceptable score (0–100). `0` disables the score floor. |
| `min-grade` | no | `""` | Minimum letter grade: `A`, `B`, `C`, `D`, or `F`. Empty disables the grade floor. |
| `format` | no | `designesy` | Emission format: `designesy` (native shape with score/grade/checks), `canonical` (review-findings.json schema), `review` (jakubkrehel markdown — no gating), `google` (design.md-compatible — no gating). |
| `api` | no | `https://www.designesy.org` | Base URL of the scoring engine (`/api/score` is appended). |
| `fail-on-error` | no | `true` | Fail the step when the engine is unreachable. Set `false` to warn instead. |
| `post-comment` | no | `true` | Post a summary comment on the pull request with the score and gate verdict. Only acts on `pull_request` events. Requires `pull-requests: write` permission. |
| `github-token` | no | `${{ github.token }}` | GitHub token for posting PR comments. Defaults to the auto-provisioned workflow token. |

Leave both `min-score` at `0` and `min-grade` empty to report the score without gating.

> **Note:** `format: review` and `format: google` return shapes that do not carry a numeric score/grade. The quality gate (min-score/min-grade) is automatically skipped for these formats — the result is emitted as the `result` output and Job Summary without gating.

## Outputs

| output | description |
|---|---|
| `score` | Numeric design-contract score (0–100). Available for `designesy` and `canonical` formats. |
| `grade` | Letter grade (`A`–`F`). Available for `designesy` and `canonical` formats. |
| `pass-count` | Checks that returned PASS (designesy/canonical formats). |
| `fail-count` | Checks that returned FAIL (designesy/canonical formats). |
| `result` | Full scoring result as a JSON string (or markdown text for `review` format). Format depends on the `format` input. |

The step writes a markdown summary (score, grade, pass/warn/fail/skip, and the gate verdict) to the workflow **Job Summary** on every run.

## How it works

The Action calls the public Designesy scoring engine at `/api/score` — the same deterministic 40-check engine that powers [designesy.org](https://www.designesy.org). No LLM, no heuristics — each check is grounded in the published design-system contract and returns PASS/FAIL/WARN/SKIP with remediation guidance. An accessibility floor applies: accessibility below 60% caps the grade at C.

When triggered on a `pull_request` event with `post-comment: true` (default), the action posts a summary comment on the PR with the score, grade, and gate verdict. This requires `pull-requests: write` permission in the workflow.

The canonical `review-findings.json` schema (at [/specs/review-findings.json](https://www.designesy.org/specs/review-findings.json)) is the standard format for design verification findings — one JSON envelope that designesy, Google `@google/design.md`, Lighthouse, and jakubkrehel/skills all map into. Use `format: canonical` when aggregating findings from multiple verifiers.

> The score engine is shared infrastructure; results are cached ~24h per URL. Be kind — gate on PRs that change your UI, not on every push.
