'use client';

import { useEffect } from 'react';
import { bind } from 'cuelume';

/**
 * Mounts once in the root layout. Calls bind() on the document
 * to delegate all data-cuelume-* attributes. Idempotent —
 * safe across route transitions in the Next.js app router.
 */
export function CuelumeBinder() {
  useEffect(() => {
    bind();
  }, []);

  return null;
}