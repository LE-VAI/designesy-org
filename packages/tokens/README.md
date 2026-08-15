# @designesy/tokens

[![npm version](https://img.shields.io/npm/v/@designesy/tokens?color=blue&label=npm)](https://www.npmjs.com/package/@designesy/tokens)
[![npm downloads](https://img.shields.io/npm/dw/@designesy/tokens)](https://www.npmjs.com/package/@designesy/tokens)
[![license](https://img.shields.io/npm/l/@designesy/tokens?color=green)](./LICENSE)
[![CI](https://github.com/LE-VAI/designesy-org/actions/workflows/ci.yml/badge.svg)](https://github.com/LE-VAI/designesy-org/actions/workflows/ci.yml)
[![dependencies](https://img.shields.io/badge/dependencies-0-blue)](./package.json)
[![DTCG](https://img.shields.io/badge/DTCG-2025.10-blue)](https://www.designtokens.org/)
[![Node](https://img.shields.io/badge/node-%3E%3D18-green)](./package.json)

Standalone DTCG 2025.10 design token validator. 20 conformance checks. Zero dependencies. Works offline.

## Why

The W3C Design Tokens Format Module reached its first stable version (2025.10) on October 28, 2025, backed by 24+ organizations including Adobe, Google, Meta, and Figma. Token adoption is at 84% of teams.

But no standalone DTCG validator CLI exists on npm. Terrazzo has `co check`, but it's bundled inside a full token compiler. This package is the first focused, standalone DTCG validator — the `npm audit` of design tokens.

## Install

```bash
# One-off (no install needed)
npx @designesy/tokens tokens.json

# Or install locally
npm install --save-dev @designesy/tokens
```

## Usage

### Validate a local file

```bash
npx @designesy/tokens tokens.json
```

Output:
```
Designesy Tokens Validator — DTCG 2025.10
Source: tokens.json
Tokens: 47

Score: 90/100  Grade: A  —  18 pass, 2 warn, 0 fail

  ✓ t01  PASS  Every token has $type (direct or inherited)
  ✓ t02  PASS  Every token has $value
  ✓ t03  PASS  Semantic tokens have $description
  ~ t04  WARN  Color tokens use OKLCH or Display-P3
         3 primitive color(s) using legacy hex (valid DTCG, should migrate to OKLCH)
  ✓ t05  PASS  Custom types namespaced under $extensions
  ✓ t06  PASS  Aliases resolve to valid typed tokens
  ~ t07  WARN  $schema property present
  ✓ t08  PASS  DTCG 2025.10 structural validation
  ✓ t09  PASS  No type drift between themes
  ✓ t10  PASS  Dimension units are px or rem only
  ✓ t11  PASS  $type is one of 15 valid spec types
  ✓ t12  PASS  Token names don't start with $ (except $root)
  ✓ t13  PASS  Token names don't contain {, }, or .
  ✓ t14  PASS  $value matches $type structure (primitives)
  ✓ t15  PASS  Color value well-formedness
  ✓ t16  PASS  Composite type structure
  ✓ t17  PASS  Canonical $value:"{ref}" alias syntax
  ✓ t18  PASS  Alias type compatibility
  ✓ t19  PASS  Circular reference detection
  ✓ t20  PASS  $deprecated value valid

Result: PASS with 2 warning(s)
```

### Validate a remote URL

```bash
npx @designesy/tokens https://www.designesy.org/export/dtcg
```

### CI gate — fail if score below threshold

```bash
npx @designesy/tokens tokens.json --min-score 80
# Exit code 0 if score ≥ 80, exit code 1 if below
```

### JSON output for piping

```bash
npx @designesy/tokens tokens.json --json
```

### Quiet mode (only output on failure)

```bash
npx @designesy/tokens tokens.json --quiet
```

## The 20 Checks

| ID | Check | PASS | WARN | FAIL |
|----|-------|------|------|------|
| t01 | Every token has `$type` (direct or inherited) | All typed | — | Any missing |
| t02 | Every token has `$value` | All valued | — | Any missing |
| t03 | Semantic tokens have `$description` | All described | Primitive missing | Semantic missing |
| t04 | Color tokens use OKLCH or Display-P3 | All structured | Legacy hex primitives | Semantic uses bare hex |
| t05 | Custom types namespaced under `$extensions` | Namespaced | — | Bare custom type |
| t06 | Aliases resolve to valid typed tokens | All resolve | — | Dangling reference |
| t07 | `$schema` property present | Present | Missing (no editor validation) | — |
| t08 | DTCG 2025.10 structural validation | Passes | — | Schema violation |
| t09 | No type drift between themes | Consistent | — | Drift detected |
| t10 | Dimension units are px or rem only | Valid units | — | Invalid unit |
| t11 | `$type` is one of 15 valid spec types | All valid | — | Invalid type name |
| t12 | Token names don't start with `$` (except `$root`) | All valid | — | Name starts with `$` |
| t13 | Token names don't contain `{`, `}`, or `.` | All valid | — | Forbidden character |
| t14 | `$value` matches `$type` structure (primitives) | All conform | — | Value/type mismatch |
| t15 | Color value well-formedness | All well-formed | — | Malformed color |
| t16 | Composite type structure | All valid | — | Missing required child |
| t17 | Canonical `$value:"{ref}"` alias syntax | All valid | — | Invalid alias syntax |
| t18 | Alias type compatibility | All compatible | — | Type mismatch |
| t19 | Circular reference detection | No cycles | — | Circular chain detected |
| t20 | `$deprecated` value valid | All valid | — | Invalid value type |

## Scoring

20 checks. PASS = 1 point, WARN = 0.5 points, FAIL = 0 points.

Score = (points / 20) × 100

| Grade | Score |
|-------|-------|
| A | ≥ 90 |
| B | ≥ 80 |
| C | ≥ 70 |
| D | ≥ 60 |
| F | < 60 |

## Programmatic API

```typescript
import { validateTokens, validateTokenString } from '@designesy/tokens';

// From a parsed object
const result = validateTokens(tokenJsonObject, 'tokens.json');
console.log(result.score);  // 90
console.log(result.grade);  // 'A'
console.log(result.valid);  // true (no FAILs)

// From a JSON string
const result2 = validateTokenString(jsonString, 'tokens.json');
if ('error' in result2) {
  console.error(result2.error);
}
```

## GitHub Actions

Use this package as a CI gate to validate your design tokens on every PR.
The example below uses SHA-pinned actions — the 2026 supply-chain security
best practice. Dependabot bumps the SHAs when new versions land.

```yaml
name: Validate design tokens
on: [pull_request]
permissions:
  contents: read
jobs:
  tokens:
    runs-on: ubuntu-latest
    steps:
      # SHA-pinned (replace with current SHAs from the action repos)
      - uses: actions/checkout@11bd71901bbe5b1630ceea73d27597364c9af573 # v4.2.2
      - uses: actions/setup-node@49933ea5288caeca8642d1e84afbd3f7d6820020 # v4.4.0
        with:
          node-version: '22'
      - run: npx @designesy/tokens@0.2.1 tokens.json --min-score 80
```

Or use the composite action (no Node setup needed):

```yaml
- uses: LE-VAI/designesy-org/.github/actions/tokens-validate@main
  with:
    url: https://example.com/tokens.json
    min-score: 80
```

## Spec Reference

- [W3C Design Tokens Format Module 2025.10](https://www.designtokens.org/)
- [DTCG JSON Schema](https://www.designtokens.org/schemas/2025.10/format.json)
- [Designesy Tokens Contract](https://www.designesy.org/contracts/tokens)

## License

MIT © [Designesy](https://www.designesy.org)