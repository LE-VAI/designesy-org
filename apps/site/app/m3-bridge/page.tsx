// /m3-bridge — Material 3 token → W3C DTCG format converter.
//
// M3's DSP (Design System Package) export was archived October 2024 and does
// not emit W3C DTCG format. This tool bridges the gap: paste M3 token CSS or
// JSON, get W3C DTCG 2025.10 format output. Positions Designesy as the
// neutral bridge between Google's two non-interoperating design-data
// initiatives (M3 DSP archived, DESIGN.md ships DTCG).
//
// Pattern from MATERIAL_DESIGN_3_AUDIT.md §10.B:
// "Build the M3 → DTCG bridge. Whether your tokens come from M3, DESIGN.md,
// Tokens Studio, or hand-written JSON — Designesy validates them against
// the W3C standard."

import type { Metadata } from 'next';
import { Topbar } from '../lib/topbar';
import { Footer } from '../lib/footer';
import { pageMeta } from '../lib/site-meta';
import { M3BridgeTool } from './m3-bridge-form';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export const metadata: Metadata = pageMeta({
  title: 'M3 → DTCG Bridge',
  description:
    'Convert Material 3 design tokens to W3C DTCG 2025.10 format. M3\'s DSP export was archived October 2024 and doesn\'t emit DTCG. This bridge converts M3 token CSS or JSON to the W3C standard format, then validates the output.',
  path: '/m3-bridge',
  ogTitle: 'M3 → DTCG Bridge · Designesy',
  ogDescription:
    'M3\'s DSP export is archived. Convert Material 3 tokens to W3C DTCG format — the neutral bridge between Google\'s non-interoperating design-data initiatives.',
  twitterDescription: 'M3 → DTCG bridge — designesy.org/m3-bridge',
});

export default function M3BridgePage() {
  return (
    <>
      <Topbar scrolled />
      <main id="main-content" className="surface-page" data-pagefind-meta="priority:high">
        <section className="surface-header fade-up">
          <p className="surface-eyebrow" data-scramble>Token bridge</p>
          <h1 className="surface-title" data-scramble>M3 → DTCG Bridge</h1>
          <p className="surface-lede">
            Material 3&apos;s DSP export was archived October 2024 and
            doesn&apos;t emit W3C DTCG format. Paste your M3 token CSS or JSON —
            get W3C DTCG 2025.10 output, validated and ready to download.
          </p>
          <p className="surface-note">
            The neutral bridge between Google&apos;s two non-interoperating
            design-data initiatives: M3 (DSP archived) and DESIGN.md (ships
            DTCG). Whether your tokens come from M3, DESIGN.md, Tokens Studio,
            or hand-written JSON — Designesy validates them against the W3C
            standard.
          </p>
        </section>

        <section className="doctrine-section fade-up fade-up-delay-1">
          <M3BridgeTool />
        </section>

        <section className="doctrine-section fade-up fade-up-delay-2">
          <h2 className="doctrine-heading">Why this exists</h2>
          <p className="surface-note" style={{ marginBottom: '1rem', maxWidth: '70ch' }}>
            Material Design 3 is the most influential design system on Earth.
            Its native token export format — DSP (Design System Package) — was{' '}
            <a
              href="https://github.com/material-foundation/material-tokens"
              target="_blank"
              rel="noopener noreferrer"
              style={{ color: 'var(--signal)' }}
            >
              archived October 17, 2024
            </a>
            . No replacement has been announced. M3 participates in the W3C
            DTCG community group but has not shipped DTCG export.
          </p>
          <p className="surface-note" style={{ marginBottom: '1rem', maxWidth: '70ch' }}>
            Meanwhile, Google&apos;s DESIGN.md initiative (different org,
            same umbrella) <em>does</em> ship DTCG export via{' '}
            <code style={{ fontSize: '0.85rem' }}>npx @google/design.md export --format dtcg</code>
            . These two Google projects don&apos;t interoperate at the token
            format level.
          </p>
          <p className="surface-note" style={{ maxWidth: '70ch' }}>
            Designesy bridges the gap. Paste M3 tokens → get DTCG output →
            validate with the Designesy token validator. This is the technical
            moat: Designesy is the only tool that converts M3&apos;s archived
            format to the W3C standard and then verifies the result.
          </p>
        </section>
      </main>
      <Footer />
    </>
  );
}