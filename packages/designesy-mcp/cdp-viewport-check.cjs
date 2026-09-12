#!/usr/bin/env node
/**
 * CDP viewport overflow checker for the Designesy verification engine.
 *
 * Opens a URL in a new CDP tab, resizes the viewport to 375/720/860/1080,
 * and checks for horizontal overflow (document.scrollWidth > window.innerWidth).
 * Returns JSON: { url, widths: [{ width, overflow, scrollWidth, innerWidth, settled }] }
 *
 * R2 improvements (2026-07-26):
 *   - Replaced fixed `setTimeout(4000)` post-load wait and `setTimeout(1500)`
 *     per-width waits with settle-based waits (MutationObserver). Faster on
 *     light pages, more reliable on SPAs.
 *
 * Usage: node cdp-viewport-check.cjs <url>
 * Requires Chrome running with --remote-debugging-port=9222
 */
const http = require('http');
// Node 21+ provides a global WebSocket (DOM API: onopen/onmessage/onerror).
// No need for the 'ws' npm package — this keeps the MCP package zero-dependency.

const CDP_HOST = '127.0.0.1';
const CDP_PORT = 9222;

function getTargets() {
  return new Promise((resolve, reject) => {
    http.get(`http://${CDP_HOST}:${CDP_PORT}/json/list`, (res) => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => resolve(JSON.parse(data)));
    }).on('error', reject);
  });
}

function createTab(url) {
  return new Promise((resolve, reject) => {
    const req = http.request({ host: CDP_HOST, port: CDP_PORT, path: `/json/new?${encodeURIComponent(url)}`, method: 'PUT' }, (res) => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => { try { resolve(JSON.parse(data)); } catch (e) { resolve({ webSocketDebuggerUrl: null, id: null }); } });
    });
    req.on('error', reject);
    req.end();
  });
}

// R2: settle-based wait. Injects a MutationObserver that resolves when the DOM
// has been stable for `settleMs` (default 600ms) or after `maxWaitMs` (default 4000ms).
// Attribute mutations excluded (Framer Motion et al. toggle inline styles at 60fps).
function settleWait(wsUrl, settleMs = 600, maxWaitMs = 4000) {
  const expr = `
    new Promise((resolve) => {
      const settleMs = ${settleMs}, maxWaitMs = ${maxWaitMs};
      let settleTimer = null, maxTimer = null, resolved = false;
      function finish(reason) {
        if (resolved) return; resolved = true;
        if (settleTimer) clearTimeout(settleTimer);
        if (maxTimer) clearTimeout(maxTimer);
        try { mo.disconnect(); } catch (e) {}
        resolve(reason);
      }
      const mo = new MutationObserver(() => {
        if (settleTimer) clearTimeout(settleTimer);
        settleTimer = setTimeout(() => finish('settle'), settleMs);
      });
      try { mo.observe(document.documentElement, { childList: true, subtree: true, characterData: true }); }
      catch (e) { /* fall back to maxWait only */ }
      settleTimer = setTimeout(() => finish('settle'), settleMs);
      maxTimer = setTimeout(() => finish('maxWait'), maxWaitMs);
    })
  `;
  return evaluateOnTab(wsUrl, expr, 6000);
}

// A single long-lived CDP session, held open for the whole run.
//
// Why this exists: Emulation.setDeviceMetricsOverride is scoped to the CDP
// session that applied it. The previous design opened a throwaway session per
// call (setViewport applied the override, then closed; evaluateOnTab opened a
// fresh one to measure). Closing the applying session reverts the emulation,
// so every measurement ran against the host browser window — innerWidth came
// back as the OS-scaled window width (375 requested → 150 measured on a 2.5x
// display) and the check reported "no overflow" at four widths the page was
// never rendered at.
//
// mobile MUST be true. With mobile:false Chrome shrinks the real browser window
// instead of emulating, so the OS display scale factor still divides the
// requested width. mobile:true emulates properly and yields innerWidth === width.
// deviceScaleFactor:1 keeps CSS px 1:1 so scrollWidth/clientWidth compare in the
// same units the CSS breakpoints use. It does NOT flip pointer/hover media
// queries to coarse/none — desktop pointer affordances stay testable.
function openSession(wsUrl) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(wsUrl);
    let msgId = 0;
    const pending = new Map();
    const ready = () => {
      const send = (method, params = {}, timeoutMs = 15000) =>
        new Promise((res, rej) => {
          const id = ++msgId;
          pending.set(id, { res, rej });
          ws.send(JSON.stringify({ id, method, params }));
          setTimeout(() => {
            if (pending.has(id)) { pending.delete(id); rej(new Error(method + ' timeout')); }
          }, timeoutMs);
        });
      resolve({ send, close: () => { try { ws.close(); } catch (e) {} } });
    };
    ws.onmessage = (event) => {
      let msg;
      try { msg = JSON.parse(event.data); } catch (e) { return; }
      const p = pending.get(msg.id);
      if (p) { pending.delete(msg.id); p.res(msg); }
    };
    ws.onerror = (err) => reject(err);
    ws.onopen = ready;
    setTimeout(() => reject(new Error('WS open timeout')), 10000);
  });
}

