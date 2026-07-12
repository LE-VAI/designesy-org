'use client';

import { useState, useCallback, useRef, type ReactNode } from 'react';

/**
 * Pre/code block with a floating copy button.
 * One click copies the full prompt text to clipboard.
 * Used for agent prompts, share copy, and any structured text
 * a human should paste into an AI tool or social post.
 */
export function CopyPrompt({
  children,
  label = 'Prompt',
  className = '',
}: {
  children: ReactNode;
  label?: string;
  className?: string;
}) {
  const [copied, setCopied] = useState(false);
  const ref = useRef<HTMLPreElement>(null);

  const copy = useCallback(async () => {
    const value = ref.current?.textContent?.trim() ?? '';
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
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* clipboard unavailable */
    }
  }, []);

  return (
    <div className={`copy-prompt-wrap${className ? ` ${className}` : ''}`}>
      <pre ref={ref} className="kit-prompt copy-prompt-pre" tabIndex={0}>
        <code>{children}</code>
      </pre>
      <button
        type="button"
        className={`copy-prompt-btn${copied ? ' is-copied' : ''}`}
        onClick={copy}
        aria-label={copied ? `${label} copied` : `Copy ${label}`}
      >
        {copied ? 'Copied' : 'Copy'}
      </button>
    </div>
  );
}
