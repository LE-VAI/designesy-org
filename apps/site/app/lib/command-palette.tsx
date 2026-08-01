'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';

/**
 * Command palette (Cmd+K / Ctrl+K).
 *
 * Phase 3.4 (esy-search) — hybrid search surface:
 *   • Empty query  → curated QUICK JUMP grid (top destination per group) so
 *     the zero-state is scannable in one glance instead of a 30-row scroll.
 *   • Typed query  → instant local INDEX filter painted first (zero perceived
 *     latency), then Pagefind full-text (BM25 + fuzzy, title-weighted) refines
 *     over the built site. Degrades gracefully to the INDEX filter when the
 *     Pagefind asset isn't available (next dev, pre-postbuild).
 *
 * Pagefind is emitted by the postbuild step into .next/static and loaded
 * lazily on first keystroke — zero cost until the user actually searches.
 *
 * Interaction contract (Phase-critical tweaks):
 *   • Click-away / tap-away dismisses via pointerdown (before blur/scroll),
 *     not click — so a tap that starts outside the panel closes it on both
 *     desktop and touch.
 *   • Escape closes even when focus has left the input (global capture-phase
 *     listener while open), and Cmd+K resets as well as toggles.
 *   • Results list is the only scroll container (overscroll-behavior: contain)
 *     so wheel/touch scrolling never chains to the page behind the overlay.
 *
 * Accessibility: roving tabindex listbox, full keyboard operability,
 * aria-activedescendant, focus restore. Reduced-motion respected via CSS
 * (opacity/transform transitions only, gated by media query).
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
  { title: 'Score a site', href: '/score', group: 'Verify', keywords: 'verify audit grade checks engine test url', meta: '40-check engine' },
  { title: 'Leaderboard', href: '/leaderboard', group: 'Verify', keywords: 'ranking cohort scores sites top', meta: 'cohort ranking' },
  { title: 'Benchmarks', href: '/benchmarks', group: 'Verify', keywords: 'compare benchmark baseline cohort', meta: '' },
  { title: 'Methodology', href: '/methodology', group: 'Verify', keywords: 'how scoring works weights checks rubric', meta: 'how it works' },
  { title: 'Specs', href: '/specs', group: 'Verify', keywords: 'specification engine checks detail', meta: '' },
  // Contract
  { title: 'Design system contract', href: '/contracts/design-system', group: 'Contract', keywords: 'tokens motion acoustic takt cadence typography rules v0.4.0', meta: 'v0.4.0' },
  { title: 'Contracts index', href: '/contracts', group: 'Contract', keywords: 'agreements verification portable', meta: '' },
  { title: 'Tokens', href: '/contracts/tokens', group: 'Contract', keywords: 'color spacing type dtcg values', meta: 'W3C DTCG' },
  { title: 'Motion', href: '/contracts/motion', group: 'Contract', keywords: 'animation duration easing spring reduced', meta: '' },
  { title: 'Accessibility', href: '/contracts/a11y', group: 'Contract', keywords: 'wcag axe contrast screen reader', meta: 'WCAG 2.2 AA' },
  { title: 'Acoustic tokens', href: '/acoustic-tokens', group: 'Contract', keywords: 'sound cues audio cue', meta: '10 cues' },
  // Learn
  { title: 'Docs', href: '/docs', group: 'Learn', keywords: 'orientation mission principles architecture', meta: '' },
  { title: 'Learn', href: '/learn', group: 'Learn', keywords: 'tutorials guides education', meta: '' },
  { title: 'Open', href: '/open', group: 'Learn', keywords: 'portable intelligence index feed open.json', meta: 'open.json' },
  { title: 'Open handoff', href: '/open/handoff', group: 'Learn', keywords: 'handoff agent ingest', meta: '' },
  { title: 'Graph', href: '/graph', group: 'Learn', keywords: 'relationships map nodes', meta: '' },
  // Labs
  { title: 'Labs', href: '/labs', group: 'Labs', keywords: 'experiments research poise takt cadence', meta: '' },
  { title: 'Takt lab', href: '/labs/takt', group: 'Labs', keywords: 'interface feel experiments', meta: '' },
  { title: 'Cadence lab', href: '/labs/cadence', group: 'Labs', keywords: 'text rhythm typography', meta: '' },
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
  { title: 'Pricing', href: '/pricing', group: 'Company', keywords: 'cost plans continuity free', meta: '' },
  { title: 'Continuity', href: '/continuity', group: 'Company', keywords: 'history drift waitlist judgment current', meta: 'waitlist' },
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

function scoreItem(item: SearchItem, q: string): number {
  if (!q) return 0;
  const title = normalize(item.title);
  const kw = normalize(item.keywords);
  const meta = normalize(item.meta || '');
  const group = normalize(item.group);
  let score = 0;
  // Title prefix match is strongest
  if (title.startsWith(q)) score += 100;
  else if (title.includes(q)) score += 60;
  if (kw.includes(q)) score += 40;
  if (meta.includes(q)) score += 20;
  if (group.startsWith(q)) score += 15;
  // Per-word bonus so multi-token queries narrow well
  for (const word of q.split(/\s+/).filter(Boolean)) {
    if (title.includes(word)) score += 12;
    if (kw.includes(word)) score += 8;
  }
  return score;
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
    // Load the Pagefind stub at RUNTIME only. A literal dynamic-import specifier
    // is type-checked by `next build` (TS resolves the URL and fails on missing
    // declarations) even with webpackIgnore. Using new Function hides the
    // specifier from BOTH TypeScript and the webpack bundler, so the build
    // passes and the import resolves against the deployed static chunk only
    // when the user actually searches. Zero bundle cost; dev falls back to
    // the curated INDEX.
    const runtimeImport = new Function('u', 'return import(u)') as (
      u: string
    ) => Promise<unknown>;
    pagefindPromise = runtimeImport('/_next/static/chunks/app/pagefind/pagefind.js')
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

/** Strip the Pagefind-injected trailing slash/anchors so hrefs stay clean. */
function cleanHref(url: string): string {
  // Pagefind indexes `.next/server/app/**/*.html` during postbuild, so every
  // result URL is a build-chunk path like
  //   /_next/static/chunks/app/server/app/work/continuity.html
  //   /_next/static/chunks/app/server/app/                 (root page)
  //   /_next/static/chunks/app/server/app/_not-found.html  (Next internal 404)
  // These are NOT navigable routes. Before this rewrite, cleanHref filtered
  // them ALL out and returned "" — which meant Pagefind contributed zero
  // results in production and the "hybrid search" was local-INDEX-only.
  //
  // Rewrite the chunk path to its canonical route by stripping the
  //   /_next/static/chunks/app/server/app/  prefix and the  .html  suffix.
  // The root page (trailing slash, no file) maps to "/". Internal Next.js
  // pages prefixed with "_" (e.g. _not-found) are filtered out — they are
  // not real routes (/_not-found returns 404). Real routes that happen to
  // start with an underscore do not exist in the App Router convention.
  const CHUNK_PREFIX = '/_next/static/chunks/app/server/app/';
  if (url.startsWith(CHUNK_PREFIX) || url === CHUNK_PREFIX.slice(0, -1)) {
    let route = url.slice(CHUNK_PREFIX.length);
    if (route.endsWith('.html')) route = route.slice(0, -5);
    if (route === '' ) route = '/';
    else if (route.endsWith('/') && route !== '/') route = route.slice(0, -1);
    if (!route.startsWith('/')) route = '/' + route;
    // Filter Next.js internal pages (_not-found, _error, etc.) — not navigable.
    if (route === '/_not-found' || route.startsWith('/_')) return '';
    return route;
  }

  // Non-chunk Pagefind URLs (rare — meta-tagged canonical routes): keep the
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
  if (href.startsWith('/score') || href.startsWith('/leaderboard') || href.startsWith('/benchmarks')
    || href.startsWith('/methodology') || href.startsWith('/specs')) return 'Verify';
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

export function CommandPalette() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const [hits, setHits] = useState<SearchItem[] | null>(null); // Pagefind results for typed queries
  const [searching, setSearching] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const searchSeq = useRef(0); // stale-response guard

  // Typed-query search. Prefers Pagefind full-text (body + BM25 ranking);
  // falls back to the curated INDEX filter when Pagefind is unavailable.
  useEffect(() => {
    const q = normalize(query);
    if (!q) {
      setHits(null);
      setSearching(false);
      return;
    }

    // Instant local filter FIRST so the UI always shows something with zero
    // perceived latency; Pagefind refines when it resolves.
    const local = INDEX
      .map((item) => ({ item, s: scoreItem(item, q) }))
      .filter((r) => r.s > 0)
      .sort((a, b) => b.s - a.s || GROUP_ORDER.indexOf(a.item.group) - GROUP_ORDER.indexOf(b.item.group))
      .map((r) => r.item)
      .slice(0, 12);
    setHits(local);

    const seq = ++searchSeq.current;
    let cancelled = false;

    (async () => {
      setSearching(true);
      const pf = await loadPagefind();
      if (!pf || cancelled || seq !== searchSeq.current) {
        setSearching(false);
        return;
      }
      // debouncedSearch returns null when superseded by a newer keystroke —
      // treat that as "a newer request owns the listbox now".
      const res = await pf.debouncedSearch(q, { debounceTimeoutMs: 120 });
      if (cancelled || seq !== searchSeq.current) return;
      if (!res) {
        // Superseded — a newer query is in-flight. Keep searching=true only
        // while the newer request could still own the listbox.
        setSearching(false);
        return;
      }

      const rows = await Promise.all(
        res.results.slice(0, 12).map(async (hit) => {
          const d = await hit.data();
          const href = cleanHref(d.url);
          if (!href) return null; // skip Pagefind internal chunk URLs
          const title = d.meta?.title?.trim() || titleFromHref(href);
          // excerpt carries matched body context — use it as the row meta so
          // hits show WHY they matched, not just where they go.
          const meta = d.excerpt
            ? d.excerpt.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim().slice(0, 80)
            : '';
          return {
            title,
            href,
            group: groupForHref(href),
            keywords: '',
            meta,
            _flagship: FLAGSHIP_HREFS.has(href),
          } as SearchItem & { _flagship: boolean };
        })
      );

      if (cancelled || seq !== searchSeq.current) return;
      const validRows = rows.filter(Boolean) as (SearchItem & { _flagship: boolean })[];
      // Flagship surfaces float to the top of their group on exact page hits.
      validRows.sort((a, b) => Number(b._flagship) - Number(a._flagship));
      validRows.sort((a, b) => GROUP_ORDER.indexOf(a.group) - GROUP_ORDER.indexOf(b.group));

      // MERGE — never REPLACE. The local INDEX filter already produced scored,
      // sorted matches (authoritative for our curated routes). Pagefind may
      // resolve to an empty set when its index references build-chunk URLs we
      // filter out, or when BM25 ranks body text below our curated pages. If we
      // blindly setHits(validRows) an empty Pagefind result would wipe correct
      // local matches (the live "score"/"methodology" → No matches bug). So:
      // keep every local hit, and append ONLY Pagefind rows whose href is not
      // already present locally. Local wins on collision.
      const localHrefs = new Set(local.map((item) => item.href));
      const pfOnly = validRows.filter((r) => !localHrefs.has(r.href));
      const merged = [
        ...local,
        ...pfOnly.map(({ _flagship, ...rest }) => rest),
      ].slice(0, 12);
      setHits(merged);
      setSearching(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [query]);

  // Zero-state: one QUICK JUMP tile per group (7 tiles, no scroll) — the
  // authoritative browse view. Typed queries stay in the grouped list.
  const zeroStateResults = useMemo(() => {
    return GROUP_ORDER.map(
      (g) => INDEX.find((item) => item.group === g && item.title === QUICK_PICKS[g])!
    ).filter(Boolean);
  }, []);

  const results = useMemo(() => {
    const q = normalize(query);
    if (!q) return zeroStateResults;
    return hits ?? [];
  }, [query, hits, zeroStateResults]);

  const openPalette = useCallback(() => {
    setOpen(true);
    setQuery('');
    setActive(0);
  }, []);

  const closePalette = useCallback(() => {
    setOpen(false);
    setQuery('');
    setActive(0);
    setHits(null);
    setSearching(false);
    searchSeq.current += 1; // invalidate any in-flight Pagefind response
    // Restore focus to the trigger for keyboard users
    triggerRef.current?.focus();
  }, []);

  const go = useCallback(
    (href: string) => {
      closePalette();
      router.push(href);
    },
    [closePalette, router]
  );

  // Global keys — capture phase, so nothing between target and window
  // swallows them, and Escape works even when focus is NOT in the input
  // (the intermittent-Escape bug: keydown on document.body had no handler).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const isMod = e.metaKey || e.ctrlKey;
      if (isMod && (e.key === 'k' || e.key === 'K')) {
        e.preventDefault();
        if (open) {
          closePalette();
        } else {
          openPalette();
        }
        return;
      }
      if (e.key === 'Escape' && open) {
        e.preventDefault();
        closePalette();
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
  }, [open, openPalette, closePalette]);

  // Click-away / tap-away dismiss — pointerdown (not click) so the palette
  // closes before blur, focus-shift, or scroll can interfere, on desktop
  // and touch alike. Guarded to presses that start OUTSIDE the panel.
  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: PointerEvent) => {
      const el = panelRef.current;
      if (el && e.target instanceof Node && !el.contains(e.target)) {
        e.preventDefault(); // don't let the stray tap activate anything behind
        closePalette();
      }
    };
    document.addEventListener('pointerdown', onPointerDown, true);
    return () => document.removeEventListener('pointerdown', onPointerDown, true);
  }, [open, closePalette]);

  // Focus input when opened
  useEffect(() => {
    if (open) {
      // next frame so the element is mounted
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [open]);

  // Lock body scroll while open (list is the only scroll container;
  // CSS overscroll-behavior: contain stops wheel/touch chaining).
  useEffect(() => {
    if (!open) return;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = '';
    };
  }, [open]);

  // Reset active index when results change
  useEffect(() => {
    setActive(0);
  }, [results.length, query]);

  // Keep active item scrolled into view
  useEffect(() => {
    const el = listRef.current?.querySelector<HTMLElement>(`[data-index="${active}"]`);
    el?.scrollIntoView({ block: 'nearest' });
  }, [active]);

  const onInputKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActive((a) => Math.min(a + 1, results.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((a) => Math.max(a - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const item = results[active];
      if (item) go(item.href);
    } else if (e.key === 'Home') {
      e.preventDefault();
      setActive(0);
    } else if (e.key === 'End') {
      e.preventDefault();
      setActive(results.length - 1);
    }
    // Escape is handled by the global capture listener (works from any focus).
  };

  // Group the current results for rendering with headers. The zero-state is
  // intentionally flat (one tile per group, self-labeled) so headers would
  // be redundant; typed queries keep the familiar grouped list.
  const isZeroState = normalize(query) === '';
  const grouped = useMemo(() => {
    const out: { group: string; items: { item: SearchItem; index: number }[] }[] = [];
    let lastGroup = '';
    results.forEach((item, index) => {
      if (item.group !== lastGroup) {
        out.push({ group: item.group, items: [{ item, index }] });
        lastGroup = item.group;
      } else {
        out[out.length - 1].items.push({ item, index });
      }
    });
    return out;
  }, [results]);

  const renderRow = (item: SearchItem, index: number) => (
    <button
      key={item.href}
      id={`cmdk-opt-${index}`}
      data-index={index}
      type="button"
      role="option"
      aria-selected={index === active}
      className={`cmdk-item${index === active ? ' is-active' : ''}`}
      onMouseEnter={() => setActive(index)}
      onClick={() => go(item.href)}
    >
      <span className="cmdk-item-title">
        {isZeroState && <span className="cmdk-item-group">{item.group} — </span>}
        {item.title}
      </span>
      {item.meta && <span className="cmdk-item-meta">{item.meta}</span>}
      <span className="cmdk-item-arrow" aria-hidden="true">→</span>
    </button>
  );

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
        <span className="cmdk-trigger-label">Search</span>
        <kbd className="cmdk-trigger-kbd" aria-hidden="true">
          <span className="cmdk-kbd-mod">⌘</span>K
        </kbd>
      </button>

      {open && (
        <div className="cmdk-overlay" role="presentation">
          <div
            ref={panelRef}
            className="cmdk-panel"
            role="dialog"
            aria-modal="true"
            aria-label="Search designesy.org"
          >
            <div className="cmdk-input-row">
              <svg className="cmdk-input-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
                <circle cx="11" cy="11" r="7" />
                <line x1="21" y1="21" x2="16.5" y2="16.5" />
              </svg>
              <input
                ref={inputRef}
                type="text"
                className="cmdk-input"
                placeholder="Search pages, contracts, endpoints…"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={onInputKeyDown}
                role="combobox"
                aria-expanded="true"
                aria-controls="cmdk-listbox"
                aria-activedescendant={results[active] ? `cmdk-opt-${active}` : undefined}
                aria-autocomplete="list"
                spellCheck={false}
                autoComplete="off"
              />
              <kbd className="cmdk-esc" aria-hidden="true">esc</kbd>
            </div>

            <div
              ref={listRef}
              className="cmdk-list"
              id="cmdk-listbox"
              role="listbox"
              aria-label="Search results"
            >
              {results.length === 0 && (
                <div className="cmdk-empty" role="option" aria-selected="false">
                  {searching ? (
                    <>
                      <p className="cmdk-empty-title">Searching…</p>
                      <p className="cmdk-empty-sub">Looking through body content and contracts.</p>
                    </>
                  ) : (
                    <>
                      <p className="cmdk-empty-title">No matches for “{query}”</p>
                      <p className="cmdk-empty-sub">Try a page name, contract, endpoint, or topic.</p>
                    </>
                  )}
                </div>
              )}
              {isZeroState ? (
                <>
                  <div className="cmdk-group-label" aria-hidden="true">Quick jump</div>
                  {results.map((item, index) => renderRow(item, index))}
                </>
              ) : (
                grouped.map((g) => (
                  <div key={g.group} className="cmdk-group">
                    <div className="cmdk-group-label" aria-hidden="true">{g.group}</div>
                    {g.items.map(({ item, index }) => renderRow(item, index))}
                  </div>
                ))
              )}
            </div>

            <div className="cmdk-footer" aria-hidden="true">
              <span className="cmdk-footer-hint"><kbd>↑</kbd><kbd>↓</kbd> navigate</span>
              <span className="cmdk-footer-hint"><kbd>↵</kbd> open</span>
              <span className="cmdk-footer-hint"><kbd>esc</kbd> close</span>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
