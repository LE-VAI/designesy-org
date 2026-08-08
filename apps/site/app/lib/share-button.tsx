'use client';

import { useState, useEffect, useCallback } from 'react';

/**
 * ShareButton — a portable share affordance for any page.
 *
 * Uses the Web Share API (navigator.share) when available (mobile, Safari
 * desktop, Chrome desktop with flag). Falls back to X + LinkedIn + Copy
 * link buttons that match the existing score-share-btn visual language.
 *
 * Props:
 *   url      — absolute or relative URL to share. Defaults to current page.
 *   text     — share text (pre-fills the social intent / share sheet).
 *   label    — accessible label for the Web Share trigger (e.g. "Share this score").
 *   compact  — when true, renders only the "Share" trigger button (no X/LinkedIn
 *              row underneath). The fallback row still appears on no-Web-Share
 *              browsers. Useful for tight action bars.
 *   className — extra classes for the trigger button.
 *
 * The fallback row uses the existing `.score-share-btn` CSS class so it
 * inherits the same glass/elevation/hover treatment as the score-form
 * share buttons without any new CSS.
 */
export function ShareButton({
  url,
  text,
  label = 'Share this page',
  compact = false,
  className = '',
}: {
  url?: string;
  text?: string;
  label?: string;
  compact?: boolean;
  className?: string;
}) {
  const [canWebShare, setCanWebShare] = useState(false);
  const [linkCopied, setLinkCopied] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    setCanWebShare(
      typeof navigator !== 'undefined' &&
        typeof navigator.share === 'function' &&
        typeof navigator.canShare === 'function'
    );
  }, []);

  // Resolve the share URL: explicit prop → current page URL.
  const shareUrl = url
    ? url.startsWith('http')
      ? url
      : `${typeof window !== 'undefined' ? window.location.origin : ''}${url}`
    : typeof window !== 'undefined'
      ? window.location.href
      : '';

  const shareText = text ?? 'Designesy — design legitimacy, scored.';

  const handleWebShare = useCallback(async () => {
    if (!shareUrl) return;
    try {
      await navigator.share({
        title: shareText,
        text: shareText,
        url: shareUrl,
      });
    } catch {
      /* user dismissed the share sheet — not an error */
    }
  }, [shareUrl, shareText]);

  const copyLink = useCallback(async () => {
    if (!shareUrl) return;
    try {
      await navigator.clipboard.writeText(shareUrl);
      setLinkCopied(true);
      setTimeout(() => setLinkCopied(false), 2500);
    } catch {
      /* clipboard unavailable */
    }
  }, [shareUrl]);

  // Before mount (SSR), render a compact placeholder to avoid hydration
  // mismatch — the client decides whether Web Share is available.
  if (!mounted) {
    return (
      <button
        type="button"
        className={`score-action-btn score-share-btn${className ? ` ${className}` : ''}`}
        disabled
        aria-label={label}
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="18" cy="5" r="3" />
          <circle cx="6" cy="12" r="3" />
          <circle cx="18" cy="19" r="3" />
          <line x1="8.59" y1="13.51" x2="15.42" y2="17.49" />
          <line x1="15.41" y1="6.51" x2="8.59" y2="10.49" />
        </svg>
        Share
      </button>
    );
  }

  const triggerBtn = (
    <button
      type="button"
      onClick={canWebShare ? handleWebShare : copyLink}
      className={`score-action-btn score-share-btn${className ? ` ${className}` : ''}`}
      data-cuelume-press="tick"
      title={canWebShare ? label : 'Copy link to clipboard'}
      aria-label={canWebShare ? label : 'Copy link'}
    >
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="18" cy="5" r="3" />
        <circle cx="6" cy="12" r="3" />
        <circle cx="18" cy="19" r="3" />
        <line x1="8.59" y1="13.51" x2="15.42" y2="17.49" />
        <line x1="15.41" y1="6.51" x2="8.59" y2="10.49" />
      </svg>
      {canWebShare ? 'Share' : linkCopied ? 'Link copied!' : 'Copy link'}
    </button>
  );

  if (compact && canWebShare) {
    return triggerBtn;
  }

  // Fallback row: Share trigger + X + LinkedIn + Copy link.
  // Matches the score-form share row visual language.
  return (
    <>
      {triggerBtn}
      {shareUrl && (
        <>
          <a
            href={`https://twitter.com/intent/tweet?text=${encodeURIComponent(shareText)}&url=${encodeURIComponent(shareUrl)}`}
            target="_blank"
            rel="noopener noreferrer"
            className="score-action-btn score-share-btn"
            data-cuelume-press="tick"
            title="Share on X / Twitter"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
              <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
            </svg>
            Share on X
          </a>
          <a
            href={`https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(shareUrl)}`}
            target="_blank"
            rel="noopener noreferrer"
            className="score-action-btn score-share-btn"
            data-cuelume-press="tick"
            title="Share on LinkedIn"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
              <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 01-2.063-2.065 2.064 2.064 0 112.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z" />
            </svg>
            Share on LinkedIn
          </a>
        </>
      )}
    </>
  );
}