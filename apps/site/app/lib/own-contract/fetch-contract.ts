// A linked contract's fetch (contract-mode spec §4.2): only through the SSRF
// guard's safeFetch (DNS-pinned, every redirect hop validated, at most 5
// hops), aborted after 8 s, read up to 256 KB, and only as text, JSON or an
// octet stream. Every failure is CONTRACT_URL_UNREACHABLE with its reason
// class, or contract_too_large.
//
// The fetcher is a parameter so the tests can pass a stub; the route passes
// url-guard's safeFetch and nothing else.

import { CONTRACT_CONTENT_TYPES, CONTRACT_FETCH_TIMEOUT_MS, MAX_CONTRACT_BYTES } from './limits';
import { problem } from './problems';
import type { Problem } from './types';

export type Fetcher = (url: string, init?: RequestInit & { headers?: Record<string, string> }) => Promise<Response>;

export type ContractFetch = { ok: true; content: string; bytes: number } | { ok: false; status: 413 | 422; problem: Problem };

export async function fetchContract(url: string, fetcher: Fetcher, timeoutMs = CONTRACT_FETCH_TIMEOUT_MS): Promise<ContractFetch> {
  const controller = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);
  const unreachable = (why: Problem['why'], extra: Omit<Problem, 'code' | 'severity' | 'message'> = {}): ContractFetch => ({
    ok: false,
    status: 422,
    problem: problem('CONTRACT_URL_UNREACHABLE', { url, why, ...extra }),
  });
  try {
    // A hung response must not outlive the abort, whichever the fetcher honours.
    const abort = new Promise<never>((_, reject) => controller.signal.addEventListener('abort', () => reject(new Error('aborted')), { once: true }));
    const res = await Promise.race([fetcher(url, { headers: { Accept: 'text/markdown, application/json, text/plain;q=0.9, */*;q=0.1' }, signal: controller.signal }), abort]);
    if (!res.ok) return unreachable('http_error', { status: res.status });
    const type = (res.headers.get('content-type') || '').toLowerCase();
    if (type && !CONTRACT_CONTENT_TYPES.some((t) => type.startsWith(t))) return unreachable('content_type', { value: type.split(';')[0] });
    const declared = Number(res.headers.get('content-length') || 0);
    if (declared > MAX_CONTRACT_BYTES) return { ok: false, status: 413, problem: problem('contract_too_large', { count: declared, limit: MAX_CONTRACT_BYTES }) };
    const buf = new Uint8Array(await Promise.race([res.arrayBuffer(), abort]));
    if (buf.byteLength > MAX_CONTRACT_BYTES) return { ok: false, status: 413, problem: problem('contract_too_large', { count: buf.byteLength, limit: MAX_CONTRACT_BYTES }) };
    return { ok: true, content: new TextDecoder('utf-8').decode(buf), bytes: buf.byteLength };
  } catch (e) {
    if (timedOut) return unreachable('timeout');
    const msg = e instanceof Error ? e.message : '';
    return unreachable(/SSRF guard: blocked/.test(msg) ? 'blocked' : 'network');
  } finally {
    clearTimeout(timer);
  }
}
