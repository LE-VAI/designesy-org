// app/lib/url-guard.ts
//
// Hardened URL validation + normalization + DNS-resolution SSRF guard shared by
// all URL-fetching API routes (score, drift, readiness, guardrails, monitor,
// compare).
//
// SSRF defense — three layers:
//   1. URL validation: rejects non-http(s) protocols, bare hostnames, encoded
//      IP bypasses (decimal/octal/hex), IPv4 private ranges, all IPv6.
//   2. DNS resolution: resolves the hostname via dns.promises.lookup() (the
//      SAME resolver path fetch/undici uses, not dns.resolve4 which uses
//      c-ares and can disagree with /etc/hosts and OS resolver overrides).
//      Resolves both families (IPv4 + IPv6) and validates EVERY resolved
//      address against the private-range blocklist. Rejects if ANY address
//      is private, loopback, link-local, cloud-metadata, or unspecified.
//   3. Per-redirect-hop validation: safeFetch follows redirects manually and
//      re-runs the full guard (validation + DNS resolution) on every hop.
//   4. Connection-level IP pinning (TOCTOU fix): the actual connection is made
//      through node:http(s) with a custom `lookup` that resolves once, filters
//      to public addresses only, and hands the socket a single validated IP. So
//      undici/node never re-resolves at connect time — a DNS-rebinding race
//      cannot insert a private IP between validation and socket open. This closes
//      the resolve-then-fetch gap (CVE-2026-10546 / CVE-2026-54353 / CVE-2026-27826).
//   5. Content decoding (engine 1.5.4): a 2xx body sent with Content-Encoding
//      gzip, deflate or br is decoded before it is returned, and what is held
//      is bounded as it is produced: by the read's own cap (maxBodyBytes + 1;
//      with none, a decoded body past DEFAULT_MAX_DECODED_BYTES rejects) and
//      by a budget several reads share (SafeFetchInit.budget), so neither one
//      small compressed body nor many of them can expand without limit. A body
//      that does not decode, a registered coding this module cannot decode,
//      or more than one coding rejects the read instead of returning
//      compressed bytes as text. When the coded stream ends, the connection is
//      closed. Other statuses keep their raw body and headers; a status a
//      Response cannot carry (outside 200-599) rejects.
//
// Why DNS resolution matters: the prior guard validated hostname strings only.
// An adversary who registers evil.com -> 127.0.0.1 bypassed the hostname check
// because the hostname "evil.com" is public but the resolved IP is private.
// This is OWASP API7:2023 (SSRF) and a standing cloud-credential-exfiltration
// risk — a public "score any URL" endpoint without DNS-resolution SSRF
// protection can fetch http://169.254.169.254/latest/meta-data/ via a DNS
// alias.
//
// DNS-rebinding (TOCTOU) note: fetch() re-resolves DNS at connect time, so a
// resolve-then-fetch sequence has a millisecond-scale TOCTOU window. The
// gold-standard mitigation is to PIN the validated IP into the connection hook
// (custom node:http(s) `lookup`), which this module now does in pinnedFetch().
// The pre-check in isValidUrl/resolveAndValidateHost remains as a fast-fail
// first line, but the socket-level pin is what actually closes the window.
//
// Usage:
//   import { normalizeInputUrl, isValidUrl, safeFetch } from '@/app/lib/url-guard';
//
// score/route.ts re-exports these for backwards compatibility with
// app/score/opengraph-image.tsx and app/score/badge/route.ts.

import { lookup as dnsLookup } from 'node:dns/promises';
import * as https from 'node:https';
import * as http from 'node:http';
import { createBrotliDecompress, createGunzip, createInflate, createInflateRaw } from 'node:zlib';
import type { Transform } from 'node:stream';
import ipaddr from 'ipaddr.js';

// ── Normalization ────────────────────────────────────────────────────────────

export function normalizeInputUrl(raw: string): string {
  let clean = raw.trim();
  if (!clean) return '';
  if (!/^https?:\/\//i.test(clean)) {
    clean = `https://${clean}`;
  }
  try {
    const u = new URL(clean);
    return u.href;
  } catch {
    return clean;
  }
}

// ── Validation ───────────────────────────────────────────────────────────────

/**
 * Returns true only for public http(s) URLs whose host does not resolve to a
 * private, loopback, link-local, or unspecified address. Rejects IPv6, cloud
 * metadata, and encoded-IP bypass attempts that the prior blocklist missed.
 */
