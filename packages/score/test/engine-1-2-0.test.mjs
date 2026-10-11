/**
 * Engine 1.2.0, pinned rule by rule: the two checks found by dogfooding
 * (v44 status colors used as text, v45 pausing motion keeps content visible)
 * and the two anti-slop rules that misfired on designesy.org (S2, S8).
 *
 * The calibration corpus pins each check on a realistic page; this file pins
 * the edges of each rule, and asserts the evidence where a status alone could
 * be right for the wrong reason.
 *
 * Zero dependencies: node:test + node:assert/strict.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { scoreFromParts } from '../dist/engine.js';

const HTML = `<!doctype html><html lang="en"><head><title>Fixture</title>
<meta name="description" content="Engine 1.2.0 fixture."></head><body><main><h1>Fixture</h1>
<p>Body copy.</p></main></body></html>`;

async function run({ html = HTML, css = '', scope = 'universal' } = {}) {
  return scoreFromParts({ html, css, scope, offline: true });
}

async function check(id, opts) {
  const c = (await run(opts)).checks.find((x) => x.id === id);
  assert.ok(c, `${id} absent from the result`);
  return c;
}

const LIGHT = ':root { --paper: #fbfbfc; --ink: #1a1a1e; --warn: #b07d04; } body { background: var(--paper); color: var(--ink); }';

describe('v44: status colors used as text meet contrast in every declared theme', () => {
  it('FAILs --warn #b07d04 as text on #fbfbfc at 3.51:1, and names the use', async () => {
    const c = await check('v44', { css: `${LIGHT} .status { color: var(--warn); }` });
    assert.equal(c.status, 'FAIL');
    assert.equal(c.category, 'accessibility');
    const [f] = c.evidence.findings;
    assert.deepEqual(
      { selector: f.selector, token: f.token, theme: f.theme, value: f.value, background: f.background, ratio: f.ratio, need: f.need },
      { selector: '.status', token: '--warn', theme: ':root', value: '#b07d04', background: '#fbfbfc', ratio: 3.51, need: 4.5 },
    );
    assert.equal(c.evidence.truncated, 0);
  });

  it('PASSes the ink mix, painted as #7f5e21 at 5.76:1', async () => {
    const css = `${LIGHT} :root { --warn-ink: color-mix(in oklab, var(--warn) 70%, var(--ink)); } .dot { background: var(--warn); } .status { color: var(--warn-ink); }`;
    const c = await check('v44', { css });
    assert.equal(c.status, 'PASS');
    const [f] = c.evidence.findings;
    assert.equal(f.value, '#7f5e21');
    assert.equal(f.ratio, 5.76);
  });

  it('measures the same inline mix written in the color declaration', async () => {
    const c = await check('v44', { css: `${LIGHT} .status { color: color-mix(in oklab, var(--warn) 70%, var(--ink)); }` });
    assert.equal(c.status, 'PASS');
    assert.equal(c.evidence.findings[0].ratio, 5.76);
  });

  it('measures every declared theme: a prefers-color-scheme dark block that fails FAILs the check', async () => {
    const css = `:root { --paper: #ffffff; --ink: #111111; --error: #b91c1c; }
      @media (prefers-color-scheme: dark) { :root { --paper: #0b0b0c; --ink: #f2f2f2; --error: #991b1b; } }
      body { background: var(--paper); } .err { color: var(--error); }`;
    const c = await check('v44', { css });
    assert.equal(c.status, 'FAIL');
    const byTheme = Object.fromEntries(c.evidence.findings.map((f) => [f.theme, f]));
    assert.equal(byTheme[':root'].status, 'PASS');
    assert.equal(byTheme['@media (prefers-color-scheme: dark)'].status, 'FAIL');
    assert.equal(byTheme['@media (prefers-color-scheme: dark)'].ratio, 2.37);
  });

  it('measures a [data-theme] block over the root, on that theme\'s own page background', async () => {
    const css = `:root { --paper: #010102; --ink: #f5f5f7; --warn: #facc15; color-scheme: dark; }
      [data-theme="light"] { --paper: #fbfbfc; --ink: #1a1a1e; --warn: #b07d04; color-scheme: light; }
      body { background: var(--paper); } .status { color: var(--warn); }`;
    const c = await check('v44', { css });
    assert.equal(c.status, 'FAIL');
    const light = c.evidence.findings.find((f) => f.theme === '[data-theme=light]');
    const dark = c.evidence.findings.find((f) => f.theme === ':root');
    assert.equal(light.ratio, 3.51);
    assert.equal(dark.status, 'PASS');
  });

  it('applies 3:1 to large text: 24px, or 18.66px at weight 700', async () => {
    for (const rule of ['font-size: 24px', 'font-size: 2rem', 'font-size: 19px; font-weight: 700', 'font: 700 1.25rem/1.2 serif']) {
      const c = await check('v44', { css: `${LIGHT} .status { ${rule}; color: var(--warn); }` });
      assert.equal(c.status, 'PASS', rule);
      assert.equal(c.evidence.findings[0].need, 3, rule);
    }
    const small = await check('v44', { css: `${LIGHT} .status { font-size: 19px; color: var(--warn); }` });
    assert.equal(small.status, 'FAIL', '19px at normal weight is not large text');
  });

  it('follows one alias, and names both tokens', async () => {
    const c = await check('v44', { css: `${LIGHT} :root { --badge-text: var(--warn); } .badge { color: var(--badge-text); }` });
    assert.equal(c.status, 'FAIL');
    assert.equal(c.evidence.findings[0].token, '--badge-text -> --warn');
  });

  it('WARNs alpha-reduced status text that clears only at full alpha', async () => {
    const css = ':root { --paper: #ffffff; --ink: #111; --error: #b91c1c; } body { background: var(--paper); } .err { color: color-mix(in srgb, var(--error) 60%, transparent); }';
    const c = await check('v44', { css });
    assert.equal(c.status, 'WARN');
    assert.match(c.detail, /only at full alpha/);
  });

  it('WARNs a use whose own background cannot be resolved', async () => {
    const c = await check('v44', { css: `${LIGHT} .banner { background: url(x.png) center / cover; color: var(--warn); }` });
    assert.equal(c.status, 'WARN');
    assert.equal(c.evidence.findings[0].background, 'unresolved');
  });

  it('measures on the rule\'s own tint, composited over the page', async () => {
    const css = `${LIGHT} .chip { background: color-mix(in srgb, var(--warn) 12%, transparent); color: var(--warn); }`;
    const c = await check('v44', { css });
    assert.equal(c.status, 'FAIL');
    assert.notEqual(c.evidence.findings[0].background, '#fbfbfc');
  });

  it('reads a themed rule for the same component instead of the unthemed one in that theme', async () => {
    const css = `:root { --paper: #010102; --ink: #f5f5f7; --warn: #facc15; color-scheme: dark; }
      [data-theme="light"] { --paper: #fbfbfc; --ink: #1a1a1e; --warn: #b07d04; }
      body { background: var(--paper); }
      .status { color: var(--warn); }
      [data-theme="light"] .status { color: color-mix(in oklab, var(--warn) 70%, var(--ink)); }`;
    const c = await check('v44', { css });
    assert.equal(c.status, 'PASS');
  });

  it('leaves an on-fill color (foreground, on-*) out: it is text for a fill the sheet does not pair with it', async () => {
    const css = ':root { --paper: #fff; --destructive: #dc2626; --destructive-foreground: #ffffff; } body { background: var(--paper); } .t { color: var(--destructive-foreground); }';
    const c = await check('v44', { css });
    assert.equal(c.status, 'SKIP');
  });

  it('WARNs, never FAILs, a hue that counts only because the sheet also paints it as a mark', async () => {
    // linear.app's approved chip on 2026-10-09: --color-green #27a644 on its own tint, 2.56:1.
    const css = ':root { --paper: #ffffff; --color-green: #27a644; } body { background: var(--paper); } .dot { background: var(--color-green); } .chip { background: #d4edda; color: var(--color-green); }';
    const c = await check('v44', { css });
    assert.equal(c.status, 'WARN');
    const [f] = c.evidence.findings;
    assert.equal(f.ratio, 2.56);
    assert.equal(f.status, 'WARN');
    assert.match(f.note, /only a warning/);
    assert.match(c.detail, /only a warning/);
  });

  it('still FAILs the same contrast on a status-named color', async () => {
    const css = ':root { --paper: #ffffff; --success: #27a644; } body { background: var(--paper); } .chip { background: #d4edda; color: var(--success); }';
    assert.equal((await check('v44', { css })).status, 'FAIL');
  });

  it('exempts disabled states (WCAG 1.4.3), but not a rule that excludes them', async () => {
    for (const sel of ['.btn:disabled', '.btn[disabled]', '.btn[aria-disabled=true]', '.btn.disabled', '.a:disabled, .b[aria-disabled="true"]']) {
      const c = await check('v44', { css: `${LIGHT} ${sel} { color: var(--warn); }` });
      assert.equal(c.status, 'SKIP', sel);
    }
    for (const sel of ['.btn:not(:disabled)', '.btn:hover:not(:disabled, .inactive)', '.a, .b:disabled']) {
      const c = await check('v44', { css: `${LIGHT} ${sel} { color: var(--warn); }` });
      assert.equal(c.status, 'FAIL', sel);
    }
  });

  it('SKIPs a page with no status color used as text', async () => {
    const c = await check('v44', { css: `${LIGHT} .dot { background: var(--warn); } p { color: var(--ink); }` });
    assert.equal(c.status, 'SKIP');
    assert.match(c.detail, /^not applicable/);
  });

  it('measures a descendant of a hovered compound on that compound\'s fill', async () => {
    // github.com and primer.style: white on the danger fill, read as white on the page.
    const css = ':root { --paper: #ffffff; --bg-danger: #cf222e; --danger-fg-hover: #ffffff; } body { background: var(--paper); } .btn-danger:hover { background: var(--bg-danger); } .btn-danger:hover .label { color: var(--danger-fg-hover); }';
    const c = await check('v44', { css });
    assert.equal(c.status, 'PASS');
    assert.equal(c.evidence.findings[0].background, '#cf222e');
  });

  it('reads the ancestor\'s base rule when its state paints no fill of its own', async () => {
    const css = ':root { --paper: #ffffff; --danger-hover: #ff8182; } body { background: var(--paper); } .menu { background: #1f2328; } .menu:hover .label { color: var(--danger-hover); }';
    const c = await check('v44', { css });
    assert.equal(c.status, 'PASS');
    assert.equal(c.evidence.findings[0].background, '#1f2328');
  });

  it('composites a translucent fill over the ancestor fill it sits on', async () => {
    // primer.style's danger counter: white on #fff3 over #cf222e is white on #d94e58, 4.05:1
    // (a WARN: white is neutral text, see the next test).
    const css = ':root { --paper: #ffffff; --counter-danger-fg: #ffffff; } body { background: var(--paper); } .btn:hover { background: #cf222e; } .btn:hover .counter { background: #ffffff33; color: var(--counter-danger-fg); }';
    const c = await check('v44', { css });
    const [f] = c.evidence.findings;
    assert.deepEqual({ background: f.background, ratio: f.ratio }, { background: '#d94e58', ratio: 4.05 });
  });

  it('WARNs, never FAILs, neutral text under a status name, and keeps its ratio', async () => {
    // White or grey (Oklch chroma under 0.06) named for a status is a general text-contrast
    // miss, not a status color: primer.style's danger counter and keyboard hint.
    const neutral = [
      [':root { --paper: #ffffff; --counter-danger-fg: #ffffff; } body { background: var(--paper); } .btn:hover { background: #cf222e; } .btn:hover .counter { background: #ffffff33; color: var(--counter-danger-fg); }', 4.05],
      [':root { --paper: #2a313c; --kbd-danger-fg: #9198a1; color-scheme: dark; } body { background: var(--paper); } .kbd { color: var(--kbd-danger-fg); }', 4.49],
    ];
    for (const [css, ratio] of neutral) {
      const c = await check('v44', { css });
      assert.equal(c.status, 'WARN', css);
      const [f] = c.evidence.findings;
      assert.deepEqual({ status: f.status, ratio: f.ratio }, { status: 'WARN', ratio }, css);
      assert.equal(f.note, 'neutral text on a status fill: a general text-contrast miss, not a status color');
      assert.match(c.detail, /neutral text on a status fill/);
    }
    // A hue under a status name at a similar ratio still FAILs.
    const hue = await check('v44', { css: ':root { --paper: #ffffff; --error: #df342f; } body { background: var(--paper); } .err { color: var(--error); }' });
    assert.equal(hue.status, 'FAIL');
  });

  it('never reads a hovered fill as the resting element\'s surface', async () => {
    const css = ':root { --paper: #ffffff; --fg-danger: #cf222e; } body { background: var(--paper); } .btn:hover { background: #cf222e; } .btn .label { color: var(--fg-danger); }';
    const c = await check('v44', { css });
    assert.equal(c.status, 'PASS');
    assert.equal(c.evidence.findings[0].background, '#ffffff');
  });

  it('WARNs, never FAILs, a pairing whose surface it cannot attest', async () => {
    // The hovered ancestor paints no fill this sheet declares: white on the page is not a pairing it can attest.
    const css = ':root { --paper: #ffffff; --danger-fg-hover: #ffffff; } body { background: var(--paper); } .btn-danger:hover .label { color: var(--danger-fg-hover); }';
    const c = await check('v44', { css });
    assert.equal(c.status, 'WARN');
    const [f] = c.evidence.findings;
    assert.equal(f.status, 'WARN');
    assert.match(f.note, /surface is unresolved/);
  });

  it('reads a compound theme\'s tokens for the theme it contains', async () => {
    // primer.style declares --fgColor-danger for dark only under [data-color-mode=dark][data-dark-theme=dark].
    // Of the compounds that contain the theme, the one that repeats its value is read first, whatever the source order.
    const css = `:root { --bgColor-default: #ffffff; --fgColor-danger: #d1242f; }
      [data-color-mode=dark] { --bgColor-default: #0d1117; }
      [data-color-mode=dark][data-dark-theme=dark_dimmed] { --bgColor-default: #212830; --fgColor-danger: #ff7b72; }
      [data-color-mode=dark][data-dark-theme=dark] { --fgColor-danger: #f85149; }
      body { background: var(--bgColor-default); }
      .msg { color: var(--fgColor-danger); }`;
    const c = await check('v44', { css });
    assert.equal(c.status, 'PASS');
    const dark = c.evidence.findings.find((f) => f.theme === '[data-color-mode=dark]');
    assert.ok(dark, 'the [data-color-mode=dark] theme is measured');
    assert.deepEqual({ value: dark.value, background: dark.background }, { value: '#f85149', background: '#0d1117' });
  });

  it('holds a non-text use to 3:1 and status text to 4.5:1 (WCAG 1.4.11, 1.4.3)', async () => {
    // carbondesignsystem.com's progress bar: --cds-support-success #24a148 on #f4f4f4, 3.05:1.
    const base = ':root { --paper: #f4f4f4; --cds-support-success: #24a148; } body { background: var(--paper); } .cds--progress-bar__bar { background-color: currentColor; }';
    for (const sel of ['.done .cds--progress-bar__bar', '.done .cds--progress-bar__status-icon', '.done svg', '.done .octicon-check', '.done .icon-for-success']) {
      const c = await check('v44', { css: `${base} ${sel} { color: var(--cds-support-success); }` });
      assert.equal(c.status, 'PASS', sel);
      assert.equal(c.evidence.findings[0].need, 3, sel);
    }
    for (const sel of ['.done .status-text', '.done .x-icon, .done .x-label']) {
      const c = await check('v44', { css: `${base} ${sel} { color: var(--cds-support-success); }` });
      assert.equal(c.status, 'FAIL', sel);
      assert.equal(c.evidence.findings[0].need, 4.5, sel);
    }
  });

  it('holds a color named for an icon to 3:1, and a currentColor fill to 3:1 against the surface behind it', async () => {
    const named = ':root { --paper: #f4f4f4; --button-success-iconColor: #24a148; } body { background: var(--paper); } .btn .visual { color: var(--button-success-iconColor); }';
    const c1 = await check('v44', { css: named });
    assert.equal(c1.status, 'PASS');
    assert.equal(c1.evidence.findings[0].need, 3);
    const dot = ':root { --paper: #f4f4f4; --success: #24a148; } body { background: var(--paper); } .dot { background-color: currentColor; color: var(--success); }';
    const c2 = await check('v44', { css: dot });
    assert.equal(c2.status, 'PASS');
    assert.deepEqual({ need: c2.evidence.findings[0].need, background: c2.evidence.findings[0].background }, { need: 3, background: '#f4f4f4' });
  });

  it('shows a ratio that misses by less than a rounding step below the bar', async () => {
    // #df342f on white is 4.497:1; it reads 4.49, never 4.50 against 4.5.
    const css = ':root { --paper: #ffffff; --error: #df342f; } body { background: var(--paper); } .err { color: var(--error); }';
    const c = await check('v44', { css });
    assert.equal(c.status, 'FAIL');
    assert.equal(c.evidence.findings[0].ratio, 4.49);
  });

  it('caps evidence at 20 findings and counts the rest', async () => {
    const rules = Array.from({ length: 25 }, (_, i) => `.s${i} { color: var(--warn); }`).join('\n');
    const c = await check('v44', { css: `${LIGHT}\n${rules}` });
    assert.equal(c.evidence.findings.length, 20);
    assert.equal(c.evidence.truncated, 5);
  });
});

const ENTRANCE = '@keyframes fadeUp { from { opacity: 0; transform: translateY(12px); } to { opacity: 1; transform: none; } } .fade-up { animation: fadeUp 600ms ease-out backwards; }';
const PAUSE = '[data-motion=paused] *, [data-motion=paused] *::before, [data-motion=paused] *::after { animation-play-state: paused !important; }';

describe('v45: pausing motion keeps content visible', () => {
  it('FAILs an opacity-0 entrance held by a site-wide pause, and names it', async () => {
    const c = await check('v45', { css: `${ENTRANCE} ${PAUSE}` });
    assert.equal(c.status, 'FAIL');
    assert.equal(c.category, 'motion');
    const [f] = c.evidence.findings;
    assert.deepEqual(
      { keyframes: f.keyframes, selector: f.selector, pauseRule: f.pauseRule, override: f.override },
      { keyframes: 'fadeUp', selector: '.fade-up', pauseRule: '[data-motion=paused] *', override: null },
    );
  });

  it('PASSes the negative-delay override designesy.org shipped', async () => {
    const c = await check('v45', { css: `${ENTRANCE} ${PAUSE} [data-motion=paused] .fade-up { animation-delay: -3600s !important; }` });
    assert.equal(c.status, 'PASS');
  });

  it('PASSes an override that lists the entrance inside :is(), as the site writes it', async () => {
    const css = `${ENTRANCE} html[data-motion="paused"] *, html[data-motion="paused"] *::before { animation-play-state: paused !important; }
      html[data-motion="paused"] :is(.fade-up, .score-card-item) { animation-delay: -3600s !important; }`;
    assert.equal((await check('v45', { css })).status, 'PASS');
  });

  it('PASSes animation: none and animation-play-state: running as overrides', async () => {
    for (const decl of ['animation: none', 'animation-name: none', 'animation-play-state: running']) {
      const c = await check('v45', { css: `${ENTRANCE} ${PAUSE} [data-motion=paused] .fade-up { ${decl} !important; }` });
      assert.equal(c.status, 'PASS', decl);
    }
  });

  it('FAILs a negative delay too short to pass the end', async () => {
    const c = await check('v45', { css: `${ENTRANCE} ${PAUSE} [data-motion=paused] .fade-up { animation-delay: -200ms !important; }` });
    assert.equal(c.status, 'FAIL');
  });

  it('treats a pause inside prefers-reduced-motion: reduce as a pause scope', async () => {
    const css = `${ENTRANCE} @media (prefers-reduced-motion: reduce) { *, *::before, *::after { animation-play-state: paused !important; } }`;
    assert.equal((await check('v45', { css })).status, 'FAIL');
    const fixed = `${css} @media (prefers-reduced-motion: reduce) { .fade-up { animation: none !important; } }`;
    assert.equal((await check('v45', { css: fixed })).status, 'PASS');
  });

  it('WARNs an override that sits under a different scope than the pause', async () => {
    const css = `${ENTRANCE} ${PAUSE} @media (prefers-reduced-motion: reduce) { .fade-up { animation: none !important; } }`;
    const c = await check('v45', { css });
    assert.equal(c.status, 'WARN');
    assert.ok(c.evidence.findings[0].override);
  });

  it('does not count a loop, or an animation that also ends invisible', async () => {
    const loop = '@keyframes pulse { from { opacity: 0; } to { opacity: 1; } } .dot { animation: pulse 1s infinite alternate; }';
    const flash = '@keyframes glow { 0% { opacity: 0; } 50% { opacity: 1; } 100% { opacity: 0; } } .glow { animation: glow 2s both; }';
    for (const css of [loop, flash]) {
      const c = await check('v45', { css: `${css} ${PAUSE}` });
      assert.equal(c.status, 'PASS', css);
      assert.equal(c.evidence.findings.length, 0, css);
    }
  });

  it('does not count an entrance the pause cannot reach (no !important, lower specificity)', async () => {
    const css = `${ENTRANCE} @media (prefers-reduced-motion: reduce) { * { animation-play-state: paused; } }`;
    assert.equal((await check('v45', { css })).status, 'PASS');
  });

  it('SKIPs a page with no pause scope', async () => {
    const c = await check('v45', { css: ENTRANCE });
    assert.equal(c.status, 'SKIP');
    assert.match(c.detail, /^not applicable/);
  });

  it('SKIPs a component-level pause (a marquee class that ends in "paused")', async () => {
    const c = await check('v45', { css: `${ENTRANCE} .LogoSuite__logobar--paused * { animation-play-state: paused; }` });
    assert.equal(c.status, 'SKIP');
  });
});

describe('S2: a full-page gradient needs viewport evidence', () => {
  const G = 'linear-gradient(135deg, #0ea5e9, #f97316)';
  const s2 = async (css) => (await run({ css })).slop.findings.find((f) => f.id === 'S2');

  it('fires on a gradient on body, a fixed overlay pinned to the edges, and a 100vh section', async () => {
    for (const css of [
      `body { background: ${G}; }`,
      `.wash { position: fixed; inset: 0; background: ${G}; }`,
      `.hero { min-height: 100vh; background-image: ${G}; }`,
    ]) {
      assert.ok(await s2(css), css);
    }
  });

  it('does not fire on a component overlay: inset: 0 inside a positioned, rounded parent', async () => {
    assert.equal(await s2(`.x:before { content: ""; position: absolute; inset: 0; border-radius: inherit; background: ${G}; }`), undefined);
    assert.equal(await s2(`.glow { position: absolute; inset: 0; background: ${G}; }`), undefined);
  });

  it('does not fire on a hairline sized by background-size, or a fixed drawer', async () => {
    assert.equal(await s2('.frame:before { position: fixed; inset: 0; background: linear-gradient(90deg, transparent 12%, #fff, transparent 88%) top / 100% 1px no-repeat; }'), undefined);
    assert.equal(await s2(`.drawer { position: fixed; top: .5rem; right: .5rem; bottom: .5rem; width: 280px; background: ${G}; }`), undefined);
  });

  it('no longer fires on the three designesy.org components it deducted for', async () => {
    const css = [
      '.vc-window:before { inset: 0; padding: 1px; border-radius: inherit; background: linear-gradient(90deg, transparent 12%, var(--lv-sheen), transparent 88%) top / 100% 1px no-repeat, var(--rim); }',
      '.vc-cell:before { content: ""; position: absolute; inset: 0; border-radius: inherit; background: linear-gradient(180deg, var(--lv-pass-a), var(--lv-pass-b)); }',
      '.hm-fill { inset: 0; background: linear-gradient(90deg, transparent calc(var(--hm-full) * var(--hm-step)), color-mix(in srgb, var(--signal) 40%, transparent) 0); }',
    ].join('\n');
    assert.equal(await s2(css), undefined);
  });
});

describe('S8: AI-pill text counts only in a pill', () => {
  const page = (body) => HTML.replace('<p>Body copy.</p>', body);
  const s8 = async (html) => (await run({ html })).slop.findings.find((f) => f.id === 'S8');

  it('fires on a badge, a button and a short link', async () => {
    for (const body of ['<span class="badge">AI-powered</span>', '<button type="button">Generate</button>', '<a class="hero-cta" href="/try">Chat with AI</a>']) {
      const f = await s8(page(body));
      assert.ok(f, body);
      assert.equal(f.instances, 1, body);
    }
  });

  it('does not fire on prose, on the same sentence inside a <script>, or on "AI-generated"', async () => {
    for (const body of [
      '<p>Hold to a contract, so taste survives any tool, any team, and any AI that generates your UI.</p>',
      '<p>When AI can generate any interface, trust goes to the sites that hold to rules.</p>',
      '<script>self.__next_f.push([1,"any AI that generates your UI, AI-powered, Generate"])</script>',
      '<a href="/report">AI-generated UI</a>',
      '<span class="tagline">AI-powered</span>',
    ]) {
      assert.equal(await s8(page(body)), undefined, body);
    }
  });
});

/** The shared score arithmetic as shipped: read from the built engine, since it is not exported. */
function shippedScoreArithmetic() {
  const src = readFileSync(new URL('../dist/engine.js', import.meta.url), 'utf8');
  const start = src.indexOf('function scoreArithmetic(');
  assert.ok(start >= 0, 'scoreArithmetic not found in dist/engine.js');
  let depth = 0;
  let i = src.indexOf('{', start);
  for (; i < src.length; i++) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}' && --depth === 0) break;
  }
  return new Function(`${src.slice(start, i + 1)}\nreturn scoreArithmetic;`)();
}

