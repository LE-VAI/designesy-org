#!/usr/bin/env node
/**
 * stage prerender output — puts Next's prerendered HTML where the build gates
 * read it, whichever layout `next build` used.
 *
 * WHY THIS EXISTS
 * Every gate after `next build` that reads the rendered pages (the Pagefind
 * index, the search gate, the markdown projections, the prose and voice gates,
 * the data-surface and palette gates) opens .next/server/app/<route>.html and
 * .next/server/app/<route>.body.
 *
 * Next 16 writes them there only when it builds without a deployment adapter.
 * Vercel builds Next >= 16.2 with its adapter, and then `next build` leaves the
 * prerendered output under
 *
 *     .next/server/route-cache/APP_PAGE/<hash>/$/<route>.html
 *     .next/server/route-cache/APP_ROUTE/<hash>/$/<route>.body
 *
 * and .next/server/app holds no HTML at all. The first Vercel preview of the
 * Next 16 branch showed it: "staged 0 route HTML(s)", Pagefind found nothing
 * to index, and the search gate failed the build. This step copies the
 * adapter's HTML and route-handler bodies to the path every gate already reads,
 * so no gate has to know about the second layout.
 *
 * Without an adapter (local builds, the CI build, `next start`) there is no
 * route-cache directory and this does nothing.
 *
 * It copies only .html and .body, never moves: the adapter's own output is
 * untouched. A file already present in .next/server/app is never overwritten.
 *
 * Usage:  node scripts/stage-prerender-output.js [--json]
 * Exits 1 when the adapter layout is present but yields no HTML (a gate that
 * runs on an empty tree measures nothing), 0 otherwise.
 */

const fs = require('node:fs');
const path = require('node:path');

const APP = path.join(__dirname, '..');
const NEXT = path.join(APP, '.next');
const STANDARD = path.join(NEXT, 'server', 'app');
const ROUTE_CACHE = path.join(NEXT, 'server', 'route-cache');
const KINDS = ['APP_PAGE', 'APP_ROUTE'];
const WANTED = /\.(?:html|body)$/;

function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else out.push(p);
  }
  return out;
}

function main() {
  const asJson = process.argv.includes('--json');
  const say = (o, line) => (asJson ? console.log(JSON.stringify(o)) : console.log(line));

  if (!fs.existsSync(NEXT)) {
    console.error('stage-prerender: no .next directory. Run after `next build`.');
    process.exit(1);
  }
  if (!fs.existsSync(ROUTE_CACHE)) {
    say({ layout: 'standard', copied: 0 }, 'stage-prerender: standard layout (no route-cache), nothing to stage');
    return;
  }

  let html = 0;
  let body = 0;
  let kept = 0;
  for (const kind of KINDS) {
    const kindDir = path.join(ROUTE_CACHE, kind);
    if (!fs.existsSync(kindDir)) continue;
    for (const hash of fs.readdirSync(kindDir)) {
      // <hash>/$ holds the entry's files, named as they are under server/app.
      const base = path.join(kindDir, hash, '$');
      if (!fs.existsSync(base)) continue;
      for (const file of walk(base)) {
        if (!WANTED.test(file)) continue;
        const rel = path.relative(base, file);
        const dest = path.join(STANDARD, rel);
        if (fs.existsSync(dest)) { kept++; continue; }
        fs.mkdirSync(path.dirname(dest), { recursive: true });
        fs.copyFileSync(file, dest);
        if (file.endsWith('.html')) html++;
        else body++;
      }
    }
  }

  if (html === 0 && kept === 0) {
    console.error('stage-prerender: .next/server/route-cache exists but holds no prerendered HTML; the gates after this would read an empty tree.');
    process.exit(1);
  }
  say(
    { layout: 'adapter', html, body, alreadyPresent: kept },
    `stage-prerender: adapter layout, copied ${html} HTML and ${body} route-handler body file(s) from .next/server/route-cache to .next/server/app (${kept} already there)`
  );
}

main();
