#!/usr/bin/env node
/**
 * Contract page gate: /score/contract renders every state of its first part
 * from recorded engine responses, each accessible, announced and focused as
 * listed below.
 *
 * WHY THIS EXISTS
 * The page's states only exist after a run: a field error, a run in flight,
 * a rejected contract (422), a request that got no result (429, 413, a
 * network failure), a landing and a site that could not be read. The site's
 * a11y sweep loads the entry state only, and a page can pass it while a
 * later state moves focus to <body>, announces nothing, or lets a problem
 * message sit under the 12.8px text floor. This gate drives each state.
 *
 * WHAT IT ASSERTS (each state, 1440x900 and 390x844, dark and light)
 *   States: entry; field error (an empty submit); running (the request held);
 *   rejected, one problem (a prose DESIGN.md, the real engine's 422) and
 *   three (a DESIGN.md with a duplicate heading, a linter error and a dropped
 *   token); 429 with Retry-After; 413; a network failure; landed (a real
 *   200); site unreachable (a real 200 with no page). Engine responses are the
 *   recorded files in scripts/fixtures/contract-page/; nothing leaves the
 *   machine and no POST reaches the server.
 *   1. axe-core, wcag2a/2aa/21a/21aa/22aa: 0 violations.
 *   2. The page's one polite live region is in the server's HTML (present
 *      from first paint) and, after the state, carries its announcement.
 *   3. Focus: the first invalid field (field error), the run key (running,
 *      request errors), the panel heading (rejected), the verdict line
 *      (landed, unreachable); never <body>.
 *   4. A request error shows one role="alert" card with its title; a
 *      rejected run lists every problem the engine returned, each sentence
 *      whole (no ellipsis), and its heading, which takes focus for screen
 *      readers, paints no focus ring (it is not a control).
 *   7. The provenance line: every rejected and landed state whose DESIGN.md
 *      the linter read prints it exactly once, with the linter's own totals
 *      as the engine returned them and, where linter findings were merged
 *      into structured problems, how many shown rows absorbed them. The three
 *      states where the linter never read the file (a DTCG contract, a
 *      contract link that was not fetched, an unknown format) print no line
 *      and no "Linted with" words at all.
 *   5. No text on the page under 12.8px (the type floor), sr-only text and
 *      role="img" drawings aside.
 *   6. No horizontal overflow of the document.
 *   8. Every landed state draws its result from the record, not from a
 *      scenario: the verdict sentence is the approved template filled with
 *      the run's own counts (re-derived here from the recorded checks), its
 *      hidden prefix carries both numbers, each readout shows the score in
 *      one decimal with its grade, or "No score" with no numeral, no letter
 *      and no scale; both check lists list every recorded check with the
 *      #267 words and "Not scored N"; f02's line equals the engine's own;
 *      the first finding is the first failing (else needing-work) fidelity
 *      check; the receipt's digests are the recorded ones in 8-character
 *      groups and its versions equal ENGINE_VERSION and CONTRACT_VERSION of
 *      this checkout. An empty run (W8) shows the card and no lists.
 *   9. Keyboard: from the verdict line "Go to this check" is the second Tab
 *      stop; Enter focuses its row, open, clear of the top bar.
 *  10. The readout sweep (D79, R33-01), once per landed state and theme:
 *      every width from 320 to 1600 every 8px, no readout part past its
 *      column and the two readouts never stacked (D8, D81); below a 26rem
 *      pair "/100" and the grade sit in one row under the numeral, from 26rem
 *      beside it unless they do not fit there; the numeral is the house clamp
 *      or, where "100.0" would not fit its column, the D81 fit size, and one
 *      size per width for every score; labels at 12.8px, tracked 0.02em only under
 *      26rem; "CONTRACT FIDELITY" one line from 390px, two balanced lines
 *      (one word each, text-wrap: balance) at 375px and narrower.
 *  12. D82: "Want a person to walk your team through this? The Review →",
 *      linking /pricing/review, once under a landed result that scored, and
 *      absent from every other state (rejected, errors, no score, empty runs).
 *  11. The previous run (Edit inputs): the result stays below the reopened
 *      form, labelled, with no duplicate ids; a new run draws the live
 *      instrument above it and no skeleton.
 *  13. Fast runs (state "fast-run"): a run started from the top of the page
 *      whose answer comes back while the page is still scrolling toward the
 *      instrument. Each answer delay (--fast-delays, default 0,100,314 ms) at
 *      1920x1080, 1440x900, 1080x1080 and 390x844 (--fast-views), from the
 *      top and from 376px down (--fast-starts), with motion on, motion on
 *      with a stray scrollend (another scroll's, arriving 16 ms after the
 *      run's smooth scroll starts), reduced motion and the site's motion
 *      paused (--fast-motion). The landing races the scroll, so each case
 *      runs --fast-repeat times (default 5), each in a fresh context, a few
 *      at once (--fast-jobs, default 4), and must pass every time: a lucky
 *      pass cannot hide a race. 1.5 s after the
 *      landing the page has stopped, the verdict line sits under the sticky
 *      bar and inside the viewport, both readouts are inside the viewport,
 *      and focus is on the verdict line. The landed-state renders above run
 *      with reduced motion, which scrolls at once, so they never see a
 *      smooth scroll the landing overtakes.
 *
 * PROVING IT CAN FAIL
 *   --break live    removes the live region before the checks (2 fails)
 *   --break focus   sends focus to <body> after each state
 *   --break ring    gives the focused result heading the control ring back
 *   --break lint    removes the provenance line ("Linted with ...")
 *   --break totals  serves linter totals one error off the record
 *   --break phantom serves linter totals in the answers where the linter never
 *                   read the file (a DTCG contract, an unfetched link, an
 *                   unknown format), so the page prints a line the gate says
 *                   must be absent
 *   --break verdict replaces the verdict with a sentence the counts do not support
 *   --break cap     caps the numeral (round 3.2's rejected readout)
 *   --break row     drops the narrow row, so the chip sits beside the numeral
 *   --break review  removes the Review line where it is due, and adds one to every other state
 *   --break stack   stacks the two readouts (D8 and D81 forbid it)
 *   --break digits  sizes the numeral by its digits in one state (D81: one size per width)
 *   --break tracking tracks the labels at 0.08em under 26rem
 *   --break balance removes text-wrap: balance from the labels
 *   --break         live and focus. Each must exit 1.
 *   The fast-run case is proven against the scroll code before its fix,
 *   where a landing inside the smooth scroll ended with the verdict above
 *   the screen.
 *
 * Usage:
 *   node scripts/check-contract-page.js --base http://127.0.0.1:3422 [--channel chrome]
 *   ... --themes dark --widths 1440 --states rejected-multi
 *   ... --states fast-run --fast-delays 0,50,314   only the fast-run case
 *   ... --states fast-run --fast-views 1440x900 --fast-motion on,stray --fast-repeat 20
 *   ... --shots <dir>     write a full-page screenshot of every state (crops)
 * Exit 1 on any failure, 2 on a fatal error.
 */

const fs = require('fs');
const path = require('path');

const args = process.argv.slice(2);
const opt = (name, dflt) => {
  const i = args.indexOf(name);
  return i >= 0 && args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : dflt;
};
const BASE = (opt('--base', 'http://127.0.0.1:3422') || '').replace(/\/$/, '');
const CHANNEL = opt('--channel', 'chrome');
const THEMES = opt('--themes', 'dark,light').split(',');
const WIDTHS = opt('--widths', '1440,390').split(',').map(Number);
const SHOTS = opt('--shots', null);
const bi = args.indexOf('--break');
const BREAK = bi < 0 ? [] : args[bi + 1] && !args[bi + 1].startsWith('--') ? args[bi + 1].split(',') : ['live', 'focus'];
const FIX = path.join(__dirname, 'fixtures', 'contract-page');
const fixture = (n) => JSON.parse(fs.readFileSync(path.join(FIX, n), 'utf8'));
const text = (n) => fs.readFileSync(path.join(FIX, n), 'utf8');
const AXE_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];

