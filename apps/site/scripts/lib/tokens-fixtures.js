/**
 * The three token-score fixtures that are generated from this site's code, so
 * the shared golden scores what the site actually serves and emits:
 *   contract.json            the tokens contract /contracts/tokens.json serves
 *   site-export.json         the token file /export/dtcg serves
 *   guardrails-emitted.json  the token file designesy_guardrails emits for the
 *                            made-up site in scripts/fixtures/mcp-accuracy.json
 *                            (its extraction time fixed, so the file is stable)
 *
 * scripts/check-mcp-tool-parity.js fails when a committed fixture differs from
 * what this produces; `node scripts/lib/tokens-fixtures.js --write` rewrites
 * them, after which the golden is regenerated with
 * `python test/test_tokens_score.py --write-golden` in packages/designesy-mcp.
 */

'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { createHarness } = require('./route-harness');

const APP = path.join(__dirname, '..', '..');
const FIXTURE_DIR = path.join(APP, '..', '..', 'packages', 'designesy-mcp', 'test', 'fixtures', 'tokens');
const EXTRACTED = '2026-10-10T00:00:00.000Z';

/** { name: JSON text } for the generated fixtures. */
async function generatedTokenFixtures() {
  const site = JSON.parse(fs.readFileSync(path.join(APP, 'scripts', 'fixtures', 'mcp-accuracy.json'), 'utf8')).site;
  const h = createHarness({ app: APP, pages: { [site.url]: site.html, ...site.stylesheets } });
  const contract = h.load('app/lib/tokens-contract.ts').tokensContract;
  const exported = await (await h.load('app/export/dtcg/route.ts').GET()).json();
  const g = await h.post('app/api/guardrails/route.ts', { url: site.url });
  const emitted = g.body.bundle.tokens;
  emitted.$extensions.designesy.extracted = EXTRACTED;
  const text = (v) => `${JSON.stringify(v, null, 2)}\n`;
  return {
    'contract.json': text(contract),
    'site-export.json': text(exported),
    'guardrails-emitted.json': text(emitted),
  };
}

module.exports = { generatedTokenFixtures, FIXTURE_DIR };

if (require.main === module && process.argv.includes('--write')) {
  generatedTokenFixtures().then((files) => {
    fs.mkdirSync(FIXTURE_DIR, { recursive: true });
    for (const [name, body] of Object.entries(files)) {
      fs.writeFileSync(path.join(FIXTURE_DIR, name), body);
      console.log(`wrote ${path.relative(process.cwd(), path.join(FIXTURE_DIR, name))}`);
    }
  });
}
