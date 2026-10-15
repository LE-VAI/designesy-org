/**
 * Engine 1.3.0, pinned rule by rule.
 *
 *   - No A while any check FAILs (see CHANGELOG): any FAIL caps the
 *     score at 89.9, and v44 joins the contrast ceilings at 65. Every cap runs
 *     after the originality lift.
 *
 * The pages below are the counter-examples from the 2026-10-11 core-logic
 * audit, run through the published entry point, so each test fails on the
 * engine before 1.3.0.
 *
 * Zero dependencies: node:test + node:assert/strict.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { scoreFromParts, deriveVerdict, emitReview, emitCanonical } from '../dist/engine.js';

// The audit's "strong page": built to pass nearly every check, so one mutation
// shows its effect. Its originality signals lift it to the 100 clamp.
const HTML = `<!doctype html><html lang="en"><head><meta charset="utf-8">
<title>Field notes</title><meta name="description" content="A test page.">
</head><body><header><nav><a href="/">Home</a></nav></header>
<main><h1>Field notes</h1><h2>Section</h2><p>Body copy.</p>
<button type="button">Save changes</button>
<label for="e">Email address</label><input id="e" type="email">
<a href="/guide">Read the typography guide</a>
<svg viewBox="0 0 1 1"></svg><svg viewBox="0 0 1 1"></svg><svg viewBox="0 0 1 1"></svg>
</main></body></html>`;

const STRONG_CSS = `:root{
  --paper:#ffffff; --ink:#111111; --muted:#595959; --muted-dim:#6b6b6b;
  --surface:#ffffff; --line:#e4e4e8; --signal:#0133cb; --signal-light:#3358e8;
  --ok:#0a7a32; --warn:#8a5a00; --error:#b3261e; --info:#0b57d0;
  --action:var(--signal); --on-action:var(--paper);
  --duration:600ms; --duration-quick:120ms; --duration-fast:180ms; --duration-medium:280ms; --duration-slow:420ms;
  --ease-out:cubic-bezier(.2,.8,.2,1); --ease-spring:cubic-bezier(.3,1.4,.5,1); --ease-in:cubic-bezier(.6,0,.9,.4);
  font-size:16px; font-synthesis:none; text-underline-position:from-font; text-decoration-skip-ink:auto;
  -webkit-font-smoothing:antialiased; -moz-osx-font-smoothing:grayscale;
}
body{font-family:"Fraunces",serif;line-height:1.55;font-size:1rem}
h1,h2{font-family:"Söhne",sans-serif;line-height:1.08;text-wrap:balance;font-size:2rem}
p{max-width:66ch;text-wrap:pretty;font-size:1rem}
code{font-family:"Berkeley Mono",monospace;font-size:.875rem}
.n1,.n2,.n3,.n4,.n5,.n6,.n7,.n8{font-variant-numeric:tabular-nums}
.t1{font-variant-numeric:tabular-nums}.t2{font-variant-numeric:tabular-nums}.t3{font-variant-numeric:tabular-nums}.t4{font-variant-numeric:tabular-nums}
.t5{font-variant-numeric:tabular-nums}.t6{font-variant-numeric:tabular-nums}.t7{font-variant-numeric:tabular-nums}.t8{font-variant-numeric:tabular-nums}
.f{font-feature-settings:"ss01";text-underline-offset:.2em}
::selection{background:var(--signal);color:var(--paper)}
button:focus-visible,a:focus-visible{outline:2px solid var(--signal);outline-offset:2px}
button,a,input{min-height:44px;min-width:44px}
input,textarea,select{font-size:1rem}
button{transition:transform var(--duration-quick) var(--ease-out);border-radius:8px}
button:active{transform:scale(.96)}
.card{border-radius:12px}
.stagger{animation-delay:80ms}
.wrap{width:clamp(320px,90vw,1200px);container-type:inline-size}
@media (hover:hover) and (pointer:fine){button:hover{transform:translateY(-1px)}}
@keyframes mark-breath{0%{opacity:.8}100%{opacity:1}}
@keyframes a1{to{opacity:1}}@keyframes a2{to{opacity:1}}
@media (prefers-reduced-motion: reduce){.stagger{animation:none}}
@media (forced-colors: active){.brand{forced-color-adjust:none}}
.ok-text{color:var(--ok)}.warn-text{color:var(--warn)}.err-text{color:var(--error)}`;

async function run({ html = HTML, css = STRONG_CSS, scope = 'contract' } = {}) {
  return scoreFromParts({ html, css, scope, offline: true });
}

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

describe('no A while any check FAILs', () => {
  it('the strong page still reaches 100 / A with no FAIL', async () => {
    const r = await run();
    assert.equal(r.fail, 0);
    assert.equal(r.score, 100);
    assert.equal(r.grade, 'A');
    assert.equal(r.hardFailCeilingApplied, false);
    assert.equal(r.hardFailCeilingReason, null);
  });

  it('caps a page with one FAIL that has no ceiling of its own at 89.9 / B, and says why', async () => {
    // v11 FAIL (transition:all) on the strong page: 100 / A before 1.3.0.
    const r = await run({ css: `${STRONG_CSS}\n.x{transition:all 1s}` });
    assert.equal(r.fail, 1);
    assert.equal(r.checks.find((c) => c.id === 'v11').status, 'FAIL');
    assert.equal(r.score, 89.9);
    assert.equal(r.grade, 'B');
    assert.equal(r.hardFailCeilingApplied, true);
    assert.match(r.hardFailCeilingReason, /^A FAIL caps the grade at B: v11 fails/);
  });

  it('names every failing check in the reason', async () => {
    // A field below 16px is a true v27 FAIL. (Until engine 1.4.1 this test
    // used `.a{user-select:none}.caption{font-size:12px}`, a v27 false
    // positive that 1.4.1 removes.)
    const r = await run({ css: `${STRONG_CSS}\n.x{transition:all 1s}\n.search input{font-size:12px}` });
    assert.deepEqual(r.checks.filter((c) => c.status === 'FAIL').map((c) => c.id).sort(), ['v11', 'v27']);
    assert.equal(r.score, 89.9);
    assert.match(r.hardFailCeilingReason, /v11 and v27 fail/);
  });

  it('review and canonical output no longer print Block beside Grade A (audit H2)', async () => {
    const r = await run({ css: `${STRONG_CSS}\n.search input{font-size:12px}`, scope: 'universal' });
    assert.ok(r.fail > 0);
    assert.equal(deriveVerdict(r), 'fail');
    const review = emitReview('https://example.test/', r);
    assert.match(review, /\*\*Block\*\*/);
    assert.doesNotMatch(review, /Grade A\)/);
    const canon = emitCanonical('https://example.test/', r);
    assert.equal(canon.verdict, 'fail');
    assert.notEqual(canon.summary.grade, 'A');
  });

  it('applies after the originality lift: the lift can reach a cap but never pass it', () => {
    const scoreArithmetic = shippedScoreArithmetic();
    // 19 PASS and 1 FAIL in one category: 95.0 weighted.
    const checks = [
      ...Array.from({ length: 19 }, (_, i) => ({ id: `c${i}`, category: 'cadence', status: 'PASS' })),
      { id: 'v11', category: 'cadence', status: 'FAIL' },
    ];
    const weighted = scoreArithmetic(checks, 0, 0);
    assert.equal(weighted.score, 89.9, 'a weighted score over the cap is held at it');
    // With +8 originality the uncapped sum would clear 90; the cap holds it.
    const lifted = scoreArithmetic(checks, 0, 8);
    assert.equal(lifted.score, 89.9);
    assert.equal(lifted.hardFailCeilingApplied, true);
    // Below the cap the lift still counts in full.
    const low = [
      ...Array.from({ length: 6 }, (_, i) => ({ id: `c${i}`, category: 'cadence', status: 'PASS' })),
      ...Array.from({ length: 4 }, (_, i) => ({ id: `f${i}`, category: 'cadence', status: 'FAIL' })),
    ];
    assert.equal(scoreArithmetic(low, 0, 0).score, 60);
    assert.equal(scoreArithmetic(low, 0, 8).score, 68);
    assert.equal(scoreArithmetic(low, 0, 8).hardFailCeilingApplied, false);
  });

  it('a lower ceiling wins over the any-FAIL cap, and its reason is the one reported', () => {
    const scoreArithmetic = shippedScoreArithmetic();
    // 18 PASS and 2 FAIL in one category: 90.0 weighted, 98 with the lift.
    const checks = [
      ...Array.from({ length: 18 }, (_, i) => ({ id: `c${i}`, category: 'cadence', status: 'PASS' })),
      { id: 'v11', category: 'cadence', status: 'FAIL' },
      { id: 'v25', category: 'cadence', status: 'FAIL' },
    ];
    const r = scoreArithmetic(checks, 0, 8);
    assert.equal(r.score, 75);
    assert.match(r.hardFailCeilingReason, /heading/i);
  });

  it('leaves a page with no FAIL uncapped, WARNs included', () => {
    const scoreArithmetic = shippedScoreArithmetic();
    const checks = [
      ...Array.from({ length: 9 }, (_, i) => ({ id: `c${i}`, category: 'cadence', status: 'PASS' })),
      { id: 'w', category: 'cadence', status: 'WARN' },
    ];
    const r = scoreArithmetic(checks, 0, 8);
    assert.equal(r.score, 100);
    assert.equal(r.hardFailCeilingApplied, false);
  });
});

