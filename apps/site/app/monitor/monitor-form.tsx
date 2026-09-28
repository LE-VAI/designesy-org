'use client';

import { useEffect, useRef, useState } from 'react';
import { EngineBar } from '../lib/engine/command-bar';
import { Instrument } from '../lib/engine/instrument';
import { Findings, type FindingsHandle } from '../lib/engine/findings';
import { EngineShare } from '../lib/engine/engine-share';
import { normalizeUrl, stamp, useEngineRun } from '../lib/engine/use-engine-run';
import { display, hostOf, toOutcomes, type RegistryView } from '../lib/engine/types';

type Check = { id: string; item: string; category?: string; status: string; detail: string };

type Snapshot = {
  timestamp: string;
  score: number;
  grade: string;
  tokensExtracted: number;
  checks: Check[];
};

type MonitorResponse = {
  ok: boolean;
  url?: string;
  score?: number;
  grade?: string;
  pass?: number;
  warn?: number;
  fail?: number;
  total?: number;
  currentSnapshot?: Snapshot;
  baseline?: Snapshot | null;
  previous?: Snapshot | null;
  driftChecks?: Check[];
  monitorChecks?: Check[];
  alerts?: string[];
  emailAlert?: { attempted: boolean; delivered: boolean; recipient?: string; fromAddress?: string; error?: string };
  error?: string;
};

const STORAGE_KEY = 'designesy:monitor-history';
const EMAIL_KEY = 'designesy:monitor-email';
const MAX_HISTORY = 50;

function loadHistory(url: string): Snapshot[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(`${STORAGE_KEY}:${url}`) || '[]');
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveHistory(url: string, snapshots: Snapshot[]) {
  try {
    localStorage.setItem(`${STORAGE_KEY}:${url}`, JSON.stringify(snapshots.slice(-MAX_HISTORY)));
  } catch {
    /* storage full or refused: the run still shows */
  }
}

/** Every URL this browser already watches, newest run first. */
function loadWatches(): { url: string; runs: number; last: Snapshot }[] {
  const out: { url: string; runs: number; last: Snapshot }[] = [];
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (!key || !key.startsWith(`${STORAGE_KEY}:`)) continue;
      const url = key.slice(STORAGE_KEY.length + 1);
      const snaps = loadHistory(url);
      if (snaps.length) out.push({ url, runs: snaps.length, last: snaps[snaps.length - 1] });
    }
  } catch {
    /* storage refused */
  }
  return out.sort((a, b) => b.last.timestamp.localeCompare(a.last.timestamp)).slice(0, 4);
}

function when(iso: string) {
  try {
    return new Date(iso).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  } catch {
    return iso;
  }
}

/** A sparkline: no axes, no labels. The first and last scores are named in
    its accessible name, and the table under the findings holds every run. */
