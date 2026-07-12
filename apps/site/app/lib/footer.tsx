import Link from 'next/link';

/**
 * Shared footer — wordmark, legal line, wayfinding, contact.
 * No monogram. No placeholder lanes.
 */
export function Footer() {
  return (
    <footer className="footer">
      <div className="site-shell footer-inner">
        <div className="footer-meta">
          <span className="wordmark">
            designesy<span className="dot">.</span>
          </span>
          <span>
            <strong>Designesy LLC</strong> · Design intelligence infrastructure
          </span>
          <nav className="footer-nav" aria-label="Footer">
            <Link href="/docs" data-cuelume-hover="tick">
              Docs
            </Link>
            <Link href="/labs" data-cuelume-hover="tick">
              Labs
            </Link>
            <Link href="/kits" data-cuelume-hover="tick">
              Kits
            </Link>
            <Link href="/review" data-cuelume-hover="tick">
              Review
            </Link>
            <Link href="/contracts" data-cuelume-hover="tick">
              Contracts
            </Link>
            <Link href="/kits/design-review" data-cuelume-hover="tick">
              Design Review
            </Link>
            <Link href="/review/poise" data-cuelume-hover="tick">
              Poise review
            </Link>
            <Link href="/contracts/design-system" data-cuelume-hover="tick">
              Design system
            </Link>
          </nav>
        </div>
        <a
          className="footer-link"
          href="mailto:le@designesy.org"
          data-cuelume-hover="tick"
        >
          le@designesy.org
        </a>
      </div>
    </footer>
  );
}