describe('v44 joins the contrast ceilings at 65', () => {
  it('caps the audit H1 page (status text #b07d04 on #fff at 3.63:1) at 65 / D, in both scopes', async () => {
    const css = STRONG_CSS.replace('--warn:#8a5a00', '--warn:#b07d04');
    for (const scope of ['contract', 'universal']) {
      const r = await run({ css, scope });
      const v44 = r.checks.find((c) => c.id === 'v44');
      assert.equal(v44.status, 'FAIL', scope);
      assert.match(v44.detail, /3\.63:1 \(needs 4\.5:1\)/);
      assert.equal(r.score, 65, scope);
      assert.equal(r.grade, 'D', scope);
      assert.equal(deriveVerdict(r), 'fail');
      assert.match(r.hardFailCeilingReason, /^Status text below WCAG contrast/);
    }
  });

  it('a v44 WARN carries no ceiling', async () => {
    // Alpha-reduced status text that clears only at full alpha WARNs.
    const css = `${STRONG_CSS}\n.err-faint{color:color-mix(in srgb,var(--error) 45%,transparent)}`;
    const r = await run({ css });
    assert.equal(r.checks.find((c) => c.id === 'v44').status, 'WARN');
    assert.equal(r.fail, 0);
    assert.equal(r.hardFailCeilingApplied, false);
  });
});

