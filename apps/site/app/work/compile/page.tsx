import type { Metadata } from 'next';
import Link from 'next/link';
import { Topbar } from '../../lib/topbar';
import { Footer } from '../../lib/footer';
import { CheckGrid } from '../../lib/check-grid';
import { checkItemsFromStrings } from '../../lib/check-items';
import { ToggleRow } from '../../lib/toggle-row';
import { pageMeta } from '../../lib/site-meta';

export const metadata: Metadata = pageMeta({
  title: 'Compile — case study',
  description:
    'Principle compiler — takes plain language and compiles it into verifiable design contracts. Built and locally verified. Demonstrates the Sources to Contracts to Tools chain.',
  path: '/work/compile',
  ogTitle: 'Compile · case study',
  ogDescription:
    'A principle compiled into tokens, a test, and a checklist. Built, verified, pending hosting. From contract to tool.',
  twitterDescription: 'Compile case study — designesy.org/work/compile',
  type: 'article',
});

const DIMENSIONS = [
  {
    num: '01',
    title: 'Purpose',
    observation:
      'Compile states a single thesis: a principle can be compiled into tokens, a test, and a checklist, the same way source code compiles into a binary. No existing tool does this — palette tools give swatches, Lighthouse checks performance, linters check syntax. Nothing takes a plain-language design principle and outputs a verifiable contract.',
    judgment:
      'Purpose is sharp and genuinely uncrowded. The tool demonstrates the Sources to Principles to Contracts to Tools chain in a way no competitor does.',
    action: 'Keep. The thesis is the moat — do not dilute it by adding generic design-tool features.',
  },
  {
    num: '02',
    title: 'Clarity',
    observation:
      'One input. Four output tabs: Contract, Verify, Review, Anti-patterns. A live preview shows compiled tokens applied to a UI skeleton. Exportable as a ZIP (contract.md, verify.js, tokens.css, README.txt).',
    judgment:
      'Clarity is strong. The tool does one thing and shows its work. The four-tab structure maps to the contract contents list.',
    action: 'Keep the four-tab structure. Do not add tabs that do not map to contract contents.',
  },
  {
    num: '03',
    title: 'Context',
    observation:
      'Self-contained single index.html, no framework, no CDN, no backend. Follows the Tile and Continuity deployment pattern exactly. Built and verified locally. Pending hosting on GitHub Pages.',
    judgment:
      'Context is ready. The deployment pattern is proven. The only blocker is hosting — no technical barrier remains.',
    action: 'Host on GitHub Pages (LE-VAI/compile). Generate the OG image. Publish with the proven one-word + screen-recording format.',
  },
  {
    num: '04',
    title: 'Inclusion',
    observation:
      'Dark default, reduced-motion safe, mobile responsive. System font stack. No required audio or motion. Compilation engine covers seven design domains: motion, color, typography, spacing, shape, interaction, acoustic.',
    judgment:
      'Inclusion is structural. The seven-domain coverage means acoustic and interaction are first-class, not afterthoughts. No other tool compiles acoustic tokens.',
    action: 'Keep the seven-domain coverage. The acoustic domain is a Designesy differentiator.',
  },
  {
    num: '05',
    title: 'System coherence',
    observation:
      'The compilation engine derives tokens from Designesy DESIGN.md v0.2.0. The output contract structure matches the Designesy contract contents list. The review checklist generates all eight Designesy review dimensions. The tool IS the Lab — its output satisfies the 10-cell Lab anatomy.',
    judgment:
      'Coherence is the strongest dimension. The tool is the pipeline made visible: a principle goes in, a contract comes out. The Lab anatomy mapping is self-documenting.',
    action: 'Keep the DESIGN.md derivation explicit. When the contract moves to v0.4.0, update the compilation engine.',
  },
  {
    num: '06',
    title: 'Durability',
    observation:
      'Full BRIEF documents intent, thesis, feel, what it does, the seven-domain engine, the Lab anatomy mapping, and the substitute test. STATUS.md tracks all build items (all marked built) and pending items (OG, hosting, screen recording, X staging, Lab Four registration). Nine verification tests passed.',
    judgment:
      'Durable as a built artifact. The documentation is the most complete of any tool in the set — it self-documents to the Lab anatomy.',
    action: 'Host, generate OG, record, publish. The tool is ready; the packaging is what remains.',
  },
  {
    num: '07',
    title: 'Delight',
    observation:
      'The delight moment is watching a plain-language principle compile into a structured contract with tokens, a verification script, and a review checklist. The live preview showing tokens applied to a UI skeleton makes the abstraction visible.',
    judgment:
      'Delight is earned — the tool makes the abstract concrete. Watching a principle become a contract is a genuine aha moment.',
    action: 'Keep the live preview. The preview is the demo — it shows the tool thinking.',
  },
  {
    num: '08',
    title: 'Responsibility',
    observation:
      'The tool includes a substitute test: four things you might do instead (ChatGPT, Figma tokens, Lighthouse, eslint) and why each fails to substitute. A local path leak in compiled output was found and fixed 2026-07-13.',
    judgment:
      'The substitute test names what the tool does not cover. The path leak is documented as a fixed issue.',
    action: 'Keep the substitute test visible. Document the security fix as a resolved issue.',
  },
];

