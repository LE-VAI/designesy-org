import Link from 'next/link';
import { Topbar } from './lib/topbar';
import { Footer } from './lib/footer';

export default function NotFound() {
  return (
    <>
      <Topbar scrolled />
      <main id="main-content" className="surface-page">
        <section className="surface-header fade-up" style={{ minHeight: '50vh' }}>
          <p className="surface-eyebrow">404</p>
          <h1 className="surface-title">Page not found</h1>
          <p className="surface-lede">
            That path is not part of the public surface.
          </p>
          <p className="surface-note">
            Start from the open index, or return home.
          </p>
          <div className="hero-actions" style={{ marginTop: '2rem' }}>
            <Link
              className="button primary"
              href="/open"
              data-cuelume-hover="chime"
              data-cuelume-press
            >
              Open design intelligence
            </Link>
            <Link
              className="button ghost"
              href="/"
              data-cuelume-hover="tick"
              data-cuelume-press
            >
              Home
            </Link>
          </div>
          <div className="lab-meta" style={{ marginTop: '2.5rem' }}>
            <Link href="/docs" data-cuelume-hover="tick">
              Docs →
            </Link>
            <Link href="/kits/design-review" data-cuelume-hover="tick">
              Design Review →
            </Link>
            <Link href="/contracts/design-system" data-cuelume-hover="tick">
              Design system →
            </Link>
          </div>
        </section>
      </main>
      <Footer />
    </>
  );
}