describe('v34: only a positively identified AI chat surface can FAIL', () => {
  const v34 = async (html) => (await run({ html, css: '' })).checks.find((c) => c.id === 'v34');
  const withHead = (tag) => HTML.replace('</head>', `${tag}</head>`);
  const withBody = (tag) => HTML.replace('</main>', `</main>${tag}`);

  it('PASSes Google Publisher Tag (gpt.js), an ad tag, which FAILed as an "AI widget" before 1.3.0', async () => {
    const c = await v34(withHead('<script async src="https://securepubads.g.doubleclick.net/tag/js/gpt.js"></script>'));
    assert.equal(c.status, 'PASS');
  });

  it('WARNs, never FAILs, a live-chat vendor with no AI evidence (audit: zendesk-chat FAILed)', async () => {
    for (const tag of [
      '<div id="zendesk-chat" class="chat-widget"></div>',
      '<div id="intercom-container"></div>',
      '<script src="https://js.driftt.com/include/drift.js"></script>',
      '<script async src="https://embed.tawk.to/abc123/default"></script>',
    ]) {
      const c = await v34(withBody(tag));
      assert.equal(c.status, 'WARN', tag);
      assert.match(c.detail, /^possible AI surface \(.+\): review\./, tag);
      assert.match(c.detail, /may require/);
      assert.doesNotMatch(c.detail, /\brequires\b/);
    }
  });

  it('WARNs page text about AI, which is not a chat surface', async () => {
    const c = await v34(HTML.replace('<p>Body copy.</p>', '<p>Ask AI about your reports.</p>'));
    assert.equal(c.status, 'WARN');
    assert.match(c.detail, /AI prompt text/);
  });

  it('FAILs a chatbot container with no disclosure, as "may require", naming the provider duty', async () => {
    const c = await v34(withBody('<div class="chatbot-launcher"></div>'));
    assert.equal(c.status, 'FAIL');
    assert.match(c.detail, /^AI chat surface detected \(chatbot container\)/);
    assert.match(c.detail, /Art\. 50\(1\) may require/);
    assert.match(c.detail, /provider/);
    assert.doesNotMatch(c.detail, /\brequires\b/);
  });

  it('FAILs an AI input and a Dialogflow script with no disclosure', async () => {
    assert.equal((await v34(withBody('<form><input placeholder="Ask AI anything"></form>'))).status, 'FAIL');
    assert.equal((await v34(withHead('<script src="https://www.gstatic.com/dialogflow-console/fast/messenger/bootstrap.js?v=1"></script>'))).status, 'FAIL');
  });

  it('PASSes either kind of surface once a disclosure is present', async () => {
    const strong = await v34(withBody('<div class="chatbot" aria-label="AI assistant"></div>'));
    assert.equal(strong.status, 'PASS');
    assert.match(strong.detail, /^AI surface detected \(chatbot container\); disclosure present/);
    const possible = await v34(withBody('<div id="intercom-container" data-ai-disclosure="true"></div>'));
    assert.equal(possible.status, 'PASS');
    assert.match(possible.detail, /^possible AI surface \(chat widget container\); disclosure present/);
  });

  it('cites the laws correctly: SB 1001 (not AB 2659), Colorado SB 26-189, Art. 50 as a provider duty', async () => {
    const r = await run({ html: withBody('<div class="chatbot"></div>'), css: '' });
    const rem = r.checks.find((c) => c.id === 'v34').remediation;
    assert.match(rem, /SB 1001, Bus\. & Prof\. Code §§17940-17943/);
    assert.doesNotMatch(rem, /AB 2659/);
    assert.match(rem, /SB 24-205 was repealed and re-enacted by SB 26-189/);
    assert.match(rem, /2027-01-01/);
    assert.doesNotMatch(rem, /Feb 2026/);
    assert.match(rem, /provider of the AI system/);
    assert.match(rem, /not legal advice/);
  });

  it('the audit H2 page (gpt.js plus a user-select false positive): no FAIL since engine 1.4.1', async () => {
    // Under 1.3.0 to 1.4.0 this page FAILed v27 on `.caption{font-size:12px}`,
    // read as a field rule because "select" in user-select ran across the
    // brace, and scored 89.9 / B. Engine 1.4.1 reads the caption's own
    // selector, so v27 holds its floor and gpt.js is still not an AI surface.
    const html = withHead('<script async src="https://securepubads.g.doubleclick.net/tag/js/gpt.js"></script>');
    const r = await run({ html, css: `${STRONG_CSS}.a{user-select:none}.caption{font-size:12px}`, scope: 'universal' });
    assert.equal(r.checks.find((c) => c.id === 'v34').status, 'PASS');
    assert.equal(r.checks.find((c) => c.id === 'v27').status, 'PASS');
    assert.deepEqual(r.checks.filter((c) => c.status === 'FAIL').map((c) => c.id), []);
    assert.equal(r.hardFailCeilingApplied, false);
  });

  it('the audit H2 page with a true v27 FAIL still caps at 89.9 / B', async () => {
    const html = withHead('<script async src="https://securepubads.g.doubleclick.net/tag/js/gpt.js"></script>');
    const r = await run({ html, css: `${STRONG_CSS}.search input{font-size:12px}`, scope: 'universal' });
    assert.equal(r.checks.find((c) => c.id === 'v34').status, 'PASS');
    assert.deepEqual(r.checks.filter((c) => c.status === 'FAIL').map((c) => c.id), ['v27']);
    assert.equal(r.score, 89.9);
    assert.equal(r.grade, 'B');
  });
});

