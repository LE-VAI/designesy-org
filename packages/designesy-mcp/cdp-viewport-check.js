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
 * Usage: node cdp-viewport-check.js <url>
 * Requires Chrome running with --remote-debugging-port=9222
 */
const http = require('http');
const WebSocket = require('ws');

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

function evaluateOnTab(wsUrl, expression, timeoutMs = 15000) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(wsUrl);
    let msgId = 1;
    ws.on('open', () => {
      ws.send(JSON.stringify({
        id: msgId,
        method: 'Runtime.evaluate',
        params: { expression, returnByValue: true, awaitPromise: true },
      }));
    });
    ws.on('message', (data) => {
      const msg = JSON.parse(data);
      if (msg.id === msgId) { ws.close(); resolve(msg); }
    });
    ws.on('error', reject);
    setTimeout(() => { ws.close(); reject(new Error('WS timeout')); }, timeoutMs);
  });
}

function setViewport(wsUrl, width, height) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(wsUrl);
    let msgId = 1;
    ws.on('open', () => {
      ws.send(JSON.stringify({
        id: msgId,
        method: 'Emulation.setDeviceMetricsOverride',
        params: { width, height, deviceScaleFactor: 1, mobile: false },
      }));
    });
    ws.on('message', (data) => {
      const msg = JSON.parse(data);
      if (msg.id === msgId) { ws.close(); resolve(msg); }
    });
    ws.on('error', reject);
    setTimeout(() => { ws.close(); reject(new Error('WS timeout')); }, 10000);
  });
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

  // R2: settle-based initial wait instead of fixed 4000ms
  console.log('Waiting for initial load to settle...');
  const initialSettle = await settleWait(wsUrl, 800, 6000);
  console.log(`Initial settle: ${initialSettle.result && initialSettle.result.result && initialSettle.result.result.value}`);

  const widths = [375, 720, 860, 1080];
  const results = [];

  for (const width of widths) {
    await setViewport(wsUrl, width, 800);

    // R2: settle-based wait after each resize instead of fixed 1500ms
    const settleReason = await settleWait(wsUrl, 500, 3000);

    const expr = `JSON.stringify({
      scrollWidth: document.documentElement.scrollWidth,
      innerWidth: window.innerWidth,
      overflow: document.documentElement.scrollWidth > window.innerWidth,
      bodyScrollWidth: document.body ? document.body.scrollWidth : 0,
    })`;

    const result = await evaluateOnTab(wsUrl, expr);
    let data = { width, overflow: false, scrollWidth: 0, innerWidth: width, settled: 'unknown' };
    if (result.result && result.result.result && result.result.result.value) {
      data = JSON.parse(result.result.result.value);
      data.width = width;
      data.settled = settleReason.result && settleReason.result.result && settleReason.result.result.value;
    }
    console.log(`  ${width}px: overflow=${data.overflow} scrollWidth=${data.scrollWidth} innerWidth=${data.innerWidth} (settled: ${data.settled})`);
    results.push(data);
  }

  // Reset viewport
  await setViewport(wsUrl, 1920, 1080);

  try { http.request({ host: CDP_HOST, port: CDP_PORT, path: `/json/close/${tab.id}`, method: 'PUT' }).end(); } catch (e) {}

  return { url, widths: results };
}

const url = process.argv[2];
if (!url) { console.error('Usage: node cdp-viewport-check.js <url>'); process.exit(1); }
checkViewportOverflow(url)
  .then(result => { console.log('\n' + JSON.stringify(result, null, 2)); process.exit(0); })
  .catch(err => { console.error('Error:', err.message); process.exit(1); });