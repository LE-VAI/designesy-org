# Changelog

All notable changes to @designesy/tokens are documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/), and
this project adheres to [Semantic Versioning](https://semver.org/).

## [0.2.2] — 2026-08-16

### Changed — CrCoNi hardening

- `pretest: npm run build` hook added — `npm test` now works on a fresh clone without manual build step
- CI now runs npm tests on every PR (was publish-time only)

## [0.2.1] — 2026-08-15

### Added
- LICENSE file now ships in the npm tarball (was declared MIT but missing from `files`)
- npm badges in README (version, downloads, license, CI, zero-deps, DTCG spec, Node version)
- Second maintainer in package.json (bus-factor > 1)
- CHANGELOG.md
- GitHub Actions example in README now shows SHA-pinned actions (2026 supply-chain best practice)
- Composite action usage example in README

## [0.2.0] — 2026-08-15

### Added — 10 new DTCG conformance checks (t11–t20)
- t11: `$type` is one of 15 valid spec types (catches typos like `colour`)
- t12: Token names don't start with `$` (except `$root`)
- t13: Token names don't contain `{`, `}`, or `.`
- t14: `$value` matches `$type` structure for primitives (dimension, duration, cubicBezier, number, fontFamily, fontWeight)
- t15: Color value well-formedness (valid colorSpace, correct component count, alpha in [0,1])
- t16: Composite type structure (shadow, border, transition, gradient, typography required children)
- t17: Canonical `$value: "{ref}"` alias syntax recognized and validated
- t18: Alias type compatibility (reference target must have compatible `$type`)
- t19: Circular reference detection (both `$ref` and `$value: "{ref}"` forms)
- t20: `$deprecated` value must be `true`, `false`, or `string`

### Improved
- t04: Recognizes all 14 valid DTCG color spaces (was OKLCH + Display-P3 only)
- t06: Detects `$value: "{ref}"` alias form in addition to `$ref`
- t08: Checks for unknown `$`-properties inside groups/tokens, not just at root

### Added — test suite
- 42 tests via `node --test` covering all 20 checks with valid + invalid fixtures
- `test/fixtures/valid-tokens.json` — comprehensive DTCG file passing all 20 checks (100/A)
- `test/fixtures/invalid-tokens.json` — deliberately broken tokens triggering each FAIL case

### Changed
- Scoring denominator: 10 → 20 checks. Score = (points / 20) × 100
- `fontWeight` added to the 15 valid DTCG types (was missing, caused false FAILs)
- Traversal rewritten to distinguish tokens from groups, collect all name segments

## [0.1.0] — 2026-08-14

### Initial release
- 10 foundational DTCG 2025.10 conformance checks (t01–t10)
- Zero runtime dependencies, works offline, Node ≥ 18
- CLI (`designesy-tokens`) and programmatic API (`validateTokens`, `validateTokenString`)
- Remote URL validation, `--min-score` CI gate, `--json` output, `--quiet` mode
- Scoring: 10 checks, PASS=1/WARN=0.5/FAIL=0, letter grade A–F