/**
 * Engine 1.3.1, pinned rule by rule.
 *
 *   - v26 skips any face named with the WORD fallback, not only a name that
 *     ends in it ("Fraunces Fallback Tuned" is a metric-matched stand-in).
 *   - v27 reads `font-size: var(--token)` in a rule that styles a field through
 *     the :root tokens, before both the below-16px scan and the floor test.
 *   - v38 drops the text of <kbd> keycaps (read from the markup) and plain
 *     "+key" hints in any case ("ctrl+s"), keeps "Shift A" as a label, and
 *     accepts get, set, try and a short list of CTA verbs.
 *   - v43 counts --destructive (shadcn/ui's error role) as the error family.
 *   - httpsFetch (the npm engine's fetch) stops after 3 redirects.
 *
 * The rule tests fail on the 1.3.0 build; the controls (marked) pass on both.
 * Zero dependencies: node:test + node:assert/strict.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import https from 'node:https';
import { syncBuiltinESMExports } from 'node:module';
import { scoreFromParts, scoreUrl } from '../dist/engine.js';

const page = (body) =>
  `<!doctype html><html lang="en"><head><title>Fixture</title></head><body><main>${body}</main></body></html>`;
const FIELD = page('<label for="e">Email address</label><input id="e" type="email">');

async function check(id, html, css) {
  const r = await scoreFromParts({ html, css, offline: true, scope: 'universal' });
  const c = r.checks.find((x) => x.id === id);
  assert.ok(c, `${id} missing from the result`);
  return c;
}

describe('v26: a face named with the word fallback is not a family choice', () => {
  // designesy.org's stacks, as the live detail listed them on 2026-10-12:
  // "4 families (recommended ≤3): fraunces fallback tuned, fraunces,
  // schibsted grotesk, atkinson hyperlegible mono".
  const CSS = `@font-face{font-family:'Fraunces Fallback Tuned';src:local('Times New Roman')}
body{font-family:'Fraunces Fallback Tuned', serif}
h1{font-family:Fraunces, 'Fraunces Fallback Tuned', serif}
p{font-family:'Schibsted Grotesk', sans-serif}
code{font-family:'Atkinson Hyperlegible Mono', monospace}`;

  it('counts designesy.org-style stacks as 3 families (PASS)', async () => {
    const c = await check('v26', page('<p>x</p>'), CSS);
    assert.equal(c.status, 'PASS');
    assert.equal(c.detail, '3 family/families: fraunces, schibsted grotesk, atkinson hyperlegible mono');
  });

  it('control: still skips the next/font " Fallback" suffix', async () => {
    const c = await check('v26', page('<p>x</p>'), `body{font-family:'Geist Fallback'}h1{font-family:Geist}`);
    assert.equal(c.detail, '1 family/families: geist');
  });

  it('control: a family whose name only contains the letters (Fallbackish) still counts', async () => {
    const c = await check('v26', page('<p>x</p>'), 'a{font-family:Fallbackish}b{font-family:A}c{font-family:B}d{font-family:C}');
    assert.equal(c.status, 'WARN');
    assert.match(c.detail, /^4 families/);
  });
});

describe('v27: font-size: var() in a field rule is read through the :root tokens', () => {
  it('a 1rem token is the 16px floor (PASS)', async () => {
    const c = await check('v27', FIELD, ':root { --text-body: 1rem; } input, textarea, select { font-size: var(--text-body); }');
    assert.equal(c.status, 'PASS');
    assert.equal(c.detail, 'input font-size floor detected');
  });

  it('a 0.875rem token is below the floor (FAIL)', async () => {
    const c = await check('v27', FIELD, ':root { --text-sm: 0.875rem; } input { font-size: var(--text-sm); }');
    assert.equal(c.status, 'FAIL');
    assert.equal(c.detail, '1 input(s) below 16px floor: 0.875rem (14px)');
  });

  it('follows a var() chain in a minified sheet', async () => {
    const c = await check('v27', FIELD, ':root{--base:16px;--field:var(--base)}input{font-size:var(--field)}');
    assert.equal(c.status, 'PASS');
  });

  it('control: an unresolvable var() reads as before (WARN)', async () => {
    const c = await check('v27', FIELD, 'input { font-size: var(--missing); }');
    assert.equal(c.status, 'WARN');
  });

  it('control: does not resolve var() in rules that do not style a field', async () => {
    // designesy.org's card caption: resolving it would have read 12.8px as an
    // input below 16px, because the literal scan matches ".field" anywhere.
    const css = [
      ':root { --text-label: 0.8rem; }',
      '.field-card-meta { font-size: var(--text-label); }',
      '.input-hint { font-size: var(--text-label); }',
      '.field label { font-size: var(--text-label); }',
      'input::placeholder { font-size: var(--text-label); }',
      '.a { user-select: none; } .b { font-size: var(--text-label); }',
    ].join('\n');
    const c = await check('v27', FIELD, css);
    assert.equal(c.status, 'WARN', c.detail);
  });

  it('resolves inside :is() lists and @media blocks', async () => {
    assert.equal((await check('v27', FIELD, ':root { --s: 0.75rem; } :is(input, textarea) { font-size: var(--s); }')).status, 'FAIL');
    assert.equal((await check('v27', FIELD, ':root { --b: 1rem; } @media (max-width: 600px) { input { font-size: var(--b); } }')).status, 'PASS');
  });
});

describe('v38: <kbd> keycaps are hints, and get / set / try are verbs', () => {
  const btn = (inner, attrs = '') => page(`<button type="button"${attrs}>${inner}</button>`);

  it('reads the flame-flip keycap button by its verb (PASS)', async () => {
    const html = page('<button type="button" class="flip-keys"><span class="sr-only">Flip to the flame: </span><kbd>ctrl</kbd> <span aria-hidden="true">+</span> <kbd>i</kbd></button>');
    const c = await check('v38', html, '');
    assert.equal(c.status, 'PASS', c.detail);
  });

  it('reads "Flip to the flame: <kbd>ctrl</kbd> + <kbd>i</kbd>" by its verb (PASS)', async () => {
    const c = await check('v38', btn('Flip to the flame: <kbd>ctrl</kbd> <span aria-hidden=true>+</span> <kbd>i</kbd>'), '');
    assert.equal(c.status, 'PASS', c.detail);
  });

  it('a button holding only <kbd> keycaps and no aria-label is judged as an icon-only button', async () => {
    const icon = await check('v38', btn('<svg viewBox="0 0 1 1"></svg>'), '');
    const keys = await check('v38', btn('<kbd>ctrl</kbd> <kbd>k</kbd>'), '');
    assert.deepEqual([keys.status, keys.detail], [icon.status, icon.detail]);
  });

  it('strips a plain-text lower-case "+key" hint, so the aria-label is judged', async () => {
    const c = await check('v38', btn('ctrl+k', ' aria-label="Open search"'), '');
    assert.equal(c.status, 'PASS', c.detail);
  });

  it('control: "Find <kbd>⌘</kbd><kbd>K</kbd>" reads as its verb (PASS)', async () => {
    assert.equal((await check('v38', btn('Find <kbd>⌘</kbd><kbd>K</kbd>'), '')).status, 'PASS');
  });

  it('control: plain-text "Shift A" stays a label (WARN, as in 1.3.0)', async () => {
    const c = await check('v38', btn('Shift A'), '');
    assert.equal(c.status, 'WARN');
    assert.match(c.detail, /"Shift A"/);
  });

  it('strips a lower-case keycap pair, so an icon button is judged by its aria-label', async () => {
    const c = await check('v38', btn('<kbd>ctrl</kbd> <kbd>k</kbd>', ' aria-label="Open search"'), '');
    assert.equal(c.status, 'PASS', c.detail);
  });

  it('strips the keycaps from the label it reports', async () => {
    const c = await check('v38', btn('Shortcuts <kbd>ctrl</kbd> <kbd>k</kbd>'), '');
    assert.equal(c.status, 'WARN');
    assert.match(c.detail, /"Shortcuts"/);
    assert.doesNotMatch(c.detail, /ctrl/);
  });

  for (const label of ['Find⌘K', 'FindCtrlK', 'Save ctrl+s', 'Save Ctrl+S', 'Find ctrl+k']) {
    it(`control: "${label}" reads as its verb (PASS)`, async () => {
      assert.equal((await check('v38', btn(label), '')).status, 'PASS');
    });
  }

  it('control: "Alt text" stays a label: a word after a space is not a key', async () => {
    const c = await check('v38', btn('Alt text'), '');
    assert.equal(c.status, 'WARN');
    assert.match(c.detail, /"Alt text"/);
  });

  it('control: "Option 2" keeps its digit (a choice, not a shortcut)', async () => {
    assert.match((await check('v38', btn('Option 2'), '')).detail, /"Option 2"/);
  });

  it('control: "Halt" and "Options" keep their endings', async () => {
    assert.match((await check('v38', btn('Halt'), '')).detail, /"Halt"/);
    assert.match((await check('v38', btn('Options'), '')).detail, /"Options"/);
  });

  for (const label of ['Get started', 'Try it free', 'Set password', 'Learn more', 'Sign in', 'Join the waitlist', 'Expand all', 'Select plan', 'Read more']) {
    it(`"${label}" starts with a verb (PASS)`, async () => {
      assert.equal((await check('v38', btn(label), '')).status, 'PASS');
    });
  }
});

describe('v43: --destructive is the error role', () => {
  it('counts shadcn/ui --destructive as the error family', async () => {
    const c = await check('v43', page('<p>x</p>'), ':root { --success: #0a7a32; --warning: #8a5a00; --destructive: #b3261e; --info: #0b57d0; }');
    assert.equal(c.status, 'PASS');
    assert.equal(c.detail, '4/4 status families present (ok, warn, error, info): states expressed as semantic roles');
  });
});

describe('httpsFetch: at most 3 redirects', () => {
  // node:https cannot reach a local server here (safeLookup refuses loopback,
  // as it should), so node:https get is replaced for the duration of a test.
  // syncBuiltinESMExports pushes the replacement into the engine's live
  // `import { get as httpsGet } from 'node:https'` binding. `route(url)`
  // returns [status, location?, body?]. Requests for /DESIGN.md (the v37
  // probe) answer 404 and are not counted.
  const PAGE = '<!doctype html><html lang="en"><head><title>Hop</title></head><body><main><h1>Final page</h1><p>Body copy.</p></main></body></html>';

  async function withFakeGet(route, fn) {
    const real = https.get;
    const calls = [];
    https.get = (url, _opts, cb) => {
      const href = String(url);
      const isProbe = /\/DESIGN\.md$/i.test(href);
      if (!isProbe) calls.push(href);
      // A loop guard for the build under test: 1.3.0 followed redirects
      // forever, so after 100 requests answer with a page to end the walk.
      const [statusCode, location, body = ''] = isProbe ? [404] : calls.length > 100 ? [200, undefined, PAGE] : route(href);
      const handlers = {};
      const res = {
        statusCode,
        headers: location ? { location } : {},
        resume() {},
        setEncoding() {},
        on(ev, h) {
          handlers[ev] = h;
          if (ev === 'end') setImmediate(() => { if (body) handlers.data?.(body); h(); });
          return res;
        },
      };
      setImmediate(() => cb(res));
      return { on() { return this; }, destroy() {} };
    };
    syncBuiltinESMExports();
    try {
      return { result: await fn(), calls };
    } finally {
      https.get = real;
      syncBuiltinESMExports();
    }
  }

  it('stops a redirect loop after 3 redirects on each candidate URL, and reports it unreadable', async () => {
    const { result, calls } = await withFakeGet(
      (url) => [302, url.endsWith('/a') ? url.replace(/\/a$/, '/b') : url.replace(/\/b$/, '/a')],
      () => scoreUrl('https://loop.example/a', 'universal'),
    );
    // Three candidate URLs (as given, www., http://), each: the request and 3 redirects.
    assert.equal(calls.length, 12, `requests made: ${calls.length}`);
    assert.equal(result.unreachable, true);
    assert.equal(result.score, null);
  });

  it('a 4th redirect is not followed', async () => {
    const { result, calls } = await withFakeGet(
      (url) => {
        const n = Number(url.slice(-1));
        return n < 4 ? [301, url.replace(/\d$/, String(n + 1))] : [200, undefined, PAGE];
      },
      () => scoreUrl('https://four.example/0', 'universal'),
    );
    assert.ok(calls.every((u) => !u.endsWith('/4')), `followed a 4th redirect: ${calls.join(' ')}`);
    assert.equal(result.unreachable, true);
  });

  it('control: follows 3 redirects to the page and scores it', async () => {
    const { result, calls } = await withFakeGet(
      (url) => {
        const n = Number(url.slice(-1));
        return n < 3 ? [301, url.replace(/\d$/, String(n + 1))] : [200, undefined, PAGE];
      },
      () => scoreUrl('https://three.example/0', 'universal'),
    );
    assert.deepEqual(calls, ['https://three.example/0', 'https://three.example/1', 'https://three.example/2', 'https://three.example/3']);
    assert.equal(typeof result.score, 'number');
  });

  it('control: still refuses a redirect to a private address before following it', async () => {
    const { result, calls } = await withFakeGet(
      () => [302, 'http://169.254.169.254/latest/meta-data'],
      () => scoreUrl('https://public.example/', 'universal'),
    );
    assert.ok(calls.every((u) => !u.includes('169.254')), 'the metadata address was requested');
    assert.equal(result.unreachable, true);
  });
});