// The versions this checkout renders (the receipt must equal them).
const { createHarness } = require('./lib/route-harness.js');
const H = createHarness({ app: path.join(__dirname, '..') });
const ENGINE_VERSION = H.load('app/lib/check-definitions.ts').ENGINE_VERSION;
const CONTRACT_VERSION = H.load('app/lib/design-system-contract.ts').CONTRACT_VERSION;
const COPY = H.load('app/score/contract/copy.ts');

/** One decimal, the result language's score format. */
const fmt = (n) => (Math.round(n * 10) / 10).toFixed(1);
const clause = (s) => (/^[A-Z][A-Z]/.test(s) ? s : s.charAt(0).toLowerCase() + s.slice(1));
const WORD = { PASS: 'Pass', WARN: 'Needs work', FAIL: 'Fail', SKIP: 'Does not apply', MANUAL: 'Needs a browser run' };

/** The verdict sentence the page must print, built from a recorded answer's
    own checks: re-derived here, never read from the page's code. */
function expectVerdict(b) {
  if (b.unreachable) return 'Could not read this site, so neither number has a score. Your contract was read and is valid.';
  const f = b.fidelity;
  const base = b.baseline;
  if (f.score === null) {
    return base.score === null
      ? 'Fidelity has no score for this page, because too few of your checks could run.'
      : `Fidelity has no score for this page, because too few of your checks could run. The baseline is ${fmt(base.score)}, grade ${base.grade}.`;
  }
  const fid = b.checks.filter((c) => c.layer === 'fidelity');
  const bl = b.checks.filter((c) => c.layer === 'baseline');
  const fails = fid.filter((c) => c.status === 'FAIL');
  const warns = fid.filter((c) => c.status === 'WARN');
  const CAPS = { f09: 65, f10: 70 };
  let lead;
  if (!fails.length && !warns.length) lead = 'The page follows your contract. Every scored check passed.';
  else if (!fails.length) lead = `The page follows your contract. ${warns.length} ${warns.length === 1 ? 'check needs' : 'checks need'} work.`;
  else if (fails.length === 1) {
    const cap = f.ceilingApplied ? CAPS[fails[0].id] : undefined;
    lead = `The page follows most of your contract. One check failed: ${clause(fails[0].item)}${cap ? `, which caps fidelity at ${cap}` : ''}.`;
  } else lead = `The page follows most of your contract. ${fails.length} checks failed, starting with ${clause(fails[0].item)}.`;
  const bf = bl.filter((c) => c.status === 'FAIL');
  const tail = !bf.length ? '' : bf.length === 1 ? ` The baseline also has 1 failing check: ${clause(bf[0].item)}.` : ` The baseline also has ${bf.length} failing checks, starting with ${clause(bf[0].item)}.`;
  return lead + tail;
}

function expectPrefix(b) {
  if (b.unreachable) return null;
  const l = (n, x) => (x.score === null || x.grade === null ? `${n}: no score.` : `${n} ${fmt(x.score)}, grade ${x.grade}.`);
  return `${l('Contract fidelity', b.fidelity)} ${l('Baseline', b.baseline)} `;
}

const groups8 = (h) => (h.match(/.{1,8}/g) || []).join(' ');

const RESP = {
  prose: fixture('rejected-prose.json'),
  multi: fixture('rejected-multi.json'),
  landed: fixture('landed.json'),
  unreachable: fixture('unreachable.json'),
  format: fixture('rejected-format.json'),
  link: fixture('rejected-link.json'),
  dtcgRejected: fixture('rejected-dtcg.json'),
  pass: fixture('landed-pass.json'),
  drift: fixture('landed-drift.json'),
  capped: fixture('landed-capped.json'),
  warn: fixture('landed-warn.json'),
  oneFail: fixture('landed-one-fail.json'),
  noScore: fixture('landed-no-score.json'),
  shell: fixture('landed-empty-shell.json'),
  noCss: fixture('landed-no-css.json'),
  tooMany: { status: 429, retryAfter: '42', body: { ok: false, error: 'Too many contract runs. Try again in a minute.', code: 'rate_limited' } },
  tooLarge: { status: 413, body: { ok: false, error: 'This contract is 300 KB. Scoring reads contracts up to 256 KB. Remove unused tokens or score part of it.', code: 'contract_too_large' } },
};

/** Fill the slab and press the run key: a pasted contract, or a linked one
    (the Link source, then its address). */
async function fillAndRun(page, contract, site = 'example.com', how = 'paste') {
  await page.fill('.cf-bar .eg-bar-line input', site);
  if (how === 'link') {
    await page.click('.cf-bar [role="radio"]:has-text("Link")');
    await page.fill('.cf-bar input[placeholder^="https://"]', contract);
  } else {
    await page.fill('.cf-bar textarea.m3-textarea', contract);
  }
  await page.waitForTimeout(250);
  await page.focus('.cf-bar .eg-bar-go');
  await page.keyboard.press('Enter');
}

/** The provenance line the page must print for a recorded engine answer:
    the linter's own totals (rejected: body.linter; landed: ownContract.linter)
    and the shown rows that absorbed linter findings. */
const words = (n, one, many) => `${n} ${n === 1 ? one : many}`;
function provenance(reply) {
  const b = reply.body;
  const l = b.linter !== undefined ? b.linter : b.ownContract && b.ownContract.linter;
  if (!l) return null;
  const n = (b.problems || []).filter((p) => p.linterFinding === true).length;
  return `Linted with @google/design.md ${l.version}: ${words(l.errors, 'error', 'errors')}, ${words(l.warnings, 'warning', 'warnings')}${n ? ` (shown above as ${words(n, 'problem', 'problems')})` : ''}.`;
}

