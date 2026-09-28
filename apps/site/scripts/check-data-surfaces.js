#!/usr/bin/env node
/**
 * data-surfaces gate: every chart on the six data surfaces can be read without
 * seeing it, and none of them waits on a uniform entrance animation.
 *
 * WHAT IT READS
 * The prerendered HTML of /leaderboard, /state-of-compliance, /frameworks and
 * every /frameworks/<site>, /methodology, /benchmarks and /specs, from
 * .next/server/app after `next build`. The drawings are rendered on the server,
 * so the HTML is what a screen reader and a crawler meet first.
 *
 * CLAUSES
 *   1. named     Every element with role="img" carries a non-empty aria-label,
 *                or an aria-labelledby whose target exists in the page.
 *   2. table     Every <figure class="dx-fig"> contains a <table>, or names one
 *                with data-table="<id>" and an element with that id exists.
 *                The table is the chart's text alternative: every value the
 *                drawing encodes.
 *   3. entrance  No element on these routes carries the fade-up class: a data
 *                page is complete at rest and its motion means something.
 *   4. dated     lib/data/cohort re-exports the batch date from
 *                leaderboard/batch-data.ts, the file's header states the same
 *                date, and the pages print it (a figure of batch data without
 *                its date was the defect this wave removed).
 *
 * GUARDS AGAINST A CLAUSE THAT CANNOT FAIL
 *   * Attribute matching is scoped to one start tag: the pattern cannot cross
 *     a `>` into the next element.
 *   * A route whose HTML is missing fails the gate; it is never skipped, so a
 *     renamed route cannot pass by vanishing.
 *   * The gate refuses to pass on zero charts: a route that should draw and
 *     draws nothing fails clause 1.
 *   * `--self-test` feeds each clause a page built to break it and exits
 *     non-zero if any clause lets it through.
 *
 * Usage:  node scripts/check-data-surfaces.js [--json] [--self-test]
 */

const fs = require('node:fs');
const path = require('node:path');

const SITE = path.resolve(__dirname, '..');
const APP_HTML = path.join(SITE, '.next', 'server', 'app');
const ROUTES = ['leaderboard', 'state-of-compliance', 'frameworks', 'methodology', 'benchmarks', 'specs'];
// Routes that draw: each must carry at least one named image.
const DRAWS = new Set(['leaderboard', 'state-of-compliance', 'methodology', 'frameworks']);

function startTags(html, test) {
  const out = [];
  const re = /<([a-zA-Z][\w-]*)\b([^<>]*)>/g;
  let m;
  while ((m = re.exec(html))) if (test(m[1], m[2])) out.push({ tag: m[1], attrs: m[2] });
  return out;
}

const attr = (attrs, name) => {
  const m = attrs.match(new RegExp(`(?:^|\\s)${name}="([^"]*)"`));
  return m ? m[1] : null;
};

const ids = (html) => new Set([...html.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]));

/** Clauses 1 to 3 on one page's HTML. Returns a list of problems. */
function checkPage(route, html, draws) {
  const problems = [];
  const idSet = ids(html);

  const imgs = startTags(html, (_t, a) => /(?:^|\s)role="img"/.test(a));
  for (const i of imgs) {
    const label = (attr(i.attrs, 'aria-label') || '').trim();
    const by = (attr(i.attrs, 'aria-labelledby') || '').trim();
    const byOk = by && by.split(/\s+/).every((id) => idSet.has(id));
    if (!label && !byOk) problems.push(`named: a role="img" <${i.tag}> has no accessible name`);
  }
  if (draws && imgs.length === 0) problems.push('named: the route draws no named chart');

  // Figures: take each <figure class="... dx-fig ...">...</figure> span.
  const figRe = /<figure\b([^<>]*)>([\s\S]*?)<\/figure>/g;
  let f;
  let figs = 0;
  while ((f = figRe.exec(html))) {
    if (!/(?:^|\s)class="[^"]*\bdx-fig\b[^"]*"/.test(f[1])) continue;
    figs++;
    const own = /<table\b/.test(f[2]);
    const ref = attr(f[1], 'data-table');
    const refOk = ref && idSet.has(ref) && new RegExp(`\\sid="${ref}"`).test(html);
    const id = attr(f[1], 'id') || '(no id)';
    if (!own && !refOk) problems.push(`table: figure ${id} has no table and names none that exists`);
  }

  const fades = startTags(html, (_t, a) => /(?:^|\s)class="[^"]*\bfade-up\b/.test(a));
  if (fades.length) problems.push(`entrance: ${fades.length} element(s) carry fade-up`);

  return { route, charts: imgs.length, figures: figs, problems };
}

