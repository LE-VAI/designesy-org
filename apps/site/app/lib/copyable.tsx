'use client';

import { useState, useCallback, useRef, type ReactNode } from 'react';

/**
 * Definition block with click-to-copy the canonical text.
 * Shows a brief "Copied" confirmation after clipboard write.
 * Falls back to element textContent when no explicit text prop
 * is given, so any definition content is copyable without extra wiring.
 */
export function Copyable({
  children,
  label,
  className = '',
  text,
}: {
  children: ReactNode;
  label?: string;
  className?: string;
  text?: string;
}) {
  const [copied, setCopied] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const copy = useCallback(async () => {
    const value = text ?? ref.current?.textContent?.trim() ?? '';

    if (!value) return;

    try {
      if (navigator.clipboard) {
        await navigator.clipboard.writeText(value);
      } else {
        const ta = document.createElement('textarea');
        ta.value = value;
        ta.style.position = 'fixed';
        ta.style.opacity = '0';
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
      }
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      /* clipboard unavailable — silent fail */
    }
  }, [text]);

  return (
    <div
      ref={ref}
      className={`definition is-copyable${copied ? ' is-copied' : ''}${className ? ` ${className}` : ''}`}
      onClick={copy}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          copy();
        }
      }}
      aria-label={copied ? 'Copied' : `Copy ${label ?? 'text'}`}
    >
      {children}
      <span className="definition-copy-badge" aria-hidden="true">
        {copied ? 'Copied' : 'Copy'}
      </span>
    </div>
  );
}
