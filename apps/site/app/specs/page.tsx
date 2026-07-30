import type { Metadata } from 'next';
import Link from 'next/link';
import { Topbar } from '../lib/topbar';
import { Footer } from '../lib/footer';
import { CheckGrid } from '../lib/check-grid';
import { checkItemsFromStrings } from '../lib/check-items';
import { pageMeta } from '../lib/site-meta';

export const metadata: Metadata = pageMeta({
  title: 'Specs',
  description:
    'Designesy Specs — the canonical format for design verification findings. One JSON schema that any verification tool can populate. Agents consuming findings from multiple verifiers need a common schema.',
  path: '/specs',
  ogDescription:
    'The canonical review-findings schema. designesy, Google design.md, Lighthouse, and jakubkrehel/skills all map into it.',
  twitterDescription:
    'Design verification findings schema — designesy.org/specs',
});

const SCHEMA_FIELDS = [
  { field: 'schemaVersion', type: 'string', desc: 'Schema version (currently "1.0").' },
  { field: 'generatedAt', type: 'date-time', desc: 'ISO 8601 timestamp.' },
  { field: 'tool', type: 'object', desc: 'Tool name, version, user agent.' },
  { field: 'subject', type: 'object', desc: 'The artifact under review (url, file, token-spec).' },
  { field: 'config', type: 'object', desc: 'Tool configuration (ruleset, thresholds, categories).' },
  { field: 'coverage', type: 'array', desc: 'Scope and coverage table (jakubkrehel pattern).' },
  { field: 'categories', type: 'array', desc: 'Category scores (designesy categoryScores, Lighthouse categories).' },
  { field: 'findings', type: 'array', desc: 'Individual check findings — the core payload.' },
  { field: 'consideredButRejected', type: 'array', desc: 'Findings considered but rejected (jakubkrehel).' },
  { field: 'verification', type: 'array', desc: 'Verification steps taken (jakubkrehel).' },
  { field: 'summary', type: 'object', desc: 'Composite score, grade, counts by status and severity.' },
  { field: 'verdict', type: 'string', desc: 'Overall verdict: pass, fail, block, needs-changes, approve, not-scored.' },
  { field: 'runtimeError', type: 'object', desc: 'Fatal error if the tool could not complete.' },
  { field: 'runWarnings', type: 'array', desc: 'Non-fatal warnings during the run.' },
  { field: 'raw', type: 'object', desc: 'Native tool output preserved verbatim for lossless round-trip.' },
];

const FINDING_FIELDS = [
  { field: 'id', type: 'string', desc: 'Check identifier (v01-v37, audit id, rule name).' },
  { field: 'item', type: 'string', desc: 'Human-readable check name.' },
  { field: 'category', type: 'string', desc: 'Check category (cadence, accessibility, motion, etc.).' },
  { field: 'severity', type: 'string', desc: 'Normalized severity (pass/fail/warn/skip/error/warning/info/high/medium/low).' },
  { field: 'severityRaw', type: 'string', desc: 'Native severity token verbatim.' },
  { field: 'message', type: 'string', desc: 'Finding detail / explanation.' },
  { field: 'remediation', type: 'string', desc: 'How to fix this finding.' },
  { field: 'path', type: 'string', desc: 'Dotted token path (Google design.md).' },
  { field: 'location', type: 'string', desc: 'Source location (jakubkrehel: "src/Dialog.tsx:42").' },
  { field: 'domain', type: 'string', desc: 'Review domain (jakubkrehel: accessibility, layout, etc.).' },
  { field: 'before', type: 'string', desc: 'Current implementation (jakubkrehel).' },
  { field: 'after', type: 'string', desc: 'Actionable replacement (jakubkrehel).' },
  { field: 'why', type: 'string', desc: 'Violated principle + user impact (jakubkrehel).' },
  { field: 'score', type: 'number|null', desc: 'Numeric score 0-1 (Lighthouse).' },
  { field: 'numericValue', type: 'number', desc: 'Raw metric value (Lighthouse: ms, bytes).' },
  { field: 'weight', type: 'number', desc: 'Check weight in the category.' },
];

const EMISSION_FORMATS = [
  {
    format: 'designesy',
    desc: 'The native designesy shape — the current response with score, grade, checks, categoryScores.',
    contentType: 'application/json',
    example: '{ "ok": true, "score": 99.1, "grade": "A", "checks": [...] }',
  },
  {
    format: 'canonical',
    desc: 'The full review-findings.json schema — the superset with all fields. The source of truth.',
    contentType: 'application/json',
    example: '{ "schemaVersion": "1.0", "tool": { "name": "designesy" }, "findings": [...] }',
  },
  {
    format: 'review',
    desc: 'jakubkrehel better-interface-compatible markdown report — Scope, Findings table, Verdict.',
    contentType: 'text/markdown',
    example: '## Scope and Coverage\n| Domain | Evidence | Result |\n...\n## Verdict\n**Approve**',
  },
  {
    format: 'google',
    desc: 'Google @google/design.md-compatible shape — { findings, summary, designSystem }.',
    contentType: 'application/json',
    example: '{ "findings": [...], "summary": { "errors": 0, "warnings": 1 }, "designSystem": null }',
  },
];

