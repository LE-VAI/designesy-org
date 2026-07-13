'use client';

import { useEffect } from 'react';
import { detectPaneTier } from './capability';

/**
 * Sets data-pane-tier on <html>.
 * Per-surface filters are owned by PaneSurface (element-sized maps).
 * Global filter ids remain optional for legacy topbar path.
 */
export function PaneRoot() {
  useEffect(() => {
    const t = detectPaneTier();
    document.documentElement.dataset.paneTier = String(t);
  }, []);

  return null;
}
