# Designesy Contract Check (GitHub Action)

Score a URL against the **Designesy design-system contract** — 34 deterministic checks covering tokens, motion, accessibility, cadence, takt, and typography — and fail your workflow when the score or grade drops below your threshold. A design-contract quality gate for CI, exactly like a test threshold but for design compliance.

## Usage

```yaml
- uses: LE-VAI/designesy-org/action@main
  with:
    url: https://your-app.vercel.app
    min-score: 70      # fail if score < 70
    min-grade: C       # fail if grade is worse than C (D or F)
```

Gate a deploy preview on every pull request:

```yaml
name: design-contract
on: [pull_request]
jobs:
  score:
    runs-on: ubuntu-latest
    steps:
      - uses: LE-VAI/designesy-org/action@main
        with:
          url: https://preview-${{ github.event.number }}.your-app.vercel.app
          min-score: 60
```

## Inputs

| input | required | default | description |
|---|---|---|---|
| `url` | yes | — | URL to score against the design contract |
| `min-score` | no | `0` | Minimum acceptable score (0–100). `0` disables the score floor. |
| `min-grade` | no | `""` | Minimum letter grade: `A`, `B`, `C`, `D`, or `F`. Empty disables the grade floor. |
| `api` | no | `https://www.designesy.org` | Base URL of the scoring engine (`/api/score` is appended). |
| `fail-on-error` | no | `true` | Fail the step when the engine is unreachable. Set `false` to warn instead. |

Leave both `min-score` at `0` and `min-grade` empty to report the score without gating.

## Outputs

| output | description |
|---|---|
| `score` | Numeric design-contract score (0–100) |
| `grade` | Letter grade (`A`–`F`) |
| `pass-count` | Checks that returned PASS |
| `fail-count` | Checks that returned FAIL |
| `result` | Full scoring result as a JSON string (per-check breakdown + remediation) |

The step writes a markdown summary (score, grade, pass/warn/fail/skip, and the gate verdict) to the workflow **Job Summary** on every run.

## How it works

The Action calls the public Designesy scoring engine at `/api/score` — the same deterministic 34-check engine that powers [designesy.org](https://www.designesy.org). No LLM, no heuristics — each check is grounded in the published design-system contract and returns PASS/FAIL/WARN/SKIP with remediation guidance. An accessibility floor applies: accessibility below 60% caps the grade at C.

> The score engine is shared infrastructure; results are cached ~24h per URL. Be kind — gate on PRs that change your UI, not on every push.
