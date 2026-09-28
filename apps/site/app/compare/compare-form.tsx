'use client';

import { useRef, useState, type ReactNode } from 'react';
import { EngineBar, Segmented } from '../lib/engine/command-bar';
import { Instrument } from '../lib/engine/instrument';
import { Findings, type FindingsHandle } from '../lib/engine/findings';
import { EngineShare } from '../lib/engine/engine-share';
import { normalizeUrl, stamp, useAutoRun, useEngineRun } from '../lib/engine/use-engine-run';
import { hostOf, toOutcomes, type RegistryView } from '../lib/engine/types';

type TokenDiffEntry = { token: string; valueA?: string; valueB?: string };
type RenameCandidate = { from: string; to: string; distance: number; valueA: string; valueB: string };
type ContrastDriftEntry = { token: string; valueA: string; valueB: string; contrastA: number; contrastB: number; drift: number };

type CompareResponse = {
  ok: boolean;
  urlA?: string;
  urlB?: string;
  score?: number;
  grade?: string;
  pass?: number;
  warn?: number;
  fail?: number;
  total?: number;
  tokensA?: number;
  tokensB?: number;
  added?: TokenDiffEntry[];
  removed?: TokenDiffEntry[];
  renamed?: RenameCandidate[];
  valueChanged?: TokenDiffEntry[];
  scaleDiff?: {
    spacing: { a: number; b: number; delta: number };
    radius: { a: number; b: number; delta: number };
    colors: { a: number; b: number; delta: number };
  };
  structureDelta?: {
    countA: number;
    countB: number;
    countDelta: number;
    categoriesA: Record<string, number>;
    categoriesB: Record<string, number>;
  };
  contrastDrift?: ContrastDriftEntry[];
  scoreDelta?: { scoreA: number; scoreB: number; delta: number; gradeA: string; gradeB: string } | null;
  checks?: { id: string; item: string; status: string; detail: string }[];
  error?: string;
};

type View = 'added' | 'removed' | 'renamed' | 'changed' | 'contrast';

/** Only a value that parses as a color gets a swatch: a remote site's CSS
    value never reaches a style that could load a url(). */
