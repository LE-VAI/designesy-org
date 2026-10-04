'use client';

import { useState, useCallback, useRef, type ReactNode } from 'react';

/**
 * A prompt block with its own title bar: the block's name on the left and
 * Copy on the right, both on the prompt text's 1.35rem inset, over a
 * hairline. The button used to float 8px from the block's corner while the
 * text sat 22px in, and on touch the block opened on an empty 70px band
 * reserved for it; the band is now the chrome, and the button's edge is
 * the text's edge.
 *
 * The whole block (bar and text) is one reading surface (.kit-prompt), so
 * the edge fade that lib/scroll-regions puts on an overflowing <pre> masks
 * the text only, never the card's rim or shadow.
 *
 * One click copies the prompt text (the <pre>'s content only; the bar is
 * outside it, so its words never reach the clipboard). Used for agent
 * prompts, builder prompts and bundle output a person pastes into a tool.
 */
export function CopyPrompt({
  children,
  label = 'Prompt',
  title,
  className = '',
}: {
  children: ReactNode;
  /** Names the block in the button's accessible name ("Copy agent prompt"). */
  label?: string;
  /** The bar's visible name. Defaults to the label, humanized. */
  title?: string;
  className?: string;
}) {
  const [copied, setCopied] = useState(false);
  const ref = useRef<HTMLPreElement>(null);
  const heading = title ?? humanize(label);

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
    <div className={`copy-prompt-wrap kit-prompt${className ? ` ${className}` : ''}`}>
      <div className="copy-prompt-bar">
        <span className="copy-prompt-title">{heading}</span>
        <button
          type="button"
          className={`copy-prompt-btn${copied ? ' is-copied' : ''}`}
          onClick={copy}
          aria-label={copied ? `${label} copied` : `Copy ${label}`}
        >
          {copied ? 'Copied' : 'Copy'}
        </button>
      </div>
      <pre ref={ref} className="copy-prompt-pre" tabIndex={0}>
        <code>{children}</code>
      </pre>
    </div>
  );
}

/**
 * The bar's default name from a label: a sentence-case phrase. Some labels
 * are built from ids ("lintConfig bundle" on /score), so a camelCase word is
 * split, its later words lower-cased and a two-letter one read as an
 * acronym: "Lint config bundle", "Design MD bundle", "Agent prompt".
 */
function humanize(label: string): string {
  const words = label
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .split(/\s+/)
    .filter(Boolean)
    .map((word, i) => {
      if (/^[A-Z][a-z]$/.test(word)) return word.toUpperCase();
      return i === 0 ? word : word.charAt(0).toLowerCase() + word.slice(1);
    });
  const phrase = words.join(' ');
  return phrase.charAt(0).toUpperCase() + phrase.slice(1);
}
