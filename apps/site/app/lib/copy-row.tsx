'use client';

import { useState, useCallback, useId, type ReactNode } from 'react';

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
  const descId = useId();

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

  // The wrapper carries the list item role and the button keeps its own, as
  // in ToggleRow: role="listitem" on the button itself replaced its button
  // role, so assistive tech announced a list item, not a copy control.
  // The row is named by what it shows (WCAG 2.5.3, Label in Name): an
  // aria-label of "Copy Root" did not contain the row's visible text, and
  // axe-core 4.14 fails that. "Copy Root" is now the description, read from a
  // hidden span (a description reads hidden text that it names), and "Root
  // copied" goes to a status region, as in SnippetCopy: the old name change
  // was spoken by VoiceOver, a description change is not. Both spans sit
  // beside the button, not in it: a row with a child other than its index,
  // body and controls is drawn as a two-pane row (.row-stack, globals.css),
  // hidden or not, and a button's children are not read as a live region.
  // data-pagefind-ignore keeps the wording out of the search index. The
  // spaces keep the index and the body apart in the name; a grid draws no
  // whitespace between its items.
  return (
    <div role="listitem">
      <button
        className={`row${copied ? ' is-copied' : ''}`}
        type="button"
        onClick={copy}
        aria-describedby={descId}
      >
        {index && <span className="row-index">{index}</span>}{' '}
        {children}{' '}
        <span className="row-copy-badge" aria-hidden="true">
          {copied ? 'Copied' : 'Copy'}
        </span>
      </button>
      <span id={descId} hidden data-pagefind-ignore="">
        {`Copy ${label}`}
      </span>
      <span className="sr-only" role="status" data-pagefind-ignore="">
        {copied ? `${label} copied` : ''}
      </span>
    </div>
  );
}
