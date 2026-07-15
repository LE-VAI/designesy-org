import type { Metadata } from 'next';
import Link from 'next/link';
import { Topbar } from '../lib/topbar';
import { Footer } from '../lib/footer';
import { CheckGrid } from '../lib/check-grid';
import { checkItemsFromStrings } from '../lib/check-items';
import { pageMeta } from '../lib/site-meta';

export const metadata: Metadata = pageMeta({
  title: 'Contracts',
  description:
    'Designesy Contracts — portable design agreements with exact values, roles, behavior, anti-patterns, and verification. Design system v0.1.4 is public (Poise + Takt + Cadence adopted).',
  path: '/contracts',
  ogDescription:
    'Portable design agreements for people and agents. Design system contract v0.1.4 is live — Poise, Takt, and Cadence rules adopted.',
  twitterDescription:
    'Portable design judgment — designesy.org/contracts/design-system',
});

const CONTRACT_CONTENTS = [
  'Source and provenance',
  'Primitive tokens',
  'Semantic tokens',
  'Typography rules',
  'Spacing and layout rules',
  'Shape and surface rules',
  'Component behavior and states',
  'Accessibility requirements',
  'Motion and reduced-motion guidance',
  'Anti-patterns',
  'Implementation notes',
  'Verification criteria',
  'Open tensions',
];

const CONTRACT_ANTI = [
  'Prose-only style guides with no exact values',
  'Token dumps with no rationale',
  'Component values that duplicate raw colors instead of referencing roles',
  'Rules that do not change implementation behavior',
  'Public copy pretending the contract is more mature than it is',
  'Treating screenshots as final proof without visual and accessibility checks',
];

const PRIMITIVE_COLORS = [
  { token: '--ink', value: '#ffffff', role: 'Primary text / foreground' },
  { token: '--muted', value: '#a0a0a0', role: 'Secondary text' },
  { token: '--muted-dim', value: '#6b6b6b', role: 'Tertiary / meta text' },
  { token: '--paper', value: '#000000', role: 'Page background' },
  { token: '--surface', value: '#0a0a0a', role: 'Card / panel base' },
  { token: '--surface-raised', value: '#111111', role: 'Elevated surface' },
  { token: '--signal', value: '#0133cb', role: 'Brand signal accent' },
  { token: '--signal-light', value: '#3358e8', role: 'Signal hover / focus lift' },
  { token: '--activation', value: '#fecc34', role: 'Activation highlight (reserved)' },
];

const PRIMITIVE_SURFACES = [
  { token: '--surface-soft', value: 'rgba(255, 255, 255, 0.03)', role: 'Soft fill / note background' },
  { token: '--surface-hover', value: 'rgba(255, 255, 255, 0.06)', role: 'Hover wash' },
  { token: '--line', value: 'rgba(255, 255, 255, 0.12)', role: 'Default border' },
  { token: '--line-strong', value: 'rgba(255, 255, 255, 0.22)', role: 'Emphasized border' },
  { token: '--line-faint', value: 'rgba(255, 255, 255, 0.06)', role: 'Subtle divider' },
  { token: '--signal-dim', value: 'rgba(1, 51, 203, 0.14)', role: 'Signal wash / badge fill' },
];

const PRIMITIVE_SHAPE_MOTION = [
  { token: '--radius', value: '6px', role: 'Default corner radius' },
  { token: '--radius-sm', value: '4px', role: 'Compact controls / nav chips' },
  { token: '--maxw', value: '1080px', role: 'Content shell max width' },
  { token: '--duration', value: '0.6s', role: 'Primary entrance duration' },
  { token: '--ease', value: 'cubic-bezier(0.22, 0.61, 0.36, 1)', role: 'Default ease' },
  { token: '--ease-out', value: 'cubic-bezier(0.23, 1, 0.32, 1)', role: 'Exit / settle' },
  { token: '--ease-in-out', value: 'cubic-bezier(0.77, 0, 0.175, 1)', role: 'Symmetric motion' },
  { token: '--ease-drawer', value: 'cubic-bezier(0.32, 0.72, 0, 1)', role: 'Drawer / panel slide' },
];

