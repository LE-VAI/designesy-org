# Designesy Contract Check (GitHub Action)

Score a URL against the **Designesy design-system contract** — 40 deterministic checks covering tokens, motion, accessibility, cadence, takt, typography, and copywriting — and fail your workflow when the score or grade drops below your threshold. A design-contract quality gate for CI, exactly like a test threshold but for design compliance.

Supports **4 emission formats** so the result integrates with any downstream tool: `designesy` (default native shape), `canonical` (the [review-findings.json schema](https://www.designesy.org/specs/review-findings.json) — the standard for design verification findings), `review` (jakubkrehel better-interface markdown), and `google` (`@google/design.md`-compatible `{findings, summary, designSystem}`).

Now with **SARIF v2.1.0 output** for GitHub code-scanning integration and **baseline ratchet** to prevent design regressions.

## Usage

### Basic — score gate

```yaml
- uses: LE-VAI/designesy-org@v1
  with:
    url: https://your-app.vercel.app
    min-score: 70      # fail if score < 70
    min-grade: C       # fail if grade is worse than C (D or F)
```

### SARIF — code-scanning integration

Emit a SARIF file so design-contract findings appear in GitHub's native **Code scanning** dashboard alongside CodeQL and Dependabot alerts. Each FAIL/WARN check becomes a SARIF result; the scored URL is the alert location.

```yaml
name: design-contract
on: [pull_request]
permissions:
  contents: read
  pull-requests: write
  security-events: write   # required for SARIF upload
jobs:
  score:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: LE-VAI/designesy-org@v1
        with:
          url: https://preview-${{ github.event.number }}.your-app.vercel.app
          sarif-output: designesy-results.sarif
          post-comment: true
      - uses: github/codeql-action/upload-sarif@v4
        with:
          sarif-file: designesy-results.sarif
          category: designesy
```

### Baseline ratchet — prevent regressions

Commit a `.designesy-baseline.json` file to track your design score floor. The action fails when the score regresses below the baseline, and writes an updated baseline on improvement — so the floor only ever ratchets up.

```yaml
- uses: LE-VAI/designesy-org@v1
  with:
    url: https://your-app.vercel.app
    baseline: .designesy-baseline.json
```

The baseline file format:

```json
{
  "score": 72.5,
  "grade": "C",
  "date": "2026-08-04"
}
```

When the score improves (e.g. 72.5 → 78.0), the action overwrites the file with the new floor. Commit the updated baseline to lock in the improvement:

```yaml
- uses: LE-VAI/designesy-org@v1
  id: designesy
  with:
    url: https://your-app.vercel.app
    baseline: .designesy-baseline.json
- name: Commit improved baseline
  if: steps.designesy.outputs.score > steps.designesy.conclusion
  run: |
    git config user.name "designesy-bot"
    git config user.email "bot@designesy.org"
    git add .designesy-baseline.json
    git commit -m "chore: ratchet design baseline to ${{ steps.designesy.outputs.score }}"
    git push
```

### Full workflow — gate a deploy preview

```yaml
name: design-contract
on: [pull_request]
permissions:
  contents: read
  pull-requests: write
  security-events: write
jobs:
  score:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: LE-VAI/designesy-org@v1
        id: designesy
        with:
          url: https://preview-${{ github.event.number }}.your-app.vercel.app
          min-score: 60
          min-grade: D
          baseline: .designesy-baseline.json
          sarif-output: designesy-results.sarif
          post-comment: true
      - uses: github/codeql-action/upload-sarif@v4
        if: always()
        with:
          sarif-file: designesy-results.sarif
          category: designesy
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
| `sarif-output` | no | `""` | Path to write a SARIF v2.1.0 file. When set, the action writes a SARIF file for GitHub code-scanning. Upload with `github/codeql-action/upload-sarif@v4`. Only emitted for `designesy` format (carries per-check data). Empty disables. |
| `baseline` | no | `""` | Path to a committed baseline JSON file (`{ score, grade, date }`). Fails on regression, writes updated baseline on improvement. Empty disables the ratchet. |

Leave both `min-score` at `0` and `min-grade` empty to report the score without gating.

> **Note:** `format: review` and `format: google` return shapes that do not carry a numeric score/grade. The quality gate (min-score/min-grade) is automatically skipped for these formats — the result is emitted as the `result` output and Job Summary without gating. SARIF output is only available with `format: designesy` (default).

## Outputs

| output | description |
|---|---|
| `score` | Numeric design-contract score (0–100). Available for `designesy` and `canonical` formats. |
| `grade` | Letter grade (`A`–`F`). Available for `designesy` and `canonical` formats. |
| `pass-count` | Checks that returned PASS (designesy/canonical formats). |
| `fail-count` | Checks that returned FAIL (designesy/canonical formats). |
| `result` | Full scoring result as a JSON string (or markdown text for `review` format). Format depends on the `format` input. |
| `sarif-file` | Absolute path to the written SARIF file (only set when `sarif-output` is provided). |

The step writes a markdown summary (score, grade, pass/warn/fail/skip, gate verdict, baseline status, SARIF status) to the workflow **Job Summary** on every run.

## How it works

The Action calls the public Designesy scoring engine at `/api/score` — the same deterministic 40-check engine that powers [designesy.org](https://www.designesy.org). No LLM, no heuristics — each check is grounded in the published design-system contract and returns PASS/FAIL/WARN/SKIP with remediation guidance. An accessibility floor applies: accessibility below 60% caps the grade at C.

When triggered on a `pull_request` event with `post-comment: true` (default), the action posts a summary comment on the PR with the score, grade, and gate verdict. This requires `pull-requests: write` permission in the workflow.

### SARIF integration

When `sarif-output` is set, the action converts the 40-check results into a SARIF v2.1.0 file:

- Each check becomes a **rule** (with id, name, shortDescription, defaultConfiguration.level, tags, precision, help/remediation)
- Each FAIL check becomes an **error-level result**; each WARN becomes a **warning-level result**
- The scored URL is the **artifact location** (design checks inspect live pages, not source files)
- Stable `partialFingerprints` prevent duplicate alerts across runs

Upload the SARIF file to GitHub code-scanning with `github/codeql-action/upload-sarif@v4`. Design-contract findings appear in the same **Security > Code scanning** dashboard as CodeQL and Dependabot alerts — the first design system to integrate with GitHub's native alerting infrastructure.

The canonical `review-findings.json` schema (at [/specs/review-findings.json](https://www.designesy.org/specs/review-findings.json)) is the standard format for design verification findings — one JSON envelope that designesy, Google `@google/design.md`, Lighthouse, and jakubkrehel/skills all map into. Use `format: canonical` when aggregating findings from multiple verifiers.

### Baseline ratchet

When `baseline` is set, the action reads a committed JSON file and compares the current score:

- **Score improved** → writes an updated baseline file (the floor ratchets up). Commit the file to lock in the improvement.
- **Score unchanged** → no write (the floor holds).
- **Score regressed** → the step fails (regression detected). The baseline file is NOT overwritten — the floor stays.
- **Baseline file missing** → creates an initial baseline at the current score (first run).
- **Baseline file invalid** → warns and skips the ratchet (user-fixable).

> The score engine is shared infrastructure; results are cached ~24h per URL. Be kind — gate on PRs that change your UI, not on every push.