const HOLDS = [
  'Thesis is uncrowded: compile principles into verifiable contracts — no substitute exists',
  'Seven-domain compilation engine: motion, color, typography, spacing, shape, interaction, acoustic',
  'Self-documenting: output satisfies the 10-cell Lab anatomy',
  'Nine verification tests passed across seven domains',
  'Zero-dependency deployment pattern — same as Tile and Continuity',
  'Security fix documented: local path leak in compiled output, found and fixed 2026-07-13',
];

const TENSIONS = [
  {
    title: 'Pending hosting and publication',
    meta: 'Built and verified locally, but not yet hosted on GitHub Pages or published on X',
  },
  {
    title: 'Lab Four registration gated',
    meta: 'Registration in the Designesy lab registry is pending source-root review',
  },
  {
    title: 'DESIGN.md derivation is v0.2.0',
    meta: 'The compilation engine derives from v0.2.0 — needs update when contract moves to v0.4.0',
  },
];

const CORRECTIONS = [
  {
    title: 'Host on GitHub Pages',
    meta: 'Create repo LE-VAI/compile, deploy as single index.html, generate OG image',
  },
  {
    title: 'Publish with the proven format',
    meta: 'One word + screen recording of the compilation + try-it reply',
  },
  {
    title: 'Update compilation engine to v0.4.0',
    meta: 'When the contract reconciles to DTCG v0.4.0, update the token derivation',
  },
];

const VERIFICATION = [
  'Local build inspected: compilation engine, four output tabs, live preview, ZIP export',
  'Nine test principles compiled across seven domains — all passed',
  'Security audit 2026-07-13: local path leak found, fixed, verified clean',
  'Compared to design system contract v0.2.0 token derivation',
  'Compared to Use Kit One Design Review output format',
  'Lab anatomy mapping verified: output satisfies all 10 cells',
  'Deployment pattern verified: matches Tile and Continuity exactly',
];

const SOURCES = [
  {
    href: '/kits/design-review',
    title: 'Use Kit One · Design Review',
    meta: 'Method and output format',
  },
  {
    href: '/contracts/design-system',
    title: 'Design system contract v0.4.0',
    meta: 'Governing tokens',
  },
  {
    href: '/work/tile',
    title: 'Tile — case study',
    meta: 'Comparison: shipped tool with proven format',
  },
  {
    href: '/review',
    title: 'Review surface',
    meta: 'Eight dimensions doctrine',
  },
  {
    href: '/work',
    title: 'Work — case studies',
    meta: 'Index',
  },
];

