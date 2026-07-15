'use client';

import { useEffect } from 'react';

/**
 * ScrambleEnhancer — text scramble + scroll reveal.
 *
 * data-scramble: text churns random chars then decodes when in viewport.
 * data-reveal: elements fade up when scrolled into view (staggered by group).
 *
 * Respects prefers-reduced-motion (exits early, shows everything).
 *
 * Robustness: no rAF wrapper (avoids cleanup race on hydration remount),
 * scroll listener fallback catches elements the IntersectionObserver misses.
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
  let cancelled = false;

  const revealStep = () => {
    if (cancelled || revealed >= total) {
      if (!cancelled) onUpdate(realText);
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
    if (cancelled || churn >= churnCount) {
      if (!cancelled) revealStep();
      return;
    }
    onUpdate(scrambleString(realText));
    churn++;
    setTimeout(churnStep, 40);
  };

  churnStep();

  // Return cancel function so caller can abort if needed
  return void (undefined as never);
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
      document.documentElement.classList.add('js-ready');
      return;
    }

    // Ensure js-ready is set (inline script in layout.tsx should have
    // already done this, but this covers CSP/SSR edge cases).
    document.documentElement.classList.add('js-ready');

    const isMobile = window.innerWidth < 720;
    const charDelay = isMobile ? 20 : 32;
    const churnCount = isMobile ? 2 : 4;

    /* --- Text Scramble --- */
    const scrambleEls = Array.from(
      document.querySelectorAll<HTMLElement>('[data-scramble]')
    );

    const allObservers: IntersectionObserver[] = [];

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
          decodeToString(originalText, charDelay, churnCount, (text) => {
            firstChild.textContent = text;
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
        decodeToString(realText, charDelay, churnCount, (text) => {
          el.textContent = text;
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
    const revealedSet = new Set<HTMLElement>();

    function revealEl(el: HTMLElement) {
      if (revealedSet.has(el)) return;
      revealedSet.add(el);
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
    }

    revealEls.forEach((el) => {
      // If already in viewport, reveal immediately
      if (isInViewport(el)) {
        revealEl(el);
        return;
      }
      // Otherwise observe for intersection
      revealElsToObserve.push(el);
    });

    const revealObserver = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            revealEl(entry.target as HTMLElement);
            revealObserver.unobserve(entry.target as HTMLElement);
          }
        });
      },
      { threshold: 0.15, rootMargin: '0px 0px -40px 0px' }
    );

    revealElsToObserve.forEach((el) => revealObserver.observe(el));

    // Fallback: scroll listener catches elements the observer might miss
    // (instant scroll jumps, timing edge cases during hydration)
    let scrollTicking = false;
    function onScroll() {
      if (scrollTicking) return;
      scrollTicking = true;
      requestAnimationFrame(() => {
        scrollTicking = false;
        revealElsToObserve.forEach((el) => {
          if (!revealedSet.has(el) && isInViewport(el)) {
            revealEl(el);
            revealObserver.unobserve(el);
          }
        });
      });
    }
    window.addEventListener('scroll', onScroll, { passive: true });
    // Also fire once after a short delay to catch any elements that
    // became visible during hydration/layout
    const fallbackTimer = setTimeout(onScroll, 200);

    return () => {
      allObservers.forEach((o) => o.disconnect());
      revealObserver.disconnect();
      window.removeEventListener('scroll', onScroll);
      clearTimeout(fallbackTimer);
    };
  }, []);

  return null;
}