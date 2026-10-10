'use client';

import { useRef, useState, type CSSProperties } from 'react';
import { EngineBar, Segmented } from '../lib/engine/command-bar';
import { Instrument } from '../lib/engine/instrument';
import { Findings, type FindingsHandle } from '../lib/engine/findings';
import { EngineShare } from '../lib/engine/engine-share';
import { normalizeUrl, stamp, useAutoRun, useEngineRun } from '../lib/engine/use-engine-run';
import { bandOf, hostOf, toOutcomes, type RegistryView } from '../lib/engine/types';

type Check = { id: string; item: string; status: string; detail: string };

type SubEngineResult = {
  ok: boolean;
  score?: number;
  grade?: string;
  pass?: number;
  warn?: number;
  fail?: number;
  total?: number;
  checks?: Check[];
  error?: string;
};

type ReportResponse = {
  ok: boolean;
  url?: string;
  compositeScore?: number;
  compositeGrade?: string;
  score?: SubEngineResult;
  drift?: SubEngineResult;
  readiness?: SubEngineResult;
  totalChecks?: number;
  totalPass?: number;
  totalWarn?: number;
  totalFail?: number;
  totalSkip?: number;
  totalManual?: number;
  checks?: Array<Check & { engine: string }>;
  synthesis?: Check[];
  error?: string;
};

type Tab = 'score' | 'drift' | 'readiness' | 'synthesis';

const ENGINES: { key: 'score' | 'drift' | 'readiness'; name: string; weight: number }[] = [
  { key: 'score', name: 'Contract score', weight: 50 },
  { key: 'drift', name: 'Drift radar', weight: 30 },
  { key: 'readiness', name: 'AI readiness', weight: 20 },
];

