'use client';

/**
 * Director dock: the persistent way into the Studio (designesy.ai.studio, the
 * conversational Director). A labelled glass pill at the bottom-right, paired
 * with the Back pill at the bottom-left. The label is always visible: it used
 * to appear only on hover beside an unlabelled circle.
 */
export function DirectorDock() {
  return (
    <a
      className="director-dock"
      href="https://designesy.ai.studio/"
      target="_blank"
      rel="noopener noreferrer"
      data-cuelume-hover="bloom"
      data-cuelume-press="tick"
      aria-label="Ask the Studio (opens designesy.ai.studio in a new tab)"
    >
      <svg
        viewBox="0 0 16 16"
        width="15"
        height="15"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        {/* Geometric quote glyph — two rounded strokes, reads as "speak/ask"
            without being a literal chat bubble. Matches back-button restraint. */}
        <path d="M3 5.5v3a1 1 0 0 0 1 1h1.5a0.5 0.5 0 0 1 0.5 0.5v1a1 1 0 0 1-1 1H4a2 2 0 0 1-2-2V5.5a0.5 0.5 0 0 1 0.5-0.5H3" />
        <path d="M9 5.5v3a1 1 0 0 0 1 1h1.5a0.5 0.5 0 0 1 0.5 0.5v1a1 1 0 0 1-1 1H10a2 2 0 0 1-2-2V5.5a0.5 0.5 0 0 1 0.5-0.5H9" />
      </svg>
      <span className="director-dock-label">
        <span className="director-dock-label-lead">Ask the </span>Studio
      </span>
    </a>
  );
}