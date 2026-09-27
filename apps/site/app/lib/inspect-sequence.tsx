'use client';

import { useEffect, useRef, type CSSProperties } from 'react';

/**
 * InspectSequence — "Every check, run against the page", told by scroll.
 *
 * Replaces the MP4 score loop. The video was a dark rectangle in light mode,
 * could not follow the theme, and played on a timer no reader controlled. This
 * is native markup: a generic page drawn in HTML and CSS, and four inspection
 * layers over it, one per step of the text beside it. The reader's scroll
 * position chooses the step; nothing advances on its own.
 *
 * STATE
 * The section carries data-step (1..4). An IntersectionObserver watches the
 * four step blocks and sets the step whose block crosses the middle of the
 * viewport. CSS does the rest: each layer is visible at the steps it belongs
 * to, with staggered transitions. Where the browser supports scroll-driven
 * animations, the stage's progress rail is also scrubbed continuously by the
 * section's view timeline (home-lvl.css); elsewhere it steps with data-step.
 *
 * AT REST
 * Server markup ships at step 1, and every step's text is always visible, so
 * a crawler, print, or a reader who never scrolls still gets the whole story.
 * Reduced motion keeps the step changes (they are state, not decoration) and
 * drops the transitions and the scan sweep.
 *
 * WHAT IS TRUE HERE
 * The page is a demo, and the section says so. The findings are the engine's
 * real checks with their real thresholds: v03 (a :focus-visible rule must
 * exist) and v06 (body text at least 4.5 to 1). The tally (40 pass, 1 warn,
 * 1 fail, grade A because neither finding carries a score ceiling) is the one
 * the retired loop showed, kept word for word.
 */

const STEPS = [
  {
    title: 'It reads the page you ship',
    text: 'The engine loads the live URL the way a visitor does and walks what actually rendered: markup, tokens, type, spacing, and motion.',
  },
  {
    title: 'It measures instead of guessing',
    text: 'Contrast is computed, never eyeballed. Line length, type scale, and target size are read off the page, each against a threshold the contract publishes.',
  },
  {
    title: 'Each finding pins to its element',
    text: 'A check that fails names itself and marks what it caught. Here v03 finds no focus-visible ring on the button, and v06 measures the muted text at 3.8 to 1.',
  },
  {
    title: 'One grade, with the evidence attached',
    text: 'Findings roll up into one score. Neither finding here carries a score ceiling, so the page grades A, and every result links back to the rule that produced it.',
  },
] as const;