const STATES = [
  { id: 'entry', reply: null, go: async () => {}, focus: null, say: '' },
  {
    id: 'field-error',
    reply: null,
    go: async (page) => {
      await page.focus('.cf-bar .eg-bar-go');
      await page.keyboard.press('Enter');
    },
    focus: '.cf-bar .eg-bar-line input',
    say: '',
    warn: true,
  },
  {
    id: 'running',
    reply: 'hold',
    go: async (page) => fillAndRun(page, text('good.md')),
    wait: '.eg-inst[data-phase="running"]',
    focus: '.cf-bar .eg-bar-go',
    say: 'Scoring example.com against your contract.',
  },
  { id: 'rejected-one', lint: 'present', reply: RESP.prose, go: async (page) => fillAndRun(page, text('prose.md')), wait: '#cf-problems-h', focus: '#cf-problems-h', say: 'Run stopped: your contract was not accepted.', problems: 1 },
  { id: 'rejected-multi', lint: 'present', reply: RESP.multi, go: async (page) => fillAndRun(page, text('multi.md')), wait: '#cf-problems-h', focus: '#cf-problems-h', say: 'Run stopped: your contract was not accepted.', problems: 3 },
  { id: 'request-429', reply: RESP.tooMany, go: async (page) => fillAndRun(page, text('good.md')), wait: '.cf-notice', focus: '.cf-bar .eg-bar-go', alert: 'Too many runs' },
  { id: 'request-413', reply: RESP.tooLarge, go: async (page) => fillAndRun(page, text('good.md')), wait: '.cf-notice', focus: '.cf-bar .eg-bar-go', alert: 'Contract too large' },
  { id: 'request-network', reply: 'abort', go: async (page) => fillAndRun(page, text('good.md')), wait: '.cf-notice', focus: '.cf-bar .eg-bar-go', alert: 'Could not reach the scoring server' },
  { id: 'landed', lint: 'present', result: 'scored', sweep: true, reply: RESP.landed, go: async (page) => fillAndRun(page, text('good.md'), 'www.designesy.org'), wait: '.eg-inst[data-phase="done"]', focus: '.score-verdict-line', sayRe: /^Run finished in \d+\.\d s\.$/ },
  { id: 'unreachable', lint: 'present', result: 'unreachable', reply: RESP.unreachable, go: async (page) => fillAndRun(page, text('good.md'), 'unreachable.invalid'), wait: '.score-empty-run', focus: '.score-verdict-line', sayRe: /^Run stopped after \d+\.\d s\.$/ },
  // The three refusals where the DESIGN.md linter never read the file: the
  // provenance line must be absent (the record carries no totals).
  { id: 'rejected-format', lint: 'absent', reply: RESP.format, go: async (page) => fillAndRun(page, text('contracts/unknown.txt')), wait: '#cf-problems-h', focus: '#cf-problems-h', say: 'Run stopped: your contract was not accepted.', problems: 1 },
  { id: 'rejected-link', lint: 'absent', reply: RESP.link, go: async (page) => fillAndRun(page, 'https://contracts.studio.example.com/missing.md', 'studio.example.com', 'link'), wait: '#cf-problems-h', focus: '#cf-problems-h', say: 'Run stopped: your contract was not accepted.', problems: 1 },
  { id: 'rejected-dtcg', lint: 'absent', reply: RESP.dtcgRejected, go: async (page) => fillAndRun(page, text('contracts/two-colors.tokens.json')), wait: '#cf-problems-h', focus: '#cf-problems-h', say: 'Run stopped: your contract was not accepted.', problems: 1 },
  // Landed runs: every run whose DESIGN.md the linter read prints the line once; a DTCG run never does.
  { id: 'landed-pass', lint: 'present', result: 'scored', sweep: true, reply: RESP.pass, go: async (page) => fillAndRun(page, text('contracts/designesy-pass.md'), 'designesy.org'), wait: '.eg-inst[data-phase="done"]', focus: '.score-verdict-line', sayRe: /^Run finished in \d+\.\d s\.$/ },
  { id: 'landed-drift', lint: 'present', result: 'scored', sweep: true, reply: RESP.drift, go: async (page) => fillAndRun(page, text('contracts/designesy-drift.md'), 'designesy.org'), wait: '.eg-inst[data-phase="done"]', focus: '.score-verdict-line', sayRe: /^Run finished in \d+\.\d s\.$/ },
  { id: 'landed-capped', lint: 'present', result: 'scored', sweep: true, reply: RESP.capped, go: async (page) => fillAndRun(page, text('contracts/designesy-pair.md'), 'designesy.org'), wait: '.eg-inst[data-phase="done"]', focus: '.score-verdict-line', sayRe: /^Run finished in \d+\.\d s\.$/ },
  { id: 'landed-warn', lint: 'present', result: 'scored', sweep: true, reply: RESP.warn, go: async (page) => fillAndRun(page, text('contracts/studio-warn.md'), 'studio.example.com'), wait: '.eg-inst[data-phase="done"]', focus: '.score-verdict-line', sayRe: /^Run finished in \d+\.\d s\.$/ },
  { id: 'landed-one-fail', lint: 'present', result: 'scored', sweep: true, reply: RESP.oneFail, go: async (page) => fillAndRun(page, 'https://contracts.studio.example.com/DESIGN.md', 'studio.example.com/work', 'link'), wait: '.eg-inst[data-phase="done"]', focus: '.score-verdict-line', sayRe: /^Run finished in \d+\.\d s\.$/ },
  { id: 'landed-no-score', lint: 'absent', result: 'fidelity-null', sweep: true, reply: RESP.noScore, go: async (page) => fillAndRun(page, text('contracts/studio-sparse.tokens.json'), 'pamphlet.studio.example.com'), wait: '.eg-inst[data-phase="done"]', focus: '.score-verdict-line', sayRe: /^Run finished in \d+\.\d s\.$/ },
  // Empty runs (W8): no score for either number, the card's title takes focus.
  { id: 'landed-empty-shell', lint: 'present', result: 'empty', reply: RESP.shell, go: async (page) => fillAndRun(page, text('contracts/studio-warn.md'), 'app.studio.example.com'), wait: '.score-empty-run', focus: '#score-empty-run-title', sayRe: /^Run stopped after \d+\.\d s\.$/ },
  { id: 'landed-no-css', lint: 'present', result: 'empty', reply: RESP.noCss, go: async (page) => fillAndRun(page, text('contracts/studio-warn.md'), 'notes.studio.example.com'), wait: '.score-empty-run', focus: '#score-empty-run-title', sayRe: /^Run stopped after \d+\.\d s\.$/ },
  // The previous run: a landed result, then Edit inputs; then a new run held in flight above it.
  {
    id: 'previous-run',
    lint: 'present',
    previous: 'editing',
    reply: RESP.capped,
    go: async (page) => {
      await fillAndRun(page, text('contracts/designesy-pair.md'), 'designesy.org');
      await page.waitForSelector('.eg-inst[data-phase="done"]', { timeout: 15000 });
      await page.waitForTimeout(400);
      await page.click('.cf-run button:has-text("Edit inputs")');
    },
    wait: '.cf-prev',
    focus: '.cf-bar .eg-bar-line input',
    say: COPY.EDITING_WITH_PREVIOUS,
  },
  {
    id: 'previous-running',
    lint: 'present',
    previous: 'running',
    reply: [RESP.capped, 'hold'],
    go: async (page) => {
      await fillAndRun(page, text('contracts/designesy-pair.md'), 'designesy.org');
      await page.waitForSelector('.eg-inst[data-phase="done"]', { timeout: 15000 });
      await page.waitForTimeout(400);
      await page.click('.cf-run button:has-text("Edit inputs")');
      await page.waitForSelector('.cf-prev');
      await page.focus('.cf-bar .eg-bar-go');
      await page.keyboard.press('Enter');
    },
    wait: '.eg-inst[data-phase="running"]',
    focus: '.cf-bar .eg-bar-go',
    say: 'Scoring designesy.org against your contract.',
  },
];

const onlyStates = opt('--states', null);
const states = onlyStates ? STATES.filter((s) => onlyStates.split(',').includes(s.id)) : STATES;
const FAST_RUNS = !onlyStates || onlyStates.split(',').includes('fast-run');
const FAST_DELAYS = opt('--fast-delays', '0,100,314').split(',').map(Number);
const FAST_VIEWS = opt('--fast-views', '1920x1080,1440x900,1080x1080,390x844').split(',').map((v) => v.split('x').map(Number));
const FAST_MOTION = opt('--fast-motion', 'on,stray,reduce,paused').split(',');
const FAST_STARTS = opt('--fast-starts', '0,376').split(',').map(Number);
const FAST_REPEAT = Math.max(1, Number(opt('--fast-repeat', '5')) || 5);
const FAST_JOBS = Math.max(1, Number(opt('--fast-jobs', '4')) || 4);