export function isValidUrl(url: string): boolean {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return false;
  }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') return false;

  const host = u.hostname.toLowerCase();

  // ── Reject bare hostnames with no dot (localhost, internal names) ─────────
  // IPv6 addresses are bracketed ([::1]) so they contain colons not dots; we
  // check them below. Normal public domains must contain a dot.
  if (!host.includes('.') && !host.includes(':')) return false;

  // ── Reject IPv4-mapped IPv6 in bracketed form: [::ffff:127.0.0.1] ──────────
  // new URL() strips brackets so host becomes "::ffff:127.0.0.1".
  if (host.includes('::ffff:') || host.includes('::ffff:')) {
    return false;
  }

  // ── IPv6 checks (host is the un-bracketed address, e.g. "::1", "fe80::1") ──
  if (host.includes(':')) {
    // Any IPv6 address — reject all for now. The site-scoring APIs target
    // public domains (example.com), never raw IPv6. This is defense-in-depth:
    // even a public IPv6 (e.g. 2606:4700::) is rejected because no scoring use
    // case needs it, and accepting it opens the door to bypass tricks.
    return false;
  }

  // ── IPv4 checks (host is a dotted-quad or bare hostname) ────────────────────

  // Reject decimal/octal/hex IP encodings that new URL() passes through as
  // hostnames (e.g. 2130706433 → 127.0.0.1, 0177.0.0.1 → 127.0.0.1).
  // If the hostname parses as an integer in any base, treat it as an encoded
  // IP and reject (public sites are not addressed this way).
  if (/^\d+$/.test(host)) return false; // pure decimal (e.g. 2130706433)
  if (host.split('.').some((octet) => octet.startsWith('0') && octet.length > 1 && /^0[0-7]+$/.test(octet))) {
    return false; // octal (e.g. 0177.0.0.1)
  }
  if (host.split('.').some((octet) => /^0x[0-9a-f]+$/i.test(octet))) {
    return false; // hex (e.g. 0x7f.0.0.1)
  }

  // Reject known private/reserved IPv4 ranges.
  if (isPrivateIPv4(host)) return false;

  return true;
}

/**
 * Returns true if the host is a private, loopback, link-local, or unspecified
 * IPv4 address. Covers the ranges the prior blocklist missed:
 * 127.0.0.0/8 (not just 127.0.0.1), 169.254.0.0/16 (cloud metadata),
 * 0.0.0.0/8 (not just 0.0.0.0), and the full 172.16.0.0/12 (not just 172.16.).
 */
function isPrivateIPv4(host: string): boolean {
  const parts = host.split('.');
  if (parts.length !== 4) return false; // not a dotted-quad — not our problem here

  const oct = parts.map((p) => {
    const n = parseInt(p, 10);
    return Number.isNaN(n) ? -1 : n;
  });
  if (oct.some((n) => n < 0 || n > 255)) return false; // malformed — don't reject (let URL parsing handle it)

  const [a, b] = oct;

  if (a === 0) return true; // 0.0.0.0/8 — unspecified
  if (a === 10) return true; // 10.0.0.0/8 — private Class A
  if (a === 127) return true; // 127.0.0.0/8 — loopback (not just 127.0.0.1)
  if (a === 169 && b === 254) return true; // 169.254.0.0/16 — link-local + cloud metadata
  if (a === 172 && b >= 16 && b <= 31) return true; // 172.16.0.0/12 — full /12 (was 172.16. only)
  if (a === 192 && b === 168) return true; // 192.168.0.0/16 — private Class C
  if (a >= 224) return true; // 224.0.0.0/4 — multicast/reserved (no public site lives here)
  // 100.64.0.0/10 — Carrier-Grade NAT (CGNAT). Not routable on the public internet.
  if (a === 100 && b >= 64) return true;

  return false;
}

// ── DNS-resolution SSRF guard ────────────────────────────────────────────────
//
// Resolves the hostname via dns.promises.lookup() — the SAME resolver path
// fetch/undici uses internally — and validates every resolved IP address
// against the private-range blocklist. This closes the hostname-string bypass
// where evil.com -> 127.0.0.1 passes the hostname check but resolves to a
// private IP.
//
// Uses ipaddr.js (NOT the `ip` package, which has a known isPublic() SSRF CVE)
// for parsing both IPv4 and IPv6 addresses.
//
// Blocklist covers:
//   IPv4: 0.0.0.0/8, 10/8, 127/8, 169.254/16, 172.16/12, 192.168/16, 100.64/10,
//         224/4 (multicast/reserved)
//   IPv6: ::1 (loopback), fc00::/7 (ULA, includes fd00:ec2::254 AWS IMDS),
//         fe80::/10 (link-local), :: (unspecified)
//
// Per-hop DNS cache (60s TTL) reduces repeat lookups without weakening the
// guard — cached IPs are re-validated against the blocklist on every call.

