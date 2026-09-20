#!/usr/bin/env node
/**
 * Generate per-page markdown from the build's own prerendered HTML.
 *
 * WHY BUILD-TIME, NOT RUNTIME
 * The alternative is a middleware rewrite that fetches the page over HTTP and
 * converts it per request. Measured against the ecosystem: that double-fetch
 * costs 327-519ms cold and 45-57ms warm, and a Next.js collaborator calls it
 * "your very last resort". Converting the already-prerendered HTML at build
 * time has no runtime cost and cannot disagree with the page, because it reads
 * the exact bytes the page was rendered from.
 *
 * The precedent is Ping Identity's docs-for-agents implementation, which
 * generates markdown from published HTML at build time for the same reason:
 * "you can't accidentally publish docs that have one without the other."
 *
 * WHY NOT HAND-AUTHORED MARKDOWN
 * These pages are React components: 19 inline prose blocks plus 33 data-driven
 * items across three arrays on /docs alone. A hand-written markdown twin would
 * be a second copy of every sentence and the two would drift. Generating from
 * the rendered output means one source and no maintenance surface.
 *
 * SCOPE — READ BEFORE CHANGING
 * Only the <main> content container is converted. Rule-based converters that
 * get criticised for producing "boilerplate" do so because they convert
 * EVERYTHING — nav, sidebar, footer included. Extracting the main container is
 * what separates a ~68% token reduction from a ~92% one. Measured chrome ratio
 * on these pages is 1.8%-8.2%, so scoping matters less here than on most sites,
 * but the principle holds and the scoping is cheap.
 *
 * The converter is deliberately minimal and dependency-free. It handles the
 * constructs these pages actually use. It is NOT a general-purpose
 * HTML-to-markdown library and should not be trusted as one. A fidelity bug in
 * a converter is silent, so this script reports what it emitted per page and
 * fails the build if any route yields implausibly little content.
 */

const fs = require('node:fs');
const path = require('node:path');

const APP_DIR = path.join(__dirname, '..');
// Written under public/ at <route>.md, so a file serves at /docs.md and
// /contracts/design-system.md. The .md suffix is the dominant convention --
// Mintlify, Fern, Sinch and Ping all use it -- and it is the only route that
// works for agents that neither negotiate nor follow a link tag, which is
// most of them: Cloudflare measured content negotiation on 3.9% of sites.
const OUT_DIR = path.join(APP_DIR, 'public');

/**
 * Routes that get a markdown variant.
 *
 * Deliberately limited to prose routes. The /contracts/*.json routes already
 * serve structured JSON AND negotiate markdown through the shared
 * negotiatedResponse helper — generating a second markdown copy for them here
 * would create two markdown paths that could disagree.
 *
 * /leaderboard is here because it is the single worst agent-facing page on the
 * site: 603KB of HTML for 10.8KB of markdown, and a plain GET spends 57% of that
 * on the RSC payload and another 35% on table markup — the same 30 rows shipped
 * twice, once as HTML and once as a serialized React tree. An agent that
 * truncates at 100KB reads less than half its prose. The markdown carries the
 * whole cohort (all 30 sites, grades, scores, check counts, the COI disclosure
 * on the self-scored row) in a GFM table.
 *
 * Note the .md twin is a REPRESENTATION, not a replacement: the page's own
 * ranking logic, live re-score links and SVG fingerprints stay in the HTML.
 */
const ROUTES = [
  'docs',
  'methodology',
  'kits',
  'open',
  'benchmarks',
  'leaderboard',
  'contracts',
  'contracts/design-system',
  'contracts/a11y',
  'contracts/motion',
  'contracts/drift',
  'contracts/readiness',
  'contracts/guardrails',
  'contracts/monitor',
  'contracts/report',
  'contracts/compare',
  'contracts/tokens',
  'labs/poise',
  'labs/takt',
  'labs/cadence',
  'labs/acoustics',
];

/** Decode the entities Next's renderer actually emits. */
function decodeEntities(s) {
  return s
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#x27;|&apos;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/&mdash;/g, '\u2014')
    .replace(/&ndash;/g, '\u2013')
    .replace(/&hellip;/g, '\u2026')
    .replace(/&#(\d+);/g, (_, d) => String.fromCharCode(Number(d)))
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCharCode(parseInt(h, 16)));
}

