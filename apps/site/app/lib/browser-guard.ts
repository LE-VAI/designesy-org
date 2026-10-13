// app/lib/browser-guard.ts
//
// SSRF guard for the browser that /api/score/audit drives. Every request the
// browser makes, for the page under audit and for anything that page asks for,
// is checked against the same public-address rule as app/lib/url-guard.ts
// (isValidUrl, then a DNS lookup with every resolved address public). Requests
// to anything else are refused before they leave the browser.
//
// Why the pre-check on the audited URL is not enough: the browser follows
// redirects and loads subresources, iframes, workers and popups, and the page's
// own scripts can fetch anything. The in-function Chromium also runs with
// --disable-web-security (one of @sparticuz/chromium's default args), so a
// script on the audited page can READ a cross-origin response, not only cause
// the request.
//
// THREE LAYERS, ALL INSTALLED HERE
//
//   1. Browser-wide CDP Fetch interception (Fetch.enable on the browser target,
//      request stage). It pauses every HTTP request of every target: pages,
//      in-process and out-of-process iframes, popups, dedicated and shared
//      workers, and every redirect hop. It is installed before the first
//      context exists.
//
//      This layer is the one that carries the redirect case. Playwright's
//      route() does not: its own docs say "The handler will only be called for
//      the first url if the response is a redirect", and its Chromium network
//      manager continues a redirect hop itself (Fetch.continueRequest when
//      redirectedFrom is set) without calling the handler. Measured on
//      playwright-core 1.63.0 with Chrome: with context.route() alone, a public
//      page whose fetch() was redirected to a private host reached that host
//      and the page read the response body; with this layer added, the private
//      host received nothing. scripts/check-audit-ssrf.js --chromium <path>
//      repeats that measurement.
//
//   2. context.route('**/*') on every context, with the same check. It is the
//      second line for HTTP if layer 1 ever stops pausing requests.
//
//   3. context.routeWebSocket() on every context. CDP Fetch does not pause
//      WebSocket handshakes; this does, for sockets opened by page scripts.
//
//   Each context is also created with serviceWorkers: 'block', the setting
//   Playwright documents for request interception (a service worker's requests
//   are not routed).
//
// Verdicts are cached per hostname for the life of one UrlVerdict, which the
// audit route creates once per request (createUrlVerdict). Nothing is shared
// between requests here: the route runs on Fluid compute, where module state is
// shared between concurrent invocations.
//
// WHAT THIS DOES NOT COVER (residuals, stated plainly)
//
//   - DNS rebinding (TOCTOU). The verdict comes from this process's resolver
//     (dns.lookup, through url-guard). Chromium resolves the name again on its
//     own, with its own cache, and with CDP_ENDPOINT on another machine and
//     another network. A name that answers a public address to this process and
//     a private one to Chromium passes the check. safeFetch closes this window
//     for Node by pinning the validated IP into the socket; Chromium offers no
//     per-request equivalent. The full fixes are launch-time
//     --host-resolver-rules or an egress proxy that does its own resolution,
//     and neither works with an external CDP browser.
//   - WebSocket handshakes opened inside a worker. routeWebSocket shims page
//     realms only and CDP Fetch never sees a handshake, so a worker's socket to
//     a private host is sent (measured). It is blind: the page cannot read a
//     reply unless the target completes a WebSocket upgrade.
//   - Traffic that is not an HTTP request: WebRTC ICE/STUN (UDP), and the
//     DNS lookups and TCP connects of dns-prefetch and preconnect. Not measured.

import type {
  Browser,
  BrowserContext,
  BrowserContextOptions,
  CDPSession,
  Route,
  WebSocketRoute,
} from 'playwright-core';
import { isValidUrl, resolveAndValidateHost } from './url-guard';

/** Resolves true only for a URL the browser may request. */
export type UrlVerdict = (url: string) => Promise<boolean>;

/** Schemes that never leave the browser. */
const LOCAL_SCHEMES = new Set(['data:', 'blob:', 'about:']);

