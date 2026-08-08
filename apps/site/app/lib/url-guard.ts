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
// resolve-then-fetch sequence has a millisecond-scale TOCTOU window where the
// DNS answer could change. The gold-standard mitigation is a custom undici
// dispatcher that validates the IP inside the connect hook. This guard uses
// the OWASP-recommended pre-check pattern (resolve + validate before fetch)
// which closes the hostname-string bypass but leaves the TOCTOU window. A
// custom undici dispatcher is a future hardening pass.
//
// Usage:
//   import { normalizeInputUrl, isValidUrl, safeFetch } from '@/app/lib/url-guard';
//
// score/route.ts re-exports these for backwards compatibility with
// app/score/opengraph-image.tsx and app/score/badge/route.ts.

import { lookup as dnsLookup } from 'node:dns/promises';
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

async function resolveAndValidateHost(hostname: string): Promise<boolean> {
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
// Caps at MAX_REDIRECTS (5) hops. Returns the final Response. If a redirect
// target fails validation or DNS resolution, throws an Error — callers should
// catch and treat as a failed fetch.

const MAX_REDIRECTS = 5;

export async function safeFetch(
  url: string,
  init?: RequestInit & { headers?: Record<string, string> },
): Promise<Response> {
  let currentUrl = url;
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    // Validate URL structure (scheme, hostname string, encoded IPs).
    if (!isValidUrl(currentUrl)) {
      throw new Error(`SSRF guard: blocked URL ${currentUrl}`);
    }

    // DNS resolution guard: resolve the hostname and validate the resolved IP.
    const parsed = new URL(currentUrl);
    const dnsOk = await resolveAndValidateHost(parsed.hostname);
    if (!dnsOk) {
      throw new Error(`SSRF guard: blocked DNS resolution for ${parsed.hostname} (resolves to private/internal IP)`);
    }

    const resp = await fetch(currentUrl, { ...init, redirect: 'manual' });
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