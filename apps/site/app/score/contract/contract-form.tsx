'use client';

// /score/contract: the bench. The slab (a URL well, the contract by paste,
// upload or link, an optional token map), the run, and what the run ends in:
// a landing, a rejected contract (422, the problems panel), or a request that
// got no result (the W10 card). One polite live region, present from first
// paint, carries every announcement; the instrument draws none of its own.
//
// The contract's text stays in this component's memory. It never enters a
// URL, storage or analytics: only a linked contract can be deep-linked, and
// the deep link carries its address, never its text.

import Link from 'next/link';
import { useEffect, useId, useRef, useState, type DragEvent, type FormEvent, type ReactNode } from 'react';
import { Segmented } from '../../lib/engine/command-bar';
import { GradeScale, Instrument, Lamp, type EngineBlock } from '../../lib/engine/instrument';
import { bringIntoView } from '../../lib/engine/bring-into-view';
import { normalizeUrl, useAutoRun, useEngineRun } from '../../lib/engine/use-engine-run';
import { toOutcomes, type Phase, type RegistryView } from '../../lib/engine/types';
import { fmtScore } from '../verdict';
import { MIN_COLORS, MIN_TYPE_STYLES } from '../../lib/own-contract/limits';
import { ContractProblems, LintLine } from './contract-problems';
import {
  ANNOUNCE,
  FIELD_ERROR,
  PASTE_PLACEHOLDER,
  PRIVACY_NOTE,
  SOURCE_HINT,
  TOKEN_MAP_PLACEHOLDER,
  VERDICT_UNREACHABLE,
  caretLine,
  fileTooLarge,
  formatWords,
  howWord,
  kb,
  lineOffset,
  looksLikeContractUrl,
  looksLikeSite,
  overLimit,
  readAs,
  requestError,
  seconds,
  siteKey,
  steps as stepList,
  utf8Bytes,
  verdictFidelityNull,
  verdictPrefix,
  verdictWords,
  lintLine,
  type ContractProblem,
  type LayerResult,
  type LinterTotals,
  type Source,
  type Step,
} from './copy';

type Layer = LayerResult & { nullReason?: { code: string; detail?: string } | null };

type ContractResponse = {
  ok: boolean;
  error?: string;
  engineVersion?: string;
  contractVersion?: string;
  fidelity?: Layer;
  baseline?: Layer;
  checks?: { id: string; status: string; detail?: string; layer?: string }[];
  ownContract?: { name?: string | null; format?: string; tokens?: Record<string, number>; linter?: LinterTotals | null };
  unreachable?: boolean;
  unreachableDetail?: string;
};

type FieldKey = 'url' | 'contract' | 'map';
type FieldError = { field: FieldKey; message: string };

/** What the last run ended in, as the page draws it. */
type Ending =
  | { kind: 'none' }
  | { kind: 'landed'; took: string }
  | { kind: 'rejected'; problems: ContractProblem[]; warnings: ContractProblem[]; linter: LinterTotals | null }
  | { kind: 'request'; title: string; message: string };

const GLOBE = (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
    <circle cx="12" cy="12" r="9" />
    <path d="M3 12h18M12 3c2.6 2.6 3.9 5.6 3.9 9s-1.3 6.4-3.9 9c-2.6-2.6-3.9-5.6-3.9-9S9.4 5.6 12 3z" />
  </svg>
);

const WARN = (
  <svg className="eg-bar-warn" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M8 2.2 14.4 13.4H1.6Z" />
    <path d="M8 6.6v3.2M8 11.6v.1" />
  </svg>
);

const SOURCES: { value: Source; label: string }[] = [
  { value: 'paste', label: 'Paste' },
  { value: 'upload', label: 'Upload' },
  { value: 'link', label: 'Link' },
];

const FID_LINE = 'How closely this page follows your contract.';
const BASE_LINE = 'Web standards every site is held to, whatever its contract says.';

