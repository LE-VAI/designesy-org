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

  it('SKIPs a page with no status color used as text', async () => {
    const c = await check('v44', { css: `${LIGHT} .dot { background: var(--warn); } p { color: var(--ink); }` });
    assert.equal(c.status, 'SKIP');
    assert.match(c.detail, /^not applicable/);
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
