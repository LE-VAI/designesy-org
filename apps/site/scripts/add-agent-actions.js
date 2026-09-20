#!/usr/bin/env node
/**
 * Add the AgentActions cluster to every route that has a markdown variant.
 *
 * WHY A SCRIPT RATHER THAN 19 HAND EDITS
 * There is no shared header component -- the surface-header markup is duplicated
 * across 67 files -- so this is 19 structurally similar but textually different
 * insertions. Doing them by hand invites one mis-placed insertion that renders
 * the cluster inside the wrong section, which is hard to spot and easy to ship.
 *
 * The closing </section> is found by DEPTH COUNTING from the <section> that
 * contains surface-header, not by matching the first "</section>" after it.
 * Pages here nest sections, so a naive first-match would insert into a child
 * section and the cluster would appear mid-page instead of under the lede.
 *
 * Idempotent: re-running skips files that already have the component.
 */

const fs = require('node:fs');
const path = require('node:path');

const APP = path.join(__dirname, '..', 'app');

/** route -> [mdPath, article label used in aria/title text] */
const ROUTES = {
  'methodology': ['/methodology.md', 'the methodology page'],
  'kits': ['/kits.md', 'the kits index'],
  'open': ['/open.md', 'the open index'],
  'benchmarks': ['/benchmarks.md', 'the benchmarks page'],
  'contracts': ['/contracts.md', 'the contracts index'],
  'contracts/design-system': ['/contracts/design-system.md', 'the design system contract'],
  'contracts/a11y': ['/contracts/a11y.md', 'the accessibility contract'],
  'contracts/motion': ['/contracts/motion.md', 'the motion contract'],
  'contracts/drift': ['/contracts/drift.md', 'the drift contract'],
  'contracts/readiness': ['/contracts/readiness.md', 'the readiness contract'],
  'contracts/guardrails': ['/contracts/guardrails.md', 'the guardrails contract'],
  'contracts/monitor': ['/contracts/monitor.md', 'the monitor contract'],
  'contracts/report': ['/contracts/report.md', 'the report contract'],
  'contracts/compare': ['/contracts/compare.md', 'the compare contract'],
  'contracts/tokens': ['/contracts/tokens.md', 'the tokens contract'],
  'labs/poise': ['/labs/poise.md', 'the Poise lab'],
  'labs/takt': ['/labs/takt.md', 'the Takt lab'],
  'labs/cadence': ['/labs/cadence.md', 'the Cadence lab'],
  'labs/acoustics': ['/labs/acoustics.md', 'the Acoustics lab'],
};

/** The import path depends on how deep the page file sits. */
function importPathFor(route) {
  const depth = route.split('/').length; // 1 => app/x/page.tsx
  return '../'.repeat(depth) + 'lib/agent-actions';
}

/**
 * Find the index just before the </section> that closes the section containing
 * `needle`, using depth counting.
 *
 * Returns null when the section is unbalanced, which the caller treats as a hard
 * failure -- inserting at a guessed position is worse than not inserting.
 */
function closingSectionIndex(src, needle) {
  const marker = src.indexOf(needle);
  if (marker === -1) return null;
  const open = src.lastIndexOf('<section', marker);
  if (open === -1) return null;

  const re = /<\/?section\b[^>]*>/g;
  re.lastIndex = open;
  let depth = 0;
  let m;
  while ((m = re.exec(src)) !== null) {
    if (m[0].startsWith('</')) {
      depth--;
      if (depth === 0) return m.index;
    } else {
      depth++;
    }
  }
  return null;
}

let changed = 0;
let skipped = 0;
const failures = [];

for (const [route, [mdPath, label]] of Object.entries(ROUTES)) {
  const file = path.join(APP, route, 'page.tsx');
  if (!fs.existsSync(file)) {
    failures.push(`${route}: no page.tsx`);
    continue;
  }
  const raw = fs.readFileSync(file, 'utf8');
  if (raw.includes('<AgentActions')) {
    skipped++;
    continue;
  }
  if (!raw.includes('surface-header')) {
    failures.push(`${route}: no surface-header section`);
    continue;
  }

  const at = closingSectionIndex(raw, 'surface-header');
  if (at === null) {
    failures.push(`${route}: could not locate the closing </section> (unbalanced?)`);
    continue;
  }

  // Indentation matches the section's own closing tag, which is what the
  // surrounding markup uses.
  const lineStart = raw.lastIndexOf('\n', at) + 1;
  const indent = raw.slice(lineStart, at).match(/^\s*/)[0];
  const child = indent + '  ';

  const insertion =
    child + '<AgentActions mdPath="' + mdPath + '" label="' + label + '" />\n';

  let out = raw.slice(0, lineStart) + insertion + raw.slice(lineStart);

  // Import: place it next to the other lib imports so ordering stays natural.
  const imp = "import { AgentActions } from '" + importPathFor(route) + "';";
  if (!out.includes(imp)) {
    const lines = out.split('\n');
    let lastLibImport = -1;
    for (let i = 0; i < lines.length; i++) {
      if (/^import .* from '\.\.?\//.test(lines[i])) lastLibImport = i;
    }
    if (lastLibImport === -1) {
      // Fall back to after the final import of any kind.
      for (let i = 0; i < lines.length; i++) {
        if (lines[i].startsWith('import ')) lastLibImport = i;
      }
    }
    if (lastLibImport === -1) {
      failures.push(`${route}: no import block found`);
      continue;
    }
    lines.splice(lastLibImport + 1, 0, imp);
    out = lines.join('\n');
  }

  fs.writeFileSync(file, out, 'utf8');
  changed++;
}

console.log(`[agent-actions] inserted ${changed}, already present ${skipped}, total ${Object.keys(ROUTES).length}`);
if (failures.length) {
  console.error('[agent-actions] FAILED:');
  for (const f of failures) console.error('  ' + f);
  process.exit(1);
}