const SPACING_RULES = [
  { name: 'Shell horizontal', value: '1.5rem (1rem ≤560px)', note: '.site-shell / .surface-page' },
  { name: 'Section vertical', value: '3.5rem / 3rem doctrine', note: '.section / .doctrine-section' },
  { name: 'Card padding', value: '1.25–1.5rem', note: 'pillars, surfaces, items' },
  { name: 'Grid gap', value: '0.75–1rem', note: 'pillar / surface grids' },
  { name: 'Control min height', value: '42px buttons, 32px sound toggle', note: 'touch-friendly targets' },
  { name: 'Breakpoints', value: '860px · 720px · 560px', note: 'grids · topbar · single-column' },
];

const TYPOGRAPHY_RULES = [
  'Body: 16px / 1.55, system stack (-apple-system, BlinkMacSystemFont, Inter, Segoe UI, Arial, Helvetica, sans-serif)',
  'Headings: weight 700, line-height 1.08, letter-spacing -0.02em',
  'Hero wordmark: clamp(3.2rem, 9vw, 5.5rem), weight 800, tracking -0.04em',
  'Eyebrows: 0.72–0.75rem, weight 600, uppercase, letter-spacing 0.18em, muted-dim',
  'Lede: 1.1–1.5rem, weight 500, ink — one clear claim, not a paragraph stack',
  'Supporting note: 0.85–0.95rem, muted, max-width ~520–580px',
  'Never invent decorative display fonts for public UI; system stack is the contract',
];

const COMPONENT_STATES = [
  { name: 'Primary button', states: 'default signal fill · hover signal-light · active scale(0.97) · focus-visible 2px signal-light' },
  { name: 'Ghost button', states: 'transparent + line-strong · hover surface-hover · active scale(0.97)' },
  { name: 'Nav link', states: 'muted · hover ink + surface-hover · sticky topbar blur when scrolled' },
  { name: 'Card / pillar', states: 'surface + line · hover raised + line-strong · active scale(0.985); lift only on fine pointer hover' },
  { name: 'Sound toggle', states: 'aria-pressed sync · pressed shows signal-light · Cuelume setEnabled(true|false)' },
  { name: 'Definition block', states: 'bordered surface · hover line-strong · label uppercase muted-dim' },
];

const A11Y_REQUIREMENTS = [
  'html lang="en"; meaningful page titles via metadata template',
  'Focus-visible: 2px solid --signal-light, offset 2px',
  'Sound control exposes aria-label, aria-pressed, and title',
  'Decorative glyphs (sound icon, arrows) use aria-hidden where text is already labeled',
  'Prefer semantic landmarks: sticky header, main, footer',
  'Do not rely on color alone for state; pair with label, border, or weight change',
  'Respect prefers-reduced-motion: collapse animations/transitions to near-zero duration',
  'Scroll padding-top 4rem so in-page anchors clear the sticky topbar',
];

const MOTION_RULES = [
  'Entrance: fadeUp 0.6s --ease with staggered delays (0.08s steps)',
  'Interactive settle: 160ms --ease-out on press scale',
  'Hover lift only under (hover: hover) and (pointer: fine) — no fake hover on touch',
  'Wordmark signal pulse: opacity heartbeat only; no blur glow, no gradient blobs',
  'prefers-reduced-motion: reduce → disable non-essential motion; sound defaults off as acoustic proxy',
];

const ANTI_PATTERNS = [
  'Glowing blobs, random gradients, or AI sparkles as decoration',
  'Hard-coded hex in components when a role token exists',
  'Using --activation as general decoration instead of reserved activation',
  'Publishing "modern/clean/premium" language without operational rules',
  'Multiple simultaneous accent colors competing with --signal',
  'Touch targets under ~32px or full-width buttons that skip on mobile',
  'Animation that cannot be reduced',
];

