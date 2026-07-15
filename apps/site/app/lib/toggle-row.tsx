'use client';

import { useState, useCallback, type ReactNode } from 'react';

/**
 * Row with click-to-toggle checkmark for non-link row-stack items.
 * Wraps existing row content (index, body) and adds a checkmark
 * when toggled. Matches CheckGrid interaction vocabulary.
 *
 * Use for: non-link .row items that have hover/press effects but
 * no click handler. Link rows stay as <Link>.
 */
export function ToggleRow({
  children,
  className = '',
  index,
}: {
  children: ReactNode;
  className?: string;
  index?: string;
}) {
  const [checked, setChecked] = useState(false);
  const toggle = useCallback(() => setChecked((p) => !p), []);

  return (
    <button
      className={`row${checked ? ' is-checked' : ''}${className ? ` ${className}` : ''}`}
      type="button"
      role="listitem"
      data-cuelume-hover="whisper"
      data-cuelume-press
      onClick={toggle}
      aria-pressed={checked}
    >
      {index && (
        <span className="row-index">{index}</span>
      )}
      {children}
      <span className="row-check" aria-hidden="true">
        {checked && (
          <svg
            viewBox="0 0 16 16"
            width="12"
            height="12"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.4"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M3 8.5l3.5 3.5L13 5" />
          </svg>
        )}
      </span>
    </button>
  );
}
