# @designesy/cli

Unified CLI for the Designesy design-verification toolkit. Single entry point that dispatches to `tokens` (DTCG 2025.10 token validation) and `score` (40-check design-contract scoring) subcommands.

## Install

```bash
npm install --save-dev @designesy/cli @designesy/tokens @designesy/score
# or
npx @designesy/cli <command>
```

## Usage

```bash
# Validate a DTCG token file (10 conformance checks)
designesy tokens https://www.designesy.org/export/dtcg
designesy tokens ./tokens.json --json

# Score a URL against the 40-check engine
designesy score designesy.org
designesy score linear.app --min-score 70 --min-grade B
designesy score stripe.com --format review

# Help
designesy help
designesy tokens --help
designesy score --help
```

## Commands

### `designesy tokens <url|file>`

Validates a DTCG 2025.10 design token file against the W3C Design Tokens Format Module spec. 10 conformance checks. Zero dependencies. Works offline with local files.

See [@designesy/tokens](https://www.npmjs.com/package/@designesy/tokens) for full documentation.

### `designesy score <url>`

Scores a URL against the 40-check Designesy design-contract engine. Fetches the page, extracts CSS + `:root` tokens, runs all checks locally — no server required.

See [@designesy/score](https://www.npmjs.com/package/@designesy/score) for full documentation.

## GitHub Actions

Each subcommand has a standalone GitHub Action wrapper:

```yaml
# Token validation
- uses: LE-VAI/designesy-org/.github/actions/tokens-validate@main
  with:
    url: https://example.com/export/dtcg
    min-score: 80

# Score gate
- run: npx designesy-score ${{ matrix.site }} --min-grade B
```

## Architecture

The CLI is a thin dispatcher — it spawns the `tokens` and `score` subpackage CLIs as child processes and forwards `argv`. This means:

- Each subpackage can be used independently (`npx designesy-tokens`, `npx designesy-score`)
- The unified CLI requires both subpackages installed as siblings
- No engine code is duplicated — the CLI has zero logic

## License

MIT © [Designesy](https://www.designesy.org)