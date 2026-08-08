// /changelog — contract changes organized by design dimension.
//
// Pattern from Artificial Analysis: "Designesy's changelog could be organized
// by dimension tabs: Tokens, Motion, Typography, Acoustic, Takt, Cadence,
// Verification, Components — mirroring how AA organizes by modality. Each
// contract version bump gets a changelog entry under the relevant dimension."
//
// Dimensions are filterable tabs. Each entry shows version, date, what changed,
// which checks were added/modified, and the rationale.

import type { Metadata } from 'next';
import Link from 'next/link';
import { Topbar } from '../lib/topbar';
import { Footer } from '../lib/footer';
import { pageMeta } from '../lib/site-meta';
import { CONTRACT_VERSION } from '../hero-stats';

export const revalidate = 3600;

export const metadata: Metadata = pageMeta({
  title: 'Contract Changelog',
  description:
    'Every contract change, organized by design dimension. Track what was added, modified, and removed across versions — Tokens, Motion, Cadence, Accessibility, Takt, Poise, Acoustics, Copywriting, Identity, Security.',
  path: '/changelog',
  ogTitle: 'Contract Changelog · Designesy',
  ogDescription:
    'Design contract changes by dimension. Every version bump, every new check, every rule adoption — filterable by design dimension.',
  twitterDescription: 'Contract changelog — designesy.org/changelog',
});

// ── Dimensions ──────────────────────────────────────────────────────────────

type Dimension =
  | 'tokens'
  | 'motion'
  | 'cadence'
  | 'accessibility'
  | 'takt'
  | 'poise'
  | 'acoustics'
  | 'copywriting'
  | 'identity'
  | 'security'
  | 'verification'
  | 'all';

const DIMENSION_LABELS: Record<Dimension, string> = {
  all: 'All dimensions',
  tokens: 'Tokens',
  motion: 'Motion',
  cadence: 'Cadence',
  accessibility: 'Accessibility',
  takt: 'Takt',
  poise: 'Poise',
  acoustics: 'Acoustics',
  copywriting: 'Copywriting',
  identity: 'Identity',
  security: 'Security',
  verification: 'Verification',
};

const DIMENSION_COLORS: Record<Dimension, string> = {
  all: 'var(--signal)',
  tokens: 'var(--signal)',
  motion: 'var(--signal)',
  cadence: 'var(--signal)',
  accessibility: 'var(--ok)',
  takt: 'var(--signal)',
  poise: 'var(--signal)',
  acoustics: 'var(--signal)',
  copywriting: 'var(--signal)',
  identity: 'var(--signal)',
  security: 'var(--error)',
  verification: 'var(--signal)',
};

// ── Changelog entries ───────────────────────────────────────────────────────

interface ChangelogEntry {
  version: string;
  date: string;
  dimension: Dimension;
  change: 'added' | 'modified' | 'removed' | 'adopted' | 'deprecated';
  title: string;
  description: string;
  checks?: string[];
  rationale: string;
  source?: string;
}