export function ReportForm({
  initialUrl,
  registry,
  engines,
}: {
  initialUrl: string;
  registry: RegistryView;
  engines: Record<'score' | 'drift' | 'readiness', RegistryView>;
}) {
  const [url, setUrl] = useState(initialUrl);
  const [tab, setTab] = useState<Tab>('score');
  const { phase, result, scanned, error, when, run } = useEngineRun<ReportResponse>('/api/report', 'report engine');
  const findings = useRef<FindingsHandle>(null);

  const start = (target: string) => {
    const u = normalizeUrl(target);
    if (u) run(u, { url: u });
  };
  useAutoRun(initialUrl, start);

  const r = result;
  const host = scanned ? hostOf(scanned) : '';
  const synthesis = toOutcomes(r?.synthesis);

  const weights = (
    <div className="eg-weights" aria-label="Combined score weighting">
      <span className="eg-label">The combined score, drawn to its weights</span>
      <div className="eg-weights-row">
        {ENGINES.map((e) => {
          const sub = phase === 'done' ? r?.[e.key] : undefined;
          const ran = !!sub?.ok && typeof sub.score === 'number';
          const score = ran ? (sub!.score as number) : 0;
          return (
            <div className="eg-weight" key={e.key} style={{ '--w': e.weight } as CSSProperties}>
              <div className="eg-weight-bar" aria-hidden="true">
                <i
                  data-band={ran ? bandOf(sub!.grade || 'F') : undefined}
                  style={{ '--fill': ran ? score / 100 : 0 } as CSSProperties}
                />
              </div>
              <span className="eg-weight-text">
                <span className="eg-weight-name">{e.name}</span>
                <span className="eg-weight-meta">
                  {e.weight}% · {engines[e.key].checks.length} checks
                  {phase === 'done' && (ran ? <> · <b>{sub!.grade} {score}</b> gives {(score * e.weight / 100).toFixed(1)}</> : ' · no result')}
                </span>
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );

  const tabs: { value: Tab; label: string; registry: RegistryView; checks?: Check[] }[] = [
    { value: 'score', label: `Contract score ${r?.score?.checks?.length ?? 0}`, registry: engines.score, checks: r?.score?.checks },
    { value: 'drift', label: `Drift ${r?.drift?.checks?.length ?? 0}`, registry: engines.drift, checks: r?.drift?.checks },
    { value: 'readiness', label: `Readiness ${r?.readiness?.checks?.length ?? 0}`, registry: engines.readiness, checks: r?.readiness?.checks },
    { value: 'synthesis', label: `Synthesis ${r?.synthesis?.length ?? 0}`, registry, checks: r?.synthesis },
  ];
  const current = tabs.find((t) => t.value === tab) ?? tabs[0];

  // Where to begin: the engine with the lowest score, since its share of the
  // composite has the most room to move.
  const weakest =
    phase === 'done' && r
      ? ENGINES.filter((e) => r[e.key]?.ok && typeof r[e.key]?.score === 'number').sort(
          (a, b) => (r[a.key]!.score as number) - (r[b.key]!.score as number),
        )[0]
      : undefined;
  const weakSub = weakest ? r?.[weakest.key] : undefined;
  const startNode =
    weakest && weakSub ? (
      <button
        type="button"
        className="eg-start"
        onClick={() => {
          setTab(weakest.key);
          window.setTimeout(() => document.getElementById('eg-findings-h')?.scrollIntoView({ block: 'start', behavior: 'smooth' }), 60);
        }}
      >
        <span className="eg-label">Start here</span>
        <span className="eg-start-title">
          {weakest.name} · {weakSub.grade} {weakSub.score}
        </span>
        <span className="eg-start-detail">
          The lowest of the three: {weakSub.fail ?? 0} of {weakSub.total ?? 0} checks fail. Open its findings.
        </span>
      </button>
    ) : undefined;

  return (
    <div className="eg-bench">
      <EngineBar
        fields={[{ value: url, onChange: setUrl, label: 'URL to report on', placeholder: 'Any public URL, like stripe.com' }]}
        onSubmit={() => start(url)}
        busy={phase === 'running'}
        go="Build the report"
        goBusy="Building"
        note="Three engines run in parallel, a few seconds longer than one."
      />
      <Instrument
        name="Report"
        registry={registry}
        face="tiles"
        faceTop={weights}
        startNode={startNode}
        phase={phase}
        target={host}
        outcomes={synthesis}
        verdict={
          r && phase === 'done'
            ? {
                score: r.compositeScore ?? 0,
                grade: r.compositeGrade ?? 'F',
                pass: r.totalPass ?? 0,
                warn: r.totalWarn ?? 0,
                fail: r.totalFail ?? 0,
                skip: r.totalSkip ?? 0,
                manual: r.totalManual ?? 0,
                total: r.totalChecks ?? 0,
              }
            : null
        }
        error={
          <>
            <p><b>{host || 'This URL'}</b> could not be reported on.</p>
            <p>{error}</p>
          </>
        }
        errorText={error}
        scoring="re-weighted when an engine returns nothing"
        restNote="Build a report and each share of the bar fills to its engine's score. The combined score is their weighted sum."
        restCard={
          <div className="eg-ref">
            <span className="eg-label">Why these weights</span>
            <dl>
              <div>
                <dt>Contract score <span className="eg-ref-where">50%</span></dt>
                <dd>The broadest measure: tokens, type, motion, accessibility, identity, runtime.</dd>
              </div>
              <div>
                <dt>Drift radar <span className="eg-ref-where">30%</span></dt>
                <dd>Whether the system holds together as AI-written code piles up.</dd>
              </div>
              <div>
                <dt>AI readiness <span className="eg-ref-where">20%</span></dt>
                <dd>What an agent can read about the system before it builds.</dd>
              </div>
            </dl>
            <p className="eg-ref-note">If an engine returns nothing, the others are re-weighted and the synthesis checks say so.</p>
          </div>
        }
        onOpen={(id) => {
          // The synthesis list mounts on the tab switch; open once it exists.
          setTab('synthesis');
          window.setTimeout(() => findings.current?.open(id), 60);
        }}
        sideExtra={
          phase === 'done' && scanned ? (
            <EngineShare path={`/report?url=${encodeURIComponent(scanned)}`} text={`Designesy report: ${host}`} label="Share this report" />
          ) : null
        }
      />
      {phase === 'done' && r && (
        <>
          <Findings
            key={tab}
            lead={<Segmented<Tab> label="checks from" value={tab} onChange={setTab} options={tabs.map(({ value, label }) => ({ value, label }))} />}
            ref={findings}
            registry={current.registry}
            outcomes={toOutcomes(current.checks)}
            heading={tab === 'synthesis' ? 'Synthesis' : `${ENGINES.find((e) => e.key === tab)?.name}`}
            sub={[
              `${current.checks?.length ?? 0} checks on ${host}`,
              tab === 'synthesis' ? 'did the report itself run correctly' : '',
              stamp(when),
            ].filter(Boolean).join(' · ')}
          />
        </>
      )}
    </div>
  );
}