describe('score arithmetic', () => {
  it('rounds to one decimal after the slop deduction and the originality lift', () => {
    // pentagram.com on 2026-10-09: weighted 72.6, slop 20 (the cap), originality +4.
    const scoreArithmetic = shippedScoreArithmetic();
    const checks = [
      ...['PASS', 'PASS', 'FAIL'].map((status, i) => ({ id: `c${i}`, category: 'cadence', status })),
      ...['PASS', 'PASS', 'WARN'].map((status, i) => ({ id: `m${i}`, category: 'motion', status })),
    ];
    assert.equal(72.6 - 20 + 4, 56.599999999999994, 'the float noise this test guards against');
    assert.equal(scoreArithmetic(checks, 0, 0).score, 72.6);
    assert.equal(scoreArithmetic(checks, 20, 4).score, 56.6);
    assert.equal(scoreArithmetic(checks, 5.5, 0).score, 67.1);
  });
});

describe('the package names the contract and engine it carries', () => {
  it('CONTRACT_VERSION is the site contract version', async () => {
    // 0.6.0 reported v0.4.1 while the site served v0.4.3: the constant is
    // pinned by hand and nothing compared it. Read the site's contract source.
    const { readFileSync } = await import('node:fs');
    const { CONTRACT_VERSION } = await import('../dist/engine.js');
    const src = readFileSync(new URL('../../../apps/site/app/lib/design-system-contract.ts', import.meta.url), 'utf8');
    const m = /\n\s*version:\s*'([^']+)'/.exec(src);
    assert.ok(m, 'could not read version from design-system-contract.ts');
    assert.equal(CONTRACT_VERSION, `v${m[1]}`);
  });
});
