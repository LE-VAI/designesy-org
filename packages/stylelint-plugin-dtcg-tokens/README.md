# @designesy/stylelint-plugin-dtcg-tokens

[![npm version](https://img.shields.io/npm/v/@designesy/stylelint-plugin-dtcg-tokens?color=blue&label=npm)](https://www.npmjs.com/package/@designesy/stylelint-plugin-dtcg-tokens)
[![license](https://img.shields.io/npm/l/@designesy/stylelint-plugin-dtcg-tokens?color=green)](./LICENSE)
[![CI](https://github.com/LE-VAI/designesy-org/actions/workflows/ci.yml/badge.svg)](https://github.com/LE-VAI/designesy-org/actions/workflows/ci.yml)
[![dependencies](https://img.shields.io/badge/dependencies-0-blue)](./package.json)
[![DTCG](https://img.shields.io/badge/DTCG-2025.10-blue)](https://www.designtokens.org/)
[![Node](https://img.shields.io/badge/node-%3E%3D18-green)](./package.json)

stylelint + PostCSS plugin that enforces DTCG 2025.10 design token usage in CSS. Catches bare hex colors, magic numbers, and undeclared `var()` references at lint time — before they reach production. Supports `--fix` to auto-replace unambiguous bare values with `var(--token)` references.

## Why

Design tokens are the contract between design and code. But CSS is permissive — nothing stops a developer from writing `color: #ff0000` instead of `color: var(--color-danger)`. Over time, bare values accumulate, the token system erodes, and you get **token drift**: the gap between what your design system says and what your code actually does.

This plugin closes that gap at lint time, the same way `eslint` catches unused variables.

## Install

```bash
npm install --save-dev @designesy/stylelint-plugin-dtcg-tokens stylelint
```

For PostCSS-only usage (no stylelint):

```bash
npm install --save-dev @designesy/stylelint-plugin-dtcg-tokens postcss
```

## Rules

### `designesy/no-bare-hex`

Flags hex color values that should use `var(--token)` instead.

```css
/* ❌ Bad */
.button { color: #ff0000; }

/* ✅ Good */
.button { color: var(--color-danger); }
```

### `designesy/no-magic-number`

Flags bare `px`/`rem` values on token-enforced properties — the properties where design systems typically require tokens: `padding`, `margin`, `font-size`, `gap`, `border-radius`, `width`, `height`, `box-shadow`, etc.

```css
/* ❌ Bad */
.card { padding: 12px; font-size: 18px; }

/* ✅ Good */
.card { padding: var(--space-sm); font-size: var(--font-size-lg); }
```

### `designesy/no-undeclared-var`

Flags `var()` references to custom properties not declared in your DTCG token file or in any `:root` block. Catches typos like `var(--colr-primary)` and references to tokens that were removed.

```css
/* ❌ Bad — --color-unknown is not in the token file */
.modal { color: var(--color-unknown); }

/* ✅ Good — --color-primary is in the token file */
.modal { color: var(--color-primary); }

/* ✅ Good — --local-var is declared in CSS, even if not in the token file */
:root { --local-var: 100px; }
.sidebar { width: var(--local-var); }
```

## Usage

### stylelint

```json
// .stylelintrc.json
{
  "plugins": ["@designesy/stylelint-plugin-dtcg-tokens"],
  "rules": {
    "designesy/no-bare-hex": [true, { "tokensFile": "./design-tokens.json" }],
    "designesy/no-magic-number": [true, { "tokensFile": "./design-tokens.json" }],
    "designesy/no-undeclared-var": [true, { "tokensFile": "./design-tokens.json" }]
  }
}
```

The `tokensFile` option is a path to a DTCG 2025.10 token JSON file, resolved relative to `process.cwd()`.

### PostCSS (standalone)

```js
// postcss.config.js
import dtcgTokenCheck from '@designesy/stylelint-plugin-dtcg-tokens/postcss';

export default {
  plugins: [
    dtcgTokenCheck({
      tokensFile: './design-tokens.json',
      rules: {
        bareHex: true,
        magicNumber: true,
        undeclaredVar: true,
      },
    }),
  ],
};
```

Warnings are emitted via PostCSS's `node.warn()` — they appear in your build output and can be collected by downstream tools.

## Auto-fix (`--fix`)

Both the stylelint plugin and the standalone PostCSS plugin support auto-fixing unambiguous violations:

### stylelint

```bash
npx stylelint --fix "**/*.css"
```

### PostCSS

```js
dtcgTokenCheck({
  tokensFile: './design-tokens.json',
  fix: true,  // ← auto-replace bare values in-place
})
```

### What gets fixed

| Rule | Auto-fixed? | How |
|---|---|---|
| no-bare-hex | ✅ When the hex maps to exactly 1 color token | `#3b82f6` → `var(--color-primary)` |
| no-magic-number | ✅ When the value maps to exactly 1 token after property-semantic disambiguation | `16px` on `padding` → `var(--space-md)`, `16px` on `border-radius` → `var(--radius-lg)` |
| no-undeclared-var | ❌ Never — can't infer what the author meant to reference |

### Property-semantic disambiguation

Dimension values often collide across token groups — `16px` might be `--space-md`, `--radius-lg`, AND `--font-size-md`. The fix engine uses the CSS property name to pick the right group:

- `padding: 16px` → space group → `var(--space-md)`
- `border-radius: 16px` → radius group → `var(--radius-lg)`
- `font-size: 16px` → font-size group → `var(--font-size-md)`

When a value maps to multiple tokens even after disambiguation (e.g. `4px` on the `border` shorthand, which could be space or radius), the violation is **warned but not fixed** — you decide which token to use.

### Framework integrations

#### Tailwind CSS (PostCSS pipeline)

```js
// postcss.config.js
import dtcgTokenCheck from '@designesy/stylelint-plugin-dtcg-tokens/postcss';

export default {
  plugins: [
    dtcgTokenCheck({ tokensFile: './design-tokens.json' }),
    // ... tailwindcss, autoprefixer, etc.
  ],
};
```

#### CSS Modules (webpack)

```js
// webpack.config.js
import dtcgTokenCheck from '@designesy/stylelint-plugin-dtcg-tokens/postcss';

module.exports = {
  module: {
    rules: [
      {
        test: /\.module\.css$/,
        use: [
          'style-loader',
          { loader: 'css-loader', options: { modules: true } },
          {
            loader: 'postcss-loader',
            options: {
              postcssOptions: {
                plugins: [
                  dtcgTokenCheck({ tokensFile: './design-tokens.json' }),
                ],
              },
            },
          },
        ],
      },
    ],
  },
};
```

#### Vite

```js
// vite.config.js
import dtcgTokenCheck from '@designesy/stylelint-plugin-dtcg-tokens/postcss';

export default {
  css: {
    postcss: {
      plugins: [
        dtcgTokenCheck({ tokensFile: './design-tokens.json' }),
      ],
    },
  },
};
```

#### Next.js

```js
// next.config.mjs
import dtcgTokenCheck from '@designesy/stylelint-plugin-dtcg-tokens/postcss';

export default {
  webpack(config) {
    config.module.rules.push({
      test: /\.css$/,
      use: {
        loader: 'postcss-loader',
        options: {
          postcssOptions: {
            plugins: [
              dtcgTokenCheck({ tokensFile: './design-tokens.json' }),
            ],
          },
        },
      },
    });
    return config;
  },
};
```

## Token File Format

The plugin expects a [DTCG 2025.10](https://www.designtokens.org/) token JSON file:

```json
{
  "$schema": "https://www.designtokens.org/schemas/2025.10/format.json",
  "color": {
    "primary": { "$type": "color", "$value": "#3b82f6" },
    "danger": { "$type": "color", "$value": "#ef4444" }
  },
  "space": {
    "sm": { "$type": "dimension", "$value": "8px" },
    "md": { "$type": "dimension", "$value": "16px" }
  }
}
```

Dot-path groups become hyphenated CSS custom property names:
- `color.primary` → `--color-primary`
- `font.size.lg` → `--font-size-lg`

Both DTCG alias forms are supported:
- `$ref: "color.base.red"` → resolved as `var(--color-base-red)`
- `$value: "{color.base.red}"` → resolved as `var(--color-base-red)`

## Programmatic API

```typescript
import {
  flattenTokens, extractVarRefs, isBareHex, isMagicNumber,
  normalizeHex, buildReverseMap, resolveToken,
} from '@designesy/stylelint-plugin-dtcg-tokens/tokens';

// Flatten a DTCG token file into CSS custom property names
const tokens = flattenTokens(parsedTokenJson);
tokens.get('--color-primary'); // { name, value, type, description, deprecated }

// Extract var() references from a CSS value
extractVarRefs('var(--space-md) var(--space-lg)'); // ['--space-md', '--space-lg']

// Check if a CSS value is a bare hex color
isBareHex('#ff0000'); // true
isBareHex('var(--color-danger)'); // false

// Check if a value is a magic number on an enforced property
isMagicNumber('padding', '12px'); // true
isMagicNumber('padding', 'var(--space-sm)'); // false

// Build a reverse value→token map for auto-fix lookups
const reverseMap = buildReverseMap(tokens);
reverseMap.get('#3b82f6'); // [FlattenedToken] — color tokens matching this hex

// Resolve a CSS value to a single token using property-semantic disambiguation
resolveToken('16px', 'padding', reverseMap, false); // { token: { name: '--space-md', ... } }
resolveToken('16px', 'border-radius', reverseMap, false); // { token: { name: '--radius-lg', ... } }
resolveToken('4px', 'border', reverseMap, false); // { ambiguous: [...] } — can't disambiguate

// Normalize hex for lookup (lowercase + expand 3-digit to 6-digit)
normalizeHex('#FFF'); // '#ffffff'
```

## GitHub Actions

```yaml
name: Lint CSS
on: [pull_request]
permissions:
  contents: read
jobs:
  lint:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 # v7
      - uses: actions/setup-node@820762786026740c76f36085b0efc47a31fe5020 # v7
        with:
          node-version: '22'
      - run: npm ci
      - run: npx stylelint "**/*.css"
```

## Spec Reference

- [W3C Design Tokens Format Module 2025.10](https://www.designtokens.org/)
- [DTCG JSON Schema](https://www.designtokens.org/schemas/2025.10/format.json)
- [Designesy Tokens Contract](https://www.designesy.org/contracts/tokens)
- [Designesy Tokens Validator](https://www.npmjs.com/package/@designesy/tokens) — companion CLI that validates the token file itself

## License

MIT © [Designesy](https://www.designesy.org)