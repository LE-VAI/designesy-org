import fs from 'node:fs';
import path from 'node:path';
import type { CSSProperties } from 'react';
import type { Metadata } from 'next';
import './brand.css';
import { Topbar } from '../lib/topbar';
import { Footer } from '../lib/footer';
import { pageMeta } from '../lib/site-meta';
import { designSystemContract } from '../lib/design-system-contract';
import { Lockup, SmallLockup, Wordmark, MARK_BODY, MARK_DOT } from '../lib/brand-logotype';
import { BrandIcon, type BrandIconName } from '../lib/brand-icons';
import { SEED, LEADERBOARD_LAST_SCORED } from '../leaderboard/seed';

/*
  The public brand page (brand ledger D71): the Ctrl+I story, the logo, the
  colours with measured contrast, the grade palette, type, the icon family,
  a "Please don't" list and the brand kit.

  Every value on the page comes from somewhere the site already keeps:
  the brand colours from the design system contract (which the contract-drift
  gate holds to globals.css), the logo from the masters' path data in
  brand-logotype.tsx, the icons from brand-icons.tsx, the data line from the
  leaderboard's own record, and the kit's size and file count from the file
  itself. The contrast ratios are computed here, at build, from those values.
*/

const COLORS = designSystemContract.colors;

/** Azure, --signal: the same in both themes. */
const AZURE = COLORS.signal.value.toUpperCase();
/** The flame, --activation: the same in both themes. */
const FLAME = COLORS.activation.value.toUpperCase();
/** Deep Azure, --signal-deep: Azure for text, links and focus on light. */
const DEEP_AZURE = COLORS.signal_deep.value.toUpperCase();
/** Ink: the dark theme's --paper, and the label on every Azure fill. */
const INK = COLORS.paper.value.toUpperCase();
/** --paper-white: the constant white. */
const WHITE = COLORS.paper_white.value.toUpperCase();
/** Ember: the light theme's --activation-ink (globals.css, the light block). */
const EMBER = '#B04D00';

function channels(hex: string): [number, number, number] {
  const h = hex.replace('#', '');
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16)) as [number, number, number];
}