export default function CompileCaseStudyPage() {
  return (
    <>
      <Topbar scrolled />

      <main id="main-content" className="surface-page">
        <section className="surface-header fade-up">
          <p className="surface-eyebrow">
            <Link href="/work" className="lab-crumb">
              Work
            </Link>
            <span aria-hidden="true"> · </span>
            Case study
          </p>
          <h1 className="surface-title">Compile</h1>
          <p className="surface-lede">
            Principle compiler — turns plain language into verifiable design
            contracts.
          </p>
          <p className="surface-note">
            A tool that takes any plain-language design principle and compiles
            it into tokens, anti-patterns, a review checklist, and a portable
            verification script. Built and locally verified. Self-documents
            to the 10-cell Lab anatomy. Demonstrates the Sources to Contracts
            to Tools chain. Pending hosting and publication.
          </p>
          <div className="lab-meta fade-up fade-up-delay-1">
            <span className="status-badge">Ready for review</span>
            <span className="lab-meta-item">Kit · Design Review</span>
            <span className="lab-meta-item">Artifact · Local build · pending deploy</span>
            <span className="lab-meta-item">Date · 2026-07-13</span>
          </div>
        </section>

        <section className="doctrine-section fade-up" id="summary">
          <h2 className="doctrine-heading">Summary</h2>
          <div className="definition">
            <p className="definition-label">Outcome · ready for review</p>
            <p>
              Compile is the most complete tool in the set. The thesis is
              uncrowded — no existing tool compiles plain-language principles
              into verifiable design contracts. The seven-domain engine
              covers motion, color, typography, spacing, shape, interaction,
              and acoustic. The output self-documents to the 10-cell Lab
              anatomy. Nine verification tests passed. A local path leak in
              compiled output was found and fixed 2026-07-13. The only
              remaining work is hosting, packaging, and publication — no
              technical barrier remains.
            </p>
          </div>
        </section>

        <section className="doctrine-section fade-up" id="engagement">
          <h2 className="doctrine-heading">Verification evidence</h2>
          <div className="definition">
            <p className="definition-label">Build verification · 2026-07-13</p>
            <p>
              Nine test principles compiled across seven design domains. All
              passed. A security audit found a local path leak in compiled
              contract output (embedding internal source paths) — fixed
              to reference public designesy.org URLs. Verified clean after
              fix. The tool is ready for hosting.
            </p>
          </div>
        </section>

        <section className="doctrine-section fade-up" id="inputs">
          <h2 className="doctrine-heading">Inputs used</h2>
          <div className="row-stack" role="list">
            <ToggleRow index="01">
              <span className="row-body">
                <span className="row-title">Artifact</span>
                <span className="row-meta">Local build · pending hosting on GitHub Pages</span>
              </span>
            </ToggleRow>
            <ToggleRow index="02">
              <span className="row-body">
                <span className="row-title">Purpose claim</span>
                <span className="row-meta">
                  Compile a principle into tokens, a test, and a checklist — no substitute exists
                </span>
              </span>
            </ToggleRow>
            <ToggleRow index="03">
              <span className="row-body">
                <span className="row-title">Audience and context</span>
                <span className="row-meta">
                  Builders and agents who need verifiable design contracts from plain language
                </span>
              </span>
            </ToggleRow>
            <ToggleRow index="04">
              <span className="row-body">
                <span className="row-title">Governing rules</span>
                <span className="row-meta">
                  Contract v0.2.0 · Kit One Design Review · 10-cell Lab anatomy
                </span>
              </span>
            </ToggleRow>
          </div>
        </section>

        <section className="doctrine-section fade-up" id="dimensions">
          <h2 className="doctrine-heading">Dimension findings</h2>
          <p className="surface-note" style={{ marginBottom: '1.5rem' }}>
            Each dimension: observation, judgment, action — Kit One format.
          </p>
          <div className="principle-list">
            {DIMENSIONS.map((d) => (
              <div className="principle" key={d.num}>
                <span className="principle-num">{d.num}</span>
                <div className="principle-body">
                  <h3>{d.title}</h3>
                  <p>
                    <strong style={{ color: 'var(--muted)' }}>Observation.</strong>{' '}
                    {d.observation}
                  </p>
                  <p style={{ marginTop: '0.5rem' }}>
                    <strong style={{ color: 'var(--muted)' }}>Judgment.</strong>{' '}
                    {d.judgment}
                  </p>
                  <p
                    style={{
                      marginTop: '0.5rem',
                      color: 'var(--muted-dim)',
                    }}
                  >
                    Action · {d.action}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="doctrine-section fade-up" id="holds">
          <h2 className="doctrine-heading">Holds</h2>
          <CheckGrid items={checkItemsFromStrings(HOLDS)} />
        </section>

        <section className="doctrine-section fade-up" id="tensions">
          <h2 className="doctrine-heading">Tensions</h2>
          <CheckGrid items={TENSIONS} />
        </section>

        <section className="doctrine-section fade-up" id="corrections">
          <h2 className="doctrine-heading">Corrections</h2>
          <CheckGrid items={CORRECTIONS} />
        </section>

        <section className="doctrine-section fade-up" id="verification">
          <h2 className="doctrine-heading">Verification performed</h2>
          <CheckGrid items={checkItemsFromStrings(VERIFICATION)} />
        </section>

        <section className="doctrine-section fade-up" id="sources">
          <h2 className="doctrine-heading">Sources used</h2>
          <div className="row-stack" role="list">
            {SOURCES.map((item, i) => (
              <Link
                key={item.href}
                href={item.href}
                className="row"
                role="listitem"
                data-cuelume-hover="bloom"
                data-cuelume-press
              >
                <span className="row-index">
                  {String(i + 1).padStart(2, '0')}
                </span>
                <span className="row-body">
                  <span className="row-title">{item.title}</span>
                  <span className="row-meta">{item.meta}</span>
                </span>
              </Link>
            ))}
          </div>
        </section>

        <div className="status-note">
          Case study of Compile using Use Kit One · Design Review. Outcome:
          ready for review. The most complete tool in the set — thesis is
          uncrowed, seven-domain engine works, nine tests passed, security
          fix verified. Pending hosting and publication.
        </div>
      </main>

      <Footer />
    </>
  );
}