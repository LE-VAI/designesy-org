# @designesy/tokens

Standalone DTCG 2025.10 design token validator. 10 conformance checks. Zero dependencies. Works offline.

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

Score: 90/100  Grade: A  —  9 pass, 1 warn, 0 fail

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

Result: PASS with 1 warning(s)
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

## The 10 Checks

| ID | Check | PASS | WARN | FAIL |
|----|-------|------|------|------|
| t01 | Every token has `$type` (direct or inherited) | All typed | — | Any missing |
| t02 | Every token has `$value` | All valued | — | Any missing |
| t03 | Semantic tokens have `$description` | All described | Primitive missing | Semantic missing |
| t04 | Color tokens use OKLCH or Display-P3 | All structured | Legacy hex primitives | Semantic uses bare hex |
| t05 | Custom types namespaced under `$extensions` | Namespaced | — | Bare custom type |
| t06 | Aliases (`$ref`) resolve to valid typed tokens | All resolve | — | Dangling reference |
| t07 | `$schema` property present | Present | Missing (no editor validation) | — |
| t08 | DTCG 2025.10 structural validation | Passes | — | Schema violation |
| t09 | No type drift between themes | Consistent | — | Drift detected |
| t10 | Dimension units are px or rem only | Valid units | — | Invalid unit |

## Scoring

10 checks. PASS = 1 point, WARN = 0.5 points, FAIL = 0 points.

Score = (points / 10) × 100

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

Use this package as a CI gate to validate your design tokens on every PR:

```yaml
name: Validate design tokens
on: [pull_request]
jobs:
  tokens:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
      - run: npx @designesy/tokens tokens.json --min-score 80
```

## Spec Reference

- [W3C Design Tokens Format Module 2025.10](https://www.designtokens.org/)
- [DTCG JSON Schema](https://www.designtokens.org/schemas/2025.10/format.json)
- [Designesy Tokens Contract](https://www.designesy.org/contracts/tokens)

## License

MIT © [Designesy](https://www.designesy.org)