const IMPLEMENTATION_NOTES = [
  'Single live token source of truth — no secondary theme framework',
  'Server-rendered by default; client only for sound, bind, and preference controls',
  'metadataBase is https://www.designesy.org (apex redirects); public label is Designesy',
  'Interaction audio via Cuelume; middle-click guard is required',
  'Sitemap and robots follow standard site conventions',
  'Production deploys from the main branch',
];

const VERIFICATION = [
  'Token values in this contract match the live site foundation',
  'All five routes render without horizontal overflow at 375px, 720px, 860px, 1080px+',
  'Primary interactive elements show focus-visible rings',
  'Sound toggle flips aria-pressed and applies the audio preference',
  'prefers-reduced-motion disables entrance and wordmark breath',
  'Contrast: ink on paper, muted on paper, accent on paper remain readable',
  'No public surface displays internal control-plane naming',
];

const OPEN_TENSIONS = [
  'Light theme is not contracted — dark technical foundation is provisional doctrine',
  '--activation exists but has limited public surface usage; needs role discipline',
  'Inter is named in the stack but not self-hosted; system fallback is intentional for now',
  'Shadow tokens exist; elevation language is still light-touch (borders lead, shadows secondary)',
  'Human contract page and machine export remain dual sources until a single generator owns both',
  'Block-axis logical properties not yet migrated — direction-ready is partial (inline-axis only)',
  'border-inline-start not yet used — decorative borders still physical',
];

function TokenTable({
  rows,
}: {
  rows: { token: string; value: string; role: string }[];
}) {
  return (
    <div className="token-table" role="table" aria-label="Design tokens">
      <div className="token-table-head" role="row">
        <span role="columnheader">Token</span>
        <span role="columnheader">Value</span>
        <span role="columnheader">Role</span>
      </div>
      {rows.map((row) => (
        <div className="token-table-row" role="row" key={row.token}>
          <code role="cell">{row.token}</code>
          <code role="cell" className="token-value">
            {row.value}
          </code>
          <span role="cell">{row.role}</span>
        </div>
      ))}
    </div>
  );
}

