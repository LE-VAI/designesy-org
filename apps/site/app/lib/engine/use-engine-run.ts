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

export function useEngineRun<T extends Base>(api: string, engine: string) {
  const [phase, setPhase] = useState<Phase>('idle');
  const [result, setResult] = useState<T | null>(null);
  const [scanned, setScanned] = useState('');
  const [error, setError] = useState('');
  const [when, setWhen] = useState<Date | null>(null);

  const run = useCallback(
    async (url: string, body: Record<string, unknown>) => {
      setPhase('running');
      setResult(null);
      setError('');
      setScanned(url);
      try {
        const resp = await fetch(api, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });
        const data = (await resp.json()) as T;
        if (!data.ok) {
          setError(data.error || `The ${engine} returned no result for this URL.`);
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
        setPhase('error');
        return null;
      }
    },
    [api, engine],
  );

  return { phase, result, scanned, error, when, run };
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
