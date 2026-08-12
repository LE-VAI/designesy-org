import type { Metadata } from 'next';
import Link from 'next/link';
import { Topbar } from '../../lib/topbar';
import { Footer } from '../../lib/footer';
import { designSystemContract } from '../../lib/design-system-contract';
import { CheckGrid } from '../../lib/check-grid';
import { checkItemsFromStrings } from '../../lib/check-items';
import { pageMeta } from '../../lib/site-meta';
import { JsonLd, creativeWorkJsonLd } from '../../lib/json-ld';

export const metadata: Metadata = pageMeta({
  title: 'Design system contract — reference format',
  description:
    `Designesy design system contract v${designSystemContract.version} — a reference format for AI-readable design contracts. Richer than design.md: 40 verification checks, acoustic cues, takt, copywriting, anti-generic tells, and provenance. Lab One · Poise, Lab Two · Takt, Lab Three · Cadence, Lab Four · Acoustics.`,
  path: '/contracts/design-system',
  ogTitle: `Design system contract · v${designSystemContract.version} — reference format`,
  ogDescription:
    'A reference format for AI-readable design contracts. Input + verification — not just tokens and prose, but 40 automated checks that prove the output passes. Richer than design.md.',
  twitterDescription:
    'A reference format for AI-readable design contracts — input + verification. designesy.org/contracts/design-system',
});

const SECTIONS = [
  { title: 'Colors', meta: 'Primitive and semantic color roles' },
  { title: 'Typography', meta: 'Stacks, scale, and type rules' },
  { title: 'Rounded', meta: 'Radius tokens' },
  { title: 'Spacing', meta: 'Layout spacing and breakpoints' },
  { title: 'Motion', meta: 'Duration, easing, reduced-motion' },
  { title: 'Components', meta: 'Behavior and states' },
  { title: 'Accessibility', meta: 'Focus, preference, landmarks' },
  { title: 'Copywriting', meta: `UX copy principles (v${designSystemContract.copywriting.adopted_in})` },
  { title: 'Acoustics', meta: `Cue tokens and mapping rules (v${designSystemContract.acoustic.adopted_in})` },
  { title: 'Verification', meta: 'How to know the system still holds' },
];

const COLOR_PREVIEW = [
  designSystemContract.colors.ink,
  designSystemContract.colors.paper,
  designSystemContract.colors.surface,
  designSystemContract.colors.signal,
  designSystemContract.colors.signal_light,
  designSystemContract.colors.activation,
];

