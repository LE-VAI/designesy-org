# Changelog

All notable changes to @designesy/stylelint-plugin-dtcg-tokens are documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/), and
this project adheres to [Semantic Versioning](https://semver.org/).

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