/**
 * One request's URL check, with a per-hostname verdict cache. http(s) URLs
 * must pass isValidUrl and then `hostIsPublic` (by default the DNS check in
 * url-guard). ws(s) URLs are checked as the http(s) request their handshake
 * is. data:, blob: and about: pass; every other scheme fails.
 */
export function createUrlVerdict(
  hostIsPublic: (hostname: string) => Promise<boolean> = resolveAndValidateHost,
): UrlVerdict {
  const verdicts = new Map<string, Promise<boolean>>();
  return async (raw: string): Promise<boolean> => {
    let u: URL;
    try {
      u = new URL(raw);
    } catch {
      return false;
    }
    if (LOCAL_SCHEMES.has(u.protocol)) return true;
    if (u.protocol === 'ws:') u.protocol = 'http:';
    else if (u.protocol === 'wss:') u.protocol = 'https:';
    if (!isValidUrl(u.href)) return false;
    const host = u.hostname.toLowerCase();
    let verdict = verdicts.get(host);
    if (!verdict) {
      verdict = hostIsPublic(host).catch(() => false);
      verdicts.set(host, verdict);
    }
    return verdict;
  };
}

/**
 * A browser whose every context is guarded. The audit's checks receive this,
 * never a Playwright Browser, so a check cannot open an unguarded context.
 */
export interface GuardedBrowser {
  newContext(options?: BrowserContextOptions): Promise<BrowserContext>;
  close(): Promise<void>;
}

async function allowed(isAllowed: UrlVerdict, url: string): Promise<boolean> {
  try {
    return await isAllowed(url);
  } catch {
    return false;
  }
}

/** Layer 1: settle one paused request. Anything unverified is failed. */
async function settlePaused(
  session: CDPSession,
  isAllowed: UrlVerdict,
  requestId: string,
  url: string,
): Promise<void> {
  const ok = await allowed(isAllowed, url);
  try {
    if (ok) await session.send('Fetch.continueRequest', { requestId });
    else await session.send('Fetch.failRequest', { requestId, errorReason: 'BlockedByClient' });
  } catch {
    /* the request or the browser is already gone */
  }
}

/** Layer 2: one routed request. */
async function settleRoute(route: Route, isAllowed: UrlVerdict): Promise<void> {
  const ok = await allowed(isAllowed, route.request().url());
  try {
    if (ok) await route.continue();
    else await route.abort('blockedbyclient');
  } catch {
    /* already handled, or the page is gone */
  }
}

/** Layer 3: one WebSocket opened by a page script. */
async function settleWebSocket(ws: WebSocketRoute, isAllowed: UrlVerdict): Promise<void> {
  if (await allowed(isAllowed, ws.url())) {
    ws.connectToServer();
    return;
  }
  await ws.close({ code: 1008, reason: 'blocked' }).catch(() => {});
}

/**
 * Install the browser-wide interception on `browser` and return the only
 * handle the audit's checks get. Rejects, without returning a handle, if the
 * interception cannot be enabled, so the audit never drives an unguarded
 * browser. `close` releases the underlying browser (the route's
 * closeBrowserSafely).
 */
export async function guardBrowser(
  browser: Browser,
  isAllowed: UrlVerdict,
  close: () => Promise<void>,
): Promise<GuardedBrowser> {
  const session = await browser.newBrowserCDPSession();
  session.on('Fetch.requestPaused', (event) => {
    void settlePaused(session, isAllowed, event.requestId, event.request.url);
  });
  await session.send('Fetch.enable', { patterns: [{ urlPattern: '*', requestStage: 'Request' }] });

  return {
    async newContext(options: BrowserContextOptions = {}): Promise<BrowserContext> {
      const context = await browser.newContext({ ...options, serviceWorkers: 'block' });
      try {
        await context.route('**/*', (route) => settleRoute(route, isAllowed));
        await context.routeWebSocket(() => true, (ws) => settleWebSocket(ws, isAllowed));
      } catch (e) {
        await context.close().catch(() => {});
        throw e;
      }
      return context;
    },
    close,
  };
}
