// CWV expression injected via Runtime.evaluate.
// Returns JSON.stringify({ lcp, inp, cls, inpMeasured, lcpMeasured, settled }).
//
// HONEST INP (R2): inp is meaningful only if a real interaction occurred during
// the measurement window. inpMeasured is false when no 'event' PerformanceEntry
// fired. Following the web-vitals library convention (initMetric.ts), the canonical
// "no interaction yet" sentinel is value: -1, rating: 'good' (NOT null/undefined,
// which break JSON consumers expecting web-vitals shape). Callers that prefer a
// null-style sentinel can map -1 → null downstream; -1 keeps the JSON interoperable.
//
// SETTLE-BASED (R2): resolves when the DOM has been stable for `settleMs` (default
// 800ms) using a MutationObserver with childList+subtree+characterData (attribute
// mutations excluded — Framer Motion etc. toggle inline styles at 60fps and would
// never settle). Falls back to a hard `maxWaitMs` (default 8000ms) so a constantly
// mutating SPA still returns data.
new Promise((resolve) => {
  let lcp = 0, cls = 0, inp = -1;  // -1 = web-vitals "not measured" sentinel
  let inpMeasured = false;
  let lcpMeasured = false;

  const lcpObs = new PerformanceObserver((list) => {
    const entries = list.getEntries();
    if (entries.length > 0) {
      lcp = entries[entries.length - 1].startTime;
      lcpMeasured = true;
    }
  });
  lcpObs.observe({ type: 'largest-contentful-paint', buffered: true });

  let clsVal = 0;
  const clsObs = new PerformanceObserver((list) => {
    for (const entry of list.getEntries()) {
      if (!entry.hadRecentInput) clsVal += entry.value;
    }
    cls = clsVal;
  });
  clsObs.observe({ type: 'layout-shift', buffered: true });

  // INP (interaction to next paint): duration = processingEnd - startTime.
  // durationThreshold: 16 (below this is sub-frame, not user-perceptible).
  // If NO entry ever fires, inpMeasured stays false → caller reports null.
  let maxInter = 0;
  const inpObs = new PerformanceObserver((list) => {
    for (const entry of list.getEntries()) {
      inpMeasured = true;
      const dur = entry.processingEnd - entry.startTime;
      if (dur > maxInter) maxInter = dur;
    }
    inp = maxInter;
  });
  inpObs.observe({ type: 'event', buffered: true, durationThreshold: 16 });

  // --- Settle-based resolve (R2): replaces fixed 5000ms wait ---
  const settleMs = 800;
  const maxWaitMs = 8000;
  let settleTimer = null;
  let maxTimer = null;
  let resolved = false;

  function finish(reason) {
    if (resolved) return;
    resolved = true;
    if (settleTimer) clearTimeout(settleTimer);
    if (maxTimer) clearTimeout(maxTimer);
    try { mo.disconnect(); } catch (e) {}
    lcpObs.disconnect();
    clsObs.disconnect();
    inpObs.disconnect();

    // Re-read LCP from the timeline (covers late LCP entries)
    const lcpEntries = performance.getEntriesByType('largest-contentful-paint');
    if (lcpEntries.length > 0) {
      lcp = lcpEntries[lcpEntries.length - 1].startTime;
      lcpMeasured = true;
    }

    resolve(JSON.stringify({
      lcp: lcpMeasured ? Math.round(lcp * 10) / 10 : null,  // LCP null if never reported
      inp: inpMeasured ? Math.round(inp * 10) / 10 : -1,    // INP -1 sentinel (web-vitals interop)
      cls: Math.round(cls * 1000) / 1000,
      inpMeasured,
      lcpMeasured,
      settled: reason, // 'settle' | 'maxWait'
    }));
  }

  // MutationObserver: childList + subtree + characterData only (no attributes)
  const mo = new MutationObserver(() => {
    if (settleTimer) clearTimeout(settleTimer);
    settleTimer = setTimeout(() => finish('settle'), settleMs);
  });
  try {
    mo.observe(document.documentElement, {
      childList: true,
      subtree: true,
      characterData: true,
    });
  } catch (e) {
    // If observe fails, just rely on maxWait
  }
  settleTimer = setTimeout(() => finish('settle'), settleMs);
  maxTimer = setTimeout(() => finish('maxWait'), maxWaitMs);
})