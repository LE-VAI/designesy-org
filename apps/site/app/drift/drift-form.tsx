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
  { value: 'auto', label: 'Auto', hint: 'designesy.org is held to its own contract; any other site is scored fairly.' },
  { value: 'universal', label: 'Universal', hint: 'A site with no custom properties at all is skipped on d01 instead of failed.' },
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
        foot={
          <>
            <Segmented<Scope> label="scope" value={scope} onChange={setScope} options={SCOPES} disabled={phase === 'running'} />
            <p className="eg-bar-foot-note">{SCOPES.find((s) => s.value === scope)?.hint}</p>
          </>
        }
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
        restCard={
          <div className="eg-ref">
            <span className="eg-label">What drift looks like</span>
            <dl>
              <div>
                <dt>Token fabrication <span className="eg-ref-where">d02 d11 d12</span></dt>
                <dd>Names that look like tokens and resolve to nothing.</dd>
              </div>
              <div>
                <dt>Drift within a session <span className="eg-ref-where">d03 to d10</span></dt>
                <dd>One role, several raw values, in the same build.</dd>
              </div>
              <div>
                <dt>Amnesia between sessions <span className="eg-ref-where">monitor</span></dt>
                <dd>Values worked out again from scratch, landing somewhere else.</dd>
              </div>
              <div>
                <dt>Silent breaking changes <span className="eg-ref-where">monitor</span></dt>
                <dd>Token values changed with no version bump.</dd>
              </div>
            </dl>
            <p className="eg-ref-note">One scan shows the first two. The other two need history, which Monitor keeps.</p>
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
