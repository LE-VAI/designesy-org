import type { Metadata } from 'next';
import Link from 'next/link';
import { Topbar } from '../lib/topbar';
import { Footer } from '../lib/footer';
import { CheckGrid } from '../lib/check-grid';
import { checkItemsFromStrings } from '../lib/check-items';
import { pageMeta } from '../lib/site-meta';

export const metadata: Metadata = pageMeta({
  title: 'Benchmarks',
  description:
    'Designesy vs hallmark vs slop-eval — a side-by-side benchmark of design verification engines. What each catches that the others do not, plus the wider emerging landscape.',
  path: '/benchmarks',
  ogDescription:
    'Three tools, three questions: hallmark prevents slop, slop-eval scores slop, designesy verifies contract conformance — plus the wider landscape.',
  twitterDescription:
    'Competitive benchmark — designesy.org/benchmarks',
});

/* ── Data ─────────────────────────────────────────────────────────────────── */

const TOOLS = [
  {
    name: 'designesy',
    question: 'Does this conform to the contracted design system?',
    category: 'Contract conformance verification',
    delivery: 'URL-based API + MCP tools (agent-invocable)',
    checks: '40 checks across 14 categories',
    license: 'See designesy.org',
    stars: '—',
    score: '95.3% A (self)',
    url: 'https://www.designesy.org/',
  },
  {
    name: 'hallmark',
    question: 'Does this look AI-generated?',
    category: 'Anti-slop generation gate',
    delivery: 'Agent skill (prompt-encoded rule-set)',
    checks: '57 binary gates + 6 pre-emit axes',
    license: 'MIT',
    stars: '20.5k',
    score: 'Not run (skill, not URL API)',
    url: 'https://github.com/Nutlope/hallmark',
  },
  {
    name: 'slop-eval',
    question: 'How much slop does this design contain?',
    category: 'Anti-slop evaluation skill',
    delivery: 'Agent skill (deterministic scoring script)',
    checks: '108 tells across 6 families + 2 positive axes',
    license: 'Apache-2.0',
    stars: '40 (parent repo)',
    score: 'Not run (skill, not URL API)',
    url: 'https://github.com/fabricioctelles/skills',
  },
];

const SHARED_CHECKS = [
  { designesy: 'v06, v22 — Contrast (WCAG AA + APCA)', hallmark: 'gates 40-41', slop: 'X5 (critical)' },
  { designesy: 'v03 — Focus-visible rings', hallmark: 'gate 26', slop: 'X14' },
  { designesy: 'v05 — prefers-reduced-motion', hallmark: 'gate 27', slop: '—' },
  { designesy: 'v11 — No transition:all', hallmark: 'gate 10', slop: '—' },
  { designesy: 'v28 — Reading width 45-75ch', hallmark: 'gate 25', slop: '—' },
  { designesy: 'v26 — Font family count ≤3', hallmark: 'gate 37', slop: '—' },
  { designesy: 'v02 — No horizontal scroll', hallmark: 'gate 34', slop: '—' },
  { designesy: 'v24 — Touch targets ≥44px (WCAG 2.5.8)', hallmark: 'gate 26 (partial)', slop: '—' },
];

