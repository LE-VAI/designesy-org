# Contract mode: engine specification

This document describes contract mode as shipped in engine 1.5.x: how `POST /api/score` reads a team's own DESIGN.md or DTCG token file, finds those tokens on a live page, and scores the page against them. The code is authoritative. Where this text and the code disagree, the code is right and this document is out of date; please open an issue or a pull request. The code lives in `apps/site/app/lib/own-contract/`, and `GET /api/score/checks/own-contract` serves the machine-readable form of sections 6 to 9 (the published formula). Source comments cite this document as "contract-mode spec §x.y".

Paths in this document are relative to `apps/site/` unless they say otherwise.

---

## 0. Summary

Contract mode adds one optional request field, `contract`, to `POST /api/score`. When it is present the engine:

1. reads the contract (a DESIGN.md or a DTCG 2025.10 token file) into one normalized model, and rejects it with a list of problems when it does not parse or is below the minimum (section 4);
2. fetches the page the way every score does: its HTML, its inline styles and up to 60 external stylesheets;
3. locates each declared token on the page by token map, by CSS variable name or by value (section 5);
4. runs 14 **fidelity** checks that read the contract (section 6) and 18 **baseline** checks that read no contract (section 7);
5. scores the two layers separately and never blends them (section 8), or returns no score for a layer, with a reason (section 9);
6. returns both, with coverage, the contract's digest and a receipt that names the contract (sections 10 and 11);
7. caches nothing and stores nothing about the contract or the page (sections 11 and 13).

The Designesy-specific checks, the slop deduction and the originality lift do not run in this mode. Requests without `contract` are unchanged (section 10.5).

---

## 1. Current engine facts this spec builds on

| Fact | Where |
|---|---|
| The engine's built-in contract is Designesy's. `scope: "contract"` scores a page strictly against it; `scope: "universal"` scores universal rules only. | `app/api/score/route.ts` |
| A page fetch reads the HTML, inline styles and up to 60 external stylesheets. The stylesheet phase has one deadline; when it passes, no external sheet is kept for that run. | `app/api/score/route.ts` (`fetchPageResilient`) |
| Scoring rule: each category's weight is shared equally by its scored checks. PASS earns the share, WARN half, FAIL nothing. SKIP and MANUAL leave both the points and the weight. | `app/api/score/route.ts`; contract mode applies the same rule in `app/lib/own-contract/score.ts` |
| Grades: A from 90, B from 80, C from 70, D from 60, else F. | same |
| The receipt digest is sha256 over the ordered `id:status` lines, joined with a newline. | `app/lib/receipt.ts` |
| `ENGINE_VERSION` moves for any change that can move a verdict for the same input. | `app/lib/check-definitions.ts` |
| Results without a contract are cached by URL. Contract mode never uses that cache. | `app/api/score/route.ts` (`scoreUrl`) |
| `safeFetch` pins DNS, validates every redirect hop, follows at most 5 redirects, and refuses private, loopback, link-local and cloud metadata addresses. | `app/lib/url-guard.ts` |
| `@google/design.md` 0.4.0 is a direct dependency. Its `lint()` returns findings, a summary and the resolved model. | `package.json` |
| `/api/score/checks` and `/api/score/checks/own-contract` are static routes. | `app/api/score/checks/` |

---

## 2. Mode switch and naming

- **Trigger:** the request body has a `contract` key. No other field turns the mode on. A `contract` value that is not a valid contract object (section 10.1) answers 400 `contract_shape`.
- **Name:** the mode is `own-contract` in every machine field (`mode`, `scope`, receipt `scope`). The word `contract` alone already means Designesy's contract in the API (`scope: "contract"`) and in the GitHub Action.
- **`scope` with `contract`:** `scope: "contract"`, in any letter case, answers 400 `scope_conflict`. Any other `scope`, or none, is accepted and ignored. The baseline checks run without a scope filter.
- **`format` with `contract`:** contract mode answers in `format: "designesy"` (the default) only. `review`, `google` and `canonical` answer 400 `format_unsupported`.
- **Check IDs:** fidelity checks use the prefix `f` (`f01` to `f14`). Baseline checks keep their registry IDs.

---

## 3. The normalized contract model

Both readers produce this one model, so binding, the fidelity checks and the digest never branch on the format a team wrote. Code: `app/lib/own-contract/types.ts`.

### 3.1 Types

```ts
type ContractFormat = 'design.md' | 'dtcg';
type GroupName = 'colors' | 'typography' | 'radii' | 'spacing' | 'sizes' | 'durations' | 'easings';

interface OwnContract {
  format: ContractFormat;
  formatVersion: string | null;   // DESIGN.md front matter `version`; DTCG "2025.10" when $schema names it
  name: string | null;            // DESIGN.md `name`; DTCG root $description; else null
  source: { kind: 'inline' | 'url'; url?: string; bytes: number };
  digest: string;                 // sha256 hex, section 11.2
  colors: ColorToken[];
  typography: TypeStyle[];
  families: FamilyToken[];        // every declared face: from type styles and standalone fontFamily tokens
  radii: DimensionToken[];
  spacing: DimensionToken[];
  sizes: SizeToken[];             // component heights and sizes; DTCG dimensions with the size role
  durations: DurationToken[];     // DTCG only
  easings: EasingToken[];         // DTCG only
  pairs: ContrastPair[];
  aliases: Alias[];
  tokenMap: Map<string, string>;  // contract path -> CSS custom property, validated (section 5.3)
  omitted: Array<{ group: string; reason?: string }>;
  problems: Problem[];            // warnings only, once the contract is accepted
  stats: { declared: number; byGroup: Record<GroupName, number> };
  linter: LinterTotals | null;    // DESIGN.md only: the format linter's own totals
}

interface TokenBase {
  path: string;                   // as written: 'colors.primary' (DESIGN.md) or 'color.brand.500' (DTCG)
  aliasOf?: string;               // path of the referenced token when the value is a reference
  deprecated?: boolean;           // DTCG $deprecated
  cssVar?: string;                // from $extensions["org.designesy"].cssVar or the token map
  nested?: boolean;               // declared inside another token (see below)
}
interface Rgba8 { r: number; g: number; b: number; a: number }   // 0-255, alpha 0-1
interface ColorToken extends TokenBase { kind: 'color'; rgba: Rgba8; hex: string /* #rrggbbaa lowercase */; original: string }
interface Dimension { value: number; unit: 'px' | 'rem' | 'em'; px: number | null /* em -> null */ }
interface DimensionToken extends TokenBase { kind: 'dimension'; dim: Dimension }
type LineHeight = { kind: 'ratio'; value: number } | { kind: 'length'; dim: Dimension };
type TypeRole = 'heading' | 'body' | 'label' | 'code' | 'other';
interface TypeStyle extends TokenBase {
  kind: 'typography'; role: TypeRole;
  families?: string[];            // first entry is the face; the rest are accepted fallbacks
  fontSize?: Dimension; fontWeight?: number; lineHeight?: LineHeight; letterSpacing?: Dimension;
  features?: string[];            // 4-character OpenType tags, lowercase, e.g. ['tnum']
}
interface FamilyToken extends TokenBase { kind: 'fontFamily'; families: string[] }
interface SizeToken extends DimensionToken { interactive: boolean }
interface DurationToken extends TokenBase { kind: 'duration'; ms: number }
interface EasingToken extends TokenBase { kind: 'cubicBezier'; points: [number, number, number, number] }
interface ContrastPair { text: string; background: string; role: 'primary-action' | 'component'; largeText: boolean; source: string }
interface Alias { from: string; to: string }
interface LinterTotals { package: '@google/design.md'; version: string; errors: number; warnings: number; infos: number }

interface Problem {
  code: string;
  severity: 'error' | 'warning';
  message: string;                // the engine's sentence; at most 80 characters of any value
  path?: string; line?: number; column?: number;
  value?: string;                 // the offending value, cut to 80 characters
  ref?: string;                   // ALIAS_UNRESOLVED, TOKEN_DROPPED: the reference as written
  chain?: string[];               // ALIAS_CYCLE: the loop, first path repeated last
  reason?: DropReason;            // TOKEN_DROPPED (section 4.3)
  kind?: string;                  // VALUE_INVALID: the kind of value expected
  heading?: string;               // DUPLICATE_SECTION
  key?: string;                   // TOKEN_MAP_INVALID
  count?: number; limit?: number; // counts the message is built from
  colorRows?: number; colorLines?: [number, number];   // TOKENS_IN_PROSE
  typeRows?: number; typeLines?: [number, number]; keys?: string[];
  space?: string;                 // COLOR_SPACE_UNSUPPORTED
  char?: string; script?: string; codePoint?: string; position?: number; latin?: string;  // CONFUSABLE_NAME
  url?: string; why?: 'network' | 'timeout' | 'http_error' | 'content_type' | 'too_large' | 'blocked'; status?: number;  // CONTRACT_URL_UNREACHABLE
  rule?: string; linterMessage?: string;   // LINT_ERROR, LINT_WARNING
  linterFinding?: boolean;        // a structured problem whose path the linter also flagged
}
```

A **nested** value is declared inside another token: a component's literal pair color, radius or padding in a DESIGN.md, or the color inside a DTCG `border`, `shadow` or `gradient`, or a literal color in a DTCG pair. A nested value counts as a declared value for the membership checks (f02, f07, f08). It is left out of the minimum contract, the declared counts and coverage, and it is never located by name.

### 3.2 Normalization rules

