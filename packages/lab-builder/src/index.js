// @designesy/lab-builder — core scaffolder
//
// Generates the full Designesy Lab anatomy from a thesis:
//   thesis → live artifact → principle → portable contract → builder-ready
//   prompt → review checklist → provenance → anti-patterns → remix notes →
//   verification
//
// The promotion rule: an experiment becomes contract material only after
// its useful behavior is named. The scaffold makes that naming explicit —
// the PRINCIPLE.md is the artifact that can be promoted into the contract.
//
// Zero dependencies — Node built-ins only.

import { mkdir, writeFile, readdir, readFile, access } from 'node:fs/promises';
import { join, basename } from 'node:path';

export const LAB_ANATOMY = [
  'THESIS.md — what the experiment tests, in one paragraph',
  'PRINCIPLE.md — the named useful behavior (the promotion candidate)',
  'ARTIFACT.md — what to build to make the principle visible',
  'CONTRACT.md — the portable contract slice the lab binds to',
  'PROMPT.md — a builder-ready prompt for agents/tools',
  'REVIEW.md — the review checklist',
  'PROVENANCE.md — sources, dates, audit trail',
  'ANTI_PATTERNS.md — what this replaces, and why',
  'REMIX.md — how to remix the experiment',
  'VERIFICATION.md — how to verify the artifact',
  'index.html — live artifact scaffold',
];