export default function DesignSystemContractPage() {
  const c = designSystemContract;

  return (
    <>
      <JsonLd
        data={creativeWorkJsonLd({
          name: `${c.name} contract`,
          description:
            'A reference format for AI-readable design contracts — tokens, motion, components, 40 verification checks, acoustic cues, takt, copywriting, and adopted Poise + Takt + Cadence + Acoustics rules. Richer than design.md.',
          url: c.public_url,
          version: c.version,
          related: [c.machine_url, 'https://www.designesy.org/open', 'https://www.designesy.org/score'],
        })}
      />
      <Topbar scrolled />

      <main id="main-content" data-pagefind-body className="surface-page" data-pagefind-meta="priority:high">
        <section className="surface-header fade-up">
          <p className="surface-eyebrow">
            <Link href="/contracts" className="lab-crumb">
              Contracts
            </Link>
            <span aria-hidden="true"> · </span>
            Design system
          </p>
          <h1 className="surface-title" data-scramble>{c.name}</h1>
          <p className="surface-lede">
            A reference format for AI-readable design contracts — version {c.version}.
          </p>
          <p className="surface-note">
            design.md (Google Labs, 26k+ stars) is the input layer: tokens and
            prose an agent reads to generate UI. This contract is input{' '}
            <em>plus</em> verification — 40 automated checks that prove the
            generated output actually passes. Acoustic cues, takt interface-feel,
            copywriting principles, anti-generic tells, and provenance tracking
            have no design.md equivalent.
          </p>
          <div className="lab-meta fade-up fade-up-delay-1">
            <span className="status-badge">v{c.version}</span>
            <span className="lab-meta-item">Status · {c.status}</span>
            <span className="lab-meta-item">Updated · {c.updated}</span>
          </div>
          <div className="hero-actions fade-up fade-up-delay-2" style={{ marginTop: '1.75rem' }}>
            <Link
              className="button primary"
              href="/export/dtcg"
              data-cuelume-press
            >
              Open DTCG tokens export
            </Link>
            <Link
              className="button ghost"
              href="/contracts#design-system-contract"
              data-cuelume-press
            >
              Full contract
            </Link>
          </div>
        </section>

        <section className="doctrine-section fade-up">
          <h2 className="doctrine-heading">What this contract is</h2>
          <div className="definition">
            <p className="definition-label">Operating agreement</p>
            <p>
              A Designesy contract answers exact value, role, application,
              behavior, avoidance, and verification. It is public artifact
              discipline — not legal advice or a client service agreement.
            </p>
          </div>
        </section>

        <section className="doctrine-section fade-up">
          <h2 className="doctrine-heading">
            Beyond design.md — the verification layer
          </h2>
          <p className="surface-note" style={{ marginBottom: '1.25rem' }}>
            Google Labs' design.md (alpha, Apache-2.0, 26k+ stars) is a strong
            input format: YAML tokens + markdown prose that an agent reads to
            generate UI. Designesy extends that model with layers design.md does
            not carry. They are complementary — design.md is the brief, this
            contract is the brief and the proof.
          </p>
          <div className="token-table" role="table" aria-label="Designesy contract vs design.md">
            <div className="token-table-head" role="row">
              <span role="columnheader">Layer</span>
              <span role="columnheader">design.md</span>
              <span role="columnheader">This contract</span>
            </div>
            <div className="token-table-row" role="row">
              <code role="cell">Tokens</code>
              <span role="cell">YAML frontmatter</span>
              <span role="cell">DTCG 2025.10 JSON + CORS endpoint</span>
            </div>
            <div className="token-table-row" role="row">
              <code role="cell">Rationale prose</code>
              <span role="cell">9 markdown sections</span>
              <span role="cell">Adoption narratives + lab provenance</span>
            </div>
            <div className="token-table-row" role="row">
              <code role="cell">Verification</code>
              <span role="cell">CLI linter + WCAG contrast</span>
              <span role="cell">40 automated checks, live score engine</span>
            </div>
            <div className="token-table-row" role="row">
              <code role="cell">Anti-generic detection</code>
              <span role="cell">—</span>
              <span role="cell">12 anti-generic tells (AI sameness)</span>
            </div>
            <div className="token-table-row" role="row">
              <code role="cell">Acoustic cues</code>
              <span role="cell">—</span>
              <span role="cell">10 named cue tokens + mapping rules</span>
            </div>
            <div className="token-table-row" role="row">
              <code role="cell">Interface-feel (takt)</code>
              <span role="cell">—</span>
              <span role="cell">Press scale, hit area, stagger rhythm</span>
            </div>
            <div className="token-table-row" role="row">
              <code role="cell">Copywriting</code>
              <span role="cell">—</span>
              <span role="cell">16 UX copy principles, 4 as checks (v38–v41)</span>
            </div>
            <div className="token-table-row" role="row">
              <code role="cell">Motion</code>
              <span role="cell">Duration + easing</span>
              <span role="cell">Spring physics + 3-tier reduced-motion</span>
            </div>
            <div className="token-table-row" role="row">
              <code role="cell">Provenance</code>
              <span role="cell">—</span>
              <span role="cell">Source labs, adopted_in versions, external ingests</span>
            </div>
            <div className="token-table-row" role="row">
              <code role="cell">Live proof</code>
              <span role="cell">—</span>
              <span role="cell">designesy.org/sgrade — any URL, live grade</span>
            </div>
            <div className="token-table-row" role="row">
              <code role="cell">Agent skill</code>
              <span role="cell">Reads the markdown</span>
              <span role="cell">SKILL.md format + MCP contract endpoint</span>
            </div>
          </div>
          <p className="surface-note" style={{ marginTop: '1.25rem' }}>
            The gap design.md leaves open is the same gap every AI coding agent
            leaves open: <strong>generation is not verification</strong>. An
            agent can read a token file and still ship hardcoded hex, broken
            contrast, or the AI-default look. The 40-check engine closes that
            gap. When 42% of committed React is AI-generated, the score is the
            compliance layer — not whether the agent read the rules, but whether
            the shipped design passes them.
          </p>
        </section>

        <section className="doctrine-section fade-up">
          <h2 className="doctrine-heading">Contents</h2>
          <CheckGrid dense items={SECTIONS} />
        </section>

        <section className="doctrine-section fade-up">
          <h2 className="doctrine-heading">Token preview</h2>
          <p className="surface-note" style={{ marginBottom: '1rem' }}>
            Core color roles from the live foundation. Full tables live on the
            contracts surface and in the machine export.
          </p>
          <div className="token-table" role="table" aria-label="Core color tokens">
            <div className="token-table-head" role="row">
              <span role="columnheader">Token</span>
              <span role="columnheader">Value</span>
              <span role="columnheader">Role</span>
            </div>
            {COLOR_PREVIEW.map((row) => (
              <div className="token-table-row" role="row" key={row.token}>
                <code role="cell">{row.token}</code>
                <code role="cell" className="token-value">
                  {row.value}
                </code>
                <span role="cell">{row.role}</span>
              </div>
            ))}
          </div>
        </section>

        <section className="doctrine-section fade-up">
          <h2 className="doctrine-heading">Surfaces</h2>
          <div className="row-stack" role="list">
            <Link
              href="/contracts#design-system-contract"
              className="row"
              role="listitem"
              data-cuelume-hover="whisper"
              data-cuelume-press
            >
              <span className="row-index">01</span>
              <span className="row-body">
                <span className="row-title">Human contract</span>
                <span className="row-meta">
                  Full published contract on /contracts
                </span>
              </span>
            </Link>
            <Link
              href="/contracts/design-system.json"
              className="row"
              role="listitem"
              data-cuelume-hover="whisper"
              data-cuelume-press
            >
              <span className="row-index">02</span>
              <span className="row-body">
                <span className="row-title">Machine export</span>
                <span className="row-meta">/contracts/design-system.json</span>
              </span>
            </Link>
            <Link
              href="/contracts/skill"
              className="row"
              role="listitem"
              data-cuelume-hover="whisper"
              data-cuelume-press
            >
              <span className="row-index">03</span>
              <span className="row-body">
                <span className="row-title">Agent skill</span>
                <span className="row-meta">/contracts/skill — SKILL.md format for AI coding agents</span>
              </span>
            </Link>
            <Link
              href="/open"
              className="row"
              role="listitem"
              data-cuelume-hover="whisper"
              data-cuelume-press
            >
              <span className="row-index">04</span>
              <span className="row-body">
                <span className="row-title">Open design intelligence</span>
                <span className="row-meta">
                  Package catalog · this contract is entry one
                </span>
              </span>
            </Link>
            <Link
              href="/labs/poise"
              className="row"
              role="listitem"
              data-cuelume-hover="whisper"
              data-cuelume-press
            >
              <span className="row-index">05</span>
              <span className="row-body">
                <span className="row-title">Lab One · Poise</span>
                <span className="row-meta">
                  Source lab · interaction rules adopted in v{c.interaction.adopted_in}
                </span>
              </span>
            </Link>
            <Link
              href="/labs/takt"
              className="row"
              role="listitem"
              data-cuelume-hover="whisper"
              data-cuelume-press
            >
              <span className="row-index">06</span>
              <span className="row-body">
                <span className="row-title">Lab Two · Takt</span>
                <span className="row-meta">
                  Source lab · interface-feel rules adopted in v{c.takt.adopted_in}
                </span>
              </span>
            </Link>
            <Link
              href="/labs/cadence"
              className="row"
              role="listitem"
              data-cuelume-hover="whisper"
              data-cuelume-press
            >
              <span className="row-index">07</span>
              <span className="row-body">
                <span className="row-title">Lab Three · Cadence</span>
                <span className="row-meta">
                  Source lab · typography rules adopted in v{c.cadence.adopted_in}
                </span>
              </span>
            </Link>
            <Link
              href="/labs/acoustics"
              className="row"
              role="listitem"
              data-cuelume-hover="whisper"
              data-cuelume-press
            >
              <span className="row-index">08</span>
              <span className="row-body">
                <span className="row-title">Lab Four · Acoustics</span>
                <span className="row-meta">
                  Source lab · interaction-sound rules adopted in v{c.acoustic.adopted_in}
                </span>
              </span>
            </Link>
            <Link
              href="/review/poise"
              className="row"
              role="listitem"
              data-cuelume-hover="whisper"
              data-cuelume-press
            >
              <span className="row-index">09</span>
              <span className="row-body">
                <span className="row-title">Field check · Poise</span>
                <span className="row-meta">
                  Kit One review that supported adoption
                </span>
              </span>
            </Link>
            <Link
              href="/review/takt"
              className="row"
              role="listitem"
              data-cuelume-hover="whisper"
              data-cuelume-press
            >
              <span className="row-index">10</span>
              <span className="row-body">
                <span className="row-title">Field check · Takt</span>
                <span className="row-meta">
                  Kit One review that supported adoption
                </span>
              </span>
            </Link>
            <Link
              href="/review/cadence"
              className="row"
              role="listitem"
              data-cuelume-hover="whisper"
              data-cuelume-press
            >
              <span className="row-index">11</span>
              <span className="row-body">
                <span className="row-title">Field check · Cadence</span>
                <span className="row-meta">
                  Kit One review that supported adoption
                </span>
              </span>
            </Link>
            <Link
              href="/review/acoustics"
              className="row"
              role="listitem"
              data-cuelume-hover="whisper"
              data-cuelume-press
            >
              <span className="row-index">12</span>
              <span className="row-body">
                <span className="row-title">Field check · Acoustics</span>
                <span className="row-meta">
                  Kit One review of Lab Four
                </span>
              </span>
            </Link>
            <Link
              href="/review/designesy-org"
              className="row"
              role="listitem"
              data-cuelume-hover="whisper"
              data-cuelume-press
            >
              <span className="row-index">13</span>
              <span className="row-body">
                <span className="row-title">Public review</span>
                <span className="row-meta">
                  Field check of designesy.org against this contract
                </span>
              </span>
            </Link>
            <Link
              href="/score"
              className="row"
              role="listitem"
              data-cuelume-hover="whisper"
              data-cuelume-press
            >
              <span className="row-index">14</span>
              <span className="row-body">
                <span className="row-title">Live verification</span>
                <span className="row-meta">
                  Score any URL against this contract — 40 checks, one grade
                </span>
              </span>
            </Link>
          </div>
        </section>

        <section className="doctrine-section fade-up">
          <h2 className="doctrine-heading">Adoption</h2>
          <div className="definition">
            <p className="definition-label">
              Poise · adopted in v{c.interaction.adopted_in}
            </p>
            <p>
              Lab One portable rules are contract material: wordmark breath,
              press settle, sound preference ownership, reduced motion, hover
              media discipline, and human public naming. Silence was not
              adoption — that version was the explicit order.
            </p>
          </div>
          <CheckGrid items={checkItemsFromStrings(c.interaction.rules)} />
        </section>

        <section className="doctrine-section fade-up">
          <h2 className="doctrine-heading">Takt adoption</h2>
          <div className="definition">
            <p className="definition-label">
              Takt · adopted in v{c.takt.adopted_in}
            </p>
            <p>
              Lab Two portable rules are contract material: concentric radii,
              press scale (0.96 for cells, 0.985 for cards), image outlines,
              hit area floor, stagger rhythm, no transition:all, and spare
              will-change. Rules compiled from external design intelligence
              (Amicro, Krehel /better-ui) and verified on live CSS. Silence
              was not adoption — this version is the explicit order.
            </p>
          </div>
          <CheckGrid items={checkItemsFromStrings(c.takt.rules)} />
        </section>

        <section className="doctrine-section fade-up">
          <h2 className="doctrine-heading">Cadence adoption</h2>
          <div className="definition">
            <p className="definition-label">
              Cadence · adopted in v{c.cadence.adopted_in}
            </p>
            <p>
              Lab Three portable rules are contract material: font smoothing
              on root, rem-based scale, line-height by role, tracking by size,
              measure cap, text-wrap balance and pretty, tabular numbers,
              ::selection with --signal, user-select on UI chrome, and 16px
              input floor. Rules compiled from external typography intelligence
              (Krehel /better-typography) and verified on live CSS. Three open
              tensions documented: font-synthesis, logical properties, and
              underline-from-font. Silence was not adoption — this version is
              the explicit order.
            </p>
          </div>
          <CheckGrid items={checkItemsFromStrings(c.cadence.rules)} />
        </section>

        <section className="doctrine-section fade-up">
          <h2 className="doctrine-heading">Acoustics adoption</h2>
          <div className="definition">
            <p className="definition-label">
              Acoustics · adopted in v{c.acoustic.adopted_in}
            </p>
            <p>
              Lab Four portable rules are contract material: ten named cue
              tokens (--cue:brand through --cue:contact), one primary cue
              family per role, opt-in sound with localStorage preference,
              fine-pointer hover discipline, no focus sounds, no ambient
              audio, silent fallback when Web Audio is blocked, and
              reduced-motion as an acoustic-reduction proxy. Engine: {c.acoustic.engine}.
              Silence was not adoption — this version is the explicit order.
            </p>
          </div>
          <CheckGrid items={checkItemsFromStrings(c.acoustic.mapping_rules)} />
        </section>

        <section className="doctrine-section fade-up">
          <h2 className="doctrine-heading">Copywriting adoption</h2>
          <div className="definition">
            <p className="definition-label">
              Copywriting · adopted in v{c.copywriting.adopted_in}
            </p>
            <p>
              UX copy principles from NN/g, Polaris, IBM Carbon, Microsoft
              Fluent, Apple HIG, and Atlassian. Gap signal from{' '}
              <a
                href="https://detail.design"
                style={{ color: 'var(--signal-light)' }}
              >
                detail.design
              </a>{' '}
              Copywriting discipline. 16 principles across button text, error
              messages, empty states, link text, general microcopy, and voice &
              tone. 4 codifiable principles are verification checks (v38–v41);
              12 are governance. Tooling: Vale, textlint, alex.
            </p>
          </div>
          <CheckGrid items={checkItemsFromStrings(c.copywriting.principles)} />
        </section>

        <div className="status-note">
          Design system contract v{c.version} — a reference format for
          AI-readable design contracts. Input plus verification: 40 automated
          checks, not just tokens and prose. Live styles remain authoritative
          when they and this contract disagree. Human and machine surfaces stay
          synchronized.
        </div>
      </main>

      <Footer />
    </>
  );
}