const SEVERITY_MAP = [
  { tool: 'designesy', native: 'PASS', canonical: 'pass' },
  { tool: 'designesy', native: 'FAIL', canonical: 'error' },
  { tool: 'designesy', native: 'WARN', canonical: 'warning' },
  { tool: 'designesy', native: 'SKIP', canonical: 'skip' },
  { tool: 'Google design.md', native: 'error', canonical: 'error' },
  { tool: 'Google design.md', native: 'warning', canonical: 'warning' },
  { tool: 'Google design.md', native: 'info', canonical: 'info' },
  { tool: 'jakubkrehel', native: 'HIGH', canonical: 'high' },
  { tool: 'jakubkrehel', native: 'MEDIUM', canonical: 'medium' },
  { tool: 'jakubkrehel', native: 'LOW', canonical: 'low' },
  { tool: 'Lighthouse', native: 'score=0 binary', canonical: 'fail' },
  { tool: 'Lighthouse', native: 'score=1 binary', canonical: 'pass' },
  { tool: 'Lighthouse', native: 'informative', canonical: 'informative' },
  { tool: 'Lighthouse', native: 'notApplicable', canonical: 'notApplicable' },
];

const WHY_STANDARD_MATTERS = [
  'Agents consuming findings from multiple verifiers need a common schema to aggregate, compare, and act',
  'Lighthouse, axe, Google design.md, and designesy all emit different JSON shapes — this schema is the union',
  'The `raw` field preserves native output for lossless round-trip when the canonical shape loses fidelity',
  'The `tool` field lets consumers route by source (designesy for contract conformance, Lighthouse for perf, axe for a11y)',
  'The `verdict` field gives CI/CD gates a single boolean: pass/fail/block/needs-changes',
  'The `severity` normalization lets agents triage across tools using one vocabulary',
];

