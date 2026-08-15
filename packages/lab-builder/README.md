# @designesy/lab-builder

Experiments that compile into contracts.

A Lab is a controlled design experiment where a principle becomes visible, testable, remixable, and reviewable. This CLI scaffolds the **full Lab anatomy** from a thesis — the missing layer between experiment and contract.

```bash
npx @designesy/lab-builder init <lab-name> --thesis "<thesis>"
```

## Why this exists

Storybook isolates *components*. Docusaurus documents *what is*. Nobody scaffolds a design *experiment* that earns its way into a contract.

The Designesy promotion rule: **an experiment becomes contract material only after its useful behavior is named.** Lab Builder makes that naming explicit — the generated `PRINCIPLE.md` is the promotion candidate.

## What it scaffolds

A mature Lab anatomy, generated from one thesis:

| Artifact | Purpose |
|---|---|
| `THESIS.md` | What the experiment tests, in one paragraph |
| `PRINCIPLE.md` | **The named useful behavior** (the promotion candidate) |
| `ARTIFACT.md` | What to build to make the principle visible |
| `CONTRACT.md` | The portable contract slice the lab binds to |
| `PROMPT.md` | A builder-ready prompt for agents/tools |
| `REVIEW.md` | The review checklist |
| `PROVENANCE.md` | Sources, dates, audit trail |
| `ANTI_PATTERNS.md` | What this replaces, and why |
| `REMIX.md` | How to remix the experiment |
| `VERIFICATION.md` | How to verify the artifact |
| `index.html` | Live artifact scaffold (zero-dep, no build step) |
| `tokens.json` | DTCG-style token stub (with `--tokens`) |

## Usage

```bash
# Scaffold a lab from a thesis
npx @designesy/lab-builder init poise --thesis "Press states should feel alive, not just darker"

# With a DTCG token stub
npx @designesy/lab-builder init cadence --thesis "Type rhythm is the layout" --tokens

# Verify a lab's anatomy is complete
npx @designesy/lab-builder verify ./labs/poise

# List labs in the registry
npx @designesy/lab-builder list
```

## Zero dependencies

Node built-ins only — matches the designesy-org house pattern (`designesy-score`, the GitHub Action, `designesy-mcp`).

## The loop

```text
thesis → lab → artifact → review → named principle → contract material
```

The lab is where a principle is tested; the contract is where it ships. Lab Builder is the bridge.

## License

MIT — Designesy. Part of the [designesy-org](https://github.com/LE-VAI/designesy-org) monorepo.
