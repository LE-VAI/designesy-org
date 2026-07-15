'use client';

import { useEffect } from 'react';

/**
 * ScrambleEnhancer — text scramble + scroll reveal.
 *
 * data-scramble: text churns random chars then decodes when in viewport.
 * data-reveal: elements fade up when scrolled into view (staggered by group).
 *
 * Key timing fix: elements already in the viewport on mount are triggered
 * immediately via requestAnimationFrame — no waiting for IntersectionObserver
 * to fire asynchronously (which caused stuck invisible/ scrambled content).
 *
 * Respects prefers-reduced-motion (exits early).
 */

const GLYPHS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789·─│▌+-=*';

function randomChar(): string {
  return GLYPHS[Math.floor(Math.random() * GLYPHS.length)];
}

function scrambleString(text: string): string {
  return text
    .split('')
    .map((ch) => (ch === ' ' || ch === '.' || ch === '\n' ? ch : randomChar()))
    .join('');
}

function decodeToString(
  realText: string,
  charDelay: number,
  churnCount: number,
  onUpdate: (text: string) => void
): void {
  let revealed = 0;
  const total = realText.length;

  const revealStep = () => {
    if (revealed >= total) {
      onUpdate(realText);
      return;
    }
    let result = '';
    for (let i = 0; i < total; i++) {
      if (i < revealed) {
        result += realText[i];
      } else if (realText[i] === ' ' || realText[i] === '.' || realText[i] === '\n') {
        result += realText[i];
      } else {
        result += randomChar();
      }
    }
    onUpdate(result);
    revealed++;
    setTimeout(revealStep, charDelay);
  };

  let churn = 0;
  const churnStep = () => {
    if (churn >= churnCount) {
      revealStep();
      return;
    }
    onUpdate(scrambleString(realText));
    churn++;
    setTimeout(churnStep, 40);
  };

  churnStep();
}

/** Check if an element is currently in the viewport */
function isInViewport(el: HTMLElement): boolean {
  const rect = el.getBoundingClientRect();
  return (
    rect.top < window.innerHeight &&
    rect.bottom > 0 &&
    rect.left < window.innerWidth &&
    rect.right > 0
  );
}

export function ScrambleEnhancer() {
  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      // Even in reduced-motion mode, ensure js-ready is set so any CSS
      // that depends on it (like [data-reveal] overrides) works.
      document.documentElement.classList.add('js-ready');
      return;
    }

    // Fallback: ensure js-ready is set (inline script in layout.tsx should
    // have already done this, but this covers CSP-stripped or SSR edge cases).
    document.documentElement.classList.add('js-ready');

    let allObservers: IntersectionObserver[] = [];
    let revealObserver: IntersectionObserver | null = null;
    let didRun = false;

    // Wait for layout to settle before checking viewport positions
    const rafId = requestAnimationFrame(() => {
      if (didRun) return;
      didRun = true;

      const isMobile = window.innerWidth < 720;
      const charDelay = isMobile ? 20 : 32;
      const churnCount = isMobile ? 2 : 4;

    /* --- Text Scramble --- */
    const scrambleEls = Array.from(
      document.querySelectorAll<HTMLElement>('[data-scramble]')
    );

    allObservers = [];

    scrambleEls.forEach((el) => {
      const hasChildElements = el.querySelector('span, svg, img, a');

      if (hasChildElements) {
        // For elements with children (like wordmark with .dot span),
        // scramble only the first text node
        const firstChild = el.firstChild;
        if (!firstChild || firstChild.nodeType !== 3) return;

        const originalText = firstChild.textContent || '';
        if (!originalText.trim()) return;

        firstChild.textContent = scrambleString(originalText);

        // If already in viewport, start decoding immediately
        if (isInViewport(el)) {
          requestAnimationFrame(() => {
            decodeToString(originalText, charDelay, churnCount, (text) => {
              firstChild.textContent = text;
            });
          });
          return;
        }

        // Otherwise wait for intersection
        const observer = new IntersectionObserver(
          (entries) => {
            entries.forEach((entry) => {
              if (entry.isIntersecting) {
                decodeToString(originalText, charDelay, churnCount, (text) => {
                  firstChild.textContent = text;
                });
                observer.disconnect();
              }
            });
          },
          { threshold: 0.3 }
        );
        observer.observe(el);
        allObservers.push(observer);
        return;
      }

      // Simple text-only element
      const realText = (el.textContent || '').trim();
      if (!realText) return;

      el.textContent = scrambleString(realText);

      // If already in viewport, start decoding immediately
      if (isInViewport(el)) {
        requestAnimationFrame(() => {
          decodeToString(realText, charDelay, churnCount, (text) => {
            el.textContent = text;
          });
        });
        return;
      }

      // Otherwise wait for intersection
      const observer = new IntersectionObserver(
        (entries) => {
          entries.forEach((entry) => {
            if (entry.isIntersecting) {
              decodeToString(realText, charDelay, churnCount, (text) => {
                el.textContent = text;
              });
              observer.disconnect();
            }
          });
        },
        { threshold: 0.3 }
      );
      observer.observe(el);
      allObservers.push(observer);
    });

    /* --- Scroll Reveal --- */
    const revealEls = Array.from(
      document.querySelectorAll<HTMLElement>('[data-reveal]')
    );

    // Group by parent for stagger
    const groupMap = new Map<HTMLElement, HTMLElement[]>();
    revealEls.forEach((el) => {
      const parent = el.closest('[data-reveal-group]') as HTMLElement | null;
      const key = parent || (el.parentElement as HTMLElement);
      if (!key) return;
      if (!groupMap.has(key)) groupMap.set(key, []);
      groupMap.get(key)!.push(el);
    });

    const revealElsToObserve: HTMLElement[] = [];

    revealEls.forEach((el) => {
      // If already in viewport, reveal immediately
      if (isInViewport(el)) {
        const parent = el.closest('[data-reveal-group]') as HTMLElement | null;
        const key = parent || (el.parentElement as HTMLElement);
        const siblings = key ? groupMap.get(key) : null;
        let delay = 0;
        if (siblings) {
          const idx = siblings.indexOf(el);
          delay = idx * 80;
        }
        el.style.transitionDelay = `${delay}ms`;
        // Use rAF to ensure the initial hidden state is painted first
        requestAnimationFrame(() => {
          el.classList.add('is-revealed');
        });
        return;
      }

      // Otherwise observe for intersection
      revealElsToObserve.push(el);
    });

    revealObserver = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            const el = entry.target as HTMLElement;
            const parent = el.closest('[data-reveal-group]') as HTMLElement | null;
            const key = parent || (el.parentElement as HTMLElement);
            const siblings = key ? groupMap.get(key) : null;
            let delay = 0;
            if (siblings) {
              const idx = siblings.indexOf(el);
              delay = idx * 80;
            }
            el.style.transitionDelay = `${delay}ms`;
            el.classList.add('is-revealed');
            if (revealObserver) revealObserver.unobserve(el);
          }
        });
      },
      { threshold: 0.15, rootMargin: '0px 0px -40px 0px' }
    );

    if (revealObserver) {
      const ro = revealObserver;
      revealElsToObserve.forEach((el) => ro.observe(el));
    }

    }); // end rAF

    return () => {
      cancelAnimationFrame(rafId);
      allObservers.forEach((o) => o.disconnect());
      if (revealObserver) revealObserver.disconnect();
    };
  }, []);

  return null;
}