const DNS_CACHE_TTL = 60_000; // 60 seconds
const dnsCache = new Map<string, { addresses: string[]; expiresAt: number }>();

/**
 * True when every address `hostname` resolves to is public. A lookup failure
 * counts as not public (it cannot be shown to be safe). Exported for callers
 * that hand a URL to something other than safeFetch: a third-party API, or a
 * browser (app/lib/browser-guard.ts).
 */
export async function resolveAndValidateHost(hostname: string): Promise<boolean> {
  // Check DNS cache first (cache the resolution, not the decision — re-validate
  // cached IPs against the blocklist on every call).
  const now = Date.now();
  const cached = dnsCache.get(hostname);
  let addresses: string[];

  if (cached && cached.expiresAt > now) {
    addresses = cached.addresses;
  } else {
    try {
      // dns.promises.lookup with all:true returns both IPv4 and IPv6.
      // family:0 means "any" (let the OS decide the order, return both).
      // This is the SAME resolver path fetch/undici uses (per the undici
      // maintainer: "we leverage node:dns#lookup for that as we use the
      // socket defaults for IP resolution"). Using resolve4 here would use
      // c-ares and could disagree with /etc/hosts and OS overrides — creating
      // a bypass where fetch sees 127.0.0.1 but the guard sees the real answer.
      const result = await dnsLookup(hostname, { all: true, family: 0 });
      addresses = result.map((r) => r.address);
    } catch {
      // DNS resolution failed — treat as invalid (can't verify it's safe).
      return false;
    }
    dnsCache.set(hostname, { addresses, expiresAt: now + DNS_CACHE_TTL });
    // Prune stale entries to avoid unbounded growth.
    if (dnsCache.size > 500) {
      for (const [key, val] of dnsCache) {
        if (val.expiresAt <= now) dnsCache.delete(key);
      }
    }
  }

  // Validate EVERY resolved address. Reject if ANY is private.
  for (const addr of addresses) {
    if (isPrivateAddress(addr)) return false;
  }

  return true;
}

/**
 * The full check for a URL that will be fetched outside safeFetch: the string
 * checks of isValidUrl, then a DNS lookup of the host with every resolved
 * address validated. Run it before the URL leaves this process. It is a
 * check at one moment, not a pin: whoever fetches the URL later resolves the
 * name again (see the DNS-rebinding note at the top of this file).
 */
export async function isPublicUrl(url: string): Promise<boolean> {
  if (!isValidUrl(url)) return false;
  return resolveAndValidateHost(new URL(url).hostname);
}

/**
 * Returns true if the IP address is private, loopback, link-local, cloud-
 * metadata, unspecified, or otherwise non-public. Uses ipaddr.js for parsing
 * (the `ip` npm package has a known isPublic() SSRF bypass CVE).
 */
function isPrivateAddress(addr: string): boolean {
  let parsed: ipaddr.IPv4 | ipaddr.IPv6;
  try {
    parsed = ipaddr.parse(addr);
  } catch {
    return true; // unparseable — treat as private (fail closed)
  }

  // ── IPv4 checks ───────────────────────────────────────────────────────────
  if (parsed.kind() === 'ipv4') {
    const ipv4 = parsed as ipaddr.IPv4;
    const range = ipv4.range();
    // ipaddr.js range() returns: unicast, private, loopback, linkLocal,
    // multicast, reserved, etc. Anything that's NOT 'unicast' is non-public.
    return range !== 'unicast';
  }

  // ── IPv6 checks ───────────────────────────────────────────────────────────
  if (parsed.kind() === 'ipv6') {
    const ipv6 = parsed as ipaddr.IPv6;
    const range = ipv6.range();
    // ipaddr.js IPv6 range() returns: unicast, loopback, uniqueLocal, linkLocal,
    // reserved, etc. Anything that's NOT 'unicast' is non-public.
    return range !== 'unicast';
  }

  return true; // fail closed
}

