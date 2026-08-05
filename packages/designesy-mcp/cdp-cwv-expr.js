// CDP Core Web Vitals checker — simplified version
// Uses a separate expression file (cwv-expr.js) to avoid escaping issues.
//
// R2 improvements (2026-07-26):
//   - Honest INP: reports `inp: null` + `inpPass: null` when no interaction occurred.
//   - Settle-based wait (handled inside cwv-expr.js).
//   - --throttle flag applies Lighthouse mobile preset.
//
// Usage: node cdp-cwv-expr.js <url> [--throttle]
const http = require('http');
// Node 21+ provides a global WebSocket (DOM API: onopen/onmessage/onerror).
// No need for the 'ws' npm package — this keeps the MCP package zero-dependency.
const fs = require('fs');
const path = require('path');

const CDP_HOST = '127.0.0.1';
const CDP_PORT = 9222;

function cdpRequest(p, method = 'PUT') {
  return new Promise((resolve, reject) => {
    const req = http.request({ host: CDP_HOST, port: CDP_PORT, path: p, method }, (res) => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => { try { resolve(JSON.parse(data)); } catch (e) { resolve({}); } });
    });
    req.on('error', reject);
    req.end();
  });
}

// R2-fix: Lighthouse DevTools-method preset values (NOT raw simulated values).
//   requestLatencyMs = 150 * 3.75 = 562.5ms
//   downloadThroughput = 1.44 Mbps, uploadThroughput = 675 Kbps, cpu = 4x
// See cdp-cwv-check.js for full note. Matches Lighthouse DevTools-method only.
async function applyThrottling(send) {
  try { await send('Network.enable'); } catch (e) {}
  await send('Network.emulateNetworkConditions', {
    offline: false, latency: 562.5, downloadThroughput: 1440000, uploadThroughput: 675000,
  });
  await send('Emulation.setCPUThrottlingRate', { rate: 4 });
}

async function clearCacheForColdRun(send, origin) {
  try {
    await send('Storage.clearDataForOrigin', {
      origin: origin || '*',
      storageTypes: 'cache_storage,websql,indexeddb,local_storage,service_workers',
    });
  } catch (e) {}
  try { await send('Network.clearBrowserCache'); } catch (e) {}
}

async function checkCWV(url, throttle) {
  console.log(`Opening ${url}${throttle ? ' [throttled]' : ''}...`);
  const tab = await cdpRequest(`/json/new?${encodeURIComponent(url)}`);
  if (!tab.webSocketDebuggerUrl) throw new Error('Could not create tab');
  console.log(`Tab: ${tab.id}`);

  const ws = new WebSocket(tab.webSocketDebuggerUrl);
  let msgId = 0;
  const pending = {};

  function send(method, params = {}) {
    return new Promise((resolve, reject) => {
      const id = ++msgId;
      pending[id] = { resolve, reject };
      ws.send(JSON.stringify({ id, method, params }));
      setTimeout(() => { if (pending[id]) { pending[id].reject(new Error(method + ' timeout')); delete pending[id]; } }, 25000);
    });
  }

  return new Promise((resolve, reject) => {
    const overallTimeout = setTimeout(() => { ws.close(); cdpRequest(`/json/close/${tab.id}`); reject(new Error('timeout')); }, 40000);

    ws.onmessage = (event) => {
      const msg = JSON.parse(event.data);
      if (pending[msg.id]) { pending[msg.id].resolve(msg); delete pending[msg.id]; }
    };

    ws.onopen = async () => {
      try {
        await send('Performance.enable');
        await send('Runtime.enable');
        if (throttle) {
          await clearCacheForColdRun(send, new URL(url).origin);
          await applyThrottling(send);
        }

        // Short pre-roll for first paint; cwv-expr.js handles settle/maxWait
        await new Promise(r => setTimeout(r, 600));
        console.log('Measuring CWV (settle-based)...');

        const exprPath = path.join(__dirname, 'cwv-expr.js');
        const expr = fs.readFileSync(exprPath, 'utf8');

        const result = await send('Runtime.evaluate', {
          expression: expr,
          returnByValue: true,
          awaitPromise: true,
          userGesture: true,
        });

        clearTimeout(overallTimeout);
        ws.close();

        let d = { lcp: null, inp: -1, cls: 0, inpMeasured: false, lcpMeasured: false, settled: 'unknown' };
        if (result.result && result.result.result && result.result.result.value) {
          d = JSON.parse(result.result.result.value);
        }

        // R2: honest INP — -1 sentinel (web-vitals interop) when no interaction
        const lcpPass = d.lcpMeasured ? (d.lcp > 0 && d.lcp < 2500) : null;
        const inpPass = d.inpMeasured ? (d.inp < 200) : null;
        const clsPass = d.cls < 0.1;
        const plausible = d.lcpMeasured ? (d.lcp > 0 && d.lcp < 25000 && d.cls < 1) : (d.cls < 1);

        console.log(`  LCP: ${d.lcpMeasured ? d.lcp + 'ms' : 'n/a'} ${lcpPass === true ? 'PASS' : lcpPass === false ? 'FAIL' : 'N/A'} (threshold 2500ms)`);
        console.log(`  INP: ${d.inpMeasured ? d.inp + 'ms' : '-1 (no interaction)'} ${inpPass === true ? 'PASS' : inpPass === false ? 'FAIL' : 'N/A'} (threshold 200ms)`);
        console.log(`  CLS: ${d.cls} ${clsPass ? 'PASS' : 'FAIL'} (threshold 0.1)`);
        console.log(`  plausible: ${plausible} | settled: ${d.settled} | throttled: ${throttle}`);

        await cdpRequest(`/json/close/${tab.id}`);
        resolve({
          url, lcp: d.lcp, inp: d.inp, cls: d.cls,
          inpMeasured: d.inpMeasured, lcpMeasured: d.lcpMeasured, settled: d.settled,
          lcpPass, inpPass, clsPass, plausible,
          throttled: throttle,
          thresholds: { lcp: 2500, inp: 200, cls: 0.1 },
        });
      } catch (err) {
        clearTimeout(overallTimeout);
        ws.close();
        await cdpRequest(`/json/close/${tab.id}`);
        reject(err);
      }
    };

    ws.onerror = (e) => { clearTimeout(overallTimeout); cdpRequest(`/json/close/${tab.id}`); reject(e); };
  });
}

const args = process.argv.slice(2);
const throttle = args.includes('--throttle');
const url = args.find(a => !a.startsWith('--'));
if (!url) { console.error('Usage: node cdp-cwv-expr.js <url> [--throttle]'); process.exit(1); }
checkCWV(url, throttle).then(r => { console.log('\n' + JSON.stringify(r, null, 2)); process.exit(0); }).catch(e => { console.error('Error:', e.message); process.exit(1); });