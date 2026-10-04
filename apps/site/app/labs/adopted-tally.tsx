'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import './adopted-tally.css';

/**
 * The head of a lab's Portable contract list: the lede, and a tally
 * ("3 / 10 adopted") at the end of the line, over the column of check wells
 * the closed list draws just inside the 7-line. The rows are ToggleRows; the
 * tally reads their own aria-pressed state, so ToggleRow keeps its API and
 * nothing is stored twice. The count is session state, the same as the rows
 * it counts, and it is announced politely as it changes.
 */
export function AdoptedTally({
  total,
  lede,
  children,
}: {
  total: number;
  lede: ReactNode;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [adopted, setAdopted] = useState(0);

  useEffect(() => {
    const root = ref.current;
    if (!root) return;
    // Every ToggleRow mounts unpressed, so the count starts at 0 and only a
    // press can change it.
    const read = () =>
      setAdopted(root.querySelectorAll('[aria-pressed="true"]').length);
    const observer = new MutationObserver(read);
    observer.observe(root, {
      subtree: true,
      attributes: true,
      attributeFilter: ['aria-pressed'],
    });
    return () => observer.disconnect();
  }, []);

  return (
    <div className="lab-tally" ref={ref}>
      <div className="lab-tally-head">
        <p className="surface-note">{lede}</p>
        <p className="lab-tally-count" data-complete={adopted === total ? '' : undefined}>
          <i className="lab-tally-led" aria-hidden="true" />
          <span aria-live="polite" aria-atomic="true">
            <b>{adopted}</b> / {total} adopted
          </span>
        </p>
      </div>
      {children}
    </div>
  );
}
