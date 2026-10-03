'use client';

import { useRef, useState } from 'react';
import { EngineBar, Segmented } from '../lib/engine/command-bar';
import { Instrument } from '../lib/engine/instrument';
import { Findings, type FindingsHandle } from '../lib/engine/findings';
import { EngineShare } from '../lib/engine/engine-share';
import { normalizeUrl, stamp, useAutoRun, useEngineRun } from '../lib/engine/use-engine-run';
import { hostOf, toOutcomes, type RegistryView } from '../lib/engine/types';

type Scope = 'auto' | 'universal' | 'contract';

type DriftResponse = {
  ok: boolean;
  url?: string;
  scope?: 'contract' | 'universal';
  score?: number;
  grade?: string;
  pass?: number;
  warn?: number;
  fail?: number;
  skip?: number;
  total?: number;
  tokensExtracted?: number;
  checks?: { id: string; item: string; status: string; detail: string }[];
  error?: string;
};

const SCOPES: { value: Scope; label: string; hint: string }[] = [
  { value: 'auto', label: 'Auto', hint: 'designesy.org is held to its own contract; every other site gets the Universal reading.' },
  { value: 'universal', label: 'Universal', hint: 'A site that declares no custom properties is skipped on the token check (d01) instead of failed.' },
  { value: 'contract', label: 'Contract', hint: 'All 12 checks count an absence against the site: the strictest reading.' },
];

export function DriftForm({ initialUrl, registry }: { initialUrl: string; registry: RegistryView }) {
  const [url, setUrl] = useState(initialUrl);
  const [scope, setScope] = useState<Scope>('auto');
  const { phase, result, scanned, error, when, run } = useEngineRun<DriftResponse>('/api/drift', 'drift engine');
  const findings = useRef<FindingsHandle>(null);

  const start = (target: string) => {
    const u = normalizeUrl(target);
    if (u) run(u, { url: u, scope });
  };
  useAutoRun(initialUrl, start);

  const outcomes = toOutcomes(result?.checks);
  const host = scanned ? hostOf(scanned) : '';

  return (
    <div className="eg-bench">
      <EngineBar
        fields={[{ value: url, onChange: setUrl, label: 'URL to scan for drift', placeholder: 'Any public URL, like stripe.com' }]}
        onSubmit={() => start(url)}
        busy={phase === 'running'}
        go="Scan for drift"
        goBusy="Scanning"
        choices={<Segmented<Scope> label="Scope" value={scope} onChange={setScope} options={SCOPES} disabled={phase === 'running'} />}
        note="Reads the page, every stylesheet it links, and its inline styles. No login."
      />
      <Instrument
        name="Drift radar"
        registry={registry}
        face="tiles"
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
                skip: result.skip ?? 0,
                total: result.total ?? registry.checks.length,
              }
            : null
        }
        error={
          <>
            <p><b>{host || 'This URL'}</b> could not be scanned.</p>
            <p>{error}</p>
          </>
        }
        scoring="pass 1 · warn 0.5 · fail 0 · skipped checks leave the count"
        restNote="Scan a URL and its grade lands on this scale. Point at any cell to read what it checks."
        groupNotes={{
          resolve: <><b>Token fabrication</b>, d02 d11 d12: names that look like tokens and resolve to nothing.</>,
          cluster: <><b>Drift within a session</b>, d03 to d10: one role, several raw values, in the same build.</>,
        }}
        restCard={
          <div className="eg-ref">
            <span className="eg-label">What one scan cannot see</span>
            <dl>
              <div>
                <dt>Amnesia between sessions <span className="eg-ref-where">monitor</span></dt>
                <dd>Values worked out again from scratch, landing somewhere else.</dd>
              </div>
              <div>
                <dt>Silent breaking changes <span className="eg-ref-where">monitor</span></dt>
                <dd>Token values changed with no version bump.</dd>
              </div>
            </dl>
            <p className="eg-ref-note">A scan catches the two failure modes named under the cells. These two need history, which Monitor keeps.</p>
          </div>
        }
        onOpen={(id) => findings.current?.open(id)}
        sideExtra={
          phase === 'done' && scanned ? (
            <EngineShare path={`/drift?url=${encodeURIComponent(scanned)}`} text={`Designesy drift radar: ${host}`} label="Share this result" />
          ) : null
        }
      />
      {phase === 'done' && result && (
        <Findings
          ref={findings}
          registry={registry}
          outcomes={outcomes}
          sub={[
            `${result.total ?? registry.checks.length} checks on ${host}`,
            result.scope ? `${result.scope} scope` : '',
            typeof result.tokensExtracted === 'number' ? `${result.tokensExtracted} custom properties read` : '',
            stamp(when),
          ].filter(Boolean).join(' · ')}
        />
      )}
    </div>
  );
}
