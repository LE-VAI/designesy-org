# Hardening Backlog — Deferred Architectural Items

These issues were identified during the 2026-08-14 hardening audit but require
larger refactors beyond the initial "Tougher Than CrCoNi" pass. They are tracked
here so they are not forgotten.

## Priority Order (by reviewer-visibility risk)

### 1. globals.css code-splitting
- **Problem:** `apps/site/app/globals.css` is 12,694 lines and ships to every
  page. Next.js does not prune CSS — the full file is delivered on every route.
- **Fix:** Migrate to CSS Modules per component, or use `next/dynamic` import
  for route-specific styles. This is a multi-day refactor touching every page.
- **Impact:** Reduces initial CSS payload by ~80% on most routes.

### 2. next/dynamic lazy loading for client components
- **Problem:** 9 client components (~3K lines total) are eagerly loaded with no
  code-splitting. The Topbar, haptics toggle, sound toggle, theme toggle, search,
  and other interactive components all load on every page.
- **Fix:** Wrap each in `next/dynamic` with `ssr: false` where appropriate, or
  use React.lazy with Suspense boundaries.
- **Impact:** Reduces client JS bundle by ~2K lines on content-heavy pages.

### 3. CSP hardening
- **Problem:** Content-Security-Policy includes `unsafe-eval` and
  `unsafe-inline`. This is a known Next.js limitation but weakens XSS defense.
- **Fix:** Implement nonce-based CSP (Next.js 15+ supports this natively via
  `headers()` in middleware) or use `strict-dynamic` with a nonce. Requires
  auditing every inline style/script usage.
- **Impact:** Eliminates the two most common CSP bypass vectors.

### 4. loading.tsx files for route-level Suspense
- **Problem:** No `loading.tsx` files anywhere. Users see a blank white screen
  during client-side route transitions while the new page's JS/CSS loads.
- **Fix:** Add `loading.tsx` to each route segment with a lightweight skeleton
  (spinner or content placeholder using design tokens).
- **Impact:** Perceived performance improvement — no blank flashes.

### 5. Orphaned blog routes
- **Problem:** 4 blog redirect stubs (`scoring-11-fintech`, `scoring-16-devtools`,
  `scoring-30-sites`, `scoring-57-synthesis`) have full OG image infrastructure
  but no sitemap entries or navigation links. They're discoverable but orphaned.
- **Fix:** Either wire them into the blog index + sitemap, or remove the stubs
  and OG image routes entirely.
- **Impact:** Removes dead routes that confuse crawlers and reviewers.

### 6. CORS headers for MCP HTTP endpoint
- **Problem:** `middleware.ts` sets no `Access-Control-Allow-Origin` header.
  Non-browser MCP clients (the majority — Claude Desktop, Cursor, VS Code) are
  unaffected, but browser-based MCP clients would be blocked by CORS.
- **Fix:** Add a permissive CORS header for `/api/mcp` (or restrict to known
  MCP client origins if a registry exists).
- **Impact:** Enables browser-based MCP client connections.

## Completed in this hardening pass

- ✅ t06–t10 token validation stubs replaced with real checks (Python + TS)
- ✅ m09 motion check changed from PASS to SKIP (honest)
- ✅ All 6 version strings reconciled to 1.10.1
- ✅ SSRF host validation added to Python _fetch()
- ✅ SSL lenient fallback now logs a warning to stderr
- ✅ pretest hooks added to both npm packages
- ✅ Python test suite created (28 tests, all passing)
- ✅ CI workflow: npm package test jobs + MCP pytest job added
- ✅ /test route disallowed in robots.txt (already noindexed via metadata)
- ✅ ATLAS adapter synced from canonical (v1.10.1, 17 tools)
- ✅ stylelint plugin: all `as any` casts removed, `PostcssResult` typed, `RuleMeta.url` added
- ✅ stylelint plugin CHANGELOG: "61 tests" → "62 tests"
- ✅ MCP cache descriptions: "cached ~24h" → "cached ~24h server-side"