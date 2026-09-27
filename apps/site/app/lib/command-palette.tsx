'use client';

import { ENGINE_CHECK_COUNT } from './check-definitions';

import { useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useRouter } from 'next/navigation';
import { CONTRACT_VERSION } from '../lib/design-system-contract';
import { useTheme } from './use-theme';
import { useMotionPreference } from './use-motion-pref';

/**
 * Command palette (Cmd+K / Ctrl+K, or "/").
 *
 * WHAT IT SEARCHES
 *   - Pages: the curated INDEX, ranked locally on every keystroke (exact, then
 *     prefix, word-start, acronym, substring, then an in-order fuzzy match).
 *   - Mentions: Pagefind full-text over the built site, loaded on the first
 *     keystroke. Its rows are APPENDED as their own group, never interleaved
 *     with the ranked pages, so a result under the reader's cursor or
 *     selection never moves when full-text arrives.
 *   - Actions: type a domain and the first row scores it; the site's own
 *     switches (theme, motion) are commands.
 *
 * INTERACTION CONTRACT (the fixes that made it feel solid, 2026-09-27)
 *   - The keyboard owns selection. The pointer moves it only on a real
 *     pointermove, never on mouseenter, so arrow-key scrolling can no longer
 *     hand the selection to whatever row slides under a resting cursor.
 *   - Selection resets to the first row when the QUERY changes, and nowhere
 *     else: late full-text results do not yank it back to the top.
 *   - Groups render once each, in the order of their best match, and arrow
 *     keys walk rows in exactly the visual order (the old list grouped only
 *     adjacent rows, so "Machine, Verify, Machine" repeated headings).
 *   - No open animation: the site's motion contract keeps keyboard-initiated
 *     actions still. The list height eases between result sets (120 ms) so the
 *     panel grows downward from a fixed top edge instead of jumping.
 *   - Focus stays in the input while open (Tab is held), Escape and click-away
 *     close from anywhere, and focus returns to the trigger.
 *
 * Accessibility: combobox + listbox with aria-activedescendant; groups are
 * role="group" labelled by their heading; reduced motion drops the height ease.
 */

type SearchItem = {
  title: string;
  href: string;
  group: 'Verify' | 'Contract' | 'Learn' | 'Labs' | 'Kits' | 'Machine' | 'Company';
  keywords: string; // extra terms for filtering (not rendered)
  meta?: string;
};