Code: `app/lib/own-contract/normalize.ts`. Both readers and the page reader use these rules, so a declared value and a shipped value are always compared in one form.

- **Colors** become 8-bit sRGB plus alpha, with alpha rounded to 3 decimals. Accepted CSS forms: hex with 3, 4, 6 or 8 digits; named colors; `rgb()`, `rgba()`, `hsl()`, `hsla()`, `hwb()`, `lab()`, `lch()`, `oklab()`, `oklch()`; `color()` in any space listed for DTCG in section 4.4; and `color-mix()` in `srgb`, `srgb-linear` or `oklab`. For a DESIGN.md, token colors come from the linter's resolved model, which converts every form the format allows. Out-of-gamut values are clipped to sRGB. The original string is kept for display.
- **Dimensions** keep the declared value and unit, and add `px`: px as is, rem times 16 (rounded to 4 decimals), em `null`. The 16px root is the engine's existing rule. em values are left out of every membership check, because their pixel size depends on context.
- **Line heights:** a unitless number (or a string holding only a number) is a ratio; a px, rem or em value is a length. A length converts to a ratio only when the same type style declares a px or rem `fontSize` (ratio = line height px / font size px).
- **Type roles** come from the last segment of the token name: a name starting `headline`, `display`, `title` or `heading`, or `h1` to `h6` followed by the end of the name, `-` or `_`, is `heading`; `body`, `paragraph` or `text` is `body`; `label`, `caption` or `overline` is `label`; `code` or `mono` is `code`; else `other`.
- **Families:** quotes stripped and whitespace collapsed; compared case-folded; the original kept for display. A stack is split on top-level commas. Generic keywords are fallbacks, never faces: `serif`, `sans-serif`, `monospace`, `cursive`, `fantasy`, `system-ui`, `ui-serif`, `ui-sans-serif`, `ui-monospace`, `ui-rounded`, `emoji`, `math`, `fangsong`, `inherit`, `initial`, `unset`, `revert`, `-apple-system`, `BlinkMacSystemFont`.
- **Durations** become milliseconds (`s` times 1000), rounded to 0.001 ms. **Easings** are 4-tuples. CSS keywords map to their standard curves: `ease` 0.25, 0.1, 0.25, 1; `ease-in` 0.42, 0, 1, 1; `ease-out` 0, 0, 0.58, 1; `ease-in-out` 0.42, 0, 0.58, 1; `linear` 0, 0, 1, 1.
- **Paths** are kept as written. Section 5.2 says how a path is compared with a CSS variable name.

---

## 4. Intake: detection, limits, parsers, minimum contract

Code: `app/lib/own-contract/index.ts` (`readContract`). Order: size, then format, then the format's reader, then the minimum scoreable contract, then the token map, then confusable names, then the read-time budget, then the digest. Line endings are normalized once, at the start: CRLF and a lone CR become LF. A file saved with any line ending reads to the same model, problems and digest, and line numbers still match the author's editor.

### 4.1 Format detection (when `format` is `auto`)

Code: `app/lib/own-contract/detect.ts`. The web page's "Read as" line uses the same function, so the page and the server cannot disagree.

1. Strip a UTF-8 byte order mark. If the first non-space character is `{`, the file is DTCG. A brace-first file that does not parse is still read as DTCG, so its author gets `JSON_INVALID` with a line and column.
2. Otherwise, if the file starts with `---`, or has a line that opens a fenced `yaml` or `yml` block, it is a DESIGN.md.
3. Otherwise, if the file has a Markdown ATX heading (`#` to `######`, then a space), it is a DESIGN.md. One with no YAML gets `NO_TOKENS_FOUND`, which tells its author where tokens go.
4. Otherwise `FORMAT_UNKNOWN` (422). The web page asks the user to choose a format.

An explicit `format` of `design.md` or `dtcg` skips detection. For DTCG, `formatVersion` is the `YYYY.MM` version named in the root `$schema`, when it names one.

### 4.2 Limits (checked before and during parsing)

Code: `app/lib/own-contract/limits.ts`. The published formula, the API and the tests read the same constants.

| Limit | Value | On breach |
|---|---|---|
| Request body | 300 KB (307,200 bytes), measured on the body as received | 413 `body_too_large` |
| Contract text, inline or linked | 256 KB (262,144 bytes) of UTF-8, as sent | 413 `contract_too_large` |
| Linked contract fetch | through `safeFetch` only; aborted after 8 s | 422 `CONTRACT_URL_UNREACHABLE`, with `why` set to `network`, `timeout`, `http_error` (with `status`) or `blocked` |
| Linked contract size | over 256 KB by `Content-Length` or by the bytes read | 413 `contract_too_large` |
| Linked contract type | `text/*`, `application/json` or `application/octet-stream`; a response with no content type is read | 422 `CONTRACT_URL_UNREACHABLE` with `why: content_type` and the type in `value` |
| Declared tokens (DTCG) | 2,000, counting tokens inherited through `$extends` | 422 `TOO_MANY_TOKENS` |
| Group nesting (DTCG) | 16 levels | 422 `TOO_DEEP` |
| Alias chain (DTCG) | 16 hops per token; 10,000 resolution steps per contract | 422 `ALIAS_TOO_DEEP` |
| YAML aliases (DESIGN.md) | 100 per document | 422 `YAML_INVALID` |
| Token map | 500 entries; each value matches `^--[A-Za-z0-9_-]{1,128}$` | 422 `TOKEN_MAP_INVALID` |
| Read time | 1 s from the start of intake to the end of validation | 422 `CONTRACT_TOO_COMPLEX` |

A DESIGN.md has no token-count, nesting or hop limit of its own. The size cap and the read-time budget bound it. The read-time budget is checked once validation ends: a slow read completes and is then rejected.

### 4.3 DESIGN.md parser

Code: `app/lib/own-contract/design-md.ts`. Two reads of the same text, because the format linter's resolved model drops some values without an error (behaviors P2 and P3 below):

1. **Raw read:** the YAML front matter (from a first line of `---` to the next `---` or `...`), or else every fenced `yaml` or `yml` block in document order, merged. Parsed with the `yaml` package (the parser the linter depends on, pinned to the same version), core schema, unique keys, no custom tags, at most 100 aliases. A duplicate key or a parse error is `YAML_INVALID` with the file line.
2. **Linter read:** `lint(text)` from `@google/design.md/linter`. The linter reads every file, accepted or not, so its own totals (`errors`, `warnings`, `infos`) are reported on every DESIGN.md outcome as `linter`.

Mapping into the model:

| DESIGN.md field | Model | Source of the value | Notes |
|---|---|---|---|
| `name`, `version` | `name`, `formatVersion` | raw | quotes stripped from `name` |
| `colors.<name>` | `colors[]` | linter (hex, r, g, b, a) | A raw `{colors.x}` value records `aliasOf` and an alias |
| `typography.<name>.fontFamily` | `TypeStyle.families`, `families[]` | raw, split on top-level commas | |
| `typography.<name>.fontSize` | `TypeStyle.fontSize` | linter | px, rem or em |
| `typography.<name>.fontWeight` | `TypeStyle.fontWeight` | linter | not scored |
| `typography.<name>.lineHeight` | `TypeStyle.lineHeight` | raw | the linter drops unitless values (P2) |
| `typography.<name>.letterSpacing` | `TypeStyle.letterSpacing` | linter | not scored |
| `typography.<name>.fontFeature` | `TypeStyle.features` | raw; tags parsed from `'tnum' 1, 'ss01'` | a tag set to `0` or `off` is left out |
| `typography.<name>.fontVariation` | ignored | | |
| `rounded.<level>` | `radii[]` | linter | references recorded as aliases |
| `spacing.<level>` | `spacing[]` | linter | unitless spacing values have no pixel size and are skipped |
| `components.<name>.backgroundColor` + `textColor` | `pairs[]` | a reference names its token; a literal color becomes a nested color at `components.<name>.<field>` | `role: 'primary-action'` when the name is `button-primary`, `button`, `primary-button` or `cta` |
| `components.<name>.height`, `size` | `sizes[]` | linter | `interactive: true` when the name contains `button`, `btn`, `input`, `field`, `select`, `chip`, `tab`, `link`, `toggle`, `checkbox`, `radio` or `switch` |
| `components.<name>.rounded`, `padding` | a literal joins `radii` or `spacing` as a nested value | linter | a reference is already declared in its group |
| `components.<name>.typography` | `largeText` on that component's pair | a reference to a type style | large text: font size at least 24px, or at least 18.66px with weight 700 or more (the WCAG large-text definition) |
| `omitted` | `omitted[]` | raw | a section name, or `{ section, reason }`. `rounded`, `radius` and `shapes` map to the group `radii`; `layout` maps to `spacing`. f07 and f08 SKIP `not_declared` for an omitted group and show the reason |

Checks over the raw read:

- **Sections:** a level-2 heading (`##`) that appears twice, compared case-insensitively and outside code fences, is `DUPLICATE_SECTION` with the heading and its line.
- **No tokens:** when the YAML holds none of `colors`, `typography`, `rounded`, `spacing` or `components`, the file is rejected. When the markdown body has table rows with color literals, the code is `TOKENS_IN_PROSE`, with the number of color rows and text-style rows, their line ranges, and the keys the front matter does hold. Otherwise it is `NO_TOKENS_FOUND`.
- **Reference loops** among `colors`, `rounded` and `spacing` are `ALIAS_CYCLE`, one problem per loop, with the loop as `chain`.
- **Dropped tokens:** a token the raw read declares and the linter's model lacks is rejected with a structured code. A literal that is not a value of its kind, or a dimension in a unit scoring cannot compare (`pt`, `%`, `vw` and others), is `VALUE_INVALID` with `kind` (`color` or `dimension`). Anything else is `TOKEN_DROPPED` with a `reason` from this closed list:

  | `reason` | Meaning |
  |---|---|
  | `alias_unresolved` | the value is a reference to a token that does not exist |
  | `alias_cycle` | the value's references loop back to it |
  | `alias_wrong_type` | the value references a token of another kind |
  | `value_not_scalar` | the value is a list, a map or empty where a value belongs |
  | `value_invalid` | the value is not a color, dimension, duration or curve |
  | `unit_unsupported` | a dimension in a unit scoring cannot compare |
  | `unknown` | the linter left the token out for a reason it did not state |

- **Linter findings:** each linter error is `LINT_ERROR` with the linter's path, rule and sentence (`linterMessage`, whole up to 400 characters, then cut at a word boundary). Where a structured code (`VALUE_INVALID`, `TOKEN_DROPPED`, `ALIAS_*`) already names the same path, the `LINT_ERROR` is dropped and the structured problem carries `linterFinding: true`, so each fault reads once. Each linter warning is a `LINT_WARNING` carried with an accepted contract.

Linter behaviors this reader corrects for (observed with `@google/design.md` 0.4.0):

| # | Behavior | Consequence for intake |
|---|---|---|
| P1 | The linter resolves CSS color forms to sRGB: `oklch(98% 0.01 250)` reads `#f4f9ff`, `hsl(0 70% 45%)` reads `#c32222` | Token colors are taken from the linter's model |
| P2 | `lineHeight: 1.5` is absent from the resolved type style | Line heights are read from the raw YAML |
| P3 | `colors.primary: "{colors.missing}"` is dropped from the model with 0 errors | Raw keys are compared with resolved keys; a missing token is `TOKEN_DROPPED` |
| P4 | Two `## Colors` headings produce no error, although the format allows each section once | `DUPLICATE_SECTION` |
| P5 | A broken reference inside `components` is an error (`broken-ref`) | `LINT_ERROR` |
| P6 | An invalid color or unit is an error with a path, yet a `16pt` value can stay in the model | `VALUE_INVALID` for the path; the file is rejected |
| P7 | No YAML, or malformed YAML, gives 0 errors and 1 warning | The raw read reports `NO_TOKENS_FOUND` or `YAML_INVALID` |
| P8 | The linter's DTCG export loses aliases (an alias is exported as a resolved color), drops `components` and `fontFeature`, and writes a `40px` line height as `40` | A DESIGN.md is read directly. Converting it to DTCG first would lose pairs, aliases and features, and corrupt line heights |
| P9 | A DESIGN.md whose tokens sit only in markdown tables has 0 tokens, 0 errors and 0 warnings | `TOKENS_IN_PROSE` |
| P10 | The linter's CSS-variables export names are `--color-{n}`, `--spacing-{n}` and `--rounded-{n}` | Binding tries these names (section 5.2) |

### 4.4 DTCG parser

Code: `app/lib/own-contract/dtcg.ts`, written against the W3C Design Tokens Format Module 2025.10. The tree is walked with `Map`-based structures and plain key iteration. No parsed object is ever spread, merged or assigned into another, so a group named `__proto__` or `constructor` is just a name.

Rules from the format:

- An object with `$value` is a token; any other object is a group. Keys starting with `$` are skipped, except `$root`.
- **Type:** the token's own `$type`; else, when the whole value is a reference, the referenced token's type; else the nearest group's `$type`. The type is never guessed from the value ("Tools MUST NOT attempt to guess the type of a token by inspecting the contents of its value"). A token with no type is skipped with a `NO_TYPE` warning.
- **References:** curly braces `{group.token}` (a reference to a group with a `$root` token resolves to it) and JSON Pointer `{ "$ref": "#/group/token" }`, including a pointer into a composite value (`#/group/token/$value/member`). References inside composite values resolve too.
- **Group inheritance:** `$extends` on a group (a curly reference, a plain path or a JSON Pointer) copies the base group's tokens under the extending group. Local tokens win at the same path. An extending group that states no `$type` takes the base group's. An `$extends` target that does not exist is `ALIAS_UNRESOLVED`.
- **Cycles** in references and in `$extends` are `ALIAS_CYCLE`, one problem per loop, with the loop as `chain` starting at its smallest path.
- **`$deprecated`** is recorded on the token.
- **`$extensions`:** the reader uses the `org.designesy` key. Other extension keys are ignored.
- The root `$description` is the contract's `name`.

Type mapping:

| `$type` | Model | Notes |
|---|---|---|
| `color` | `colors[]` | An object `{ colorSpace, components, alpha?, hex? }`. Converted from `srgb`, `srgb-linear`, `hsl`, `hwb`, `lab`, `lch`, `oklab`, `oklch`, `display-p3`, `xyz`, `xyz-d65` and `xyz-d50` (a component of `none` reads 0). Any other space uses `hex` when present; else a `COLOR_SPACE_UNSUPPORTED` warning and the color is skipped. A string holding any CSS color is accepted with a `LEGACY_COLOR_STRING` warning. Anything else is `VALUE_INVALID`. |
| `dimension` | `radii`, `spacing`, `sizes`, or a type style's `fontSize` or `lineHeight`, by role (below) | `{ value, unit }` or a string such as `"16px"`; units px, rem or em |
| `fontFamily` | `families[]` | a string or a list |
| `duration` | `durations[]` | `{ value, unit: 'ms' \| 's' }` or a string such as `"200ms"` |
| `cubicBezier` | `easings[]` | 4 numbers, or a CSS keyword or `cubic-bezier()` string |
| `number` | a type style's `lineHeight` ratio when the role is line height; else not read | |
| `typography` | `typography[]` | composite: `fontFamily`, `fontSize`, `fontWeight`, `letterSpacing`, `lineHeight` (a number is a ratio, a dimension a length); `features` come from the extension |
| `transition` | `durations[]` and `easings[]` from `duration` and `timingFunction` (4 numbers) | `delay` ignored |
| `border`, `shadow`, `gradient` | their color sub-values join `colors[]` as nested colors | geometry not scored |
| `fontWeight`, `strokeStyle`, other types | not read | |

**Dimension role**, first rule that holds: `$extensions["org.designesy"].role` on the token or its nearest group (`radius`, `spacing`, `size`, `fontSize`, `lineHeight`); else the path segments, lower-cased, where a segment matches a word when it equals it, starts with `word-` or ends with `-word`:

1. `radius`, `radii`, `rounded`, `corner` give radius;
2. `font-size`, `fontsize`, `text-size`, `type-scale` give fontSize;
3. `line-height`, `lineheight`, `leading` give line height;
4. `space`, `spacing`, `gap`, `inset`, `gutter`, `stack` give spacing;
5. `size`, `height`, `width`, `target`, `control` give size.

A dimension with no role gets a `DIMENSION_ROLE_UNKNOWN` warning and is used in no check. This classifies a token's role for the checks; it never guesses its DTCG type. A size is interactive when the extension's `interactive` is `true`, or, without that key, when its path contains `button`, `btn`, `input`, `field`, `select`, `chip`, `tab`, `link`, `toggle`, `checkbox`, `radio`, `switch`, `target` or `control`.

**The `org.designesy` extension.** At the root:

```json
{
  "$extensions": {
    "org.designesy": {
      "pairs": [
        { "text": "{color.text.default}", "background": "{color.surface.default}" },
        { "text": "{color.on-primary}", "background": "{color.primary}", "role": "primary-action", "largeText": false }
      ],
      "tokenMap": { "color.primary": "--brand" }
    }
  }
}
```

A pair end is a curly reference or a literal color (a literal becomes a nested color). A pair reference that does not resolve is `ALIAS_UNRESOLVED`. `role` is `primary-action` or, by default, a component pair.

On a token or a group: `"$extensions": { "org.designesy": { "role": "radius", "cssVar": "--radius-md", "interactive": true, "features": ["tnum"] } }`. `role`, `interactive` and `features` are inherited from the nearest group that sets them. `cssVar` is read from the token itself only.

### 4.5 Contract-level checks run at intake

- **Confusable names:** v36's per-string helper runs over every token path, every type-style field path (`.fontSize`, `.lineHeight`, `.fontFamily`, `.letterSpacing`) and every token-map variable. Each lookalike character is one `CONFUSABLE_NAME` warning with the character, its Unicode script, its code point (hex), its 1-based position in the name and, when the confusable table names one, the Latin letter expected.
- **Linter warnings** (DESIGN.md) are carried as `LINT_WARNING` in `ownContract.problems`. They are shown and never scored. v37's question, "does the DESIGN.md lint?", becomes this precondition.

### 4.6 Minimum scoreable contract

A contract is accepted when all of these hold:

1. It parses: no `YAML_INVALID`, `JSON_INVALID`, `NO_TOKENS_FOUND`, `TOKENS_IN_PROSE`, `DUPLICATE_SECTION`, `LINT_ERROR`, `TOKEN_DROPPED`, `VALUE_INVALID`, `ALIAS_UNRESOLVED`, `ALIAS_CYCLE`, `ALIAS_TOO_DEEP`, `TOO_DEEP` or `TOO_MANY_TOKENS`.
2. At least 3 colors resolve to a value (`TOO_FEW_COLORS`). Nested colors do not count.
3. At least 1 type style has both a font family and a font size (`NO_TYPE_STYLE`). For DTCG, a contract that declares a family anywhere and a font size anywhere (for example a `fontFamily` token and a dimension with the fontSize role) also meets this.
4. The token map is valid (section 5.3).

