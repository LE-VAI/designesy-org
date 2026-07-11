import Link from 'next/link';

/**
 * Shared footer — extracted from page duplication.
 */
export function Footer() {
  return (
    <footer className="footer">
      <div className="site-shell footer-inner">
        <div className="footer-meta">
          <span className="wordmark">designesy<span className="dot">.</span></span>
          <span><strong>Designesy LLC</strong> · Design intelligence infrastructure</span>
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