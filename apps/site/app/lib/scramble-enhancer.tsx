'use client';

import { useEffect } from 'react';

/**
 * ScrambleEnhancer — two animation layers powered by IntersectionObserver:
 *
 * 1. Text Scramble (data-scramble): elements churn random characters
 *    then decode into their real text when they enter the viewport.
 *    Fires once per element. Opt-in via data-scramble attribute.
 *
 * 2. Scroll Reveal (data-reveal): elements start hidden and animate
 *    in when they scroll into view. Staggered by index within a
 *    shared parent (data-reveal-group). Opt-in via data-reveal.
 *
 * Respects prefers-reduced-motion (exits early).
 * Zero dependencies, passive observers only.
 */

const GLYPHS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789·─│▌+-=*';

function randomChar() {
  return GLYPHS[Math.floor(Math.random() * GLYPHS.length)];
}

function scrambleText(text: string): string {
  return text
    .split('')
    .map((ch) => (ch === ' ' || ch === '.' || ch === '\n' ? ch : randomChar()))
    .join('');
}

export function ScrambleEnhancer() {
  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    const isMobile = window.innerWidth < 720;
    const charDelay = isMobile ? 20 : 32;
    const churnCount = isMobile ? 2 : 4;

    /* --- Text Scramble --- */
    const scrambleEls = Array.from(document.querySelectorAll<HTMLElement>('[data-scramble]'));

    const scrambleObservers: IntersectionObserver[] = [];

    scrambleEls.forEach((el) => {
      // Get real text — prefer data-scramble-text, fall back to textContent
      const realText = (el.dataset.scrambleText || el.textContent || '').trim();
      if (!realText) return;

      // Don't scramble if element already has child elements (like the dot span)
      const hasChildElements = el.querySelector('span, svg, img');
      if (hasChildElements) {
        // For elements with children (like wordmark with .dot span),
        // scramble only the first text node
        const firstText = el.firstChild;
        if (firstText && firstText.nodeType === Node.TEXT_NODE) {
          const originalText = firstText.textContent || '';
          firstText.textContent = scrambleText(originalText);

          const observer = new IntersectionObserver(
            (entries) => {
              entries.forEach((entry) => {
                if (entry.isIntersecting) {
                  decodeText(firstText as Text, originalText, charDelay, churnCount);
                  observer.disconnect();
                }
              });
            },
            { threshold: 0.3 }
          );
          observer.observe(el);
          scrambleObservers.push(observer);
        }
        return;
      }

      // Simple text-only element
      el.textContent = scrambleText(realText);

      const observer = new IntersectionObserver(
        (entries) => {
          entries.forEach((entry) => {
            if (entry.isIntersecting) {
              decodeElement(el, realText, charDelay, churnCount);
              observer.disconnect();
            }
          });
        },
        { threshold: 0.3 }
      );
      observer.observe(el);
      scrambleObservers.push(observer);
    });

    /* --- Scroll Reveal --- */
    const revealEls = Array.from(document.querySelectorAll<HTMLElement>('[data-reveal]'));

    // Group by parent for stagger
    const groups = new Map<HTMLElement, HTMLElement[]>();
    revealEls.forEach((el) => {
      const parent = el.closest('[data-reveal-group]') || el.parentElement;
      if (!parent) return;
      if (!groups.has(parent)) groups.set(parent, []);
      groups.get(parent)!.push(el);
    });

    const revealObserver = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            const el = entry.target as HTMLElement;
            const parent = el.closest('[data-reveal-group]') || el.parentElement;
            const siblings = parent ? groups.get(parent as HTMLElement) : null;
            let delay = 0;
            if (siblings) {
              const idx = siblings.indexOf(el);
              delay = idx * 80;
            }
            el.style.transitionDelay = `${delay}ms`;
            el.classList.add('is-revealed');
            revealObserver.unobserve(el);
          }
        });
      },
      { threshold: 0.15, rootMargin: '0px 0px -40px 0px' }
    );

    revealEls.forEach((el) => revealObserver.observe(el));

    return () => {
      scrambleObservers.forEach((o) => o.disconnect());
      revealObserver.disconnect();
    };
  }, []);

  return null;
}

/** Decode a Text node from scrambled to real text, left to right */
function decodeText(
  textNode: Text,
  realText: string,
  charDelay: number,
  churnCount: number
) {
  let revealed = 0;
  const total = realText.length;

  const step = () => {
    if (revealed >= total) {
      textNode.textContent = realText;
      return;
    }

    // Build the current state: revealed chars + scrambled rest
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
    textNode.textContent = result;

    revealed++;
    setTimeout(step, charDelay);
  };

  // Run a few churn frames before starting the reveal
  let churn = 0;
  const churnStep = () => {
    if (churn >= churnCount) {
      step();
      return;
    }
    textNode.textContent = scrambleText(realText);
    churn++;
    setTimeout(churnStep, 40);
  };

  churnStep();
}

/** Decode a simple element (no child elements) */
function decodeElement(
  el: HTMLElement,
  realText: string,
  charDelay: number,
  churnCount: number
) {
  let revealed = 0;
  const total = realText.length;

  const step = () => {
    if (revealed >= total) {
      el.textContent = realText;
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
    el.textContent = result;

    revealed++;
    setTimeout(step, charDelay);
  };

  let churn = 0;
  const churnStep = () => {
    if (churn >= churnCount) {
      step();
      return;
    }
    el.textContent = scrambleText(realText);
    churn++;
    setTimeout(churnStep, 40);
  };

  churnStep();
}