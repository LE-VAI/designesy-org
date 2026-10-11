#!/usr/bin/env node
/**
 * Runs BEFORE `next build`. Builds app/globals.css the way Next would, then:
 *
 *   public/_css/globals.<hash>.css      the whole stylesheet, loaded without
 *                                       blocking first paint (immutable: the
 *                                       name changes whenever the bytes do)
 *   app/lib/critical-css.generated.json { href, css }: the critical subset the
 *                                       root layout inlines in <head>
 *
 * The critical subset is every rule named in app/critical-css.manifest.json,
 * taken from TODAY's globals.css (so a rule whose body changed ships its new
 * body), plus the at-rules that always ship (critical-css.mjs, "WHAT COUNTS AS
 * CRITICAL"). A manifest key whose rule no longer exists is skipped and
 * reported; check-critical-css.mjs, after the build, catches the reverse case.
 *
 * Both outputs are build products and gitignored. Older globals.*.css files in
 * public/_css are removed so a deploy carries only the current one.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildGlobalsCss, parseCss, ruleKey, composeCritical, contentHash, MANIFEST, GENERATED, PUBLIC_DIR } from './critical-css.mjs';

const SITE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const t0 = Date.now();
const full = await buildGlobalsCss(SITE);
const manifest = JSON.parse(fs.readFileSync(path.join(SITE, MANIFEST), 'utf8'));
const keep = new Set(manifest.rules);

const present = new Set();
parseCss(SITE, full).walkRules((r) => { present.add(ruleKey(r)); });
const missing = manifest.rules.filter((k) => !present.has(k));

const critical = composeCritical(SITE, full, keep);
const hash = contentHash(full);
const href = `/_css/globals.${hash}.css`;

const pubDir = path.join(SITE, PUBLIC_DIR);
fs.mkdirSync(pubDir, { recursive: true });
for (const f of fs.readdirSync(pubDir)) {
  if (/^globals\.[0-9a-f]+\.css$/.test(f) && f !== `globals.${hash}.css`) fs.unlinkSync(path.join(pubDir, f));
}
fs.writeFileSync(path.join(pubDir, `globals.${hash}.css`), full);
fs.writeFileSync(path.join(SITE, GENERATED), JSON.stringify({ href, css: critical }) + '\n');

const pct = (a, b) => ((100 * a) / b).toFixed(1);
console.log(`[critical-css] globals.css ${full.length} B -> ${href}`);
console.log(`[critical-css] critical ${critical.length} B (${pct(critical.length, full.length)}% of the sheet), ${keep.size - missing.length} manifest rules, ${(Date.now() - t0) / 1000}s`);
if (missing.length) {
  console.log(`[critical-css] ${missing.length} manifest rule(s) no longer in globals.css (skipped; run \`npm run update-critical-css\` after the build to drop them):`);
  for (const k of missing.slice(0, 20)) console.log(`  - ${k}`);
}