function Sparkline({ scores }: { scores: number[] }) {
  const w = 240;
  const h = 44;
  const pad = 4;
  const x = (i: number) => pad + (i / Math.max(scores.length - 1, 1)) * (w - 2 * pad);
  const y = (s: number) => h - pad - (Math.max(0, Math.min(100, s)) / 100) * (h - 2 * pad);
  const d = scores.map((s, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)} ${y(s).toFixed(1)}`).join(' ');
  const last = scores.length - 1;
  return (
    <svg
      className="eg-spark"
      viewBox={`0 0 ${w} ${h}`}
      preserveAspectRatio="none"
      role="img"
      aria-label={`Score over ${scores.length} runs, from ${scores[0]} to ${scores[last]}`}
    >
      <path d={d} fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
      <circle cx={x(last)} cy={y(scores[last])} r="2.5" fill="currentColor" />
    </svg>
  );
}

export function MonitorForm({
  initialUrl,
  registry,
  drift,
}: {
  initialUrl: string;
  registry: RegistryView;
  drift: RegistryView;
}) {
  const [url, setUrl] = useState(initialUrl);
  const [email, setEmail] = useState('');
  const [history, setHistory] = useState<Snapshot[]>([]);
  const [watches, setWatches] = useState<ReturnType<typeof loadWatches>>([]);
  const { phase, result, scanned, error, when: at, run } = useEngineRun<MonitorResponse>('/api/monitor', 'monitor engine');
  const findings = useRef<FindingsHandle>(null);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(EMAIL_KEY);
      if (saved) setEmail(saved);
    } catch {
      /* storage refused */
    }
    setWatches(loadWatches());
  }, []);

  const start = async (target: string) => {
    const u = normalizeUrl(target);
    if (!u) return;
    const mail = email.trim();
    try {
      if (mail) localStorage.setItem(EMAIL_KEY, mail);
    } catch {
      /* storage refused */
    }
    const prior = loadHistory(u);
    setHistory(prior);
    const data = await run(u, { url: u, history: prior, ...(mail ? { email: mail } : {}) });
    if (data?.currentSnapshot) {
      const next = [...prior, data.currentSnapshot];
      saveHistory(u, next);
      setHistory(next);
      setWatches(loadWatches());
    }
  };
  // A shared monitor link only fills the field: a run stores history and can
  // send mail, so it waits for the visitor to press run.

  const clear = () => {
    try {
      localStorage.removeItem(`${STORAGE_KEY}:${scanned}`);
    } catch {
      /* storage refused */
    }
    setHistory([]);
    setWatches(loadWatches());
  };

  const outcomes = toOutcomes(result?.monitorChecks);
  const driftOutcomes = toOutcomes(result?.driftChecks);
  const host = scanned ? hostOf(scanned) : '';
  const scores = history.map((s) => s.score);
  const alerts = result?.alerts ?? [];
  const mail = result?.emailAlert;

  const sideExtra =
    phase === 'done' && result ? (
      <>
        {alerts.length > 0 && (
          <div className="eg-alerts" role="status">
            <span className="eg-label">{alerts.length === 1 ? '1 alert' : `${alerts.length} alerts`}</span>
            <ul>
              {alerts.map((a, i) => (
                <li key={i}>{display(a)}</li>
              ))}
            </ul>
            {mail && (
              <p className="eg-quiet">
                {mail.delivered
                  ? `Sent to ${mail.recipient}.`
                  : mail.fromAddress === 'suppressed (cooldown)'
                    ? 'Mail held back: the same alert went out within the hour.'
                    : mail.attempted
                      ? `Mail could not be sent: ${display(mail.error || 'no reason given')}.`
                      : 'Add an email to get this by mail.'}
              </p>
            )}
          </div>
        )}
        {scores.length > 1 && (
          <div className="eg-trend">
            <span className="eg-label">This URL, {scores.length} runs</span>
            <Sparkline scores={scores} />
            <span className="eg-quiet">
              {scores[0]} first · {scores[scores.length - 1]} now
            </span>
          </div>
        )}
        <EngineShare path={`/monitor?url=${encodeURIComponent(scanned)}`} text={`Designesy monitor: ${host}`} label="Share this watch" />
      </>
    ) : null;

  return (
    <div className="eg-bench">
      <EngineBar
        fields={[
          { value: url, onChange: setUrl, label: 'URL to watch for drift', placeholder: 'Any public URL, like stripe.com' },
          { value: email, onChange: setEmail, label: 'Email for drift alerts, optional', placeholder: 'Email for alerts, optional', type: 'email', optional: true },
        ]}
        onSubmit={() => start(url)}
        busy={phase === 'running'}
        go="Run the watch"
        goBusy="Watching"
        note="History stays in this browser. The email is used for drift alerts and nothing else."
      />
      <Instrument
        name="Drift monitor"
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
                total: result.total ?? registry.checks.length,
              }
            : null
        }
        error={
          <>
            <p><b>{host || 'This URL'}</b> could not be watched.</p>
            <p>{error}</p>
          </>
        }
        scoring="pass 1 · warn 0.5 · fail 0 · the grade measures the watch"
        restNote="Run a URL and each governance check lights. The first run sets the baseline; later runs compare against it."
        restCard={
          <div className="eg-ref">
            <span className="eg-label">{watches.length ? 'Watched from this browser' : 'How a watch works'}</span>
            {watches.length ? (
              <ul className="eg-watches">
                {watches.map((w) => (
                  <li key={w.url}>
                    <button type="button" className="eg-watch" onClick={() => setUrl(w.url)}>
                      <span className="eg-watch-host">{hostOf(w.url)}</span>
                      <span className="eg-quiet">
                        {w.runs} {w.runs === 1 ? 'run' : 'runs'} · last {w.last.grade} {w.last.score} · {when(w.last.timestamp)}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <dl>
                <div>
                  <dt>First run <span className="eg-ref-where">m01 m03</span></dt>
                  <dd>Scores the page and stores the snapshot as the baseline.</dd>
                </div>
                <div>
                  <dt>Every run after <span className="eg-ref-where">m03 to m09</span></dt>
                  <dd>Compared with the baseline and the run before: score, trend, failures, tokens.</dd>
                </div>
                <div>
                  <dt>A drop past the threshold <span className="eg-ref-where">m07 m10</span></dt>
                  <dd>Raises an alert, mailed to you if you left an address.</dd>
                </div>
              </dl>
            )}
            <p className="eg-ref-note">Snapshots are stored in this browser only, 50 runs per URL.</p>
          </div>
        }
        onOpen={(id) => findings.current?.open(id)}
        sideExtra={sideExtra}
      />
      {phase === 'done' && result && (
        <Findings
          ref={findings}
          registry={registry}
          outcomes={outcomes}
          heading="Governance"
          sub={[`${result.total ?? registry.checks.length} checks on the watch of ${host}`, stamp(at)].filter(Boolean).join(' · ')}
        />
      )}
      {phase === 'done' && result?.driftChecks && (
        <Findings
          registry={drift}
          outcomes={driftOutcomes}
          heading="Drift this run"
          id="eg-drift-h"
          defaultFilter="work"
          sub={`The 12 drift radar checks on ${host}, the input to every comparison above`}
        />
      )}
      {phase === 'done' && history.length > 0 && (
        <section className="eg-section" aria-labelledby="eg-runs-h">
          <div className="eg-section-head">
            <div>
              <h2 className="eg-h2" id="eg-runs-h">Runs</h2>
              <p className="eg-section-sub">{history.length} stored in this browser for {host}</p>
            </div>
            <button type="button" className="eg-share-btn" onClick={clear}>
              Clear this history
            </button>
          </div>
          <div className="eg-table-wrap">
            <table className="eg-table">
              <thead>
                <tr>
                  <th scope="col">Run</th>
                  <th scope="col">When</th>
                  <th scope="col" className="is-num">Score</th>
                  <th scope="col">Grade</th>
                  <th scope="col" className="is-num">Tokens</th>
                  <th scope="col" className="is-num">Change</th>
                </tr>
              </thead>
              <tbody>
                {history
                  .map((s, i) => ({ s, i, d: i > 0 ? s.score - history[i - 1].score : null }))
                  .reverse()
                  .map(({ s, i, d }) => (
                    <tr key={`${s.timestamp}-${i}`}>
                      <td>{String(i + 1).padStart(2, '0')}</td>
                      <td>{when(s.timestamp)}</td>
                      <td className="is-num">{s.score}</td>
                      <td>{s.grade}</td>
                      <td className="is-num">{s.tokensExtracted}</td>
                      <td className={`is-num ${d && d > 0 ? 'eg-delta-up' : d && d < 0 ? 'eg-delta-down' : ''}`}>
                        {d === null ? 'baseline' : d > 0 ? `+${d}` : `${d}`}
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
}
