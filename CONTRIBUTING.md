# Contributing

Thanks for helping. This file covers how to set up the repo, which checks a pull request has to pass, and the two places where a change has to be made twice.

- Bugs and feature requests: open an [issue](https://github.com/LE-VAI/designesy-org/issues/new/choose).
- Questions and ideas: use [Discussions](https://github.com/LE-VAI/designesy-org/discussions).
- Security issues: follow [SECURITY.md](SECURITY.md). Do not open a public issue.

By taking part you agree to the [Code of Conduct](CODE_OF_CONDUCT.md).

## Prerequisites

- **Node.js 22.** The CI workflow (`ci.yml`) runs on Node 22. The `engines` fields in the packages allow older versions, but test on 22.
- **npm.** Every package has its own `package-lock.json`.
- **Python 3.10 or later** for `packages/designesy-mcp` (CI uses 3.12).
- **Chrome**, only for the browser checks (the Visual gates jobs).

## How the repo is laid out

The repo is not an npm workspace. The site and each package install on their own, from their own folder. The [Repository section of the README](README.md#repository) lists what each folder holds.

## Run the site

```bash
cd apps/site
npm ci
npm run dev        # http://localhost:3000
```

The site reads its settings from environment variables. Copy `apps/site/.env.example` to `apps/site/.env.local` and fill in only what you need. The site runs without any of them: rate limiting, email, the browser audit and the scheduled re-score are off, or fail closed, until their variables are set. Never commit a real value.

To build the site and run the build checks:

```bash
npm run build      # next build, then every build check
```

On Windows, use `npm run build:win`. Node 24 on Windows has an `fs.readlink` bug that breaks `next build`, and this script preloads a fix. It runs `next build` and a subset of the checks.

## Checks a pull request must pass

CI (`.github/workflows/ci.yml`) runs these jobs on every pull request. Run the ones that cover the part of the repo you changed.

**Build site** (from `apps/site`):

```bash
npm ci
npm run lint
npx tsc --noEmit
npm run build
node scripts/check-readme-facts.js
node scripts/check-gate-parity.js
```

`npm run build` runs `next build` and then the build checks: contract drift and locks, search coverage, the score verdicts, the prose gate, the voice ratchet, the MCP tool parity checks and more. `check-readme-facts.js` holds the check count, category count, contract version, cue count and open tension count in the READMEs to the source, so update the READMEs in the same pull request when one of those changes.

**Test score engine + calibration corpus** (from `packages/score`):

```bash
npm ci
npm run build
npm test
node scripts/export-corpus.mjs --check
node scripts/export-offline-golden.mjs --check
```

**Test tokens** and **Test stylelint-plugin-dtcg-tokens** (from `packages/tokens` or `packages/stylelint-plugin-dtcg-tokens`):

```bash
npm ci
npm test           # builds first
```

**Build & test MCP package** (from `packages/designesy-mcp`):

```bash
python -m pip install -e ".[dev]"
python -m pytest test/ -v
```

**Retired literals (every package)** (from the repo root):

```bash
node scripts/check-retired-literals-packages.js
```

**Visual gates** (three jobs). These serve the production build and drive Chrome through the edge contract, motion, focus, accessibility and layout checks. To run one locally after `npm run build` in `apps/site`:

```bash
npx next start -p 3422
node scripts/check-focus-visibility.js --base http://127.0.0.1:3422 --channel chrome
```

`packages/cli` and `packages/lab-builder` are not in the pull request matrix yet. If you change them, run `npm ci && npm test` there (for `packages/cli`, run `npm run build` before `npm test`).

## Changes that must be made in two places

**The scoring engine.** The engine exists as two hand-maintained copies:

- `apps/site/app/api/score/route.ts`, which designesy.org and the MCP endpoint run;
- `packages/score/src/engine.ts`, which `npx @designesy/score` runs.

A change to scoring logic goes into both files in the same pull request. `packages/score/test/source-drift.test.mjs` (part of `npm test` in `packages/score`) fails when one copy changes alone. Known, intended differences are pinned in `packages/score/test/fixtures/source-drift-baseline.json`, each with a reason. The Python offline engine in `packages/designesy-mcp` mirrors part of the engine; `node scripts/export-offline-golden.mjs --check` and its parity test keep it in step.

Contract mode (`apps/site/app/lib/own-contract/`) lives only in the site. [docs/contract-mode-spec.md](docs/contract-mode-spec.md) describes it, and its source comments cite that document as "contract-mode spec §x.y". After a change there, run `node scripts/check-own-contract.mjs` from `apps/site`, and update the spec in the same pull request.

**The design contract.** The design-system contract lives in `apps/site/app/lib/design-system-contract.ts`, and main publishes it on merge. A change to its content needs a version bump. Raise `version`, add an `adoption_history` entry, then run `npm run update-contract-lock` in `apps/site`. `scripts/check-contract-lock.js` fails when content changes under an unchanged version. The sibling contracts (`apps/site/app/lib/*-contract.ts`) work the same way: bump the version, add its dated line to the changelog page, and run `npm run update-sibling-contract-locks`.

## Commits and pull requests

- Write commit messages as `type(scope): summary`, for example `fix(site): ...`, `feat(engine): ...`, `docs(readme): ...`. Use the same form for the pull request title, since a squash merge turns it into the commit on main.
- Keep a pull request to one change, and say why it is needed.
- Fill in the pull request template: what changed, why, and the checks you ran.
- Add before and after screenshots for any visual change.
- Do not commit build output or generated files that `.gitignore` excludes.