export default function ContractsPage() {
  return (
    <>
      <Topbar scrolled />

      <main id="main-content" className="surface-page">
        <section className="surface-header fade-up">
          <p className="surface-eyebrow" data-scramble>Operating rules</p>
          <h1 className="surface-title" data-scramble>Contracts</h1>
          <p className="surface-lede">
            Design contracts turn principles into reusable operating rules for
            artifacts, interfaces, and review.
          </p>
          <p className="surface-note">
            Designesy Contracts are portable design agreements that let people
            and agents carry design judgment across tools, sessions, codebases,
            and artifacts. They make design judgment inspectable — not reliant
            on slogans or vibes.
          </p>
          <div className="hero-actions" style={{ marginTop: '1.75rem' }}>
            <Link
              className="button primary"
              href="/contracts/design-system"
              data-cuelume-press
              data-cuelume-release
            >
              Contract home
            </Link>
            <Link
              className="button ghost"
              href="/contracts/design-system.json"
              data-cuelume-press
              data-cuelume-release
            >
              Machine export
            </Link>
          </div>
        </section>

        <section className="doctrine-section fade-up">
          <h2 className="doctrine-heading">Published now</h2>
          <div className="row-stack" role="list">
            <Link
              href="/contracts/design-system"
              className="row"
              role="listitem"
              data-cuelume-hover="whisper"
              data-cuelume-press
              data-cuelume-release
            >
              <span className="row-index">01</span>
              <span className="row-body">
                <span className="row-title">Design system · v0.1.4</span>
                <span className="row-meta">
                  Human overview, full tables below, machine JSON export
                </span>
              </span>
            </Link>
            <Link
              href="/labs/poise"
              className="row"
              role="listitem"
              data-cuelume-hover="whisper"
              data-cuelume-press
              data-cuelume-release
            >
              <span className="row-index">02</span>
              <span className="row-body">
                <span className="row-title">Poise adopted</span>
                <span className="row-meta">
                  Lab One interaction rules adopted in contract v0.1.1
                </span>
              </span>
            </Link>
            <Link
              href="/labs/takt"
              className="row"
              role="listitem"
              data-cuelume-hover="whisper"
              data-cuelume-press
              data-cuelume-release
            >
              <span className="row-index">03</span>
              <span className="row-body">
                <span className="row-title">Takt adopted</span>
                <span className="row-meta">
                  Lab Two interface-feel rules adopted in contract v0.1.2
                </span>
              </span>
            </Link>
            <Link
              href="/review/designesy-org"
              className="row"
              role="listitem"
              data-cuelume-hover="whisper"
              data-cuelume-press
              data-cuelume-release
            >
              <span className="row-index">04</span>
              <span className="row-body">
                <span className="row-title">Field check</span>
                <span className="row-meta">
                  Live site reviewed against this contract
                </span>
              </span>
            </Link>
          </div>
        </section>

        <section className="doctrine-section fade-up">
          <h2 className="doctrine-heading">Why contracts matter</h2>
          <div className="definition">
            <p className="definition-label">The question a contract answers</p>
            <p>
              What exact value should I use? Why does this value exist? Where may
              this value be applied? What behavior does this component need?
              What should I avoid? How do I know if I broke the system?
            </p>
          </div>
          <p className="surface-note">
            A useful contract helps a future agent or team member answer all of
            these without relearning the design system from scratch. Contracts
            are the operational bridge between philosophy and execution.
          </p>
        </section>

        <section className="doctrine-section fade-up">
          <h2 className="doctrine-heading">Contract contents</h2>
          <p className="surface-note" style={{ marginBottom: '1.5rem' }}>
            A Designesy Contract should include all of the following —
            structured values for machines, rationale for humans, and
            verification criteria for both.
          </p>
          <CheckGrid dense items={checkItemsFromStrings(CONTRACT_CONTENTS)} />
        </section>

        <section className="doctrine-section fade-up">
          <h2 className="doctrine-heading">Contract discipline</h2>
          <p className="surface-note" style={{ marginBottom: '1.5rem' }}>
            Keep upstream-compatible schema names visible when compatibility
            matters: <code style={{ color: 'var(--ink)' }}>colors</code>,{' '}
            <code style={{ color: 'var(--ink)' }}>typography</code>,{' '}
            <code style={{ color: 'var(--ink)' }}>rounded</code>,{' '}
            <code style={{ color: 'var(--ink)' }}>spacing</code>,{' '}
            <code style={{ color: 'var(--ink)' }}>components</code>. Use local
            extensions for doctrine, review, provenance, agent instructions, and
            verification — but do not hide the standard contract from tools.
          </p>
          <h3
            style={{
              fontSize: '0.9rem',
              fontWeight: 700,
              color: 'var(--ink)',
              marginBottom: '0.75rem',
            }}
          >
            Anti-patterns
          </h3>
          <CheckGrid items={checkItemsFromStrings(CONTRACT_ANTI, { avoid: true })} />
        </section>

        {/* ========== Published contract ========== */}
        <section className="doctrine-section fade-up" id="design-system-contract">
          <h2 className="doctrine-heading">Published contract</h2>
          <div className="definition">
            <p className="definition-label">Designesy design system · v0.1.4</p>
            <p>
              Public design contract for designesy.org. Derived from the live
              site token foundation, with Lab One · Poise, Lab Two · Takt, and
              Lab Three · Cadence rules adopted. Provisional, doctrine-referenced, and
              meant to be verified against the running site — not a frozen brand
              bible.
            </p>
          </div>
          <p className="surface-note" style={{ marginTop: '1rem' }}>
            Contract home ·{' '}
            <Link href="/contracts/design-system">
              /contracts/design-system
            </Link>
            {' · '}
            Machine export ·{' '}
            <Link href="/contracts/design-system.json">
              /contracts/design-system.json
            </Link>
            {' · '}
            Public review ·{' '}
            <Link href="/review/designesy-org">/review/designesy-org</Link>
          </p>
        </section>

        <section className="doctrine-section fade-up">
          <h2 className="doctrine-heading">01 · Source and provenance</h2>
          <CheckGrid items={[
              {
                title: 'Public implementation',
                meta: 'designesy.org (Next.js App Router)',
              },
              {
                title: 'Token source',
                meta: 'Live site design tokens',
              },
              {
                title: 'Doctrine lineage',
                meta: 'Designesy design doctrine — operational values only on the public surface',
              },
              {
                title: 'Motion references',
                meta: 'Short settle language adapted into --ease-out, --ease-in-out, --ease-drawer',
              },
              {
                title: 'Interaction audio',
                meta: 'Cuelume v0.1.0 — preference owned by Designesy',
              },
              {
                title: 'Contract status',
                meta: 'Public v0.1.4 — Poise, Takt, and Cadence rules adopted',
              },
            ]} />
        </section>

        <section className="doctrine-section fade-up">
          <h2 className="doctrine-heading">02 · Primitive tokens</h2>
          <p className="surface-note" style={{ marginBottom: '1rem' }}>
            Colors (exact values)
          </p>
          <TokenTable rows={PRIMITIVE_COLORS} />
          <p className="surface-note" style={{ margin: '1.5rem 0 1rem' }}>
            Surfaces and lines
          </p>
          <TokenTable rows={PRIMITIVE_SURFACES} />
          <p className="surface-note" style={{ margin: '1.5rem 0 1rem' }}>
            Shape, shell, motion primitives
          </p>
          <TokenTable rows={PRIMITIVE_SHAPE_MOTION} />
          <p className="surface-note" style={{ marginTop: '1.5rem' }}>
            Shadows (supporting elevation, borders lead):{' '}
            <code style={{ color: 'var(--ink)' }}>--shadow-sm</code> 0 1px 3px
            rgba(0,0,0,0.4) · <code style={{ color: 'var(--ink)' }}>--shadow-md</code>{' '}
            0 8px 30px rgba(0,0,0,0.35) ·{' '}
            <code style={{ color: 'var(--ink)' }}>--shadow-lg</code> 0 24px 80px
            rgba(0,0,0,0.5)
          </p>
        </section>

        <section className="doctrine-section fade-up">
          <h2 className="doctrine-heading">03 · Semantic tokens</h2>
          <div className="doctrine-cols">
            <div className="definition">
              <p className="definition-label">Surface roles</p>
              <p>
                paper = page void · surface = default panel · surface-raised =
                hover/emphasis panel · surface-soft = quiet note fill ·
                surface-hover = interactive wash
              </p>
            </div>
            <div className="definition">
              <p className="definition-label">Line roles</p>
              <p>
                line = default structure · line-strong = active/emphasis edge ·
                line-faint = quiet subdivision
              </p>
            </div>
            <div className="definition">
              <p className="definition-label">Signal roles</p>
              <p>
                signal = brand action and wordmark dot · signal-light = hover and
                focus lift · signal-dim = badge/wash · activation = reserved
                highlight, not general chrome
              </p>
            </div>
            <div className="definition">
              <p className="definition-label">Type roles</p>
              <p>
                ink = primary claim · muted = supporting body · muted-dim =
                eyebrows, meta, footers
              </p>
            </div>
          </div>
        </section>

        <section className="doctrine-section fade-up">
          <h2 className="doctrine-heading">04 · Typography rules</h2>
          <ul className="principle-list">
            {TYPOGRAPHY_RULES.map((rule, i) => (
              <li className="principle" key={rule}>
                <span className="principle-num">
                  {String(i + 1).padStart(2, '0')}
                </span>
                <div className="principle-body">
                  <p>{rule}</p>
                </div>
              </li>
            ))}
          </ul>
        </section>

        <section className="doctrine-section fade-up">
          <h2 className="doctrine-heading">05 · Spacing and layout rules</h2>
          <TokenTable
            rows={SPACING_RULES.map((r) => ({
              token: r.name,
              value: r.value,
              role: r.note,
            }))}
          />
          <p className="surface-note" style={{ marginTop: '1.5rem' }}>
            Layout doctrine: one max-width shell, editorial vertical rhythm,
            grids collapse before type becomes unreadable. Prefer fewer columns
            over cramped four-up layouts on mid widths.
          </p>
        </section>

        <section className="doctrine-section fade-up">
          <h2 className="doctrine-heading">06 · Shape and surface rules</h2>
          <CheckGrid items={checkItemsFromStrings([
              'Default radius 6px; compact controls 4px — no pill inflation',
              'Borders define structure first; shadows are secondary depth',
              'Dark technical foundation: paper black, surfaces near-black',
              'One signal accent family; do not invent secondary brand hues',
              'Cards stay flat until interaction — lift is earned on hover',
              'Status notes use soft surface + line, not loud callout chrome',
            ])} />
        </section>

        <section className="doctrine-section fade-up">
          <h2 className="doctrine-heading">07 · Component behavior and states</h2>
          <div className="principle-list">
            {COMPONENT_STATES.map((item, i) => (
              <div className="principle" key={item.name}>
                <span className="principle-num">
                  {String(i + 1).padStart(2, '0')}
                </span>
                <div className="principle-body">
                  <h3>{item.name}</h3>
                  <p>{item.states}</p>
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="doctrine-section fade-up">
          <h2 className="doctrine-heading">08 · Accessibility requirements</h2>
          <CheckGrid items={checkItemsFromStrings(A11Y_REQUIREMENTS)} />
        </section>

        <section className="doctrine-section fade-up">
          <h2 className="doctrine-heading">09 · Motion and reduced-motion</h2>
          <CheckGrid items={checkItemsFromStrings(MOTION_RULES)} />
        </section>

        <section className="doctrine-section fade-up">
          <h2 className="doctrine-heading">10 · Anti-patterns</h2>
          <CheckGrid items={checkItemsFromStrings(ANTI_PATTERNS, { avoid: true })} />
        </section>

        <section className="doctrine-section fade-up">
          <h2 className="doctrine-heading">11 · Implementation notes</h2>
          <CheckGrid items={checkItemsFromStrings(IMPLEMENTATION_NOTES)} />
        </section>

        <section className="doctrine-section fade-up">
          <h2 className="doctrine-heading">12 · Verification criteria</h2>
          <CheckGrid items={checkItemsFromStrings(VERIFICATION)} />
        </section>

        <section className="doctrine-section fade-up">
          <h2 className="doctrine-heading">13 · Open tensions</h2>
          <CheckGrid items={checkItemsFromStrings(OPEN_TENSIONS, { avoid: true })} />
        </section>

        <div className="status-note">
          Designesy design system contract v0.1.4 — public artifact discipline,
          not legal advice or a client service agreement. Values are taken from
          the live site tokens. Poise, Takt, and Cadence rules are adopted. Contract
          home:{' '}
          <Link href="/contracts/design-system">/contracts/design-system</Link>
          {' · '}
          Machine export:{' '}
          <Link href="/contracts/design-system.json">
            /contracts/design-system.json
          </Link>
          . When the human page and the live styles disagree, the live styles are
          authoritative until the contract is revised. Human and machine surfaces
          stay synchronized.
        </div>
      </main>

      <Footer />
    </>
  );
}