const COLOR = /^(#[0-9a-f]{3,8}|(?:rgba?|hsla?|oklch|oklab|lab|lch|hwb|color)\([^()]*\))$/i;

function Swatch({ value }: { value?: string }) {
  if (!value || !COLOR.test(value.trim())) return null;
  return <i className="eg-swatch" style={{ background: value.trim() }} aria-hidden="true" />;
}

/** Scores arrive as floats (66.9, and deltas like -13.399999); one decimal at most. */
function num(n: number) {
  return String(Math.round(n * 10) / 10);
}

function signed(n: number) {
  return n > 0 ? `+${num(n)}` : num(n);
}

export function CompareForm({ initialA, initialB, registry }: { initialA: string; initialB: string; registry: RegistryView }) {
  const [urlA, setUrlA] = useState(initialA);
  const [urlB, setUrlB] = useState(initialB);
  const [view, setView] = useState<View>('changed');
  const { phase, result, error, when, run } = useEngineRun<CompareResponse>('/api/compare', 'compare engine');
  const [pair, setPair] = useState({ a: '', b: '' });
  const findings = useRef<FindingsHandle>(null);

  const start = (a: string, b: string) => {
    const na = normalizeUrl(a);
    const nb = normalizeUrl(b);
    if (!na || !nb) return;
    setPair({ a: na, b: nb });
    run(na, { urlA: na, urlB: nb }).then((data) => {
      // Open on the first view that has rows, in order of how much each says.
      if (!data) return;
      const order: [View, number][] = [
        ['changed', data.valueChanged?.length ?? 0],
        ['renamed', data.renamed?.length ?? 0],
        ['contrast', data.contrastDrift?.length ?? 0],
        ['added', data.added?.length ?? 0],
        ['removed', data.removed?.length ?? 0],
      ];
      setView((order.find(([, n]) => n > 0) ?? order[0])[0]);
    });
  };
  // A shared link opens on its comparison only when it names both sides.
  useAutoRun(initialA && initialB ? `${initialA} ${initialB}` : '', () => start(initialA, initialB));

  const outcomes = toOutcomes(result?.checks);
  const hostA = pair.a ? hostOf(pair.a) : '';
  const hostB = pair.b ? hostOf(pair.b) : '';
  const r = result;

  const diffValues: Record<string, { a?: ReactNode; b?: ReactNode }> = r
    ? {
        c01: { a: 'fetched', b: 'fetched' },
        c02: { a: `${r.tokensA ?? 0} tokens`, b: `${r.tokensB ?? 0} tokens` },
        c03: {
          a: `${r.added?.length ?? 0} only here`,
          b: `${r.removed?.length ?? 0} only here`,
        },
        c04: { a: `${r.renamed?.length ?? 0} pairs`, b: `${r.renamed?.length ?? 0} pairs` },
        c05: r.scaleDiff
          ? {
              a: `spacing ${r.scaleDiff.spacing.a} · radius ${r.scaleDiff.radius.a} · color ${r.scaleDiff.colors.a}`,
              b: `spacing ${r.scaleDiff.spacing.b} · radius ${r.scaleDiff.radius.b} · color ${r.scaleDiff.colors.b}`,
            }
          : {},
        c06: r.structureDelta ? { a: `${r.structureDelta.countA}`, b: `${r.structureDelta.countB}` } : {},
        c07: { a: `${r.contrastDrift?.length ?? 0} pairs`, b: `${r.contrastDrift?.length ?? 0} pairs` },
        c08: r.scoreDelta
          ? { a: `${r.scoreDelta.gradeA} ${num(r.scoreDelta.scoreA)}`, b: `${r.scoreDelta.gradeB} ${num(r.scoreDelta.scoreB)}` }
          : { a: 'not run', b: 'not run' },
      }
    : {};

  const counts: Record<View, number> = {
    added: r?.added?.length ?? 0,
    removed: r?.removed?.length ?? 0,
    renamed: r?.renamed?.length ?? 0,
    changed: r?.valueChanged?.length ?? 0,
    contrast: r?.contrastDrift?.length ?? 0,
  };

  let table: ReactNode = null;
  if (r) {
    if (view === 'added' || view === 'removed') {
      const rows = (view === 'added' ? r.added : r.removed) ?? [];
      const host = view === 'added' ? hostA : hostB;
      table = rows.length ? (
        <div className="eg-table-wrap"><table className="eg-table">
          <thead><tr><th scope="col">Token</th><th scope="col">Value on {host}</th></tr></thead>
          <tbody>
            {rows.map((e, i) => (
              <tr key={`${e.token}-${i}`}>
                <td>{e.token}</td>
                <td><Swatch value={e.valueA || e.valueB} />{e.valueA || e.valueB || ''}</td>
              </tr>
            ))}
          </tbody>
        </table></div>
      ) : (
        <p className="eg-empty">Every token on {host} also exists on the other site.</p>
      );
    } else if (view === 'renamed') {
      const rows = r.renamed ?? [];
      table = rows.length ? (
        <div className="eg-table-wrap"><table className="eg-table">
          <thead><tr><th scope="col">On {hostA}</th><th scope="col">On {hostB}</th><th scope="col" className="is-num">Edit distance</th></tr></thead>
          <tbody>
            {rows.map((e, i) => (
              <tr key={`${e.from}-${e.to}-${i}`}>
                <td>{e.from}<br /><Swatch value={e.valueA} />{e.valueA}</td>
                <td><code>{e.to}</code><br /><Swatch value={e.valueB} />{e.valueB}</td>
                <td className="is-num">{e.distance}</td>
              </tr>
            ))}
          </tbody>
        </table></div>
      ) : (
        <p className="eg-empty">No two token names are close enough to read as a rename.</p>
      );
    } else if (view === 'changed') {
      const rows = r.valueChanged ?? [];
      table = rows.length ? (
        <div className="eg-table-wrap"><table className="eg-table">
          <thead><tr><th scope="col">Token</th><th scope="col">{hostA}</th><th scope="col">{hostB}</th></tr></thead>
          <tbody>
            {rows.map((e, i) => (
              <tr key={`${e.token}-${i}`}>
                <td>{e.token}</td>
                <td><Swatch value={e.valueA} />{e.valueA ?? ''}</td>
                <td><Swatch value={e.valueB} />{e.valueB ?? ''}</td>
              </tr>
            ))}
          </tbody>
        </table></div>
      ) : (
        <p className="eg-empty">Every token the two sites share has the same value on both.</p>
      );
    } else {
      const rows = r.contrastDrift ?? [];
      table = rows.length ? (
        <div className="eg-table-wrap"><table className="eg-table">
          <thead><tr><th scope="col">Token</th><th scope="col">{hostA}</th><th scope="col">{hostB}</th><th scope="col" className="is-num">Change</th></tr></thead>
          <tbody>
            {rows.map((e, i) => (
              <tr key={`${e.token}-${i}`}>
                <td>{e.token}</td>
                <td><Swatch value={e.valueA} />{e.valueA} <span className="eg-quiet">{e.contrastA}:1</span></td>
                <td><Swatch value={e.valueB} />{e.valueB} <span className="eg-quiet">{e.contrastB}:1</span></td>
                <td className={`is-num ${e.drift > 0 ? 'eg-delta-up' : e.drift < 0 ? 'eg-delta-down' : ''}`}>{signed(e.drift)}</td>
              </tr>
            ))}
          </tbody>
        </table></div>
      ) : (
        <p className="eg-empty">No color the two sites share changed its contrast.</p>
      );
    }
  }

  const verdictNode = r ? (
    <>
      <span className="eg-label">The diff</span>
      <dl className="eg-figs">
        <div><dt>Only on A</dt><dd>{counts.added}</dd></div>
        <div><dt>Only on B</dt><dd>{counts.removed}</dd></div>
        <div><dt>Value changed</dt><dd>{counts.changed}</dd></div>
        <div><dt>Renamed</dt><dd>{counts.renamed}</dd></div>
        {r.scoreDelta && (
          <div>
            <dt>Contract score</dt>
            <dd>
              {num(r.scoreDelta.scoreA)}<small> vs </small>{num(r.scoreDelta.scoreB)}
            </dd>
          </div>
        )}
        {r.scoreDelta && (
          <div>
            <dt>B against A</dt>
            <dd className={r.scoreDelta.delta > 0 ? 'eg-delta-up' : r.scoreDelta.delta < 0 ? 'eg-delta-down' : ''}>
              {signed(r.scoreDelta.delta)}
            </dd>
          </div>
        )}
      </dl>
      <p className="eg-quiet">
        Diff completeness {r.grade} {r.score}/100 · {r.pass} pass · {r.warn} warn · {r.fail} fail
      </p>
      <EngineShare
        path={`/compare?a=${encodeURIComponent(pair.a)}&b=${encodeURIComponent(pair.b)}`}
        text={`Designesy compare: ${hostA} and ${hostB}`}
        label="Share this comparison"
      />
    </>
  ) : null;

  return (
    <div className="eg-bench">
      <EngineBar
        fields={[
          { value: urlA, onChange: setUrlA, label: 'First URL, site A', placeholder: 'Your site, like stripe.com', mark: 'A' },
          { value: urlB, onChange: setUrlB, label: 'Second URL, site B', placeholder: 'A reference, like adyen.com', mark: 'B' },
        ]}
        onSubmit={() => start(urlA, urlB)}
        busy={phase === 'running'}
        go="Compare"
        goBusy="Comparing"
        note="Each side is fetched fresh, then diffed token by token."
      />
      <Instrument
        name="Compare"
        registry={registry}
        face="diff"
        sides={{ a: hostA || 'site A', b: hostB || 'site B' }}
        diffValues={diffValues}
        phase={phase}
        target={hostA && hostB ? `${hostA} and ${hostB}` : ''}
        outcomes={outcomes}
        verdictNode={verdictNode}
        error={
          <>
            <p><b>{hostA && hostB ? `${hostA} and ${hostB}` : 'These URLs'}</b> could not be compared.</p>
            <p>{error}</p>
          </>
        }
        scoring="the diff is the result · completeness grade: pass 1 · warn 0.5 · fail 0"
        restNote="Name two sites and each dimension fills with both answers, A on the left and B on the right."
        restCard={
          <div className="eg-ref">
            <span className="eg-label">How to read it</span>
            <dl>
              <div>
                <dt>Only on A, only on B</dt>
                <dd>A token one site declares and the other lacks.</dd>
              </div>
              <div>
                <dt>Value changed</dt>
                <dd>Same name, different value: the core of drift between two systems.</dd>
              </div>
              <div>
                <dt>Renamed</dt>
                <dd>Names two edits apart or closer, flagged as a likely rename.</dd>
              </div>
              <div>
                <dt>Scale stops</dt>
                <dd>Steps of spacing, radius and color, counted on each side.</dd>
              </div>
            </dl>
            <p className="eg-ref-note">The grade only says whether every dimension could be computed. The diff is the answer.</p>
          </div>
        }
        onOpen={(id) => findings.current?.open(id)}
      />
      {phase === 'done' && r && (
        <section className="eg-section" aria-labelledby="eg-diff-h">
          <div className="eg-section-head">
            <div>
              <h2 className="eg-h2" id="eg-diff-h">The diff</h2>
              <p className="eg-section-sub">
                {hostA} against {hostB} · {r.tokensA ?? 0} and {r.tokensB ?? 0} tokens{when ? ` · ${stamp(when)}` : ''}
              </p>
            </div>
            <Segmented<View>
              label="show"
              value={view}
              onChange={setView}
              options={[
                { value: 'changed', label: `Changed ${counts.changed}` },
                { value: 'added', label: `Only A ${counts.added}` },
                { value: 'removed', label: `Only B ${counts.removed}` },
                { value: 'renamed', label: `Renamed ${counts.renamed}` },
                { value: 'contrast', label: `Contrast ${counts.contrast}` },
              ]}
            />
          </div>
          {table}
        </section>
      )}
      {phase === 'done' && r && (
        <Findings
          ref={findings}
          registry={registry}
          outcomes={outcomes}
          heading="Checks"
          sub={[`${r.total ?? registry.checks.length} checks on the diff`, stamp(when)].filter(Boolean).join(' · ')}
        />
      )}
    </div>
  );
}
