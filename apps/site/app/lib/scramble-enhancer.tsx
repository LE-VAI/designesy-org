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
  // Non-breaking spaces (hero word gaps) pass through like normal spaces so
  // the gap never becomes a random glyph or disappears during churn.
  return text
    .split('')
    .map((ch) =>
      ch === ' ' || ch === ' ' || ch === '.' || ch === '\n' ? ch : randomChar()
    )
    .join('');
}

function decodeToString(
  realText: string,
  charDelay: number,
  churnCount: number,
  onUpdate: (text: string) => void
): () => void {
  let revealed = 0;
  const total = realText.length;
  let cancelled = false;
  let timer: ReturnType<typeof setTimeout> | null = null;

  const revealStep = () => {
    if (cancelled || revealed >= total) {
      if (!cancelled) onUpdate(realText);
      return;
    }
    let result = '';
    for (let i = 0; i < total; i++) {
      if (i < revealed) {
        result += realText[i];
      } else if (
        realText[i] === ' ' ||
        realText[i] === ' ' ||
        realText[i] === '.' ||
        realText[i] === '\n'
      ) {
        result += realText[i];
      } else {
        result += randomChar();
      }
    }
    onUpdate(result);
    revealed++;
    timer = setTimeout(revealStep, charDelay);
  };

  let churn = 0;
  const churnStep = () => {
    if (cancelled || churn >= churnCount) {
      if (!cancelled) revealStep();
      return;
    }
    onUpdate(scrambleString(realText));
    churn++;
    timer = setTimeout(churnStep, 40);
  };

  churnStep();

  // Caller-cancellable: used by last-word rotators to prevent overlapping
  // decode passes on the same element (a stuck-scramble vector when an
  // older timeout survives a route-change re-scan).
  return () => {
    cancelled = true;
    if (timer) clearTimeout(timer);
  };
}