// ── safeFetch — SSRF-safe fetch with DNS resolution + per-redirect-hop validation ─
//
// Drop-in replacement for `fetch(url, { ...init, redirect: 'follow' })`.
// Overrides redirect to 'manual' and follows each 3xx hop individually,
// validating every hop URL against isValidUrl AND resolving DNS to validate
// the resolved IP, before fetching it. This closes both:
//   • The hostname-string bypass (evil.com -> 127.0.0.1)
//   • The redirect bypass (public URL 302s to http://169.254.169.254/)
//
// Caps at MAX_REDIRECTS (5) hops. Returns the final Response, whose `url` is
// the URL that answered (after every redirect), so a caller resolves relative
// links against the page it actually read. If a redirect target fails
// validation or DNS resolution, throws an Error — callers should catch and
// treat as a failed fetch. A 2xx body is decoded as its Content-Encoding says
// (point 5 at the top of this file); `maxBodyBytes` and `budget` bound what is
// held.

const MAX_REDIRECTS = 5;

// ── Connection-level IP pinning (closes DNS-rebinding TOCTOU) ─────────────────
//
// The prior safeFetch used a resolve-then-fetch pre-check: validate the hostname's
// IPs, then call fetch(). But undici re-resolves DNS at connect time, so a second
// resolution could flip the answer to a private IP between our pre-check and the
// socket open (the CVE-2026-10546 / CVE-2026-54353 / CVE-2026-27826 class).
//
// Fix (same pattern Ghost CMS used for CVE-2026-53945): pass a custom `lookup`
// callback to node:http(s) that resolves the hostname ONCE, validates EVERY
// resolved address against the private-range blocklist, and returns ONLY the
// public addresses. node:http(s) calls `lookup` at connect time and connects to
// the exact address(es) we hand back — there is no second resolution, so a DNS
// rebinding race cannot insert a private IP after validation. Each request also
// re-validates (isValidUrl) and re-resolves via the same pinned lookup, so every
// redirect hop and every call closes the window.
//
// Addresses that fail the public-range check are filtered OUT, and if the host
// resolves to nothing public, we throw (fail closed). ipaddr.range() returns
// anything not 'unicast' as non-public (loopback, linkLocal, private, ULA,
// multicast, reserved, unspecified) — mirrors isPrivateAddress().
function pinnedLookup(
  hostname: string,
  options: { all?: boolean; family?: number },
  callback: (
    err: NodeJS.ErrnoException | null,
    address: string | LookupAddress[],
    family: number,
  ) => void,
): void {
  // Honor options.all like the proven engine safeLookup: node:http(s) passes
  // { all: true, family: 0 } when no family is pinned, and expects an ARRAY of
  // addresses back. Every returned address is validated public-only, so a DNS
  // rebinding to a private IP is filtered out before the socket can connect.
  const all = options.all === true;
  dnsLookup(hostname, { all: true, family: 0 })
    .then((addresses) => {
      const safe = addresses.filter(
        // Keep ONLY publicly routable addresses. Anything non-unicast is private/
        // reserved and must not be reachable — including IPv4-mapped IPv6, cloud
        // metadata, link-local, ULA (fd00:ec2::254 AWS IMDS), loopback.
        (a: { address: string; family: number }) => {
          try {
            return ipaddr.parse(a.address).range() === 'unicast';
          } catch {
            return false;
          }
        },
      );
      if (safe.length === 0) {
        callback(new Error(`SSRF guard: ${hostname} has no public address`), '', 4);
        return;
      }
      if (all) {
        callback(null, safe as LookupAddress[], safe[0].family === 6 ? 6 : 4);
      } else {
        // Pin to the first validated public address so the socket connects to
        // exactly one IP (no second resolution).
        callback(null, safe[0].address, safe[0].family === 6 ? 6 : 4);
      }
    })
    .catch((err: NodeJS.ErrnoException) => callback(err, '', 4));
}

type LookupAddress = { address: string; family: number };

/**
 * A bound several reads share (a page's stylesheets, say). `left` is the body
 * bytes they may still hold between them. `decoders`, when set, is how many
 * more of them may decode a body at once: a br decoder keeps a window of up
 * to 16 MiB whatever it emits, so many decoding together hold many times
 * that. A read past it waits, its response paused, until one is given back.
 */
export type ReadBudget = { left: number; decoders?: number };

/** Reads waiting for one of a budget's decoders, oldest first. */
const DECODER_WAITERS = new WeakMap<ReadBudget, Array<() => void>>();

/** Run `granted` once one of `budget`'s decoders is this read's. */
function takeDecoder(budget: ReadBudget, granted: () => void): void {
  if ((budget.decoders ?? 0) > 0) {
    budget.decoders = (budget.decoders ?? 0) - 1;
    granted();
    return;
  }
  const waiting = DECODER_WAITERS.get(budget) ?? [];
  DECODER_WAITERS.set(budget, waiting);
  waiting.push(granted);
}

