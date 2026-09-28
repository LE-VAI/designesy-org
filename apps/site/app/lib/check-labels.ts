// Short, voice-clean labels for the 42 contract checks (lib/check-definitions).
// Data only: imported by server components and passed to client ones as props.

/**
 * A short label for each contract check, in the site's own voice. The homepage
 * console's log and the /score instrument both draw from this one table.
 *
 * The registry's item text is the engine's specification ("::selection styled
 * with var(--signal) instead of the browser default"): exact, and written for the
 * methodology page. On the homepage it becomes visible prose, where the voice
 * rules apply (no em dashes, no negation pivots, token names kept out of
 * running text), so the log carries these labels instead. A check added to the
 * registry without a label falls back to its item text cut at the first dash,
 * colon, or parenthesis, and to its category name if that still reads as
 * specification.
 */
export const LOG_LABEL: Record<string, string> = {
  v01: 'Tokens match the :root foundation',
  v29: 'Tokens layered primitive to component',
  v42: 'Color tokens named by role',
  v43: 'Status colors for ok, warn, error, info',
  v02: 'Fits 375 to 1080px without overflow',
  v03: 'Focus-visible rings on controls',
  v04: 'Sound toggle applies the preference',
  v08: 'Poise interaction rules match',
  v09: 'Keyboard path published and current',
  v10: 'Takt interface-feel rules match',
  v05: 'Reduced motion stills entrances',
  v11: 'Transitions name their properties',
  v12: 'will-change kept to transform, opacity',
  v23: 'Duration tokens, quick to slow',
  v13: 'Press scale 0.96 cells, 0.985 cards',
  v14: 'Cadence type rules match',
  v15: 'Antialiased font smoothing',
  v16: 'Rem-based type scale, 16px root',
  v17: 'Line-height by role, 1.08 and 1.55',
  v18: 'text-wrap balance and pretty',
  v19: 'Tabular numbers where digits align',
  v20: '::selection styled with the accent',
  v26: 'Three font families at most',
  v28: 'Reading width 45 to 75ch',
  x01: 'font-synthesis set to none',
  x02: 'Underline position from the font',
  x03: 'Skip-ink on text decoration',
  v21: 'Core Web Vitals in range',
  v06: 'Text contrast readable, WCAG and APCA',
  v22: 'Primary button text at AA contrast',
  v24: 'Touch targets 44px or larger',
  v25: 'One h1, heading levels in order',
  v27: 'Inputs at 16px or larger',
  v35: 'Forced-colors styles present',
  v07: 'Semantic HTML foundation',
  v34: 'AI disclosure readiness',
  v36: 'Confusable characters screened',
  v38: 'Buttons lead with a verb',
  v39: 'Button labels end without a period',
  v40: 'Link text says where it goes',
  v41: 'Capitals kept for eyebrow labels',
  v37: 'DESIGN.md spec layer validates',
};

export function logLabel(c: { id: string; item: string; category: string }): string {
  if (LOG_LABEL[c.id]) return LOG_LABEL[c.id];
  const cut = c.item.split(/\s[\u2014\u2013-]\s|\s\(|:\s/)[0].trim();
  if (!cut || /--|\u2014|\bnot\b|\bsignals?\b/i.test(cut)) return `${c.category} check`;
  return cut;
}
