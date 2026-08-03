'use client';

import { useState } from 'react';

/**
 * Concept B — VAI footer follow-card.
 *
 * The single entry point into VAI from the Designesy shell. One clickable card
 * in the footer; clicking it expands a yellow-accented panel below. The shell
 * stays blue-led Designesy; inside the panel, VAI owns the surface (#FFC400
 * accent). This is the only VAI-colored control on the page — everything else
 * is Designesy blue.
 *
 * Boundaries respected:
 *  - CHARACTER != BRAND: VAI is the character, Designesy is the system. The card
 *    says "Meet VAI" (character intro), not "VAI by Designesy" (brand merge).
 *  - Yellow is contained: --vai-yellow (#FFC400) only appears inside the open
 *    panel. The card border, label, and footer shell stay Designesy blue.
 *  - No "ATLAS" anywhere on this surface.
 *
 * Scoped to /test — concept preview only, not wired to a real /vai route yet.
 */

export default function VaiCard() {
  const [open, setOpen] = useState(false);

  return (
    <section
      aria-label="VAI preview"
      style={{
        width: '100%',
        maxWidth: 'var(--maxw)',
        marginTop: '1rem',
      }}
    >
      {/* The card — Designesy shell styling, signal-blue accent */}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-controls="vai-panel"
        data-firework
        style={{
          width: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '1rem',
          padding: '1rem 1.25rem',
          background: 'var(--surface)',
          border: '1px solid var(--line)',
          borderRadius: 'var(--radius)',
          cursor: 'pointer',
          textAlign: 'left',
          color: 'var(--ink)',
          fontFamily: 'inherit',
          fontSize: 'inherit',
          transition:
            'border-color 200ms var(--ease), background 200ms var(--ease), transform 150ms var(--ease-out)',
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.borderColor = 'var(--signal-light)';
          e.currentTarget.style.background = 'var(--surface-raised)';
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.borderColor = 'var(--line)';
          e.currentTarget.style.background = 'var(--surface)';
        }}
        onMouseDown={(e) => {
          e.currentTarget.style.transform = 'translateY(1px)';
        }}
        onMouseUp={(e) => {
          e.currentTarget.style.transform = 'translateY(0)';
        }}
      >
        <span style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          {/* VAI monogram — a small yellow dot inside a signal ring.
              Yellow lives HERE only (the entry mark), not on the shell. */}
          <span
            aria-hidden="true"
            style={{
              width: '28px',
              height: '28px',
              borderRadius: '50%',
              border: '1.5px solid var(--signal-light)',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
            }}
          >
            <span
              style={{
                width: '10px',
                height: '10px',
                borderRadius: '50%',
                background: '#FFC400',
              }}
            />
          </span>
          <span style={{ display: 'flex', flexDirection: 'column', gap: '0.15rem' }}>
            <span
              style={{
                fontSize: '0.72rem',
                fontWeight: 600,
                letterSpacing: '0.18em',
                textTransform: 'uppercase',
                color: 'var(--muted-dim)',
              }}
            >
              The character
            </span>
            <span style={{ fontSize: '0.95rem', fontWeight: 700, color: 'var(--ink)' }}>
              Meet VAI
            </span>
          </span>
        </span>

        {/* Chevron rotates on open */}
        <span
          aria-hidden="true"
          style={{
            fontSize: '0.7rem',
            color: 'var(--muted)',
            transition: 'transform 200ms var(--ease-out)',
            transform: open ? 'rotate(180deg)' : 'rotate(0deg)',
          }}
        >
          ▾
        </span>
      </button>

      {/* The panel — VAI's surface. Yellow accent inside, per the rule:
          "VAI #FFC400 inside panel; Designesy #FECC34 suppressed on unified surfaces." */}
      {open && (
        <div
          id="vai-panel"
          role="region"
          aria-label="About VAI"
          style={{
            marginTop: '0.5rem',
            padding: '1.5rem',
            background: 'var(--surface-raised)',
            border: '1px solid var(--line)',
            borderRadius: 'var(--radius)',
            // The yellow accent is contained here — a left rail + a CTA fill.
            boxShadow: 'inset 3px 0 0 0 #FFC400',
          }}
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
            <span
              style={{
                fontSize: '0.7rem',
                fontWeight: 700,
                letterSpacing: '0.2em',
                textTransform: 'uppercase',
                color: '#FFC400',
              }}
            >
              VAI
            </span>
            <p
              style={{
                fontSize: '1.05rem',
                lineHeight: 1.5,
                color: 'var(--ink)',
                margin: 0,
              }}
            >
              The speaking character of the Designesy ecosystem. VAI introduces
              the contract, narrates the score, and answers in the first person.
              The system stays Designesy; the voice is VAI.
            </p>
            <p
              style={{
                fontSize: '0.8rem',
                lineHeight: 1.55,
                color: 'var(--muted)',
                margin: 0,
              }}
            >
              Concept preview — the live VAI page isn&apos;t wired yet. On the
              production footer this card will be the only entry into VAI.
            </p>

            {/* CTA — yellow fill, dark ink on yellow (11.6:1 contrast). */}
            <div style={{ marginTop: '0.25rem' }}>
              <span
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '0.5rem',
                  padding: '0.6rem 1rem',
                  background: '#FFC400',
                  color: '#1a1a1e',
                  borderRadius: 'var(--radius-sm)',
                  fontSize: '0.85rem',
                  fontWeight: 700,
                  letterSpacing: '-0.01em',
                  // Non-interactive concept: this is a preview, not a live link.
                  opacity: 0.85,
                }}
              >
                Enter VAI
                <span aria-hidden="true">→</span>
              </span>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}