/** Give a decoder back: to the read that has waited longest, or to the budget. */
function giveBackDecoder(budget: ReadBudget): void {
  const next = DECODER_WAITERS.get(budget)?.shift();
  if (next) next();
  else budget.decoders = (budget.decoders ?? 0) + 1;
}

/**
 * What safeFetch takes: fetch's init, with two bounds on the body it holds.
 *
 * - `maxBodyBytes`: the most body bytes the caller will read. A body is then
 *   held to at most maxBodyBytes + 1 bytes (decoded or not), so a caller that
 *   reads up to its cap still sees that the body went past it. Without it an
 *   identity body is read whole, as before, and a decoded body past
 *   DEFAULT_MAX_DECODED_BYTES rejects.
 * - `budget`: a budget this read shares with others. Each byte of a 2xx body
 *   is charged to it as it arrives (decoded, when the body is decoded), so the
 *   reads together hold no more than it, however many run at once. A read the
 *   budget stops holds what was left of it, and cutByBudget(response) is true.
 *   A read that fails gives back what it was charged. With `decoders` set, a
 *   decoded body also waits for one of them, and gives it back when it ends.
 */
export type SafeFetchInit = RequestInit & { headers?: Record<string, string>; maxBodyBytes?: number; budget?: ReadBudget };

/**
 * The most bytes a decoded body may reach when the caller passes no
 * maxBodyBytes (engine 1.5.4). Past it the read rejects: a compressed body
 * of a few kilobytes can decode to gigabytes, and nothing reads a cut body
 * without a cap of its own to say it was cut. A read that needs more names
 * its cap (the score route's are 8 MiB of HTML, 4 MiB of a stylesheet and
 * 16 MiB of a /DESIGN.md); 4 MiB is the cap on one stylesheet.
 */
export const DEFAULT_MAX_DECODED_BYTES = 4 * 1024 * 1024;

/** Statuses whose Response must have a null body (new Response throws otherwise). */
const NULL_BODY_STATUS = new Set([204, 205, 304]);

/** A content coding this module decodes. */
export type ContentCoding = 'gzip' | 'deflate' | 'br';

/**
 * Content codings in the IANA HTTP Content Coding Registry that transform the
 * body and that this module does not decode. Read as text, such a body is
 * compressed (or encrypted) bytes, so it is refused.
 */
const UNDECODED_CODINGS = new Set(['aes128gcm', 'compress', 'x-compress', 'dcb', 'dcz', 'exi', 'pack200-gzip', 'zstd']);

/**
 * The coding a Content-Encoding header asks the reader to undo: null for none,
 * gzip (x-gzip too), deflate or br. identity, and a label no registry defines
 * (`none`, `utf-8`, `binary`), leave the body as it was sent, as a browser
 * reads them. A registered coding this module cannot decode, or more than one
 * coding, is not ok: the body cannot be read as text.
 */
export function contentCodingOf(v: string | string[] | undefined): { ok: true; coding: ContentCoding | null } | { ok: false; value: string } {
  const list = (Array.isArray(v) ? v.join(',') : v ?? '')
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .map((s) => (s === 'x-gzip' ? 'gzip' : s))
    .filter((s) => s === 'gzip' || s === 'deflate' || s === 'br' || UNDECODED_CODINGS.has(s));
  if (list.length === 0) return { ok: true, coding: null };
  const c = list.length === 1 ? list[0] : '';
  if (c === 'gzip' || c === 'deflate' || c === 'br') return { ok: true, coding: c };
  return { ok: false, value: list.join(', ') };
}

/**
 * A status a WHATWG Response cannot carry (outside 200-599, such as 999): the
 * server answered, but not with a status a reader can use. `status` is what
 * it sent, so a caller can report it as an HTTP error.
 */
export class InvalidStatusError extends Error {
  readonly status: number;
  constructor(status: number) {
    super(`invalid HTTP status ${status}`);
    this.name = 'InvalidStatusError';
    this.status = status;
  }
}

/** Responses whose body a shared budget stopped (SafeFetchInit.budget). */
const CUT_BY_BUDGET = new WeakSet<Response>();

/** True when the shared budget ran out before this body did: it holds what was left of the budget. */
export function cutByBudget(resp: Response): boolean {
  return CUT_BY_BUDGET.has(resp);
}

/** A decoding failure. Its message never decides how a caller classifies it. */
function decodingError(detail: string): Error {
  const err = new Error(`content decoding failed${detail}`);
  err.name = 'ContentDecodingError';
  return err;
}

