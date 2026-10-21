'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * The Copy action for one embed snippet, as a real button in the snippet's
 * label row. It replaces the click-to-copy overlay the definition enhancer
 * put on the <pre>: on touch that badge rested at .7 opacity on top of the
 * first code line (x333-363 at 390, over "url=YOU..."), and the whole code
 * block was a button.
 */
export function SnippetCopy({ text, label }: { text: string; label: string }) {
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => () => clearTimeout(timer.current), []);

  const copy = useCallback(async () => {
    try {
      if (navigator.clipboard) {
        await navigator.clipboard.writeText(text);
      } else {
        const ta = document.createElement('textarea');
        ta.value = text;
        ta.style.cssText = 'position:fixed;opacity:0';
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
      }
      setCopied(true);
      clearTimeout(timer.current);
      timer.current = setTimeout(() => setCopied(false), 1600);
    } catch {
      /* clipboard unavailable */
    }
  }, [text]);

  return (
    <>
      <button
        type="button"
        className={`badge-snippet-copy${copied ? ' is-copied' : ''}`}
        onClick={copy}
        data-cuelume-press="tick"
      >
        {/* The name stays "Copy <label>" (WCAG 2.5.3, Label in Name: the
            visible "Copy" opens it) and the status line below says it was
            copied, once. An aria-label that read "Copy" while the button
            showed "Copied" failed axe-core 4.14, and one that changed with
            it was spoken twice. "Copied" is what happened, not a label, so
            it is hidden from the name. */}
        <span aria-hidden="true">{copied ? 'Copied' : 'Copy'}</span>
        <span className="sr-only">{`Copy ${label}`}</span>
      </button>
      <span className="sr-only" role="status" aria-live="polite">
        {copied ? `${label} copied` : ''}
      </span>
    </>
  );
}
