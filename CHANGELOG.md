# Changelog

All notable changes to `designesy-score` are documented here.
Format based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/).

## [Unreleased]

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