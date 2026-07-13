'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { Topbar } from '../../lib/topbar';
import { Footer } from '../../lib/footer';
import { CheckGrid } from '../../lib/check-grid';
import { checkItemsFromStrings } from '../../lib/check-items';
import { detectPaneTier, PaneSurface, type PaneTier } from '../../lib/pane';

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
  'Does the surface bend structure at the rim, or only fog the background?',
  'Is the label layer sharp while only the backdrop warps?',
  'Does Chromium show a slight R/B split at the lip?',
  'Does prefers-reduced-transparency force a solid surface?',
  'Does Safari/Firefox keep honest frost without a broken filter?',
  'Would removing Pane leave the interface fully usable?',
];

const ANTI = [
  'Cloudy blur sold as liquid glass without geometric bend',
  'Filtering labels together with the backdrop',
  'Theatrical OS-clone glass on every surface',
  'data: URIs inside feImage (WebKit silent failure)',
  'Ignoring reduced-transparency',
];

const PROVENANCE = [
  'kube.io — Snell / rim concentration',
  'rdev liquid-glass — filter:url on backdrop layer + chromatic passes',
  'Outpace / Aave — blob maps, sRGB, layered architecture',
  'Designesy Pane — progressive tiers, institutional restraint',
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
            Pane is progressive glass. Optics drive rim displacement. Frost is
            the honest fallback. Labels stay sharp on a content layer; only the
            backdrop layer refracts.
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
            Chromium (tier 2): grid lines under the lens rim should warp, with a
            slight color split at the lip. Labels on the card stay sharp. Safari
            / Firefox: honest frost only.
          </p>

          <div className="pane-stage">
            <div className="pane-stage-block">
              <p className="pane-stage-label">Capability tier</p>
              <PaneSurface kind="chip" className="pane-tier-chip">
                <span>This browser</span>
                <strong>
                  {tier === null
                    ? 'detecting…'
                    : `tier ${tier} · ${TIER_LABEL[tier]}`}
                </strong>
              </PaneSurface>
              <p className="pane-stage-note">
                Token: <code>data-pane-tier</code> on <code>&lt;html&gt;</code>
              </p>
            </div>

            <div className="pane-stage-block">
              <p className="pane-stage-label">Lens over field</p>
              <div className="pane-demo-field" aria-hidden="true">
                <div className="pane-demo-field-grid" />
                <div className="pane-demo-field-type">
                  <span>field structure</span>
                  <strong>designesy</strong>
                </div>
                <PaneSurface kind="lens" className="pane-demo-float">
                  <p className="pane-demo-float-title">Pane lens</p>
                  <p className="pane-demo-float-body">
                    Backdrop layer refracts. This type stays sharp. Check the
                    grid at the rim.
                  </p>
                </PaneSurface>
              </div>
              <p className="pane-stage-note">
                Stack: <code>.pane-backdrop</code> (filter + frost) ·{' '}
                <code>.pane-content</code> (labels)
              </p>
            </div>

            <div className="pane-stage-block">
              <p className="pane-stage-label">Compare · glass vs solid</p>
              <div className="pane-compare">
                <PaneSurface kind="card" className="pane-compare-cell">
                  <strong>Card · pane</strong>
                  <span>Layered refraction</span>
                </PaneSurface>
                <div
                  className="pane-compare-cell"
                  style={{
                    background: 'var(--pane-fill-solid)',
                    border: '1px solid var(--line)',
                    borderRadius: 14,
                  }}
                >
                  <div className="pane-content">
                    <strong>Card · solid</strong>
                    <span>Reduced-transparency path</span>
                  </div>
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
              Glass is geometric bend at the rim plus optional chromatic split.
              Blur alone is frost. Labels never share the filter with the
              backdrop.
            </p>
          </div>
        </section>

        <section className="doctrine-section fade-up">
          <h2 className="doctrine-heading">Portable contract</h2>
          <CheckGrid
            items={checkItemsFromStrings([
              'Layered surface: .pane-backdrop filters, .pane-content stays sharp',
              'Tier 0 solid when reduced-transparency',
              'Tier 1 frost: blur + edge only',
              'Tier 2 refract: light frost sample + SVG displacement on backdrop layer',
              'Maps are blob: URLs',
              'color-interpolation-filters = sRGB',
              'Chromatic R/G/B multi-scale displacement for rim dispersion',
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
          Pane is Lab Three. Production first surface: scrolled topbar (layered).
          Tokens: <code>docs/pane-tokens.md</code>.
        </div>
      </main>

      <Footer />
    </>
  );
}