/** One number, at rest, landed, or with no score. */
function LayerReadout({ id, label, line, layer, rest }: { id: string; label: string; line: string; layer?: Layer | null; rest?: boolean }) {
  const scored = !rest && layer && layer.score !== null && layer.grade !== null;
  return (
    <section className="cf-layer" aria-labelledby={id}>
      <h2 className="eg-label" id={id}>{label}</h2>
      {scored ? (
        <div className="eg-verdict-row" data-grade={layer.grade!.toLowerCase()}>
          <span className="eg-grade">
            <span className="sr-only">grade </span>
            {layer.grade}
          </span>
          <span className="eg-score">
            {fmtScore(layer.score!)}
            <small aria-hidden="true">/100</small>
            <span className="sr-only"> out of 100</span>
          </span>
        </div>
      ) : rest || !layer ? (
        <div className="eg-verdict-row is-rest" aria-hidden="true">
          <span className="eg-grade" />
          <span className="eg-score">
            <small>/100</small>
          </span>
        </div>
      ) : (
        <p className="cf-null">No score</p>
      )}
      <p className="cf-layer-line">{line}</p>
      {scored ? <GradeScale score={layer.score!} grade={layer.grade!} /> : <GradeScale />}
      {!rest && layer && (
        <p className="cf-count">
          <b>{layer.scored}</b> of {layer.total} checks scored
        </p>
      )}
    </section>
  );
}

function StepRows({ rows }: { rows: Step[] }) {
  return (
    <dl className="cf-what-rows">
      {rows.map((s) => (
        <div key={s.label}>
          <dt>{s.label}</dt>
          <dd>
            <span className="cf-step" data-state={s.state === 'waiting' ? undefined : s.state}>
              <i aria-hidden="true" />
              {s.word}
            </span>
            <span data-state={s.state === 'waiting' ? 'waiting' : undefined}>{s.text}</span>
          </dd>
        </div>
      ))}
    </dl>
  );
}

