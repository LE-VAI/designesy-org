#!/usr/bin/env node
/**
 * Contract page gate: /score/contract renders every state of its first part
 * from recorded engine responses, each accessible, announced and focused as
 * the handoff specifies.
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
 *      rejected run lists every problem the engine returned.
 *   5. No text on the page under 12.8px (brand D68), sr-only text and
 *      role="img" drawings aside.
 *   6. No horizontal overflow of the document.
 *
 * PROVING IT CAN FAIL
 *   --break live    removes the live region before the checks (2 fails)
 *   --break focus   sends focus to <body> after each state (3 fails)
 *   --break         both. Each must exit 1.
 *
 * Usage:
 *   node scripts/check-contract-page.js --base http://127.0.0.1:3422 [--channel chrome]
 *   ... --themes dark --widths 1440 --states rejected-multi
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

const RESP = {
  prose: fixture('rejected-prose.json'),
  multi: fixture('rejected-multi.json'),
  landed: fixture('landed.json'),
  unreachable: fixture('unreachable.json'),
  tooMany: { status: 429, retryAfter: '42', body: { ok: false, error: 'Too many contract runs. Try again in a minute.', code: 'rate_limited' } },
  tooLarge: { status: 413, body: { ok: false, error: 'This contract is 300 KB. Scoring reads contracts up to 256 KB. Remove unused tokens or score part of it.', code: 'contract_too_large' } },
};

/** Fill the slab and press the run key. */
async function fillAndRun(page, contract, site = 'example.com') {
  await page.fill('.cf-bar .eg-bar-line input', site);
  await page.fill('.cf-bar textarea.m3-textarea', contract);
  await page.waitForTimeout(250);
  await page.focus('.cf-bar .eg-bar-go');
  await page.keyboard.press('Enter');
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
  { id: 'rejected-one', reply: RESP.prose, go: async (page) => fillAndRun(page, text('prose.md')), wait: '#cf-problems-h', focus: '#cf-problems-h', say: 'Run stopped: your contract was not accepted.', problems: 1 },
  { id: 'rejected-multi', reply: RESP.multi, go: async (page) => fillAndRun(page, text('multi.md')), wait: '#cf-problems-h', focus: '#cf-problems-h', say: 'Run stopped: your contract was not accepted.', problems: 3 },
  { id: 'request-429', reply: RESP.tooMany, go: async (page) => fillAndRun(page, text('good.md')), wait: '.cf-notice', focus: '.cf-bar .eg-bar-go', alert: 'Too many runs' },
  { id: 'request-413', reply: RESP.tooLarge, go: async (page) => fillAndRun(page, text('good.md')), wait: '.cf-notice', focus: '.cf-bar .eg-bar-go', alert: 'Contract too large' },
  { id: 'request-network', reply: 'abort', go: async (page) => fillAndRun(page, text('good.md')), wait: '.cf-notice', focus: '.cf-bar .eg-bar-go', alert: 'Could not reach the scoring server' },
  { id: 'landed', reply: RESP.landed, go: async (page) => fillAndRun(page, text('good.md'), 'www.designesy.org'), wait: '.eg-inst[data-phase="done"]', focus: '.score-verdict-line', sayRe: /^Run finished in \d+\.\d s\.$/ },
  { id: 'unreachable', reply: RESP.unreachable, go: async (page) => fillAndRun(page, text('good.md'), 'unreachable.invalid'), wait: '.cf-unreachable', focus: '.score-verdict-line', sayRe: /^Run stopped after \d+\.\d s\.$/ },
];

const onlyStates = opt('--states', null);
const states = onlyStates ? STATES.filter((s) => onlyStates.split(',').includes(s.id)) : STATES;

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
  for (const theme of THEMES) for (const w of WIDTHS) for (const st of states) {
    runs++;
    const tag = `${st.id} ${theme} ${w}`;
    const ctx = await browser.newContext({ viewport: { width: w, height: w <= 390 ? 844 : 900 }, deviceScaleFactor: SHOTS ? 2 : 1, colorScheme: theme, reducedMotion: 'reduce' });
    let posts = 0;
    await ctx.route('**/api/score', async (route) => {
      posts++;
      if (st.reply === 'hold') return; // never answered: the run stays in flight
      if (st.reply === 'abort') return route.abort('failed');
      const r = st.reply;
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
      if (probe.small.length) fail(`text under 12.8px: ${probe.small.join('; ')}`);
      if (probe.overflow > 0) fail(`document overflows sideways by ${probe.overflow}px`);
      if (viol.length) fail(`axe: ${viol.join(' | ')}`);
      if (errors.length) fail(`page errors: ${errors.join(' | ')}`);
      if (st.reply === null && posts) fail(`${posts} request(s) to /api/score from a state that must send none`);
      if (SHOTS) {
        fs.mkdirSync(SHOTS, { recursive: true });
        await page.screenshot({ path: path.join(SHOTS, `${st.id}-${w}-${theme}.png`), fullPage: true, animations: 'disabled', caret: 'hide' });
      }
      console.log(`  ${failures.some((f) => f.startsWith(tag + ':')) ? 'FAIL' : 'ok  '}  ${tag}`);
    } catch (e) {
      failures.push(`${tag}: ${e.message.split('\n')[0]}`);
      console.log(`  FAIL  ${tag}`);
    }
    await ctx.close();
  }
  await browser.close();
  if (failures.length) {
    console.error(`[contract-page] FAIL: ${failures.length} finding(s) over ${runs} state renders${BREAK.length ? ` (--break ${BREAK.join(',')})` : ''}`);
    for (const f of failures) console.error(`  - ${f}`);
    process.exit(1);
  }
  console.log(`[contract-page] OK: ${runs} state renders; axe 0, one live region from first paint, focus per state, no text under 12.8px, no sideways overflow`);
}

main().catch((e) => {
  console.error(`[contract-page] fatal: ${e.stack || e.message}`);
  process.exit(2);
});