const CHANGELOG: ChangelogEntry[] = [
  // ── v0.1.0 — Initial contract ──
  {
    version: 'v0.1.0',
    date: '2026-06-15',
    dimension: 'tokens',
    change: 'added',
    title: 'Initial token architecture checks',
    description:
      'Two scored checks for token presence: --paper foundation variable at :root, and token layer depth (primitive → semantic → component).',
    checks: ['v01', 'v02'],
    rationale:
      'Token architecture is the substrate — without a root surface variable and layered tokens, every other dimension is ad-hoc. 9% weight.',
    source: 'Designesy design system contract v0.1.0',
  },
  {
    version: 'v0.1.0',
    date: '2026-06-15',
    dimension: 'motion',
    change: 'added',
    title: 'Initial motion hygiene checks',
    description:
      'Four checks: no transition:all, will-change restricted to transform/opacity, prefers-reduced-motion block present, duration tokens declared.',
    checks: ['v05', 'v06', 'v07', 'v08'],
    rationale:
      'Motion hygiene is the most violated dimension in the cohort. transition:all causes layout thrashing; missing reduced-motion is an accessibility failure.',
    source: 'Designesy design system contract v0.1.0',
  },
  {
    version: 'v0.1.0',
    date: '2026-06-15',
    dimension: 'accessibility',
    change: 'added',
    title: 'WCAG 2.2 AA primitives',
    description:
      'Six checks: contrast ratios, touch targets (44px), heading hierarchy, input font floor (16px), button-text contrast, forced-colors readiness.',
    checks: ['v11', 'v12', 'v13', 'v14', 'v15', 'v16'],
    rationale:
      'Accessibility carries the a11y floor: if this category scores below 60%, the overall grade is capped at C. 15% weight — the highest single category.',
    source: 'WCAG 2.2 AA, APCA contrast model',
  },
  {
    version: 'v0.1.0',
    date: '2026-06-15',
    dimension: 'identity',
    change: 'added',
    title: 'Document identity checks',
    description:
      'Two checks: semantic HTML landmarks (h1, title, meta description, main/header/nav) and AI-disclosure readiness per EU AI Act Art 50.',
    checks: ['v07', 'v34'],
    rationale:
      'Document identity is the machine-readable surface — without landmarks and meta, the page is opaque to both screen readers and AI agents.',
    source: 'EU AI Act Article 50, HTML landmark spec',
  },
  {
    version: 'v0.1.0',
    date: '2026-06-15',
    dimension: 'security',
    change: 'added',
    title: 'Unicode security check (UTS #39)',
    description:
      'One check: UTS #39 confusable detection in token names and CSS identifiers. Prevents Cyrillic/Greek homoglyph shadowing attacks.',
    checks: ['v36'],
    rationale:
      'Designesy is the only design verification engine that checks this surface. Homoglyph attacks in CSS identifiers can spoof brand colors and redirect trust.',
    source: 'Unicode Technical Standard #39',
  },
  {
    version: 'v0.1.0',
    date: '2026-06-15',
    dimension: 'verification',
    change: 'added',
    title: 'Deterministic 40-check engine',
    description:
      'The scoring engine itself: CSS extraction, :root custom property parsing, 40 checks across 14 weighted categories, A-F grade bands.',
    rationale:
      'The engine is the moat — deterministic, open, and reproducible. No LLM, no human judgment, no survey. The same engine scores every site identically.',
    source: 'Designesy engine v1.0',
  },

  // ── v0.1.1 — Poise adopted ──
  {
    version: 'v0.1.1',
    date: '2026-06-28',
    dimension: 'poise',
    change: 'adopted',
    title: 'Poise interaction rules adopted',
    description:
      'Lab One interaction rules promoted to contract: hover lifts with @media (hover: hover) guards, press settle scales, keyboard-path documentation, sound-toggle aria-pressed.',
    checks: ['v09', 'v10'],
    rationale:
      'Poise is interaction poise — the difference between a site that feels considered and one that feels janky. Hover guards prevent touch-device flash; press scales provide tactile feedback.',
    source: 'Lab One — Poise interaction experiments',
  },

  // ── v0.1.2 — Takt adopted ──
  {
    version: 'v0.1.2',
    date: '2026-07-05',
    dimension: 'takt',
    change: 'adopted',
    title: 'Takt interface-feel rules adopted',
    description:
      'Lab Two interface-feel rules promoted to contract: stagger enter animation-delays, soften exit transforms with ease-out, concentric border-radius sets. Named after the German word for precise, musical timing.',
    checks: ['v19', 'v20'],
    rationale:
      'Takt is the musicality of interaction — the timing and scaling that makes a press feel intentional. Press scales above the 0.95 floor: 0.96 cells, 0.985 cards, 0.995 surfaces.',
    source: 'Lab Two — Takt interface-feel experiments',
  },

  // ── v0.1.3 — Cadence adopted ──
  {
    version: 'v0.1.3',
    date: '2026-07-12',
    dimension: 'cadence',
    change: 'adopted',
    title: 'Cadence typography rules adopted',
    description:
      'Lab Three typography rules promoted to contract: font-smoothing, rem-based sizes, line-height, text-wrap (balance/pretty), tabular-nums, selection styling, font-synthesis, underline-position, skip-ink. 12 checks — the largest category.',
    checks: ['v14', 'v15', 'v16', 'v17', 'v18', 'v19', 'v20', 'v26', 'v28', 'x01', 'x02', 'x03'],
    rationale:
      'Cadence is typography rendering discipline — the difference between type that looks crisp and type that looks fuzzy. 18% weight — the highest-weighted category. Most sites fail here because font-synthesis and text-wrap are rarely declared.',
    source: 'Lab Three — Cadence typography experiments, NY Times editorial reference',
  },

  // ── v0.3.0 — Acoustics adopted ──
  {
    version: 'v0.3.0',
    date: '2026-07-20',
    dimension: 'acoustics',
    change: 'adopted',
    title: 'Acoustic mapping rules adopted',
    description:
      'Lab Four acoustic mapping rules promoted to contract: interaction sound synthesis via Web Audio API, acoustic tokens for press/hover/settle sounds, sound-toggle aria-pressed, reduced-motion tiering for acoustic events.',
    rationale:
      'Acoustics is the frontier — most design systems have no acoustic layer at all. The contract defines acoustic tokens the same way it defines motion tokens: named, typed, and tiered for reduced-motion.',
    source: 'Lab Four — Acoustic mapping, Cuelume v0.1.0 engine',
  },

  // ── v0.4.0 — Copywriting adopted + engine upgrades ──
  {
    version: 'v0.4.0',
    date: '2026-07-28',
    dimension: 'copywriting',
    change: 'adopted',
    title: 'UX copy principles adopted',
    description:
      'Four heuristic checks: button verb phrases (no "Click Here"), no trailing periods on interactive elements, descriptive link text (WCAG 2.4.4), no ALL CAPS in body copy. Grounded in NN/g, Microsoft Fluent, IBM Carbon, and WCAG.',
    checks: ['v36', 'v37', 'v38', 'v39'],
    rationale:
      'Copy is design — "Click Here" is an accessibility failure and a usability smell. 8% weight. New in v0.4.0.',
    source: 'NN/g, Microsoft Fluent, IBM Carbon, WCAG 2.4.4',
  },
  {
    version: 'v0.4.0',
    date: '2026-07-28',
    dimension: 'verification',
    change: 'modified',
    title: 'Engine upgraded to 40 checks',
    description:
      'Engine expanded from 36 to 40 checks. Copywriting category added (4 checks). Accessibility floor enforced: if accessibility scores below 60%, overall grade capped at C. Twelve anti-slop rules now subtract up to 20 points. Seven originality signals add up to 8 points.',
    rationale:
      'The engine must evolve with the contract. Each version bump adds precision — the anti-slop rules catch generic AI-generated patterns that pass individual checks but fail as a composition.',
    source: 'Designesy engine v1.0, contract v0.4.0',
  },
  {
    version: 'v0.4.0',
    date: '2026-07-28',
    dimension: 'verification',
    change: 'added',
    title: 'Spec-layer integration (DESIGN.md)',
    description:
      'New check: validates DESIGN.md spec file using Google\'s @google/design.md CLI linter. Integrates the spec layer beneath designesy\'s own 40-check contract verification.',
    checks: ['v37'],
    rationale:
      'DESIGN.md is the AI-agent-facing spec file. Without it, AI coding tools build around your system, not from it. The check validates its presence and structure.',
    source: 'Google @google/design.md CLI linter',
  },

  // ── v0.4.0 — Independence firewall ──
  {
    version: 'v0.4.0',
    date: '2026-07-28',
    dimension: 'verification',
    change: 'added',
    title: 'Independence firewall + compliance_index_version',
    description:
      'Public commitment: Designesy does not accept payment for scores, methodology changes, or leaderboard placement. API responses now include compliance_index_version field (currently "1.0") for machine-consumable CI pipeline integration.',
    rationale:
      'The trust asset must be structurally non-monetizable. Pattern from Artificial Analysis (independence firewall) and Arena (structural neutrality). The compliance_index_version field makes scores machine-consumable for CI pipelines.',
    source: 'Artificial Analysis independence firewall, Arena structural neutrality',
  },
];

