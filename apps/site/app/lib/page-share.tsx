'use client';

import { ShareButton } from './share-button';

/**
 * PageShareButton — a drop-in share affordance for server-component pages.
 *
 * Uses window.location.href at runtime (client-side) so it works on any
 * page without passing a URL from the server. The `text` prop customizes
 * the share copy; `label` sets the aria-label.
 *
 * Renders a compact Share trigger that uses Web Share API when available,
 * falling back to X + LinkedIn + Copy link.
 */
export function PageShareButton({
  text,
  label = 'Share this page',
  className = '',
}: {
  text?: string;
  label?: string;
  className?: string;
}) {
  return (
    <ShareButton
      text={text}
      label={label}
      compact
      className={className}
    />
  );
}