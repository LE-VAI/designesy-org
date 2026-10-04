import type { Metadata } from 'next';
import Link from 'next/link';
import './design-system.css';
import { Topbar } from '../../lib/topbar';
import { Footer } from '../../lib/footer';
import { designSystemContract } from '../../lib/design-system-contract';
import { ENGINE_CHECK_COUNT } from '../../hero-stats';
import { CheckGrid } from '../../lib/check-grid';
import { checkItemsFromStrings } from '../../lib/check-items';
import { pageMeta } from '../../lib/site-meta';
import { JsonLd, creativeWorkJsonLd } from '../../lib/json-ld';
import { AgentActions } from '../../lib/agent-actions';

export const metadata: Metadata = pageMeta({
  title: 'Design system contract: reference format',
  description:
    `Designesy design system contract v${designSystemContract.version}: a reference format for AI-readable design contracts. Richer than design.md: ${ENGINE_CHECK_COUNT} verification checks, acoustic cues, takt, copywriting, anti-generic tells, and provenance. Lab One · Poise, Lab Two · Takt, Lab Three · Cadence, Lab Four · Acoustics.`,
  path: '/contracts/design-system',
  ogTitle: `Design system contract · v${designSystemContract.version}: reference format`,
  ogDescription:
    `A reference format for AI-readable design contracts. Input plus verification: tokens and prose, and ${ENGINE_CHECK_COUNT} automated checks that prove the output passes. Richer than design.md.`,
  twitterDescription:
    'A reference format for AI-readable design contracts: input + verification. designesy.org/contracts/design-system',
});

// The contract's ten parts. Each opens its full table in the published
// contract on /contracts (section ids set there).
const SECTIONS = [
  { title: 'Colors', meta: 'Primitive and semantic color roles', href: '/contracts#primitive-tokens' },
  { title: 'Typography', meta: 'Stacks, scale, and type rules', href: '/contracts#typography-rules' },
  { title: 'Rounded', meta: 'Radius scale and surface rules', href: '/contracts#shape-and-surface' },
  { title: 'Spacing', meta: 'Layout spacing and container switches', href: '/contracts#spacing-and-layout' },
  { title: 'Motion', meta: 'Duration, easing, reduced-motion', href: '/contracts#motion-and-reduced-motion' },
  { title: 'Components', meta: 'Behavior and states', href: '/contracts#component-states' },
  { title: 'Accessibility', meta: 'Focus, preference, landmarks', href: '/contracts#accessibility-requirements' },
  { title: 'Copywriting', meta: `UX copy principles (v${designSystemContract.copywriting.adopted_in})`, href: '/contracts#09e-copywriting' },
  { title: 'Acoustics', meta: `Cue tokens and mapping rules (v${designSystemContract.acoustic.adopted_in})`, href: '/contracts#acoustic-tokens' },
  { title: 'Verification', meta: 'How to know the system still holds', href: '/contracts#verification-criteria' },
];

// Surfaces: each row's side pane is its route, in mono, with the arrow.
type Surface = { href: string; title: string; meta: string };

const SURFACES: Surface[] = [
  {
    href: '/contracts#design-system-contract',
    title: 'Human contract',
    meta: 'The full published contract, every table on one page',
  },
  {
    href: '/contracts/design-system.json',
    title: 'Machine export',
    meta: 'This contract as JSON for agents and checkers',
  },
  {
    href: '/contracts/skill',
    title: 'Agent skill',
    meta: 'SKILL.md format for AI coding agents',
  },
  {
    href: '/open',
    title: 'Open design intelligence',
    meta: 'Package catalog · this contract is entry one',
  },
  {
    href: '/labs/poise',
    title: 'Lab One · Poise',
    meta: `Source lab · interaction rules adopted in v${designSystemContract.interaction.adopted_in}`,
  },
  {
    href: '/labs/takt',
    title: 'Lab Two · Takt',
    meta: `Source lab · interface-feel rules adopted in v${designSystemContract.takt.adopted_in}`,
  },
  {
    href: '/labs/cadence',
    title: 'Lab Three · Cadence',
    meta: `Source lab · typography rules adopted in v${designSystemContract.cadence.adopted_in}`,
  },
  {
    href: '/labs/acoustics',
    title: 'Lab Four · Acoustics',
    meta: `Source lab · interaction-sound rules adopted in v${designSystemContract.acoustic.adopted_in}`,
  },
  {
    href: '/review/poise',
    title: 'Field check · Poise',
    meta: 'Kit One review that supported adoption',
  },
  {
    href: '/review/takt',
    title: 'Field check · Takt',
    meta: 'Kit One review that supported adoption',
  },
  {
    href: '/review/cadence',
    title: 'Field check · Cadence',
    meta: 'Kit One review that supported adoption',
  },
  {
    href: '/review/acoustics',
    title: 'Field check · Acoustics',
    meta: 'Kit One review of Lab Four',
  },
  {
    href: '/review/designesy-org',
    title: 'Public review',
    meta: 'Field check of designesy.org against this contract',
  },
  {
    href: '/score',
    title: 'Live verification',
    meta: `Score any URL against this contract: ${ENGINE_CHECK_COUNT} checks, one grade`,
  },
];

