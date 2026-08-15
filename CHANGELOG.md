# Changelog

All notable changes to `designesy-score` are documented here.
Format based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/).

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

[1.0.0]: https://github.com/LE-VAI/designesy-org/releases/tag/v1.0.0
[0.4.2]: https://github.com/LE-VAI/designesy-org/releases/tag/v0.4.2