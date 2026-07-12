'use client';

import { useState, type ReactNode, type ButtonHTMLAttributes } from 'react';

/**
 * Generic toggle wrapper for any element that should be
 * click-to-toggle (pillars, layer-items, articles, etc.).
 * Renders a <button> with aria-pressed and is-checked class.
 * Pass data-cuelume-* attrs via rest props.
 */
export function Toggle({
  children,
  className = '',
  ...rest
}: {
  children: ReactNode;
  className?: string;
} & Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'onClick' | 'type'>) {
  const [checked, setChecked] = useState(false);
  return (
    <button
      className={`${className}${checked ? ' is-checked' : ''}`}
      type="button"
      onClick={() => setChecked((p) => !p)}
      aria-pressed={checked}
      {...rest}
    >
      {children}
    </button>
  );
}