/** 8. The result as drawn, against the recorded answer. */
async function checkResult(page, st, reply, fail) {
  const b = reply.body;
  const got = await page.evaluate(() => {
    const visible = (el) => (el ? [...el.childNodes].filter((n) => !(n.nodeType === 1 && n.classList.contains('sr-only'))).map((n) => n.textContent).join('').replace(/\s+/g, ' ').trim() : null);
    const bench = document.querySelector('.cf-bench');
    const v = bench.querySelector(':scope > .score-verdict-line');
    const lists = [...bench.querySelectorAll(':scope > .cf-list')].map((l) => ({
      rows: [...l.querySelectorAll('.eg-row')].map((r) => ({ id: r.querySelector('.eg-row-id').textContent, word: r.querySelector('.eg-row-status').textContent, status: r.dataset.status })),
      filters: [...l.querySelectorAll('.eg-section-head .eg-seg-opt')].map((o) => o.textContent),
    }));
    const inst = bench.querySelector(':scope > .eg-inst');
    const readouts = [...inst.querySelectorAll('.cf-readout')].map((r) => ({
      num: r.querySelector('.cf-num')?.textContent ?? null,
      grade: r.querySelector('.cf-grade') ? visible(r.querySelector('.cf-grade')) : null,
      nul: r.querySelector('.cf-null')?.textContent ?? null,
      count: r.querySelector('.cf-count')?.textContent ?? '',
      track: !!r.querySelector('.eg-scale-track'),
      ghost: !!r.querySelector('.cf-ghost'),
    }));
    const dds = [...bench.querySelectorAll('.cf-receipt > div')].map((d) => [d.querySelector('dt').textContent, d.querySelector('dd').textContent.replace(/\s+/g, ' ').trim()]);
    return {
      verdict: v ? visible(v) : null,
      prefix: v?.querySelector('.sr-only')?.textContent ?? null,
      lists,
      readouts,
      first: inst.querySelector('.cf-start .cf-start-title .cf-mono')?.textContent ?? null,
      specs: inst.querySelectorAll('.cf-start .cf-spec').length,
      f02: bench.querySelector('#cf-row-f02 .eg-row-detail')?.textContent ?? null,
      receipt: Object.fromEntries(dds),
      card: bench.querySelector('.score-empty-run-title')?.textContent ?? null,
      cardContract: bench.querySelector('.score-empty-run-contract')?.textContent ?? null,
      flags: [...inst.querySelectorAll('.cf-flag')].map((f) => f.textContent.replace(/\s+/g, ' ').trim()),
    };
  });
  const kind = st.result;
  // The verdict sentence and its hidden prefix.
  if (kind === 'empty') {
    if (got.verdict !== null) fail(`an empty run draws a verdict line ("${got.verdict}"); its card speaks instead`);
  } else {
    const want = expectVerdict(b);
    if (got.verdict !== want) fail(`verdict "${got.verdict}", the counts give "${want}"`);
    const pre = expectPrefix(b);
    if (pre !== null && got.prefix !== pre) fail(`verdict prefix "${got.prefix}", wanted "${pre}"`);
  }
  // The readouts: a score in one decimal with its grade, or "No score" with nothing else.
  const layers = [b.fidelity, b.baseline];
  got.readouts.forEach((r, i) => {
    const l = layers[i];
    const name = i ? 'baseline' : 'fidelity';
    const shows = l.score !== null && !b.unreachable && kind !== 'empty';
    if (shows) {
      if (r.num !== fmt(l.score)) fail(`${name} readout "${r.num}", wanted ${fmt(l.score)}`);
      if (r.grade !== l.grade) fail(`${name} grade "${r.grade}", wanted ${l.grade}`);
      if (r.count.replace(/\s+/g, ' ').trim() !== `${l.scored} of ${l.total} checks scored`) fail(`${name} count "${r.count}"`);
      if (!!r.ghost !== !!l.ceilingApplied) fail(`${name} ghost marker ${r.ghost ? 'drawn' : 'missing'} with ceilingApplied ${l.ceilingApplied}`);
    } else {
      if (r.nul !== 'No score') fail(`${name} has no score but reads "${r.nul}"`);
      if (r.num !== null || r.grade !== null || r.track) fail(`${name} has no score but shows ${r.num !== null ? 'a numeral' : r.grade !== null ? 'a grade' : 'a scale'}`);
      if (l.nullReason && l.nullReason.code === 'too_few_checks' && r.count.trim() !== `${l.scored} of ${l.total} checks scored; at least 3 are needed`) fail(`${name} no-score count "${r.count}"`);
    }
  });
  // The cap flag names the uncapped score.
  if (b.fidelity.ceilingApplied && !got.flags.some((f) => f.startsWith(`Capped at ${Math.round(b.fidelity.score)}.`) && f.includes(`Without the cap: ${fmt(b.fidelity.uncappedScore)}`))) fail(`no cap flag for a capped fidelity score: ${JSON.stringify(got.flags)}`);
  if (kind === 'empty' || kind === 'unreachable') {
    if (got.lists.length) fail(`${got.lists.length} check lists on a run that read nothing`);
    const want = kind === 'unreachable' ? 'Could not read this site' : b.fidelity.nullReason.code === 'empty_shell' ? 'This page builds itself in the browser' : 'This page has no styles the engine could read';
    if (got.card !== want) fail(`empty-run card "${got.card}", wanted "${want}"`);
    if (!got.cardContract || !got.cardContract.startsWith('Your contract was read and is valid:')) fail('the empty-run card does not say the contract was read and is valid');
    return;
  }
  // Both lists: every recorded check, its #267 word, and the four filters.
  const want = [b.checks.filter((c) => c.layer === 'fidelity'), b.checks.filter((c) => c.layer === 'baseline')];
  if (got.lists.length !== 2) fail(`${got.lists.length} check lists, wanted 2`);
  got.lists.forEach((l, i) => {
    const w = want[i];
    const ids = l.rows.map((r) => r.id).sort().join(',');
    if (ids !== w.map((c) => c.id).sort().join(',')) fail(`list ${i + 1} rows ${ids}, wanted ${w.map((c) => c.id).join(',')}`);
    for (const r of l.rows) {
      const c = w.find((x) => x.id === r.id);
      if (c && r.word !== WORD[c.status]) fail(`${r.id} reads "${r.word}", wanted "${WORD[c.status]}"`);
    }
    const n = (s) => w.filter((c) => s.includes(c.status)).length;
    const filters = [`All ${w.length}`, `Needs work ${n(['FAIL', 'WARN'])}`, `Not scored ${n(['SKIP', 'MANUAL'])}`, `Passed ${n(['PASS'])}`];
    if (l.filters.join('|') !== filters.join('|')) fail(`list ${i + 1} filters ${l.filters.join(' | ')}, wanted ${filters.join(' | ')}`);
  });
  // f02's line is built on the page from the counts; it must equal the engine's own.
  const f02 = b.checks.find((c) => c.id === 'f02');
  if (f02 && ['PASS', 'WARN', 'FAIL'].includes(f02.status)) {
    // Built from the counts: colors compared, those listed outside, those cut from the list.
    const shippedN = b.coverage.groups.colors.shippedCompared;
    const outside = (f02.shipped || []).map((s) => s.value);
    const cut = (f02.evidence && f02.evidence.truncated) || 0;
    const inside = shippedN - outside.length - cut;
    const head = `${inside} of ${shippedN} shipped colors ${inside === 1 ? 'is' : 'are'} in your palette (90% needed to pass).`;
    const wantF02 = (outside.length ? `${head} Outside it: ${outside.join(', ')}` : head) + (cut ? ` and ${cut} more` : '');
    if (got.f02 !== wantF02) fail(`f02 line "${got.f02}", the counts give "${wantF02}"`);
    // Where the engine listed every outside colour, its own sentence is the same one.
    if (!cut && got.f02 !== f02.detail) fail(`f02 line "${got.f02}", the engine wrote "${f02.detail}"`);
  }
  // The first finding.
  const fid = want[0];
  const lead = fid.find((c) => c.status === 'FAIL') || fid.find((c) => c.status === 'WARN');
  if (kind === 'scored' && (got.first || null) !== (lead ? lead.id : null)) fail(`first finding ${got.first}, wanted ${lead ? lead.id : 'none'}`);
  if (lead && (lead.id === 'f09' || lead.id === 'f10') && kind === 'scored' && got.specs !== 2) fail(`the ${lead.id} first finding draws ${got.specs} specimens, wanted declared and shipped`);
  // The receipt: recorded digests in groups of 8, versions of this checkout.
  const rc = got.receipt;
  if (b.receipt.digest && !(rc['Verdict digest'] || '').startsWith(groups8(b.receipt.digest))) fail('the verdict digest is not the recorded one in 8-character groups');
  if (!(rc['Your contract'] || '').startsWith(groups8(b.ownContract.digest))) fail('the contract digest is not the recorded one in 8-character groups');
  if (b.engineVersion !== ENGINE_VERSION || b.contractVersion !== CONTRACT_VERSION) fail(`the record was made at ${b.engineVersion}/${b.contractVersion}, this checkout is ${ENGINE_VERSION}/${CONTRACT_VERSION}`);
  if (rc.Engine !== `${ENGINE_VERSION} · baseline rules ${CONTRACT_VERSION}`) fail(`receipt engine row "${rc.Engine}", wanted "${ENGINE_VERSION} · baseline rules ${CONTRACT_VERSION}"`);
}

