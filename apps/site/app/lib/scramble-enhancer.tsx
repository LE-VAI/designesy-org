'use client';

import { useEffect } from 'react';
import { usePathname } from 'next/navigation';

/**
 * ScrambleEnhancer — text scramble + scroll reveal.
 *
 * data-scramble: text churns random chars then decodes when in viewport.
 *   - aria-label set to real text before scrambling (screen reader safety).
 *   - 8s safety timer force-resolves any element the observer never fires on.
 * data-reveal: elements fade up when scrolled into view (staggered by group).
 *
 * Re-runs on every route change (usePathname dependency) so that new page
 * content gets observers wired up. Without this, client-side navigations
 * leave [data-reveal] elements stuck invisible because the enhancer only
 * ran once on the initial mount.
 *
 * Respects prefers-reduced-motion (exits early, shows everything).
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
  const pathname = usePathname();

  useEffect(() => {
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    // Ensure js-ready is set (inline script in layout.tsx should have
    // already done this, but this covers CSP/SSR edge cases).
    document.documentElement.classList.add('js-ready');

    if (reducedMotion) {
      // Under reduced-motion: soften the scramble (don't skip it entirely).
      // The contract says "collapse non-essential motion" = reduce intensity.
      // A fast decode with minimal churn is less motion than a full scramble
      // but still gives the site its identity.
      const isMobile = window.innerWidth < 720;
      const charDelay = isMobile ? 15 : 22; // ~1.5x faster than normal (visible but quick)
      const churnCount = 2; // 2 churn frames (was 4 normal, was 1 before)

      function scaledDelays(text: string): { charDelay: number; churnCount: number } {
        const len = text.length;
        if (len <= 30) return { charDelay, churnCount };
        const targetTotal = 1500; // 1.5s max for reduced-motion decode
        const cd = Math.max(8, Math.min(charDelay, Math.floor(targetTotal / len)));
        const cc = 1;
        return { charDelay: cd, churnCount: cc };
      }

      /* --- Text Scramble (softened) --- */
      const scrambleEls = Array.from(
        document.querySelectorAll<HTMLElement>('[data-scramble]')
      );
      const allObservers: IntersectionObserver[] = [];

      function lockHeight(el: HTMLElement): () => void {
        const h = el.offsetHeight;
        const prevMinHeight = el.style.minHeight;
        const prevWhiteSpace = el.style.whiteSpace;
        const prevOverflow = el.style.overflow;
        const prevTextOverflow = el.style.textOverflow;
        if (h > 0) el.style.minHeight = `${h}px`;
        el.style.whiteSpace = 'nowrap';
        el.style.overflow = 'hidden';
        return () => {
          el.style.minHeight = prevMinHeight;
          el.style.whiteSpace = prevWhiteSpace;
          el.style.overflow = prevOverflow;
          el.style.textOverflow = prevTextOverflow;
        };
      }

      scrambleEls.forEach((el) => {
        const hasChildElements = el.querySelector('span, svg, img, a');
        if (hasChildElements) {
          const firstChild = el.firstChild;
          if (!firstChild || firstChild.nodeType !== 3) return;
          const originalText = firstChild.textContent || '';
          if (!originalText.trim()) return;
          el.setAttribute('aria-label', originalText.trim());
          const sd = scaledDelays(originalText);
          const unlockHeight = lockHeight(el);
          firstChild.textContent = scrambleString(originalText);
          if (isInViewport(el)) {
            decodeToString(originalText, sd.charDelay, sd.churnCount, (text) => {
              firstChild.textContent = text;
              if (text === originalText) unlockHeight();
            });
            return;
          }
          const observer = new IntersectionObserver(
            (entries) => {
              entries.forEach((entry) => {
                if (entry.isIntersecting) {
                  decodeToString(originalText, sd.charDelay, sd.churnCount, (text) => {
                    firstChild.textContent = text;
                    if (text === originalText) unlockHeight();
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
        const realText = (el.textContent || '').trim();
        if (!realText) return;
        el.setAttribute('aria-label', realText);
        const unlockHeight = lockHeight(el);
        const sd = scaledDelays(realText);
        el.textContent = scrambleString(realText);
        if (isInViewport(el)) {
          decodeToString(realText, sd.charDelay, sd.churnCount, (text) => {
            el.textContent = text;
            if (text === realText) unlockHeight();
          });
          return;
        }
        const observer = new IntersectionObserver(
          (entries) => {
            entries.forEach((entry) => {
              if (entry.isIntersecting) {
                decodeToString(realText, sd.charDelay, sd.churnCount, (text) => {
                  el.textContent = text;
                  if (text === realText) unlockHeight();
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

      // Safety net: force-resolve all scramble elements after 3s
      setTimeout(() => {
        scrambleEls.forEach((el) => {
          if (el.getAttribute('aria-label')) {
            const hasChildElements = el.querySelector('span, svg, img, a');
            if (hasChildElements) {
              const firstChild = el.firstChild;
              if (firstChild && firstChild.nodeType === 3) {
                firstChild.textContent = el.getAttribute('aria-label');
              }
            } else {
              el.textContent = el.getAttribute('aria-label');
            }
          }
        });
      }, 3000);

      /* --- Scroll Reveal (keep — content must be visible) --- */
      const revealEls = Array.from(
        document.querySelectorAll<HTMLElement>('[data-reveal]')
      );
      revealEls.forEach((el) => el.classList.add('is-revealed'));

      return () => {
        allObservers.forEach((o) => o.disconnect());
      };
    }

    const isMobile = window.innerWidth < 720;
    const charDelay = isMobile ? 20 : 32;
    const churnCount = isMobile ? 2 : 4;

    /**
     * Scale decode speed by text length — long sentences shouldn't
     * take 10+ seconds. Cap total decode time around 2.5s.
     */
    function scaledDelays(text: string): { charDelay: number; churnCount: number } {
      const len = text.length;
      if (len <= 30) return { charDelay, churnCount };
      // Scale: longer text gets faster per-char delay and fewer churns
      const targetTotal = 2500; // ms target for decode phase
      const cd = Math.max(8, Math.min(charDelay, Math.floor(targetTotal / len)));
      const cc = Math.max(1, Math.min(churnCount, Math.floor(1200 / (len * 40))));
      return { charDelay: cd, churnCount: cc };
    }

    /* --- Text Scramble --- */
    const scrambleEls = Array.from(
      document.querySelectorAll<HTMLElement>('[data-scramble]')
    );

    const allObservers: IntersectionObserver[] = [];

    // Track elements that still need force-resolving (safety net)
    const pendingResolvers: (() => void)[] = [];

    /**
     * Lock an element's dimensions to its current rendered state before
     * scrambling, so random glyphs with different metrics don't cause
     * layout shift (page jump) or overflow during the decode animation.
     *
     * Strategy: measure the real text's height, lock it via min-height.
     * Keep white-space: nowrap to prevent line-count changes, but add
     * overflow: hidden so scramble glyphs that are wider than the real
     * text are clipped instead of pushing past the container border.
     * The text stays exactly where the real text would naturally sit.
     * Released after decoding completes (or on safety-net resolve).
     */
    function lockHeight(el: HTMLElement): () => void {
      const h = el.offsetHeight;
      const prevMinHeight = el.style.minHeight;
      const prevWhiteSpace = el.style.whiteSpace;
      const prevOverflow = el.style.overflow;
      const prevTextOverflow = el.style.textOverflow;
      if (h > 0) el.style.minHeight = `${h}px`;
      // Prevent line-count changes from scramble glyphs wrapping
      el.style.whiteSpace = 'nowrap';
      // Clip any overflow so wider scramble glyphs don't push past borders
      el.style.overflow = 'hidden';
      return () => {
        el.style.minHeight = prevMinHeight;
        el.style.whiteSpace = prevWhiteSpace;
        el.style.overflow = prevOverflow;
        el.style.textOverflow = prevTextOverflow;
      };
    }

    scrambleEls.forEach((el) => {
      const hasChildElements = el.querySelector('span, svg, img, a');

      if (hasChildElements) {
        // For elements with children (like wordmark with .dot span),
        // scramble only the first text node
        const firstChild = el.firstChild;
        if (!firstChild || firstChild.nodeType !== 3) return;

        const originalText = firstChild.textContent || '';
        if (!originalText.trim()) return;

      // aria-label fallback: screen readers get the real text immediately
      el.setAttribute('aria-label', originalText.trim());

      const sd = scaledDelays(originalText);
      const unlockHeight = lockHeight(el);
      firstChild.textContent = scrambleString(originalText);

      // If already in viewport, start decoding immediately
      if (isInViewport(el)) {
        decodeToString(originalText, sd.charDelay, sd.churnCount, (text) => {
          firstChild.textContent = text;
          if (text === originalText) unlockHeight();
        });
        return;
      }

      // Otherwise wait for intersection
      const observer = new IntersectionObserver(
        (entries) => {
          entries.forEach((entry) => {
            if (entry.isIntersecting) {
              decodeToString(originalText, sd.charDelay, sd.churnCount, (text) => {
                firstChild.textContent = text;
                if (text === originalText) unlockHeight();
              });
              observer.disconnect();
            }
          });
        },
        { threshold: 0.3 }
      );
      observer.observe(el);
      allObservers.push(observer);

      // Safety net: force-resolve if observer never fires
      pendingResolvers.push(() => {
        firstChild.textContent = originalText;
        unlockHeight();
      });
      return;
      }

      // Simple text-only element
      const realText = (el.textContent || '').trim();
      if (!realText) return;

      // aria-label fallback: screen readers get the real text immediately
      el.setAttribute('aria-label', realText);

      const unlockHeight = lockHeight(el);
      const sd = scaledDelays(realText);
      el.textContent = scrambleString(realText);

      // If already in viewport, start decoding immediately
      if (isInViewport(el)) {
        decodeToString(realText, sd.charDelay, sd.churnCount, (text) => {
          el.textContent = text;
          if (text === realText) unlockHeight();
        });
        return;
      }

      // Otherwise wait for intersection
      const observer = new IntersectionObserver(
        (entries) => {
          entries.forEach((entry) => {
            if (entry.isIntersecting) {
              decodeToString(realText, sd.charDelay, sd.churnCount, (text) => {
                el.textContent = text;
                if (text === realText) unlockHeight();
              });
              observer.disconnect();
            }
          });
        },
        { threshold: 0.3 }
      );
      observer.observe(el);
      allObservers.push(observer);

      // Safety net: force-resolve if observer never fires
      pendingResolvers.push(() => {
        el.textContent = realText;
        unlockHeight();
      });
    });

    // Max-timeout safety net: force-resolve all pending scramble elements
    // after 8 seconds, regardless of observer state. Catches edge cases
    // where IntersectionObserver never fires (background tab, zero-height
    // elements, instant scroll past threshold).
    const safetyTimer = setTimeout(() => {
      pendingResolvers.forEach((resolve) => resolve());
    }, 8000);

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
      // Clear the stagger delay after the reveal transition completes
      // so hover/tilt transforms respond immediately
      setTimeout(() => {
        el.style.transitionDelay = '';
      }, delay + 700);
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
      clearTimeout(safetyTimer);
    };
  }, [pathname]); // Re-run on route change so new page elements get observers

  return null;
}