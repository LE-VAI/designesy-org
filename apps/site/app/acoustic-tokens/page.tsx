import type { Metadata } from 'next';
import Link from 'next/link';
import { Topbar } from '../lib/topbar';
import { Footer } from '../lib/footer';
import { pageMeta } from '../lib/site-meta';
import { acousticTokens } from '../lib/acoustic-tokens';
import { CONTRACT_VERSION } from '../lib/design-system-contract';
import { AgentActions } from '../lib/agent-actions';
import { TokenFormatCard } from './token-format';

/* Provenance. Each row's licence and version (or count) and its route stand
   in the side pane behind the 7-line, in mono; the face keeps the title and
   one line. They sat in the face as grey meta beside an empty pane. */
const PROVENANCE: {
  href: string;
  title: string;
  meta: string;
  datum: string;
  route: string;
  external?: boolean;
}[] = [
  {
    href: acousticTokens.provenance.npm,
    title: 'Cuelume',
    meta: 'Interaction audio engine by Daniel Belyi, on npm',
    datum: 'MIT · v0.2.2',
    route: 'npmjs.com/package/cuelume',
    external: true,
  },
  {
    href: acousticTokens.provenance.repo,
    title: 'GitHub repository',
    meta: 'Cuelume source',
    datum: 'MIT · Daniel Belyi',
    route: acousticTokens.provenance.repo.replace(/^https:\/\//, ''),
    external: true,
  },
  {
    href: '/contracts/design-system',
    title: 'Design system contract',
    meta: 'Visual token system',
    datum: CONTRACT_VERSION,
    route: '/contracts/design-system',
  },
  {
    href: '/acoustic-tokens.json',
    title: 'Machine export',
    meta: 'This token set as JSON',
    datum: `v${acousticTokens.version} · ${acousticTokens.tokens.length} tokens`,
    route: '/acoustic-tokens.json',
  },
];

export const metadata: Metadata = pageMeta({
  title: 'Acoustic tokens',
  description:
    'Designesy acoustic token system: the sound parallel to the visual token system. Net-new relative to the W3C Design Tokens Format Module. Engine: Cuelume v0.2.2.',
  path: '/acoustic-tokens',
  ogTitle: 'Acoustic tokens · Designesy',
  ogDescription:
    'Nineteen acoustic cues, nineteen interaction roles, one documented system. No sound without a token name and rationale.',
  twitterDescription: 'Acoustic token system · designesy.org/acoustic-tokens',
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
            rationale here. The W3C Design Tokens Format Module 2025.10 does not
            define acoustic token types; this system is net-new relative
            to the canonical standard.
          </p>
          <div className="lab-meta fade-up fade-up-delay-1">
            <span className="lab-meta-item">Version · {acousticTokens.version}</span>
            <span className="lab-meta-item">Engine · {acousticTokens.engine}</span>
            <span className="lab-meta-item">Machine export · /acoustic-tokens.json</span>
          </div>
          <AgentActions mdPath="/acoustic-tokens.md" label="the acoustic tokens page" />
        </section>

        <section className="doctrine-section fade-up" id="standards-context">
          <h2 className="doctrine-heading">Standards context</h2>
          <TokenFormatCard />
        </section>

        <section className="doctrine-section fade-up" id="token-reference">
          <h2 className="doctrine-heading">Token reference</h2>
          <p className="surface-note" style={{ marginBottom: '1.5rem' }}>
            Nineteen cues, nineteen interaction roles. Every sound on a Designesy surface
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
            {PROVENANCE.map((row, i) => {
              const body = (
                <>
                  <span className="row-index">{String(i + 1).padStart(2, '0')}</span>
                  <span className="row-body">
                    <span className="row-title">{row.title}</span>
                    <span className="row-meta">{row.meta}</span>
                  </span>
                  <span className="row-side">
                    <span className="row-side-line">{row.datum}</span>
                    <span className="row-side-line">{row.route}</span>
                    <span className="row-side-arrow" aria-hidden="true">
                      {row.external ? (
                        <svg viewBox="0 0 12 12" width="10" height="10" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"><path d="M2.5 9.5 9.5 2.5M4 2.5h5.5V8" /></svg>
                      ) : null}
                    </span>
                  </span>
                </>
              );
              return (
                <div role="listitem" key={row.href}>
                  {row.external ? (
                    <a
                      href={row.href}
                      className="row"
                      data-cuelume-hover="bloom"
                      data-cuelume-press
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      {body}
                    </a>
                  ) : (
                    <Link
                      href={row.href}
                      className="row"
                      data-cuelume-hover="bloom"
                      data-cuelume-press
                    >
                      {body}
                    </Link>
                  )}
                </div>
              );
            })}
          </div>
        </section>

        <div className="status-note">
          Acoustic token system v{acousticTokens.version}. Engine: {acousticTokens.engine}.
          Net-new relative to W3C DTCG 2025.10; proposed as a future token type
          contribution via $type: sound with $extensions.designesy namespacing.
        </div>
      </main>

      <Footer />
    </>
  );
}