/** 9. "Go to this check" is the second Tab stop after the verdict; Enter opens its row clear of the bar. */
async function checkGoTo(page, reply, fail) {
  const b = reply.body;
  const fid = b.checks.filter((c) => c.layer === 'fidelity');
  const lead = fid.find((c) => c.status === 'FAIL') || fid.find((c) => c.status === 'WARN');
  if (!lead) return;
  await page.focus('.cf-bench > .score-verdict-line');
  await page.keyboard.press('Tab');
  await page.keyboard.press('Tab');
  const second = await page.evaluate(() => document.activeElement?.textContent?.trim() ?? '');
  if (second !== 'Go to this check') fail(`the second Tab stop after the verdict is "${second.slice(0, 40)}", wanted "Go to this check"`);
  if (second !== 'Go to this check') return;
  await page.keyboard.press('Enter');
  await page.waitForTimeout(500);
  const at = await page.evaluate(() => {
    const a = document.activeElement;
    const bar = document.querySelector('.topbar, header');
    return { id: a?.id ?? '', open: a?.getAttribute('aria-expanded'), top: a?.getBoundingClientRect().top ?? -1, bar: bar ? bar.getBoundingClientRect().bottom : 0 };
  });
  if (at.id !== `cf-row-${lead.id}`) fail(`"Go to this check" focused ${at.id || 'nothing'}, wanted cf-row-${lead.id}`);
  else if (at.open !== 'true') fail(`"Go to this check" left ${lead.id} closed`);
  else if (at.top < at.bar) fail(`"Go to this check" left ${lead.id} under the top bar (${Math.round(at.top)} < ${Math.round(at.bar)})`);
}

/** 11. The previous run below the reopened form. */
async function checkPrevious(page, st, fail) {
  const got = await page.evaluate(() => {
    const ids = [...document.querySelectorAll('[id]')].map((e) => e.id);
    const dup = [...new Set(ids.filter((x, i) => ids.indexOf(x) !== i))];
    const prev = document.querySelector('.cf-bench > .cf-prev');
    return {
      dup,
      label: prev?.querySelector('.cf-prev-label')?.textContent ?? null,
      said: prev?.querySelector('.score-verdict-line > .sr-only')?.textContent ?? null,
      lists: prev ? prev.querySelectorAll('.cf-list').length : 0,
      live: [...document.querySelectorAll('.cf-bench > .eg-inst')].map((e) => e.dataset.phase),
      skeleton: !!document.querySelector('.cf-skeleton'),
      liveBeforePrev: (() => { const i = document.querySelector('.cf-bench > .eg-inst'); return !!(i && prev && i.compareDocumentPosition(prev) & Node.DOCUMENT_POSITION_FOLLOWING); })(),
    };
  });
  if (got.dup.length) fail(`duplicate ids with a previous run kept: ${got.dup.slice(0, 5).join(', ')}`);
  if (got.label !== 'Previous run') fail(`the kept run is labelled "${got.label}"`);
  if (got.said !== 'Previous run. ') fail('the kept verdict does not say it is the previous run');
  if (got.lists !== 2) fail(`the previous run keeps ${got.lists} lists, wanted 2`);
  if (st.previous === 'running') {
    if (got.live.join(',') !== 'running') fail(`live instruments ${got.live.join(',') || 'none'}, wanted one running`);
    if (!got.liveBeforePrev) fail('the running instrument is not above the previous run');
    if (got.skeleton) fail('a skeleton stands in for lists the previous run already shows');
  }
}

/** 10. The readout sweep (D79, R33-01): every width 320 to 1600 every 8px. */
/** D81: one numeral size per width, whatever the digits: filled by every sweep, checked once at the end. */
const sizes = new Map();

async function sweepReadouts(page, fail) {
  let readouts = 0;
  let bad = 0;
  const modes = {};
  const seen = new Set();
  for (let W = 320; W <= 1600; W += 8) {
    await page.setViewportSize({ width: W, height: 900 });
    // The pair re-measures its numerals after a resize (ReadoutPair): let React commit first.
    await page.waitForTimeout(60);
    const m = await page.evaluate(() => new Promise((res) => requestAnimationFrame(() => requestAnimationFrame(() => {
      const out = [];
      for (const pair of document.querySelectorAll('.cf-bench > .eg-inst .cf-pair')) {
        const pr = pair.getBoundingClientRect();
        const fit = pair.dataset.fit || '';
        const gap = parseFloat(getComputedStyle(pair).columnGap) || 0;
        const nums = [...pair.querySelectorAll('.cf-num')].filter((n) => n.textContent).map((n) => n.getBoundingClientRect().width);
        const maxNum = nums.length ? Math.max(...nums) : 0;
        const root = getComputedStyle(document.documentElement);
        const tok = root.getPropertyValue('--space-8').trim();
        const figGap = tok.endsWith('rem') ? parseFloat(tok) * parseFloat(root.fontSize) : parseFloat(tok) || 0;
        const chip = Math.max(0, ...[...pair.querySelectorAll('.cf-grade, .cf-of')].map((g) => g.getBoundingClientRect().width));
        const reads = [...pair.querySelectorAll(':scope > .cf-readout')].map((x) => x.getBoundingClientRect());
        for (const r of pair.querySelectorAll(':scope > .cf-readout')) {
          const rr = r.getBoundingClientRect();
          const cs = getComputedStyle(r);
          const colL = rr.left + parseFloat(cs.paddingLeft);
          const colR = rr.right - parseFloat(cs.paddingRight);
          const parts = [...r.querySelectorAll('.cf-readout-label, .cf-num, .cf-of, .cf-grade, .cf-null, .cf-readout-line, .cf-count, .eg-scale')].filter((e) => e.getBoundingClientRect().width > 0);
          const spill = parts.map((e) => ({ c: e.className.split(' ')[0], l: e.getBoundingClientRect().left, r: e.getBoundingClientRect().right })).filter((p) => p.r > colR + 0.5 || p.l < colL - 0.5 || p.r > pr.right + 0.5);
          const label = r.querySelector('.cf-readout-label');
          const lcs = getComputedStyle(label);
          const range = document.createRange();
          range.selectNodeContents(label);
          const tops = [...new Set([...range.getClientRects()].map((q) => Math.round(q.top)))];
          const lineWords = tops.map((tp) => [...range.getClientRects()].filter((q) => Math.round(q.top) === tp).reduce((a, q) => a + q.width, 0));
          const num = r.querySelector('.cf-num');
          const grade = r.querySelector('.cf-grade');
          out.push({
            label: label.textContent,
            pairW: pr.width,
            fit,
            sideColumn: (pr.width - gap) / 2 - gap,
            maxNum,
            figGap,
            chip,
            stacked: reads.length === 2 && reads[1].top >= reads[0].bottom - 1,
            spill,
            labelLines: tops.length,
            lineWidths: lineWords,
            labelSize: parseFloat(lcs.fontSize),
            labelTrack: parseFloat(lcs.letterSpacing) / parseFloat(lcs.fontSize),
            balance: lcs.textWrapStyle || lcs.textWrap,
            numSize: num && num.textContent ? parseFloat(getComputedStyle(num).fontSize) : null,
            num: num && num.textContent ? num.getBoundingClientRect().toJSON() : null,
            grade: grade ? grade.getBoundingClientRect().toJSON() : null,
            of: r.querySelector('.cf-of') ? r.querySelector('.cf-of').getBoundingClientRect().toJSON() : null,
          });
        }
      }
      res(out);
    }))));
    for (const r of m) {
      readouts++;
      const mode = r.fit || (r.pairW < 416 - 0.5 ? 'row' : 'beside');
      modes[mode] = (modes[mode] || 0) + 1;
      const errs = [];
      if (r.spill.length) errs.push(`${r.spill.map((p) => p.c).join(', ')} past the column`);
      const narrow = r.pairW < 416 - 0.5;
      const row = narrow || r.fit === 'row';
      // The row from 26rem must be needed: only where numeral, gap and chip do not fit beside.
      // D8, D81: the two readouts never stack, and the numeral always fits its column.
      if (r.stacked || r.fit === 'stack') errs.push('the readouts stack');
      if (r.maxNum > r.sideColumn + 0.5) errs.push(`a numeral (${r.maxNum.toFixed(1)}px) wider than its column (${r.sideColumn.toFixed(1)}px)`);
      if (r.fit === 'row' && (narrow || !(r.maxNum + r.figGap + r.chip > r.sideColumn + 0.5))) errs.push('row forced where the chip fits beside');
      if (r.num && r.grade) {
        if (row && !(r.grade.top >= r.num.bottom - 4)) errs.push('chip beside the numeral where the row is due');
        if (row && r.of && Math.abs((r.of.top + r.of.bottom) / 2 - (r.grade.top + r.grade.bottom) / 2) > 6) errs.push('"/100" and the chip not in one row');
        if (!row && !(r.grade.left >= r.num.right - 0.5)) errs.push('chip under the numeral from a 26rem pair');
      }
      if (r.numSize !== null) {
        // D79 with D81: the house clamp, or the size at which "100.0" fits its column, whichever is smaller.
        const want = Math.min(68, Math.max(24, Math.min(25.6 + 0.09 * r.pairW, 0.18519 * r.pairW - 8.889)));
        if (Math.abs(r.numSize - want) > 0.6) errs.push(`numeral ${r.numSize.toFixed(1)}px, D79 with D81 gives ${want.toFixed(1)}px`);
        sizes.set(W, (sizes.get(W) || new Set()).add(r.numSize.toFixed(2)));
      }
      if (r.labelSize < 12.75) errs.push(`label at ${r.labelSize}px`);
      const track = narrow ? 0.02 : 0.08;
      if (Math.abs(r.labelTrack - track) > 0.002) errs.push(`label tracked ${r.labelTrack.toFixed(3)}em, wanted ${track}em`);
      if (!/balance/.test(r.balance || '')) errs.push(`label wraps "${r.balance}", not balance`);
      // A-RS-4: one line at 390, 414, 1024 and 1440; two lines, one word each, at
      // 375 and narrower; never more than two anywhere.
      if (r.label === 'Contract fidelity') {
        if ([390, 414, 1024, 1440].includes(W) && r.labelLines !== 1) errs.push(`"CONTRACT FIDELITY" on ${r.labelLines} lines at ${W}px`);
        if (W <= 375 && r.labelLines !== 2) errs.push(`"CONTRACT FIDELITY" on ${r.labelLines} lines at ${W}px, wanted 2`);
        if (r.labelLines > 2) errs.push(`"CONTRACT FIDELITY" on ${r.labelLines} lines`);
      }
      if (errs.length) {
        bad++;
        const key = `${r.label}: ${errs[0].replace(/[\d.]+px/g, 'Npx')}`;
        if (!seen.has(key)) {
          seen.add(key);
          fail(`readout sweep at ${W}px (${r.label}, pair ${r.pairW.toFixed(1)}px): ${errs.join('; ')}`);
        }
      }
    }
  }
  return { readouts, bad, modes };
}