const INDEX: SearchItem[] = [
  // Verify
  { title: 'Score a site', href: '/score', group: 'Verify', keywords: 'verify audit grade checks engine test url', meta: `${ENGINE_CHECK_COUNT}-check engine` },
  { title: 'Drift radar', href: '/drift', group: 'Verify', keywords: 'drift ai generated ui token fabrication variance off contract', meta: '12-check drift' },
  { title: 'AI Readiness score', href: '/readiness', group: 'Verify', keywords: 'ai readiness machine readable llms.txt agent.json mcp design.md maturity', meta: '10-check readiness' },
  { title: 'Guardrails', href: '/guardrails', group: 'Verify', keywords: 'guardrails build contract emit dtcg stylelint agents.md lint enforce', meta: '5-check emitter' },
  { title: 'Drift monitor', href: '/monitor', group: 'Verify', keywords: 'monitor drift continuous governance watch cadence snapshot delta trend alert regression', meta: '10-check monitor' },
  { title: 'Compare design systems', href: '/compare', group: 'Verify', keywords: 'compare diff design systems tokens added removed renamed contrast drift score delta', meta: '8-check diff' },
  { title: 'Design-intelligence report', href: '/report', group: 'Verify', keywords: 'report synthesis composite score drift readiness unified grade holistic assessment', meta: 'synthesis capstone' },
  { title: 'Leaderboard', href: '/leaderboard', group: 'Verify', keywords: 'ranking cohort scores sites top', meta: 'cohort ranking' },
  { title: 'Framework evaluations', href: '/frameworks', group: 'Verify', keywords: 'framework evaluation article per site breakdown category score grade dedicated page deep dive', meta: '30 evaluations' },
  { title: 'State of Design Compliance', href: '/state-of-compliance', group: 'Verify', keywords: 'annual report compliance cohort material 3 framework rankings independence', meta: 'annual report' },
  { title: 'Benchmarks', href: '/benchmarks', group: 'Verify', keywords: 'compare benchmark baseline cohort', meta: '' },
  { title: 'Maturity self-assessment', href: '/maturity', group: 'Verify', keywords: 'maturity self-assessment quiz questionnaire radar chart axes stages compliance token motion accessibility platform verification', meta: '24 questions' },
  { title: 'Methodology', href: '/methodology', group: 'Verify', keywords: 'how scoring works weights checks rubric', meta: 'how it works' },
  { title: 'Contract changelog', href: '/changelog', group: 'Verify', keywords: 'changelog history version dimension tokens motion cadence accessibility takt poise acoustics copywriting identity security verification adopted added modified', meta: 'by dimension' },
  { title: 'M3 → DTCG bridge', href: '/m3-bridge', group: 'Verify', keywords: 'm3 material design 3 dtcg w3c token bridge converter dsp archived google design.md material-foundation', meta: 'token format bridge' },
  { title: 'Spring physics validator', href: '/spring-validator', group: 'Verify', keywords: 'spring physics damping stiffness mass overshoot reduced-motion accessibility vestibular validation m3 expressive framer motion react spring ios', meta: 'motion frontier' },
  { title: 'Specs', href: '/specs', group: 'Verify', keywords: 'specification engine checks detail', meta: '' },
  // Contract
  { title: 'Design system contract', href: '/contracts/design-system', group: 'Contract', keywords: 'tokens motion acoustic takt cadence typography rules v0.4.0', meta: CONTRACT_VERSION },
  { title: 'Contracts index', href: '/contracts', group: 'Contract', keywords: 'agreements verification portable', meta: '' },
  { title: 'Tokens', href: '/contracts/tokens', group: 'Contract', keywords: 'color spacing type dtcg values', meta: 'W3C DTCG' },
  { title: 'Motion', href: '/contracts/motion', group: 'Contract', keywords: 'animation duration easing spring reduced', meta: '' },
  { title: 'Accessibility', href: '/contracts/a11y', group: 'Contract', keywords: 'wcag axe contrast screen reader', meta: 'WCAG 2.2 AA' },
  { title: 'Drift', href: '/contracts/drift', group: 'Contract', keywords: 'ai drift token fabrication variance off contract', meta: 'v0.1.0' },
  { title: 'AI Readiness', href: '/contracts/readiness', group: 'Contract', keywords: 'ai readiness machine readable llms.txt agent.json mcp maturity', meta: 'v0.1.0' },
  { title: 'Guardrails', href: '/contracts/guardrails', group: 'Contract', keywords: 'guardrails build contract emit dtcg stylelint agents.md lint', meta: 'v0.1.0' },
  { title: 'Monitor', href: '/contracts/monitor', group: 'Contract', keywords: 'monitor drift continuous governance watch cadence snapshot delta trend alert', meta: 'v0.1.0' },
  { title: 'Compare', href: '/contracts/compare', group: 'Contract', keywords: 'compare diff design systems tokens added removed renamed contrast drift score delta', meta: 'v0.1.0' },
  { title: 'Report', href: '/contracts/report', group: 'Contract', keywords: 'report synthesis composite score drift readiness unified grade holistic', meta: 'v0.1.0' },
  { title: 'Acoustic tokens', href: '/acoustic-tokens', group: 'Contract', keywords: 'sound cues audio cue', meta: '19 cues' },
  // Learn
  { title: 'Docs', href: '/docs', group: 'Learn', keywords: 'orientation mission principles architecture', meta: '' },
  { title: 'Learn', href: '/learn', group: 'Learn', keywords: 'tutorials guides education', meta: '' },
  { title: 'Open', href: '/open', group: 'Learn', keywords: 'portable intelligence index feed open.json', meta: 'open.json' },
  { title: 'Open handoff', href: '/open/handoff', group: 'Learn', keywords: 'handoff agent ingest', meta: '' },
  { title: 'Graph', href: '/graph', group: 'Learn', keywords: 'relationships map nodes', meta: '' },
  // Labs
  { title: 'Labs', href: '/labs', group: 'Labs', keywords: 'experiments research poise takt cadence', meta: '' },
  { title: 'Takt lab', href: '/labs/takt', group: 'Labs', keywords: 'interface feel experiments touch target hit area button size tap feel spacing', meta: '' },
  { title: 'Cadence lab', href: '/labs/cadence', group: 'Labs', keywords: 'text rhythm typography line-height font type', meta: '' },
  // Kits
  { title: 'Kits', href: '/kits', group: 'Kits', keywords: 'instruction packages agents people', meta: '' },
  { title: 'Design Review kit', href: '/kits/design-review', group: 'Kits', keywords: 'review critique eight dimensions rubric', meta: 'Kit One' },
  { title: 'Review', href: '/review', group: 'Kits', keywords: 'field checks dimensions surface', meta: '' },
  // Machine
  { title: 'open.json', href: '/open.json', group: 'Machine', keywords: 'catalog packages machine feed', meta: 'JSON' },
  { title: 'llms.txt', href: '/llms.txt', group: 'Machine', keywords: 'agent brief llm', meta: 'text' },
  { title: 'agent.json', href: '/.well-known/agent.json', group: 'Machine', keywords: 'agent discovery well-known', meta: 'JSON' },
  { title: 'design-system.json', href: '/contracts/design-system.json', group: 'Machine', keywords: 'machine contract export', meta: 'JSON' },
  { title: 'MCP server', href: '/api/mcp', group: 'Machine', keywords: 'model context protocol tools', meta: 'MCP' },
  { title: 'MCP docs', href: '/docs/mcp', group: 'Machine', keywords: 'model context protocol server tools', meta: '' },
  // Company
  { title: 'Work', href: '/work', group: 'Company', keywords: 'case studies tile continuity', meta: '' },
  { title: 'Continuity case study', href: '/work/continuity', group: 'Company', keywords: 'continuity case study work artifact live', meta: 'case study' },
  { title: 'Pricing', href: '/pricing', group: 'Company', keywords: 'cost price how much plans continuity free subscribe upgrade tiers', meta: '' },
  { title: 'Continuity', href: '/continuity', group: 'Company', keywords: 'history drift waitlist judgment current monitoring alerts scheduled scans recurring paid subscription cost price how much', meta: 'waitlist' },
  { title: 'Badge', href: '/badge', group: 'Company', keywords: 'verified badge embed svg', meta: '' },
  { title: 'Privacy', href: '/privacy', group: 'Company', keywords: 'data policy', meta: '' },
];