function WhatRows({ label, rows }: { label: string; rows: [string, ReactNode][] }) {
  return (
    <div className="cf-what">
      <span className="eg-label">{label}</span>
      <dl className="cf-what-rows">
        {rows.map(([k, v]) => (
          <div key={k}>
            <dt>{k}</dt>
            <dd>{v}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

const MINIMUM_CARD = (
  <div className="eg-ref">
    <span className="eg-label">What your contract needs</span>
    <dl className="eg-ref-rows">
      <div>
        <dt>Parses cleanly</dt>
        <dd>no dropped tokens</dd>
      </div>
      <div>
        <dt>Colors</dt>
        <dd>{MIN_COLORS} or more</dd>
      </div>
      <div>
        <dt>Text styles</dt>
        <dd>{MIN_TYPE_STYLES} with family and size</dd>
      </div>
      <div>
        <dt>Radius, spacing, motion</dt>
        <dd>optional</dd>
      </div>
    </dl>
  </div>
);

export function ContractForm({
  initialUrl,
  initialContract,
  registry,
  fidelityIds,
  baselineIds,
  titles,
  ceilings,
}: {
  initialUrl: string;
  initialContract: string;
  registry: RegistryView;
  fidelityIds: string[];
  baselineIds: string[];
  titles: Record<string, string>;
  ceilings: Record<string, number>;
  minScored: number;
}) {
  const uid = useId();
  const ids = {
    url: `${uid}-url`,
    text: `${uid}-text`,
    link: `${uid}-link`,
    map: `${uid}-map`,
    choose: `${uid}-choose`,
    status: `${uid}-status`,
    hint: `${uid}-hint`,
  };
  const total = registry.checks.length;

  // ── Inputs ──
  const [url, setUrl] = useState(initialUrl);
  const [source, setSource] = useState<Source>(initialContract ? 'link' : 'paste');
  const [text, setText] = useState('');
  const [file, setFile] = useState<{ name: string; size: number; text: string } | null>(null);
  const [link, setLink] = useState(initialContract);
  const [mapText, setMapText] = useState('');
  const [mapOpen, setMapOpen] = useState(false);
  const [errors, setErrors] = useState<FieldError[]>([]);
  const [drag, setDrag] = useState(false);

  // ── The run ──
  const { phase, result, failure, run } = useEngineRun<ContractResponse>('/api/score', 'scoring engine');
  const [ending, setEnding] = useState<Ending>({ kind: 'none' });
  const [folded, setFolded] = useState(false);
  const [said, setSaid] = useState('');
  const started = useRef(0);
  const ran = useRef<{ site: string; how: string; source: Source; text: string } | null>(null);

  const urlRef = useRef<HTMLInputElement>(null);
  const textRef = useRef<HTMLTextAreaElement>(null);
  const linkRef = useRef<HTMLInputElement>(null);
  const mapRef = useRef<HTMLTextAreaElement>(null);
  const chooseRef = useRef<HTMLButtonElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const goRef = useRef<HTMLButtonElement>(null);
  const verdictRef = useRef<HTMLParagraphElement>(null);
  const problemsRef = useRef<HTMLHeadingElement>(null);
  const benchRef = useRef<HTMLDivElement>(null);

  const busy = phase === 'running';
  const contractText = source === 'paste' ? text : source === 'upload' ? file?.text ?? '' : '';

  // One live region: cleared, then set, so the same sentence twice is still heard.
  const sayTimer = useRef<number | null>(null);
  const announce = (msg: string) => {
    setSaid('');
    if (sayTimer.current) window.clearTimeout(sayTimer.current);
    sayTimer.current = window.setTimeout(() => setSaid(msg), 80);
  };
  useEffect(() => () => { if (sayTimer.current) window.clearTimeout(sayTimer.current); }, []);

  // ── "Read as": debounced, so typing is not read out letter by letter ──
  const [reading, setReading] = useState<{ label: string; known: boolean } | null>(null);
  useEffect(() => {
    const t = window.setTimeout(() => {
      if (source === 'link') setReading(link.trim() ? { label: 'Format is read when the run starts', known: false } : null);
      else setReading(readAs(contractText));
    }, 180);
    return () => window.clearTimeout(t);
  }, [source, contractText, link]);

  // ── Field checks (WIREFRAMES W1), every failing field in field order ──
  const validate = (): FieldError[] => {
    const errs: FieldError[] = [];
    const u = url.trim();
    if (!u) errs.push({ field: 'url', message: FIELD_ERROR.urlEmpty });
    else if (!looksLikeSite(u)) errs.push({ field: 'url', message: FIELD_ERROR.urlInvalid });
    if (source === 'link') {
      const l = link.trim();
      if (!l) errs.push({ field: 'contract', message: FIELD_ERROR.contractEmpty });
      else if (!looksLikeContractUrl(l)) errs.push({ field: 'contract', message: FIELD_ERROR.linkInvalid });
    } else if (!contractText.trim()) {
      errs.push({ field: 'contract', message: FIELD_ERROR.contractEmpty });
    } else if (overLimit(utf8Bytes(contractText))) {
      errs.push({ field: 'contract', message: fileTooLarge(utf8Bytes(contractText)) });
    }
    const m = mapText.trim();
    if (m) {
      let ok = false;
      try {
        const v = JSON.parse(m) as unknown;
        ok = !!v && typeof v === 'object' && !Array.isArray(v);
      } catch {
        ok = false;
      }
      if (!ok) errs.push({ field: 'map', message: FIELD_ERROR.mapNotJson });
    }
    return errs;
  };

  const focusField = (f: FieldKey) => {
    if (f === 'url') urlRef.current?.focus();
    else if (f === 'map') {
      setMapOpen(true);
      window.setTimeout(() => mapRef.current?.focus(), 0);
    } else if (source === 'paste') textRef.current?.focus();
    else if (source === 'upload') chooseRef.current?.focus();
    else linkRef.current?.focus();
  };

  const errorOf = (f: FieldKey) => errors.findIndex((e) => e.field === f);
  const invalid = (f: FieldKey) => errorOf(f) >= 0 || (f === 'contract' && ending.kind === 'rejected');
  // An invalid field is described by its own message (and its hint); a valid
  // field drops the status line while it holds errors, so tabbing to it never
  // reads another field's message.
  const describedBy = (f: FieldKey, hint = false) => {
    const i = errorOf(f);
    const parts = hint ? [ids.hint] : [];
    if (i >= 0) parts.push(`${ids.status}-e${i}`);
    else if (!errors.length) parts.push(ids.status);
    return parts.join(' ') || undefined;
  };

  // ── Running ──
  const start = () => {
    const site = normalizeUrl(url);
    const how = howWord(source);
    let map: Record<string, string> | undefined;
    if (mapText.trim()) map = JSON.parse(mapText) as Record<string, string>;
    const contract =
      source === 'link'
        ? { url: link.trim(), format: 'auto' as const, ...(map ? { tokenMap: map } : {}) }
        : { content: contractText, format: 'auto' as const, ...(map ? { tokenMap: map } : {}) };
    ran.current = { site: siteKey(site), how, source, text: contractText };
    started.current = performance.now();
    setEnding({ kind: 'none' });
    setFolded(false);
    announce(ANNOUNCE.running(siteKey(site)));
    void run(site, { url: site, contract });
  };

  const submit = (e?: FormEvent) => {
    e?.preventDefault();
    if (busy) return;
    const errs = validate();
    setErrors(errs);
    if (errs.length) {
      focusField(errs[0].field);
      return;
    }
    start();
  };

  // A deep link with a linked contract runs once on load.
  useAutoRun(initialUrl && initialContract ? 'go' : '', () => {
    if (!validate().length) start();
  });

  // ── Landing ──
  useEffect(() => {
    if (phase !== 'done' && phase !== 'error') return;
    const took = seconds(performance.now() - started.current);
    if (phase === 'done' && result) {
      setEnding({ kind: 'landed', took });
      setFolded(true);
      announce(result.unreachable ? ANNOUNCE.stopped(took) : ANNOUNCE.finished(took));
      return;
    }
    if (phase === 'error' && failure) {
      if (failure.status === 422 && failure.problems?.length) {
        setEnding({
          kind: 'rejected',
          problems: failure.problems as ContractProblem[],
          warnings: (failure.warnings ?? []) as ContractProblem[],
          linter: (failure.body?.linter as LinterTotals | null | undefined) ?? null,
        });
        announce(ANNOUNCE.rejected);
      } else {
        // The alert card speaks for itself; focus stays on the pressed key.
        const { title, message } = requestError(failure, ran.current?.site ?? '');
        setEnding({ kind: 'request', title, message });
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase]);

  // Focus follows the ending once it is drawn: the verdict line for a
  // landing, the panel heading for a rejected contract. A request error
  // leaves focus on the key that was pressed.
  useEffect(() => {
    const el = ending.kind === 'landed' ? verdictRef.current : ending.kind === 'rejected' ? problemsRef.current : null;
    if (!el) return;
    el.focus({ preventScroll: true });
    bringIntoView(el);
  }, [ending]);

  // ── Actions after a run ──
  const editInputs = () => {
    setFolded(false);
    setEnding({ kind: 'none' });
    announce(ANNOUNCE.editing);
    window.setTimeout(() => {
      urlRef.current?.focus();
      urlRef.current?.select();
    }, 0);
  };

  const editContract = () => {
    const problems = ending.kind === 'rejected' ? ending.problems : [];
    if (source === 'paste' && textRef.current) {
      const ta = textRef.current;
      const line = caretLine(problems) ?? 1;
      const pos = lineOffset(ta.value, line);
      ta.focus({ preventScroll: true });
      ta.setSelectionRange(pos, pos);
      const lh = parseFloat(getComputedStyle(ta).lineHeight) || 0;
      ta.scrollTop = Math.max(0, (line - 3) * lh);
      bringIntoView(ta.closest('.eg-bar-field') as HTMLElement | null);
    } else if (source === 'link') linkRef.current?.focus();
    else chooseRef.current?.focus();
  };

  const acceptFile = (f: File | undefined) => {
    if (!f) return;
    if (!/\.(md|json)$/i.test(f.name)) {
      setFile(null);
      setErrors([{ field: 'contract', message: FIELD_ERROR.fileType }]);
      return;
    }
    if (overLimit(f.size)) {
      setFile(null);
      setErrors([{ field: 'contract', message: fileTooLarge(f.size) }]);
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      setFile({ name: f.name, size: f.size, text: String(reader.result ?? '') });
      setErrors((e) => e.filter((x) => x.field !== 'contract'));
    };
    reader.readAsText(f);
  };

  const onDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDrag(false);
    if (!busy) acceptFile(e.dataTransfer.files?.[0]);
  };

  const clearError = (f: FieldKey) => setErrors((e) => (e.some((x) => x.field === f) ? e.filter((x) => x.field !== f) : e));

  // ── The status line under the slab ──
  const site = siteKey(normalizeUrl(url));
  const ready = !errors.length && looksLikeSite(url) && source !== 'link' && reading?.known;
  const statusTone: 'note' | 'read' | 'warn' = errors.length || ending.kind === 'rejected' ? 'warn' : ready && !busy ? 'read' : 'note';
  const rejectedCount = ending.kind === 'rejected' ? ending.problems.length : 0;
  const statusLive: ReactNode =
    statusTone === 'warn' ? (
      errors.length ? (
        errors.map((e, i) => (
          <span key={e.field} id={`${ids.status}-e${i}`}>
            {e.message}{' '}
          </span>
        ))
      ) : (
        <span>
          {rejectedCount === 1
            ? 'Your contract needs 1 change before scoring. See the problem below.'
            : `Your contract needs ${rejectedCount} changes before scoring. See the problems below.`}
        </span>
      )
    ) : statusTone === 'read' ? (
      <span>
        Reads <b>https://{site}</b> against your {formatWords(contractText) ?? 'contract'}, {kb(utf8Bytes(contractText))}
      </span>
    ) : null;

  // ── The instrument ──
  const landed = ending.kind === 'landed' && result ? result : null;
  const unreachable = !!landed?.unreachable;
  const outcomes = landed && !unreachable ? toOutcomes(landed.checks) : {};
  const layerScore = (l?: Layer | null) => (l && typeof l.score === 'number' ? l.score : null);
  const engines: EngineBlock[] = [
    {
      key: 'fidelity',
      name: 'Contract fidelity',
      count: fidelityIds.length,
      ids: fidelityIds,
      score: landed && !unreachable ? layerScore(landed.fidelity) : null,
      asks: 'Reads your contract: palette, type scale, line heights, radius, spacing, contrast pairs, aliases and token use.',
    },
    {
      key: 'baseline',
      name: 'Baseline',
      count: baselineIds.length,
      ids: baselineIds,
      score: landed && !unreachable ? layerScore(landed.baseline) : null,
      asks: 'Reads no contract: focus rings, reduced motion, headings, inputs, button and link copy, identity.',
    },
  ];

  const instPhase: Phase =
    busy ? 'running'
      : landed ? (unreachable ? 'error' : 'done')
        : ending.kind === 'request' ? 'error'
          : 'idle';
  const runSite = ran.current?.site ?? '';
  const target = busy || landed || ending.kind !== 'none' ? runSite : looksLikeSite(url) ? site : '';

  const restPair = (note: string) => (
    <>
      <div className="cf-pair">
        <LayerReadout id={`${uid}-fid`} label="Contract fidelity" line={FID_LINE} rest />
        <LayerReadout id={`${uid}-base`} label="Baseline" line={BASE_LINE} rest />
      </div>
      <p className="eg-side-note">{note}</p>
    </>
  );

  const contractName = landed?.ownContract?.name || 'your contract';
  const tokenCount = landed?.ownContract?.tokens
    ? ['colors', 'typography', 'radii', 'spacing', 'sizes', 'durations', 'easings'].reduce((n, k) => n + (landed.ownContract!.tokens![k] ?? 0), 0)
    : null;

  const sides: Partial<Record<Phase, ReactNode>> = {
    idle: (
      <>
        {restPair(ending.kind === 'rejected' ? 'Nothing was scored. Both numbers wait for a contract that meets the minimum.' : 'Run a page against your contract and both numbers land here, side by side.')}
        {MINIMUM_CARD}
      </>
    ),
    running: (
      <>
        <span className="eg-label">Checking</span>
        <div className="eg-running">
          <p className="eg-running-line">Scoring {runSite} against your contract</p>
        </div>
        {restPair('Both numbers land here when the run ends, usually within 3 to 8 seconds.')}
      </>
    ),
    done: landed ? (
      <div className="cf-pair">
        <LayerReadout id={`${uid}-fid`} label="Contract fidelity" line={FID_LINE} layer={landed.fidelity ?? null} />
        <LayerReadout id={`${uid}-base`} label="Baseline" line={BASE_LINE} layer={landed.baseline ?? null} />
      </div>
    ) : undefined,
    error: unreachable ? (
      <>
        <div className="cf-pair">
          <LayerReadout id={`${uid}-fid`} label="Contract fidelity" line="The site could not be read." layer={landed!.fidelity ?? null} />
          <LayerReadout id={`${uid}-base`} label="Baseline" line="The site could not be read." layer={landed!.baseline ?? null} />
        </div>
        <div className="cf-unreachable">
          <p>{landed!.unreachableDetail}</p>
          <p>
            Your contract was read and is valid: {contractName}
            {tokenCount !== null ? `, ${tokenCount} tokens` : ''}. It is still in the form above.
          </p>
          <button type="button" className="eg-share-btn" onClick={() => start()}>
            Try again
          </button>
        </div>
      </>
    ) : (
      <>
        <span className="eg-label">No result</span>
        <p className="eg-side-note">Nothing was scored. The notice above says why, and your inputs are still in the form.</p>
      </>
    ),
  };

  const rows: Step[] | null = busy ? stepList(runSite, 'running') : landed && !unreachable ? stepList(runSite, 'done') : null;
  const faceBottom = busy ? (
    <div className="cf-what">
      <span className="eg-label">This run</span>
      <StepRows rows={rows!} />
    </div>
  ) : landed && !unreachable ? (
    <div className="cf-what">
      <span className="eg-label">This run</span>
      <StepRows rows={rows!} />
    </div>
  ) : unreachable ? (
    <WhatRows
      label="What the run read"
      rows={[
        ['Contract', <span key="c">{contractName}<small>{howWord(ran.current?.source ?? source)} · valid</small></span>],
        ['Site', <span key="s"><span className="cf-mono">{runSite}</span><small>could not be read</small></span>],
        ['Coverage', <span key="v" data-state="waiting">Not measured: no page to search</span>],
      ]}
    />
  ) : ending.kind === 'rejected' ? (
    <WhatRows
      label="What the run read"
      rows={[
        ['Contract', <span key="c">Not accepted<small>{formatWords(ran.current?.text ?? '') ?? 'Format not recognized'} · {ran.current?.how}</small></span>],
        ['Site', <span key="s" data-state="waiting">Not fetched</span>],
        ['Coverage', <span key="v" data-state="waiting">Not measured</span>],
      ]}
    />
  ) : (
    <WhatRows
      label="What the run reads"
      rows={[
        ['Contract', <span key="c" data-state="waiting">Paste, upload or link a DESIGN.md or DTCG file</span>],
        ['Site', <span key="s" data-state="waiting">A public page, read as HTML and CSS without running JavaScript</span>],
        ['Coverage', <span key="v" data-state="waiting">Your declared tokens, located by value and by CSS variable name</span>],
      ]}
    />
  );

  // ── The verdict line ──
  let verdict: ReactNode = null;
  if (landed && landed.fidelity && landed.baseline) {
    const f = landed.fidelity;
    const b = landed.baseline;
    const words = unreachable
      ? VERDICT_UNREACHABLE
      : f.score === null
        ? verdictFidelityNull(b)
        : verdictWords(f, b, landed.checks ?? [], titles, ceilings);
    verdict = (
      <p className="score-verdict-line" tabIndex={-1} ref={verdictRef}>
        {!unreachable && <span className="sr-only">{verdictPrefix(f, b)}</span>}
        <span>{words}</span>
      </p>
    );
  }

  const hint = SOURCE_HINT[source];

  return (
    <div className="eg-bench eg-dash cf-bench" ref={benchRef}>
      <p className="sr-only" role="status" aria-live="polite">
        {said}
      </p>

      {folded && landed ? (
        <div className="eg-bar cf-run" role="region" aria-label="This run">
          <div className="cf-run-line">
            <p className="cf-run-what">
              {GLOBE}
              <span className="cf-run-url">{runSite}</span>
              <span className="cf-run-contract">
                against <b>{contractName}</b>
                {formatWords(ran.current?.text ?? '') ? ` · ${formatWords(ran.current?.text ?? '')}` : ''} · {ran.current?.how}
              </span>
            </p>
            <div className="cf-run-actions">
              <button type="button" className="eg-share-btn" onClick={editInputs}>
                Edit inputs
              </button>
              <button type="button" className="eg-share-btn" onClick={() => start()}>
                Run again
              </button>
            </div>
          </div>
        </div>
      ) : (
        <form className="eg-bar cf-bar" noValidate aria-busy={busy} aria-label="Score a page against your contract" onSubmit={submit}>
          <div className="eg-bar-line">
            <label className="eg-bar-field" data-invalid={invalid('url') || undefined}>
              {GLOBE}
              <span className="eg-bar-tag">Site URL</span>
              <input
                ref={urlRef}
                id={ids.url}
                className="eg-bar-input"
                type="text"
                inputMode="url"
                autoComplete="url"
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
                placeholder="staging.example.com"
                value={url}
                readOnly={busy}
                aria-invalid={invalid('url') || undefined}
                aria-describedby={describedBy('url')}
                onChange={(e) => {
                  setUrl(e.target.value);
                  clearError('url');
                }}
              />
            </label>
          </div>

          <div className="m3-head">
            <Segmented<Source>
              label="Your contract"
              value={source}
              onChange={(v) => {
                setSource(v);
                clearError('contract');
              }}
              options={SOURCES}
              disabled={busy}
            />
            <p className="cf-readas" role="status" aria-live="polite">
              {reading && (
                <>
                  <Lamp status={reading.known ? (ending.kind === 'rejected' ? 'FAIL' : 'PASS') : undefined} />
                  <span>{reading.label}</span>
                </>
              )}
            </p>
          </div>
          <p className="cf-src-hint" id={ids.hint}>
            {hint}
          </p>

          {source === 'paste' && (
            <label className="eg-bar-field is-area" data-invalid={invalid('contract') || undefined}>
              <span className="sr-only">Contract text</span>
              <textarea
                ref={textRef}
                id={ids.text}
                className="eg-bar-input m3-textarea"
                rows={10}
                wrap="off"
                spellCheck={false}
                placeholder={PASTE_PLACEHOLDER}
                value={text}
                readOnly={busy}
                aria-invalid={invalid('contract') || undefined}
                aria-describedby={describedBy('contract', true)}
                onChange={(e) => {
                  setText(e.target.value);
                  clearError('contract');
                }}
              />
            </label>
          )}

          {source === 'upload' && (
            <div
              className="cf-drop"
              data-invalid={invalid('contract') || undefined}
              data-drag={drag || undefined}
              onDragOver={(e) => {
                e.preventDefault();
                setDrag(true);
              }}
              onDragLeave={() => setDrag(false)}
              onDrop={onDrop}
            >
              <span>Drop a DESIGN.md or tokens.json here.</span>
              <button
                ref={chooseRef}
                id={ids.choose}
                type="button"
                className="eg-share-btn"
                disabled={busy}
                aria-describedby={describedBy('contract', true)}
                onClick={() => fileRef.current?.click()}
              >
                Choose file
              </button>
              <input
                ref={fileRef}
                type="file"
                accept=".md,.json,text/markdown,application/json"
                hidden
                tabIndex={-1}
                onChange={(e) => {
                  acceptFile(e.target.files?.[0]);
                  e.target.value = '';
                }}
              />
              {file && (
                <span className="cf-drop-file">
                  Selected: {file.name}, {kb(file.size)}
                </span>
              )}
            </div>
          )}

          {source === 'link' && (
            <div className="eg-bar-line">
              <label className="eg-bar-field" data-invalid={invalid('contract') || undefined}>
                {GLOBE}
                <span className="eg-bar-tag">Contract URL</span>
                <input
                  ref={linkRef}
                  id={ids.link}
                  className="eg-bar-input"
                  type="text"
                  inputMode="url"
                  autoCapitalize="none"
                  autoCorrect="off"
                  spellCheck={false}
                  placeholder="https://example.com/DESIGN.md"
                  value={link}
                  readOnly={busy}
                  aria-invalid={invalid('contract') || undefined}
                  aria-describedby={describedBy('contract', true)}
                  onChange={(e) => {
                    setLink(e.target.value);
                    clearError('contract');
                  }}
                />
              </label>
            </div>
          )}

          <details className="eg-more cf-map" open={mapOpen} onToggle={(e) => setMapOpen((e.currentTarget as HTMLDetailsElement).open)}>
            <summary>
              Map tokens to CSS variables <small>optional</small>
            </summary>
            <div className="eg-more-body">
              <p className="cf-map-hint">Use this when your CSS variables have different names from your contract. Mapped tokens count as located by name.</p>
              <label className="eg-bar-field is-area" data-invalid={invalid('map') || undefined}>
                <span className="sr-only">Token map, JSON</span>
                <textarea
                  ref={mapRef}
                  id={ids.map}
                  className="eg-bar-input m3-textarea"
                  rows={2}
                  wrap="off"
                  spellCheck={false}
                  placeholder={TOKEN_MAP_PLACEHOLDER}
                  value={mapText}
                  readOnly={busy}
                  aria-invalid={invalid('map') || undefined}
                  aria-describedby={describedBy('map')}
                  onChange={(e) => {
                    setMapText(e.target.value);
                    clearError('map');
                  }}
                />
              </label>
            </div>
          </details>

          <div className="m3-go">
            <div className="eg-bar-status" id={ids.status} data-tone={statusTone}>
              <span className="eg-bar-note" data-off={statusTone !== 'note' || undefined}>
                {PRIVACY_NOTE}
              </span>
              {statusLive && (
                <span className="eg-bar-live">
                  {statusTone === 'warn' && WARN}
                  <span>{statusLive}</span>
                </span>
              )}
            </div>
            <button ref={goRef} type="submit" className="eg-bar-go" aria-busy={busy} data-cuelume-press="sparkle">
              <span className="eg-go-l" aria-hidden={busy || undefined}>
                Score against my contract
                <svg className="eg-go-glyph" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M4 10h11M11 5.5 15.5 10 11 14.5" />
                </svg>
              </span>
              <span className="eg-go-l is-busy" aria-hidden={!busy || undefined}>
                <i className="eg-go-spin" aria-hidden="true" />
                Scoring
              </span>
            </button>
          </div>
        </form>
      )}

      {ending.kind === 'rejected' && (
        <ContractProblems
          ref={problemsRef}
          problems={ending.problems}
          warnings={ending.warnings}
          text={ran.current?.source !== 'link' ? ran.current?.text ?? '' : ''}
          linter={ending.linter}
          onEdit={editContract}
        />
      )}

      {!folded && (
        <p className="cf-aside">
          <Link href="/score">Score with the Designesy contract instead</Link>
        </p>
      )}

      {ending.kind === 'request' && (
        <div className="cf-panel cf-notice" role="alert">
          <p className="cf-notice-title">{ending.title}</p>
          <p>{ending.message}</p>
        </div>
      )}

      {verdict}

      <Instrument
        name="Your contract"
        registry={registry}
        face="engines"
        engines={engines}
        enginesLabel="Two registers"
        enginesHint="One reads your contract. The other reads no contract at all."
        phase={instPhase}
        target={target}
        idleTarget="waiting for a URL and a contract"
        outcomes={outcomes}
        verdict={null}
        landed={!!landed && !unreachable}
        ignite
        quiet
        roving
        phaseSides={sides}
        faceBottom={faceBottom}
        stateText={{
          idle: `${total} checks · ${ending.kind === 'rejected' ? 'not run' : 'ready'}`,
          running: `reading ${total} checks`,
          error: `${total} checks · stopped`,
        }}
        scoring="fidelity reads your contract · baseline reads none · never blended"
        restNote=""
      />

      {landed && lintLine(landed.ownContract?.linter) && <LintLine lint={lintLine(landed.ownContract?.linter)!} className="cf-lint-run" />}

      {busy && (
        <ul className="cf-skeleton" aria-hidden="true">
          <li />
          <li />
          <li />
        </ul>
      )}
    </div>
  );
}
