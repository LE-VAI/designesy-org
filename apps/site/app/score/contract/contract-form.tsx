'use client';

// /score/contract: the bench. The slab (a URL well, the contract by paste,
// upload or link, an optional token map), the run, and what the run ends in:
// a result (the verdict line, the two numbers, the first finding, both check
// lists and the receipt), an empty run (no score for either number), a
// rejected contract (422, the problems panel), or a request that got no
// result (the W10 card). One polite live region, present from first paint,
// carries every announcement; the instrument draws none of its own.
//
// The contract's text stays in this component's memory. It never enters a
// URL, storage or analytics: only a linked contract can be deep-linked, and
// the deep link carries its address, never its text.

import Link from 'next/link';
import { useEffect, useId, useRef, useState, type CSSProperties, type DragEvent, type FormEvent, type ReactNode } from 'react';
import { Segmented } from '../../lib/engine/command-bar';
import { Instrument, Lamp, type EngineBlock } from '../../lib/engine/instrument';
import { bringIntoView } from '../../lib/engine/bring-into-view';
import { normalizeUrl, useAutoRun, useEngineRun } from '../../lib/engine/use-engine-run';
import { toOutcomes, type Phase, type RegistryView } from '../../lib/engine/types';
import { MIN_COLORS, MIN_TYPE_STYLES } from '../../lib/own-contract/limits';
import { ScoreEmptyRun } from '../score-empty-run';
import { ContractProblems, LintLine } from './contract-problems';
import { ContractReadout, ReadoutPair } from './contract-readout';
import { CheckList, type CheckDef, type FindingsHandle } from './contract-findings';
import { ContractReceipt } from './contract-receipt';
import { FirstFinding } from './first-finding';
import {
  ANNOUNCE,
  EDITING_WITH_PREVIOUS,
  FIELD_ERROR,
  PASTE_PLACEHOLDER,
  PREVIOUS_SAID,
  PRIVACY_NOTE,
  SOURCE_HINT,
  TOKEN_MAP_PLACEHOLDER,
  VERDICT_UNREACHABLE,
  capFlag,
  caretLine,
  contractOk,
  emptyRun,
  fileTooLarge,
  firstFindingOf,
  formatWords,
  gapsFlag,
  howWord,
  isFidelity,
  kb,
  leaderboardFlag,
  lineOffset,
  lintLine,
  looksLikeContractUrl,
  looksLikeSite,
  overLimit,
  readAs,
  readAt,
  receiptText,
  requestError,
  seconds,
  siteKey,
  steps as stepList,
  tokenTotal,
  utf8Bytes,
  verdictFidelityNull,
  verdictPrefix,
  verdictWords,
  whyLine,
  type ContractProblem,
  type Coverage,
  type LayerResult,
  type LinterTotals,
  type ResultCheck,
  type Source,
  type Step,
  type Thresholds,
} from './copy';

type Layer = LayerResult & { nullReason?: { code: string; detail?: string } | null };

type ContractResponse = {
  ok: boolean;
  error?: string;
  engineVersion?: string;
  contractVersion?: string;
  fidelity?: Layer;
  baseline?: Layer;
  checks?: ResultCheck[];
  coverage?: Coverage | null;
  ownContract?: {
    name?: string | null;
    format?: string;
    formatVersion?: string | null;
    source?: 'inline' | 'url';
    url?: string;
    bytes?: number;
    digest?: string;
    tokens?: Record<string, number>;
    linter?: LinterTotals | null;
  };
  site?: { requestedUrl?: string; cssBytes?: number; stylesheetsFetched?: number; stylesheetsTotal?: number; stylesheetsTruncated?: boolean };
  receipt?: { digest?: string | null; retrieved_at?: string; own_contract?: { digest?: string } };
  unreachable?: boolean;
  unreachableDetail?: string;
};

/** What the page knows before any run, from the published formula and the registry (page.tsx). */
export type ResultsSetup = {
  defs: Record<string, CheckDef>;
  thresholds: Thresholds;
  /** Baseline: the weight the static engine can score (57). */
  staticMax: number;
  /** "How both numbers are calculated": the rule, then each layer's weights. */
  calc: { rule: string; fidelity: string; baseline: string };
  /** "What does not run against your contract": the lab checks' count and ids. */
  leftOut: { count: number; ids: string };
};

type FieldKey = 'url' | 'contract' | 'map';
type FieldError = { field: FieldKey; message: string };