function pagesToCheck() {
  const out = [];
  for (const r of ROUTES) {
    const file = path.join(APP_HTML, `${r}.html`);
    out.push({ route: `/${r}`, file, draws: DRAWS.has(r) });
  }
  const fwDir = path.join(APP_HTML, 'frameworks');
  const slugs = fs.existsSync(fwDir) ? fs.readdirSync(fwDir).filter((n) => n.endsWith('.html')) : [];
  if (!slugs.length) out.push({ route: '/frameworks/<site>', file: path.join(fwDir, '<none>.html'), draws: true });
  for (const n of slugs) out.push({ route: `/frameworks/${n.replace(/\.html$/, '')}`, file: path.join(fwDir, n), draws: true });
  return out;
}

/** Clause 4: the batch date is declared once and printed where batch data is drawn. */
function checkDated(pages) {
  const problems = [];
  const batch = fs.readFileSync(path.join(SITE, 'app', 'leaderboard', 'batch-data.ts'), 'utf8');
  const cohort = fs.readFileSync(path.join(SITE, 'app', 'lib', 'data', 'cohort.ts'), 'utf8');
  const declared = (batch.match(/export const BATCH_RUN_DATE = '(\d{4}-\d{2}-\d{2})'/) || [])[1];
  const header = (batch.match(/against the live \/api\/score engine on\s*\n?\/\/\s*(\d{4}-\d{2}-\d{2})/) || [])[1];
  if (!declared) problems.push('dated: batch-data.ts declares no BATCH_RUN_DATE');
  else if (header && header !== declared) problems.push(`dated: batch-data.ts header says ${header}, BATCH_RUN_DATE says ${declared}`);
  if (!/export \{ BATCH_RUN_DATE \}/.test(cohort)) problems.push('dated: lib/data/cohort does not re-export BATCH_RUN_DATE');
  if (declared) {
    for (const p of pages.filter((x) => ['/leaderboard', '/state-of-compliance'].includes(x.route) || x.route.startsWith('/frameworks/'))) {
      if (!fs.existsSync(p.file)) continue;
      if (!fs.readFileSync(p.file, 'utf8').includes(declared)) problems.push(`dated: ${p.route} draws batch data without printing ${declared}`);
    }
  }
  return problems;
}

function selfTest() {
  const cases = [
    ['named', '<div role="img"></div>', true],
    ['named', '<div role="img" aria-labelledby="nope"></div>', true],
    ['named', '<p>no chart here</p>', true],
    ['table', '<i role="img" aria-label="x"></i><figure class="dx-fig" id="a"><figcaption>t</figcaption></figure>', false],
    ['table', '<i role="img" aria-label="x"></i><figure class="dx-fig" id="a" data-table="missing"></figure>', false],
    ['entrance', '<i role="img" aria-label="x"></i><section class="doctrine-section fade-up"></section>', false],
  ];
  let bad = 0;
  for (const [clause, html, draws] of cases) {
    const r = checkPage('/self-test', html, draws);
    const caught = r.problems.some((p) => p.startsWith(`${clause}:`));
    if (!caught) {
      bad++;
      console.error(`self-test: clause "${clause}" let a broken page through: ${html}`);
    }
  }
  const good = checkPage(
    '/self-test',
    '<figure class="dx-fig" id="a"><div role="img" aria-label="Scores"></div><details><table></table></details></figure>',
    true,
  );
  if (good.problems.length) {
    bad++;
    console.error(`self-test: a correct page failed: ${good.problems.join('; ')}`);
  }
  if (bad) process.exit(1);
  console.log(`data-surfaces self-test: OK (${cases.length} broken pages caught, 1 correct page passed)`);
}

function main() {
  if (process.argv.includes('--self-test')) return selfTest();
  if (!fs.existsSync(APP_HTML)) {
    console.error('data-surfaces: no .next/server/app. Run after `next build`.');
    process.exit(1);
  }
  const pages = pagesToCheck();
  const results = [];
  for (const p of pages) {
    if (!fs.existsSync(p.file)) {
      results.push({ route: p.route, charts: 0, figures: 0, problems: ['missing: no prerendered HTML for this route'] });
      continue;
    }
    results.push(checkPage(p.route, fs.readFileSync(p.file, 'utf8'), p.draws || p.route.startsWith('/frameworks/')));
  }
  const dated = checkDated(pages);
  const failed = results.filter((r) => r.problems.length);
  if (process.argv.includes('--json')) {
    console.log(JSON.stringify({ results, dated }, null, 2));
  }
  if (failed.length || dated.length) {
    for (const r of failed) for (const p of r.problems) console.error(`data-surfaces: ${r.route}: ${p}`);
    for (const p of dated) console.error(`data-surfaces: ${p}`);
    process.exit(1);
  }
  const charts = results.reduce((a, r) => a + r.charts, 0);
  const figures = results.reduce((a, r) => a + r.figures, 0);
  console.log(
    `data-surfaces: OK (${results.length} pages: ${charts} named charts, ${figures} figures each with a table, no fade-up; batch date printed where drawn)`,
  );
}

main();
