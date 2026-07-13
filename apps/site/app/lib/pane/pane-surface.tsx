'use client';

import type { CSSProperties, ReactNode } from 'react';

type PaneKind = 'sheet' | 'card' | 'chip' | 'lens';

type PaneSurfaceProps = {
  kind?: PaneKind;
  /** Enable tier-2 refraction class (Chromium). */
  refract?: boolean;
  className?: string;
  style?: CSSProperties;
  children?: ReactNode;
};

/**
 * Layered glass surface:
 *   [backdrop layer] — only this gets backdrop-filter / refraction
 *   [content layer]  — labels stay optically sharp
 *
 * Applying refraction to the same node as text either softens type
 * or forces a single flat treatment. Split layers = real glass stack.
 */
export function PaneSurface({
  kind = 'card',
  refract = true,
  className = '',
  style,
  children,
}: PaneSurfaceProps) {
  const shell = [
    'pane-surface',
    `pane-${kind}`,
    refract ? 'pane-refract' : '',
    className,
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <div className={shell} style={style}>
      <div className="pane-backdrop" aria-hidden="true" />
      <div className="pane-content">{children}</div>
    </div>
  );
}
