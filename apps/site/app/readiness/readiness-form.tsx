'use client';

import { useRef, useState } from 'react';
import { EngineBar } from '../lib/engine/command-bar';
import { Instrument } from '../lib/engine/instrument';
import { Findings, type FindingsHandle } from '../lib/engine/findings';
import { EngineShare } from '../lib/engine/engine-share';
import { normalizeUrl, stamp, useAutoRun, useEngineRun } from '../lib/engine/use-engine-run';
import { hostOf, toOutcomes, type RegistryView } from '../lib/engine/types';

type ReadinessResponse = {
  ok: boolean;
  url?: string;
  score?: number;
  grade?: string;
  pass?: number;
  warn?: number;
  fail?: number;
  total?: number;
  checks?: { id: string; item: string; status: string; detail: string }[];
  error?: string;
};

export function ReadinessForm({ initialUrl, registry }: { initialUrl: string; registry: RegistryView }) {
  const [url, setUrl] = useState(initialUrl);
  const { phase, result, scanned, error, when, run } = useEngineRun<ReadinessResponse>('/api/readiness', 'readiness engine');
  const findings = useRef<FindingsHandle>(null);

  const start = (target: string) => {
    const u = normalizeUrl(target);
    if (u) run(u, { url: u });
  };
  useAutoRun(initialUrl, start);

  const outcomes = toOutcomes(result?.checks);
  const host = scanned ? hostOf(scanned) : '';
  const origin = scanned ? (() => { try { return new URL(scanned).origin.replace(/^https?:\/\//, ''); } catch { return host; } })() : '';

  return (
    <div className="eg-bench">
      <EngineBar
        fields={[{ value: url, onChange: setUrl, label: 'URL to probe for AI readiness', placeholder: 'Any public URL, like vercel.com', reads: 'origin' }]}
        onSubmit={() => start(url)}
        busy={phase === 'running'}
        go="Probe readiness"
        goBusy="Probing"
        note="Probes the site's origin, so a deep link checks the same files as its homepage."
      />
      <Instrument
        name="AI readiness"
        registry={registry}
        face="paths"
        origin={origin}
        phase={phase}
        target={host}
        outcomes={outcomes}
        verdict={
          result && phase === 'done'
            ? {
                score: result.score ?? 0,
                grade: result.grade ?? 'F',
                pass: result.pass ?? 0,
                warn: result.warn ?? 0,
                fail: result.fail ?? 0,
                total: result.total ?? registry.checks.length,
              }
            : null
        }
        error={
          <>
            <p><b>{host || 'This URL'}</b> could not be probed.</p>
            <p>{error}</p>
          </>
        }
        errorText={error}
        scoring="found 1 · partial 0.5 · missing 0 · over 10 checks"
        restNote="Probe a URL and each location lights as found, partial or missing. Point at a row to read what it checks."
        restCard={
          <div className="eg-ref">
            <span className="eg-label">How a probe reads</span>
            <dl>
              <div>
                <dt>Found <span className="eg-ref-where">pass</span></dt>
                <dd>The file answers at a known path, in a format an agent parses.</dd>
              </div>
              <div>
                <dt>Partial <span className="eg-ref-where">warn</span></dt>
                <dd>It answers, but in a shape an agent reads poorly.</dd>
              </div>
              <div>
                <dt>Missing <span className="eg-ref-where">fail</span></dt>
                <dd>Nothing at any of the paths tried.</dd>
              </div>
            </dl>
            <p className="eg-ref-note">
              GET and HEAD requests from our server; nothing is rendered in a browser. Readiness is the sixth axis in
              zeroheight&apos;s 2026 maturity model.
            </p>
          </div>
        }
        onOpen={(id) => findings.current?.open(id)}
        sideExtra={
          phase === 'done' && scanned ? (
            <EngineShare path={`/readiness?url=${encodeURIComponent(scanned)}`} text={`Designesy AI readiness: ${host}`} label="Share this result" />
          ) : null
        }
      />
      {phase === 'done' && result && (
        <Findings
          ref={findings}
          registry={registry}
          outcomes={outcomes}
          sub={[`${result.total ?? registry.checks.length} checks on ${origin || host}`, stamp(when)].filter(Boolean).join(' · ')}
        />
      )}
    </div>
  );
}