Radius, spacing, components, durations and easings are optional. Their checks SKIP with `skipReason: 'not_declared'`. A contract that fails rule 2, 3 or 4 gets every one of those problems in one answer.

### 4.7 Problem codes

Code: `app/lib/own-contract/problems.ts`. Contract problems:

| Code | HTTP | Severity | Meaning |
|---|---|---|---|
| `FORMAT_UNKNOWN` | 422 | error | the file is neither DESIGN.md nor DTCG |
| `YAML_INVALID` | 422 | error | the front matter is not valid YAML (`line`, parser message in `value`) |
| `JSON_INVALID` | 422 | error | the file is not valid JSON (`line`, `column`) |
| `NO_TOKENS_FOUND` | 422 | error | no YAML token groups, or a DTCG file with no tokens |
| `TOKENS_IN_PROSE` | 422 | error | tokens listed in markdown tables, none in YAML |
| `DUPLICATE_SECTION` | 422 | error | a `##` heading appears twice (`heading`, `line`) |
| `LINT_ERROR` | 422 | error | a linter error with no structured code for its path (`rule`, `linterMessage`) |
| `TOKEN_DROPPED` | 422 | error | a declared token missing from the resolved model (`reason`, `ref`) |
| `VALUE_INVALID` | 422 | error | a value is not a valid color, dimension, duration, curve, font family or text style (`kind`) |
| `ALIAS_UNRESOLVED` | 422 | error | a reference target does not exist (`ref`) |
| `ALIAS_CYCLE` | 422 | error | references loop (`chain`) |
| `ALIAS_TOO_DEEP`, `TOO_DEEP`, `TOO_MANY_TOKENS`, `CONTRACT_TOO_COMPLEX` | 422 | error | limits in 4.2 (`count`, `limit`) |
| `TOO_FEW_COLORS`, `NO_TYPE_STYLE` | 422 | error | the minimum in 4.6 |
| `TOKEN_MAP_INVALID` | 422 | error | a map key that is not a token path (`key`), a value that is not a CSS variable name (`value`), or too many entries (`count`) |
| `CONTRACT_URL_UNREACHABLE` | 422 | error | the linked contract could not be fetched (`url`, `why`, `status`) |
| `contract_too_large` | 413 | error | the contract is over 256 KB |
| `NO_TYPE`, `LEGACY_COLOR_STRING`, `COLOR_SPACE_UNSUPPORTED`, `DIMENSION_ROLE_UNKNOWN`, `CONFUSABLE_NAME`, `LINT_WARNING` | 200 | warning | carried in `ownContract.problems` |

Request codes (section 10.2): `body_too_large` (413), `scope_conflict` (400), `contract_shape` (400), `format_unsupported` (400), `rate_limited` (429).

Every problem's `message` is a plain sentence. The page builds its own copy from the structured fields. A message and the `value`, `ref`, `key` and `chain` fields carry at most 80 characters of anything the caller sent, with control characters shown as spaces. Problems go to the caller only and are never logged (section 13).

---

## 5. Binding and coverage

### 5.1 Reading the page

Code: `app/lib/own-contract/css.ts` and `app/lib/own-contract/extract.ts`. One hand-written, linear pass over the page's CSS (inline plus fetched). Strings, comments and parentheses are respected, so a brace inside `content: "{"` or `url(...)` does not end a rule.

- **Root custom properties:** declarations in blocks whose selector is `:root`, `:host`, `:root, :host`, `html`, or `:root, html`, also inside `@layer`. Never from a block under `@media`, `@supports` or another condition, and never from a theme selector. Theme variants are out of this version; the DESIGN.md format has no theme concept.
- **Usage CSS:** every other declaration of a style rule, minus custom properties, vendor-prefixed properties and theme blocks. Theme blocks are selectors with `[data-theme`, `[data-mode` or `[data-color-scheme`, a `.dark`, `.light` or `.theme-*` class, and anything under `prefers-color-scheme`. Declarations inside other `@media`, `@supports`, `@layer`, `@container` and `@scope` blocks count. `@font-face`, `@keyframes`, `@page` and `@property` blocks are not usage. A literal is counted where it is used.
- **Values:** every value goes through `var()` resolution against the root custom properties first, with fallbacks, up to 8 levels deep. A declaration whose `var()` cannot be resolved is left out. Extractors:
  - colors from `color`, `background-color`, `background`, `border` and its sides and color longhands (physical and logical), `outline`, `outline-color`, `fill`, `stroke`, `caret-color`, `accent-color`, `text-decoration` and `text-decoration-color`;
  - font sizes from `font-size` in px or rem, with `clamp()` giving its two absolute bounds;
  - faces from the first named family of each `font-family` stack;
  - line heights from `line-height` (unitless as ratios, px and rem as lengths), each with the px font size of its own rule;
  - radii from `border-radius` and its longhands, one value per component;
  - spacing from every component of `padding*`, `margin*`, `gap`, `row-gap`, `column-gap` and the `grid-` gap forms;
  - target sizes from `min-height`, `min-width`, `min-block-size` and `min-inline-size`;
  - durations and curves from `transition`, `transition-duration`, `transition-timing-function`, `animation`, `animation-duration` and `animation-timing-function`. In a shorthand, the first time is the duration.
- **Exclusions:** `0`, `auto`, `inherit`, `initial`, `unset`, `currentColor`, `transparent`, percentages, viewport units, em, and `calc()`, `min()` and `max()`. `clamp()` counts only for font sizes. Colors inside gradients, `url()` and images, and in `box-shadow` and `text-shadow`, are not counted for f02.

### 5.2 Locating a declared token

Code: `app/lib/own-contract/bind.ts`. A declared token is **located** when one of these holds; the first that holds is recorded:

1. **By map:** the token map (request or `$extensions`) names a CSS variable, and the page declares it as a root custom property. A mapped token whose variable is absent stays unlocated and is not tried by name or value.
2. **By name:** a candidate variable is a root custom property on the page. Candidates are built from the path, lower-cased, with `.`, `_` and `/` replaced by `-` and `$root` segments removed. `{n}` is the path without its first (group) segment; `{full}` is the whole path; `{style}` is the type style's name:

   | Token | Candidates, in order |
   |---|---|
   | color | `--color-{n}`, `--{full}`, `--{n}` |
   | font size of a type style | `--text-{style}`, `--font-size-{style}`, `--{full}` |
   | line height of a type style | `--leading-{style}`, `--line-height-{style}`, `--{full}` |
   | family of a type style | `--font-{style}`, `--font-family-{style}`, `--{full}` |
   | standalone family | `--font-{n}`, `--{full}`, `--{n}` |
   | radius | `--radius-{n}`, `--rounded-{n}`, `--{full}`, `--{n}` |
   | spacing | `--spacing-{n}`, `--{full}`, `--{n}` |
   | size, duration, easing | `--{full}`, `--{n}` |

   These cover the linter's Tailwind v4 and CSS-variables export names and the usual DTCG export form (`--color-brand-500`). When two candidates on the page hold different values (compared in normalized form), the token is not located by name, and a `BINDING_AMBIGUOUS` note goes to coverage. Nested values have no candidates.
3. **By value:** the normalized value appears on the page. A color matches any color in usage CSS or in a root custom property. A font size, radius, spacing value or size matches a shipped value of that kind (sizes read `height`, `width`, `min-*`, `max-*` and `*-size`) or any length a root custom property holds. A family matches a shipped face or the first family of a root custom property. A line height, duration or curve matches a shipped one within the tolerances of section 6.3.

No regular expression is ever built from a token name, a map entry or a value. Names are compared with string equality on normalized forms.

### 5.3 Token map validation

The token map comes from the contract (`$extensions["org.designesy"].tokenMap`) and from the request (`contract.tokenMap`). The request's entries win over the contract's.

- A key must be a token path in the contract, or a type style's field path (`<style>.fontSize`, `.lineHeight`, `.fontFamily`, `.letterSpacing`). A font size can be mapped by the style's path or by its `.fontSize` path.
- A value must match `^--[A-Za-z0-9_-]{1,128}$`.
- At most 500 entries.

A breach is `TOKEN_MAP_INVALID` (422). In the request, a token map that is not an object, or a value that is not a string, is 400 `contract_shape`. A mapped variable that the page does not declare leaves the token unlocated. That is not an error: the page may not use it.

### 5.4 Coverage

```ts
interface Coverage {
  declared: number;                 // section below
  located: number;
  byMap: number; byName: number; byValue: number;
  ratio: number;                    // located / declared, rounded to 3 places; 0 when nothing is declared
  groups: Record<GroupName, { declared: number; located: number; shippedCompared: number }>;
  notes: string[];
  hint: string | null;
}
```

- **Declared** counts colors, font sizes of type styles, distinct faces (each face once, located when any token naming it is), radii, spacing, sizes, durations and easings. Nested values and line heights are not counted.
- **`shippedCompared`** is the number of distinct shipped values the group's check compared (colors from f02, typography from f03 and f04, radii from f07, spacing from f08, sizes from f12, durations and easings from f11).
- **Notes:** `BINDING_AMBIGUOUS <path>: <names> hold different values`; `STYLESHEET_CAP` when the page links more than 60 stylesheets; `STYLESHEETS_MISSING` when some could not be read before the deadline or answered with an error.
- **Hint:** when the ratio is under 0.20: "Only n of m declared tokens were found on this page. If your CSS variables have other names, add a token map."