export function slugify(name) {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export function kebabToTitle(slug) {
  return slug
    .split('-')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

export async function scaffoldLab({ name, thesis, slug, dir = './labs', withTokens = false }) {
  const labSlug = slug || slugify(name);
  const labDir = join(dir, labSlug);
  await mkdir(labDir, { recursive: true });

  const title = kebabToTitle(labSlug);
  const files = [
    ['THESIS.md', thesisDoc(title, thesis)],
    ['PRINCIPLE.md', principleDoc(title)],
    ['ARTIFACT.md', artifactDoc(title, labSlug)],
    ['CONTRACT.md', contractDoc(title)],
    ['PROMPT.md', promptDoc(title, thesis)],
    ['REVIEW.md', reviewDoc(title)],
    ['PROVENANCE.md', provenanceDoc(title)],
    ['ANTI_PATTERNS.md', antiPatternsDoc(title)],
    ['REMIX.md', remixDoc(title)],
    ['VERIFICATION.md', verificationDoc(title, labSlug)],
    ['index.html', indexHtml(title, labSlug)],
  ];
  if (withTokens) {
    files.push(['tokens.json', tokensJson(labSlug)]);
  }

  for (const [file, content] of files) {
    await writeFile(join(labDir, file), content, 'utf8');
  }

  return { path: labDir, slug: labSlug, files: files.map(([f]) => f) };
}

export async function listLabs(dir = './labs') {
  try {
    const entries = await readdir(dir, { withFileTypes: true });
    const labs = [];
    for (const e of entries) {
      if (!e.isDirectory()) continue;
      try {
        await access(join(dir, e.name, 'THESIS.md'));
        labs.push({ name: kebabToTitle(e.name), slug: e.name });
      } catch {
        // not a lab — skip
      }
    }
    return labs;
  } catch {
    return [];
  }
}

export async function verifyLab(dir) {
  const report = [];
  for (const artifact of LAB_ANATOMY) {
    const file = artifact.split(' ')[0];
    const path = join(dir, file);
    let status = 'missing';
    try {
      await access(path);
      status = 'ok';
    } catch {
      status = 'missing';
    }
    report.push({ artifact: file, path, status });
  }
  return report;
}

// ---- template docs ------------------------------------------------------

const dateStr = () => new Date().toISOString().slice(0, 10);

function thesisDoc(title, thesis) {
  return `# ${title} — Thesis

> A Lab is a controlled design experiment where a principle becomes visible,
> testable, remixable, and reviewable.

## The thesis

${thesis}

## What this experiment tests

<!-- Fill in: the specific question this lab answers, in one paragraph. -->

## Why now

<!-- Fill in: what changed (tools, standards, patterns) that makes this question live. -->
`;
}

function principleDoc(title) {
  return `# ${title} — Principle

## The named useful behavior

<!--
THE CORE ARTIFACT. The promotion rule: an experiment becomes contract
material only after its useful behavior is NAMED. Write the principle in
one sentence, present tense, as a rule someone could ship against:

  "Press states use asymmetric timing — release is 2× faster than press."

Name it like a product: a short, memorable handle (e.g. "takt", "poise").
-->

**Principle name:** \`<!-- handle -->\`

**Statement:**

<!-- one sentence, present tense, rule-like -->

## What it communicates

<!-- the behavior this encodes -->

## Where it belongs

<!-- which contract section it would promote into -->
`;
}

function artifactDoc(title, slug) {
  return `# ${title} — Live Artifact

Build the artifact that makes the principle VISIBLE. One artifact, one
principle — the artifact is the proof, not the decoration.

## Spec

- **File:** \`index.html\` (scaffolded)
- **Must make the principle perceivable in under 5 seconds**
- **Must degrade for:** accessibility, performance, reduced motion
- **Must work without:** frameworks, build steps, network

## What "done" looks like

<!-- concrete acceptance criteria -->

## Anti-decoration rule

If the artifact does not need the principle to function, the principle is
not visible. Remove the principle — if the artifact is unchanged, the
artifact is not testing the principle.
`;
}

function contractDoc(title) {
  return `# ${title} — Portable Contract

The slice of the design-system contract this lab binds to. If the lab
promotes, these values are what enter the contract.

## Token bindings

<!--
DTCG-style (when known):
{
  "poise.press.duration": { "type": "duration", "value": "160ms" },
  "poise.press.ease": { "type": "cubicBezier", "value": [0.23, 1, 0.32, 1] }
}
-->

## Rules this lab asserts

<!-- numbered, testable, contract-shaped -->

## Open tensions

<!-- what the lab does NOT resolve — keep honest -->
`;
}

function promptDoc(title, thesis) {
  return `# ${title} — Builder-Ready Prompt

A prompt any agent or builder tool can consume to reproduce this lab.
Paste into Codex / Claude / Cursor / v0 / Lovable.

---

\`\`\`
Build the ${title} lab artifact.

THESIS: ${thesis}

PRINCIPLE: <the named useful behavior>

RULES:
- One artifact, one principle.
- Work without frameworks, build steps, or network.
- Degrade for accessibility, performance, and reduced motion.
- No decoration that does not serve the principle.

When done, verify: does the artifact make the principle perceivable in
under 5 seconds? If not, rework.
\`\`\`

---

## Notes for builders

- Start from the scaffolded \`index.html\`
- Cite which token values you used and why
- Record what you tried and rejected in PROVENANCE.md
`;
}

function reviewDoc(title) {
  return `# ${title} — Review Checklist

## Principle visibility

- [ ] The principle is perceivable in under 5 seconds
- [ ] The principle drives the artifact (removing it breaks the artifact)
- [ ] No competing motion/color/pattern distracts from the principle

## Contract fit

- [ ] Token values are named, not magic numbers
- [ ] Rules are testable (a machine could check them)
- [ ] Easing is deliberate (contract tokens, not bare keywords)

## Accessibility

- [ ] Reduced-motion path exists and preserves meaning (tiered, not kill-switch)
- [ ] No layout animation (transform/opacity only)
- [ ] No motion on keyboard-initiated actions

## Honesty

- [ ] Anti-patterns documented (what this replaces and why)
- [ ] Open tensions stated (what the lab does NOT resolve)
- [ ] Provenance recorded (sources, dates, decisions)
`;
}

function provenanceDoc(title) {
  return `# ${title} — Provenance

## Sources

<!-- every principle, rule, or value must trace to a source -->

## Dates

- **Lab created:** ${dateStr()}
- **Artifact built:** <!-- date -->
- **Reviewed:** <!-- date -->

## Decisions log

| Date | Decision | Why |
|---|---|---|
| ${dateStr()} | Lab scaffolded from thesis | <!-- why --> |
`;
}

function antiPatternsDoc(title) {
  return `# ${title} — Anti-Patterns

## What this replaces

<!-- the generic/AI-default behavior this lab is the authored alternative to -->

## Why the default is wrong

<!-- name the slop tell(s) it matches: fake-liveness, decorative motion
     without meaning, generic tech trope, purple-gradient cards, etc. -->

## What would make this excessive

<!-- the failure mode of the lab itself — when does the principle become noise? -->
`;
}

function remixDoc(title) {
  return `# ${title} — Remix Notes

## How to remix this lab

<!--
- What can be swapped (values, colors, durations, targets)?
- What must stay fixed for the principle to hold?
- What adjacent experiments does this suggest?
-->

## Remix examples

<!-- links or descriptions of remixes you have seen or built -->
`;
}

function verificationDoc(title, slug) {
  return `# ${title} — Verification

## Automated

\`\`\`bash
npx @designesy/lab-builder verify .   # anatomy completeness
# + any lab-specific checks you add
\`\`\`

## Manual

1. Open \`index.html\` in a browser (no build step).
2. Does the principle read in under 5 seconds? (record yes/no + what you saw)
3. Enable OS-level reduced motion and reload. Does meaning survive?
4. Record a screenshot or video as evidence: \`${slug}-evidence.png\`

## Scorecard

| Check | Pass? | Notes |
|---|---|---|
| Principle visible < 5s | | |
| Removed → artifact breaks | | |
| Reduced-motion preserves meaning | | |
| Tokens named | | |
| Anti-patterns documented | | |
`;
}

function indexHtml(title, slug) {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${title} — Lab</title>
<style>
  /* One artifact, one principle. No frameworks. No build step.
     Replace this scaffold with the live artifact. */
  :root {
    --bg: #0A0A0C;
    --fg: #ECECEF;
    --signal: #FFC400;
  }
  * { box-sizing: border-box; margin: 0; }
  body {
    background: var(--bg);
    color: var(--fg);
    font-family: "Inter", system-ui, sans-serif;
    min-height: 100vh;
    display: grid;
    place-items: center;
  }
  .lab {
    text-align: center;
    padding: 48px;
  }
  .kicker {
    font-family: "IBM Plex Mono", monospace;
    font-size: 12px;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    color: var(--signal);
    margin-bottom: 16px;
  }
  h1 { font-size: 40px; letter-spacing: -0.02em; margin-bottom: 12px; }
  p { opacity: 0.7; max-width: 420px; line-height: 1.6; }
  /* The principle lives HERE — make it visible in under 5 seconds. */
</style>
</head>
<body>
  <main class="lab">
    <div class="kicker">Designesy Lab · ${slug}</div>
    <h1>${title}</h1>
    <p>This scaffold proves nothing yet. The principle must become visible.</p>
  </main>
</body>
</html>
`;
}

function tokensJson(slug) {
  return JSON.stringify(
    {
      $description: `${slug} lab tokens — DTCG-style stub. Replace with real bindings.`,
      $type: 'object',
      [slug]: {
        'placeholder.duration': { $type: 'duration', $value: '200ms' },
        'placeholder.ease': { $type: 'cubicBezier', $value: [0.23, 1, 0.32, 1] },
      },
    },
    null,
    2
  );
}