describe('v06 and v22 read CSS Color 4, and tokens declared as :root, :host', () => {
  const pick = (r, id) => r.checks.find((c) => c.id === id);

  it('measures oklch() tokens (audit H4: SKIP and 100 / A before 1.3.0)', async () => {
    const css = STRONG_CSS.replace('--paper:#ffffff', '--paper:oklch(1 0 0)').replace('--ink:#111111', '--ink:oklch(0.2 0 0)').replace('--muted:#595959', '--muted:oklch(0.85 0 0)');
    const r = await run({ css });
    const v06 = pick(r, 'v06');
    assert.equal(v06.status, 'FAIL');
    assert.match(v06.detail, /--muted=1\.58:1/);
    assert.equal(pick(r, 'v22').status, 'PASS');
    assert.equal(r.score, 65);
    assert.equal(r.grade, 'D');
  });

  it('reads the :root, :host block Tailwind v4 emits (no tokens before 1.3.0)', async () => {
    const r = await run({ html: HTML, css: ':root,:host{--paper:#ffffff;--ink:#111111;--muted:#d0d0d0;--signal:#0133cb}body{color:var(--ink)}' });
    assert.equal(r.tokensExtracted, 4);
    assert.equal(pick(r, 'v01').status, 'PASS');
    assert.match(pick(r, 'v06').detail, /--muted=1\.54:1/);
    const spaced = await run({ html: HTML, css: ':root, :host {\n  --paper: #fff;\n  --ink: #111;\n}' });
    assert.equal(spaced.tokensExtracted, 2);
  });

  it('reads space-syntax rgb() and hsl(), and 8-digit hex', async () => {
    const r = await run({ css: ':root{--paper:rgb(255 255 255);--ink:hsl(240 6% 10%);--muted:rgb(89 89 89 / 100%);--signal:hsl(225deg 99% 40%)}' });
    assert.equal(pick(r, 'v06').status, 'PASS');
    assert.match(pick(r, 'v06').detail, /--muted=7\.00:1/);
    assert.equal(pick(r, 'v22').status, 'PASS');
    const hex8 = await run({ css: ':root{--paper:#ffffffff;--ink:#111111ff}' });
    assert.equal(pick(hex8, 'v06').status, 'PASS');
  });

  it('composites translucent text over the paper it sits on, and leaves a translucent paper unmeasured', async () => {
    // #00000061 is black at 38%: painted on white it is #9e9e9e, 2.68:1.
    const r = await run({ css: ':root{--paper:#fff;--ink:#000000de;--muted:#00000061}' });
    assert.equal(pick(r, 'v06').status, 'FAIL');
    assert.match(pick(r, 'v06').detail, /--muted=2\.68:1/);
    const paper = await run({ css: ':root{--paper:rgb(255 255 255 / 50%);--ink:#111}' });
    assert.equal(pick(paper, 'v06').status, 'SKIP');
  });

  it('measures --muted-foreground, not the --muted surface, where a shadcn theme declares both', async () => {
    const shadcn = ':root{--background:oklch(1 0 0);--foreground:oklch(0.145 0 0);--muted:oklch(0.97 0 0);--muted-foreground:oklch(0.556 0 0)}';
    const v06 = pick(await run({ css: shadcn }), 'v06');
    assert.equal(v06.status, 'PASS');
    assert.match(v06.detail, /--muted-foreground=4\.73:1/);
    assert.doesNotMatch(v06.detail, /--muted=/);
  });

  it('does not throw on a value that names an Object.prototype key', async () => {
    const r = await run({ css: ':root{--paper:constructor;--ink:#000;--signal:toString}' });
    assert.equal(pick(r, 'v06').status, 'SKIP');
    assert.equal(pick(r, 'v22').status, 'SKIP');
  });
});