/**
 * Strip tags, decode entities, collapse whitespace.
 *
 * EVERY replacement injects a SPACE, not an empty string. That is the whole
 * subtlety: block-level tags sit between words in the source markup with no
 * whitespace between them, so deleting a tag outright welds its neighbours
 * together. `<span>Designesy</span><span>self</span>` became "Designesyself"
 * on the leaderboard's self-scored row — the site's own name, corrupted. On a
 * site whose whole thesis is verifiable output, a mangled word is worse than an
 * extra space.
 *
 * React comment separators (`<!-- -->`) are DELETED without a space, not
 * replaced by one. React emits them purely to separate adjacent text nodes it
 * would otherwise weld during hydration, so their content is already correctly
 * spaced on either side. Treating them like an element boundary would turn
 * "86.1%" into "86.1 %" — inventing a space inside a number.
 */
function text(html) {
  return decodeEntities(
    html
      .replace(/<script[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style[\s\S]*?<\/style>/gi, ' ')
      .replace(/<svg[\s\S]*?<\/svg>/gi, ' ')
      .replace(/<!--[\s\S]*?-->/g, '')
      .replace(/<[^>]+>/g, ' '),
  )
    .replace(/\s+/g, ' ')
    // Inline runs that carried no whitespace in the source now carry one,
    // because every element boundary above became a space. The leaderboard's
    // score is the clearest case: "93.0" and "%" live in two adjacent spans, so
    // a naive boundary-space renders "93.0 %" 47 times on one page.
    //
    // Only punctuation that can NEVER legitimately follow a space is tightened.
    // A colon is deliberately absent: "16 : 9" and similar ratios are real, and
    // guessing wrong there invents a typo rather than fixing one.
    .replace(/(\w) ([%.,;!?])/g, '$1$2')
    .trim();
}

/**
 * Extract the <main> container.
 *
 * Nesting-aware rather than regex-to-first-close, because a naive close match
 * truncates the document. Returns null when no <main> exists, which the caller
 * treats as a hard failure — silently converting the whole page would include
 * navigation, which is exactly the boilerplate problem this avoids.
 */
function extractMain(html) {
  const open = html.search(/<main\b[^>]*>/i);
  if (open === -1) return null;
  const afterOpen = html.indexOf('>', open) + 1;

  let depth = 1;
  const re = /<\/?main\b[^>]*>/gi;
  re.lastIndex = afterOpen;
  let m;
  while ((m = re.exec(html)) !== null) {
    if (m[0].startsWith('</')) {
      depth--;
      if (depth === 0) return html.slice(afterOpen, m.index);
    } else {
      depth++;
    }
  }
  return html.slice(afterOpen);
}

/** Convert an inline fragment to markdown. */
function inline(html) {
  let s = html;
  s = s.replace(/<a\b[^>]*href=["']([^"']*)["'][^>]*>([\s\S]*?)<\/a>/gi, (_, href, body) => {
    const t = text(body);
    if (!t) return '';
    if (href.startsWith('#')) return t; // in-page anchors add nothing to context
    return '[' + t + '](' + href + ')';
  });
  s = s.replace(/<(strong|b)\b[^>]*>([\s\S]*?)<\/\1>/gi, (_, __, b) => '**' + text(b) + '**');
  s = s.replace(/<(em|i)\b[^>]*>([\s\S]*?)<\/\1>/gi, (_, __, b) => '*' + text(b) + '*');
  s = s.replace(/<code\b[^>]*>([\s\S]*?)<\/code>/gi, (_, b) => '`' + text(b) + '`');
  // Eyebrow and label spans ("Context surface", "Working sentence", "Standard")
  // are visual scaffolding: they read as orphan fragments once the styling that
  // grouped them with their body text is gone. Dropping them keeps the document
  // readable rather than emitting stray capitalised nouns between paragraphs.
  s = s.replace(/<(p|span)\b[^>]*class=["'][^"']*(?:eyebrow|definition-label|doctrine-heading)[^"']*["'][^>]*>[\s\S]*?<\/\1>/gi, '');
  s = s.replace(/<br\s*\/?>/gi, ' ');
  return text(s);
}

/** Convert one <table> to a GFM table. */
function table(html) {
  const rows = [...html.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)]
    .map((r) =>
      [...r[1].matchAll(/<t[hd]\b[^>]*>([\s\S]*?)<\/t[hd]>/gi)].map((c) => inline(c[1])),
    )
    .filter((r) => r.length);
  if (!rows.length) return '';
  const width = Math.max(...rows.map((r) => r.length));
  const pad = (r) => [...r, ...Array(width - r.length).fill('')];
  const out = [];
  out.push('| ' + pad(rows[0]).join(' | ') + ' |');
  out.push('| ' + Array(width).fill('---').join(' | ') + ' |');
  for (const r of rows.slice(1)) out.push('| ' + pad(r).join(' | ') + ' |');
  return out.join('\n');
}

/** Turn a role="list" container's anchors into markdown list items. */
function roleList(body) {
  return [...body.matchAll(/<a\b[^>]*href=["']([^"']*)["'][^>]*>([\s\S]*?)<\/a>/gi)]
    .map(([, href, inner]) => {
      // Cards carry a title span and a meta span; flatten to "Title - meta" so
      // the card's promise survives conversion rather than losing the meta.
      const parts = [
        ...inner.matchAll(
          /<span\b[^>]*class=["'][^"']*row-(?:title|meta)[^"']*["'][^>]*>([\s\S]*?)<\/span>/gi,
        ),
      ]
        .map((x) => text(x[1]))
        .filter(Boolean);
      if (!parts.length) return null;
      const abs = href.startsWith('http') ? href : 'https://www.designesy.org' + href;
      return '- [' + parts.join(' \u2014 ') + '](' + abs + ')';
    })
    .filter(Boolean);
}

/** Convert the main-container HTML to markdown. */
function convert(html) {
  const out = [];
  // The role="list" branch is load-bearing. Card grids on this site render as
  // `<a role="listitem">` inside `<div role="list">`, NOT as <li> inside <ul>.
  // A first version matched only real ul/ol and silently dropped all 16
  // "Start here" cards — the most agent-useful content on /docs. The role
  // attributes are the semantic signal here; the tag names are not. Caught by
  // checking that the emitted file contained zero markdown links.
  const blockRe =
    /<(h[1-6]|p|ul|ol|table|blockquote|pre)\b[^>]*>([\s\S]*?)<\/\1>|<div\b[^>]*role=["']list["'][^>]*>([\s\S]*?)<\/div>/gi;

  let m;
  while ((m = blockRe.exec(html)) !== null) {
    const tag = m[1] ? m[1].toLowerCase() : 'list';
    const body = m[1] ? m[2] : m[3];
    // Eyebrow and label fragments ("Context surface", "Working sentence",
    // "Standard") are visual scaffolding. Once the styling that grouped them
    // with their body text is gone, they read as orphan capitalised nouns
    // between paragraphs. The class lives on the block's OWN tag, so this has
    // to check m[0] -- filtering the body cannot see it.
    if (/class=["'][^"']*(?:eyebrow|definition-label)[^"']*["']/i.test(m[0])) continue;

    if (tag.startsWith('h')) {
      // The page's own <h1> duplicates the generated title above it, so demote
      // it: two h1s make the document look like it has two titles, to a reader
      // and to a heading-outline parser.
      const raw = Number(tag[1]);
      const level = raw === 1 ? 2 : raw;
      const t = inline(body);
      if (t) {
        out.push('');
        out.push('#'.repeat(Math.min(6, level)) + ' ' + t);
        out.push('');
      }
    } else if (tag === 'p') {
      const t = inline(body);
      if (t) {
        out.push(t);
        out.push('');
      }
    } else if (tag === 'list') {
      const items = roleList(body);
      if (items.length) {
        out.push('');
        items.forEach((it) => out.push(it));
        out.push('');
      }
    } else if (tag === 'ul' || tag === 'ol') {
      const items = [...body.matchAll(/<li\b[^>]*>([\s\S]*?)<\/li>/gi)]
        .map((x) => inline(x[1]))
        .filter(Boolean);
      if (items.length) {
        items.forEach((it, i) => out.push(tag === 'ol' ? i + 1 + '. ' + it : '- ' + it));
        out.push('');
      }
    } else if (tag === 'table') {
      const t = table(body);
      if (t) {
        out.push('');
        out.push(t);
        out.push('');
      }
    } else if (tag === 'blockquote') {
      const t = inline(body);
      if (t) {
        out.push('> ' + t);
        out.push('');
      }
    } else if (tag === 'pre') {
      const t = text(body);
      if (t) {
        out.push('```');
        out.push(t);
        out.push('```');
        out.push('');
      }
    }
  }

  return out.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}

function main() {
  const nextApp = path.join(APP_DIR, '.next', 'server', 'app');
  if (!fs.existsSync(nextApp)) {
    console.error('[md] .next/server/app not found - refusing to emit an empty markdown set');
    process.exit(1);
  }

  // Clean the output dir so a deleted page cannot leave a stale markdown twin.
  // Remove previously generated files ONLY. Never wipe public/ wholesale --
  // it holds hand-made assets (badge.svg, audio/, screenshots) that are not
  // ours to delete. A manifest from the last run is the precise target.
  const manifestPath = path.join(OUT_DIR, '.md-manifest.json');
  if (fs.existsSync(manifestPath)) {
    try {
      for (const rel of JSON.parse(fs.readFileSync(manifestPath, 'utf8'))) {
        fs.rmSync(path.join(OUT_DIR, rel), { force: true });
      }
    } catch (_) { /* corrupt manifest: fall through, we rewrite it below */ }
  }
  fs.mkdirSync(OUT_DIR, { recursive: true });

  const report = [];
  const written = [];
  let failures = 0;

  for (const route of ROUTES) {
    const htmlFile = path.join(nextApp, route + '.html');
    if (!fs.existsSync(htmlFile)) {
      report.push({ route, status: 'MISSING_HTML', chars: 0, links: 0 });
      failures++;
      continue;
    }
    const raw = fs.readFileSync(htmlFile, 'utf8');
    const mainHtml = extractMain(raw);
    if (mainHtml === null) {
      report.push({ route, status: 'NO_MAIN', chars: 0, links: 0 });
      failures++;
      continue;
    }
    const md = convert(mainHtml);

    // A silent converter failure produces a near-empty file. 400 chars is well
    // below the smallest real page and well above a blank conversion, so it
    // separates "converter broke" from "page is short".
    if (md.length < 400) {
      report.push({ route, status: 'TOO_SHORT', chars: md.length, links: 0 });
      failures++;
      continue;
    }

    const header =
      '<!-- Generated from /' + route + ' at build time. Do not edit by hand. -->\n' +
      '<!-- Source of truth: the rendered page. A hand edit here is overwritten on the next build. -->\n\n' +
      '# Designesy \u2014 /' + route + '\n\n' +
      'Canonical page: https://www.designesy.org/' + route + '\n\n---\n\n';

    const body = header + md + '\n';
    const outFile = path.join(OUT_DIR, route + '.md');
    fs.mkdirSync(path.dirname(outFile), { recursive: true });
    fs.writeFileSync(outFile, body, 'utf8');

    const links = (body.match(/\]\(https?:/g) || []).length;
    written.push(route + '.md');
    report.push({ route, status: 'OK', chars: body.length, links });
  }

  // Persist the manifest so the NEXT run can delete exactly what THIS run
  // created, and nothing else in public/.
  fs.writeFileSync(manifestPath, JSON.stringify(written, null, 2), 'utf8');

  console.log('[md] per-page markdown generated:');
  for (const r of report) {
    const flag = r.status === 'OK' ? ' ok ' : 'FAIL';
    console.log(
      '  ' + flag + ' ' + r.route.padEnd(28) + r.status.padEnd(14) +
        String(r.chars).padStart(7) + ' chars  ' + String(r.links).padStart(3) + ' links',
    );
  }

  const ok = report.filter((r) => r.status === 'OK');
  const totalChars = ok.reduce((n, r) => n + r.chars, 0);
  const totalLinks = ok.reduce((n, r) => n + r.links, 0);
  console.log(
    '[md] ' + ok.length + '/' + report.length + ' routes, ' + totalChars + ' chars, ' +
      totalLinks + ' absolute links',
  );

  if (failures > 0) {
    console.error('[md] ' + failures + ' route(s) failed - failing the build rather than shipping a partial set');
    process.exit(1);
  }
}

main();
