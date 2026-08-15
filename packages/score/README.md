# @designesy/score

Standalone 40-check design-contract scoring engine. Fetches a URL, extracts CSS + `:root` tokens, runs all checks locally — **no server required**. Zero dependencies.

## Install

```bash
npm install --save-dev @designesy/score
# or
npx @designesy/score <url>
```

## CLI

```bash
# Score a site (prints formatted report)
npx designesy-score designesy.org

# CI gate — fail if below threshold
npx designesy-score linear.app --min-score 70 --min-grade B

# JSON output for pipelines
npx designesy-score vercel.com --json

# Markdown review format (jakubkrehel-compatible)
npx designesy-score stripe.com --format review

# Scoring scope: contract (strict, all checks penalize absence) or universal (fair to external sites)
npx designesy-score designesy.org --scope contract
```

### Options

| Flag | Description |
|---|---|
| `--format <f>` | Emission format: `designesy` (default), `canonical`, `review`, `google` |
| `--scope <s>` | Scoring scope: `contract` (strict) or `universal` (fair, default auto-detect) |
| `--min-score <n>` | Exit 1 if score < n |
| `--min-grade <g>` | Exit 1 if grade worse than g (A/B/C/D/F) |
| `--json` | Output raw JSON (no formatted report) |
| `--quiet` | Only output on failure (CI noise reduction) |
| `--help, -h` | Show help |

## Library

```typescript
import { scoreUrl } from '@designesy/score';

const result = await scoreUrl('https://linear.app');
console.log(result.score);  // 72.5
console.log(result.grade);   // 'C'
console.log(result.pass);    // 28
console.log(result.fail);    // 3
console.log(result.checks);  // [{ id: 'v01', status: 'PASS', detail: '...' }, ...]
```

## The 40 checks

| Category | Checks | Weight |
|---|---|---|
| cadence | v14, v15, v16, v17, v18, v19, x01, x02, x03, v28 | 18 |
| accessibility | v03, v05, v06, v22, v24, v34, v35 | 15 |
| semantic | v07, v25 | 12 |
| motion | v08, v11, v12, v23 | 10 |
| tokens | v01, v29 | 9 |
| takt | v10, v13 | 8 |
| copywriting | v38, v39, v40, v41 | 8 |
| poise | v04, v09 | 7 |
| identity | v07, v20, v26 | 6 |
| interaction | — | 6 |
| performance | v21 | 6 |
| security | v36 | 5 |
| spec | v37 | 4 |
| responsive | v02, v27 | 3 |

Plus 12 anti-slop deductions (S1–S12) and 7 originality lifts (O1–O7).

## Scoring

- Weighted per-category scoring (PASS = 1.0, WARN = 0.5, FAIL = 0, SKIP/MANUAL excluded)
- Anti-slop deductions (up to -20pts for generic AI patterns)
- Originality lifts (up to +8pts for bespoke craft signals)
- Accessibility floor (score capped at C/70 when any a11y FAIL exists)
- Hard-fail ceilings (critical issues cap the score further)

## Scope system

- **contract** (default for designesy.org): All 40 checks active. Absence = WARN/FAIL.
- **universal** (default for external sites): Optional features SKIP on absence instead of penalizing.

Auto-detect: `designesy.org` → contract, everything else → universal.

## Zero dependencies

Uses only Node.js built-ins:
- `node:https` for URL fetching (avoids the Windows libuv/undici crash)
- `node:dns` for SSRF guard (DNS resolution validation)
- No `ipaddr.js`, no `undici`, no `fetch()`, no external packages

## SSRF guard

Built-in SSRF protection rejects:
- Private IP ranges (10.x, 127.x, 169.254.x, 172.16-31.x, 192.168.x)
- Cloud metadata endpoints (169.254.169.254)
- All IPv6 addresses
- Encoded IP bypasses (decimal, octal, hex)
- Redirect chains to internal addresses

## License

MIT © [Designesy](https://www.designesy.org)