describe('v42 and v43 follow aliases, and a palette that role tokens alias is not a hue vocabulary', () => {
  const pick = (r, id) => r.checks.find((c) => c.id === id);

  // The audit's H7: role tokens aliased to hue primitives, as v42's own
  // remediation instructs. Before 1.3.0: v42 WARN "0 role-named vs 6
  // hue-named", v43 WARN "0/4 status families".
  const H7 = `:root{--blue-600:#1d4ed8;--gray-900:#111111;--gray-50:#fafafa;--red-700:#b3261e;--green-700:#0a7a32;--amber-800:#8a5a00;
    --ink:var(--gray-900);--paper:var(--gray-50);--signal:var(--blue-600);--error:var(--red-700);--ok:var(--green-700);--warn:var(--amber-800)}`;

  it('counts role tokens that alias primitives as role-named (audit H7)', async () => {
    const r = await run({ css: H7 });
    const v42 = pick(r, 'v42');
    assert.equal(v42.status, 'PASS');
    assert.match(v42.detail, /^6 role-named vs 0 hue-named/);
    assert.match(v42.detail, /6 hue-named primitive\(s\) that role tokens alias are the palette layer/);
    const v43 = pick(r, 'v43');
    assert.equal(v43.status, 'PASS');
    assert.match(v43.detail, /3\/4 status families present \(ok, warn, error\)/);
  });

  it('scores a two-tier system no worse than the same roles holding literals', async () => {
    const literal = `:root{--ink:#111111;--paper:#fafafa;--signal:#1d4ed8;--error:#b3261e;--ok:#0a7a32;--warn:#8a5a00}`;
    const [two, one] = [await run({ css: H7 }), await run({ css: literal })];
    assert.equal(pick(two, 'v42').status, pick(one, 'v42').status);
    assert.equal(pick(two, 'v43').status, pick(one, 'v43').status);
    assert.ok(two.score >= one.score, `two-tier ${two.score} < literal ${one.score}`);
  });

  // Tailwind v4 shape: the theme's palette in :root, :host, role tokens that
  // alias it in :root.
  const PALETTE = ['red', 'green', 'amber', 'sky', 'blue', 'gray'].flatMap((hue, i) =>
    [50, 500, 600, 950].map((step) => `--color-${hue}-${step}:oklch(${(0.97 - step / 1100).toFixed(3)} ${(0.02 + i / 100).toFixed(3)} ${i * 50})`));
  const ROLES = '--background:var(--color-gray-50);--foreground:var(--color-gray-950);--primary:var(--color-blue-600);--danger:var(--color-red-600);--success:var(--color-green-600);--warning:var(--color-amber-500);--info:var(--color-sky-600)';

  it('treats a Tailwind-style palette that role tokens alias as the palette layer, not hue names', async () => {
    const referenced = ['gray-50', 'gray-950', 'blue-600', 'red-600', 'green-600', 'amber-500', 'sky-600'];
    const palette = PALETTE.filter((d) => referenced.some((n) => d.startsWith(`--color-${n}:`)));
    const r = await run({ css: `:root, :host {${palette.join(';')}} :root{${ROLES}}` });
    const v42 = pick(r, 'v42');
    assert.equal(v42.status, 'PASS', v42.detail);
    assert.match(v42.detail, /7 hue-named primitive\(s\) that role tokens alias are the palette layer/);
    assert.equal(pick(r, 'v43').status, 'PASS');
  });

  it('still counts hue-named tokens that no role token aliases against the role share', async () => {
    // 24 palette entries, 7 of them aliased: 17 unreferenced hue names. (The
    // role count also holds the --paper/--ink/--signal the engine infers from
    // --background/--foreground/--primary, as it did before 1.3.0.)
    const r = await run({ css: `:root, :host {${PALETTE.join(';')}} :root{${ROLES}}` });
    const v42 = pick(r, 'v42');
    assert.equal(v42.status, 'WARN', v42.detail);
    assert.match(v42.detail, /role-named vs 17 hue-named/);
  });

  it('a palette with no role tokens at all leans on hue names', async () => {
    const r = await run({ css: `:root, :host {${PALETTE.join(';')}}` });
    assert.equal(pick(r, 'v42').status, 'WARN');
    assert.equal(pick(r, 'v43').status, 'WARN');
  });
});

describe('v42 keeps a token written as a color, even when its alias cannot be followed', () => {
  it('counts hsl(var(--x)) whose --x refers back to itself, as before 1.3.0', async () => {
    // The shape x.com ships: role tokens wrapped as hsl(var(--same-name)).
    const css = ':root, :host {--color-text:hsl(var(--color-text));--color-brand-foreground:hsl(var(--color-brand-foreground));--color-nested-border:hsl(var(--color-nested-border));--color-gray-50:oklch(0.98 0 0)}';
    const v42 = (await run({ css })).checks.find((c) => c.id === 'v42');
    assert.equal(v42.status, 'PASS', v42.detail);
    assert.match(v42.detail, /role-named vs 1 hue-named/);
  });
});
