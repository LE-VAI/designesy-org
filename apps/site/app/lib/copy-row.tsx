'use client';

import { useState, useCallback, type ReactNode } from 'react';

/**
 * Row with click-to-copy for share posts and short copyable text.
 * Same visual layout as ToggleRow but copies text instead of toggling.
 * Shows "Copied" badge briefly after clipboard write.
 */
export function CopyRow({
  children,
  text,
  index,
  label = 'text',
}: {
  children: ReactNode;
  text: string;
  index?: string;
  label?: string;
}) {
  const [copied, setCopied] = useState(false);

  const copy = useCallback(async () => {
    if (!text) return;
    try {
      if (navigator.clipboard) {
        await navigator.clipboard.writeText(text);
      } else {
        const ta = document.createElement('textarea');
        ta.value = text;
        ta.style.position = 'fixed';
        ta.style.opacity = '0';
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
      }
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* clipboard unavailable */
    }
  }, [text]);

  return (
    <button
      className={`row${copied ? ' is-copied' : ''}`}
      type="button"
      role="listitem"
      onClick={copy}
      aria-label={copied ? `${label} copied` : `Copy ${label}`}
    >
      {index && <span className="row-index">{index}</span>}
      {children}
      <span className="row-copy-badge" aria-hidden="true">
        {copied ? 'Copied' : 'Copy'}
      </span>
    </button>
  );
}
