'use client';

// Sharing a verdict from inside the instrument: one row, sized to fit the
// side column. The native share sheet where the device has one; otherwise a
// copy button and two icon links, each with its own accessible name.

import { useEffect, useState } from 'react';

export function EngineShare({ path, text, label }: { path: string; text: string; label: string }) {
  const [native, setNative] = useState(false);
  const [copied, setCopied] = useState(false);
  const [origin, setOrigin] = useState('');
  useEffect(() => {
    setOrigin(window.location.origin);
    setNative(typeof navigator.share === 'function' && typeof navigator.canShare === 'function');
  }, []);
  const url = `${origin}${path}`;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2200);
    } catch {
      /* clipboard refused: the links below still work */
    }
  };

  if (native) {
    return (
      <div className="eg-share">
        <button
          type="button"
          className="eg-share-btn"
          onClick={() => navigator.share({ title: text, text, url }).catch(() => {})}
          data-cuelume-press="tick"
        >
          <ShareGlyph />
          {label}
        </button>
      </div>
    );
  }

  return (
    <div className="eg-share">
      <button type="button" className="eg-share-btn" onClick={copy} data-cuelume-press="tick" aria-live="polite">
        <ShareGlyph />
        {copied ? 'Link copied' : 'Copy link'}
      </button>
      <a
        className="eg-share-btn is-icon"
        href={`https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}&url=${encodeURIComponent(url)}`}
        target="_blank"
        rel="noopener noreferrer"
        aria-label="Share on X"
        data-cuelume-press="tick"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
          <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
        </svg>
      </a>
      <a
        className="eg-share-btn is-icon"
        href={`https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(url)}`}
        target="_blank"
        rel="noopener noreferrer"
        aria-label="Share on LinkedIn"
        data-cuelume-press="tick"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
          <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 01-2.063-2.065 2.064 2.064 0 112.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z" />
        </svg>
      </a>
    </div>
  );
}

function ShareGlyph() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M10 14a4 4 0 0 0 5.66 0l3-3a4 4 0 0 0-5.66-5.66l-1 1" />
      <path d="M14 10a4 4 0 0 0-5.66 0l-3 3a4 4 0 0 0 5.66 5.66l1-1" />
    </svg>
  );
}
