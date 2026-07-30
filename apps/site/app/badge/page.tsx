import type { Metadata } from 'next';
import Link from 'next/link';
import { Topbar } from '../lib/topbar';
import { Footer } from '../lib/footer';
import { pageMeta } from '../lib/site-meta';

export const metadata: Metadata = pageMeta({
  title: 'Badge',
  description:
    'Sites that pass the 40-check Designesy design contract gate can embed the Verified by Designesy badge. The badge links to a live score anyone can verify.',
  path: '/badge',
  ogTitle: 'Verified by Designesy',
  ogDescription:
    'Embed the badge. Link to your live score. Design coherence as a trust signal.',
});

const VARIANTS = [
  {
    id: 'dark',
    label: 'Dark',
    desc: 'For light-background sites (most common).',
    bg: '#ffffff',
    file: 'badge.svg',
    w: 156,
    h: 32,
  },
  {
    id: 'light',
    label: 'Light',
    desc: 'For dark-background sites.',
    bg: '#0a0a0a',
    file: 'badge-light.svg',
    w: 156,
    h: 32,
  },
  {
    id: 'compact',
    label: 'Compact',
    desc: 'Mark only — for footers, sidebars, tight spaces.',
    bg: '#ffffff',
    file: 'badge-compact.svg',
    w: 28,
    h: 28,
  },
];

const GRADES = [
  { grade: 'A', min: '≥90%', color: '#4ade80' },
  { grade: 'B', min: '≥80%', color: '#a3e635' },
  { grade: 'C', min: '≥70%', color: '#facc15' },
  { grade: 'D', min: '≥60%', color: '#fb923c' },
  { grade: 'F', min: '<60%', color: '#f87171' },
];

export default function BadgePage() {
  return (
    <>
      <Topbar scrolled />
      <main id="main-content" className="surface-page">
        <section className="surface-header fade-up">
          <p className="surface-eyebrow">Verification</p>
          <h1 className="surface-title" data-scramble>
            Verified by Designesy
          </h1>
          <p className="surface-lede">
            Sites that pass the 40-check design contract gate can embed the badge.
            The badge links to a live score anyone can verify.
          </p>
          <p className="surface-note">
            No API key. No registration. Embed the SVG, link to your score, done.
          </p>
        </section>

        {/* --- Badge variants gallery --- */}
        <section className="doctrine-section fade-up fade-up-delay-1">
          <h2 className="doctrine-heading">Badge variants</h2>
          <div className="badge-gallery">
            {VARIANTS.map((v) => (
              <div key={v.id} className="badge-variant">
                <div
                  className="badge-preview"
                  style={{ background: v.bg }}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={`/${v.file}`}
                    alt={`Verified by Designesy — ${v.label} variant`}
                    width={v.w}
                    height={v.h}
                    style={{ display: 'block' }}
                  />
                </div>
                <div className="badge-variant-info">
                  <p className="badge-variant-label">{v.label}</p>
                  <p className="badge-variant-desc">{v.desc}</p>
                  <p className="badge-variant-dim">{v.w} × {v.h}px</p>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* --- Embed snippets --- */}
        <section className="doctrine-section fade-up fade-up-delay-2">
          <h2 className="doctrine-heading">Embed snippet</h2>
          <p className="surface-note">
            Replace <code className="inline-code">YOURSITE.com</code> with your domain.
            The <code className="inline-code">href</code> links to your live score for verification.
          </p>
          <div className="badge-snippets">
            {VARIANTS.map((v) => (
              <div key={v.id} className="badge-snippet">
                <p className="badge-snippet-label">{v.label}</p>
                <pre className="definition definition-code">
                  <code>{`<a href="https://www.designesy.org/score?url=YOURSITE.com"
   target="_blank" rel="noopener">
  <img src="https://www.designesy.org/${v.file}"
       alt="Verified by Designesy"
       width="${v.w}" height="${v.h}" />
</a>`}</code>
                </pre>
              </div>
            ))}
          </div>
        </section>

        {/* --- How it works --- */}
        <section className="doctrine-section fade-up fade-up-delay-3">
          <h2 className="doctrine-heading">How it works</h2>
          <div className="definition">
            <ol className="badge-steps">
              <li>
                <strong>Score your site</strong> at{' '}
                <Link href="/score" className="text-link">/score</Link> —
                40 automated checks against the design contract, real-time, no login.
              </li>
              <li>
                <strong>If you score A or B</strong> (≥80%), you qualify to embed the badge.
              </li>
              <li>
                <strong>Embed the SVG</strong> on your site. The badge links to your live score
                so visitors can verify.
              </li>
              <li>
                <strong>The score is the proof.</strong> The badge claims verification;
                the live score proves it. If your site drifts, the score updates — the badge
                stays honest.
              </li>
            </ol>
          </div>
        </section>

        {/* --- Grade thresholds --- */}
        <section className="doctrine-section fade-up fade-up-delay-4">
          <h2 className="doctrine-heading">Grade scale</h2>
          <div className="definition">
            <p className="definition-label">Who qualifies</p>
            <div className="badge-grade-table">
              {GRADES.map((g) => (
                <div
                  key={g.grade}
                  className={`badge-grade-row ${g.grade === 'A' || g.grade === 'B' ? 'is-qualifying' : ''}`}
                >
                  <span
                    className="badge-grade-letter"
                    style={{ color: g.color }}
                  >
                    {g.grade}
                  </span>
                  <span className="badge-grade-min">{g.min}</span>
                  <span className="badge-grade-status">
                    {g.grade === 'A' || g.grade === 'B'
                      ? 'Qualifies for badge'
                      : 'Does not qualify'}
                  </span>
                </div>
              ))}
            </div>
            <p className="definition-note">
              The score is the percentage of checks that pass (warnings count as half).
              40 checks total — see the{' '}
              <Link href="/contracts/design-system" className="text-link">
                contract
              </Link>{' '}
              for the full list.
            </p>
          </div>
        </section>
      </main>
      <Footer />
    </>
  );
}