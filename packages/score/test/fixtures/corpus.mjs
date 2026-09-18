/**
 * Calibration corpus — known-answer fixtures for the scoring engine.
 *
 * WHY THIS EXISTS
 * A score is only citable if the engine's behavior is falsifiable. The existing
 * tests assert SHAPE ("the score is a number between 0 and 100"); a suite of
 * only shape assertions passes even if every verdict is wrong. This corpus
 * asserts VERDICTS: each fixture pins inputs to an expected outcome for named
 * checks, so a regression that flips a verdict fails a test instead of shipping.
 *
 * WHAT MAKES A FIXTURE VALID
 *   1. It is a page the engine can score with no network (offline: true).
 *   2. It names the specific check IDs it is calibrating.
 *   3. Each named check has an EXPECTED status, written down before the run.
 *   4. It carries a `why` — what real-world page shape it stands in for. A
 *      fixture with no real-world referent is a test of the test.
 *
 * DELIBERATELY BROKEN FIXTURES ARE THE POINT
 * A corpus of only well-formed pages proves the engine can say PASS. The
 * `broken-*` fixtures exist so the engine has to say FAIL, and so a future
 * change that quietly stops detecting something is caught. A corpus that only
 * contains pages we score well is the own-exam problem with extra steps.
 *
 * WHAT THIS CORPUS IS NOT
 * It is not a claim that these fixtures represent the web. They are minimal
 * constructions that exercise specific code paths. Real-site calibration —
 * inter-rater agreement against human design review — is a separate and
 * larger exercise; nothing here substitutes for it.
 */

// Shape of one expected verdict:
//   { id: string, status: 'PASS'|'FAIL'|'WARN'|'SKIP'|'MANUAL', why: string }
// `why` is REQUIRED — a pin without a stated reason cannot be reviewed, and an
// unreviewable expectation is how a corpus rots into a change-detector.
//
// Shape of one fixture:
//   { name, referent, html, css, expect[], scoreBetween? }

// ── A complete, well-formed contract-conforming page ────────────────────────
// Establishes the floor: does the engine actually say PASS when everything is
// present? Without this fixture, every other "PASS" expectation is unfounded.

const GOOD_CSS = `:root{
  --paper:#fbfbfc; --ink:#111114; --muted:#55555f; --surface:#ffffff;
  --surface-raised:#f4f4f6; --line:#e4e4e8; --signal:#0133cb;
  --signal-light:#3358e8; --signal-dim:#e8ecfc;
  --duration-quick:120ms; --duration-fast:180ms; --duration-medium:280ms;
  --duration-slow:420ms;
  font-size:16px;
  font-synthesis:none;
  text-underline-position:from-font;
  -webkit-font-smoothing:antialiased;
}
@media (prefers-reduced-motion: reduce){
  *, *::before, *::after { animation-duration:0.01ms !important; transition-duration:0.01ms !important; }
}
@media (forced-colors: active){ .brand { forced-color-adjust:none; } }
button:focus-visible, a:focus-visible { outline:2px solid var(--signal); outline-offset:2px; }
button:active { transform:scale(0.96); }
button { transition:transform var(--duration-quick) ease-out, opacity var(--duration-quick) ease-out; }
::selection { background: var(--signal-dim); color: var(--ink); }
input, textarea { font-size:16px; }`;

const GOOD_HTML = `<!doctype html><html lang="en"><head>
<meta charset="utf-8">
<title>A well-formed calibration fixture</title>
<meta name="description" content="A complete page used to calibrate the scoring engine.">
<meta name="viewport" content="width=device-width, initial-scale=1">
</head><body>
<header><nav aria-label="Primary"><a href="/">Home</a></nav></header>
<main>
  <h1>Calibration fixture</h1>
  <h2>Section</h2>
  <p>Body copy for the fixture.</p>
  <button type="button" aria-pressed="true">Start listening</button>
  <label for="f">Email address</label>
  <input id="f" name="email" type="email">
  <a href="/methodology">Read the scoring methodology</a>
</main>
<footer><p>Fixture footer.</p></footer>
</body></html>`;

