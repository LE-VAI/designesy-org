'use client';

// One run of an engine: idle, running, done or error, with the URL scanned,
// the response and the time it landed. Every URL engine page uses this, so
// they share one state machine, one error voice and one auto-run rule.

import { useCallback, useEffect, useRef, useState } from 'react';
import { announceTarget } from './engine-next';
import type { Phase } from './types';

export function normalizeUrl(input: string): string {
  const clean = input.trim();
  if (!clean) return '';
  return /^https?:\/\//i.test(clean) ? clean : `https://${clean}`;
}

type Base = { ok: boolean; error?: string };

/** One problem in a refused request body (own-contract mode's 422 and 413):
    the engine's code, its sentence and the structured fields a page builds
    its own copy from. Optional everywhere: other engines never send them. */
export type RunProblem = {
  code: string;
  severity?: 'error' | 'warning';
  message: string;
  path?: string;
  line?: number;
  column?: number;
  [field: string]: unknown;
};

/** Why a run ended without a result, as the response said it. `status` is the
    HTTP status (0 when the request never got an answer); `code`, `problems`,
    `warnings` and `retryAfter` (seconds) are read from a 4xx body and its
    Retry-After header when present. A page tells a refused input (422) from a
    request error (429, 413, 400, 5xx, network) by these. */
export type RunFailure = {
  status: number;
  code?: string;
  problems?: RunProblem[];
  warnings?: RunProblem[];
  retryAfter?: number;
  error?: string;
  /** The 4xx JSON body as received, for fields a page reads beyond these. */
  body?: Record<string, unknown>;
};

/** Retry-After in seconds: a number of seconds, or an HTTP date. */
export function retryAfterSeconds(header: string | null, now = Date.now()): number | undefined {
  if (!header) return undefined;
  const v = header.trim();
  if (/^\d+$/.test(v)) return Number(v);
  const at = Date.parse(v);
  return Number.isFinite(at) ? Math.max(0, Math.ceil((at - now) / 1000)) : undefined;
}

export function useEngineRun<T extends Base>(api: string, engine: string) {
  const [phase, setPhase] = useState<Phase>('idle');
  const [result, setResult] = useState<T | null>(null);
  const [scanned, setScanned] = useState('');
  const [error, setError] = useState('');
  const [failure, setFailure] = useState<RunFailure | null>(null);
  const [when, setWhen] = useState<Date | null>(null);

  const run = useCallback(
    async (url: string, body: Record<string, unknown>) => {
      setPhase('running');
      setResult(null);
      setError('');
      setFailure(null);
      setScanned(url);
      try {
        const resp = await fetch(api, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });
        // A refusal from the platform (a 413 or 502 before the route runs)
        // may carry no JSON at all: read it as an empty body, not a network
        // failure, so the status still says what happened.
        let data: T;
        try {
          data = (await resp.json()) as T;
        } catch {
          data = { ok: false } as T;
        }
        if (!data.ok || !resp.ok) {
          const raw = data as unknown as { code?: unknown; problems?: unknown; warnings?: unknown };
          const message = data.error || `The ${engine} returned no result for this URL.`;
          setError(message);
          setFailure({
            status: resp.status,
            code: typeof raw.code === 'string' ? raw.code : undefined,
            problems: Array.isArray(raw.problems) ? (raw.problems as RunProblem[]) : undefined,
            warnings: Array.isArray(raw.warnings) ? (raw.warnings as RunProblem[]) : undefined,
            retryAfter: retryAfterSeconds(resp.headers.get('Retry-After')),
            error: data.error,
            body: data as unknown as Record<string, unknown>,
          });
          setPhase('error');
          return null;
        }
        setResult(data);
        setWhen(new Date());
        setPhase('done');
        announceTarget(url);
        return data;
      } catch {
        setError(`The ${engine} could not be reached. Check the connection and run it again.`);
        setFailure({ status: 0 });
        setPhase('error');
        return null;
      }
    },
    [api, engine],
  );

  return { phase, result, scanned, error, failure, when, run };
}

/** A shared link (?url=...) opens on its result: run once on mount. */
export function useAutoRun(initial: string, start: (url: string) => void) {
  const done = useRef(false);
  useEffect(() => {
    if (initial && !done.current) {
      done.current = true;
      start(initial);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}

export function stamp(when: Date | null): string {
  return when ? when.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' }) : '';
}