/**
 * A streaming decoder for `coding`. `head` holds the body's first bytes:
 * deflate is meant to be zlib-wrapped (RFC 9110 section 8.4.1.2), but some
 * servers send raw deflate data, so the zlib header (CM 8, a window of at
 * most 32 KiB, and the check bits) picks between the two.
 */
function decoderFor(coding: ContentCoding, head: Buffer): Transform {
  if (coding === 'gzip') return createGunzip();
  if (coding === 'br') return createBrotliDecompress();
  const b0 = head[0] ?? 0;
  const b1 = head[1] ?? 0;
  const zlibWrapped = head.length >= 2 && (b0 & 0x0f) === 8 && (b0 >> 4) <= 7 && ((b0 << 8) | b1) % 31 === 0;
  return zlibWrapped ? createInflate() : createInflateRaw();
}

/**
 * HTTP(S) GET with connection-level IP pinning. Returns a WHATWG `Response` so
 * it is a drop-in replacement for `fetch(url, { redirect: 'manual' })`.
 *
 * The connection is made through node:http(s) with the `pinnedLookup` above, so
 * the socket can only ever reach a validated public IP — DNS rebinding (TOCTOU)
 * is closed at connect time. `redirect: 'manual'` is honored explicitly: 3xx is
 * returned as-is (with a Location header) for the caller to re-validate + follow.
 *
 * The Response's `url` is the URL requested. A 2xx body (not for HEAD, 204 or
 * 205) is decoded as its Content-Encoding says, within the bounds in
 * SafeFetchInit; one that does not decode rejects. Every other body is
 * returned raw. A status a Response cannot carry rejects (InvalidStatusError).
 * Once the body is complete, cut, or failed, the connection is not read again.
 */
