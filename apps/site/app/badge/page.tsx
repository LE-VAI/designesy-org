import type { Metadata } from 'next';
import Link from 'next/link';
import './badge.css';
import { Topbar } from '../lib/topbar';
import { Footer } from '../lib/footer';
import { pageMeta } from '../lib/site-meta';
import { AgentActions } from '../lib/agent-actions';
import { ENGINE_CHECK_COUNT } from '../lib/check-definitions';
import { GRADE_BANDS } from '../score/verdict';
import { SnippetCopy } from './snippet-copy';
import { LiveBadgeBuilder } from './live-badge-builder';

// The embed is the live per-site badge, worded
// "Scored by Designesy", with a one-line disclaimer. The static images it
// replaced as the lead read "Verified by Designesy" whatever the site's score,
// and the page claimed the badge "stays honest", which a static file cannot.

export const metadata: Metadata = pageMeta({
  title: 'Badge',
  description: `Embed your site's live Designesy score: the grade, the score and the date of the run, from ${ENGINE_CHECK_COUNT} deterministic checks. An automated score; it does not certify, attest compliance or endorse.`,
  path: '/badge',
  ogTitle: 'Scored by Designesy',
  ogDescription: 'Embed your live score: the grade, the score and the date it was measured.',
});

// The specimen papers. Light-site badges sit on a soft light grey, not pure
// white: two #fff slabs a viewport were the brightest objects on the page and
// outranked the code they illustrate.
const VARIANTS = [
  {
    id: 'dark',
    label: 'Dark',
    desc: 'For light-background sites (most common).',
    bg: '#f3f4f6',
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
    desc: 'Mark only, for footers, sidebars, and tight spaces.',
    bg: '#f3f4f6',
    file: 'badge-compact.svg',
    w: 28,
    h: 28,
  },
];

// The engine's bands (verdict.ts), highest first, each letter in its grade's
// text token: a grade takes only its grade tokens.
const GRADES = [...GRADE_BANDS].reverse().map((b) => ({
  grade: b.grade,
  range: b.grade === 'F' ? 'Under 60' : b.grade === 'A' ? '90 to 100' : `${b.from} to ${(b.to - 0.1).toFixed(1)}`,
  color: `var(--grade-${b.grade.toLowerCase()}-ink)`,
}));

