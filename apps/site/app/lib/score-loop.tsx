'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * ScoreLoop — the product, working: a 6s seamless loop of the engine's checks
 * sweeping a generic page, with two real findings pinned to the elements they
 * flag (v03 FAIL, v06 WARN). Source composition, loop proof and encodes live
 * outside this repo; the files here are delivery copies.
 *
 * Motion contract (WCAG 2.2.2 Pause, Stop, Hide):
 *   - Plays only while at least a quarter of it is on screen.
 *   - Never autoplays under prefers-reduced-motion; the poster is the rest
 *     state, and the button starts it on request.
 *   - Holds while html[data-motion="paused"] (the site-wide motion toggle).
 *   - Its own button pauses and resumes it. Fixed label, aria-pressed = paused.
 *
 * Performance: preload="none" until the section scrolls into view, so the
 * loop never competes with the hero for first paint. The 2:1 box is reserved
 * in CSS (no layout shift). AV1 first, H.264 fallback.
 *
 * The ring shows 42 ticks baked into the video. If ENGINE_CHECK_COUNT
 * changes, re-render the loop so the picture matches the engine.
 */
export function ScoreLoop({ description }: { description: string }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const userPausedRef = useRef(false);
  const inViewRef = useRef(false);
  const [paused, setPaused] = useState(false);

  const sync = useCallback(() => {
    const v = videoRef.current;
    if (!v) return;
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const motionPaused = document.documentElement.dataset.motion === 'paused';
    const shouldPlay = inViewRef.current && !userPausedRef.current && !motionPaused;
    if (shouldPlay) {
      if (v.preload !== 'auto') v.preload = 'auto';
      v.play().catch(() => {
        /* autoplay refused (data saver, policy): the poster stays up */
      });
    } else {
      v.pause();
    }
    // Reduced motion: the rest state is paused until the visitor asks.
    if (reduced && !userPausedRef.current && !v.dataset.userStarted) {
      userPausedRef.current = true;
      setPaused(true);
      v.pause();
    }
  }, []);

  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduced) {
      userPausedRef.current = true;
      setPaused(true);
    }
    const io = new IntersectionObserver(
      ([entry]) => {
        inViewRef.current = entry.isIntersecting;
        sync();
      },
      { threshold: 0.25 }
    );
    io.observe(v);
    const mo = new MutationObserver(sync);
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ['data-motion'] });
    return () => {
      io.disconnect();
      mo.disconnect();
    };
  }, [sync]);

  const toggle = useCallback(() => {
    const v = videoRef.current;
    const next = !userPausedRef.current;
    userPausedRef.current = next;
    setPaused(next);
    if (v && !next) v.dataset.userStarted = '1';
    sync();
  }, [sync]);

  return (
    <figure className="score-loop">
      <div className="score-loop-frame">
        <video
          ref={videoRef}
          className="score-loop-video"
          poster="/media/score-loop-poster.jpg"
          muted
          loop
          playsInline
          preload="none"
          aria-describedby="score-loop-caption"
        >
          <source src="/media/score-loop-av1.mp4" type='video/mp4; codecs="av01.0.08M.08"' />
          <source src="/media/score-loop.mp4" type="video/mp4" />
        </video>
      </div>
      <figcaption className="score-loop-caption">
        <span id="score-loop-caption">{description}</span>
        <button
          type="button"
          className="score-loop-toggle"
          onClick={toggle}
          aria-pressed={paused}
          aria-label="Pause the score loop"
        >
          <span aria-hidden="true">{paused ? '▶' : '❚❚'}</span>
          {paused ? 'Play' : 'Pause'}
        </button>
      </figcaption>
    </figure>
  );
}
