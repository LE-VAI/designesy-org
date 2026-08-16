# Changelog

All notable changes to @designesy/stylelint-plugin-dtcg-tokens are documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/), and
this project adheres to [Semantic Versioning](https://semver.org/).

## [0.2.1] — 2026-08-15

### Fixed — DTCG 2025.10 JSON Pointer $ref support

The `$ref` alias handler now supports all three DTCG 2025.10 reference syntaxes:
- **Curly brace**: `$value: "{color.primary}"` (already supported)
- **Dot-path**: `$ref: "color.primary"` (already supported)
- **JSON Pointer**: `$ref: "#/color/primary/$value"` (now supported — was producing broken `var(--#/color/primary/$value)`)

The JSON Pointer form is the spec-mandated `$ref` syntax from the 2025.10 final report (PR #298, October 2025). The `#/path/to/token/$value` format is now correctly resolved to `var(--path-to-token)`.

## [0.2.0] — 2026-08-15

### Added — Auto-fix mode

Both the stylelint plugin and the standalone PostCSS plugin now support `--fix`:

- **stylelint**: `stylelint --fix` natively auto-replaces unambiguous bare hex and magic numbers with `var(--token)` references. Uses the real stylelint plugin API (`createPlugin`, `report({ fix })`, `meta.fixable`).
- **PostCSS**: pass `{ fix: true }` to the plugin options to mutate values in-place.

### Auto-fix behavior

| Rule | Fixable? | How |
|---|---|---|
| no-bare-hex | ✅ When hex maps to exactly 1 color token | `#3b82f6` → `var(--color-primary)` |
| no-magic-number | ✅ When value maps to exactly 1 token after property-semantic disambiguation | `16px` on `padding` → `var(--space-md)`, `16px` on `border-radius` → `var(--radius-lg)` |
| no-undeclared-var | ❌ Never — can't infer what the author meant to reference |

When a value maps to multiple tokens even after disambiguation, the violation is **warned but not fixed** — the human decides.

### New exports

- `normalizeHex()` — normalizes hex for lookup (lowercase + 3-digit → 6-digit expansion)
- `buildReverseMap()` — builds a reverse value→token map from flattened tokens
- `resolveToken()` — resolves a CSS value to a single token using property-semantic disambiguation
- `PROPERTY_TOKEN_PREFIX` — maps CSS property names to expected token-group prefixes

### Other changes

- Added `ms` (milliseconds) to magic number detection — `transition-duration: 150ms` is now flagged
- stylelint plugin rewritten to use `createPlugin` + `report()` + `meta.fixable` (was ad-hoc `result.warn()`)
- Added `stylelint` as a devDependency for testing
- 62 tests (up from 29) — added reverse-map unit tests, PostCSS fix tests, and stylelint fix tests

## [0.1.1] — 2026-08-15

### Changed

- Switched from two-pass `RootExit` visitor to single-pass `Declaration` visitor — simpler architecture, same behavior
- Published with npm provenance attestation (GitHub OIDC + Sigstore keyless signing)

## [0.1.0] — 2026-08-15

### Initial release

Three rules that enforce DTCG 2025.10 design token usage in CSS:

- **no-bare-hex** — flags hex color values (`#ff0000`) that should use `var(--token)` instead
- **no-magic-number** — flags bare `px`/`rem` values on token-enforced properties (padding, margin, font-size, gap, border-radius, etc.) that should use design tokens
- **no-undeclared-var** — flags `var()` references to custom properties not declared in the DTCG token file or in any `:root` block

### Features

- Dual export: stylelint plugin (`@designesy/stylelint-plugin-dtcg-tokens`) + standalone PostCSS plugin (`@designesy/stylelint-plugin-dtcg-tokens/postcss`)
- Accepts a DTCG 2025.10 token JSON file path as a `tokensFile` option
- Token flattener converts DTCG dot-path groups to CSS custom property names (`color.primary` → `--color-primary`)
- Handles both DTCG alias forms: `$ref` and `$value: "{ref}"`
- CSS-declared custom properties (in `:root`) are valid `var()` targets even if not in the token file
- Individual rule toggles for the PostCSS plugin (`rules: { bareHex: false }`)
- Graceful degradation: warns (but does not crash) if the token file is missing
- Zero runtime dependencies (only `postcss` as a peer dep)
- 42 tests covering token flattening, hex detection, magic number detection, var() extraction, and full PostCSS integration