function pinnedFetch(url: string, init?: SafeFetchInit): Promise<Response> {
  return new Promise((resolve, reject) => {
    const signal = init?.signal ?? undefined;
    // A signal that fired before this hop started (during the previous hop or
    // the DNS check) adds no listener that could ever run: refuse it here, or
    // the request below would go out with no timeout at all.
    if (signal?.aborted) {
      reject(abortedError());
      return;
    }
    // One outcome per call: the body, a decoding failure, a socket error and
    // an abort can each arrive after another has settled it.
    let settled = false;
    let decoder: Transform | null = null;
    // The body held so far, and what of it is charged to the shared budget.
    const out: Buffer[] = [];
    let charged = 0;
    const budget = init?.budget;
    // The budget's decoder this read holds, if any; given back once, when
    // the read ends however it ends.
    let giveBackSlot = () => {};
    // A read that fails holds nothing: it lets go of its bytes and gives
    // back what it was charged, so the reads sharing the budget can use it.
    const release = () => {
      out.length = 0;
      if (budget && charged) budget.left += charged;
      charged = 0;
      decoder?.destroy();
      giveBackSlot();
    };
    const fail = (e: Error) => {
      if (settled) return;
      settled = true;
      release();
      decoder?.destroy();
      req.destroy();
      reject(e);
    };
    let parsed: URL;
    try {
      parsed = new URL(url);
    } catch (e) {
      reject(e as Error);
      return;
    }
    const isHttps = parsed.protocol === 'https:';
    const headers: Record<string, string> = {};
    // Copy init headers if any.
    for (const [k, v] of Object.entries(init?.headers ?? {})) {
      if (v !== undefined) headers[k] = String(v);
    }
    const method = init?.method || 'GET';
    const maxBodyBytes = init?.maxBodyBytes;
    const reqFn = isHttps ? https.request : http.request;
    const req = reqFn(
      {
        hostname: parsed.hostname,
        port: parsed.port || (isHttps ? 443 : 80),
        path: parsed.pathname + parsed.search,
        method,
        headers,
        lookup: pinnedLookup as typeof import('node:dns').lookup,
        timeout: init?.signal ? undefined : 15000,
      },
      (res) => {
        const status = res.statusCode || 0;
        // new Response throws for a status outside 200-599 (999, say). Refusing
        // it here, as its headers arrive, keeps a body that never ends from
        // holding the read open, and gives the caller the status.
        if (status < 200 || status > 599) {
          fail(new InvalidStatusError(status));
          return;
        }
        // Only a body the caller will read is decoded. A 3xx, 4xx or 5xx keeps
        // its raw body and its headers, so a garbled error page stays an
        // http_error rather than becoming a network failure.
        const readsBody = method.toUpperCase() !== 'HEAD' && status >= 200 && status < 300 && !NULL_BODY_STATUS.has(status);
        const cod = readsBody ? contentCodingOf(res.headers['content-encoding']) : { ok: true as const, coding: null };
        if (!cod.ok) {
          // The header is the server's: clipped here, and never classified.
          fail(decodingError(`: unsupported Content-Encoding "${cod.value.slice(0, 64)}"`));
          return;
        }
        const coding = cod.coding;
        // The read's own cap: the caller's, or for a decoded body with none,
        // the default. Only a body the caller reads is charged to the budget.
        const cap = maxBodyBytes ?? (coding ? DEFAULT_MAX_DECODED_BYTES : Infinity);
        const shared = readsBody ? budget : undefined;
        let held = 0;
        let cut = false;
        let resEnded = false;
        const head: Buffer[] = [];
        let headBytes = 0;

        // A decoded body waits for one of the budget's decoders, when it
        // counts them; its response stays paused until then (TCP holds the
        // rest), and the read's own abort still ends the wait.
        if (coding && shared && shared.decoders !== undefined) {
          const slots = shared;
          let slotHeld = false;
          giveBackSlot = () => {
            if (!slotHeld) return;
            slotHeld = false;
            giveBackDecoder(slots);
          };
          res.pause();
          takeDecoder(slots, () => {
            slotHeld = true;
            if (settled) {
              giveBackSlot();
              return;
            }
            res.resume();
          });
        }

        const finish = () => {
          if (settled) return;
          let r: Response;
          try {
            // Build a WHATWG Response from the node IncomingMessage.
            const rsHeaders = new Headers();
            const raw = res.headers as Record<string, string | string[] | undefined>;
            for (const [k, v] of Object.entries(raw)) {
              if (v === undefined) continue;
              if (Array.isArray(v)) v.forEach((x) => rsHeaders.append(k, x));
              else rsHeaders.append(k, v);
            }
            // The body is no longer encoded, and its length is not the sent one.
            if (coding) {
              rsHeaders.delete('content-encoding');
              rsHeaders.delete('content-length');
            }
            r = new Response(NULL_BODY_STATUS.has(status) ? null : Buffer.concat(out), {
              status,
              statusText: res.statusMessage || '',
              headers: rsHeaders,
            });
          } catch (e) {
            fail(e as Error);
            return;
          }
          settled = true;
          out.length = 0;
          // A Response built by hand has url ''. safeFetch returns the last
          // hop's Response, so this makes resp.url the URL that answered.
          Object.defineProperty(r, 'url', { value: url, enumerable: true });
          if (cut) CUT_BY_BUDGET.add(r);
          resolve(r);
          // The body is complete or cut. A decoder ends with its coded stream,
          // which can come before the response does (bytes after it, or a
          // connection held open): nothing more is read from this one.
          decoder?.destroy();
          giveBackSlot();
          if (!resEnded) req.destroy();
        };

        const keep = (c: Buffer, charge: boolean) => {
          out.push(c);
          held += c.length;
          if (charge && shared) {
            shared.left -= c.length;
            charged += c.length;
          }
        };

        // Each byte is held, and charged, as it arrives (decoded, when the body
        // is decoded), so a bound stops the read as soon as it is reached.
        const take = (c: Buffer) => {
          if (settled) return;
          const capLeft = cap - held;
          const budgetLeft = shared ? Math.max(0, shared.left) : Infinity;
          if (c.length <= capLeft && c.length <= budgetLeft) {
            keep(c, true);
            return;
          }
          if (capLeft <= budgetLeft) {
            // The read's own cap: one byte past it is held, uncharged, so a
            // caller that reads up to its cap sees that the body went past it.
            keep(c.subarray(0, capLeft), true);
            keep(c.subarray(capLeft, capLeft + 1), false);
            if (coding && maxBodyBytes === undefined) {
              fail(decodingError(` (${coding}): the decoded body is over ${DEFAULT_MAX_DECODED_BYTES} bytes`));
              return;
            }
          } else {
            // The shared budget: what was left of it is held, and the body is cut.
            keep(c.subarray(0, budgetLeft), true);
            cut = true;
          }
          finish();
        };

        const startDecoder = () => {
          const d = decoderFor(coding as ContentCoding, Buffer.concat(head));
          decoder = d;
          d.on('data', take);
          d.on('error', (e: NodeJS.ErrnoException) => fail(decodingError(` (${coding}): ${e.code || e.message}`)));
          d.on('end', finish);
          d.on('drain', () => res.resume());
          for (const b of head.splice(0)) if (!d.write(b)) res.pause();
        };

        res.on('data', (c: Buffer) => {
          if (settled) return;
          if (!coding) {
            take(c);
            return;
          }
          if (!decoder) {
            // The decoder is picked from the first two bytes (deflate's header).
            head.push(c);
            headBytes += c.length;
            if (headBytes >= 2) startDecoder();
            return;
          }
          if (!decoder.write(c)) res.pause();
        });
        res.on('end', () => {
          resEnded = true;
          if (settled) return;
          if (!coding) {
            finish();
            return;
          }
          if (!decoder) {
            // No body at all decodes to no body (gunzip of 0 bytes is an error).
            if (headBytes === 0) {
              finish();
              return;
            }
            startDecoder();
          }
          (decoder as Transform | null)?.end();
        });
        res.on('error', (e) => fail(e as Error));
      },
    );
    req.on('timeout', () => {
      req.destroy(new Error('SSRF guard: fetch timeout'));
    });
    req.on('error', (e) => {
      if (settled) return;
      settled = true;
      release();
      decoder?.destroy();
      reject(e as Error);
    });
    // Honor AbortSignal (route handlers pass controller.signal). The abort
    // settles the promise itself: destroying the request mid-body does not
    // reliably surface as an 'error' on the response stream, and a caller
    // awaiting this must not outlive its own deadline.
    if (signal && typeof signal.addEventListener === 'function') {
      const onAbort = () => {
        const err = abortedError();
        const wasSettled = settled;
        settled = true;
        if (!wasSettled) release();
        decoder?.destroy();
        req.destroy(err);
        if (!wasSettled) reject(err);
      };
      // Left registered once the call settles: the signal belongs to this one
      // read, and a late abort then only destroys a finished request.
      signal.addEventListener('abort', onAbort, { once: true });
    }
    req.end();
  });
}