Coverage is reported on every scored result, and it is `null` when the site could not be fetched. It is **not** a gate (section 9 explains why).

---

## 6. Fidelity checks

Code: `app/lib/own-contract/checks/`, and `app/lib/own-contract/formula.ts` for titles, thresholds and minimums.

### 6.1 Overview

| ID | Title | Category | Derived from | Reads | Can FAIL |
|---|---|---|---|---|---|
| f01 | Mapped tokens ship their declared values | tokens | v01 | tokens located by map or name | yes |
| f02 | Shipped colors are in your palette | color | d03, d05 | `colors` | yes |
| f03 | Shipped font sizes are on your type scale | typography | v16 | type style font sizes | yes |
| f04 | Shipped font families are in your contract | typography | v26 | `families`, type style families | yes |
| f05 | Shipped line heights are in your contract | typography | v17 | type style line heights | yes |
| f06 | Declared font features ship | typography | v19 | type style features | no (WARN at most) |
| f07 | Shipped corner radii are on your radius scale | shape | d07 | `radii` | yes |
| f08 | Shipped spacing is on your spacing scale | spacing | d04 | `spacing` | yes |
| f09 | Declared text and background pairs meet contrast on shipped values | contrast | v06 | `pairs` (role `component`) | yes |
| f10 | Your primary action pair meets contrast on shipped values | contrast | v22 | `pairs` (role `primary-action`) | yes |
| f11 | Shipped durations and easings are in your contract | motion | v23 | `durations`, `easings` | yes |
| f12 | Interactive targets meet your declared minimum size | targets | v24 | `sizes` with `interactive` | yes |
| f13 | Declared aliases ship as variable references | tokens | v29 | `aliases` | no (WARN at most) |
| f14 | Styles use your contract's tokens | tokens | the token-versus-raw ratio | all located tokens | yes |

The legacy checks these replace (v01, v06, v16, v17, v19, v22, v23, v24, v26, v29) are off in this mode. v37 (DESIGN.md format lint) becomes the intake precondition of section 4.5. f02, f07, f08 and f14 have no legacy counterpart that reads a declared scale.

### 6.2 Common rules

- **Statuses:** PASS, WARN, FAIL, SKIP. SKIP carries `skipReason`: `not_declared` (the contract declares nothing for the check, or omits the group), `not_located` (the page did not show enough values, or not enough tokens were located), `not_applicable` (f11 with a DESIGN.md contract).
- **Share thresholds:** PASS when the in-contract share is at least 0.90, WARN from 0.70, FAIL below 0.70. The share is over **distinct** shipped values. Uses per value are reported. These bars are stricter than d04's 0.80 and 0.50, because a declared scale is a firmer commitment than an inferred cluster. f02, f03, f05, f07, f08 and f11 use them; the other checks state their own rules in section 6.3.
- **Evidence minimum:** below it the check SKIPs `not_located`.
- **Every result carries** `layer: 'fidelity'`, `item` (the title), `category`, `reads` (the published description of what it reads, per format), `derivedFrom`, and `remediation` on WARN and FAIL. `declared` and `shipped` evidence lists stop at 20 entries. `evidence.findings` stops at 20 entries and counts the rest in `truncated`.

### 6.3 Per-check rules

Tolerances used below: colors within 1 per RGB channel (and 0.01 alpha where alpha is compared); px values within 0.01px; ratios within 0.01; curves within 0.001 per point; durations exactly.

**f01 Mapped tokens ship their declared values.** For each non-nested token located by map or name, the page's resolved custom property against the declared value: colors with alpha compared, px values, em values as written, line heights as ratio or length, durations, curves, and faces case-folded. PASS when all match; WARN when at least 90% match; FAIL below 90%. Minimum: 3 tokens located by map or name. Evidence: each mismatch as `{ path, declared, shipped, cssVar }`.

**f02 Shipped colors are in your palette.** Shipped: distinct base colors in usage CSS from the color properties of section 5.1. A shipped color is in the palette when its RGB is within 1 per channel of any declared color, nested colors included. Alpha is ignored for membership, because opacity variants are the same base color. Minimum: 3 distinct shipped colors. Evidence: each color outside the palette with its nearest declared color (by OKLab distance), its uses and its first 3 selectors. The detail reads "n of m shipped colors are in your palette (90% needed to pass)", then the colors outside it.

**f03 Shipped font sizes are on your type scale.** Declared: every type style font size in px or rem. Shipped: distinct `font-size` values in px or rem; em and keywords are left out; `clamp()` contributes its two bounds when both are absolute. On the scale when within 0.01px of a declared size. Share thresholds. Minimum: 3 distinct sizes. SKIP `not_declared` when the contract declares no font size.

**f04 Shipped font families are in your contract.** Shipped: the first named family of each `font-family` stack, `var()` resolved, generic keywords skipped. next/font names fold to the face (`__Inter_aaf875` and `__Inter_Fallback_aaf875` read `Inter`), and an `X Fallback` face reads `X`. Roboto, Helvetica, Arial and Segoe UI count as real faces, so an undeclared one is caught. Declared: every name in every declared stack (the face and its fallbacks). PASS when every shipped face is declared; WARN with 1 undeclared face; FAIL with 2 or more. Minimum: 1 shipped face.

**f05 Shipped line heights are in your contract.** Declared: each type style's line height as a ratio (directly, or as a length over the style's px or rem font size) and, for lengths, as px. Shipped: distinct `line-height` values; unitless as ratios, px and rem as lengths. In the contract when a ratio is within 0.01 of a declared ratio, or a length within 0.01px of a declared length, or a length divided by its own rule's font size is within 0.01 of a declared ratio. Share thresholds. Minimum: 3 distinct line heights.

**f06 Declared font features ship.** For each declared feature tag, PASS when the usage CSS has it in `font-feature-settings` (and not set to `0` or `off`), or has the matching `font-variant*` keyword: `tnum` tabular-nums, `lnum` lining-nums, `onum` oldstyle-nums, `pnum` proportional-nums, `zero` slashed-zero, `smcp` small-caps, `c2sc` all-small-caps, `frac` diagonal-fractions, `afrc` stacked-fractions, `ordn` ordinal. WARN when any declared tag is missing; never FAIL. No evidence minimum. SKIP `not_declared` when no style declares a feature. For DTCG, features come only from the `org.designesy` extension.

**f07 Shipped corner radii are on your radius scale.** Shipped: each component of `border-radius` and its longhands. Left out: `0`, percentages (circles and ellipses are geometry), values under 2px (hairlines) and em. There is no pill cutoff: a contract may declare a 48px radius. When the contract declares a "full" radius (999px or more), any shipped radius larger than the largest finite declared radius counts as that full radius; without a declared full radius it is off the scale. Share thresholds. Minimum: 3 distinct radii.

**f08 Shipped spacing is on your spacing scale.** Shipped: every component of the spacing properties of section 5.1, negative margins as their size, `var()` resolved. On the scale when within 0.01px of a declared spacing value. Share thresholds. Minimum: 5 distinct values.

**f09 Declared text and background pairs meet contrast on shipped values.** For each `component` pair whose two colors are located: when both are located by map or name and both shipped values read as colors, the page's values are used ("shipped values"); otherwise the declared values are used, and the detail says "evaluated on declared values; not located by name". A pair with a color that is not located is left out. The WCAG 2.x ratio, with a translucent background composited over white and translucent text over the background: PASS at 4.5 or more (3 or more when `largeText`), WARN from 3, FAIL below 3. APCA Lc is reported and never scored. The worst pair decides (FAIL before WARN before PASS, then the lowest ratio). Evidence per pair: `source`, `text`, `background`, `ratio`, `need`, `apcaLc`, `values` (`shipped` or `declared`) and `declaredRatio`. A ratio is shown to one decimal, except where rounding would carry it across a band: 4.48 reads "4.48", never "4.5". SKIP `not_declared` when there is no component pair; SKIP `not_located` when no pair could be measured. Ceiling on FAIL: 65.

**f10 Your primary action pair meets contrast on shipped values.** As f09, for the `primary-action` pair. SKIP `not_declared` when there is none. Ceiling on FAIL: 70.

**f11 Shipped durations and easings are in your contract.** DTCG only; a DESIGN.md contract SKIPs `not_applicable`, because the format has no motion group. Durations in ms must equal a declared duration (`0s` left out). Curves, with keywords mapped (section 3.2), must be within 0.001 per point of a declared curve. Each declared kind gets a share; the worse status decides. Minimum: 2 distinct shipped durations, or 2 distinct shipped curves when the contract declares easings and no durations. SKIP `not_declared` with no duration or easing token.

**f12 Interactive targets meet your declared minimum size.** Floor: the larger of 24px (WCAG 2.5.8 AA) and the smallest declared interactive size. Shipped: explicit `min-height`, `min-width`, `min-block-size` and `min-inline-size` in px or rem on interactive selectors (`button`, `a`, `input`, `textarea`, `select`, a `[role=button]` attribute, `.btn`, `.button`, `.chip`, `.tab`, `.nav-link`). FAIL when any is under 24px; WARN when any is under the floor; PASS otherwise. SKIP `not_declared` when no interactive size is declared; SKIP `not_located` when no explicit size is found. Static CSS cannot see padding or rendered size, so the detail says "explicit sizes only".

