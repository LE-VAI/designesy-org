'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { Topbar } from '../../lib/topbar';
import { Footer } from '../../lib/footer';
import { CheckGrid } from '../../lib/check-grid';
import { checkItemsFromStrings } from '../../lib/check-items';
import { detectPaneTier, type PaneTier } from '../../lib/pane';

const ANATOMY_DONE = [
  'Thesis',
  'Live artifact or demo',
  'Principle explanation',
  'Portable contract',
  'Implementation notes',
  'Review checklist',
  'Provenance',
  'Anti-patterns',
  'Remix notes',
  'Verification',
];

const REVIEW_CHECKS = [
  'Does the surface bend light at the rim, or only fog the background?',
  'Is refraction quiet enough for institutional chrome (topbar, card)?',
  'Does prefers-reduced-transparency force a solid, readable surface?',
  'Does Safari/Firefox keep a clean frost path without broken filters?',
  'Are displacement maps delivered as blob: URLs (WebKit-safe)?',
  'Would removing Pane leave the interface fully usable?',
  'Does every value cite a Pane token or an open tension?',
];

const ANTI = [
  'Cloudy blur sold as “liquid glass” without displacement',
  'Theatrical OS-clone glass on every surface',
  'data: URIs inside feImage (WebKit silent failure)',
  'Refraction that folds content over itself at corners',
  'Ignoring reduced-transparency system preference',
  'WebGL screenshot glass that freezes the live page',
];

const PROVENANCE = [
  'kube.io liquid glass — Snell–Descartes, squircle bezel, RG maps',
  'Outpace Studios / Aave — blob: maps, sRGB filters, copy architecture',
  'rdev liquid-glass-react — edge-weighted displacement + optional chroma',
  'Designesy Pane — progressive tiers, institutional restraint, dark fill',
];

const TIER_LABEL: Record<PaneTier, string> = {
  0: 'Solid · no translucency',
  1: 'Frost · blur + edge',
  2: 'Refract · true displacement',
};

export default function PaneLabPage() {
  const [tier, setTier] = useState<PaneTier | null>(null);

  useEffect(() => {
    setTier(detectPaneTier());
  }, []);

  return (
    <>
      <Topbar scrolled />

      <main id="main-content" className="surface-page">
        <section className="surface-header fade-up">
          <p className="surface-eyebrow">
            <Link href="/labs" className="lab-crumb">
              Labs
            </Link>
            <span aria-hidden="true"> · </span>
            Lab Three
          </p>
          <h1 className="surface-title">Pane</h1>
          <p className="surface-lede">
            True glass for institutional surfaces — bend, not fog.
          </p>
          <p className="surface-note">
            Pane is Designesy&apos;s progressive glass material. Optics compute
            rim displacement from Snell&apos;s law and a squircle bezel. Frost
            works everywhere; true refraction attaches only when the engine can
            host an SVG filter on the backdrop. Subtle first. Never theatrical.
          </p>
          <div className="lab-meta fade-up fade-up-delay-1">
            <span className="status-badge">Live</span>
            <span className="lab-meta-item">Status · public experiment</span>
            <span className="lab-meta-item">Material · progressive glass</span>
          </div>
        </section>

        <section className="doctrine-section fade-up" id="demo">
          <h2 className="doctrine-heading">Live artifact</h2>
          <p className="surface-note" style={{ marginBottom: '1.5rem' }}>
            Scroll the page and watch the topbar sheet. On Chromium, the rim
            should slightly refract the field behind it. On Safari and Firefox,
            expect honest frost — not a broken filter.
          </p>

          <div className="pane-stage">
            <div className="pane-stage-block">
              <p className="pane-stage-label">Capability tier</p>
              <div className="pane-tier-chip pane-chip">
                <span>This browser</span>
                <strong>
                  {tier === null ? 'detecting…' : `tier ${tier} · ${TIER_LABEL[tier]}`}
                </strong>
              </div>
              <p className="pane-stage-note">
                Token: <code>data-pane-tier</code> on <code>&lt;html&gt;</code> ·
                solid (0) / frost (1) / refract (2)
              </p>
            </div>

            <div className="pane-stage-block">
              <p className="pane-stage-label">Lens over field</p>
              <div className="pane-demo-field" aria-hidden="true">
                <div className="pane-demo-float pane-lens pane-refract">
                  <p className="pane-demo-float-title">Pane lens</p>
                  <p className="pane-demo-float-body">
                    Squircle bezel · optics map · restrained scale. Content
                    stays sharp; only the backdrop bends.
                  </p>
                </div>
              </div>
              <p className="pane-stage-note">
                Classes: <code>pane-lens pane-refract</code> · filter{' '}
                <code>#pane-lens</code> at tier 2
              </p>
            </div>

            <div className="pane-stage-block">
              <p className="pane-stage-label">Compare · frost vs solid</p>
              <div className="pane-compare">
                <div className="pane-compare-cell pane-card pane-refract">
                  <strong>Card · pane</strong>
                  <span>Raised fill + optional refraction</span>
                </div>
                <div
                  className="pane-compare-cell"
                  style={{
                    background: 'var(--pane-fill-solid)',
                    border: '1px solid var(--line)',
                    borderRadius: 12,
                  }}
                >
                  <strong>Card · solid</strong>
                  <span>Reduced-transparency path</span>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="doctrine-section fade-up">
          <h2 className="doctrine-heading">Thesis</h2>
          <div className="definition">
            <p className="definition-label">Core claim</p>
            <p>
              Glass is refraction at the rim. Blur alone is frost. Institutional
              UI earns glass only when the bend stays quiet and every browser
              keeps a readable fallback.
            </p>
          </div>
        </section>

        <section className="doctrine-section fade-up">
          <h2 className="doctrine-heading">Portable contract</h2>
          <CheckGrid
            items={checkItemsFromStrings([
              'Tier 0 solid when reduced-transparency or no backdrop-filter',
              'Tier 1 frost: blur + saturate + edge + inset highlight',
              'Tier 2 refract: SVG displacement map via backdrop-filter',
              'Maps are blob: URLs — never data: inside feImage',
              'color-interpolation-filters = sRGB',
              'Default scale is institutional (≤ ~28px), not demo-theatrical',
              'Topbar uses pane-sheet; cards/chips opt in explicitly',
            ])}
          />
        </section>

        <section className="doctrine-section fade-up">
          <h2 className="doctrine-heading">Review checklist</h2>
          <CheckGrid items={checkItemsFromStrings(REVIEW_CHECKS)} />
        </section>

        <section className="doctrine-section fade-up">
          <h2 className="doctrine-heading">Anti-patterns</h2>
          <CheckGrid items={checkItemsFromStrings(ANTI, { avoid: true })} />
        </section>

        <section className="doctrine-section fade-up">
          <h2 className="doctrine-heading">Provenance</h2>
          <CheckGrid items={checkItemsFromStrings(PROVENANCE)} />
        </section>

        <section className="doctrine-section fade-up">
          <h2 className="doctrine-heading">Lab anatomy</h2>
          <CheckGrid dense items={checkItemsFromStrings(ANATOMY_DONE)} />
        </section>

        <div className="status-note">
          Pane ships as Lab Three. Production first surface: scrolled topbar.
          Tokens live in <code>docs/pane-tokens.md</code>. Promotion into the
          design-system contract waits for multi-browser field verification.
        </div>
      </main>

      <Footer />
    </>
  );
}