// Deterministic, time-derived decode: which chars are resolved is a pure
// function of elapsed time (with a small per-char ease-out stagger), so a
// cancelled/duplicated pass can never leave a glyph stuck mid-scramble.
function decodeWordTimeDerived(
  word: string,
  colorFn: (i: number, n: number) => string | null,
  onFrame: (g: { ch: string; done: boolean; color: string | null }[]) => void
): () => void {
  const churnMs = 140; // full-scramble window before any resolve
  const staggerMs = 42; // per-char resolve stagger (slot-machine settle)
  const total = word.length;
  const duration = churnMs + total * staggerMs + 90;
  let raf = 0;
  const start = performance.now();

  const tick = (now: number) => {
    const t = now - start;
    const glyphs: { ch: string; done: boolean; color: string | null }[] = [];
    for (let i = 0; i < total; i++) {
      const threshold = churnMs + i * staggerMs;
      const done = t > threshold;
      glyphs.push({
        ch: done ? word[i] : randomChar(),
        done,
        color: done ? (colorFn ? colorFn(i, total) : null) : null,
      });
    }
    onFrame(glyphs);
    if (t < duration) {
      raf = requestAnimationFrame(tick);
    } else {
      // Final state — guaranteed real text + colors.
      onFrame(
        word.split('').map((ch, i) => ({
          ch,
          done: true,
          color: colorFn ? colorFn(i, total) : null,
        }))
      );
    }
  };
  raf = requestAnimationFrame(tick);
  return () => cancelAnimationFrame(raf);
}
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
          if (el.hasAttribute('data-scramble-rotate-words')) {
            // Rotator (hero L2): simple-text path so the whole sentence
            // decodes in like every other line; spans stay intact for the
            // sentence to remain readable under softened motion.
            const realText = (el.textContent || '').trim();
            if (!realText) return;
            el.setAttribute('aria-label', realText);
            const unlockHeight = lockHeight(el);
            const sd = scaledDelays(realText);
            el.textContent = scrambleString(realText);
            const finish = () => unlockHeight();
            if (isInViewport(el)) {
              decodeToString(realText, sd.charDelay, sd.churnCount, (text) => {
                el.textContent = text;
                if (text === realText) finish();
              });
              return;
            }
            const observer = new IntersectionObserver(
              (entries) => {
                entries.forEach((entry) => {
                  if (entry.isIntersecting) {
                    decodeToString(realText, sd.charDelay, sd.churnCount, (text) => {
                      el.textContent = text;
                      if (text === realText) finish();
                    });
                    observer.disconnect();
                  }
                });
              },
              { threshold: 0.1 }
            );
            observer.observe(el);
            allObservers.push(observer);
            return;
          }
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
            { threshold: 0.1 }
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
          { threshold: 0.1 }
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

    // Effect-level cancellation for scramble rotation timers
    let cancelled = false;

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
        const isRotator = el.hasAttribute('data-scramble-rotate-words');

        if (isRotator) {
          // First-load parity: scramble the WHOLE sentence (prefix + word +
          // punctuation) as one flat text, exactly like a simple-text line
          // (L1), so both hero lines scramble in fresh together. On resolve
          // the markup is re-split into <span data-prefix>/<span data-word>/
          // <span>.</span> and rotation takes over the final word only.
          const flat = (el.textContent || '').trim();
          if (!flat) return;
          el.setAttribute('aria-label', flat);

          let words: string[] = [];
          try {
            words = JSON.parse(el.getAttribute('data-scramble-rotate-words') || '[]') as string[];
          } catch { /* leave flat */ }

          const sd = scaledDelays(flat);
          const unlockHeight = lockHeight(el);
          el.textContent = scrambleString(flat);

          const resplit = () => {
            unlockHeight();
            if (words.length < 2) return;
            // Derive prefix from the flat text: everything before the final
            // word + punctuation. Words[0] is the current final word.
            const punctMatch = flat.match(/[.,!?;:]?\s*$/);
            const punctText = punctMatch && punctMatch[0] ? punctMatch[0].trim() || '.' : '.';
            const body = punctMatch ? flat.slice(0, flat.length - punctMatch[0].length) : flat;
            const w0 = words[0];
            const idx = body.toLowerCase().lastIndexOf(w0.toLowerCase());
            const prefixText = idx >= 0 ? body.slice(0, idx) : body;
            el.innerHTML = '';
            const p = document.createElement('span');
            p.setAttribute('data-prefix', '');
            p.textContent = prefixText; // carries the trailing space already
            const w = document.createElement('span');
            w.setAttribute('data-word', '');
            w.textContent = w0;
            const pu = document.createElement('span');
            pu.textContent = punctText;
            el.appendChild(p);
            el.appendChild(w);
            el.appendChild(pu);
          };

          const finish = (text: string) => {
            if (text !== flat) return;
            // Decode completed — re-split and hand off to rotation.
            el.textContent = flat;
            resplit();
          };

          if (isInViewport(el)) {
            decodeToString(flat, sd.charDelay, sd.churnCount, (text) => {
              el.textContent = text;
              finish(text);
            });
            return;
          }

          const observer = new IntersectionObserver(
            (entries) => {
              entries.forEach((entry) => {
                if (entry.isIntersecting) {
                  decodeToString(flat, sd.charDelay, sd.churnCount, (text) => {
                    el.textContent = text;
                    finish(text);
                  });
                  observer.disconnect();
                }
              });
            },
            { threshold: 0.1 }
          );
          observer.observe(el);
          allObservers.push(observer);

          pendingResolvers.push(() => {
            el.textContent = flat;
            resplit();
          });
          return;
        }

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
        { threshold: 0.1 }
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
        { threshold: 0.1 }
      );
      observer.observe(el);
      allObservers.push(observer);

      // Safety net: force-resolve if observer never fires
      pendingResolvers.push(() => {
        el.textContent = realText;
        unlockHeight();
      });
    });

    /* --- Last-Word Rotation ---
       Elements with data-scramble-rotate-words get post-decode variant
       cycling on their FINAL word only: the sentence prefix stays put and
       the last word scrambles → decodes to the next variant. Decode is
       time-derived (cancellation immune — a re-scan can never leave a glyph
       stuck mid-scramble). Under normal motion, the resolved tail blends a
       blue→white gradient across the word. data-scramble-rotate-words is a
       JSON array of LAST-WORD variants (no trailing punctuation; punctuation
       is a static <span> preserved by the markup).
       This REPLACES the legacy data-scramble-rotate full-sentence rotation,
       which could stack a stale timeout-driven decode over a route-change
       re-scan (the "scramble gets stuck" vector). */
    const rotatorEls = Array.from(
      document.querySelectorAll<HTMLElement>('[data-scramble-rotate-words]')
    );

    const rotatorTimers: ReturnType<typeof setTimeout>[] = [];
    const rotatorCancels: (() => void)[] = [];

    rotatorEls.forEach((el) => {
      const wordsJson = el.getAttribute('data-scramble-rotate-words');
      if (!wordsJson) return;

      let words: string[];
      try {
        words = JSON.parse(wordsJson) as string[];
      } catch {
        return; // invalid JSON — skip rotation
      }
      if (words.length < 2) return;

      const rotateDelayAttr = el.getAttribute('data-scramble-rotate-delay');
      const rotateDelay = rotateDelayAttr ? parseInt(rotateDelayAttr, 10) : 8000;

      // The first-load scramble branch FLATTENS this element to plain text
      // at effect-run and only re-splits it into prefix/word/punct spans
      // when the decode settles (or the safety net fires). So the spans are
      // NOT guaranteed to exist right now — wire the controller only once
      // they do. Without this deferral, rotator wiring silently no-ops the
      // moment a sibling pass has already flattened the spans.
      const tryWire = (): boolean => {
        const prefix = el.querySelector<HTMLElement>('[data-prefix]');
        const wordSpan = el.querySelector<HTMLElement>('[data-word]');
        if (!prefix || !wordSpan) return false;

        // Re-derive punctuation if the resplit pass did not preserve it as
        // a trailing span (hand-authored markup always has one; resplit too,
        // but normalize for the generic case).
        let punctSpan = (
          Array.from(el.querySelectorAll<HTMLElement>('span:not([data-prefix]):not([data-word])'))
        ).pop() ?? null;
        if (!punctSpan) {
          punctSpan = document.createElement('span');
          punctSpan.textContent = '.';
          el.appendChild(punctSpan);
        }

        // Width is pinned in CSS (min-width on [data-word] = the longest
        // variant), so the rotator never re-measures mid-scroll (jank at
        // 800px) and no scramble glyph set can ever widen the line past the
        // 2-line break.

        // Blue → INK per-char blend over the resolved tail (normal motion only;
        // reduced motion keeps the accent color via CSS). The blend endpoint was
        // hardcoded to rgb(245,245,247) — dark-mode ink — so in LIGHT mode the
        // settled trailing glyphs (the last 2–4 chars of every rotated word:
        // "...coun[t]", "...intentiona[l]", "...accountabl[e]") were painted
        // near-white on near-white paper and read as "cut off". Resolve the LIVE
        // --ink from the element's computed color ONCE per rotation so the blend
        // lands on the theme-correct ink (near-white in dark, near-black in
        // light) and survives theme switches mid-view.
        // Resolve ink LAZILY on every colorFn call — NOT once at setup. The
        // enhancer captures these closures when the element is first decoded,
        // and the page initializes in dark mode by default. If the user (or a
        // light-default preference) switches to light AFTER setup, a
        // setup-time-captured inkRGB stays frozen at the dark value and the
        // trailing glyphs keep blending toward rgb(245,245,247) — near-white —
        // which is invisible on light paper: exactly the "last letters cut off"
        // report. Reading getComputedStyle per char is a bounded cost (≤12
        // chars × ~25 tail frames per rotation) and always reflects the LIVE
        // theme, so dark→light flips re-tint mid-view.
        const resolveInkRGB = (): [number, number, number] => {
          const cs = getComputedStyle(el).color;
          const m = cs.match(/(\d+(?:\.\d+)?)[,\s)]+(\d+(?:\.\d+)?)[,\s)]+(\d+(?:\.\d+)?)/);
          if (m) return [Number(m[1]), Number(m[2]), Number(m[3])];
          return [245, 245, 247]; // dark-mode fallback only if unparseable
        };
        const colorFn = (i: number, n: number): string => {
          if (n <= 1) return 'var(--ink)';
          const inkRGB = resolveInkRGB(); // live — re-sample on every call
          const t = i / (n - 1);
          const r = Math.round(51 + (inkRGB[0] - 51) * t);
          const g = Math.round(88 + (inkRGB[1] - 88) * t);
          const b = Math.round(232 + (inkRGB[2] - 232) * t);
          return `rgb(${r}, ${g}, ${b})`;
        };

        const paintWord = (glyphs: { ch: string; done: boolean; color: string | null }[]) => {
          wordSpan.innerHTML = '';
          for (const g of glyphs) {
            const s = document.createElement('span');
            s.textContent = g.ch;
            if (!g.done) {
              s.className = 'is-scrambling';
            }
            // Settled chars: NO inline color. The CSS [data-word]
            // background-clip:text gradient + sweep animation paints them with
            // a continuously moving blue shimmer. Inline colors would override
            // the clip and freeze the gradient (the "still gradient" report).
            // The blue→ink blend is preserved in the gradient stops.
            wordSpan.appendChild(s);
          }
        };

        const setWord = (w: string) => {
          wordSpan.textContent = w;
          el.setAttribute(
            'aria-label',
            `${prefix.textContent ?? ''}${w}${punctSpan!.textContent ?? ''}`
          );
        };

        // Rotation must only start AFTER the element's own first-load decode
        // settles — and the safety net can force-resolve at 8s, so polling is
        // the only deterministic gate (an estimate timer can overlap the tail).
        const startWhenDecoded = (first: number) => {
          let attempts = 0;
          const poll = setInterval(() => {
            if (cancelled) { clearInterval(poll); return; }
            // Fail-safe: ~25s max, then give up rather than poll forever
            if (++attempts > 80) { clearInterval(poll); return; }
            const cur = (wordSpan.textContent || '').trim();
            if (cur === words[0]) {
              clearInterval(poll);
              rotatorTimers.push(setTimeout(() => rotateOnce(first), rotateDelay));
            }
          }, 300);
          rotatorCancels.push(() => clearInterval(poll));
        };

        const rotateOnce = (idx: number) => {
          if (cancelled) return;
          const next = words[idx];
          // Brief scramble of the CURRENT word, then time-derived decode to next.
          // Width is CSS-pinned; no mid-rotation measurement.
          wordSpan.textContent = scrambleString(wordSpan.textContent || next);
          rotatorTimers.push(
            setTimeout(() => {
              if (cancelled) return;
              const cancel = decodeWordTimeDerived(next, colorFn, paintWord);
              rotatorCancels.push(cancel);
              const nextIdx = (idx + 1) % words.length;
              rotatorTimers.push(
                setTimeout(
                  () => rotateOnce(nextIdx),
                  150 + 140 + next.length * 42 + 90 + rotateDelay
                )
              );
            }, 150)
          );
        };

        setWord(words[0]);
        startWhenDecoded(1);
        return true;
      };

      if (tryWire()) return;

      // Spans absent — the scramble branch has flattened this element.
      // Poll until its decode pass re-splits the markup (or give up after
      // ~25s; the static sentence is a graceful fallback).
      let attempts = 0;
      const wirePoll = setInterval(() => {
        if (cancelled) { clearInterval(wirePoll); return; }
        if (++attempts > 80 || tryWire()) clearInterval(wirePoll);
      }, 300);
      rotatorCancels.push(() => clearInterval(wirePoll));
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
      cancelled = true;
      allObservers.forEach((o) => o.disconnect());
      revealObserver.disconnect();
      window.removeEventListener('scroll', onScroll);
      clearTimeout(fallbackTimer);
      clearTimeout(safetyTimer);
      rotatorTimers.forEach((t) => clearTimeout(t));
      rotatorCancels.forEach((c) => c());
    };
  }, [pathname]); // Re-run on route change so new page elements get observers

  return null;
}