**f13 Declared aliases ship as variable references.** For each alias whose two ends are located by map or name: shipped as a reference when the first `var()` in the alias variable's value names the target's variable (a fallback is allowed); flattened otherwise. PASS when at least 80% ship as references; else WARN. Minimum: 2 evaluable aliases.

**f14 Styles use your contract's tokens.** Measurable declarations: usage declarations of the f02, f03, f04, f05, f07 and f08 properties whose resolved value is not empty and not a keyword (`inherit`, `initial`, `unset`, `revert`, `none`, `auto`, `0`, `transparent`, `currentcolor`, `normal`). A declaration uses your token when it references a variable that is located by map or name, or a root variable whose value is a declared value of the declaration's kind (color, family, font size, radius or spacing). PASS at 0.80 or more; WARN from 0.50; FAIL below 0.50. Minimum: 10 measurable declarations, and at least 3 tokens located by map or name; else SKIP `not_located`, because a `var()` cannot be attributed to the contract.

---

## 7. Baseline layer

Code: `app/lib/own-contract/baseline.ts`. The baseline is 18 universal checks that read no contract. The route runs them exactly as it runs them for a score without a contract:

v02, v03, v05, v07, v09, v11, v12, v21, v25, v27, v34, v35, v36, v38, v39, v40, v44, v45.

They are listed in registry order. v02 and v21 are MANUAL in the static engine. No scope filter applies.

Off in this mode: every other registry check. That is the Designesy-specific checks; the checks a fidelity check replaces or intake covers (section 6.1); v42, v43 and v46 (v46 measures type sizes against the page's own scale, which f03 measures against the team's scale); and the slop deduction and originality lift.

Check objects keep their registry `category` (so v09 stays `poise` in the check list). Baseline scoring uses its own grouping (section 8.3).

**Customer-facing titles.** Each baseline check has a `contractTitle` in the check registry (`app/lib/check-definitions.ts`). In contract mode the check's `item` is its `contractTitle`, so no baseline title names Designesy's own features. Requests without a contract keep the registry `item`. A test asserts that all 18 carry a `contractTitle` and that none contains "Poise", "Takt", "wordmark" or "Designesy".

---

## 8. Scoring

Code: `app/lib/own-contract/score.ts`.

### 8.1 Rule (both layers)

The engine's existing rule: each category's weight is shared equally by its scored checks. PASS earns the share, WARN half, FAIL nothing. SKIP and MANUAL leave both the points and the weight. Score = points over the weight in play, times 100, to one decimal (`Math.round(x * 1000) / 10`). Grades: A from 90, B from 80, C from 70, D from 60, else F, taken from the score after any cap. No slop deduction, no originality lift. The two layers are never blended.

### 8.2 Fidelity weights and ceilings

| Category | Checks | Weight |
|---|---|---|
| contrast | f09, f10 | 20 |
| typography | f03, f04, f05, f06 | 18 |
| color | f02 | 16 |
| tokens | f01, f13, f14 | 14 |
| spacing | f08 | 12 |
| shape | f07 | 8 |
| motion | f11 | 6 |
| targets | f12 | 6 |
| **Total** | 14 checks | **100** |

Ceilings, applied after scoring: an f09 FAIL caps fidelity at 65; an f10 FAIL caps it at 70. A ceiling only ever lowers a score, so when both fail the lower cap wins. There is no accessibility floor on fidelity; contrast already carries 20%. When a ceiling lowers the score, `ceilingApplied` is true, `ceilingReason` names the pair and its ratio, and `uncappedScore` carries the score before the cap.

Fewer than 3 scored fidelity checks is no score (section 9).

**Worked example.** Statuses: f02 FAIL; f03, f04, f07, f09 PASS; f05, f08, f10, f14 WARN; f01, f06, f11, f12, f13 SKIP. Category points: contrast 10 + 5 = 15 of 20; color 0 of 16; typography 6 + 6 + 3 = 15 of 18; spacing 6 of 12; tokens 7 of 14; shape 8 of 8; motion and targets out. Total 51 of 88: 51 / 88 = 0.57954..., so 58.0, grade F. No ceiling (f10 is a WARN). `scripts/check-own-contract.mjs` asserts this example.

### 8.3 Baseline grouping and floor

| Group | Checks | Weight |
|---|---|---|
| accessibility | v25, v27, v35, v44 | 15 |
| keyboard | v03, v09 | 13 |
| motion | v05, v11, v12, v45 | 10 |
| copywriting | v38, v39, v40 | 8 |
| identity | v07, v34 | 6 |
| security | v36 | 5 |
| responsive | v02 (MANUAL) | 3 |
| performance | v21 (MANUAL) | 6 |

The weights are the engine's category weights; keyboard is interaction 6 plus poise 7, so the two keyboard checks keep their combined weight. Static maximum: 57.

Caps, in this order, each applied only when it lowers the score:

1. **Accessibility floor:** when the accessibility group averages under 60% (PASS 1, WARN 0.5, FAIL 0), the baseline is capped at 70 and `a11yFloorApplied` is true.
2. **No A while any baseline check fails:** any FAIL caps the baseline at 89.9, as the URL score does.
3. **Registry ceilings** of the automatic baseline checks: a v25 FAIL caps at 75; a v44 FAIL caps at 65.

When a cap lowers the score, `ceilingReason` says which and `uncappedScore` carries the score before it. `ceilingApplied` is true for caps 2 and 3. The baseline differs from the leaderboard score for the same URL, because the leaderboard runs every check plus the slop deduction and the originality lift. The published formula says so.

---

## 9. Null scores

Code: `app/lib/own-contract/nulls.ts` and `app/lib/own-contract/run.ts`.

| Reason code | When | Fidelity | Baseline |
|---|---|---|---|
| `site_unreachable` | the page could not be fetched | no score | no score |
| `empty_shell` | the heuristic below holds | no score | no score |
| `no_css` | inline plus fetched CSS is under 500 bytes after trimming | no score | no score |
| `too_few_checks` | fewer than 3 fidelity checks reached PASS, WARN or FAIL | no score | scored |

A layer with no score has `score: null`, `grade: null` and `nullReason: { code, detail }`, where `detail` is the sentence the page shows. `empty_shell` is tested before `no_css`. Under `empty_shell` and `no_css` the checks still run and are listed. Under `site_unreachable` there are no checks, `coverage` is `null`, and the response adds `unreachable: true`, `unreachableReason` and `unreachableDetail`. The receipt for a null layer still carries the verdict digest when any check ran.

**Empty-shell heuristic**, evaluated on the fetched HTML, in this mode only:

1. Visible text, after removing `script`, `style`, `noscript` and `template` elements and all tags, is under 280 characters; and
2. the page has an empty mount node: an element with `id` `root`, `app`, `__next`, `__nuxt` or `svelte`, or an `app-root` element, whose content up to its closing tag is only whitespace; and
3. at least one `script` element has a `src` attribute or `type="module"`.

**Why coverage is not a gate.** A team with a 400-token system scoring a landing page that uses 40 of them, all on contract, would get 10% coverage. Withholding that result would hide a correct, clean measurement. The concern that a half-read contract must not produce a grade that looks complete is met at the check level instead: each check needs its own evidence minimum (section 6), checks without evidence SKIP `not_located`, and fewer than 3 scored checks means no fidelity score. Coverage is always shown, with a hint below 20%.

**Pages with no custom properties.** A page with literal CSS and no custom properties is readable by value: f02, f03, f04, f05, f07, f08 and f09 (on declared values) still run; f01, f13 and f14 SKIP `not_located`. If that leaves fewer than 3 scored checks, `too_few_checks` applies.

---

## 10. API changes

Code: `app/lib/own-contract/api.ts`, called from the `POST` handler in `app/api/score/route.ts`.

### 10.1 Request

```ts
type ScoreRequest = {
  url: string;
  format?: 'designesy';                        // with `contract`, any other format -> 400 format_unsupported
  scope?: string;                              // with `contract`: 'contract' -> 400 scope_conflict; anything else ignored
  contract: {
    content?: string;                          // inline DESIGN.md or DTCG JSON, at most 256 KB
    url?: string;                              // a public URL; exactly one of content and url
    format?: 'auto' | 'design.md' | 'dtcg';    // default 'auto'
    tokenMap?: Record<string, string> | null;  // contract path -> CSS custom property
  };
};
```

Validation order: JSON body (400) -> `url` (400) -> `format` known (400) -> `format` is `designesy` (400 `format_unsupported`) -> body size (413 `body_too_large`) -> `scope` conflict (400 `scope_conflict`) -> `contract` shape (400 `contract_shape`) -> this mode's rate limit (429 `rate_limited`) -> linked contract fetch (413, 422) -> intake (413, 422) -> page fetch -> scoring.

`contract_shape` covers: `contract` is not an object; both or neither of `content` and `url`; `content` or `url` not a string; `format` not one of the three; `tokenMap` not an object; a `tokenMap` value not a string.

### 10.2 Status codes