/** What the last run ended in, as the page draws it. */
type Ending =
  | { kind: 'none' }
  | { kind: 'landed'; took: string }
  | { kind: 'rejected'; problems: ContractProblem[]; warnings: ContractProblem[]; linter: LinterTotals | null }
  | { kind: 'request'; title: string; message: string };

type Ran = { site: string; url: string; how: 'pasted' | 'uploaded' | 'linked'; source: Source; text: string; link: string };

/** A landed answer, by what it can show: two numbers, fidelity with no
    score, nothing to read (the site), or nothing to compare (an empty run). */
type LandedKind = 'scored' | 'fidelity-null' | 'unreachable' | 'empty';

function landedKind(r: ContractResponse): LandedKind {
  if (r.unreachable) return 'unreachable';
  const code = r.fidelity?.nullReason?.code;
  if (code === 'empty_shell' || code === 'no_css') return 'empty';
  if (r.fidelity?.score === null || r.fidelity?.score === undefined) return 'fidelity-null';
  return 'scored';
}

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

/** Coverage, as one bar of the declared total: located by name (a map or a
    CSS variable name), by value, and not located. Neutral ink: coverage is a
    reading, never a pass or a fail. The numbers are text in the key. */
function CoverageMeter({ c }: { c: Coverage }) {
  const name = c.byName + c.byMap;
  const none = Math.max(0, c.declared - name - c.byValue);
  return (
    <span className="cf-coverage">
      <span>
        Located {name + c.byValue} of {c.declared} declared tokens
      </span>
      <span className="cf-meter" aria-hidden="true">
        <i className="is-name" style={{ '--w': name } as CSSProperties} />
        <i className="is-value" style={{ '--w': c.byValue } as CSSProperties} />
        <i className="is-none" style={{ '--w': none } as CSSProperties} />
      </span>
      <span className="cf-meter-key">
        <span>
          <i className="is-name" aria-hidden="true" />
          <b>{name}</b> by name
        </span>
        <span>
          <i className="is-value" aria-hidden="true" />
          <b>{c.byValue}</b> by value
        </span>
        <span>
          <i className="is-none" aria-hidden="true" />
          <b>{none}</b> not located
        </span>
      </span>
    </span>
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
  minScored,
  setup,
}: {
  initialUrl: string;
  initialContract: string;
  registry: RegistryView;
  fidelityIds: string[];
  baselineIds: string[];
  titles: Record<string, string>;
  ceilings: Record<string, number>;
  minScored: number;
  setup: ResultsSetup;
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
  const ran = useRef<Ran | null>(null);
  // A result kept below the reopened form after Edit inputs, until the next run lands.
  const [prev, setPrev] = useState<{ result: ContractResponse; ran: Ran } | null>(null);

  const urlRef = useRef<HTMLInputElement>(null);
  const textRef = useRef<HTMLTextAreaElement>(null);
  const linkRef = useRef<HTMLInputElement>(null);
  const mapRef = useRef<HTMLTextAreaElement>(null);
  const chooseRef = useRef<HTMLButtonElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const goRef = useRef<HTMLButtonElement>(null);
  const verdictRef = useRef<HTMLParagraphElement>(null);
  const problemsRef = useRef<HTMLHeadingElement>(null);
  const cardRef = useRef<HTMLParagraphElement>(null);
  const benchRef = useRef<HTMLDivElement>(null);
  const fidList = useRef<FindingsHandle>(null);
  const baseList = useRef<FindingsHandle>(null);
  const prevFid = useRef<FindingsHandle>(null);
  const prevBase = useRef<FindingsHandle>(null);

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
    ran.current = { site: siteKey(site), url: site, how, source, text: contractText, link: link.trim() };
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
      // Any landing replaces a kept previous run.
      setPrev(null);
      setEnding({ kind: 'landed', took });
      setFolded(true);
      const k = landedKind(result);
      announce(k === 'unreachable' || k === 'empty' ? ANNOUNCE.stopped(took) : ANNOUNCE.finished(took));
      return;
    }
    if (phase === 'error' && failure) {
      if (failure.status === 422 && failure.problems?.length) {
        setPrev(null);
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
  // landing, the card's title for an empty run, the panel heading for a
  // rejected contract. A request error leaves focus on the key that was pressed.
  useEffect(() => {
    const k = ending.kind === 'landed' && result ? landedKind(result) : null;
    const el = k === 'empty' ? cardRef.current : k ? verdictRef.current : ending.kind === 'rejected' ? problemsRef.current : null;
    if (!el) return;
    el.focus({ preventScroll: true });
    bringIntoView(el);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ending]);

  // ── Actions after a run ──
  const editInputs = (focus: 'url' | 'map' = 'url') => {
    const keep = ending.kind === 'landed' && result && ran.current && (landedKind(result) === 'scored' || landedKind(result) === 'fidelity-null');
    if (keep) setPrev({ result: result!, ran: ran.current! });
    setFolded(false);
    setEnding({ kind: 'none' });
    announce(keep ? EDITING_WITH_PREVIOUS : ANNOUNCE.editing);
    if (focus === 'map') setMapOpen(true);
    window.setTimeout(() => {
      if (focus === 'map') {
        mapRef.current?.focus();
        return;
      }
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

  // ── A landed result, drawn for the live run or for a kept previous run ──
  const restPair = (note: string) => (
    <>
      <ReadoutPair>
        <ContractReadout id={`${uid}-fid`} label="Contract fidelity" line={FID_LINE} kind="rest" />
        <ContractReadout id={`${uid}-base`} label="Baseline" line={BASE_LINE} kind="rest" />
      </ReadoutPair>
      <p className="eg-side-note">{note}</p>
    </>
  );

  const engines = (r: ContractResponse | null): EngineBlock[] => {
    const scoreOf = (l?: Layer | null) => (r && !r.unreachable && l && typeof l.score === 'number' ? l.score : null);
    return [
      {
        key: 'fidelity',
        name: 'Contract fidelity',
        count: fidelityIds.length,
        ids: fidelityIds,
        score: scoreOf(r?.fidelity),
        asks: 'Reads your contract: palette, type scale, line heights, radius, spacing, contrast pairs, aliases and token use.',
      },
      {
        key: 'baseline',
        name: 'Baseline',
        count: baselineIds.length,
        ids: baselineIds,
        score: scoreOf(r?.baseline),
        asks: 'Reads no contract: focus rings, reduced motion, headings, inputs, button and link copy, identity.',
      },
    ];
  };

  const formatOf = (r: ContractResponse, rn: Ran) =>
    r.ownContract?.format === 'dtcg' ? 'DTCG tokens' : r.ownContract?.format === 'design.md' ? 'DESIGN.md' : formatWords(rn.text) ?? 'contract';

  /** Everything a landed answer draws: the verdict line, the instrument's side,
      its full-width first finding and face rows, the lists and the receipt. */
  const resultParts = (r: ContractResponse, rn: Ran, idp: string, previous: boolean) => {
    const k = landedKind(r);
    const f = r.fidelity!;
    const b = r.baseline!;
    const checks = r.checks ?? [];
    const fidChecks = fidelityIds.map((id) => checks.find((c) => c.id === id)).filter((c): c is ResultCheck => !!c);
    const baseChecks = baselineIds.map((id) => checks.find((c) => c.id === id)).filter((c): c is ResultCheck => !!c);
    const name = r.ownContract?.name || 'your contract';
    const tokens = tokenTotal(r.ownContract?.tokens);
    const lists = { fid: previous ? prevFid : fidList, base: previous ? prevBase : baseList };
    const openRow = (id: string) => (isFidelity({ id }) ? lists.fid : lists.base).current?.open(id);
    const verdictId = `${idp}cf-verdict`;

    // The verdict line: the approved sentences, built from this run's counts.
    let verdict: ReactNode = null;
    if (k !== 'empty') {
      const words = k === 'unreachable' ? VERDICT_UNREACHABLE : k === 'fidelity-null' ? verdictFidelityNull(b) : verdictWords(f, b, checks, titles, ceilings);
      verdict = (
        <p className="score-verdict-line" tabIndex={-1} ref={previous ? undefined : verdictRef} id={verdictId}>
          {previous && <span className="sr-only">{PREVIOUS_SAID}</span>}
          {k !== 'unreachable' && <span className="sr-only">{verdictPrefix(f, b)}</span>}
          <span>{words}</span>
        </p>
      );
    }

    // The side: both readouts, then what bounds them.
    const pair = (
      <ReadoutPair>
        <ContractReadout
          id={`${idp}cf-fid-h`}
          label="Contract fidelity"
          line={k === 'unreachable' || k === 'empty' ? (k === 'unreachable' ? 'The site could not be read.' : 'Nothing on this page to compare.') : k === 'fidelity-null' ? 'Too few of your checks could run on this page.' : FID_LINE}
          layer={f}
          kind={k === 'scored' ? 'scored' : 'none'}
          min={minScored}
        />
        <ContractReadout
          id={`${idp}cf-base-h`}
          label="Baseline"
          line={k === 'unreachable' ? 'The site could not be read.' : k === 'empty' ? 'Nothing on this page to measure.' : BASE_LINE}
          layer={b}
          kind={b.score !== null && b.grade !== null && k !== 'unreachable' && k !== 'empty' ? 'scored' : 'none'}
          min={minScored}
        />
      </ReadoutPair>
    );

    let side: ReactNode;
    if (k === 'unreachable' || k === 'empty') {
      const copy = emptyRun(k === 'unreachable' ? 'site_unreachable' : f.nullReason?.code ?? '', {
        detail: r.unreachableDetail,
        stylesheetsTotal: r.site?.stylesheetsTotal,
        stylesheetsFetched: r.site?.stylesheetsFetched,
      });
      side = (
        <>
          {pair}
          <ScoreEmptyRun
            url={rn.site}
            reason={copy.reason}
            eyebrow={copy.eyebrow}
            title={copy.title}
            contractLine={contractOk(name, tokens)}
            todo={copy.todo}
            actionLabel={copy.action}
            titleRef={k === 'empty' && !previous ? cardRef : undefined}
            onRetry={k === 'unreachable' ? () => start() : () => editInputs('url')}
          />
        </>
      );
    } else {
      const cap = k === 'scored' ? capFlag(f) : null;
      const gaps = k === 'scored' ? gapsFlag(fidChecks, f.scored) : null;
      const lb = leaderboardFlag(b.total);
      const flags: { status?: 'FAIL' | 'SKIP'; lead: string; text: string }[] = [];
      if (cap) flags.push({ status: 'FAIL', ...cap });
      if (gaps) flags.push({ status: 'SKIP', ...gaps });
      flags.push(lb);
      side = (
        <>
          {pair}
          <ul className="cf-flags">
            {flags.map((fl) => (
              <li className="cf-flag" key={fl.lead}>
                <Lamp status={fl.status} />
                <span>
                  <b>{fl.lead}</b> {fl.text}
                </span>
              </li>
            ))}
          </ul>
          {k === 'scored' ? (
            <details className="eg-more cf-calc">
              <summary>How both numbers are calculated</summary>
              <div className="eg-more-body">
                <p>{setup.calc.rule}</p>
                <p>
                  <b>Contract fidelity:</b> {setup.calc.fidelity}
                </p>
                <p>
                  <b>Baseline:</b> {setup.calc.baseline}
                </p>
              </div>
            </details>
          ) : (
            <div className="cf-why" role="group" aria-labelledby={`${idp}cf-why-h`}>
              <h3 id={`${idp}cf-why-h`}>Why fidelity has no score</h3>
              {r.coverage && <p>{whyLine(r.coverage)}</p>}
              <p>Common causes:</p>
              <ul>
                <li>the styles load with JavaScript, so the engine never sees them</li>
                <li>your CSS variables use other names: add a token map</li>
                <li>this page uses only a small part of your system: score a fuller page</li>
              </ul>
              {!previous && (
                <div className="cf-actions">
                  <button type="button" className="eg-share-btn" onClick={() => editInputs('map')}>
                    Add token map
                  </button>
                  <button type="button" className="eg-share-btn" onClick={() => editInputs('url')}>
                    Score another page
                  </button>
                </div>
              )}
            </div>
          )}
        </>
      );
    }

    // The first finding: a full-width row under the face and the side.
    const lead = k === 'scored' ? firstFindingOf(fidChecks) : null;
    const wide = lead ? (
      <div className="cf-wide">
        <FirstFinding check={lead} title={titles[lead.id] ?? lead.id} coverage={r.coverage ?? null} thresholds={setup.thresholds} idp={idp} onGo={openRow} />
      </div>
    ) : null;

    // What the run read: the contract, coverage and the site.
    const at = r.receipt?.retrieved_at ? readAt(r.receipt.retrieved_at) : null;
    const digest = r.ownContract?.digest ?? '';
    const contractRow = (
      <span>
        {name}
        <small>
          {formatOf(r, rn)} · {rn.how}
          {typeof r.ownContract?.bytes === 'number' ? ` · ${kb(r.ownContract.bytes)}` : ''}
          {tokens !== null ? ` · ${tokens} tokens` : ''}
          {k === 'unreachable' || k === 'empty' ? ' · valid' : digest ? <> · sha256 <span className="cf-mono">{digest.slice(0, 8)}</span></> : null}
        </small>
      </span>
    );
    const sheets = r.site && typeof r.site.stylesheetsTotal === 'number' ? `${r.site.stylesheetsFetched ?? 0} of ${r.site.stylesheetsTotal} stylesheets` : null;
    const siteRow =
      k === 'unreachable' ? (
        <span>
          <span className="cf-mono">{rn.site}</span>
          <small>could not be read</small>
        </span>
      ) : (
        <span>
          <span className="cf-mono">{rn.site}</span>
          <small>
            {at ? `read ${at.local.slice(0, 5)} ${at.local.slice(-6)}` : 'read'}
            {sheets ? ` · ${sheets}` : ''}
            {typeof r.site?.cssBytes === 'number' && r.site.cssBytes > 0 ? ` · ${kb(r.site.cssBytes)} of CSS` : ''}
          </small>
        </span>
      );
    const faceBottom = (
      <WhatRows
        label="What the run read"
        rows={[
          ['Contract', contractRow],
          ['Coverage', k === 'unreachable' ? <span key="v" data-state="waiting">Not measured: no page to search</span> : r.coverage ? <CoverageMeter c={r.coverage} /> : <span data-state="waiting">Not measured</span>],
          ['Site', siteRow],
        ]}
      />
    );

    const instPhase: Phase = k === 'unreachable' || k === 'empty' ? 'error' : 'done';
    const instrument = (
      <Instrument
        name="Your contract"
        ariaLabel={previous ? `Previous run: your contract, ${total} checks` : undefined}
        registry={registry}
        face="engines"
        engines={engines(r)}
        enginesLabel="Two registers"
        enginesHint="One reads your contract. The other reads no contract at all."
        phase={instPhase}
        target={rn.site}
        idleTarget="waiting for a URL and a contract"
        outcomes={k === 'unreachable' ? {} : toOutcomes(checks)}
        verdict={null}
        landed={!previous && instPhase === 'done'}
        ignite={!previous}
        quiet
        roving
        sideFirst
        onOpen={k === 'scored' || k === 'fidelity-null' ? openRow : undefined}
        phaseSides={{ [instPhase]: side }}
        faceBottom={faceBottom}
        wide={wide}
        stateText={{ error: `${total} checks · stopped` }}
        scoring="fidelity reads your contract · baseline reads none · never blended"
        restNote=""
      />
    );

    // Both lists and the receipt, for a run that read the page.
    const hasLists = k === 'scored' || k === 'fidelity-null';
    const say = previous ? () => {} : announce;
    const lint = lintLine(r.ownContract?.linter);
    const failing = [...fidChecks, ...baseChecks].filter((c) => c.status === 'FAIL').map((c) => ({ id: c.id, title: titles[c.id] ?? c.id }));
    const shareUrl =
      rn.how === 'linked' && typeof window !== 'undefined'
        ? `${window.location.origin}/score/contract?url=${encodeURIComponent(rn.site)}&contract=${encodeURIComponent(rn.link)}`
        : null;
    const after = hasLists ? (
      <>
        <CheckList
          ref={lists.fid}
          kind="fidelity"
          checks={fidChecks}
          defs={setup.defs}
          idp={idp}
          noScore={k === 'fidelity-null'}
          scored={f.scored}
          min={minScored}
          coverage={r.coverage ?? null}
          thresholds={setup.thresholds}
          engineVersion={r.engineVersion ?? ''}
          contractVersion={r.contractVersion ?? ''}
          staticMax={setup.staticMax}
          say={say}
          labelledBy={previous ? `${idp}cf-prev-h` : undefined}
          after={
            <details className="eg-more cf-calc cf-leftout">
              <summary>What does not run against your contract</summary>
              <div className="eg-more-body">
                <p>
                  Designesy&apos;s own lab checks ({setup.leftOut.count}), the slop deduction and the originality lift measure Designesy&apos;s taste. They are off when you score your own contract: {setup.leftOut.ids}.
                </p>
              </div>
            </details>
          }
        />
        <CheckList
          ref={lists.base}
          kind="baseline"
          checks={baseChecks}
          defs={setup.defs}
          idp={idp}
          noScore={false}
          scored={b.scored}
          min={minScored}
          coverage={r.coverage ?? null}
          thresholds={setup.thresholds}
          engineVersion={r.engineVersion ?? ''}
          contractVersion={r.contractVersion ?? ''}
          staticMax={setup.staticMax}
          say={say}
          labelledBy={previous ? `${idp}cf-prev-h` : undefined}
        />
        {digest && r.receipt?.retrieved_at && (
          <ContractReceipt
            idp={idp}
            verdictDigest={r.receipt.digest ?? null}
            contractDigest={digest}
            checkCount={checks.length}
            format={formatOf(r, rn)}
            how={rn.how}
            engineVersion={r.engineVersion ?? ''}
            contractVersion={r.contractVersion ?? ''}
            linter={r.ownContract?.linter ?? null}
            retrievedAt={r.receipt.retrieved_at}
            receiptText={receiptText({
              site: r.site?.requestedUrl ?? rn.url,
              name,
              format: formatOf(r, rn),
              contractDigest: digest,
              verdictDigest: r.receipt.digest ?? null,
              fidelity: f,
              baseline: b,
              coverage: r.coverage ?? null,
              failing,
              engineVersion: r.engineVersion ?? '',
              contractVersion: r.contractVersion ?? '',
              linter: r.ownContract?.linter ?? null,
              retrievedAt: r.receipt.retrieved_at,
            })}
            json={r}
            site={rn.site}
            shareUrl={shareUrl}
            say={say}
          />
        )}
      </>
    ) : lint ? (
      // An empty run has no receipt to carry the linter's line: it sits under the instrument.
      <LintLine lint={lint} className="cf-lint-run" />
    ) : null;

    return { verdict, instrument, after };
  };

  // ── The live instrument ──
  const landed = ending.kind === 'landed' && result ? result : null;
  const live = landed && ran.current ? resultParts(landed, ran.current, '', false) : null;
  const previous = prev ? resultParts(prev.result, prev.ran, 'prev-', true) : null;
  const runSite = ran.current?.site ?? '';

  const restInstrument = (instPhase: Phase) => {
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
      error: (
        <>
          <span className="eg-label">No result</span>
          <p className="eg-side-note">Nothing was scored. The notice above says why, and your inputs are still in the form.</p>
        </>
      ),
    };
    const faceBottom = busy ? (
      <div className="cf-what">
        <span className="eg-label">This run</span>
        <StepRows rows={stepList(runSite, 'running')} />
      </div>
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
    const target = busy || ending.kind !== 'none' ? runSite : looksLikeSite(url) ? site : '';
    return (
      <Instrument
        name="Your contract"
        registry={registry}
        face="engines"
        engines={engines(null)}
        enginesLabel="Two registers"
        enginesHint="One reads your contract. The other reads no contract at all."
        phase={instPhase}
        target={target}
        idleTarget="waiting for a URL and a contract"
        outcomes={{}}
        verdict={null}
        landed={false}
        ignite
        quiet
        roving
        sideFirst
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
    );
  };

  const restPhase: Phase = busy ? 'running' : ending.kind === 'request' ? 'error' : 'idle';
  // While inputs are open over a kept previous run, the previous run is the
  // instrument on the page; a run that starts draws the live one above it.
  const showRest = !live && !(prev && !busy && ending.kind === 'none');

  const hint = SOURCE_HINT[source];
  const summaryRan = ran.current;

  return (
    <div className="eg-bench eg-dash cf-bench" ref={benchRef}>
      <p className="sr-only" role="status" aria-live="polite">
        {said}
      </p>

      {folded && landed && summaryRan ? (
        <div className="eg-bar cf-run" role="region" aria-label="This run">
          <div className="cf-run-line">
            <p className="cf-run-what">
              {GLOBE}
              <span className="cf-run-url">{runSite}</span>
              <span className="cf-run-contract">
                against <b>{landed.ownContract?.name || 'your contract'}</b> · {formatOf(landed, summaryRan)} · {summaryRan.how}
              </span>
            </p>
            <div className="cf-run-actions">
              <button type="button" className="eg-share-btn" onClick={() => editInputs('url')}>
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

      {live ? (
        <>
          {live.verdict}
          {live.instrument}
          {live.after}
        </>
      ) : (
        showRest && restInstrument(restPhase)
      )}

      {busy && !prev && (
        <ul className="cf-skeleton" aria-hidden="true">
          <li />
          <li />
          <li />
        </ul>
      )}

      {previous && (
        <div className="cf-prev" data-prev="">
          <p className="eg-label cf-prev-label" id="prev-cf-prev-h">
            Previous run
          </p>
          {previous.verdict}
          {previous.instrument}
          {previous.after}
        </div>
      )}
    </div>
  );
}
