'use client';

import { useRef, useState } from 'react';
import { EngineBar } from '../lib/engine/command-bar';
import { Instrument } from '../lib/engine/instrument';
import { Findings, type FindingsHandle } from '../lib/engine/findings';
import { EngineShare } from '../lib/engine/engine-share';
import { normalizeUrl, stamp, useAutoRun, useEngineRun } from '../lib/engine/use-engine-run';
import { hostOf, toOutcomes, type RegistryView } from '../lib/engine/types';

type Bundle = {
  tokens: object;
  lintConfig: object;
  agentRules: string;
  componentContract: object;
  antiPatterns: {
    inlineColors: { count: number; examples: string[]; rule: string };
    magicNumbers: { count: number; examples: string[]; rule: string };
    fabricatedTokens: { count: number; examples: string[]; rule: string };
  };
  designMd: string;
};

type GuardrailsResponse = {
  ok: boolean;
  url?: string;
  score?: number;
  grade?: string;
  pass?: number;
  warn?: number;
  fail?: number;
  total?: number;
  tokensExtracted?: number;
  bundle?: Bundle;
  checks?: { id: string; item: string; status: string; detail: string }[];
  error?: string;
};

/** Each check emits one file; this is the file's text as the viewer shows it. */
function fileText(bundle: Bundle | undefined, id: string): string {
  if (!bundle) return '';
  switch (id) {
    case 'g01': return JSON.stringify(bundle.tokens, null, 2);
    case 'g02': return JSON.stringify(bundle.lintConfig, null, 2);
    case 'g03': return bundle.agentRules || '';
    case 'g04': return JSON.stringify(bundle.componentContract, null, 2);
    case 'g05': return JSON.stringify(bundle.antiPatterns, null, 2);
    case 'g06': return bundle.designMd || '';
    default: return '';
  }
}

const bytesOf = (text: string) => new TextEncoder().encode(text).length;
const kb = (bytes: number) => (bytes < 1024 ? `${bytes} B` : `${(bytes / 1024).toFixed(1)} KB`);

function size(text: string): string {
  const lines = text ? text.split('\n').length : 0;
  return `${kb(bytesOf(text))} · ${lines} lines`;
}

