// app/lib/url-guard.ts
//
// Hardened URL validation + normalization shared by all URL-fetching API routes
// (score, drift, readiness, guardrails, monitor, compare).
//
// SSRF defense — the blocklist below rejects:
//   • Non-http(s) protocols (file:, data:, gopher:, …)
//   • IPv4 private ranges: 10.0.0.0/8, 172.16.0.0/12, 192.168.0.0/16
//   • IPv4 loopback: 127.0.0.0/8 (not just 127.0.0.1)
//   • IPv4 link-local: 169.254.0.0/16 (includes cloud-metadata 169.254.169.254)
//   • IPv4 unspecified: 0.0.0.0/8 (not just 0.0.0.0)
//   • IPv6 loopback: ::1
//   • IPv6 link-local: fe80::/10
//   • IPv6 unique-local: fc00::/7 (fc + fd)
//   • IPv6 unspecified: ::
//   • IPv4-mapped IPv6: ::ffff:0:0/96 (e.g. ::ffff:127.0.0.1)
//   • Bare hostnames with no dot (localhost, internal names)
//   • Decimal/octal/hex IP encodings that resolve to private ranges
//
// Usage:
//   import { normalizeInputUrl, isValidUrl } from '@/app/lib/url-guard';
//
// score/route.ts re-exports these for backwards compatibility with
// app/score/opengraph-image.tsx and app/score/badge/route.ts.

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

  return false;
}