| Code | Body | When |
|---|---|---|
| 200 | the result (10.3) | scored, or no score with a reason (section 9) |
| 400 | `{ ok: false, error, code? }` | bad JSON, URL or format; `format_unsupported`, `scope_conflict`, `contract_shape` |
| 413 | `{ ok: false, error, code }` | `body_too_large`, `contract_too_large` |
| 422 | `{ ok: false, error: 'Your contract cannot be scored yet.', code: 'contract_not_scoreable', problems: Problem[], warnings: Problem[], linter: LinterTotals \| null }` | intake failed (4.6, 4.7) |
| 429 | `{ ok: false, error, code? }`, with `Retry-After` when the limiter sends one | a rate limit (section 12) |
| 502 | `{ ok: false, error }` | an exception while scoring |

`error` stays a human string for existing parsers; `code`, `problems`, `warnings` and `linter` are additive. Every contract-mode response carries `Cache-Control: no-store`.

### 10.3 Response, `format=designesy`

```ts
type OwnContractResult = {
  ok: true;
  mode: 'own-contract';
  scope: 'own-contract';
  contractVersion: string;          // Designesy's rules version, which defines the baseline checks
  engineVersion: string;            // ENGINE_VERSION, '1.5.0' when the mode shipped
  score: number | null;             // = fidelity.score
  grade: string | null;             // = fidelity.grade
  fidelity: LayerResult;
  baseline: LayerResult & { a11yFloorApplied: boolean };
  coverage: Coverage | null;        // section 5.4; null when the site was unreachable
  ownContract: {
    name: string | null; format: ContractFormat; formatVersion: string | null;
    source: 'inline' | 'url'; url?: string; bytes: number; digest: string;
    tokens: Record<GroupName | 'pairs' | 'aliases', number>;   // nested values not counted
    omitted: string[];
    linter: LinterTotals | null;
    problems: Problem[];            // warnings only
  };
  site: { requestedUrl: string; htmlBytes: number; cssBytes: number;
          stylesheetsFetched: number; stylesheetsTotal: number; stylesheetsTruncated: boolean };
  unreachable?: true; unreachableReason?: string; unreachableDetail?: string;
  checks: CheckResultV2[];          // f01..f14, then the 18 baseline checks in registry order
  pass: number; warn: number; fail: number; skip: number; manual: number; total: number; scored: number; // over `checks`
  tokensExtracted: number;          // root custom properties the page reader found
  receipt: Receipt;                 // section 11.3
};

type LayerResult = {
  score: number | null; grade: string | null;
  scored: number; total: number; pass: number; warn: number; fail: number; skip: number; manual: number;
  categoryScores: Record<string, { score: number | null; weight: number; pass: number; warn: number; fail: number; skip: number; manual: number }>;
  ceilingApplied: boolean; ceilingReason: string | null;
  uncappedScore: number | null;     // the score before a ceiling or floor lowered it; else null
  nullReason: { code: 'site_unreachable' | 'empty_shell' | 'no_css' | 'too_few_checks'; detail: string } | null;
};

type CheckResultV2 = {                // a fidelity result; a baseline result is the registry check's result with `layer: 'baseline'`
  id: string; item: string; category: string;
  status: 'PASS' | 'WARN' | 'FAIL' | 'SKIP' | 'MANUAL';
  detail: string;
  layer: 'fidelity' | 'baseline';
  reads?: string[];
  declared?: Evidence[]; shipped?: Evidence[];
  derivedFrom?: string[];
  skipReason?: 'not_declared' | 'not_located' | 'not_applicable';
  remediation?: string;             // WARN and FAIL
  evidence?: { findings: Array<Record<string, string | number | null>>; truncated: number };
};
type Evidence = { path?: string; value: string; where?: string[]; uses?: number };
```

**Uncapped score.** When a ceiling or the floor lowers a layer's score, `uncappedScore` carries what the layer scored before it, so a team sees what fixing the capping check is worth ("Capped at 70. Without the cap: 83, grade B"). Its grade comes from the same grade function; there is no separate field. The receipt does not carry it: the receipt holds no scores, and the uncapped score is reproducible from the verdicts and the weights.

Not returned in this mode: top-level `slop`, `originality`, `categoryScores`, `a11yFloorApplied`, `hardFailCeilingApplied` and `hardFailCeilingReason`. Each lives under its layer, or does not apply.

### 10.4 Other formats in this mode

`review`, `google` and `canonical` are not available with a `contract`. A request with a `contract` and any of them answers 400 with `code: 'format_unsupported'`. Contract mode answers in `format=designesy` only.

### 10.5 Versioning and compatibility

1. A request without `contract` returns exactly what it returned before contract mode shipped (engine 1.4.1), apart from timestamps and the engine version. The compatibility test (section 15.4) pins this.
2. `ENGINE_VERSION` became `'1.5.0'` in the release that added this mode. Legacy verdicts did not move. Any later change to a fidelity threshold, weight, extractor or rule that can move a verdict for the same input bumps it again.
3. The published formula: the static route `GET /api/score/checks/own-contract` serves `ownContractFormula()` from `app/lib/own-contract/formula.ts`: the 14 fidelity checks with their categories, `reads`, minimums and criteria; the weights, ceilings and thresholds; the baseline checks, groups, static maximum, floor, any-FAIL cap and ceilings; the null rules; and the intake minimum, limits, error and warning codes and problem fields. It carries its own `version` and `date`, and the `engineVersion`. Any change to a threshold, weight, title or rule in it bumps the formula version. The checks, the scorer and the route read the same constants, so the page, the API and the engine cannot state different rules.
4. No URL versioning. The mode is opt-in by field; older clients never send `contract`.

---

## 11. Cache and receipt

### 11.1 Cache

Contract mode does not cache. It never calls the cached scoring path, and it does not cache the page fetch. Every contract run fetches the page fresh, so a fixed staging URL scored twice always shows its current state. Every response is `Cache-Control: no-store`.

### 11.2 Contract digest

Code: `app/lib/own-contract/digest.ts`. `ownContract.digest` is sha256 over the UTF-8 bytes of a canonical JSON of the model:

- **Included:** `format`; every token as `{ path, value }`, with colors as `#rrggbbaa` lowercase, dimensions as `{ value, unit }`, type styles as their families (lower-cased), font size, font weight, line height (`{ kind, value }` or `{ kind, value, unit }`), letter spacing and sorted features, sizes with `interactive`, durations in ms, curves as 4 numbers rounded to 6 places; `aliases`; `pairs` (source, text, background, role, largeText); `omitted` with reasons; and the merged `tokenMap`.
- **Excluded:** `name`, `formatVersion`, descriptions and prose, `problems`, `source`, and the order of keys and tokens.
- Objects have sorted keys; tokens are sorted by path, aliases by `from` and `to`, pairs and omissions by their canonical form; numbers use JavaScript's shortest round-trip form.

So editing prose, renaming the contract, reordering YAML keys, reformatting JSON or changing line endings does not change the digest. Changing a token value, a path, a pair, an alias, an omission or the token map does.

### 11.3 Receipt

Code: `ownContractReceipt` in `app/lib/own-contract/api.ts`, built on `app/lib/receipt.ts`. In this mode the receipt adds:

```ts
interface Receipt {
  // existing: subject, retrieved_at, contract_version, engine_version, scope, digest, digest_absent_reason?, verify
  scope: 'own-contract';
  own_contract: {
    digest: string;
    format: 'design.md' | 'dtcg';
    source: 'inline' | 'url';
    url?: string;                               // only for linked contracts
    linter?: string;                            // DESIGN.md only: '@google/design.md@0.4.0'
  };
}
```

- `digest` keeps its definition over the ordered `checks` list: fidelity first, then baseline. The IDs are distinct, so the verdict set is unambiguous. When no check ran (an unreachable site), `digest` is `null` with `digest_absent_reason`.
- `contract_version` keeps Designesy's rules version, which defines the baseline checks.
- `verify.instructions` in this mode: "POST the same URL with the same contract to /api/score. Compare own_contract.digest first: if it differs, the contract changed. Then compare digest: if it differs while engine_version matches, the page changed."

---

## 12. Rate limits and abuse controls

**Limits a client sees.**

- Contract mode allows each client IP 20 runs a minute and 300 a day. Over either limit, the answer is 429 with `code: 'rate_limited'` and a `Retry-After` header in seconds.
- Every request to `/api/score` also counts against the endpoint's general limits, with or without a contract. The edge limit's 429 carries `Retry-After`, `RateLimit-Limit`, `RateLimit-Remaining` and `RateLimit-Reset`. Some 429 answers carry no `Retry-After`.
- Wait at least `Retry-After` seconds before retrying. When a 429 has no `Retry-After`, back off before retrying. Retrying inside the window returns 429 again.

**Input safety rules** that contract-mode code keeps:

- **Regular expressions:** none is built from contract or page input. Parsers that see caller input are hand-written scanners or patterns run on short, bounded input, and each reads 1 MB of pathological input in under 200 ms (section 15.5).
- **Linked contracts:** fetched only through `safeFetch`, never `fetch`. Loopback, private, link-local and cloud metadata addresses are refused (`CONTRACT_URL_UNREACHABLE` with `why: blocked`).
- **Prototype safety:** DTCG walking uses `Map`; no parsed input is spread or merged; the request's token map is copied key by key into a null-prototype object.
- **Time:** intake has its own 1 s budget (4.2); the page fetch keeps its own deadlines.

---

## 13. Privacy

A contract-mode run stores nothing about the contract or the page.

| Data | Stored? | Notes |
|---|---|---|
| Contract text, model, token names or values | No | held in memory for the request only; never cached (11.1) |
| Result JSON | No | returned with `Cache-Control: no-store` |
| Scored URL, contract URL | No | kept out of counters and out of logs written by this code |
| Contract digest | No | returned to the caller only; no counter key is derived from it |
| Caller IP | Briefly | the rate limiters key their counters by IP for the length of each window; usage counters hold only a salted hash in a daily sketch (below) |

