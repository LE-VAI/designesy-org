"use client";

/**
 * ListenButton - spoken package abstract toggle for /open rows.
 *
 * One shared HTMLAudioElement per page enforces the one-voice policy:
 * starting a row stops the previous one. Audio is committed static Opus,
 * synthesized at build time by scripts/build_open_audio.py. Nothing loads
 * until first press.
 *
 * Doctrine notes:
 * - Playing rows take --activation (the site's "live" semantic), not glow.
 * - No motion: state change is color-only, safe under prefers-reduced-motion.
 * - Real <button>, aria-pressed, polite live announcements.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { OPEN_AUDIO } from './open-audio';

interface ListenButtonProps {
  pkgId: string;
  title: string;
}

let sharedAudio: HTMLAudioElement | null = null;
let activeStop: (() => void) | null = null;

function stopActiveVoice() {
  activeStop?.();
  activeStop = null;
}

function announce(message: string) {
  let live = document.getElementById('listen-live');
  if (!live) {
    live = document.createElement('p');
    live.id = 'listen-live';
    live.setAttribute('aria-live', 'polite');
    live.style.cssText =
      'position:absolute;width:1px;height:1px;margin:-1px;overflow:hidden;clip-path:inset(50%);white-space:nowrap;';
    document.body.appendChild(live);
  }
  live.textContent = message;
}

function PlayIcon() {
  return (
    <svg viewBox="0 0 16 16" aria-hidden="true" focusable="false">
      <path d="M4.5 2.5v11l9-5.5z" />
    </svg>
  );
}

function PauseIcon() {
  return (
    <svg viewBox="0 0 16 16" aria-hidden="true" focusable="false">
      <path d="M3.5 2.5h3.2v11H3.5zM9.3 2.5h3.2v11H9.3z" />
    </svg>
  );
}

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.round(seconds % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}

export function ListenButton({ pkgId, title }: ListenButtonProps) {
  const entry = OPEN_AUDIO[pkgId];
  const [isPlaying, setIsPlaying] = useState(false);
  const playingRef = useRef(false);
  const btnRef = useRef<HTMLButtonElement>(null);

  const stop = useCallback(() => {
    playingRef.current = false;
    setIsPlaying(false);
    btnRef.current
      ?.closest('.row--listen')
      ?.classList.remove('is-playing');
  }, []);

  const start = useCallback(() => {
    if (!sharedAudio) sharedAudio = new Audio();
    const audio = sharedAudio;
    audio.pause();
    audio.src = entry.src;
    audio.onended = () => {
      if (activeStop === stop) {
        activeStop = null;
        stop();
      }
    };
    activeStop = stop;
    playingRef.current = true;
    setIsPlaying(true);
    btnRef.current?.closest('.row--listen')?.classList.add('is-playing');
    void audio.play().catch(() => {
      if (activeStop === stop) activeStop = null;
      stop();
    });
  }, [entry, stop]);

  const toggle = useCallback(() => {
    if (playingRef.current) {
      if (activeStop === stop) activeStop = null;
      stop();
      announce(`Paused ${title}`);
      return;
    }
    stopActiveVoice(); // one voice policy: silence whoever else is speaking
    start();
    const seconds = Math.round(entry.duration);
    announce(`Playing ${title}, automated voice, about ${seconds} seconds`);
  }, [entry, start, stop, title]);

  // Silence this voice if the row unmounts (e.g. catalog update navigation).
  useEffect(() => {
    return () => {
      if (playingRef.current && activeStop === stop) {
        activeStop = null;
        stop();
      }
    };
  }, [stop]);

  // All hooks have run; a missing abstract renders nothing.
  if (!entry) return null;

  return (
    <span className="listen-cell">
      <button
        ref={btnRef}
        type="button"
        className="listen-btn"
        onClick={toggle}
        aria-pressed={isPlaying}
        aria-label={`${isPlaying ? 'Pause' : 'Play'} spoken summary of ${title}`}
        data-cuelume-press
      >
        {isPlaying ? <PauseIcon /> : <PlayIcon />}
      </button>
      <span className="listen-dur" aria-hidden="true">
        {formatDuration(entry.duration)}
      </span>
    </span>
  );
}