// The comparison's "Not covered" cells: an absence, so they read dim after a
// drawn dash, never in the ink of a real value.
const ABSENT = 'Not covered';

const COMPARISON: { layer: string; designMd: string; ours: string }[] = [
  { layer: 'Tokens', designMd: 'YAML frontmatter', ours: 'DTCG 2025.10 JSON + CORS endpoint' },
  { layer: 'Rationale prose', designMd: '9 markdown sections', ours: 'Adoption narratives + lab provenance' },
  { layer: 'Verification', designMd: 'CLI linter + WCAG contrast', ours: `${ENGINE_CHECK_COUNT} automated checks, live score engine` },
  { layer: 'Anti-generic detection', designMd: ABSENT, ours: '12 anti-generic tells (AI sameness)' },
  { layer: 'Acoustic cues', designMd: ABSENT, ours: '10 named cue tokens + mapping rules' },
  { layer: 'Interface-feel (takt)', designMd: ABSENT, ours: 'Press scale, hit area, stagger rhythm' },
  { layer: 'Copywriting', designMd: ABSENT, ours: '16 UX copy principles, 4 as checks (v38 to v41)' },
  { layer: 'Motion', designMd: 'Duration + easing', ours: 'Spring physics + 3-tier reduced-motion' },
  { layer: 'Provenance', designMd: ABSENT, ours: 'Source labs, adopted_in versions, external ingests' },
  { layer: 'Live proof', designMd: ABSENT, ours: 'designesy.org/score: any URL, live grade' },
  { layer: 'Agent skill', designMd: 'Reads the markdown', ours: 'SKILL.md format + MCP contract endpoint' },
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
            `A reference format for AI-readable design contracts — tokens, motion, components, ${ENGINE_CHECK_COUNT} verification checks, acoustic cues, takt, copywriting, and adopted Poise + Takt + Cadence + Acoustics rules. Richer than design.md.`,
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
            A reference format for AI-readable design contracts, version {c.version}.
          </p>
          <p className="surface-note">
            design.md (Google Labs, 26k+ stars) is the input layer: tokens and
            prose an agent reads to generate UI. This contract is input{' '}
            <em>plus</em> verification: {ENGINE_CHECK_COUNT} automated checks that prove the
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
          <AgentActions mdPath="/contracts/design-system.md" label="the design system contract" />
        </section>

        <section className="doctrine-section fade-up">
          <h2 className="doctrine-heading">What this contract is</h2>
          <div className="definition">
            <p className="definition-label">Operating agreement</p>
            <p>
              A Designesy contract answers exact value, role, application,
              behavior, avoidance, and verification. It is public artifact
              discipline. It is not legal advice or a client service agreement.
            </p>
          </div>
        </section>

        <section className="doctrine-section fade-up">
          <h2 className="doctrine-heading">
            Beyond design.md: the verification layer
          </h2>
          <p className="surface-note" style={{ marginBottom: '1.25rem' }}>
            Google Labs&rsquo; design.md (alpha, Apache-2.0, 26k+ stars) is a strong
            input format: YAML tokens + markdown prose that an agent reads to
            generate UI. Designesy extends that model with layers design.md does
            not carry. They are complementary: design.md is the brief; this
            contract is the brief and the proof.
          </p>
          <div className="token-table ds-labelled" role="table" aria-label="Designesy contract vs design.md">
            <div className="token-table-head" role="row">
              <span role="columnheader">Layer</span>
              <span role="columnheader">design.md</span>
              <span role="columnheader">This contract</span>
            </div>
            {COMPARISON.map((row) => (
              <div className="token-table-row" role="row" key={row.layer}>
                <code role="cell">{row.layer}</code>
                {row.designMd === ABSENT ? (
                  <span role="cell" data-label="design.md" className="ds-absent">
                    <span className="ds-dash" aria-hidden="true" />
                    {ABSENT}
                  </span>
                ) : (
                  <span role="cell" data-label="design.md">
                    {row.designMd}
                  </span>
                )}
                <span role="cell" data-label="This contract">
                  {row.ours}
                </span>
              </div>
            ))}
          </div>
          <p className="surface-note" style={{ marginTop: '1.25rem' }}>
            The gap design.md leaves open is the same gap every AI coding agent
            leaves open: <strong>generation is not verification</strong>. An
            agent can read a token file and still ship hardcoded hex, broken
            contrast, or the AI-default look. The {ENGINE_CHECK_COUNT}-check engine closes that
            gap. With 42% of committed React now AI-generated (Belitsoft, State
            of React Development 2026), the score is the compliance layer: it
            checks the shipped design against the rules the agent was given.
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
          <div className="token-table ds-labelled" role="table" aria-label="Core color tokens">
            <div className="token-table-head" role="row">
              <span role="columnheader">Token</span>
              <span role="columnheader">Value</span>
              <span role="columnheader">Role</span>
            </div>
            {COLOR_PREVIEW.map((row) => (
              <div className="token-table-row" role="row" key={row.token}>
                <code role="cell">{row.token}</code>
                <code role="cell" className="token-value" data-label="Value">
                  {row.value}
                </code>
                <span role="cell" data-label="Role">
                  {row.role}
                </span>
              </div>
            ))}
          </div>
        </section>

        <section className="doctrine-section fade-up">
          <h2 className="doctrine-heading">Surfaces</h2>
          <div className="row-stack" role="list">
            {SURFACES.map((row, i) => (
              <div role="listitem" key={row.href}>
                <Link
                  href={row.href}
                  className="row"
                  data-cuelume-hover="whisper"
                  data-cuelume-press
                >
                  <span className="row-index">{String(i + 1).padStart(2, '0')}</span>
                  <span className="row-body">
                    <span className="row-title">{row.title}</span>
                    <span className="row-meta">{row.meta}</span>
                  </span>
                  <span className="row-side">
                    <span className="row-side-line">{row.href}</span>
                    <span className="row-side-arrow" aria-hidden="true" />
                  </span>
                </Link>
              </div>
            ))}
          </div>
        </section>

        <section className="doctrine-section fade-up">
          <h2 className="doctrine-heading">
            Poise{' '}
            <span className="ds-adopted">adopted in v{c.interaction.adopted_in}</span>
          </h2>
          <div className="definition">
            <p>
              Lab One portable rules are contract material: wordmark breath,
              press settle, sound preference ownership, reduced motion, hover
              media discipline, and human public naming. Motion philosophy
              cross-referenced against Kowalski /emil-design-eng (Linear,
              ex-Vercel): frequency gate and unseen-details-compound principle.
              Spring physics and interruptibility cross-referenced
              against Kowalski /apple-design (Apple WWDC). Anti-over-animation
              Gate (Frequency, Purpose, Speed, Function) cross-referenced
              against Kowalski /find-animation-opportunities. Animation
              authoring (7-step build sequence and Never Ship table)
              cross-referenced against Kowalski /animate. Silence was not
              adoption; that version was the explicit order.
            </p>
          </div>
          <CheckGrid items={checkItemsFromStrings(c.interaction.rules)} />
        </section>

        <section className="doctrine-section fade-up">
          <h2 className="doctrine-heading">
            Takt{' '}
            <span className="ds-adopted">adopted in v{c.takt.adopted_in}</span>
          </h2>
          <div className="definition">
            <p>
              Lab Two portable rules are contract material: concentric radii,
              press scale (0.96 for cells, 0.985 for cards), image outlines,
              hit area floor, stagger rhythm, no transition:all, and spare
              will-change. Rules compiled from external design intelligence
              (Amicro, Krehel /better-ui, /better-accessibility for hit area
              floors) and verified on live CSS. Silence was not adoption; this
              version is the explicit order.
            </p>
          </div>
          <CheckGrid items={checkItemsFromStrings(c.takt.rules)} />
        </section>

        <section className="doctrine-section fade-up">
          <h2 className="doctrine-heading">
            Cadence{' '}
            <span className="ds-adopted">adopted in v{c.cadence.adopted_in}</span>
          </h2>
          <div className="definition">
            <p>
              Lab Three portable rules are contract material: font smoothing
              on root, rem-based scale, line-height by role, tracking by size,
              measure cap, text-wrap balance and pretty, tabular numbers,
              ::selection with --signal, user-select on UI chrome, and 16px
              input floor. Rules compiled from external typography intelligence
              (Krehel /better-typography, /better-layout for reading order and
              measure) and verified on live CSS. Three open tensions were
              documented at adoption: font-synthesis and underline-from-font
              have since closed, and logical properties stays open. Silence was
              not adoption; this version is the explicit order.
            </p>
          </div>
          <CheckGrid items={checkItemsFromStrings(c.cadence.rules)} />
        </section>

        <section className="doctrine-section fade-up">
          <h2 className="doctrine-heading">
            Acoustics{' '}
            <span className="ds-adopted">adopted in v{c.acoustic.adopted_in}</span>
          </h2>
          <div className="definition">
            <p>
              Lab Four portable rules are contract material: ten named cue
              tokens (--cue:brand through --cue:contact), one primary cue
              family per role, opt-in sound with localStorage preference,
              fine-pointer hover discipline, no focus sounds, no ambient
              audio, silent fallback when Web Audio is blocked, and
              reduced-motion as an acoustic-reduction proxy. Engine: {c.acoustic.engine}.
              Silence was not adoption; this version is the explicit order.
            </p>
          </div>
          <CheckGrid items={checkItemsFromStrings(c.acoustic.mapping_rules)} />
        </section>

        <section className="doctrine-section fade-up">
          <h2 className="doctrine-heading">
            Copywriting{' '}
            <span className="ds-adopted">adopted in v{c.copywriting.adopted_in}</span>
          </h2>
          <div className="definition">
            <p>
              UX copy principles from NN/g, Polaris, IBM Carbon, Microsoft
              Fluent, Apple HIG, and Atlassian. Gap source:{' '}
              <a
                href="https://detail.design"
                // Underlined: inside a sentence, color alone does not mark a
                // link (WCAG 1.4.1; axe link-in-text-block measured 1.93:1
                // against the light theme's paragraph ink).
                style={{ color: 'var(--signal-text)', textDecoration: 'underline', textUnderlineOffset: '0.15em' }}
              >
                detail.design
              </a>{' '}
              Copywriting discipline. 16 principles across button text, error
              messages, empty states, link text, general microcopy, and voice &
              tone. 4 codifiable principles are verification checks (v38 to v41);
              12 are governance. Verb-first buttons, descriptive links, and
              one capitalization policy cross-referenced against Krehel
              /better-writing. Empty states, placeholder-as-example, and
              toggle ON-state labeling from Krehel /better-writing. Tooling:
              Vale, textlint, alex.
            </p>
          </div>
          <CheckGrid items={checkItemsFromStrings(c.copywriting.principles)} />
        </section>

        <div className="status-note">
          Design system contract v{c.version}: a reference format for
          AI-readable design contracts. Input plus
          verification: {ENGINE_CHECK_COUNT} automated checks on top of tokens
          and prose. Live styles remain authoritative
          when they and this contract disagree. Human and machine surfaces stay
          synchronized.
        </div>
      </main>

      <Footer />
    </>
  );
}