/** WCAG 2.x relative luminance of an sRGB hex colour. */
function luminance(hex: string): number {
  const [r, g, b] = channels(hex).map((c) => {
    const s = c / 255;
    return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** WCAG 2.x contrast ratio, to two decimals, as printed. */
function ratio(a: string, b: string): string {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return ((hi + 0.05) / (lo + 0.05)).toFixed(2);
}

// The flame is Azure inverted: 255 minus each channel. The page states it as
// arithmetic, so it computes it from the two tokens and refuses to build if
// they ever stop being exact inverses.
const AZURE_RGB = channels(AZURE);
const INVERTED = AZURE_RGB.map((c) => 255 - c);
if (INVERTED.join() !== channels(FLAME).join()) {
  throw new Error(`/brand: --activation ${FLAME} is not the inverse of --signal ${AZURE}`);
}
// Each triple stays on one line; a narrow screen breaks the line at the "=".
const ARITHMETIC = [`(${AZURE_RGB.join(', ')})`, `(${INVERTED.join(', ')})`] as const;

const SWATCHES = [
  {
    name: 'Azure',
    hex: AZURE,
    label: INK,
    role: "Authority. The mark's dot, primary actions, selection.",
    pair: `Ink on Azure ${ratio(INK, AZURE)}:1`,
  },
  {
    name: 'Flame',
    hex: FLAME,
    label: INK,
    role: 'Azure, inverted: 255 minus each channel. Only for things happening now.',
    pair: `Ink on Flame ${ratio(INK, FLAME)}:1`,
  },
  {
    name: 'Deep Azure',
    hex: DEEP_AZURE,
    label: WHITE,
    role: 'Azure for text, links and focus on light surfaces.',
    pair: `On white ${ratio(DEEP_AZURE, WHITE)}:1`,
  },
  {
    name: 'Ember',
    hex: EMBER,
    label: WHITE,
    role: 'The flame for text and rims on light surfaces.',
    pair: `On white ${ratio(EMBER, WHITE)}:1`,
  },
  {
    name: 'Ink',
    hex: INK,
    label: WHITE,
    role: 'The ground of the dark theme, and the label on Azure fills.',
    pair: `White on ink ${ratio(WHITE, INK)}:1`,
  },
];

// Each grade as text on each ground: the dark theme's grade (where the ink
// token is the base) on ink, and the light theme's --grade-x-ink on white
// (globals.css, the light block).
const GRADES = [
  { letter: 'A', dark: COLORS.grade_a.value, light: '#147839' },
  { letter: 'B', dark: COLORS.grade_b.value, light: '#497509' },
  { letter: 'C', dark: COLORS.grade_c.value, light: '#896203' },
  { letter: 'D', dark: COLORS.grade_d.value, light: '#BE1F67' },
  { letter: 'F', dark: COLORS.grade_f.value, light: '#CD2323' },
].map((g) => ({ ...g, dark: g.dark.toUpperCase(), light: g.light.toUpperCase() }));

// The data specimen is a real reading: a site's current grade, score and
// measurement date from the leaderboard record, so it can never go stale.
const SPECIMEN_SITE =
  SEED.find((s) => s.url === 'https://stripe.com' && s.score !== null) ??
  SEED.find((s) => s.score !== null);
if (!SPECIMEN_SITE) throw new Error('/brand: the leaderboard has no scored site for the data specimen');
// Three readings, each kept on one line: grade and score, host, date.
const DATA_PARTS = [
  `${SPECIMEN_SITE.grade} ${SPECIMEN_SITE.score} /100`,
  new URL(SPECIMEN_SITE.url).hostname.replace(/^www\./, ''),
  SPECIMEN_SITE.scoredAt ?? LEADERBOARD_LAST_SCORED,
];

// Every icon in the family, in the masters' order. Keyed by name so the type
// checker fails here if an icon is added to brand-icons.tsx and not shown.
const ICON_ORDER: Record<BrandIconName, number> = {
  score: 1, verify: 2, contract: 3, leaderboard: 4, monitor: 5, kit: 6, docs: 7,
  search: 8, settings: 9, live: 10, theme: 11, motion: 12, mention: 13,
  machine: 14, studio: 15, continuity: 16, error: 17, share: 18, chevron: 19,
};
const ICONS = (Object.keys(ICON_ORDER) as BrandIconName[]).sort((a, b) => ICON_ORDER[a] - ICON_ORDER[b]);

const DONTS = [
  { title: 'Recolour the dot', body: 'The dot is Azure, or the flame for something live. Never another colour.' },
  { title: 'Crop the dot', body: 'Any crop or frame includes the whole dot. It reaches past the body on the right.' },
  { title: 'Re-type the name', body: 'The logotype is drawn artwork. Never set “designesy.” in a font.' },
  { title: 'Use the flame for static things', body: 'Orange means happening now: a score running, a live monitor.' },
  { title: 'Stretch, rotate or outline', body: 'Scale the lockup proportionally. No effects, shadows or gradients.' },
  { title: 'Put it on noise', body: 'Place the mark on ink, white, or a calm surface with clear space.' },
];

// The kit, read at build: the page cannot link a file that is not there, and
// its size and file count are the file's own. A zip's end-of-central-directory
// record (signature 0x06054b50) holds the total number of entries at offset 10.
const KIT_PATH = '/brand/designesy-brand-kit.zip';
const KIT = (() => {
  const bytes = fs.readFileSync(path.join(process.cwd(), 'public', KIT_PATH));
  const eocd = bytes.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  if (eocd < 0) throw new Error(`/brand: ${KIT_PATH} is not a zip file`);
  return { kb: Math.round(bytes.length / 1024), files: bytes.readUInt16LE(eocd + 10) };
})();

export const metadata: Metadata = pageMeta({
  title: 'Brand',
  description: `Designesy's blue is ${AZURE}. Invert it, the way Ctrl+I inverts a screen, and you get ${FLAME}: the flame we use when something is happening now. The logo, colours, type, icons and brand kit.`,
  path: '/brand',
});

/**
 * The mark alone, its viewBox the art box (x 112 to 366, y 40 to 436: the dot
 * reaches x 366, past the body's 364), with overflow visible so no width
 * rounding can shave the dot. The body takes currentColor; the dot is Azure,
 * or the flame where the page shows the inversion.
 */
function Mark({ dot = 'azure', className }: { dot?: 'azure' | 'flame'; className: string }) {
  return (
    <svg className={className} viewBox="112 40 254 396" aria-hidden="true" focusable="false" overflow="visible">
      {MARK_BODY.map((d, i) => (
        <path key={i} d={d} fill="currentColor" />
      ))}
      <circle className={`brand-dot brand-dot--${dot}`} cx={MARK_DOT.cx} cy={MARK_DOT.cy} r={MARK_DOT.r} />
    </svg>
  );
}

export default function BrandPage() {
  return (
    <>
      <Topbar scrolled />
      <main
        id="main-content"
        data-pagefind-body
        className="surface-page brand-page"
        // The specimen grounds, from the contract: ink and white in both themes.
        style={{ '--brand-ink': INK, '--brand-white': WHITE } as CSSProperties}
      >
        <header className="surface-header brand-hero">
          <p className="brand-kicker">designesy.org/brand</p>
          <h1 className="surface-title brand-title">The flame is Azure, inverted.</h1>
          <p className="brand-lede">
            Designesy&apos;s blue is {AZURE}. Invert it, the way <kbd>ctrl</kbd>+<kbd>i</kbd> inverts a screen, and you
            get {FLAME}: the flame we use when something is happening now. One colour and its exact opposite.
            Everything else on this page follows from that.
          </p>
        </header>

        <figure className="brand-flip">
          <div
            className="brand-flip-pair"
            role="img"
            aria-label="The mark in Azure on black, beside its exact inverse: the flame on white"
          >
            <div className="brand-stage brand-stage--dark">
              <Mark className="brand-flip-mark" />
            </div>
            <div className="brand-stage brand-stage--light">
              <Mark dot="flame" className="brand-flip-mark" />
            </div>
          </div>
          {/* A <p> inside the caption so the markdown twin keeps the line. */}
          <figcaption>
            <p className="brand-eq">
              255 − <span className="brand-eq-term">{ARITHMETIC[0]}</span> ={' '}
              <span className="brand-eq-term">{ARITHMETIC[1]}</span>
            </p>
          </figcaption>
        </figure>

        <section className="brand-section" aria-labelledby="brand-logo">
          <h2 id="brand-logo">The logo</h2>
          <p>
            The lockup is the mark plus the wordmark. The mark&apos;s dot and the i&apos;s dot share one line. Use the
            lockup wherever there is room; use the mark alone where space is square or tight.
          </p>
          <ul className="brand-tiles" role="list">
            <li className="brand-tile">
              <div className="brand-stage brand-stage--dark" role="img" aria-label="The designesy lockup on ink">
                <Lockup className="brand-lockup" />
              </div>
              <h3>Lockup</h3>
              <p className="brand-fine">For headers, decks and documents. Below a 48px mark, use the small lockup.</p>
            </li>
            <li className="brand-tile">
              <div className="brand-stage brand-stage--light" role="img" aria-label="The designesy lockup on white">
                <Lockup className="brand-lockup" />
              </div>
              <h3>On light</h3>
              <p className="brand-fine">Ink body, Azure dot. Never place it on a busy image.</p>
            </li>
            <li className="brand-tile">
              <div className="brand-stage brand-stage--dark" role="img" aria-label="The designesy mark on ink">
                <Mark className="brand-mark" />
              </div>
              <h3>Mark</h3>
              <p className="brand-fine">Four modules and a head. The dot is the only colour.</p>
            </li>
            <li className="brand-tile">
              <div className="brand-stage brand-stage--light" role="img" aria-label="The designesy small lockup on white">
                <SmallLockup className="brand-lockup-small" />
              </div>
              <h3>Small lockup</h3>
              <p className="brand-fine">Drawn for small sizes, with wider gaps that stay open at 16–48px.</p>
            </li>
          </ul>
          <ul className="brand-tiles" role="list">
            <li className="brand-tile">
              <div
                className="brand-stage brand-stage--light"
                role="img"
                aria-label="The mark with clear space equal to the dot's diameter on every side"
              >
                <span className="brand-clear">
                  <Mark className="brand-mark" />
                </span>
              </div>
              <h3>Clear space</h3>
              <p className="brand-fine">Keep empty space equal to the dot&apos;s diameter on every side.</p>
            </li>
            <li className="brand-tile">
              <div className="brand-stage brand-stage--dark" role="img" aria-label="The designesy wordmark on ink">
                <Wordmark className="brand-wordmark" />
              </div>
              <h3>Wordmark</h3>
              <p className="brand-fine">The name alone, for places where the mark already appears.</p>
            </li>
          </ul>
        </section>

        <section className="brand-section" aria-labelledby="brand-colour">
          <h2 id="brand-colour">Colour</h2>
          <p>
            Two brand colours and their deeper partners for light surfaces. Every pairing below is measured with WCAG 2
            contrast. White text on Azure is never used: it measures {ratio(WHITE, AZURE)}:1.
          </p>
          <ul className="brand-swatches" role="list">
            {SWATCHES.map((s) => (
              <li className="brand-swatch" key={s.name}>
                <div className="brand-chip" style={{ background: s.hex, color: s.label }}>
                  <span className="brand-chip-name">{s.name}</span>
                  <span className="brand-chip-hex">{s.hex}</span>
                </div>
                <p className="brand-fine">{s.role}</p>
                <p className="brand-mono">{s.pair}</p>
              </li>
            ))}
          </ul>
          <h3 className="brand-subhead">Grades are a separate data palette</h3>
          <p className="brand-fine">
            Scores use their own five-colour scale in both themes (dark above, light below), and never borrow Azure or
            the flame.
          </p>
          <ul className="brand-grades" role="list">
            {GRADES.map((g) => (
              <li className="brand-grade" key={g.letter}>
                <span className="brand-grade-cell brand-stage--dark" style={{ color: g.dark }}>
                  {g.letter}
                  <span className="sr-only">, dark theme</span>
                </span>
                <span className="brand-grade-cell brand-stage--light" style={{ color: g.light }}>
                  {g.letter}
                  <span className="sr-only">, light theme</span>
                </span>
              </li>
            ))}
          </ul>
        </section>

        <section className="brand-section" aria-labelledby="brand-type">
          <h2 id="brand-type">Type</h2>
          {/* A list, not a <dl>: the build's markdown twin (generate-markdown.js)
              reads lists and would drop a <dl>, and with it the face names. */}
          <ul className="brand-type" role="list">
            <li className="brand-type-row">
              <span className="brand-mono">Display · Fraunces</span>
              <span className="brand-type-display">We make execution provable.</span>
            </li>
            <li className="brand-type-row">
              <span className="brand-mono">Text · Schibsted Grotesk</span>
              <span className="brand-type-text">Design judgment, published as a contract and verified on the live page.</span>
            </li>
            <li className="brand-type-row">
              <span className="brand-mono">Data · Atkinson Hyperlegible Mono</span>
              {/* The data face (D65) is the site's mono token, --mono, which
                  points at Atkinson Hyperlegible Mono: this line renders in the
                  face it names. */}
              <span className="brand-type-data">
                {DATA_PARTS.map((part, i) => (
                  <span key={part}>
                    {i > 0 ? ' · ' : null}
                    <span className="brand-nowrap">{part}</span>
                  </span>
                ))}
              </span>
            </li>
            <li className="brand-type-row">
              <span className="brand-mono">Logotype</span>
              <span>Drawn artwork, shipped as outlines. Use the files in the kit; never re-type it.</span>
            </li>
          </ul>
        </section>

        <section className="brand-section" aria-labelledby="brand-icons">
          <h2 id="brand-icons">Icons</h2>
          <p>
            A 24-unit grid, a 2px round stroke, and rounded modules. The dot is the only fill and the only colour: Azure
            for the active part, the flame only for something live.
          </p>
          <ul className="brand-icon-grid" role="list">
            {ICONS.map((name) => (
              <li className="brand-icon-tile" key={name}>
                <BrandIcon name={name} size={32} />
                <span className="brand-mono">{name}</span>
              </li>
            ))}
          </ul>
        </section>

        <section className="brand-section" aria-labelledby="brand-donts">
          <h2 id="brand-donts">Please don&apos;t</h2>
          <ul className="brand-donts" role="list">
            {DONTS.map((d) => (
              <li className="brand-dont" key={d.title}>
                <h3>{d.title}</h3>
                <p className="brand-fine">{d.body}</p>
              </li>
            ))}
          </ul>
        </section>

        <section className="brand-section" aria-labelledby="brand-download">
          <h2 id="brand-download">Download</h2>
          <div className="brand-kit">
            <a className="button primary" href={KIT_PATH} download>
              Download the brand kit
            </a>
            <div className="brand-kit-meta">
              <p className="brand-fine">SVG and PNG: lockups, small lockups, mark, wordmark, app icon, in dark and light.</p>
              <p className="brand-mono">
                ZIP · {KIT.kb} KB · {KIT.files} files
              </p>
            </div>
          </div>
          <p className="brand-fine">
            Use these files to refer to Designesy, for example in an article, a talk, or an integration. Don&apos;t use
            them to suggest that Designesy endorses or sponsors you. For any other use,{' '}
            <a href="mailto:hello@designesy.org">write to us</a> first.
          </p>
        </section>
      </main>
      <Footer />
    </>
  );
}