**Usage counters.** `app/lib/usage.ts` counts calls per UTC day. Every request that passes the general rate limits of `/api/score` counts once under `score:<client>`. A contract run that answers 200 also counts once under `score-contract:<client>`. `<client>` comes from the user agent and is one of `browser`, `mcp`, `action`, `cli` or `script`. Each key holds a call count and a HyperLogLog sketch of a salted hash of the caller's IP; the salt changes daily, so one caller cannot be linked across days, and a sketch cannot list its members. Keys come from closed lists and expire.

**Logs.** No `console.*` call in contract-mode code prints contract-derived data, the scored URL or the contract URL. Problems are returned to the caller and never logged. The test suite captures all console output during intake and asserts it stays empty.

**Client.** The web page keeps the contract text in page memory only. A shareable link (`/score/contract?url=&contract=`) can carry a linked contract's https URL, never contract text.

---

## 14. Surfaces

### 14.1 GitHub Action

The GitHub Action does not send a contract in engine 1.5.x. It scores against Designesy's contract or universal rules, as before.

### 14.2 MCP tool `designesy_score`

The MCP tools do not send a contract in engine 1.5.x. `designesy_score` keeps its schema.

### 14.3 CLI

The npm CLI scores locally with its own engine copy and has no contract mode in engine 1.5.x. The contract-mode code has no Next.js imports (`app/lib/own-contract/`), so a local engine can import it later instead of copying it. `packages/score/scripts/source-drift.mjs` compares the two engine copies; contract mode adds no top-level function to `route.ts`.

### 14.4 Web

`/score/contract` posts `{ url, contract }` and never sends `scope`. The contract is pasted or uploaded (`contract.content`) or linked (`contract.url`), always with `format: 'auto'`, plus an optional token map. The page's sentences are built from the result by pure functions in `app/score/contract/copy.ts`; `scripts/check-contract-copy.mjs` pins them.

---

## 15. Test plan

`scripts/check-own-contract.mjs` runs offline (no network) and in CI. It exits 1 on any failure. `--flip` expects an accepted contract to be rejected, to prove the gate can fail. `--update` rewrites the golden models; review the diff before committing. Fixtures live in `scripts/fixtures/own-contract/`.

### 15.1 Fixtures

Contracts, DESIGN.md:

| ID | Content | Expect |
|---|---|---|
| DM-1 | Full: colors in every format the linter accepts, type styles with unitless and px line heights, `fontFeature`, rounded, spacing, components with pairs, `button-primary` | accepted; the model matches `DM-1.golden.json` |
| DM-2 | Minimal: 3 colors, 1 type style | accepted; radius, spacing, sizes and pairs empty |
| DM-3a..e | 2 colors; no font size; a broken color reference (P3); no YAML (P7); tokens only in tables (P9) | 422 with `TOO_FEW_COLORS`, `NO_TYPE_STYLE`, `TOKEN_DROPPED`, `NO_TOKENS_FOUND`, `TOKENS_IN_PROSE` |
| DM-4 | `omitted: [spacing, {section: rounded, reason: ...}]` | omissions recorded by group with their reason; f07 and f08 `not_declared` |
| DM-5 | Duplicate `## Colors` (P4) | 422 `DUPLICATE_SECTION` with the heading and line |
| DM-6 | A confusable token name | accepted with `CONFUSABLE_NAME` |
| DM-7 | A reference loop | 422 `ALIAS_CYCLE` with the chain; a token reaching the loop is `TOKEN_DROPPED` `alias_cycle` |
| DM-8 | A color referencing a radius | 422 `TOKEN_DROPPED` `alias_wrong_type` |
| DM-9 | Malformed YAML | 422 `YAML_INVALID` with the file line |
| DM-10 | An invalid color and a `16pt` radius (P6) | 422 `VALUE_INVALID` per path, with `linterFinding`; no `LINT_ERROR` or `TOKEN_DROPPED` beside them |
| DM-11 | Tokens in a fenced `yaml` block | accepted |

Contracts, DTCG:

| ID | Content | Expect |
|---|---|---|
| DT-1 | Full 2025.10: colors in several spaces with and without `hex`; dimensions with role by path and by extension; durations; cubicBezier; typography; transition; border and shadow; `org.designesy` pairs and tokenMap | accepted; the model matches `DT-1.golden.json` |
| DT-2 | Legacy hex strings | accepted with `LEGACY_COLOR_STRING` each |
| DT-3 | `$type` only on groups | types inherited |
| DT-4 | Curly alias chain, 3 hops | resolved; each alias recorded |
| DT-5 | `$ref` JSON Pointer, to a token and to a composite member | resolved |
| DT-6 | `$extends` with an override | the local token wins; the rest are inherited |
| DT-7a, DT-7b | An alias cycle; an `$extends` cycle | 422 `ALIAS_CYCLE`, one problem, the ordered chain |
| DT-8 | A token with no type to inherit | skipped with `NO_TYPE` |
| DT-9 | Groups named `__proto__` and `constructor` | parsed as names; no prototype change |
| DT-10 | Generated: 2,001 tokens; 17-level nesting; 300 KB | 422 `TOO_MANY_TOKENS`, 422 `TOO_DEEP`; 413 |
| DT-11 | Malformed JSON | 422 `JSON_INVALID` with line and column |

Parity: PAR-1, one system written as DESIGN.md and as DTCG (`acme-design.md`, `acme-tokens.json`), reads to the same counts and gives the same statuses for f02, f03, f04, f05, f07, f08 and f09 on site fixtures S-1 to S-3. Paths differ, so digests differ.

Sites (static HTML and CSS; the tests inject the page fetcher, because the URL guard refuses local hosts by design and must not be relaxed):

| ID | Page | Expect with DM-1 |
|---|---|---|
| S-1 | On contract, Tailwind v4 variable names | fidelity A; every token located by name |
| S-2 | Drifted: off-palette colors, off-scale spacing, one flattened alias, a primary pair under 4.5 to 1 | f02 FAIL, f08 FAIL, f13 WARN, f10 WARN |
| S-3 | No custom properties; literal values that match the contract | scored by value; f01, f13, f14 `not_located` |
| S-4 | Empty React mount, one module script | both layers no score, `empty_shell` |
| S-5 | HTML with no CSS | both layers no score, `no_css` |
| S-6 | 61 stylesheets, one that never answers | the cap and the missing sheet reported in `site` and `coverage.notes` |
| S-7 | Hostile CSS: 2 MB, long `{` runs, 10,000-character selectors | completes in under 2 s |

### 15.2 Unit tests

Format detection; normalization (every DESIGN.md color form, WCAG contrast reference values, px and ratio conversion, roles, families, durations, easings, features); line endings (LF, CRLF and CR read the same and hash the same); the token map; the read-time budget; values cut to 80 characters; every error code has an HTTP status and a message; the page CSS reader and `var()` resolution; binding by map, name and value, and ambiguity; coverage; each fidelity check at its exact thresholds (0.70, 0.90, 0.80, 0.50, 24px, 3 to 1, 4.5 to 1) and evidence minimums; evidence caps; scoring, weights, ceilings, the baseline floor and caps, and the worked example in 8.2; the baseline set and titles; null rules; the published formula; digest stability (key order, prose, name, whitespace) and sensitivity (value, path, pair, token map).

### 15.3 Determinism

10 cold reads of one contract give one digest. 10 runs of one contract against one page give identical checks, the same `receipt.digest` and the same `own_contract.digest`.

### 15.4 Compatibility

`scripts/fixtures/own-contract/legacy-snapshot.json` holds responses without a contract, recorded from engine 1.4.1: 40 pages, both scopes, every format. The test asserts every later engine answers the same, apart from timestamps and the engine version.

### 15.5 Privacy and security

- A contract run never calls the cached scoring path; a run without a contract does.
- Console output is captured across intake; nothing may be printed.
- Usage: a contract run that answers 200 counts under `score-contract:<client>`, a key from the closed list.
- Request errors: 400 `scope_conflict`, 400 `contract_shape`, 400 `format_unsupported`, 413 `body_too_large`, 413 `contract_too_large`. The mode limiter answers 429 with `Retry-After`.
- Linked contracts: every fetch failure maps to its `why`; a stalled URL aborts at 8 s; over 256 KB, declared or read, is 413; the real URL guard refuses loopback and the cloud metadata address.
- Every parser that sees caller input reads 1 MB of pathological input in under 200 ms; a 2 MB stylesheet of nested blocks reads in linear time.

### 15.6 Calibration

The share thresholds, weights, evidence minimums and the empty-shell heuristic are calibration defaults. A change to any of them is made in `formula.ts`, `limits.ts` or `nulls.ts`, bumps the formula version, and bumps `ENGINE_VERSION` when a verdict can move (10.5). The tests pin the current values, so a change shows up as a failing assertion to update in the same commit.

### 15.7 Surfaces

`scripts/check-contract-copy.mjs` pins every sentence `/score/contract` builds from a result: the problems panel, the verdict lines, the request-error lines (429 with and without `Retry-After`, 413, 400, 502) and the inputs. It also asserts the page prints no version or check-count literal. `--break` proves it can fail.

Run both from `apps/site`:

```bash
node scripts/check-own-contract.mjs
node scripts/check-contract-copy.mjs
```