/** 13. A fast run lands while the page is still scrolling toward the
    instrument; once it settles, the verdict and both readouts are on screen.
    The landing races the scroll, so one pass proves little: each case runs
    FAST_REPEAT times in a fresh context and must pass every time. */
async function fastRunOnce(browser, w, h, motion, delay, start) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, colorScheme: 'dark', reducedMotion: motion === 'reduce' ? 'reduce' : 'no-preference' });
  if (motion === 'paused') {
    await ctx.addInitScript(() => {
      try { localStorage.setItem('motion', 'paused'); } catch {}
    });
  }
  // "stray": motion on, and a scrollend from some other scroll (a reset, a
  // wheel turn just before the run) reaches the page 16 ms after the run's
  // smooth scroll starts. That event says nothing about the run's scroll, so
  // the result must land in view all the same. It pins down the interleaving
  // that real timing only hits now and then.
  if (motion === 'stray') {
    await ctx.addInitScript(() => {
      const scrollTo = window.scrollTo.bind(window);
      let sent = false;
      window.scrollTo = (...a) => {
        scrollTo(...a);
        if (!sent && a[0] && typeof a[0] === 'object' && a[0].behavior === 'smooth') {
          sent = true;
          setTimeout(() => document.dispatchEvent(new Event('scrollend')), 16);
        }
      };
    });
  }
  await ctx.route('**/api/score', async (route) => {
    if (delay) await new Promise((r) => setTimeout(r, delay));
    return route.fulfill({ status: RESP.warn.status, contentType: 'application/json', body: JSON.stringify(RESP.warn.body) });
  });
  await ctx.route(/\/_vercel\//, (route) => route.fulfill({ status: 204, body: '' }));
  const page = await ctx.newPage();
  const problems = [];
  let p = null;
  try {
    await page.goto(`${BASE}/score/contract`, { waitUntil: 'load', timeout: 60000 });
    await page.evaluate(() => document.fonts.ready);
    await page.waitForTimeout(300);
    await page.fill('.cf-bar .eg-bar-line input', 'studio.example.com');
    await page.fill('.cf-bar textarea.m3-textarea', text('contracts/studio-warn.md'));
    await page.waitForTimeout(250);
    // Start from a set scroll (the top, or part-way down) with the key
    // focused, as a visitor who filled the form and pressed Enter there.
    await page.evaluate((y) => {
      document.querySelector('.cf-bar .eg-bar-go').focus({ preventScroll: true });
      window.scrollTo({ top: y, behavior: 'instant' });
    }, start);
    await page.waitForTimeout(100);
    await page.keyboard.press('Enter');
    await page.waitForSelector('.cf-bench .score-verdict-line', { timeout: 15000 });
    await page.waitForTimeout(1500);
    p = await page.evaluate(async () => {
      const y0 = window.scrollY;
      await new Promise((r) => setTimeout(r, 200));
      const clear = parseFloat(getComputedStyle(document.documentElement).scrollPaddingTop) || 0;
      const box = (el) => { const r = el.getBoundingClientRect(); return { top: Math.round(r.top), bottom: Math.round(r.bottom) }; };
      const v = document.querySelector('.cf-bench .score-verdict-line');
      const a = document.activeElement;
      return {
        moving: Math.abs(window.scrollY - y0) > 1,
        y: Math.round(window.scrollY),
        vh: window.innerHeight,
        clear: Math.round(clear),
        verdict: box(v),
        readouts: [...document.querySelectorAll('.cf-bench .cf-readout')].map(box),
        focused: a === v,
        focus: a === document.body ? 'body' : `${a.tagName.toLowerCase()}.${String(a.className).trim().split(/\s+/).join('.')}`,
        paused: document.documentElement.dataset.motion === 'paused',
      };
    });
    if (motion === 'paused' && !p.paused) problems.push('the site motion pause did not apply (html[data-motion] is not "paused")');
    if (p.moving) problems.push(`the page is still scrolling 1.5 s after the landing (scrollY ${p.y})`);
    if (p.verdict.top < p.clear - 1 || p.verdict.bottom > p.vh) problems.push(`the verdict line ends at ${p.verdict.top}..${p.verdict.bottom}px at scrollY ${p.y}, outside ${p.clear}..${p.vh}px (under the bar and inside the viewport)`);
    if (p.readouts.length !== 2) problems.push(`${p.readouts.length} readouts, wanted 2`);
    else if (p.readouts.some((r) => r.top < 0 || r.bottom > p.vh)) problems.push(`a readout ends outside the viewport: ${p.readouts.map((r) => `${r.top}..${r.bottom}`).join(', ')}px of ${p.vh}`);
    if (!p.focused) problems.push(`focus is on ${p.focus}, wanted the verdict line`);
  } catch (e) {
    problems.push(e.message.split('\n')[0]);
  }
  await ctx.close();
  return { problems, y: p ? p.y : null };
}