// ── Sorted by date descending ───────────────────────────────────────────────

const SORTED_CHANGELOG = [...CHANGELOG].sort((a, b) => b.date.localeCompare(a.date));

// ── Change badges ───────────────────────────────────────────────────────────

const CHANGE_COLORS: Record<string, string> = {
  added: 'var(--ok)',
  modified: 'var(--signal)',
  removed: 'var(--error)',
  adopted: 'var(--signal)',
  deprecated: 'var(--warn)',
};

// ── Component ───────────────────────────────────────────────────────────────

export default function ChangelogPage() {
  // Group entries by dimension for the dimension tabs
  const dimensions: Dimension[] = ['all', 'tokens', 'motion', 'cadence', 'accessibility', 'takt', 'poise', 'acoustics', 'copywriting', 'identity', 'security', 'verification'];

  // Count entries per dimension
  const dimensionCounts: Record<string, number> = {};
  CHANGELOG.forEach((e) => {
    dimensionCounts[e.dimension] = (dimensionCounts[e.dimension] || 0) + 1;
  });
  dimensionCounts.all = CHANGELOG.length;

  return (
    <>
      <Topbar scrolled />
      <main id="main-content" className="surface-page" data-pagefind-meta="priority:high">
        <section className="surface-header fade-up">
          <p className="surface-eyebrow" data-scramble>Contract history</p>
          <h1 className="surface-title" data-scramble>Contract Changelog</h1>
          <p className="surface-lede">
            Every contract change, organized by design dimension. Track what
            was added, modified, adopted, and deprecated across versions —
            from the initial {CHANGELOG.filter((e) => e.version === 'v0.1.0').length}-check
            contract through the current {CONTRACT_VERSION} 40-check engine.
          </p>
          <p className="surface-note">
            Pattern from Artificial Analysis: changelog organized by modality
            (dimension), not by version. Each entry shows the version, date,
            what changed, which checks were affected, and the rationale.
          </p>
        </section>

        {/* Dimension tabs */}
        <section className="doctrine-section fade-up fade-up-delay-1">
          <div id="changelog-tabs" style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginBottom: '2rem' }}>
            {dimensions.map((dim) => {
              const count = dimensionCounts[dim] || 0;
              if (count === 0 && dim !== 'all') return null;
              return (
                <a
                  key={dim}
                  href={`#dim-${dim}`}
                  style={{
                    padding: '0.4rem 0.85rem',
                    background: 'var(--surface)',
                    color: 'var(--muted)',
                    border: `1px solid var(--line)`,
                    borderRadius: '6px',
                    fontSize: '0.75rem',
                    fontWeight: 500,
                    textDecoration: 'none',
                    transition: 'all 0.2s var(--ease, cubic-bezier(0.22,0.61,0.36,1))',
                  }}
                  className="changelog-tab"
                  data-dimension={dim}
                >
                  {DIMENSION_LABELS[dim]} <span style={{ color: 'var(--muted-dim)' }}>({count})</span>
                </a>
              );
            })}
          </div>

          {/* Entries */}
          <div className="row-stack" role="list">
            {SORTED_CHANGELOG.map((entry, i) => (
              <div
                key={`${entry.version}-${entry.dimension}-${i}`}
                className="row"
                role="listitem"
                id={`dim-${entry.dimension}`}
                style={{ flexDirection: 'column', alignItems: 'flex-start', gap: '0.5rem' }}
              >
                <span className="row-index">{String(i + 1).padStart(2, '0')}</span>
                <span className="row-body" style={{ width: '100%' }}>
                  <span className="row-title" style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
                    <span>{entry.title}</span>
                    <span
                      style={{
                        fontSize: '0.65rem',
                        fontWeight: 700,
                        textTransform: 'uppercase',
                        letterSpacing: '0.05em',
                        color: CHANGE_COLORS[entry.change] || 'var(--muted)',
                        padding: '0.15rem 0.5rem',
                        border: `1px solid ${CHANGE_COLORS[entry.change] || 'var(--line)'}`,
                        borderRadius: '4px',
                      }}
                    >
                      {entry.change}
                    </span>
                  </span>
                  <span className="row-meta" style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', marginTop: '0.25rem' }}>
                    <span style={{ fontWeight: 600, color: 'var(--ink)' }}>{entry.version}</span>
                    <span>{entry.date}</span>
                    <span style={{ color: DIMENSION_COLORS[entry.dimension] }}>
                      {DIMENSION_LABELS[entry.dimension]}
                    </span>
                  </span>

                  {/* Description */}
                  <p style={{ fontSize: '0.85rem', color: 'var(--ink)', margin: '0.75rem 0 0.5rem', lineHeight: 1.6, maxWidth: '70ch' }}>
                    {entry.description}
                  </p>

                  {/* Checks */}
                  {entry.checks && entry.checks.length > 0 && (
                    <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap', marginTop: '0.5rem' }}>
                      {entry.checks.map((check) => (
                        <Link
                          key={check}
                          href={`/methodology#check-${check}`}
                          style={{
                            fontSize: '0.7rem',
                            fontWeight: 600,
                            color: 'var(--signal)',
                            background: 'var(--surface)',
                            border: '1px solid var(--line)',
                            borderRadius: '4px',
                            padding: '0.15rem 0.4rem',
                            textDecoration: 'none',
                          }}
                        >
                          {check}
                        </Link>
                      ))}
                    </div>
                  )}

                  {/* Rationale */}
                  <p style={{ fontSize: '0.8rem', color: 'var(--muted)', margin: '0.75rem 0 0', lineHeight: 1.5, maxWidth: '70ch', fontStyle: 'italic' }}>
                    {entry.rationale}
                  </p>

                  {/* Source */}
                  {entry.source && (
                    <p style={{ fontSize: '0.7rem', color: 'var(--muted-dim)', margin: '0.25rem 0 0' }}>
                      Source: {entry.source}
                    </p>
                  )}
                </span>
              </div>
            ))}
          </div>
        </section>

        {/* Version summary */}
        <section className="doctrine-section fade-up">
          <h2 className="doctrine-heading">Version summary</h2>
          <div className="row-stack" role="list">
            {[
              { version: 'v0.1.0', date: '2026-06-15', checks: 22, summary: 'Initial contract — tokens, motion, accessibility, identity, security. Deterministic 40-check engine.' },
              { version: 'v0.1.1', date: '2026-06-28', checks: 24, summary: 'Poise interaction rules adopted from Lab One.' },
              { version: 'v0.1.2', date: '2026-07-05', checks: 26, summary: 'Takt interface-feel rules adopted from Lab Two.' },
              { version: 'v0.1.3', date: '2026-07-12', checks: 38, summary: 'Cadence typography rules adopted from Lab Three. 12 checks — largest category at 18% weight.' },
              { version: 'v0.3.0', date: '2026-07-20', checks: 38, summary: 'Acoustics mapping rules adopted from Lab Four. Cuelume v0.1.0 sound engine.' },
              { version: 'v0.4.0', date: '2026-07-28', checks: 40, summary: 'Copywriting adopted (4 checks). Spec-layer integration (DESIGN.md). Independence firewall + compliance_index_version. Current version.' },
            ].map((v, i) => (
              <div
                key={v.version}
                className="row"
                role="listitem"
                style={{ flexDirection: 'column', alignItems: 'flex-start', gap: '0.25rem' }}
              >
                <span className="row-index">{String(i + 1).padStart(2, '0')}</span>
                <span className="row-body">
                  <span className="row-title">
                    {v.version}
                    <span style={{ fontSize: '0.75rem', color: 'var(--muted-dim)', marginLeft: '0.75rem' }}>
                      {v.date} · {v.checks} checks
                    </span>
                  </span>
                  <span className="row-meta">{v.summary}</span>
                </span>
              </div>
            ))}
          </div>
        </section>
      </main>
      <Footer />
    </>
  );
}