// Measure within the SAME session that applied the override.
async function measureAt(session, width, height) {
  await session.send('Emulation.setDeviceMetricsOverride', {
    width, height, deviceScaleFactor: 1, mobile: true,
  });
  const settle = await settleInSession(session, 500, 3000);
  const expr = `JSON.stringify({
    scrollWidth: document.documentElement.scrollWidth,
    innerWidth: window.innerWidth,
    overflow: document.documentElement.scrollWidth > window.innerWidth,
    bodyScrollWidth: document.body ? document.body.scrollWidth : 0,
  })`;
  const result = await session.send('Runtime.evaluate', {
    expression: expr, returnByValue: true, awaitPromise: true,
  }, 15000);
  return { result, settle };
}

// Settle wait evaluated inside an existing session (same observer idea as
// settleWait, but without opening its own connection).
async function settleInSession(session, settleMs = 500, maxWaitMs = 3000) {
  const expr = `
    new Promise((resolve) => {
      const settleMs = ${settleMs}, maxWaitMs = ${maxWaitMs};
      let settleTimer = null, maxTimer = null, resolved = false;
      function finish(reason) {
        if (resolved) return; resolved = true;
        if (settleTimer) clearTimeout(settleTimer);
        if (maxTimer) clearTimeout(maxTimer);
        try { mo.disconnect(); } catch (e) {}
        resolve(reason);
      }
      const mo = new MutationObserver(() => {
        if (settleTimer) clearTimeout(settleTimer);
        settleTimer = setTimeout(() => finish('settle'), settleMs);
      });
      try { mo.observe(document.documentElement, { childList: true, subtree: true, characterData: true }); }
      catch (e) {}
      settleTimer = setTimeout(() => finish('settle'), settleMs);
      maxTimer = setTimeout(() => finish('maxWait'), maxWaitMs);
    })
  `;
  try {
    const r = await session.send('Runtime.evaluate', {
      expression: expr, returnByValue: true, awaitPromise: true,
    }, maxWaitMs + 4000);
    return r ? r.result : null;
  } catch (e) {
    return null;
  }
}

async function checkViewportOverflow(url) {
  console.log(`Opening ${url}...`);
  const tab = await createTab(url);
  if (!tab.webSocketDebuggerUrl) {
    const targets = await getTargets();
    const pageTab = targets.find(t => t.type === 'page' && t.url.includes(url.split('/')[2]));
    if (!pageTab) throw new Error('Could not create or find tab');
    tab.webSocketDebuggerUrl = pageTab.webSocketDebuggerUrl;
    tab.id = pageTab.id;
  }

  const wsUrl = tab.webSocketDebuggerUrl;
  console.log(`Tab created: ${tab.id}`);

  // One session for the whole run — the override only survives while the
  // session that applied it stays open (see openSession note).
  const session = await openSession(wsUrl);

  // R2: settle-based initial wait instead of fixed 4000ms
  console.log('Waiting for initial load to settle...');
  const initialSettle = await settleInSession(session, 800, 6000);
  console.log(`Initial settle: ${initialSettle && initialSettle.result && initialSettle.result.value}`);

  const widths = [375, 720, 860, 1080];
  const results = [];

  for (const width of widths) {
    const { result, settle } = await measureAt(session, width, 800);

    // measured:false marks a failed read. Never default innerWidth to the
    // requested width — that fabricated a passing measurement when evaluation
    // returned nothing (the exact shape that hid the emulation bug).
    let data = { width, overflow: null, scrollWidth: 0, innerWidth: 0, settled: 'unknown', measured: false };
    if (result && result.result && result.result.result && result.result.result.value) {
      data = JSON.parse(result.result.result.value);
      data.width = width;
      data.settled = settle && settle.result && settle.result.value;
      // Fidelity guard: the emulated viewport must actually be the requested
      // width. If it is not, the measurement is meaningless — flag it rather
      // than let a wrong-width "no overflow" pass as verified.
      data.measured = data.innerWidth === width;
      data.scaleFactor = data.innerWidth > 0 ? +(width / data.innerWidth).toFixed(3) : null;
    }
    console.log(`  ${width}px: overflow=${data.overflow} scrollWidth=${data.scrollWidth} innerWidth=${data.innerWidth} measured=${data.measured} (settled: ${data.settled})`);
    results.push(data);
  }

  session.close();

  try { http.request({ host: CDP_HOST, port: CDP_PORT, path: `/json/close/${tab.id}`, method: 'PUT' }).end(); } catch (e) {}

  return { url, widths: results };
}

const url = process.argv[2];
if (!url) { console.error('Usage: node cdp-viewport-check.cjs <url>'); process.exit(1); }
checkViewportOverflow(url)
  .then(result => { console.log('\n' + JSON.stringify(result, null, 2)); process.exit(0); })
  .catch(err => { console.error('Error:', err.message); process.exit(1); });