export default function BadgePage() {
  return (
    <>
      <Topbar scrolled />
      <main id="main-content" data-pagefind-body className="surface-page">
        <section className="surface-header fade-up">
          <p className="surface-eyebrow">Badge</p>
          <h1 className="surface-title" data-scramble>
            Scored by Designesy
          </h1>
          <p className="surface-lede">
            Embed your site&apos;s live score: the grade, the score and the date it was measured, linked to the
            full report.
          </p>
          <p className="surface-note">
            An automated score from {ENGINE_CHECK_COUNT} deterministic checks against the{' '}
            <Link href="/contracts/design-system" className="text-link">
              published contract
            </Link>
            , on the date shown. It does not certify the site, attest to legal or accessibility compliance, or
            endorse the site or its products.
          </p>
          <AgentActions mdPath="/badge.md" label="the badge page" />
        </section>

        {/* --- The live badge: the lead embed. It holds the page's LCP
            paragraph on phones, so it rises without fading (badge.css). --- */}
        <section id="badge-live" className="doctrine-section fade-up fade-up-delay-1" aria-labelledby="badge-live-h">
          <h2 className="doctrine-heading" id="badge-live-h">
            Live badge
          </h2>
          <p className="surface-note">
            One image per site, at <code className="inline-code">/api/badge?url=</code>. It shows the site, its grade
            and score, and the date of the run, and links to the site&apos;s report. A site that cannot be read
            shows &quot;Not scored&quot;.
          </p>
          <LiveBadgeBuilder initial="designesy.org" />
        </section>

        {/* --- How it works --- */}
        <section className="doctrine-section fade-up fade-up-delay-2">
          <h2 className="doctrine-heading">How it works</h2>
          <div className="definition">
            <ol className="badge-steps">
              <li>
                <strong>The badge reads the score cache.</strong> It shows the score the cache holds for your
                site and the date that score was measured: the same run
                your <Link href="/score" className="text-link">/score</Link> report shows.
              </li>
              <li>
                <strong>A site with no score in the cache is scored once</strong>, by the
                same {ENGINE_CHECK_COUNT} checks the score page runs, and later views read that result. New
                scores started by badges are rate limited; at the limit the badge reads &quot;Not
                scored&quot; for a minute, then tries again.
              </li>
              <li>
                <strong>The badge names the site it scored</strong>, and its link opens that site&apos;s
                report.
              </li>
              <li>
                <strong>When the site cannot be read</strong> (blocked, unreachable, or an address the engine
                refuses), the badge reads &quot;Not scored&quot; and shows no grade.
              </li>
            </ol>
          </div>
        </section>

        {/* --- Grade thresholds --- */}
        <section className="doctrine-section fade-up fade-up-delay-3">
          <h2 className="doctrine-heading">Grade scale</h2>
          <div className="definition">
            <p className="definition-label">Grades on the badge</p>
            <div className="badge-grade-table">
              {GRADES.map((g) => (
                <div key={g.grade} className="badge-grade-row">
                  <span className="badge-grade-letter" style={{ color: g.color }}>
                    {g.grade}
                  </span>
                  <span className="badge-grade-min">{g.range}</span>
                </div>
              ))}
            </div>
            <p className="definition-note">
              The score is out of 100: a weighted average of the {ENGINE_CHECK_COUNT} checks, adjusted by an
              anti-slop deduction, an originality lift and two caps. The{' '}
              <Link href="/methodology" className="text-link">
                methodology
              </Link>{' '}
              shows the arithmetic, and the{' '}
              <Link href="/contracts/design-system" className="text-link">
                contract
              </Link>{' '}
              lists every check.
            </p>
          </div>
        </section>

        {/* --- The static images --- */}
        <section className="doctrine-section fade-up fade-up-delay-4" aria-labelledby="badge-static-h">
          <h2 className="doctrine-heading" id="badge-static-h">
            Static images
          </h2>
          <p className="surface-note">
            Three fixed images read &quot;Scored by Designesy&quot; and carry no grade, for places that cannot load
            a per-site image. Use one only on a site Designesy has scored, linked to that site&apos;s score: replace{' '}
            <code className="inline-code">YOURSITE.com</code> with your domain.
          </p>
          <div className="badge-gallery g12">
            {VARIANTS.map((v) => (
              <div key={v.id} className="badge-variant">
                <div className="badge-preview" style={{ background: v.bg }}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={`/${v.file}`}
                    alt={`Scored by Designesy (${v.label} variant)`}
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
          {/* Each snippet is one card on the 7-line: the code in the face, the
              badge it renders in the side pane. Copy is a button in the face's
              label row, named per variant (three buttons all called "Copy"
              were indistinguishable to a screen reader). */}
          <div className="badge-snippets badge-static-snippets">
            {VARIANTS.map((v) => {
              const snippet = `<a href="https://www.designesy.org/score?url=YOURSITE.com"
   target="_blank" rel="noopener">
  <img src="https://www.designesy.org/${v.file}"
       alt="Scored by Designesy"
       width="${v.w}" height="${v.h}" />
</a>`;
              return (
                <div key={v.id} className="badge-snippet">
                  <div className="badge-snippet-face">
                    <div className="badge-snippet-label">
                      <h3 className="badge-snippet-name">{v.label}</h3>
                      <SnippetCopy text={snippet} label={`${v.label} static image snippet`} />
                    </div>
                    {/* Each line stays whole and the well scrolls sideways
                        when a line is wider than it (badge.css); where it
                        does, lib/scroll-regions gives it a keyboard stop
                        named by data-scroll-region and the edge fade. */}
                    <pre className="badge-snippet-code" data-scroll-region={`${v.label} static image snippet`}>
                      <code>{snippet}</code>
                    </pre>
                  </div>
                  <figure className="badge-snippet-side">
                    <figcaption className="badge-snippet-label">
                      <span className="badge-snippet-name">Renders as</span>
                      <span className="badge-snippet-dim">{v.w} × {v.h}px</span>
                    </figcaption>
                    <div className="badge-snippet-specimen" style={{ background: v.bg }}>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={`/${v.file}`} alt={`The ${v.label} static image`} width={v.w} height={v.h} />
                    </div>
                  </figure>
                </div>
              );
            })}
          </div>
        </section>
      </main>
      <Footer />
    </>
  );
}