export default function SpecsPage() {
  return (
    <>
      <Topbar scrolled />

      <main id="main-content" className="surface-page">
        <section className="surface-header fade-up">
          <p className="surface-eyebrow" data-scramble>Verification schema</p>
          <h1 className="surface-title" data-scramble>Specs</h1>
          <p className="surface-lede">
            The canonical format for design verification findings. One JSON
            schema that any verification tool can populate.
          </p>
          <p className="surface-note">
            Agents consuming findings from multiple verifiers need a common
            schema to aggregate, compare, and act. This is that schema.
          </p>
          <div className="hero-actions" style={{ marginTop: '1.75rem' }}>
            <Link
              className="button primary"
              href="/specs/review-findings.json"
              data-cuelume-press
            >
              JSON Schema
            </Link>
            <Link
              className="button ghost"
              href="/methodology"
              data-cuelume-press
            >
              Methodology
            </Link>
          </div>
        </section>

        {/* ── Why a standard matters ────────────────────────────────────────── */}
        <section className="doctrine-section fade-up">
          <h2 className="doctrine-heading">Why a standard matters</h2>
          <CheckGrid items={checkItemsFromStrings(WHY_STANDARD_MATTERS)} />
        </section>

        {/* ── Emission formats ──────────────────────────────────────────────── */}
        <section className="doctrine-section fade-up">
          <h2 className="doctrine-heading">Emission formats</h2>
          <p className="surface-note" style={{ marginBottom: '1.5rem' }}>
            POST to <code style={{ color: 'var(--ink)' }}>/api/score</code> with
            a <code style={{ color: 'var(--ink)' }}>&ldquo;format&rdquo;</code>{' '}
            field to select the output shape. The canonical JSON is the source
            of truth; the others are lossy projections.
          </p>
          <div className="token-table" role="table" aria-label="Emission formats">
            <div className="token-table-head" role="row">
              <span role="columnheader">Format</span>
              <span role="columnheader">Content-Type</span>
              <span role="columnheader">Description</span>
            </div>
            {EMISSION_FORMATS.map((f) => (
              <div className="token-table-row" role="row" key={f.format}>
                <code role="cell" style={{ fontWeight: 700, color: 'var(--ink)' }}>{f.format}</code>
                <code role="cell">{f.contentType}</code>
                <span role="cell">{f.desc}</span>
              </div>
            ))}
          </div>
        </section>

        {/* ── Top-level fields ──────────────────────────────────────────────── */}
        <section className="doctrine-section fade-up">
          <h2 className="doctrine-heading">Top-level fields</h2>
          <div className="token-table" role="table" aria-label="Top-level fields">
            <div className="token-table-head" role="row">
              <span role="columnheader">Field</span>
              <span role="columnheader">Type</span>
              <span role="columnheader">Description</span>
            </div>
            {SCHEMA_FIELDS.map((f) => (
              <div className="token-table-row" role="row" key={f.field}>
                <code role="cell" style={{ fontWeight: 700, color: 'var(--ink)' }}>{f.field}</code>
                <code role="cell">{f.type}</code>
                <span role="cell">{f.desc}</span>
              </div>
            ))}
          </div>
        </section>

        {/* ── Finding fields ───────────────────────────────────────────────── */}
        <section className="doctrine-section fade-up">
          <h2 className="doctrine-heading">Finding object fields</h2>
          <p className="surface-note" style={{ marginBottom: '1.5rem' }}>
            Each entry in the <code style={{ color: 'var(--ink)' }}>findings</code>{' '}
            array is a finding object. Each tool populates the subset of fields
            it has — fields a tool does not produce are omitted.
          </p>
          <div className="token-table" role="table" aria-label="Finding fields">
            <div className="token-table-head" role="row">
              <span role="columnheader">Field</span>
              <span role="columnheader">Type</span>
              <span role="columnheader">Description</span>
            </div>
            {FINDING_FIELDS.map((f) => (
              <div className="token-table-row" role="row" key={f.field}>
                <code role="cell" style={{ fontWeight: 700, color: 'var(--ink)' }}>{f.field}</code>
                <code role="cell">{f.type}</code>
                <span role="cell">{f.desc}</span>
              </div>
            ))}
          </div>
        </section>

        {/* ── Severity normalization ─────────────────────────────────────────── */}
        <section className="doctrine-section fade-up">
          <h2 className="doctrine-heading">Severity normalization</h2>
          <p className="surface-note" style={{ marginBottom: '1.5rem' }}>
            Each tool uses its own severity vocabulary. The canonical schema
            normalizes them while preserving the native token in{' '}
            <code style={{ color: 'var(--ink)' }}>severityRaw</code>.
          </p>
          <div className="token-table" role="table" aria-label="Severity normalization">
            <div className="token-table-head" role="row">
              <span role="columnheader">Tool</span>
              <span role="columnheader">Native</span>
              <span role="columnheader">Canonical</span>
            </div>
            {SEVERITY_MAP.map((s, i) => (
              <div className="token-table-row" role="row" key={i}>
                <code role="cell">{s.tool}</code>
                <code role="cell">{s.native}</code>
                <code role="cell" style={{ fontWeight: 700, color: 'var(--ink)' }}>{s.canonical}</code>
              </div>
            ))}
          </div>
        </section>

        {/* ── Usage ────────────────────────────────────────────────────────── */}
        <section className="doctrine-section fade-up">
          <h2 className="doctrine-heading">Usage</h2>
          <div className="definition">
            <p className="definition-label">POST /api/score</p>
            <p>
              Send a JSON body with <code style={{ color: 'var(--ink)' }}>url</code>{' '}
              and optional <code style={{ color: 'var(--ink)' }}>format</code>.
              The default format is <code style={{ color: 'var(--ink)' }}>designesy</code>{' '}
              (the native shape). Use{' '}
              <code style={{ color: 'var(--ink)' }}>canonical</code> for the full
              schema, <code style={{ color: 'var(--ink)' }}>review</code> for
              markdown, or <code style={{ color: 'var(--ink)' }}>google</code>{' '}
              for the design.md-compatible shape.
            </p>
          </div>
          <div className="definition">
            <p className="definition-label">Example request</p>
            <p>
              <code style={{ color: 'var(--ink)', display: 'block', whiteSpace: 'pre-wrap', padding: '0.75rem', background: 'var(--surface)', borderRadius: 'var(--radius)', border: '1px solid var(--line)' }}>
{`curl -X POST https://www.designesy.org/api/score \\
  -H "Content-Type: application/json" \\
  -d '{"url":"https://www.designesy.org/","format":"canonical"}'`}
              </code>
            </p>
          </div>
        </section>

        <div className="status-note">
          Designesy Design Review Findings Schema v1.0 — the canonical format
          for design verification findings. JSON Schema:{' '}
          <Link href="/specs/review-findings.json">/specs/review-findings.json</Link>
          {' · '}
          Methodology:{' '}
          <Link href="/methodology">/methodology</Link>
          {' · '}
          Benchmarks:{' '}
          <Link href="/benchmarks">/benchmarks</Link>
        </div>
      </main>

      <Footer />
    </>
  );
}