// Score bounds are deliberately a RANGE, not an exact number: several checks
// depend on heuristics, and pinning an exact score would make the corpus fail
// on any unrelated weight change — training us to update the number instead of
// reading the failure. Bounds catch a real scoring regression without becoming
// a change-detector.
//
// SCOPE IS ALWAYS EXPLICIT. This is not cosmetic. autoDetectScope returns
// 'contract' only for designesy.org and 'universal' for everything else, and
// applyScopeFilter converts FAIL/WARN to SKIP under universal for token-naming
// checks. A fixture that left scope implicit would therefore be graded as an
// external site and would pin a different verdict than the same markup scored
// as our own — the corpus caught exactly this on its first run (v01 read SKIP
// where the fixture expected FAIL). Every fixture states its scope so the
// expectation is unambiguous.

export const FIXTURES = [
  {
    name: 'good-baseline',
    referent:
      'A page that ships the full contract surface: tokens at :root, a reduced-motion block, focus-visible rings, press scale, semantic landmarks.',
    scope: 'contract',
    html: GOOD_HTML,
    css: GOOD_CSS,
    expect: [
      { id: 'v01', status: 'PASS', why: '--paper is declared in :root, which is exactly what v01 looks for.' },
      { id: 'v03', status: 'PASS', why: 'A :focus-visible rule is present, so the focus check has its primitive.' },
      { id: 'v05', status: 'PASS', why: 'A @media (prefers-reduced-motion: reduce) block is present.' },
      { id: 'v11', status: 'PASS', why: 'No transition:all anywhere — transitions name their properties.' },
      { id: 'v35', status: 'PASS', why: 'A forced-colors media query is present.' },
      { id: 'v25', status: 'PASS', why: 'Exactly one h1 and no skipped levels.' },
    ],
    scoreBetween: [70, 100],
  },

  // ── Deliberately broken: each targets one failure mode ────────────────────

  {
    name: 'broken-no-tokens',
    referent:
      'A page with no token layer at all — the shape of an early prototype or a hand-written static page.',
    scope: 'contract',
    html: GOOD_HTML,
    css: `body { font-family: sans-serif; } button:active { transform: scale(0.9); }`,
    expect: [
      { id: 'v01', status: 'FAIL', why: 'No :root block, so --paper cannot resolve. v01 requires the token foundation.' },
      { id: 'v03', status: 'FAIL', why: 'No :focus-visible rule present at all.' },
      { id: 'v05', status: 'WARN', why: 'No reduced-motion block. Verified behavior: absence is WARN, not FAIL — the reduced-motion check treats omission as a gap rather than a hard break.' },
    ],
    scoreBetween: [0, 65],
  },

  {
    name: 'broken-transition-all',
    referent:
      'The single most common CSS performance anti-pattern: transition:all on every interactive element.',
    html: GOOD_HTML,
    css: GOOD_CSS + `\nbutton { transition: all 200ms ease; }`,
    expect: [
      { id: 'v11', status: 'FAIL', why: 'transition:all is present in the stylesheet — the exact pattern v11 bans.' },
    ],
  },

  // ── Regression fixtures: bugs this corpus has already caught ──────────────

  {
    name: 'broken-reduced-motion-inverted',
    referent:
      'A stylesheet that opts INTO motion while appearing to support reduced motion — `prefers-reduced-motion: no-preference` instead of `reduce`.',
    scope: 'contract',
    html: GOOD_HTML,
    css: GOOD_CSS.replace(
      '@media (prefers-reduced-motion: reduce){',
      '@media (prefers-reduced-motion: no-preference){',
    ),
    expect: [
      {
        id: 'v05',
        status: 'WARN',
        why:
          'REGRESSION FIXTURE (caught 2026-09-17). v05 previously matched any @media mentioning prefers-reduced-motion, ' +
          'so `no-preference` — which expresses the opposite intent — passed as readily as `reduce`. That is a false PASS ' +
          'on the accessibility primitive the check exists to verify. Any change that makes this fixture PASS again has ' +
          'reintroduced substring matching on the feature name instead of evaluating its value.',
      },
    ],
  },

  {
    name: 'broken-reduced-motion-commented-out',
    referent:
      'A stylesheet where the reduced-motion rules exist but are commented out — the shape of a rule disabled during debugging and never restored.',
    scope: 'contract',
    html: GOOD_HTML,
    // Written as a whole block rather than by patching GOOD_CSS: the earlier
    // attempt used a .replace() whose search string did not match the actual
    // whitespace, so the comment was opened and never closed. That fixture
    // tested nothing (it produced unparseable CSS, and v05 passed because the
    // reduce block it looked for was still present uncommented elsewhere).
    // A regression fixture that does not reproduce the bug is worse than none.
    css: `:root{
  --paper:#fbfbfc; --ink:#111114; --muted:#55555f; --surface:#ffffff;
  --surface-raised:#f4f4f6; --line:#e4e4e8; --signal:#0133cb;
  --signal-light:#3358e8; --signal-dim:#e8ecfc;
  --duration-quick:120ms; --duration-fast:180ms; --duration-medium:280ms;
  font-size:16px;
}
/* Temporarily disabled while debugging the hero animation — restore before ship
@media (prefers-reduced-motion: reduce){
  *, *::before, *::after { animation-duration:0.01ms !important; transition-duration:0.01ms !important; }
}
*/
button:focus-visible { outline:2px solid var(--signal); }
@media (forced-colors: active){ .brand { forced-color-adjust:none; } }
input, textarea { font-size:16px; }`,
    expect: [
      {
        id: 'v05',
        status: 'WARN',
        why:
          'REGRESSION FIXTURE (caught 2026-09-17). Before comments were stripped, a commented-out media query satisfied v05 — ' +
          'the check read CSS text rather than the rules that actually apply. Here the ONLY reduce block is inside a comment, ' +
          'so the page genuinely ships no reduced-motion support and must not PASS. If this fixture starts passing, comment ' +
          'stripping has regressed.',
      },
    ],
  },

  {
    name: 'broken-multiple-h1',
    referent:
      'A page where a template emitted the site name as an h1 in the header and the page title as another h1 in main.',
    html: GOOD_HTML.replace(
      '<header><nav aria-label="Primary"><a href="/">Home</a></nav></header>',
      '<header><h1>Site name</h1><nav aria-label="Primary"><a href="/">Home</a></nav></header>',
    ),
    css: GOOD_CSS,
    expect: [
      { id: 'v25', status: 'WARN', why: 'Two h1 elements — v25 tolerates the document but flags the duplicated top level.' },
    ],
  },

  {
    name: 'broken-no-heading-outline',
    referent:
      'A client-rendered shell that ships markup with no heading at all — the shape the engine grades when JavaScript would have injected the h1.',
    html: `<!doctype html><html lang="en"><head><title>Shell</title></head>
<body><div id="root"></div></body></html>`,
    scope: 'universal',
    css: GOOD_CSS,
    expect: [
      { id: 'v25', status: 'WARN', why: 'No h1 in the delivered markup. Verified behavior: the heading check reports WARN on an absent outline, reserving FAIL for a malformed one. This is still the documented fetch-surface consequence — a JS-injected heading is invisible to a non-executing engine.' },
      { id: 'v07', status: 'FAIL', why: 'Title present, but no landmark and no h1 — the semantic foundation is missing enough parts to FAIL.' },
    ],
  },

  {
    name: 'broken-input-zoom',
    referent:
      'Inputs styled below the 16px iOS floor — the shape that causes Safari to auto-zoom on focus and break mobile layout.',
    html: GOOD_HTML,
    css: GOOD_CSS + `\ninput, textarea { font-size: 13px; }`,
    expect: [
      { id: 'v27', status: 'FAIL', why: 'An input font-size below the 16px floor is present — this is v27, the iOS auto-zoom trigger. (First written as v16, which is the rem/px scale check; the corpus caught the mix-up on its first run.)' },
    ],
  },

  {
    name: 'broken-will-change-everything',
    referent:
      'The blunt performance fix: will-change sprayed onto elements with non-transform properties.',
    html: GOOD_HTML,
    css: GOOD_CSS + `\n.card { will-change: width, background-color; }`,
    expect: [
      { id: 'v12', status: 'WARN', why: 'will-change carries properties outside transform/opacity.' },
    ],
  },

  {
    name: 'broken-trailing-period',
    referent:
      'Button and label text ending in periods — the copywriting inconsistency v39 targets from Microsoft Fluent guidance.',
    html: GOOD_HTML.replace('>Start listening<', '>Start listening.<').replace('>Email address<', '>Email address.<'),
    css: GOOD_CSS,
    expect: [
      { id: 'v39', status: 'WARN', why: 'Button and label text end with a period, which Fluent explicitly forbids.' },
    ],
  },

  {
    name: 'broken-bare-noun-buttons',
    referent:
      'Navigation-as-buttons: a marketing header whose buttons are bare nouns rather than verb phrases.',
    html: GOOD_HTML.replace(
      '<button type="button" aria-pressed="true">Start listening</button>',
      '<button type="button">Products</button><button type="button">Solutions</button><button type="button">Pricing</button>',
    ),
    css: GOOD_CSS,
    expect: [
      { id: 'v38', status: 'WARN', why: 'Three bare-noun button labels with no leading verb.' },
    ],
  },

  {
    name: 'edge-empty-page',
    referent:
      'A page that returns almost nothing — an error page or an empty deployment. The engine must degrade, not crash.',
    scope: 'contract',
    html: `<!doctype html><html><head></head><body></body></html>`,
    css: '',
    expect: [
      { id: 'v07', status: 'FAIL', why: 'No title, no meta description, no landmarks — the semantic foundation is entirely absent.' },
      { id: 'v01', status: 'FAIL', why: 'No CSS at all, so no token layer can exist.' },
    ],
    scoreBetween: [0, 65],
  },

  // ── v28 reading-width regression fixtures (added 2026-09-17) ──────────────
  //
  // These pin the defect that v28 could not previously detect: a measure
  // declared on a selector that never reaches prose. The old check grepped the
  // stylesheet for any in-range `NNch` and PASSed, so designesy.org scored 93/A
  // with zero v28 warnings while three of its own pages measured 108.6ch.

  {
    name: 'broken-measure-on-non-prose',
    referent:
      'A stylesheet that declares a perfectly good 66ch measure on a decorative container while every paragraph runs unconstrained — the exact shape that passed the old check.',
    scope: 'universal',
    html: GOOD_HTML,
    css: GOOD_CSS + `
.spacer { max-width: 66ch; }
.token-table { max-width: 72ch; }`,
    expect: [
      {
        id: 'v28', status: 'WARN',
        why:
          'REGRESSION FIXTURE. ch-based rules exist (66ch, 72ch) and both are in the 45-75ch band, so the old text-search implementation returned PASS. ' +
          'Neither selector targets prose — `.spacer` is decorative and `.token-table` is structural. Under the selector-aware check this must WARN: a measure ' +
          'on the wrong element is not a readability fix. If this fixture ever PASSes again, v28 has regressed to pattern-matching on the value.',
      },
    ],
  },

  {
    name: 'good-measure-on-prose',
    referent:
      'A stylesheet that puts the measure where it belongs — on paragraph selectors — which is the state designesy.org was moved to.',
    scope: 'universal',
    html: GOOD_HTML,
    css: GOOD_CSS + `
.definition > p, .prose > p, .lede { max-width: 66ch; }`,
    expect: [
      {
        id: 'v28', status: 'PASS',
        why:
          'The measure is declared on explicit prose selectors (a paragraph descendant combinator, a prose class, a lede class), all in range. ' +
          'This is the counterpart to the fixture above: the check must still PASS when the rule is genuinely applied to prose, or it would be useless as a gate.',
      },
    ],
  },

  {
    name: 'broken-measure-too-wide',
    referent:
      'A stylesheet with the measure on prose but set far too wide — 95ch, well past the readable band.',
    scope: 'universal',
    html: GOOD_HTML,
    css: GOOD_CSS + `
.prose > p { max-width: 95ch; }`,
    expect: [
      {
        id: 'v28', status: 'WARN',
        why: 'Prose is constrained, but at 95ch the line length exceeds the 75ch ceiling the check exists to enforce.',
      },
    ],
  },
];