const DESIGNESY_UNIQUE = [
  'v01 — Token values match live :root foundation (contract-to-live conformance)',
  'v08, v09, v10 — Poise/Takt lab-page verification (interaction-feel contract)',
  'v12 — will-change restricted to transform/opacity',
  'v13 — Press scale 0.96/0.985 above 0.95 floor (Takt lab)',
  'v14 — Cadence typography rules match contract',
  'v15 — Font smoothing antialiased + grayscale',
  'v16 — Rem-based scale, root 16px',
  'v17 — Line-height by role (headings 1.08, body 1.55)',
  'v18 — text-wrap: balance + pretty both present',
  'v19 — tabular-nums 8+ instances',
  'v20 — ::selection styled with var(--signal)',
  'v21 — Core Web Vitals (LCP < 2.5s, INP < 200ms, CLS < 0.1)',
  'v23 — Duration tokens present (--duration-quick through --duration-slow)',
  'x01, x02, x03 — font-synthesis, text-underline-position, skip-ink',
  'v27 — Input font-size ≥16px (iOS Safari zoom prevention)',
  'v29 — Token architecture: primitive → semantic → component layers (DSAF A1.1)',
  'v34 — AI-Disclosure Readiness (EU AI Act Art 50, effective 2026-08-02)',
  'v35 — Forced-colors readiness (@media forced-colors: active)',
  'v36 — Unicode Security: UTS #39 confusable detection in token names and CSS',
  'v37 — DESIGN.md spec-layer validation (Google @google/design.md lint integration)',
];

const COMPETITOR_UNIQUE = [
  'AI-slop aesthetic detection — purple gradients, centered heroes, fake chrome (hallmark gates 1-7, 42-43, 45, 47; slop-eval C1-C15, T1-T10, K1-K27, L1-L21)',
  'Structural variety / diversification across pages (hallmark 8, 20, 21, 32, 57; slop-eval L15, L19, L21, Axis 7)',
  'Signature & Uniqueness positive rubric (slop-eval Axis 7, 7-element formula, 3× weight)',
  'Cohesion positive rubric (slop-eval Axis 8, 4 checks)',
  'Invented metrics / fake copy detection (hallmark gate 46; slop-eval W3)',
  'Nav/footer AI fingerprint pattern-matching (hallmark 42, 43; slop-eval L14, L20, K12)',
  'Re-drawn UI chrome detection — fake browser bars, phone frames (hallmark 47; slop-eval K7, K16)',
  'Token improvisation — inline hex bypassing token block (hallmark 48; slop-eval C9, C10)',
  'Hover boop / hover-lift / hover-scale anti-patterns (hallmark 11; slop-eval M2, M4)',
  'Dead controls / fake interactivity (slop-eval M8, critical)',
  'Pre-emit self-critique — 6 axes scored 1-5 before output (hallmark)',
];

const POSITIONING = [
  'Generation → hallmark (prevent slop at emit time, 57 gates)',
  'Evaluation → slop-eval (score existing designs, 108 tells + 2 positive axes)',
  'Verification → designesy (verify contract conformance, 40 checks + MCP delivery)',
];

const DESIGNESY_MOAT = [
  'UTS #39 Unicode confusable detection — the only engine binding text-stack security into a verification contract',
  'DESIGN.md spec integration — Google\'s @google/design.md linter integrated as the spec layer',
  'Core Web Vitals — LCP/INP/CLS thresholds, no competitor checks CWV',
  'Forced-colors readiness — @media (forced-colors: active) block presence',
  'AI-disclosure compliance — EU AI Act Art 50 readiness, effective 2026-08-02',
  'Token-to-live contract conformance — verify shipped CSS against a versioned contract',
  'Cadence typography suite — 12 checks neither competitor covers',
  'Token architecture maturity — primitive → semantic → component layers (DSAF A1.1)',
  'MCP delivery — agent-invocable tools, not just a skill loaded into one IDE',
];

/* ── Page ──────────────────────────────────────────────────────────────────── */