const GROUP_ORDER: SearchItem['group'][] = ['Verify', 'Contract', 'Learn', 'Labs', 'Kits', 'Machine', 'Company'];

/** Best single destination per group — the zero-state shows exactly one tile
 *  per group so all seven groups fit without scrolling. */
const QUICK_PICKS: Record<SearchItem['group'], string> = {
  Verify: 'Score a site',
  Contract: 'Design system contract',
  Learn: 'Docs',
  Labs: 'Labs',
  Kits: 'Kits',
  Machine: 'MCP docs',
  Company: 'Pricing',
};

function normalize(s: string) {
  return s.toLowerCase().trim();
}

// ---------------------------------------------------------------------------
// Pagefind loader (lazy, resilient)
//
// Pagefind emits a WASM-backed stub under /_next/static/chunks/app/pagefind
// during postbuild. We import it on first keystroke via a hidden runtime
// specifier so the build never type-checks the URL. In `next dev` (and before
// the first production postbuild) the asset doesn't exist — loadPagefind()
// resolves null and the palette silently falls back to the INDEX filter.
// ---------------------------------------------------------------------------

type PagefindResultData = {
  url: string;
  meta?: { title?: string };
  excerpt?: string;
};

type PagefindSearchHit = {
  data: () => Promise<PagefindResultData>;
};

type PagefindSearchResponse = {
  results: PagefindSearchHit[];
};

type PagefindApi = {
  search: (query: string) => Promise<PagefindSearchResponse>;
  debouncedSearch: (
    query: string,
    options?: { debounceTimeoutMs?: number }
  ) => Promise<PagefindSearchResponse | null>;
  options: (opts: { ranking?: { metaWeights?: Record<string, number> } }) => Promise<void> | void;
  init?: () => Promise<void> | void;
};

let pagefindPromise: Promise<PagefindApi | null> | null = null;

const FLAGSHIP_HREFS = new Set([
  '/score',
  '/contracts/design-system',
  '/contracts/a11y',
  '/docs',
  '/methodology',
]);

function loadPagefind(): Promise<PagefindApi | null> {
  if (typeof window === 'undefined') return Promise.resolve(null);
  if (!pagefindPromise) {
    // Load the Pagefind stub at RUNTIME only. We use a non-literal specifier
    // (a const variable, not a string literal) so neither TypeScript nor the
    // Turbopack/webpack bundler tries to resolve or bundle the module at build
    // time — the import resolves against the deployed static chunk only when
    // the user actually searches. Zero bundle cost; dev falls back to the
    // curated INDEX.
    //
    // NOTE: Do NOT use `new Function()` here — that requires the CSP directive
    // 'unsafe-eval' (distinct from 'wasm-unsafe-eval'). A non-literal import()
    // has no CSP requirement beyond 'self', which we already have.
    //
    // CACHE-BUSTING: pagefind.js and pagefind-worker.js are served with
    // cache-control: immutable, so browsers hold stale copies from prior
    // deployments that carried an older CSP. We bust the cache two ways:
    //   1. The postbuild script patches pagefind.js to append ?v=<BUILD_ID>
    //      to the internal Worker URL string.
    //   2. We append ?v=<BUILD_ID> to the import() URL so the browser fetches
    //      a fresh pagefind.js (which has the patched Worker URL inside it).
    // The BUILD_ID comes from .next/BUILD_ID at build time; we read it from
    // a tiny JSON pointer file written by the postbuild script.
    const PAGEFIND_DIR = '/_next/static/chunks/app/pagefind';
    pagefindPromise = fetch(`${PAGEFIND_DIR}/pagefind-version.json`, { cache: 'no-store' })
      .then((r) => r.ok ? r.json() : null)
      .then((v: { buildId?: string } | null) => v?.buildId ?? 'noversion')
      .catch(() => 'noversion')
      .then((version) => {
        const pagefindUrl = `${PAGEFIND_DIR}/pagefind.js?v=${version}`;
        return import(/* @vite-ignore */ pagefindUrl);
      })
      .then(async (mod) => {
        const pf = (mod as { default?: PagefindApi }).default ?? (mod as unknown as PagefindApi);
        if (typeof pf.init === 'function') await pf.init();
        // Boost title/metadata so contract + flagship surfaces rank above
        // incidental body-text mentions (metaWeights maps data-pagefind-meta
        // keys; title is Pagefind's built-in page-title signal).
        await pf.options({
          ranking: { metaWeights: { title: 5.0, description: 3.0, priority: 10.0 } },
        });
        return pf;
      })
      .catch(() => null);
  }
  return pagefindPromise;
}

