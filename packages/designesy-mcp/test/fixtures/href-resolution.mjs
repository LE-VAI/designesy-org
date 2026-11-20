// The stylesheet href cases test/test_offline_href_resolution.py runs, held
// against new URL(href, base).href on the Node that runs this script, which
// is how packages/score/src/engine.ts resolves a stylesheet href. "expected"
// is null where new URL throws.
// "as_typed", where a case has it, is the URL the offline engine gives for
// a sheet whose href types its own host as a number in a form other than
// four decimal parts: that host is kept as typed, so the address checks
// refuse it. It must be the same URL as "expected" once new URL reads it.
//
// Usage, from packages/designesy-mcp:
//   node test/fixtures/href-resolution.mjs           exit 1 when a case's
//                                                    expected is not new URL's
//   node test/fixtures/href-resolution.mjs --write   set every expected to
//                                                    new URL's, and record the
//                                                    Node version
//
// The file escapes every character above U+007E, so a character that does
// not show (a soft hyphen, a joiner, an ideographic space) can be read.
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const FILE = fileURLToPath(new URL('./href-resolution.json', import.meta.url));
const doc = JSON.parse(readFileSync(FILE, 'utf8'));
const write = process.argv.includes('--write');

function resolve(href, base) {
  try {
    return new URL(href, base).href;
  } catch {
    return null;
  }
}

let differ = 0;
for (const c of doc.cases) {
  const got = resolve(c.href, c.base);
  if (write) {
    c.expected = got;
  } else if (got !== c.expected) {
    differ += 1;
    console.log(JSON.stringify({ group: c.group, href: c.href, base: c.base, expected: c.expected, node: got }));
  }
  if (!write && c.as_typed !== undefined && resolve(c.as_typed) !== c.expected) {
    differ += 1;
    console.log(JSON.stringify({ group: c.group, as_typed: c.as_typed, expected: c.expected, node: resolve(c.as_typed) }));
  }
}

if (write) {
  doc.node = process.versions.node;
  const text = JSON.stringify(doc, null, 2).replace(
    /[\u007f-\uffff]/g,
    (ch) => `\\u${ch.charCodeAt(0).toString(16).padStart(4, '0')}`,
  );
  writeFileSync(FILE, `${text}\n`);
  console.log(`wrote ${doc.cases.length} cases from Node ${process.versions.node}`);
} else {
  console.log(`${doc.cases.length} cases, ${differ} differ from new URL on Node ${process.versions.node} (written on Node ${doc.node})`);
  process.exitCode = differ ? 1 : 0;
}
