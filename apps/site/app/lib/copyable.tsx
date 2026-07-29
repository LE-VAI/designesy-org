'use client';

import { useState, useCallback, useRef, useEffect, type ReactNode } from 'react';
import { play } from 'cuelume';
import { playExtended } from './cuelume-extend';

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
  /** Explicit paste payload. Prefer this when display text is a human summary. */
  text?: string;
}) {
  const [copied, setCopied] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const copy = useCallback(async () => {
    // Prefer explicit paste payload (agent prompt, machine URL, etc.)
    // over visible display text (human share line / summary).
    let value = text?.trim();
    if (!value && ref.current) {
      const explicit = ref.current.getAttribute('data-copy')?.trim();
      if (explicit) {
        value = explicit;
      } else {
        const clone = ref.current.cloneNode(true) as HTMLElement;
        clone
          .querySelectorAll('.definition-label, .definition-copy-badge')
          .forEach((el) => el.remove());
        value = clone.textContent?.trim() ?? '';
      }
    }
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
      play('success');
      setTimeout(() => setCopied(false), 1600);
    } catch {
      /* clipboard unavailable — play error sound as feedback */
      playExtended('error');
    }
  }, [text]);

  // WCAG 4.1.2 nested-interactive: this container is role="button" +
  // tabindex=0. Any focusable descendant would create a tab trap. On mount
  // (and after children change), force descendants out of the tab order.
  useEffect(() => {
    const root = ref.current;
    if (!root) return;
    const demote = () => {
      root.querySelectorAll('a, button, [tabindex]').forEach((el) => {
        const existing = el.getAttribute('tabindex');
        if (existing === null || existing === '0') {
          el.setAttribute('tabindex', '-1');
        }
      });
    };
    demote();
    const obs = new MutationObserver(demote);
    obs.observe(root, { childList: true, subtree: true });
    return () => obs.disconnect();
  }, [children]);

  return (
    <div
      ref={ref}
      className={`definition is-copyable${copied ? ' is-copied' : ''}${className ? ` ${className}` : ''}`}
      onClick={copy}
      role="button"
      tabIndex={0}
      data-cuelume-hover="tick"
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
