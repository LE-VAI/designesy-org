import type { Metadata } from 'next';
import Link from 'next/link';
import { Topbar } from '../lib/topbar';
import { Footer } from '../lib/footer';
import { pageMeta } from '../lib/site-meta';
import { acousticTokens } from '../lib/acoustic-tokens';

export const metadata: Metadata = pageMeta({
  title: 'Acoustic tokens',
  description:
    'Designesy acoustic token system — the sound parallel to the visual token system. Net-new relative to the W3C Design Tokens Format Module. Engine: Cuelume v0.1.0.',
  path: '/acoustic-tokens',
  ogTitle: 'Acoustic tokens · Designesy',
  ogDescription:
    'Ten acoustic cues, ten interaction roles, one documented system. No sound without a token name and rationale.',
  twitterDescription: 'Acoustic token system — designesy.org/acoustic-tokens',
});

export default function AcousticTokensPage() {
  return (
    <>
      <Topbar scrolled />

      <main id="main-content" data-pagefind-body className="surface-page">
        <section className="surface-header fade-up">
          <p className="surface-eyebrow" data-scramble>Standards contribution</p>
          <h1 className="surface-title" data-scramble>Acoustic tokens</h1>
          <p className="surface-lede">
            The sound parallel to the visual token system.
          </p>
          <p className="surface-note">
            No sound appears on a Designesy surface without a token name and a
            rationale here. The W3C Design Tokens Format Module 2025.10 does
            not define acoustic token types — this system is net-new relative
            to the canonical standard.
          </p>
          <div className="lab-meta fade-up fade-up-delay-1">
            <span className="lab-meta-item">Version · {acousticTokens.version}</span>
            <span className="lab-meta-item">Engine · {acousticTokens.engine}</span>
            <span className="lab-meta-item">Machine export · /acoustic-tokens.json</span>
          </div>
        </section>

        <section className="doctrine-section fade-up" id="standards-context">
          <h2 className="doctrine-heading">Standards context</h2>
          <div className="definition">
            <p className="definition-label">W3C DTCG 2025.10</p>
            <p>
              {acousticTokens.standards_context.w3c_dtgc_2025_10}
            </p>
          </div>
          <div className="definition">
            <p className="definition-label">Proposed type</p>
            <p>
              {acousticTokens.standards_context.proposed_type}
            </p>
          </div>
          <div className="definition">
            <p className="definition-label">Reference format</p>
            <p>
              <code>{acousticTokens.standards_context.reference_format}</code>
            </p>
          </div>
        </section>

        <section className="doctrine-section fade-up" id="token-reference">
          <h2 className="doctrine-heading">Token reference</h2>
          <p className="surface-note" style={{ marginBottom: '1.5rem' }}>
            Ten cues, ten interaction roles. Every sound on a Designesy surface
            traces to a token here.
          </p>
          <div className="principle-list">
            {acousticTokens.tokens.map((token, i) => (
              <div className="principle" key={token.token}>
                <span className="principle-num">
                  {String(i + 1).padStart(2, '0')}
                </span>
                <div className="principle-body">
                  <h3>
                    <code>{token.token}</code>{' '}
                    <span style={{ color: 'var(--muted-dim)' }}>
                      · {token.cuelume_cue}
                    </span>
                  </h3>
                  <p>
                    <strong style={{ color: 'var(--muted)' }}>Character.</strong>{' '}
                    {token.character}
                  </p>
                  <p style={{ marginTop: '0.45rem' }}>
                    <strong style={{ color: 'var(--muted)' }}>Role.</strong>{' '}
                    {token.interaction_role}
                  </p>
                  <p style={{ marginTop: '0.45rem', color: 'var(--muted-dim)' }}>
                    Where · {token.where_used}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="doctrine-section fade-up" id="mapping-rules">
          <h2 className="doctrine-heading">Mapping rules</h2>
          <ul className="checkmark-list">
            {acousticTokens.mapping_rules.map((rule, i) => (
              <li key={i}>{rule}</li>
            ))}
          </ul>
        </section>

        <section className="doctrine-section fade-up" id="accessibility">
          <h2 className="doctrine-heading">Accessibility</h2>
          <ul className="checkmark-list">
            <li>
              <span>
                <strong>Reduced motion → sound off.</strong>{' '}
                {acousticTokens.accessibility.reduced_motion_sound_off}
              </span>
            </li>
            <li>
              <span>
                <strong>No focus sounds.</strong>{' '}
                {acousticTokens.accessibility.no_focus_sounds}
              </span>
            </li>
            <li>
              <span>
                <strong>Toggle is keyboard-accessible.</strong>{' '}
                {acousticTokens.accessibility.toggle_keyboard_accessible}
              </span>
            </li>
            <li>
              <span>
                <strong>Silent fallback.</strong>{' '}
                {acousticTokens.accessibility.silent_fallback}
              </span>
            </li>
            <li>
              <span>
                <strong>Volume is not adjustable.</strong>{' '}
                {acousticTokens.accessibility.volume_not_adjustable}
              </span>
            </li>
          </ul>
        </section>

        <section className="doctrine-section fade-up" id="provenance">
          <h2 className="doctrine-heading">Provenance</h2>
          <div className="row-stack" role="list">
            <a
              href={acousticTokens.provenance.npm}
              className="row"
              role="listitem"
              data-cuelume-hover="bloom"
              data-cuelume-press
              target="_blank"
              rel="noopener noreferrer"
            >
              <span className="row-index">01</span>
              <span className="row-body">
                <span className="row-title">Cuelume v0.1.0 (MIT)</span>
                <span className="row-meta">{acousticTokens.provenance.library}</span>
              </span>
            </a>
            <a
              href={acousticTokens.provenance.repo}
              className="row"
              role="listitem"
              data-cuelume-hover="bloom"
              data-cuelume-press
              target="_blank"
              rel="noopener noreferrer"
            >
              <span className="row-index">02</span>
              <span className="row-body">
                <span className="row-title">GitHub repository</span>
                <span className="row-meta">{acousticTokens.provenance.repo}</span>
              </span>
            </a>
            <Link
              href="/contracts/design-system"
              className="row"
              role="listitem"
              data-cuelume-hover="bloom"
              data-cuelume-press
            >
              <span className="row-index">03</span>
              <span className="row-body">
                <span className="row-title">Design system contract v0.4.0</span>
                <span className="row-meta">Visual token system</span>
              </span>
            </Link>
            <Link
              href="/acoustic-tokens.json"
              className="row"
              role="listitem"
              data-cuelume-hover="bloom"
              data-cuelume-press
            >
              <span className="row-index">04</span>
              <span className="row-body">
                <span className="row-title">Machine export</span>
                <span className="row-meta">acoustic-tokens.json</span>
              </span>
            </Link>
          </div>
        </section>

        <div className="status-note">
          Acoustic token system v{acousticTokens.version}. Engine: {acousticTokens.engine}.
          Net-new relative to W3C DTCG 2025.10 — proposed as a future token type
          contribution via $type: sound with $extensions.designesy namespacing.
        </div>
      </main>

      <Footer />
    </>
  );
}