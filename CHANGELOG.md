# Changelog

All notable changes to `designesy-score` are documented here.
Format based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/).

## [Unreleased]

## [1.13.0] — 2026-10-08

Released together: **designesy-mcp 1.13.0** (PyPI, MCP registry) and
**@designesy/score 0.6.0** (npm). The entries below were merged since 1.12.2.
Headlines: engine 1.1.0 (v05, v27, v14/v18 tiering, the 13-type DTCG list) now
ships in the npm CLI's bundled engine; the PyPI `designesy_score` tool passes
`format` and `scope` through to the engine and identifies itself as
`designesy-mcp/1.13.0`.

### Changed

- **`@designesy/score` 0.5.0 — the standalone engine is converged with the site
  engine; no known debt remains.** The two hand-maintained copies of the 42-check
  engine had 13 unported fixes, so the CLI and the site could score the same page
  differently. All 13 are ported (#169) and the drift baseline is down from 15
  divergences to 4 — all genuine transport splits (`route.ts` attaches a receipt
  and takes a `Date`; the package fetches via an SSRF-guarded `httpsFetch`).
  Behaviour that changes for CLI users:

  - **v38** — `aria-hidden` subtrees are stripped before text extraction (tag
    removal used to FUSE neighbouring text into strings nobody wrote), a 1–2
    character label falls back to its `aria-label`, and selection controls
    (`aria-pressed`, `role="radio"`, `<button name= value=>`) are no longer read
    as non-verb commands. Icon-only buttons and radio groups stop failing.
  - **v37** — returning `PASS` when the `@google/design.md` linter was not
    installed **asserted validation that never ran**. It now returns `WARN`, and
    distinguishes "linter missing" from "linter threw", which need different fixes.
  - **v26, S2, S8, S9, S11, S12** — font-family and slop checks now match the
    site: the grid-pattern exemption accepts `color-mix()`/`var()`/hex stops in
    either order (a hairline-grid background was flagged at severity 5), and the
    slop checks are suppressed on a page that *documents* the rules, which
    previously cost points for publishing one's own rule registry.
  - **Alias resolution** — an alias resolving to an empty string no longer stops
    the search, so a later alias with a real value is still used.
  - **`emitReview`** — an all-`SKIP` result printed **"Approve"** for a page
    nothing had evaluated. It now reads "Not scored".

  **Public API (additive):** `deriveVerdict` and `statusToSeverity` are exported.
  The verdict rule is now shared by every emission format so they cannot disagree
  about the same result. Nothing was removed.

  **Guard added:** the source-drift gate also pins the package's exported
  surface. Its body comparison drops the `export` keyword by design (a route and
  a package legitimately differ on it), which made an accidental API change
  invisible — verified directly, then covered by a test with its own control.

### Fixed

- **Engine 1.1.0 (2026-10-08): four baseline defects fixed; 21 of the 30
  leaderboard sites change at least one verdict.** `ENGINE_VERSION` is now
  `1.1.0`, so every result and receipt scored from here on names the build that
  produced it. Both engine copies (`apps/site/app/api/score/route.ts` and
  `packages/score/src/engine.ts`) carry the identical change; the source-drift
  gate reports them in agreement.

  - **v05: motion gated behind `prefers-reduced-motion: no-preference` passes.**
    Declaring motion only inside a `no-preference` block is a recommended way to
    honour reduced motion, because a user who asked for less never receives it.
    Engine 1.0.0 accepted only a `reduce` block and WARNed this pattern. The block
    has to opt into motion: an animation, a transition, smooth scrolling or a view
    transition. An empty block still WARNs, and so does a block that only switches
    motion off (the `reduce` kill switch filed under the wrong query, which stills
    motion for users with no preference and leaves it running for users who asked
    for less). The existing regression fixture `broken-reduced-motion-inverted`
    pins that last case and still reads WARN.
  - **v27: a page with no field to zoom into reads SKIP.** When the CSS shows
    neither a sub-16px input rule nor a 16px floor, a page whose HTML carries no
    text input, textarea or select now reads SKIP, as v38 already does for a page
    with no buttons. It used to read WARN. Inputs that take no typed text (hidden,
    checkbox, radio, submit, button, reset, image, file, range, color) do not
    count as fields. A sub-16px input rule still FAILs and a declared floor still
    PASSes, on any page.
  - **v14 and v18 move to Tier 2.** Both encode Designesy Cadence taste (the
    Cadence umbrella rule set, and `text-wrap: balance` plus `pretty`) yet sat in
    Tier 1, so `scope=universal` WARNed external sites for not adopting them.
    Their absence now reads SKIP under `scope=universal`, the treatment v15, v19,
    v20 and x01 to x03 already receive. `scope=contract`, which designesy.org is
    scored under, is unchanged.
  - **MCP DTCG validator (t06, t07): the type list is the 13 types DTCG 2025.10
    defines.** `cubicBezier` was missing, so a conformant easing token WARNed on
    t06 and t07. Seven names the format does not define (`string`, `boolean`,
    `link`, `borderStyle`, `borderWeight`, `radius`, `spacing`) were accepted as
    standard. Fixed in the hosted endpoint (`apps/site/app/api/mcp/route.ts`) and
    in the Python package, whose tests now assert that the two lists are equal.
    This tool is separate from the site score, so no leaderboard verdict moves
    with it. `packages/tokens` keeps its own 15-type list (it also accepts
    `string` and `boolean`) and is untouched by this release.

  **Leaderboard impact, measured.** The HTML and CSS of every seed site in
  `apps/site/app/leaderboard/seed.ts` were fetched once on 2026-10-08 through the
  package engine's fetch path, then scored by engine 1.0.0 and engine 1.1.0 on
  the same bytes, with the live DESIGN.md probe (v37) enabled. 27 of 30 sites
  were reachable; nytimes.com, getdesy.com and cssdesignawards.com were not,
  which matches their held-over flags in `seed.ts`. 21 sites change at least one
  verdict: v14 on 19 sites, v18 on 17, v27 on 10 and v05 on 1. No other check
  moves. Six sites move nothing: linear.app, vercel.com (a), stripe.com,
  www.designesy.org, github.com and x.com (a). The live leaderboard keeps its
  1.0.0 scores until its next weekly re-score.

  | Site | Check: 1.0.0 → 1.1.0 | Score: 1.0.0 → 1.1.0 | Delta | Grade |
  |---|---|---|---|---|
  | apple.com | v14 WARN → SKIP; v18 WARN → SKIP | 82.1 → 83.1 | +1.0 | B |
  | mozaika.design | v14 WARN → SKIP; v18 WARN → SKIP; v27 WARN → SKIP | 62.8 → 64.3 | +1.5 | D |
  | designesy.ai.studio | v14 WARN → SKIP; v18 WARN → SKIP; v27 WARN → SKIP | 74.8 → 76.8 | +2.0 | C |
  | stitch.withgoogle.com | v14 WARN → SKIP; v18 WARN → SKIP; v27 WARN → SKIP | 61.2 → 63.5 | +2.3 | D |
  | zeroheight.com | v18 WARN → SKIP | 70 → 70 | 0 | C |
  | roastbyai.com (a) | v14 WARN → SKIP; v18 WARN → SKIP | 72.2 → 74.7 | +2.5 | C |
  | atlassian.design (a) | v14 WARN → SKIP; v18 WARN → SKIP; v27 WARN → SKIP | 89.1 → 91.9 | +2.8 | B → A (b) |
  | primer.style | v27 WARN → SKIP | 82.4 → 84.1 | +1.7 | B |
  | carbondesignsystem.com | v14 WARN → SKIP; v18 WARN → SKIP | 67.8 → 69.3 | +1.5 | D |
  | spectrum.adobe.com | v14 WARN → SKIP; v18 WARN → SKIP; v27 WARN → SKIP | 63.5 → 65.1 | +1.6 | D |
  | m3.material.io | v14 WARN → SKIP; v18 WARN → SKIP; v27 WARN → SKIP | 67.6 → 66.4 | -1.2 | D |
  | radix-ui.com | v05 WARN → PASS; v14 WARN → SKIP | 63.2 → 65.2 | +2.0 | D |
  | geist.dev | v14 WARN → SKIP; v18 WARN → SKIP; v27 WARN → SKIP | 62.0 → 64.4 | +2.4 | D |
  | plex.ibm.com | v14 WARN → SKIP; v18 WARN → SKIP | 58.3 → 56.8 | -1.5 | F |
  | awwwards.com (a) | v14 WARN → SKIP; v18 WARN → SKIP | 70 → 70 | 0 | C |
  | fwa.org | v14 WARN → SKIP; v18 WARN → SKIP; v27 WARN → SKIP | 48.0 → 47.9 | -0.1 | F |
  | pentagram.com | v14 WARN → SKIP | 56.3 → 56.6 | +0.3 | F |
  | vam.ac.uk | v14 WARN → SKIP; v18 WARN → SKIP | 70 → 70 | 0 | C |
  | notion.so | v14 WARN → SKIP | 65.0 → 65.5 | +0.5 | D |
  | figma.com | v14 WARN → SKIP; v18 WARN → SKIP; v27 WARN → SKIP | 76.6 → 79.4 | +2.8 | C |
  | wikipedia.org | v14 WARN → SKIP; v18 WARN → SKIP | 80.7 → 83.0 | +2.3 | B |

  (a) On the captured bytes, engine 1.0.0 does not reproduce this site's live
  2026-10-08 score (live: vercel.com 79.6, roastbyai.com 71.2, atlassian.design
  86.1, awwwards.com 70.3, x.com 87.8), so the page or the fetch differed from the
  weekly run. The verdict moves and deltas in these rows hold for the captured
  bytes; the live values are not measured. The other 22 reachable sites reproduce
  their live 1.0.0 score exactly. www.designesy.org shows one PASS fewer than
  live at the same score, because the package engine reports v37 as MANUAL where
  the hosted engine runs the DESIGN.md linter.
  (b) The grade change rests on a 1.0.0 score of 89.1 that the live run did not
  reproduce: live, atlassian.design scored 86.1 with one more FAIL. Whether its
  live grade moves is not measured.

  Scores can fall. Removing a WARN (half credit) from a category that averages
  below half credit lowers that category, which is why m3.material.io,
  plex.ibm.com and fwa.org drop. A score that holds at 70 (zeroheight.com,
  awwwards.com, vam.ac.uk) is held by the accessibility floor, which caps any
  site whose accessibility category is below 60% at 70.

  The calibration corpus grows from 18 fixtures to 25 (corpus 1.2.0): fixtures
  that held each old wrong verdict, plus controls that keep the verdicts the
  fixes must not move. Fourteen existing fixtures change their counts: thirteen
  universal-scope fixtures because v14 and v18 now SKIP on them, and
  `edge-empty-page` because it has no field and v27 now SKIPs. Every pinned
  verdict still holds. `packages/score/test/engine-1-1-0.test.mjs` pins the edges
  of each rule.

- **`designesy-score` 1.0.5 (npm CLI): the v07 label no longer names an internal
  project.** 1.0.4 was built from a branch that never merged and printed a
  control-plane name in the v07 `item` on every run. 1.0.5 is built from `main`,
  where v07 reads `Semantic HTML foundation: single h1, title, meta description,
  landmark`, and the check function is renamed to `checkSemanticHtmlFoundation`
  in both engine copies so the shipped `engine.js` carries no trace of it. The
  CLI banner now reads its version from `package.json` (it said v1.0.0 through
  1.0.4) and counts 42 checks, not 40. The package stays deprecated in favour of
  `@designesy/score`.

- **Standalone `@designesy/score` engine re-synced to the site engine** (v0.3.0).
  37 of 40 check functions had drifted from the canonical `apps/site` engine —
  5 wrong category assignments (v03 accessibility→interaction, v05
  accessibility→motion, v20/v26 identity→cadence, v27 responsive→
  accessibility) and 32 stale check implementations (v10 takt, v34 AI
  disclosure, v38 button-verb, v39 trailing-period, v11/v19 semantics, and
  more). Before: the CLI scored designesy.org 88.5 B while the site engine
  scored it 93 A. After: identical scores and per-check statuses verified on
  three URLs (designesy.org 93 A, linear.app 67.7 D, example.com 63.3 D
  universal) — 0 diffs across all 42 checks on each. The v37 DESIGN.md check
  keeps its deliberate npm-runtime adaptations (SSRF-safe httpsFetch,
  optional-linter fallback).

## [1.12.2] — 2026-09-28

### Fixed

- **The published package now names the org, not a person.** `pyproject.toml`
  declared a personal name in `authors`, and PyPI renders that as
  `author_email` on the project page. The npm packages moved to
  `Designesy <hello@designesy.org>` in the same change, so the artifacts now
  agree. Registry metadata is immutable per published version, which is why this
  needs a release rather than an edit: 1.12.1 still carries the old field.
- **The sdist LICENSE now reads `Copyright (c) 2026 LE-VAI`**, matching the
  licence holder used across the other packages. The bundled copy had drifted.

## [1.12.0] — 2026-08-30

### Added

- **Semantic category wired: v42 + v43.** The `semantic` category carried a
  reserved weight (12) since v0.3.0 with zero checks returning it — dead
  weight in the engine's category table. Two deterministic checks now score
  it:
  - **v42 — Semantic color vocabulary:** classifies every color-valued token
    in :root as role-named (ink, paper, surface, danger, success, accent…)
    vs hue-named (blue, slate, amber, -500 scales…). PASS at ≥60% role share
    with ≥3 distinct roles. Grounded in the contract's own role-named
    palette (--ink, --paper, --surface, --signal, --ok/--warn/--error) and
    role-based naming best practice (zeroheight naming guide, Material 3).
  - **v43 — Semantic status colors:** checks status-state coverage
    (ok/success, warn/warning, error/danger, info/notice) among color token
    names. PASS at ≥3 of 4 families.
  Both checks are WARN-only (style craft, not user harm) per the engine's
  calibration precedent, self-SKIP when a site has no color tokens, and are
  site-agnostic (no scope-tier registration needed). Wired identically in
  the standalone `@designesy/score` engine to keep CLI/site parity.
- **Engine grows 40 → 42 checks.** The semantic category's weight 12 now
  enters the weighted denominator (6 per check). The methodology page's
  reserved-weight note is replaced with the live category description, and
  all engine-count copy is true-upped to 42 (READMEs, MCP tool descriptions,
  leaderboard, pricing, badge, CLI packages); historical surfaces (blog
  studies, dated compliance reports, changelog entries for past releases)
  intentionally keep their original counts.

### Fixed

- **The weekly-leaderboard write path was rotted three ways** (all fixed
  2026-08-30): rescore workflow died on a missing `leaderboard` label before
  opening its PR (labels now created idempotently in-workflow); the seed
  writer regenerated seed.ts from a stale template, stripping
  `liveScoreUrl`/`coiDisclosure` fields added after the last successful run
  (rewritten as a surgical field-preserving editor); and branch protection
  required status contexts in `CI / <job>` form that never matched the bare
  check-run names GitHub Actions reports (corrected to bare names). First
  fully-working weekly cycle lands with this release.

## [1.11.1] — 2026-08-30

### Added

- **/DESIGN.md served at site root** (Google DESIGN.md convention). The score
  engine's v37 spec-layer check now validates the live file with Google's
  @google/design.md linter (0 errors, 0 warnings) instead of SKIPping.
- **/DESIGN.md added to sitemap** and the post-deploy smoke assertions.

### Fixed

- **v37 serverless regression: @google/design.md linter ENOENT at Lambda
  runtime.** Next's bundler inlined build-machine absolute paths into the
  server bundle, so the dynamic import failed in production. The package is
  now externalized (serverExternalPackages) and traced into the /api/score
  Lambda zip (outputFileTracingIncludes).
- **Vercel alias flip missed on the 3845983 build** (integration glitch) —
  production briefly kept serving the prior build until a manual promote.

### Changed

- **Accuracy true-up, AnySearch-verified:** v24 target-size citation
  corrected to WCAG 2.5.5 Target Size (Enhanced) with the 2.5.8 24px AA
  minimum stated alongside; APCA Lc role mapping corrected (Lc 75 body
  minimum, Lc 90 body preferred, Lc 60 non-body); 84% token-adoption stat
  attributed to zeroheight Design Systems Report 2025; axe-core pinned
  4.12.1 → 4.13.0 across 17 pins; Belitsoft citation named exactly
  (State of React Development 2026).
- **Count true-up:** 23 packages, 17 MCP tools, 10 machine exports, 40
  checks across READMEs, open.json.cache, and the single-source check
  registry (lib/check-definitions.ts).
- **Live self-score: 93 A** (37 pass / 0 fail / 0 warn / 0 skip / 3 manual).

## [1.0.4] — 2026-08-15

### Fixed

- **v13 check: false FAILs from decorative animations.** The press-scale check
  extracted ALL `scale()` values from the entire CSS and used `:active` only as a
  boolean gate. Decorative `@keyframes` animations (`scale(0.3)` for checkmark
  pop-in, `scale(0.001)` for ripple start, `scale(0.85)` for spinner pulse) were
  incorrectly flagged as press-feedback failures. The check now extracts `scale()`
  values only from inside `:active` rule bodies, eliminating 9 false positives.
- **v27 check: false FAILs from unit blindness and substring matching.** The
  input font-size check dropped the CSS unit (`1rem` became `1`, compared against
  `16` as px) and matched "input" as a substring inside class names (`.cmdk-input`,
  `.score-url-input-inner`). The check now captures and converts units (rem/em × 16
  = px) and requires element selectors at selector boundaries. Eliminates 6 false
  positives.

### Changed

- **Real CSS fix: `.score-search-input` font-size raised from 0.8rem to 1rem.**
  The score page check search input was at 12.8px, which triggers iOS Safari
  auto-zoom on focus. Now at 16px (1rem), the WCAG 2.5.8 floor.
- **Dependabot ignore blocks added** for `next`, `eslint`, `eslint-config-next`,
  and `typescript` major version bumps. These require migration work (Next 16
  removes `next lint`, TS 6 requires CSS module declarations) and will be handled
  in a dedicated session. Minor/patch updates still flow.

## [1.0.3] — 2026-08-15

### Fixed

- **Critical: safeLookup did not honor `options.all` (Node v24 regression).**
  Node v24's `net` layer passes `{ all: true }` to the custom `lookup` function,
  expecting the callback to receive an array of `{ address, family }` objects.
  The previous `safeLookup` always returned a single `(address, family)` tuple,
  causing `ERR_INVALID_IP_ADDRESS: Invalid IP address: undefined` on every fetch.
  This made every `httpsFetch` fail silently, returning empty HTML/CSS, which
  caused all CSS-text and token-based checks to report false FAILs/WARNs against
  empty input (0 tokens extracted, no `<h1>` found, no `:focus-visible` found,
  no `prefers-reduced-motion` found, no duration tokens found).
  The fix: `safeLookup` now checks `options.all` and returns an array when true.
  Impact: designesy.org contract score went from 59.4 F (0 tokens) to 78.1 C
  (146 tokens extracted) with the same source CSS — the engine was blind, not
  the site.

## [1.0.2] — 2026-08-14

### Security

- **DNS rebinding SSRF mitigation (TOCTOU-safe).** The SSRF guard now validates
  resolved IP addresses *inside the connection path* via a custom `lookup`
  function (`safeLookup`). This eliminates the time-of-check/time-of-use race
  (CWE-367) that made the previous resolve-then-fetch approach vulnerable to
  DNS rebinding attacks. A hostname like `localtest.me` (which resolves to
  `127.0.0.1`) is now blocked before the socket connects. References: OWASP
  SSRF Prevention Cheat Sheet (DNS pinning), CVE-2026-27826.

### Added

- **`node:test` automated test suite (36 tests, zero dependencies).** Three
  test files covering SSRF guard unit tests (12), scoring engine contract
  tests (8), CLI integration tests (8), and engine parity tests (4). Uses
  `node --test` discovery with `node:assert/strict`. Run via `npm test` in
  `packages/score`.
- **Engine parity test.** Compares the npm engine output against the live
  `designesy.org/api/score` endpoint — catches structural drift (check IDs,
  check count, grade) and score drift (> 5 points triggers a sync warning).

### Changed

- **`@designesy/cli` path resolution refactored.** Replaced the 6-candidate
  filesystem path heuristic with `createRequire(import.meta.url).resolve()`,
  which uses Node's built-in module resolution. Handles npm flat-hoisting,
  pnpm virtual stores, and yarn PnP correctly. Bumped to 0.2.0.
- **`@designesy/score` bumped to 0.2.0.** Includes the safeLookup fix and
  test suite.

## [1.0.1] — 2026-08-14

### Fixed

- **SSRF redirect bypass (critical).** The SSRF guard now re-validates every HTTP
  redirect target with `isValidUrl()` before following it. Previously, only the
  initial URL was validated — an attacker could redirect from a safe URL to
  `http://169.254.169.254/` (AWS IMDS) and the engine would follow it. The
  CHANGELOG previously claimed "SSRF guard runs on every fetch, including
  redirect hops" — this is now actually true.
- **CHANGELOG links fixed.** Version comparison links now point to the correct
  monorepo tag names (`designesy-score@1.0.0` instead of `v1.0.0`).

### Added

- **Runtime deprecation warning.** Using `--api` or `$SCORE_API` now emits a
  `DeprecationWarning` to stderr, directing users to the local engine.
- **MIGRATION.md shipped in tarball.** The migration guide is now included in the
  npm package so users who install via npm can read it without visiting GitHub.

## [1.0.0] — 2026-08-14

### ⚠️ BREAKING CHANGES

- **Local engine by default.** The CLI now runs the full 40-check scoring engine
  locally — no server required. In 0.x, the CLI POSTed to `https://www.designesy.org/api/score`.
  In 1.0.0, it fetches the target URL, extracts CSS + `:root` tokens, and runs
  all 40 checks in-process. Zero dependencies (Node built-ins only).

- **`--api` is now a remote fallback.** The `--api <url>` flag and `$SCORE_API` env var
  still work, but they now opt INTO the old remote API client mode instead of being
  the default. If you relied on the remote server, add `--api https://www.designesy.org`
  or set `SCORE_API=https://www.designesy.org` to restore the pre-1.0.0 behavior.

- **New `--scope` flag.** `--scope contract` (strict — all checks penalize absence,
  default for designesy.org) or `--scope universal` (fair to external sites — optional
  features SKIP on absence). Default is `auto` (detects whether the site declares
  Designesy tokens). [NEW in 1.0.0]

- **Report includes anti-slop + originality.** The formatted report now shows
  anti-slop deductions (12 patterns) and originality lifts (7 craft signals) that
  affect the final score. These were always part of the engine but not displayed
  in the 0.x CLI report.

- **`verify` subcommand runs locally.** The `verify <url>` subcommand (DESIGN.md
  spec-layer check) now runs the v37 check from the local engine instead of
  POSTing to the server. Use `--api` to fall back to remote mode.

### Added

- Local 40-check scoring engine (zero dependencies, `node:https` + pure-JS SSRF guard)
- `--scope` flag for contract vs universal scoring
- Anti-slop deductions (S1-S12) and originality lifts (O1-O7) in the formatted report
- `--scope`, `--format`, `--min-score`, `--min-grade`, `--json`, `--quiet` all work
  in both local and remote mode
- `MANUAL` check status icon (for checks that need a live browser to verify)

### Changed

- Default mode: local engine (was: remote API call to designesy.org)
- `--api` and `$SCORE_API`: now opt-in remote fallback (was: default behavior)
- Engine fetch: `node:https` with zero-dep SSRF guard (was: `fetch()` + `ipaddr.js`)
- Report: shows anti-slop + originality lines (was: score + categories + findings only)

### Deprecated

- `--api <url>` remote fallback mode — will be removed in 2.0.0. The local engine
  is strictly better (works offline, no rate limits, no server dependency).
- `$SCORE_API` env var — same as `--api`, deprecated in favor of local mode.

### Fixed

- Windows libuv crash: replaced `fetch()`/undici with `node:https` to avoid the
  `Assertion failed: !(handle->flags & UV_HANDLE_CLOSING)` crash on process exit
- SSRF guard: replaced `ipaddr.js` dependency with pure-JS private-range checks
  (10.x, 127.x, 169.254.x, 172.16-31.x, 192.168.x, 100.64+, all IPv6, encoded IPs)

### Security

- Zero runtime dependencies (was: ipaddr.js)
- SSRF guard runs on every fetch, including redirect hops

---

## [0.4.2] — 2026-08-11

- API client CLI: POSTs to designesy.org/api/score, formats the response
- Flags: `--format`, `--api`, `--min-score`, `--min-grade`, `--json`, `--quiet`
- Subcommand: `verify <url>` (DESIGN.md spec-layer check via remote API)
- Zero dependencies

## [0.3.0] — 2026-07-30

- Initial API client release
- 40-check engine running server-side at designesy.org

[1.0.4]: https://github.com/LE-VAI/designesy-org/releases/tag/designesy-score%401.0.4
[1.0.3]: https://github.com/LE-VAI/designesy-org/releases/tag/designesy-score%401.0.3
[1.0.2]: https://github.com/LE-VAI/designesy-org/releases/tag/designesy-score%401.0.2
[1.0.1]: https://github.com/LE-VAI/designesy-org/releases/tag/designesy-score%401.0.1
[1.0.0]: https://github.com/LE-VAI/designesy-org/releases/tag/designesy-score%401.0.0
[0.4.2]: https://github.com/LE-VAI/designesy-org/compare/v0.4.0...designesy-score%401.0.0