export default function BenchmarksPage() {
  return (
    <>
      <Topbar scrolled />

      <main id="main-content" data-pagefind-body className="surface-page">
        <section className="surface-header fade-up">
          <p className="surface-eyebrow" data-scramble>Competitive benchmark</p>
          <h1 className="surface-title" data-scramble>Benchmarks</h1>
          <p className="surface-lede">
            Three tools, three questions. They do not compete — they answer
            different questions about design quality.
          </p>
          <p className="surface-note">
            Hallmark prevents slop at generation time. Slop-eval scores slop
            after the fact. Designesy verifies contract conformance. This page
            maps what each catches that the others do not.
          </p>
          <div className="hero-actions" style={{ marginTop: '1.75rem' }}>
            <Link
              className="button primary"
              href="/methodology"
              data-cuelume-press
            >
              Methodology
            </Link>
            <Link
              className="button ghost"
              href="/leaderboard"
              data-cuelume-press
            >
              Leaderboard
            </Link>
          </div>
        </section>

        {/* ── Tool comparison table ─────────────────────────────────────────── */}
        <section className="doctrine-section fade-up">
          <h2 className="doctrine-heading">The three tools</h2>
          <div className="token-table" role="table" aria-label="Tool comparison">
            <div className="token-table-head" role="row">
              <span role="columnheader">Attribute</span>
              <span role="columnheader">designesy</span>
              <span role="columnheader">hallmark</span>
              <span role="columnheader">slop-eval</span>
            </div>
            {[
              { attr: 'Question', d: 'Does this conform to the contracted design system?', h: 'Does this look AI-generated?', s: 'How much slop does this contain?' },
              { attr: 'Category', d: 'Contract conformance verification', h: 'Anti-slop generation gate', s: 'Anti-slop evaluation skill' },
              { attr: 'Delivery', d: 'URL API + MCP tools (agent-invocable)', h: 'Agent skill (prompt-encoded)', s: 'Agent skill (deterministic script)' },
              { attr: 'Checks', d: '40 across 14 categories', h: '57 binary gates + 6 pre-emit axes', s: '108 tells + 2 positive axes' },
              { attr: 'License', d: 'See designesy.org', h: 'MIT', s: 'Apache-2.0' },
              { attr: 'Stars', d: '—', h: '20.5k', s: '40 (parent repo)' },
              { attr: 'Score on designesy.org', d: '95.3% A (33/40 PASS)', h: 'Not run (no URL API)', s: 'Not run (no URL API)' },
            ].map((row) => (
              <div className="token-table-row" role="row" key={row.attr}>
                <span role="cell" style={{ fontWeight: 700, color: 'var(--ink)' }}>{row.attr}</span>
                <span role="cell">{row.d}</span>
                <span role="cell">{row.h}</span>
                <span role="cell">{row.s}</span>
              </div>
            ))}
          </div>
        </section>

        {/* ── Positioning ────────────────────────────────────────────────────── */}
        <section className="doctrine-section fade-up">
          <h2 className="doctrine-heading">They do not compete</h2>
          <div className="definition">
            <p className="definition-label">The positioning</p>
            <p>
              A complete design quality pipeline uses all three: hallmark to
              generate, slop-eval to catch slop, designesy to verify the
              contract. They occupy different positions on the design-verification
              spectrum — not the same position.
            </p>
          </div>
          <div className="principle-list">
            {POSITIONING.map((line, i) => (
              <div className="principle" key={line}>
                <span className="principle-num">
                  {String(i + 1).padStart(2, '0')}
                </span>
                <div className="principle-body">
                  <p>{line}</p>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* ── Shared checks ──────────────────────────────────────────────────── */}
        <section className="doctrine-section fade-up">
          <h2 className="doctrine-heading">Shared checks</h2>
          <p className="surface-note" style={{ marginBottom: '1.5rem' }}>
            Where the three tools overlap. The intersection is narrow — most
            checks are unique to each tool.
          </p>
          <div className="token-table" role="table" aria-label="Shared checks">
            <div className="token-table-head" role="row">
              <span role="columnheader">designesy</span>
              <span role="columnheader">hallmark</span>
              <span role="columnheader">slop-eval</span>
            </div>
            {SHARED_CHECKS.map((row, i) => (
              <div className="token-table-row" role="row" key={i}>
                <code role="cell">{row.designesy}</code>
                <code role="cell">{row.hallmark}</code>
                <code role="cell">{row.slop}</code>
              </div>
            ))}
          </div>
        </section>

        {/* ── Designesy unique ───────────────────────────────────────────────── */}
        <section className="doctrine-section fade-up">
          <h2 className="doctrine-heading">What Designesy catches that they do not</h2>
          <p className="surface-note" style={{ marginBottom: '1.5rem' }}>
            20 checks with no hallmark or slop-eval equivalent. These are the
            uncontested layers — contract conformance, Unicode security, Core
            Web Vitals, forced-colors, AI disclosure, and the Cadence typography
            suite.
          </p>
          <CheckGrid items={checkItemsFromStrings(DESIGNESY_UNIQUE)} />
        </section>

        {/* ── Competitor unique ──────────────────────────────────────────────── */}
        <section className="doctrine-section fade-up">
          <h2 className="doctrine-heading">What they catch that Designesy does not</h2>
          <p className="surface-note" style={{ marginBottom: '1.5rem' }}>
            Designesy gaps. These are the AI-slop aesthetic detection,
            structural-variety, signature, and cohesion checks. Designesy does
            not ask &ldquo;does this look AI-generated&rdquo; — it verifies contract
            conformance.
          </p>
          <CheckGrid items={checkItemsFromStrings(COMPETITOR_UNIQUE, { avoid: true })} />
        </section>

        {/* ── The moat ───────────────────────────────────────────────────────── */}
        <section className="doctrine-section fade-up">
          <h2 className="doctrine-heading">The moat</h2>
          <div className="definition">
            <p className="definition-label">Designesy&rsquo;s uncontested layers</p>
            <p>
              The layers no competitor approaches. These are not features —
              they are the category-of-one positioning.
            </p>
          </div>
          <CheckGrid items={checkItemsFromStrings(DESIGNESY_MOAT)} />
        </section>

        {/* ── Self-score ─────────────────────────────────────────────────────── */}
        <section className="doctrine-section fade-up">
          <h2 className="doctrine-heading">Self-score on designesy.org</h2>
          <div className="token-table" role="table" aria-label="Self-score">
            <div className="token-table-head" role="row">
              <span role="columnheader">Tool</span>
              <span role="columnheader">Score</span>
              <span role="columnheader">What it caught</span>
            </div>
            <div className="token-table-row" role="row">
              <code role="cell" style={{ fontWeight: 700, color: 'var(--ink)' }}>designesy</code>
              <code role="cell">95.3% A (33 PASS / 0 FAIL / 3 WARN / 1 SKIP / 3 MANUAL)</code>
              <span role="cell">3 WARN: v16 rem/px ratio, v26 font-family count, v38 bare-noun buttons. 3 MANUAL: viewport overflow, sound toggle, Core Web Vitals (browser-only probes)</span>
            </div>
            <div className="token-table-row" role="row">
              <code role="cell" style={{ fontWeight: 700, color: 'var(--ink)' }}>hallmark</code>
              <code role="cell">Not run (skill, not URL API)</code>
              <span role="cell">Would flag: pure #000/#fff (near-pure), zero-chroma neutrals (graphite is chromatic), nav structure</span>
            </div>
            <div className="token-table-row" role="row">
              <code role="cell" style={{ fontWeight: 700, color: 'var(--ink)' }}>slop-eval</code>
              <code role="cell">Not run (skill, not URL API)</code>
              <span role="cell">Would flag: cool blue-charcoal dark (warm graphite, may pass), mono house voice (minor), focus states (should pass)</span>
            </div>
          </div>
          <p className="surface-note" style={{ marginTop: '1.5rem' }}>
            hallmark and slop-eval are agent skills, not URL-based APIs. They
            cannot score a URL without an LLM agent loading the skill and
            evaluating. Designesy is the only one with a programmatic URL-based
            scoring endpoint — a structural advantage for CI/CD integration,
            leaderboards, and automated pipelines.
          </p>
        </section>

        {/* ── Emerging landscape ──────────────────────────────────────────────── */}
        <section className="doctrine-section fade-up">
          <h2 className="doctrine-heading">The wider landscape</h2>
          <p className="surface-note" style={{ marginBottom: '1.5rem' }}>
            The three tools above are the closest comparators. The field is
            growing — these are newer entrants worth tracking.
          </p>
          <div className="token-table" role="table" aria-label="Emerging tools">
            <div className="token-table-head" role="row">
              <span role="columnheader">Tool</span>
              <span role="columnheader">Approach</span>
              <span role="columnheader">Differentiator</span>
            </div>
            {[
              { name: 'Impeccable', approach: '46 AI-slop tells (expanded slop-eval lineage)', diff: 'Largest tell catalog, community-sourced' },
              { name: 'design-slop-cop', approach: '14 anti-slop patterns (rule-based)', diff: 'Lightweight, fast scan, focused pattern set' },
              { name: 'anti-slop-design', approach: 'Design quality guardrails', diff: 'Pre-emit lint, not post-hoc scoring' },
              { name: 'Atlassian ADS MCP', approach: 'Design-system MCP server (v0.21.1)', diff: 'Benchmarked against design.md — fewer tokens, lower variance' },
            ].map((row) => (
              <div className="token-table-row" role="row" key={row.name}>
                <code role="cell" style={{ fontWeight: 700, color: 'var(--ink)' }}>{row.name}</code>
                <span role="cell">{row.approach}</span>
                <span role="cell">{row.diff}</span>
              </div>
            ))}
          </div>
          <p className="surface-note" style={{ marginTop: '1.5rem' }}>
            81 design-related MCP servers are now indexed at mcpservers.org
            (2026-08-01). The category is expanding from skills into
            agent-invocable tooling — the space designesy pioneered with its
            17-tool MCP server and URL-based scoring API.
          </p>
        </section>

        {/* ── Provenance ─────────────────────────────────────────────────────── */}
        <section className="doctrine-section fade-up">
          <h2 className="doctrine-heading">Provenance</h2>
          <div className="definition">
            <p className="definition-label">Sources</p>
            <p>
              Live research via AnySearch MCP (2026-08-01). Designesy live score
              verified via POST to https://www.designesy.org/api/score (95.3% A,
              40 checks). hallmark taxonomy from Nutlope/hallmark/skills/hallmark/references/slop-test.md.
              slop-eval taxonomy from fabricioctelles/skills/skills/slop-eval/references/tells.md.
            </p>
          </div>
          <CheckGrid items={[
            { title: 'designesy live score', meta: 'POST https://www.designesy.org/api/score — 95.3% A, 40 checks, verified 2026-08-14' },
            { title: 'hallmark 57 gates', meta: 'github.com/Nutlope/hallmark/blob/main/skills/hallmark/references/slop-test.md' },
            { title: 'slop-eval 108 tells', meta: 'github.com/fabricioctelles/skills/blob/main/skills/slop-eval/references/tells.md' },
            { title: 'slop-eval scoring', meta: 'github.com/fabricioctelles/skills/blob/main/skills/slop-eval/SKILL.md' },
            { title: 'slop-eval upstream law', meta: 'pols.dev/slop.md' },
            { title: '@google/design.md', meta: 'npmjs.com/package/@google/design.md — v0.4.0, Apache 2.0, 26k+ stars' },
          ]} />
        </section>

        <div className="status-note">
          Competitive benchmark — designesy vs hallmark vs slop-eval. The three
          tools answer different questions: hallmark prevents slop, slop-eval
          scores slop, designesy verifies contract conformance. A complete
          pipeline uses all three.{' '}
          <Link href="/methodology">/methodology</Link>
          {' · '}
          <Link href="/leaderboard">/leaderboard</Link>
          {' · '}
          <Link href="/contracts/design-system">/contracts/design-system</Link>
        </div>
      </main>

      <Footer />
    </>
  );
}