async function checkFastRuns(browser, failures) {
  const cases = [];
  for (const [w, h] of FAST_VIEWS) for (const start of FAST_STARTS) for (const motion of FAST_MOTION) for (const delay of FAST_DELAYS) {
    cases.push({ w, h, start, motion, delay, tag: `fast-run ${w}x${h} from ${start} motion ${motion} ${delay}ms`, ends: [], passed: 0 });
  }
  // Every repetition is its own page in its own context; a few run at once,
  // which also adds the load under which the race used to show.
  const jobs = [];
  for (const c of cases) for (let r = 1; r <= FAST_REPEAT; r++) jobs.push({ c, r });
  let next = 0;
  const worker = async () => {
    while (next < jobs.length) {
      const { c, r } = jobs[next++];
      const { problems, y } = await fastRunOnce(browser, c.w, c.h, c.motion, c.delay, c.start);
      c.ends[r - 1] = y === null ? '?' : y;
      if (problems.length) for (const m of problems) failures.push(`${c.tag} (run ${r} of ${FAST_REPEAT}): ${m}`);
      else c.passed++;
    }
  };
  await Promise.all(Array.from({ length: FAST_JOBS }, worker));
  for (const c of cases) console.log(`  ${c.passed === FAST_REPEAT ? 'ok  ' : 'FAIL'}  ${c.tag}: ${c.passed}/${FAST_REPEAT} (end scrollY ${c.ends.join(', ')})`);
  return jobs.length;
}