/** Rewrite a Pagefind result URL into a canonical navigable route.

  Pagefind indexes the staged route tree (scripts/postbuild-pagefind.js builds
  .next/search-stage/ from .next/server/app/*.html), but its runtime resolves
  every result URL relative to where pagefind.js is served — which is
  /_next/static/chunks/app/pagefind/. So a staged file work/continuity.html
  comes back from `hit.data()` as:

      /_next/static/chunks/app/work/continuity.html

  The pre-staging layout (indexing .next/server/app directly) produced the
  longer prefix:

      /_next/static/chunks/app/server/app/work/continuity.html

  Both shapes are chunk paths, not navigable routes — navigating to either
  404s. Before this rewrite existed, cleanHref filtered them ALL out and
  returned "", so Pagefind contributed zero results in production and the
  "hybrid search" was local-INDEX-only (45 indexed pages of body content
  were unreachable).

  We strip the chunk prefix (and the old /server/app/ segment if the staging
  step is ever skipped or reverts), drop the .html suffix, and filter Next.js
  internal pages (_not-found, _error, 404, 500, metadata routes) that are not
  real routes. What remains is the canonical route: /work/continuity.

  (Validated against official Pagefind docs v1.x: no data-pagefind-url
  attribute, no --url-prefix CLI flag, baseUrl only prepends — query-time
  rewrite is the only option for this index/serving layout.)
*/
function cleanHref(url: string): string {
  const CHUNK_PREFIX = '/_next/static/chunks/app';
  if (url.startsWith(CHUNK_PREFIX + '/') || url === CHUNK_PREFIX) {
    // Split off any ?query or #fragment the UI may have appended.
    let path = url, suffix = '';
    const m = url.match(/[?#]/);
    if (m) { suffix = url.slice(m.index); path = url.slice(0, m.index); }

    // Strip the chunk prefix, then the pre-staging /server/app/ segment if
    // present (handles both the staged and un-staged index layouts).
    let route = path.slice(CHUNK_PREFIX.length); // '/server/app/work/continuity.html' | '/work/continuity.html' | '' | '/'
    route = route.replace(/^\/server\/app\//, '/'); // pre-staging layout -> staged layout
    route = route.replace(/\/index\.html$/i, '/'); // /foo/index.html -> /foo/
    route = route.replace(/\.html$/i, '');          // /foo.html       -> /foo
    try { route = decodeURIComponent(route); } catch { /* malformed %seq — leave as-is */ }
    if (!route.startsWith('/')) route = '/' + route;

    // Filter Next.js internal pages that are not real routes:
    //   _not-found, _error (App/Pages Router), 404/500 (static export shells).
    // Defensive: metadata-route handlers (icon, opengraph-image, sitemap,
    // robots, manifest) and their asset extensions — these only appear if
    // the postbuild glob is ever widened beyond **/*.html, but filtering now
    // means a future glob change can't silently surface 404s in search.
    if (/^\/_(not-found|error)$/.test(route)) return '';
    if (/^\/(404|500)$/.test(route)) return '';
    if (/\.(json|txt|xml|png|jpe?g|webp|svg|ico|avif)$/.test(route)) return '';
    if (/\/(icon|apple-icon|favicon|opengraph-image|twitter-image|sitemap|robots|manifest)$/.test(route)) return '';

    if (route === '' || route === '/') return '/' + suffix;
    if (route.endsWith('/') && route !== '/') route = route.slice(0, -1);
    return route + suffix;
  }

  // Non-chunk Pagefind URLs (meta-tagged canonical routes): keep the
  // pathname only and drop any fragment/query so Enter goes to the page top.
  try {
    const u = new URL(url, window.location.origin);
    return u.pathname.replace(/\/$/, '') || '/';
  } catch {
    return url;
  }
}

/** Derive a display group from the href so hit rows keep the visual grouping. */
function groupForHref(href: string): SearchItem['group'] {
  if (!href) return 'Company';
  if (href.startsWith('/score') || href.startsWith('/leaderboard') || href.startsWith('/state-of-compliance') || href.startsWith('/benchmarks')
    || href.startsWith('/methodology') || href.startsWith('/specs') || href.startsWith('/maturity') || href.startsWith('/frameworks')
    || href.startsWith('/changelog') || href.startsWith('/m3-bridge') || href.startsWith('/spring-validator')) return 'Verify';
  if (href.startsWith('/contracts') || href.startsWith('/acoustic-tokens')) return 'Contract';
  if (href.startsWith('/docs') || href.startsWith('/learn') || href.startsWith('/open') || href.startsWith('/graph')) return 'Learn';
  if (href.startsWith('/labs')) return 'Labs';
  if (href.startsWith('/kits') || href.startsWith('/review')) return 'Kits';
  if (href.endsWith('.json') || href.endsWith('.txt') || href.startsWith('/.well-known') || href.startsWith('/api')) return 'Machine';
  return 'Company';
}

/** Human fallback label when Pagefind meta.title is absent (raw asset hits). */
function titleFromHref(href: string): string {
  const seg = href.split('/').filter(Boolean).pop() || 'home';
  return seg
    .replace(/\.(json|txt|html)$/, '')
    .split('-')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

/**
 * Modifier glyph for the visible shortcut badge.
 *
 * The key handler accepts `metaKey || ctrlKey` and the button's aria-label and
 * aria-keyshortcuts already name Control+K, so the accessible surface was
 * correct. The RENDERED badge was hardcoded to the Mac Command glyph, which is
 * a key that does not exist on a Windows or Linux keyboard — the badge told
 * those visitors to press a key they cannot press.
 *
 * Apple platforms get the Command glyph; everything else gets "Ctrl". Resolved
 * after mount because the platform is not known during SSR, and a wrong glyph
 * for one frame is worse than none — so it renders the neutral label first.
 */
function useModifierLabel(): string {
  const [label, setLabel] = useState('Ctrl');
  useEffect(() => {
    if (typeof navigator === 'undefined') return;
    const ua = navigator.userAgent || '';
    // /Mac|iPhone|iPad|iPod/ covers Apple desktop and mobile (iPadOS reports
    // as Macintosh on desktop-class Safari); everything else is Ctrl.
    if (/Mac|iPhone|iPad|iPod/.test(ua)) setLabel('⌘');
  }, []);
  return label;
}

// ---------------------------------------------------------------------------
// Ranking, actions, rows
// ---------------------------------------------------------------------------

/** Every character of q, in order, somewhere in text. */
function fuzzy(text: string, q: string): boolean {
  let i = 0;
  for (const ch of text) {
    if (ch === q[i]) i += 1;
    if (i === q.length) return true;
  }
  return false;
}

/** Rank a page: exact, prefix, word start, acronym, substring, keyword, then fuzzy. */
function rankItem(item: SearchItem, q: string): number {
  if (!q) return 0;
  const title = normalize(item.title);
  const kw = normalize(item.keywords);
  const meta = normalize(item.meta || '');
  const words = title.split(/[\s\-–—/:.]+/).filter(Boolean);
  let s = 0;
  if (title === q) s += 220;
  else if (title.startsWith(q)) s += 130;
  else if (words.some((w) => w.startsWith(q))) s += 95;
  else if (title.includes(q)) s += 60;
  if (q.length >= 2 && words.map((w) => w[0]).join('').startsWith(q)) s += 70;
  if (kw.split(/\s+/).some((w) => w.startsWith(q))) s += 45;
  else if (kw.includes(q)) s += 30;
  if (meta.includes(q)) s += 15;
  for (const part of q.split(/\s+/).filter(Boolean)) {
    if (title.includes(part)) s += 12;
    else if (kw.includes(part)) s += 8;
  }
  if (s === 0 && q.length >= 3 && fuzzy(title, q)) s += 10;
  return s;
}

/** "stripe.com", "https://www.stripe.com/pricing" -> "stripe.com/pricing"; else null. */
function urlTarget(raw: string): string | null {
  const t = raw.trim();
  if (!t || /\s/.test(t)) return null;
  if (!/^(https?:\/\/)?([a-z0-9-]+\.)+[a-z]{2,}(:\d+)?(\/\S*)?$/i.test(t)) return null;
  try {
    const u = new URL(/^https?:\/\//i.test(t) ? t : `https://${t}`);
    const path = u.pathname === '/' ? '' : u.pathname;
    return `${u.hostname.replace(/^www\./, '')}${path}`;
  } catch {
    return null;
  }
}

const FACETS: Record<string, SearchItem['group']> = {
  verify: 'Verify',
  score: 'Verify',
  contract: 'Contract',
  contracts: 'Contract',
  learn: 'Learn',
  docs: 'Learn',
  lab: 'Labs',
  labs: 'Labs',
  kit: 'Kits',
  kits: 'Kits',
  machine: 'Machine',
  api: 'Machine',
  company: 'Company',
};

type RowIcon = 'page' | 'score' | 'theme' | 'motion' | 'mention' | 'machine';

type Row = {
  key: string;
  title: string;
  meta?: string;
  metaHtml?: boolean;
  href?: string;
  run?: () => void;
  icon: RowIcon;
  hint?: string;
};

type Group = { name: string; rows: Row[] };

function Icon({ kind }: { kind: RowIcon }) {
  const common = {
    width: 16,
    height: 16,
    viewBox: '0 0 16 16',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.5,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    'aria-hidden': true,
  };
  switch (kind) {
    case 'score':
      return (
        <svg {...common}>
          <rect x="2.5" y="2.5" width="11" height="11" rx="2.5" />
          <path d="M5.2 8.2l1.9 1.9 3.8-4.2" />
        </svg>
      );
    case 'theme':
      return (
        <svg {...common}>
          <path d="M13 9.6A5.5 5.5 0 1 1 6.4 3a4.3 4.3 0 0 0 6.6 6.6z" />
        </svg>
      );
    case 'motion':
      return (
        <svg {...common}>
          <path d="M1.5 8c1.1-2.4 2.2-2.4 3.3 0s2.2 2.4 3.3 0 2.2-2.4 3.3 0 2.2 2.4 3.1 0" />
        </svg>
      );
    case 'mention':
      return (
        <svg {...common}>
          <path d="M3 4.5h10M3 8h10M3 11.5h6" />
        </svg>
      );
    case 'machine':
      return (
        <svg {...common}>
          <path d="M6 3.5C4.5 3.5 4.5 5 4.5 6S3.5 8 3 8c.5 0 1.5 1 1.5 2s0 2.5 1.5 2.5M10 3.5c1.5 0 1.5 1.5 1.5 2.5s1 2 1.5 2c-.5 0-1.5 1-1.5 2s0 2.5-1.5 2.5" />
        </svg>
      );
    default:
      return (
        <svg {...common}>
          <path d="M4 2.5h5.2L12 5.3v8.2H4z" />
          <path d="M9 2.7V5.5h2.8" />
        </svg>
      );
  }
}

/** The title with the first match of q set in bold (visual only). */
function marked(title: string, q: string): ReactNode {
  if (!q) return title;
  const i = title.toLowerCase().indexOf(q);
  if (i < 0) return title;
  return (
    <>
      {title.slice(0, i)}
      <mark>{title.slice(i, i + q.length)}</mark>
      {title.slice(i + q.length)}
    </>
  );
}

export function CommandPalette() {
  const router = useRouter();
  const modLabel = useModifierLabel();
  const theme = useTheme();
  const motion = useMotionPreference();
  const listId = useId();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [activeKey, setActiveKey] = useState<string | null>(null);
  const [mentions, setMentions] = useState<SearchItem[]>([]);
  const [searching, setSearching] = useState(false);
  const [listH, setListH] = useState<number | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const innerRef = useRef<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const returnFocusRef = useRef<HTMLElement | null>(null);
  const pointerRef = useRef<{ x: number; y: number } | null>(null);
  const keyNavRef = useRef(false);
  const searchSeq = useRef(0);

  const q = normalize(query);

  // Facets ("labs: takt") narrow the page search to one group.
  const { facet, text } = useMemo(() => {
    const m = q.match(/^([a-z]+):\s*(.*)$/);
    if (m && FACETS[m[1]]) return { facet: FACETS[m[1]], text: m[2].trim() };
    return { facet: null as SearchItem['group'] | null, text: q };
  }, [q]);

  // Full-text mentions: Pagefind, loaded on the first keystroke, appended as
  // their own group. Pages the local index already ranks are not repeated.
  useEffect(() => {
    if (!text || facet) {
      setMentions([]);
      setSearching(false);
      return;
    }
    const seq = ++searchSeq.current;
    let cancelled = false;
    (async () => {
      setSearching(true);
      const pf = await loadPagefind();
      if (!pf || cancelled || seq !== searchSeq.current) {
        if (seq === searchSeq.current) setSearching(false);
        return;
      }
      const res = await pf.debouncedSearch(text, { debounceTimeoutMs: 140 });
      if (cancelled || seq !== searchSeq.current || !res) {
        if (!res && seq === searchSeq.current) setSearching(false);
        return;
      }
      const rows = await Promise.all(
        res.results.slice(0, 8).map(async (hit) => {
          const d = await hit.data();
          const href = cleanHref(d.url);
          if (!href) return null;
          const title = d.meta?.title?.trim() || titleFromHref(href);
          const meta = d.excerpt
            ? d.excerpt
                .replace(/<(?!\/?mark>)[^>]+>/g, '')
                .replace(/\s+/g, ' ')
                .trim()
                .slice(0, 110)
            : '';
          return { title, href, group: groupForHref(href), keywords: '', meta } as SearchItem;
        })
      );
      if (cancelled || seq !== searchSeq.current) return;
      setMentions(rows.filter(Boolean) as SearchItem[]);
      setSearching(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [text, facet]);

  const close = useCallback(() => {
    setOpen(false);
    setQuery('');
    setMentions([]);
    setSearching(false);
    setListH(null);
    searchSeq.current += 1;
    const back = returnFocusRef.current ?? triggerRef.current;
    back?.focus?.();
  }, []);

  const openPalette = useCallback(() => {
    returnFocusRef.current = (document.activeElement as HTMLElement | null) ?? null;
    setQuery('');
    setOpen(true);
  }, []);

  const go = useCallback(
    (href: string) => {
      close();
      router.push(href);
    },
    [close, router]
  );

  // Rows, grouped, in the exact order the keyboard walks them.
  const groups: Group[] = useMemo(() => {
    const dark = theme.theme === 'dark';
    const commands: (Row & { words: string })[] = [
      {
        key: 'cmd-theme',
        title: dark ? 'Switch to light mode' : 'Switch to dark mode',
        meta: 'Theme',
        icon: 'theme',
        words: 'theme dark light mode appearance colour color night day',
        run: () => {
          close();
          theme.toggle();
        },
      },
      {
        key: 'cmd-motion',
        title: motion.paused ? 'Resume motion' : 'Pause motion',
        meta: 'Every looping animation on the site',
        icon: 'motion',
        words: 'motion animation pause resume stop reduce loops',
        run: () => {
          close();
          motion.toggle();
        },
      },
    ];
    const pageRow = (item: SearchItem): Row => ({
      key: `page:${item.href}`,
      title: item.title,
      meta: item.meta || undefined,
      href: item.href,
      icon: item.group === 'Machine' ? 'machine' : 'page',
    });

    if (!q) {
      const picks = GROUP_ORDER.map((g) => INDEX.find((i) => i.group === g && i.title === QUICK_PICKS[g]))
        .filter(Boolean)
        .map((item) => ({ ...pageRow(item as SearchItem), meta: (item as SearchItem).group }));
      return [
        { name: 'Jump to', rows: picks },
        { name: 'Commands', rows: commands.map(({ words: _w, ...r }) => r) },
      ];
    }

    const out: Group[] = [];
    const target = facet ? null : urlTarget(query);
    if (target) {
      out.push({
        name: 'Score',
        rows: [
          {
            key: 'act-score',
            title: `Score ${target}`,
            meta: `Run the ${ENGINE_CHECK_COUNT} checks against contract ${CONTRACT_VERSION}`,
            href: `/score?url=${encodeURIComponent(target)}`,
            icon: 'score',
            hint: 'Enter',
          },
        ],
      });
    }

    const ranked = INDEX.filter((i) => (facet ? i.group === facet : true))
      .map((item) => ({ item, s: text ? rankItem(item, text) : 1 }))
      .filter((r) => r.s > 0)
      .sort((a, b) => b.s - a.s || GROUP_ORDER.indexOf(a.item.group) - GROUP_ORDER.indexOf(b.item.group))
      .slice(0, 14);
    const order: SearchItem['group'][] = [];
    for (const r of ranked) if (!order.includes(r.item.group)) order.push(r.item.group);
    for (const g of order) {
      out.push({ name: g, rows: ranked.filter((r) => r.item.group === g).map((r) => pageRow(r.item)) });
    }

    if (!facet && text) {
      const matched = commands.filter((c) => c.words.split(' ').some((w) => w.startsWith(text)) || c.title.toLowerCase().includes(text));
      if (matched.length) out.push({ name: 'Commands', rows: matched.map(({ words: _w, ...r }) => r) });
    }

    const have = new Set(ranked.map((r) => r.item.href));
    const extra = mentions.filter((m) => !have.has(m.href));
    if (extra.length) {
      out.push({
        name: 'Mentioned on',
        rows: extra.map((m) => ({
          key: `mention:${m.href}`,
          title: m.title,
          meta: m.meta,
          metaHtml: true,
          href: m.href,
          icon: 'mention' as const,
        })),
      });
    }
    return out;
  }, [q, query, facet, text, mentions, theme, motion, close]);

  const flat = useMemo(() => groups.flatMap((g) => g.rows), [groups]);

  // Selection: first row on every query change; kept across late results.
  useEffect(() => {
    setActiveKey(flat[0]?.key ?? null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);
  useEffect(() => {
    if (activeKey && !flat.some((r) => r.key === activeKey)) setActiveKey(flat[0]?.key ?? null);
    if (!activeKey && flat.length) setActiveKey(flat[0].key);
  }, [flat, activeKey]);

  const activeIndex = flat.findIndex((r) => r.key === activeKey);
  const optionId = (key: string) => `${listId}-opt-${key.replace(/[^a-z0-9-]/gi, '_')}`;

  // Keyboard navigation scrolls the active row into view; pointer never does.
  useEffect(() => {
    if (!keyNavRef.current || !activeKey) return;
    keyNavRef.current = false;
    document.getElementById(optionId(activeKey))?.scrollIntoView({ block: 'nearest' });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeKey]);

  const runRow = useCallback(
    (row: Row | undefined) => {
      if (!row) return;
      if (row.run) row.run();
      else if (row.href) go(row.href);
    },
    [go]
  );

  const onInputKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    const n = flat.length;
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      if (!n) return;
      const d = e.key === 'ArrowDown' ? 1 : -1;
      const next = activeIndex < 0 ? 0 : (activeIndex + d + n) % n;
      keyNavRef.current = true;
      setActiveKey(flat[next].key);
    } else if (e.key === 'Home' && n) {
      e.preventDefault();
      keyNavRef.current = true;
      setActiveKey(flat[0].key);
    } else if (e.key === 'End' && n) {
      e.preventDefault();
      keyNavRef.current = true;
      setActiveKey(flat[n - 1].key);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      runRow(flat[activeIndex] ?? flat[0]);
    } else if (e.key === 'Tab') {
      // The palette is modal: focus stays in its one field.
      e.preventDefault();
    }
  };

  // Global keys: capture phase, so Escape works from any focus.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const isMod = e.metaKey || e.ctrlKey;
      if (isMod && (e.key === 'k' || e.key === 'K')) {
        e.preventDefault();
        if (open) close();
        else openPalette();
        return;
      }
      if (e.key === 'Escape' && open) {
        e.preventDefault();
        close();
        return;
      }
      if (e.key === '/' && !open) {
        const t = e.target as HTMLElement | null;
        const tag = t?.tagName?.toLowerCase();
        if (tag !== 'input' && tag !== 'textarea' && !t?.isContentEditable) {
          e.preventDefault();
          openPalette();
        }
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [open, openPalette, close]);

  // Focus the field the moment the panel exists.
  useLayoutEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  // The page behind stays put: scroll is locked (html reserves its scrollbar
  // gutter, so nothing shifts sideways).
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
      window.dispatchEvent(new Event('scroll'));
    };
  }, [open]);

  // The list's height follows its content, eased (CSS), so the panel grows
  // downward from a fixed top edge instead of jumping.
  useLayoutEffect(() => {
    if (!open) return;
    const inner = innerRef.current;
    if (!inner || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(() => setListH(inner.offsetHeight));
    ro.observe(inner);
    setListH(inner.offsetHeight);
    return () => ro.disconnect();
  }, [open]);

  const empty = flat.length === 0;

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        className="cmdk-trigger"
        aria-label="Open search (Ctrl+K)"
        aria-keyshortcuts="Control+K Meta+K"
        onClick={openPalette}
        data-cuelume-hover="tick"
        data-cuelume-press="tick"
      >
        <svg className="cmdk-trigger-icon" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
          <circle cx="11" cy="11" r="7" />
          <line x1="21" y1="21" x2="16.5" y2="16.5" />
        </svg>
        <span className="cmdk-trigger-label">Find</span>
        <kbd className="cmdk-trigger-kbd" aria-hidden="true">
          <span className="cmdk-kbd-mod">{modLabel}</span>K
        </kbd>
      </button>

      {open &&
        createPortal(
          <div
            className="cmdk-overlay"
            role="presentation"
            onPointerDown={(e) => {
              if (e.target === e.currentTarget) {
                e.preventDefault();
                close();
              }
            }}
          >
            <div className="cmdk-panel" role="dialog" aria-modal="true" aria-label="Search designesy.org">
              <div className="cmdk-input-row">
                <svg className="cmdk-input-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
                  <circle cx="11" cy="11" r="7" />
                  <line x1="21" y1="21" x2="16.5" y2="16.5" />
                </svg>
                <input
                  ref={inputRef}
                  type="text"
                  className="cmdk-input"
                  placeholder="Search pages, or type a URL to score it"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  onKeyDown={onInputKeyDown}
                  role="combobox"
                  aria-expanded="true"
                  aria-controls={listId}
                  aria-activedescendant={activeKey && !empty ? optionId(activeKey) : undefined}
                  aria-autocomplete="list"
                  spellCheck={false}
                  autoComplete="off"
                />
                {searching && <span className="cmdk-searching-dot" aria-hidden="true" />}
                <kbd className="cmdk-esc" aria-hidden="true">
                  esc
                </kbd>
              </div>

              <div
                className="cmdk-list"
                id={listId}
                role="listbox"
                aria-label="Results"
                style={listH === null ? undefined : { height: listH }}
                data-sized={listH === null ? undefined : ''}
              >
                <div className="cmdk-list-inner" ref={innerRef}>
                  {empty ? (
                    <div className="cmdk-empty">
                      <p className="cmdk-empty-title">Nothing matches &ldquo;{query}&rdquo;</p>
                      <p className="cmdk-empty-sub">
                        Try a page name, a check ID, or a domain like example.com to score it.
                      </p>
                    </div>
                  ) : (
                    groups.map((g, gi) => (
                      <div className="cmdk-group" role="group" aria-labelledby={`${listId}-g${gi}`} key={g.name}>
                        <div className="cmdk-group-label" id={`${listId}-g${gi}`}>
                          {g.name}
                        </div>
                        {g.rows.map((row) => {
                          const active = row.key === activeKey;
                          return (
                            <div
                              key={row.key}
                              id={optionId(row.key)}
                              role="option"
                              aria-selected={active}
                              className={`cmdk-item${active ? ' is-active' : ''}`}
                              data-kind={row.icon}
                              onPointerMove={(e) => {
                                const last = pointerRef.current;
                                pointerRef.current = { x: e.clientX, y: e.clientY };
                                if (last && last.x === e.clientX && last.y === e.clientY) return;
                                if (!active) setActiveKey(row.key);
                              }}
                              onClick={() => runRow(row)}
                            >
                              <span className="cmdk-item-icon">
                                <Icon kind={row.icon} />
                              </span>
                              <span className="cmdk-item-body">
                                <span className="cmdk-item-title">{marked(row.title, text)}</span>
                                {row.meta &&
                                  (row.metaHtml ? (
                                    <span className="cmdk-item-meta" dangerouslySetInnerHTML={{ __html: row.meta }} />
                                  ) : (
                                    <span className="cmdk-item-meta">{row.meta}</span>
                                  ))}
                              </span>
                              <kbd className="cmdk-item-enter" aria-hidden="true">
                                ↵
                              </kbd>
                            </div>
                          );
                        })}
                      </div>
                    ))
                  )}
                </div>
              </div>

              <div className="cmdk-footer" aria-hidden="true">
                <span className="cmdk-footer-hint">
                  <kbd>↑</kbd>
                  <kbd>↓</kbd> move
                </span>
                <span className="cmdk-footer-hint">
                  <kbd>↵</kbd> open
                </span>
                <span className="cmdk-footer-hint">
                  <kbd>esc</kbd> close
                </span>
                <span className="cmdk-footer-hint cmdk-footer-tip">
                  <kbd>labs:</kbd> filter by section
                </span>
              </div>
            </div>
          </div>,
          document.body
        )}
    </>
  );
}