/** The error an aborted read rejects with; callers classify it by its name, AbortError. */
function abortedError(): Error {
  const err = new Error('aborted');
  err.name = 'AbortError';
  return err;
}

/** `work`, or a rejection as soon as `signal` fires, whichever comes first. */
function untilAborted<T>(work: Promise<T>, signal: AbortSignal | null | undefined): Promise<T> {
  if (!signal) return work;
  if (signal.aborted) return Promise.reject(abortedError());
  return new Promise<T>((resolve, reject) => {
    const onAbort = () => reject(abortedError());
    signal.addEventListener('abort', onAbort, { once: true });
    work.then(
      (v) => { signal.removeEventListener('abort', onAbort); resolve(v); },
      (e) => { signal.removeEventListener('abort', onAbort); reject(e); },
    );
  });
}

// The caller's signal bounds the whole call: every hop, every DNS check and
// every body. A DNS answer that arrives after the signal fired is not followed
// by a request, so a redirect to a host with a slow resolver cannot carry a
// read past the caller's deadline.
export async function safeFetch(url: string, init?: SafeFetchInit): Promise<Response> {
  const signal = init?.signal ?? undefined;
  let currentUrl = url;
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    if (signal?.aborted) throw abortedError();
    // Validate URL structure (scheme, hostname string, encoded IPs).
    if (!isValidUrl(currentUrl)) {
      throw new Error(`SSRF guard: blocked URL ${currentUrl}`);
    }

    // DNS resolution guard: resolve the hostname and validate the resolved IP.
    const parsed = new URL(currentUrl);
    const dnsOk = await untilAborted(resolveAndValidateHost(parsed.hostname), signal);
    if (!dnsOk) {
      throw new Error(`SSRF guard: blocked DNS resolution for ${parsed.hostname} (resolves to private/internal IP)`);
    }

    // Connection-level pinned fetch (node:http(s) with IP-pinned lookup), so a
    // DNS-rebinding TOCTOU cannot insert a private IP after validation. Returns
    // the Response with redirect left 'manual' — the loop below follows 3xx.
    const resp = await pinnedFetch(currentUrl, init);
    // Not a redirect — return the response (success, 4xx, 5xx, etc.)
    if (resp.status < 300 || resp.status >= 400) return resp;
    // 3xx redirect — extract Location header and resolve against current URL.
    const location = resp.headers.get('location');
    if (!location) return resp; // 3xx with no Location — return as-is
    currentUrl = new URL(location, currentUrl).href;
    // Loop continues — next iteration validates the new URL + DNS.
  }
  // Exceeded MAX_REDIRECTS — treat as error (matches redirect: 'follow' which
  // also has a cap). Return a synthetic error response.
  throw new Error(`SSRF guard: exceeded ${MAX_REDIRECTS} redirects`);
}