export function InspectSequence() {
  const rootRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const root = rootRef.current;
    if (!root || typeof IntersectionObserver === 'undefined') return;
    const steps = Array.from(root.querySelectorAll<HTMLElement>('[data-inspect-step]'));
    // A one-pixel band across the viewport: the step whose block crosses it is
    // the step on stage. On narrow screens the stage is pinned over the top
    // half, so the band sits lower, where the step text is actually visible.
    const narrow = window.matchMedia('(max-width: 959px)').matches;
    const band = narrow ? '-68% 0px -32% 0px' : '-50% 0px -50% 0px';
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) root.dataset.step = e.target.getAttribute('data-inspect-step') ?? '1';
        }
      },
      { rootMargin: band, threshold: 0 }
    );
    steps.forEach((s) => io.observe(s));
    return () => io.disconnect();
  }, []);

  return (
    <div className="inspect" ref={rootRef} data-step="1">
      <ol className="inspect-steps">
        {STEPS.map((s, i) => (
          <li className="inspect-step" key={s.title} data-inspect-step={i + 1}>
            <span className="inspect-step-n" aria-hidden="true">
              {String(i + 1).padStart(2, '0')}
            </span>
            <h3 className="inspect-step-title">{s.title}</h3>
            <p className="inspect-step-text">{s.text}</p>
          </li>
        ))}
      </ol>

      <div className="inspect-stage">
        <figure
          className="inspect-window"
          role="img"
          aria-label="Demo on a generic page, inspected in four steps. v03 fails because no focus-visible ring is declared. v06 warns because muted text measures 3.8 to 1, under the 4.5 to 1 body minimum. Neither finding caps the score: 40 pass, 1 warn, 1 fail, grade A."
        >
          <div className="inspect-chrome" aria-hidden="true">
            <span className="inspect-dots">
              <i />
              <i />
              <i />
            </span>
            <span className="inspect-url">yoursite.com</span>
            <span className="inspect-status">
              <span className="inspect-status-run">Verifying</span>
              <span className="inspect-status-done">Verified</span>
            </span>
            <span className="inspect-rail">
              <i />
            </span>
          </div>

          <div className="inspect-canvas" aria-hidden="true">
            <div className="mp">
              <div className="mp-nav ix" style={{ '--i': 0 } as CSSProperties}>
                <span className="mp-logo">
                  <i />
                  yoursite
                </span>
                <span className="mp-links">
                  <span>Product</span>
                  <span>Pricing</span>
                  <span>Docs</span>
                </span>
                <span className="mp-signin">Sign in</span>
                <span className="ix-box" />
                <span className="ix-tag ix-read">nav · 4 links</span>
              </div>

              <div className="mp-hero">
                <span className="mp-eyebrow">Release 4.2</span>

                <div className="mp-h1 ix" style={{ '--i': 1 } as CSSProperties}>
                  Ship interfaces people trust.
                  <span className="ix-box" />
                  <span className="ix-tag ix-read">h1 · 32 / 36</span>
                  <span className="ix-chip ix-measure">
                    <b>15.8 : 1</b> contrast
                  </span>
                </div>

                <p className="mp-p ix" style={{ '--i': 2 } as CSSProperties}>
                  Tokens, components, and checks in one place, so the page you ship is the page you
                  designed.
                  <span className="ix-box" />
                  <span className="ix-tag ix-read">p · 17 / 27</span>
                  <span className="ix-ruler ix-measure">
                    <span>62 ch</span>
                  </span>
                  <span className="ix-find is-warn" />
                  <span className="ix-flag is-warn">
                    <b>v06</b> muted text 3.8 : 1 <em>warn</em>
                  </span>
                </p>

                <div className="mp-actions">
                  <span className="mp-btn ix" style={{ '--i': 3 } as CSSProperties}>
                    Start free
                    <span className="ix-box" />
                    <span className="ix-tag ix-read">button · 128 × 44</span>
                    <span className="ix-target ix-measure">
                      <span>44 px</span>
                    </span>
                    <span className="ix-find is-fail" />
                    <span className="ix-flag is-fail">
                      <b>v03</b> no :focus-visible ring <em>fail</em>
                    </span>
                  </span>
                </div>
              </div>

              <div className="mp-cards ix" style={{ '--i': 4 } as CSSProperties}>
                {[
                  ['Tokens', 'One source for color, type, and space'],
                  ['Components', 'Accessible by default, themable by design'],
                  ['Checks', 'Every pull request, verified'],
                ].map(([t, d]) => (
                  <span className="mp-card" key={t}>
                    <i className="mp-card-ico" />
                    <b>{t}</b>
                    <span>{d}</span>
                  </span>
                ))}
                <span className="ix-box" />
                <span className="ix-tag ix-read">3 × article</span>
              </div>

              <span className="ix-scan" />
            </div>

            <div className="ix-verdict">
              <span className="ix-verdict-grade">A</span>
              <span className="ix-verdict-body">
                <span className="ix-verdict-tally">
                  <b>40</b> pass · <b>1</b> warn · <b>1</b> fail
                </span>
                <span className="ix-verdict-note">Neither finding carries a score ceiling.</span>
              </span>
            </div>
          </div>
        </figure>
        <p className="inspect-caption">
          Demo on a generic page. The checks and their thresholds are the engine&rsquo;s own.
        </p>
      </div>
    </div>
  );
}