export function GuardrailsForm({ initialUrl, registry }: { initialUrl: string; registry: RegistryView }) {
  const [url, setUrl] = useState(initialUrl);
  const { phase, result, scanned, error, when, run } = useEngineRun<GuardrailsResponse>('/api/guardrails', 'guardrails emitter');
  const [file, setFile] = useState('g01');
  const [copied, setCopied] = useState(false);
  const findings = useRef<FindingsHandle>(null);
  const viewer = useRef<HTMLElement>(null);

  const start = (target: string) => {
    const u = normalizeUrl(target);
    if (u) run(u, { url: u });
  };
  useAutoRun(initialUrl, start);

  const outcomes = toOutcomes(result?.checks);
  const host = scanned ? hostOf(scanned) : '';
  const byId = new Map(registry.checks.map((c) => [c.id, c]));
  const text = fileText(result?.bundle, file);
  const meta: Record<string, string> = {};
  if (result?.bundle) for (const c of registry.checks) meta[c.id] = size(fileText(result.bundle, c.id));

  // The bundle's readout in the side pane: at rest it reads 0 of 6 files and
  // 0 KB, and the run fills the same two figures in place (files written,
  // the bundle's total size), so the verdict slot holds a reading at every
  // phase instead of a dead band under the scale.
  const done = phase === 'done' && !!result;
  const written = done ? registry.checks.filter((c) => outcomes[c.id]?.status === 'PASS').length : 0;
  const bytes = done && result?.bundle ? registry.checks.reduce((n, c) => n + bytesOf(fileText(result.bundle, c.id)), 0) : 0;
  const readout = (
    <dl className="eg-figs">
      <div>
        <dt>Files written</dt>
        <dd>
          {written}
          <small> of {registry.checks.length}</small>
        </dd>
      </div>
      <div>
        <dt>Bundle size</dt>
        <dd>{bytes ? kb(bytes) : '0 KB'}</dd>
      </div>
    </dl>
  );

  const pick = (id: string) => {
    setFile(id);
    setCopied(false);
    if (phase === 'done') {
      viewer.current?.scrollIntoView({ block: 'start', behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
    }
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2200);
    } catch {
      /* clipboard refused */
    }
  };

  const download = () => {
    if (!result?.bundle) return;
    const blob = new Blob([JSON.stringify(result.bundle, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'designesy-guardrails-bundle.json';
    a.click();
    URL.revokeObjectURL(a.href);
  };

  return (
    <div className="eg-bench">
      <EngineBar
        fields={[{ value: url, onChange: setUrl, label: 'URL to emit guardrails from', placeholder: 'Any public URL, like linear.app' }]}
        onSubmit={() => start(url)}
        busy={phase === 'running'}
        go="Emit the contract"
        goBusy="Emitting"
        note="Reads the site's CSS once and writes six files an AI coding agent can follow."
      />
      <Instrument
        name="Guardrails"
        registry={registry}
        face="files"
        phase={phase}
        target={host}
        outcomes={outcomes}
        fileMeta={meta}
        selected={phase === 'done' ? file : undefined}
        // aria-controls must name an element that exists: the viewer only renders
        // once a bundle is back, so pointing at it earlier was an invalid IDREF
        // (axe aria-valid-attr-value, critical, on every g-cell).
        controls={phase === 'done' && result?.bundle ? 'eg-viewer' : undefined}
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
            <p><b>{host || 'This URL'}</b> could not be read.</p>
            <p>{error}</p>
          </>
        }
        scoring="written 1 · not written 0 · over 6 files"
        restNote="Emit from a URL and each file fills in with its size. Pick a file to read it below."
        // Where each file goes, as the last line of its own cell (it was a
        // list in the side pane, apart from the files it described): one
        // destination per file, each saying what the file does there (two
        // pairs used to share a sentence word for word).
        fileWhere={{
          g01: 'Your design repo, as the one source of values.',
          g02: 'CI, so an off-token value fails the build.',
          g03: 'The repo root, where coding agents look first.',
          g04: 'Beside AGENTS.md: the tokens each prop may take.',
          g05: 'Beside AGENTS.md: the inline values and invented tokens to remove.',
          g06: 'The repo root, as the design brief any agent can read.',
        }}
        restCard={
          <>
            {readout}
            <div className="eg-ref">
              <p className="eg-ref-note">The grade counts files written. It says nothing about the design itself; the contract score does.</p>
            </div>
          </>
        }
        onOpen={(id) => (phase === 'done' ? pick(id) : undefined)}
        sideExtra={
          phase === 'done' && scanned ? (
            <>
              {readout}
              <EngineShare path={`/guardrails?url=${encodeURIComponent(scanned)}`} text={`Designesy guardrails: ${host}`} label="Share this result" />
            </>
          ) : null
        }
      />
      {phase === 'done' && result?.bundle && (
        <section className="eg-section" aria-labelledby="eg-bundle-h" ref={viewer}>
          <div className="eg-section-head">
            <div>
              <h2 className="eg-h2" id="eg-bundle-h">The bundle</h2>
              <p className="eg-section-sub">
                Six files from {host}
                {typeof result.tokensExtracted === 'number' ? ` · ${result.tokensExtracted} tokens` : ''}
                {when ? ` · ${stamp(when)}` : ''}
              </p>
            </div>
          </div>
          <div className="eg-viewer" id="eg-viewer" role="region" aria-label={`${byId.get(file)?.file ?? 'File'} contents`}>
            <div className="eg-viewer-head">
              <span className="eg-viewer-name">
                {byId.get(file)?.file}
                <small>{file} · {meta[file]}</small>
              </span>
              <span className="eg-viewer-actions">
                <button type="button" className="eg-share-btn" onClick={copy} aria-live="polite">
                  {copied ? 'Copied' : 'Copy file'}
                </button>
                <button type="button" className="eg-share-btn" onClick={download}>
                  Download bundle
                </button>
              </span>
            </div>
            <pre className="eg-code" tabIndex={0}>
              <code>{text}</code>
            </pre>
          </div>
        </section>
      )}
      {phase === 'done' && result && (
        <Findings
          ref={findings}
          registry={registry}
          outcomes={outcomes}
          sub={[`${result.total ?? registry.checks.length} files from ${host}`, stamp(when)].filter(Boolean).join(' · ')}
        />
      )}
    </div>
  );
}