async function main() {
  let chromium;
  try {
    ({ chromium } = require('playwright-core'));
  } catch {
    console.error('[contract-page] playwright-core not installed');
    process.exit(2);
  }
  const axe = fs.readFileSync(require.resolve('axe-core/axe.min.js'), 'utf8');
  let browser;
  try {
    browser = await chromium.launch({ channel: CHANNEL, headless: true });
  } catch (e) {
    console.error(`[contract-page] cannot launch ${CHANNEL}: ${e.message}`);
    process.exit(2);
  }

  // 2a. The live region is in the server's HTML: present from first paint.
  const failures = [];
  const html = await (await fetch(`${BASE}/score/contract`)).text();
  const liveInHtml = /<p class="sr-only" role="status" aria-live="polite">/.test(html);
  if (!liveInHtml || BREAK.includes('live')) failures.push('server HTML: the page live region is missing from first paint');

  let runs = 0;
  const sweeps = { readouts: 0, bad: 0, modes: {} };
  for (const theme of THEMES) for (const w of WIDTHS) for (const st of states) {
    runs++;
    const tag = `${st.id} ${theme} ${w}`;
    const ctx = await browser.newContext({ viewport: { width: w, height: w <= 390 ? 844 : 900 }, deviceScaleFactor: SHOTS ? 2 : 1, colorScheme: theme, reducedMotion: 'reduce' });
    let posts = 0;
    await ctx.route('**/api/score', async (route) => {
      posts++;
      const reply = Array.isArray(st.reply) ? st.reply[Math.min(posts, st.reply.length) - 1] : st.reply;
      if (reply === 'hold') return; // never answered: the run stays in flight
      if (reply === 'abort') return route.abort('failed');
      let r = reply;
      // --break totals: the page is served totals that differ from the record it is checked against.
      if (BREAK.includes('totals') && r.body) {
        r = JSON.parse(JSON.stringify(r));
        if (r.body.linter) r.body.linter.errors += 1;
        if (r.body.ownContract && r.body.ownContract.linter) r.body.ownContract.linter.errors += 1;
      }
      // --break phantom: totals the linter never produced, in an answer where it never ran.
      if (BREAK.includes('phantom') && st.lint === 'absent' && r.body) {
        r = JSON.parse(JSON.stringify(r));
        const fake = { package: '@google/design.md', version: '0.4.0', errors: 0, warnings: 0, infos: 0 };
        if (r.body.ownContract) r.body.ownContract.linter = fake;
        else r.body.linter = fake;
      }
      return route.fulfill({ status: r.status, contentType: 'application/json', headers: r.retryAfter ? { 'Retry-After': String(r.retryAfter) } : {}, body: JSON.stringify(r.body) });
    });
    // No other write leaves the page.
    await ctx.route(/\/_vercel\//, (route) => route.fulfill({ status: 204, body: '' }));
    const page = await ctx.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    try {
      await page.goto(`${BASE}/score/contract`, { waitUntil: 'load', timeout: 60000 });
      await page.evaluate(() => document.fonts.ready);
      await page.waitForTimeout(300);
      await st.go(page);
      if (st.wait) await page.waitForSelector(st.wait, { timeout: 15000 });
      await page.waitForTimeout(700);
      if (BREAK.includes('live')) await page.evaluate(() => document.querySelector('.cf-bench > p[role="status"]')?.remove());
      if (BREAK.includes('focus')) await page.evaluate(() => document.activeElement?.blur?.());
      if (BREAK.includes('lint')) await page.evaluate(() => document.querySelectorAll('.cf-lint').forEach((e) => e.remove()));
      if (BREAK.includes('ring')) await page.addStyleTag({ content: '.cf-problems-head .eg-h2[tabindex="-1"]:focus { outline: 2px solid var(--signal-access); }' });
      if (BREAK.includes('verdict')) await page.evaluate(() => { const s = document.querySelector('.cf-bench > .score-verdict-line > span:last-child'); if (s) s.textContent = 'The page follows most of your contract.'; });
      if (BREAK.includes('cap')) await page.addStyleTag({ content: '.cf-num { font-size: 2.25rem !important; }' });
      if (BREAK.includes('row')) await page.addStyleTag({ content: '.cf-figure-meta { display: contents !important; } .cf-figure:not(.is-rest) { grid-template-columns: auto auto !important; } .cf-figure:not(.is-rest) > .cf-num { grid-row: 1 / span 2 !important; } .cf-figure .cf-grade { grid-column: 2 !important; grid-row: 1 !important; } .cf-figure .cf-of { grid-column: 2 !important; grid-row: 2 !important; }' });
      if (BREAK.includes('review')) await page.evaluate(() => { const r = document.querySelector('.cf-review'); if (r) r.remove(); else document.querySelector('.cf-bench').insertAdjacentHTML('beforeend', '<p class="cf-aside cf-review">Want a person to walk your team through this? <a href="/pricing/review">The Review →</a></p>'); });
      if (BREAK.includes('stack')) await page.addStyleTag({ content: '.cf-pair { grid-template-columns: minmax(0, 1fr) !important; grid-template-rows: repeat(10, auto) !important; }' });
      if (BREAK.includes('digits') && st.id === 'landed-pass') await page.addStyleTag({ content: '.cf-num { font-size: calc(1px + clamp(1.5rem, min(1.6rem + 9cqi, 18.519cqi - 0.556rem), 4.25rem)) !important; }' });
      if (BREAK.includes('tracking')) await page.addStyleTag({ content: '.cf-readout-label { letter-spacing: 0.08em !important; }' });
      if (BREAK.includes('balance')) await page.addStyleTag({ content: '.cf-readout-label { text-wrap: wrap !important; }' });

      const probe = await page.evaluate(() => {
        const live = document.querySelector('.cf-bench > p[role="status"][aria-live="polite"]');
        const a = document.activeElement;
        const small = [];
        const walker = document.createTreeWalker(document.querySelector('main'), NodeFilter.SHOW_TEXT);
        for (let n = walker.nextNode(); n; n = walker.nextNode()) {
          const el = n.parentElement;
          if (!el || !n.textContent.trim()) continue;
          if (el.closest('.sr-only, [role="img"], [aria-hidden="true"], [hidden]')) continue;
          const r = el.getBoundingClientRect();
          if (!r.width || !r.height) continue;
          const fs = parseFloat(getComputedStyle(el).fontSize);
          if (fs < 12.75) small.push(`${el.tagName.toLowerCase()}.${String(el.className).split(' ')[0]} ${fs}px "${n.textContent.trim().slice(0, 30)}"`);
        }
        return {
          live: live ? live.textContent : null,
          lives: document.querySelectorAll('.cf-bench [aria-live="polite"]').length,
          activeDesc: a ? `${a.tagName.toLowerCase()}${a.id ? '#' + a.id : ''}.${String(a.className).split(' ')[0]}` : 'none',
          alerts: [...document.querySelectorAll('[role="alert"]')].map((e) => e.textContent.trim()),
          problems: document.querySelectorAll('.cf-problem-list > li').length,
          lint: [...document.querySelectorAll('.cf-lint')].map((e) => e.textContent.replace(/\s+/g, ' ').trim()),
          review: [...document.querySelectorAll('.cf-review')].map((e) => ({ text: e.textContent.replace(/\s+/g, ' ').trim(), href: e.querySelector('a')?.getAttribute('href') })),
          lintWords: (() => { const m = /Linted with[^.]*\./.exec(document.querySelector('main').textContent.replace(/\s+/g, ' ')); return m ? m[0] : ''; })(),
          // Engine sentences are shown whole: no row ends a word on an ellipsis.
          clipped: [...document.querySelectorAll('.cf-problem-list p, .cf-warnings li')].map((e) => e.textContent).filter((t) => t.includes('…')),
          // The result heading takes focus for screen readers but is no control: it paints no ring.
          headingRing: (() => {
            const hd = document.getElementById('cf-problems-h');
            if (!hd || document.activeElement !== hd) return null;
            const cs = getComputedStyle(hd);
            return cs.outlineStyle !== 'none' && parseFloat(cs.outlineWidth) > 0 ? `${cs.outlineStyle} ${cs.outlineWidth}` : cs.boxShadow !== 'none' ? cs.boxShadow : '';
          })(),
          small: small.slice(0, 5),
          overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
        };
      });
      const focusOk = st.focus ? await page.evaluate((sel) => !!document.activeElement && document.activeElement !== document.body && document.activeElement.matches(sel), st.focus) : true;
      await page.addScriptTag({ content: axe });
      const viol = await page.evaluate(async (tags) => {
        const r = await window.axe.run(document, { runOnly: { type: 'tag', values: tags } });
        return r.violations.map((v) => `${v.id} (${v.nodes.length}): ${v.nodes[0]?.target?.join(' ')}`);
      }, AXE_TAGS);

      const fail = (m) => failures.push(`${tag}: ${m}`);
      if (probe.live === null) fail('the page live region is gone');
      if (st.say !== undefined && st.say && probe.live !== st.say) fail(`announced "${probe.live}", wanted "${st.say}"`);
      if (st.sayRe && !st.sayRe.test(probe.live || '')) fail(`announced "${probe.live}", wanted ${st.sayRe}`);
      if (!focusOk) fail(`focus is on ${probe.activeDesc}, wanted ${st.focus}`);
      if (st.alert && (probe.alerts.length !== 1 || !probe.alerts[0].startsWith(st.alert))) fail(`alerts ${JSON.stringify(probe.alerts)}, wanted one starting "${st.alert}"`);
      if (!st.alert && probe.alerts.length) fail(`unexpected alert ${JSON.stringify(probe.alerts)}`);
      if (st.problems !== undefined && probe.problems !== st.problems) fail(`${probe.problems} problems listed, wanted ${st.problems}`);
      if (st.lint === 'present') {
        const want = provenance(Array.isArray(st.reply) ? st.reply[0] : st.reply);
        if (!want) fail('the recorded answer has no linter totals to cite');
        else if (probe.lint.length !== 1) fail(`${probe.lint.length} provenance lines, wanted 1: "${want}"`);
        else if (probe.lint[0] !== want) fail(`provenance line "${probe.lint[0]}", wanted the linter's own totals "${want}"`);
      } else if (st.lint === 'absent') {
        // The linter never read this file: no line, and no "Linted with" words anywhere in main.
        if (provenance(Array.isArray(st.reply) ? st.reply[0] : st.reply)) fail('the recorded answer carries linter totals, but the linter never reads this state');
        if (probe.lint.length || probe.lintWords) fail(`a provenance line where the linter never read the file: "${probe.lint[0] || probe.lintWords}"`);
      }
      // D82: the Review line under a landed result that scored, exactly once; nowhere else.
      const reviewDue = st.result === 'scored' && !st.previous;
      if (reviewDue && (probe.review.length !== 1 || probe.review[0].text !== 'Want a person to walk your team through this? The Review →' || probe.review[0].href !== '/pricing/review')) fail(`Review line ${JSON.stringify(probe.review)}, wanted it once, linking /pricing/review`);
      if (!reviewDue && probe.review.length) fail(`a Review line on a state that must not carry one: ${probe.review[0].text}`);
      if (probe.clipped.length) fail(`a problem or warning is cut short: ${probe.clipped[0].slice(0, 90)}`);
      if (probe.headingRing) fail(`the focused result heading paints a ring (${probe.headingRing}); it is not a control`);
      if (probe.small.length) fail(`text under 12.8px: ${probe.small.join('; ')}`);
      if (probe.overflow > 0) fail(`document overflows sideways by ${probe.overflow}px`);
      if (viol.length) fail(`axe: ${viol.join(' | ')}`);
      if (errors.length) fail(`page errors: ${errors.join(' | ')}`);
      if (st.reply === null && posts) fail(`${posts} request(s) to /api/score from a state that must send none`);
      if (st.result) await checkResult(page, st, Array.isArray(st.reply) ? st.reply[0] : st.reply, fail);
      if (st.previous) await checkPrevious(page, st, fail);
      if (SHOTS) {
        fs.mkdirSync(SHOTS, { recursive: true });
        await page.screenshot({ path: path.join(SHOTS, `${st.id}-${w}-${theme}.png`), fullPage: true, animations: 'disabled', caret: 'hide' });
      }
      if (st.result === 'scored' && w === WIDTHS[0]) await checkGoTo(page, st.reply, fail);
      if (st.sweep && w === WIDTHS[0]) {
        const n = await sweepReadouts(page, fail);
        sweeps.readouts += n.readouts;
        sweeps.bad += n.bad;
        for (const [k, v] of Object.entries(n.modes)) sweeps.modes[k] = (sweeps.modes[k] || 0) + v;
      }
      console.log(`  ${failures.some((f) => f.startsWith(tag + ':')) ? 'FAIL' : 'ok  '}  ${tag}`);
    } catch (e) {
      failures.push(`${tag}: ${e.message.split('\n')[0]}`);
      console.log(`  FAIL  ${tag}`);
    }
    await ctx.close();
  }
  if (FAST_RUNS) runs += await checkFastRuns(browser, failures);
  await browser.close();
  for (const [W, set] of sizes) if (set.size > 1) failures.push(`readout sweep at ${W}px: numerals at ${[...set].join(', ')}px; D81 sets one size per width for every score`);
  if (failures.length) {
    if (sweeps.readouts) console.error(`[contract-page] readout sweep: ${sweeps.readouts} readouts from 320 to 1600px, ${sweeps.bad} past their column or off the D79 rules; placement ${JSON.stringify(sweeps.modes)}`);
    console.error(`[contract-page] FAIL: ${failures.length} finding(s) over ${runs} state renders${BREAK.length ? ` (--break ${BREAK.join(',')})` : ''}`);
    for (const f of failures) console.error(`  - ${f}`);
    process.exit(1);
  }
  if (sweeps.readouts) console.log(`[contract-page] readout sweep: ${sweeps.readouts} readouts from 320 to 1600px, ${sweeps.bad} past their column or off the D79 rules; placement ${JSON.stringify(sweeps.modes)}`);
  console.log(`[contract-page] OK: ${runs} state renders; axe 0, one live region from first paint, focus per state, no text under 12.8px, no sideways overflow, verdicts from the counts, readouts, lists and receipts from the record${FAST_RUNS ? `, fast runs (${FAST_DELAYS.join(', ')} ms, from ${FAST_STARTS.join(' and ')}, each ${FAST_REPEAT}x) end with the verdict and both readouts on screen` : ''}`);
}

main().catch((e) => {
  console.error(`[contract-page] fatal: ${e.stack || e.message}`);
  process.exit(2);
});
