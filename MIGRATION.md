# Migrating to designesy-score 1.0.0

**1.0.0 is the first stable release.** The scoring engine now runs locally — no
server required. This is a breaking change for anyone using the 0.x API client mode.

## What changed?

| Aspect | 0.4.2 (old) | 1.0.0 (new) |
|--------|-------------|-------------|
| Engine location | Remote (POST to designesy.org/api/score) | **Local** (runs in-process) |
| Default behavior | API client | **Local engine** |
| `--api` flag | Sets the server URL (default behavior) | **Opt-in remote fallback** |
| `$SCORE_API` | Sets the server URL (default behavior) | **Opt-in remote fallback** |
| `--scope` flag | Not available | **New** — `contract` or `universal` |
| Dependencies | `ipaddr.js` (transitive via server) | **Zero** (Node built-ins only) |
| `verify` subcommand | POSTs to server, extracts `path: spec` | **Runs locally** (v37 check) |
| Report | Score + categories + findings | **+ anti-slop + originality lines** |

## When is action necessary?

- **If you run `npx designesy-score <url>` with no `--api` flag:** No action needed.
  The command works the same way — it just runs locally now (faster, no rate limits).

- **If you set `$SCORE_API` or use `--api`:** Your existing scripts still work.
  The `--api` flag now opts INTO remote mode instead of being the default. If you
  want the old behavior, keep using `--api https://www.designesy.org` or
  `SCORE_API=https://www.designesy.org`. The remote fallback is deprecated and
  will be removed in 2.0.0.

- **If you use the `verify` subcommand:** No action needed. It runs locally now.
  Use `--api` to fall back to the remote server.

- **If you parse the JSON output:** The `designesy` format JSON is unchanged
  (same fields: `url`, `score`, `grade`, `pass`, `fail`, `warn`, `skip`, `total`,
  `checks[]`, `categoryScores`, `a11yFloorApplied`). The new `slop` and
  `originality` objects are added but don't break existing parsers — they're
  new keys, not renamed ones.

## Migration steps

### 1. Update the package

```bash
npm install designesy-score@1.0.0
# or
npx designesy-score@1.0.0 example.com
```

### 2. Test with the local engine

```bash
npx designesy-score@1.0.0 example.com
npx designesy-score@1.0.0 designesy.org --min-score 90 --min-grade A
```

You should see the same formatted report, now with a "locally" indicator in the
status line and anti-slop/originality lines if applicable.

### 3. Try the new --scope flag

```bash
# Strict (penalizes absence of Designesy-specific features)
npx designesy-score@1.0.0 designesy.org --scope contract

# Fair (SKIPs optional features on external sites)
npx designesy-score@1.0.0 linear.app --scope universal
```

### 4. (Optional) Keep the remote fallback

If you need the old server-based behavior during transition:

```bash
npx designesy-score@1.0.0 example.com --api https://www.designesy.org
# or
SCORE_API=https://www.designesy.org npx designesy-score@1.0.0 example.com
```

The remote fallback is deprecated and will be removed in 2.0.0.

## Why local?

The local engine is strictly better than the API client:

- **No server dependency** — works even if designesy.org is down
- **No rate limits** — run it as many times as you want
- **Faster** — no HTTP round-trip to the scoring server
- **Zero dependencies** — no transitive supply-chain risk
- **Same engine** — the identical check registry, same scoring math, same output format

## Questions?

See the [CHANGELOG](./CHANGELOG.md) for the full change list, or open an issue at
[github.com/LE-VAI/designesy-org/issues](https://github.com/LE-VAI/designesy-org/issues).