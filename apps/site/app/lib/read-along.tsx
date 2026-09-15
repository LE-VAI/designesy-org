"use client";

/*
  Bimodal prose wrapper around @designesy/read-along (karaoke-sync highlighting
  over pluggable TTS). The value is bimodal reinforcement: a reader hears and
  sees the same word at the same moment — the pattern that helps dyslexic and
  second-language readers most.

  Four integration hazards, each handled deliberately:

  1. SERVER-SIDE EVALUATION. The package runs `document.createElement` and
     `customElements.define()` at module top level, so a static import throws
     `ReferenceError: document is not defined` in any Node/prerender context —
     and Next.js prerenders Client Components too, so this would break the BUILD
     rather than degrade the page. Imported dynamically inside useEffect, which
     never runs on the server.

  2. STYLESHEET IS OPT-IN AND FAILS SILENTLY. The package injects no styles;
     without its CSS the ::highlight() rules never paint and nothing reports an
     error. The CSS is imported below so it enters the page's CSS graph.

  3. CLS AT UPGRADE. The element is inline-level before upgrade and block after.
     `read-along { display: block }` lives in globals.css so the block box is
     reserved before the definition loads.

  4. THEMING. The package reads `--ra-highlight` / `--ra-accent` via var()
     fallbacks; globals.css sets them from the site's own signal color so the
     highlight is brand blue rather than the package's hardcoded literal.

  Accessibility: the host renders as plain HTML before upgrade, so prose is
  readable with JS disabled or while the module loads. Nothing autoplays — the
  reader starts speech with their own control, satisfying WCAG 1.4.2 and the
  iOS requirement that speech follow a user gesture.
*/

import { useEffect, useRef } from 'react';
import '@designesy/read-along/read-along.css';

type ReadAlongProps = {
  children: React.ReactNode;
  /** BCP-47 tag for the host element, e.g. "en". */
  lang?: string;
};

export function ReadAlong({ children, lang = 'en' }: ReadAlongProps) {
  const hostRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    // Dynamic import only — see hazard 1. On failure the prose stays readable
    // and nothing is announced, because the component is additive: it enhances
    // text that is already there.
    let cancelled = false;

    // Capture the host node NOW, not in the cleanup. React detaches refs before
    // running effect cleanup, so `hostRef.current` is already null by the time
    // the teardown below executes — reading it inside the cleanup silently
    // skips the stop() call and lets speech outlive the prose it belongs to.
    const host = hostRef.current as (HTMLElement & { stop?: () => void }) | null;

    import("@designesy/read-along")
      .then(() => {
        if (cancelled) return;
        // Nothing further needed: the module registers the element, and the
        // browser upgrades the already-rendered tag in place.
      })
      .catch(() => {
        /* additive enhancement — a failed load must not surface as an error */
      });

    return () => {
      cancelled = true;
      // Stop any in-flight speech when the route changes so audio never
      // outlives the prose it belongs to.
      host?.stop?.();
    };
  }, []);

  return (
    // biome-ignore lint/a11y/noUnknownProperty: <read-along> is a custom element
    <read-along ref={hostRef as React.RefObject<HTMLElement>} lang={lang}>
      {children}
    </read-along>
  );
}
