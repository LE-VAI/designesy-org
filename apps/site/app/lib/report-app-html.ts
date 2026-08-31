// lib/report-app-html.ts — shared HTML generator for the Designesy Report
// MCP App (SEP-1865, ext io.modelcontextprotocol/ui).
//
// Both /api/report/app (the HTTP route) and the ui://designesy/report-app
// resource callback (the MCP resource served via resources/read) call this
// function so the dashboard HTML is built once, served two ways — no self-
// fetch round-trip from the MCP server to its own HTTP route.
//
// The HTML is a self-contained HTML5 document (MIME text/html;profile=
// mcp-app) that bundles its own JS inline. It renders an interactive design-
// intelligence dashboard: composite grade dial, sub-engine cards, tabbed
// check breakdown. CSP-safe (inline script + style only, connects to
// baseUrl/api/report). Dark-mode native, auto-adapts via prefers-color-scheme.

function escapeJs(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/"/g, '\\"');
}

export function buildReportAppHtml(targetUrl: string, baseUrl: string): string {
  const safeUrl = escapeJs(targetUrl);

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Designesy Report</title>
<style>
  :root {
    --ink: #1a1a1e;
    --muted: #555560;
    --muted-dim: #888890;
    --surface: #ffffff;
    --surface-raised: #f5f5f7;
    --surface-soft: rgba(0,0,0,0.03);
    --surface-hover: rgba(0,0,0,0.05);
    --line: rgba(0,0,0,0.10);
    --line-strong: rgba(0,0,0,0.18);
    --ok: #16a34a;
    --error: #dc2626;
    --warn: #ca8a04;
    --radius: 6px;
    --radius-sm: 4px;
    --radius-lg: 12px;
    --ease: cubic-bezier(0.22,0.61,0.36,1);
    --ease-out: cubic-bezier(0.23,1,0.32,1);
    --sans: -apple-system, BlinkMacSystemFont, 'Segoe UI', Inter, Roboto, sans-serif;
    --mono: ui-monospace, 'SF Mono', 'Cascadia Mono', Menlo, Consolas, monospace;
  }
  @media (prefers-color-scheme: dark) {
    :root {
      --ink: #f5f5f7;
      --muted: #a0a0a0;
      --muted-dim: #7d7d7d;
      --surface: #0a0a0c;
      --surface-raised: #121216;
      --surface-soft: rgba(255,255,255,0.03);
      --surface-hover: rgba(255,255,255,0.06);
      --line: rgba(255,255,255,0.12);
      --line-strong: rgba(255,255,255,0.22);
      --ok: #4ade80;
      --error: #f87171;
      --warn: #facc15;
    }
  }
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; background: var(--surface); color: var(--ink); font-family: var(--sans); -webkit-font-smoothing: antialiased; }
  body { padding: 1.5rem; max-width: 920px; margin: 0 auto; }
  h1 { font-size: 1.4rem; font-weight: 700; margin: 0 0 0.25rem; letter-spacing: -0.01em; }
  .eyebrow { font-size: 0.7rem; font-weight: 600; color: var(--muted-dim); text-transform: uppercase; letter-spacing: 0.1em; margin: 0 0 0.5rem; }
  .target { font-size: 0.85rem; color: var(--muted); margin: 0 0 1.5rem; word-break: break-all; font-family: var(--mono); }
  .target code { background: var(--surface-soft); padding: 0.15rem 0.4rem; border-radius: var(--radius-sm); border: 1px solid var(--line); }

  .composite { display: flex; align-items: center; gap: 1.5rem; flex-wrap: wrap; padding: 1.5rem; background: var(--surface-raised); border: 1px solid var(--line); border-radius: var(--radius-lg); margin-bottom: 1.5rem; }
  .dial { flex-shrink: 0; }
  .dial text { font-family: var(--sans); }
  .composite-meta { flex: 1; min-width: 200px; }
  .composite-grade { font-size: 1.6rem; font-weight: 700; margin: 0; letter-spacing: -0.01em; }
  .composite-score { font-size: 0.95rem; color: var(--muted); margin: 0.25rem 0 0.5rem; font-family: var(--mono); }
  .composite-totals { font-size: 0.8rem; color: var(--muted-dim); margin: 0; }
  .badge-pass { color: var(--ok); }
  .badge-warn { color: var(--warn); }
  .badge-fail { color: var(--error); }

  .engines { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 0.75rem; margin-bottom: 1.5rem; }
  .engine-card { padding: 1rem 1.25rem; background: var(--surface-soft); border: 1px solid var(--line); border-radius: var(--radius); }
  .engine-label { font-size: 0.7rem; font-weight: 600; color: var(--muted-dim); margin: 0 0 0.5rem; text-transform: uppercase; letter-spacing: 0.08em; }
  .engine-grade { font-size: 1.4rem; font-weight: 700; margin: 0 0 0.25rem; }
  .engine-totals { font-size: 0.75rem; color: var(--muted); margin: 0 0 0.2rem; }
  .engine-desc { font-size: 0.7rem; color: var(--muted-dim); margin: 0; }
  .engine-fail { font-size: 0.8rem; color: var(--error); margin: 0; }

  .tabs { display: flex; gap: 0.5rem; margin-bottom: 1rem; padding-bottom: 0.5rem; border-bottom: 1px solid var(--line); flex-wrap: wrap; }
  .tab { font-family: var(--sans); font-size: 0.8rem; font-weight: 400; color: var(--muted); background: transparent; border: 1px solid var(--line); border-radius: var(--radius-sm); padding: 0.4rem 0.8rem; cursor: pointer; transition: background 150ms var(--ease), color 150ms var(--ease), border-color 150ms var(--ease); }
  .tab:hover { background: var(--surface-hover); }
  .tab[aria-selected="true"] { color: var(--ink); background: var(--surface-hover); border-color: var(--line-strong); font-weight: 600; }

  .checks { display: flex; flex-direction: column; gap: 0.5rem; }
  .check { padding: 0.75rem 1rem; background: var(--surface-raised); border: 1px solid var(--line); border-radius: var(--radius); display: flex; gap: 0.75rem; align-items: flex-start; }
  .check-id { font-family: var(--mono); font-size: 0.75rem; color: var(--muted-dim); font-weight: 600; min-width: 3rem; padding-top: 0.1rem; }
  .check-body { flex: 1; min-width: 0; }
  .check-title { font-size: 0.85rem; font-weight: 500; margin: 0 0 0.2rem; }
  .check-detail { font-size: 0.75rem; color: var(--muted); margin: 0; word-break: break-word; }
  .status { font-size: 0.7rem; font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em; padding: 0.1rem 0.4rem; border-radius: var(--radius-sm); flex-shrink: 0; margin-top: 0.1rem; }
  .status-PASS { color: var(--ok); background: color-mix(in srgb, var(--ok) 12%, transparent); }
  .status-FAIL { color: var(--error); background: color-mix(in srgb, var(--error) 12%, transparent); }
  .status-WARN { color: var(--warn); background: color-mix(in srgb, var(--warn) 12%, transparent); }
  .status-SKIP { color: var(--muted-dim); background: var(--surface-soft); }
  .status-MANUAL { color: var(--muted-dim); background: var(--surface-soft); }

  .re-run { margin-top: 1.5rem; padding-top: 1rem; border-top: 1px solid var(--line); }
  .re-run-form { display: flex; gap: 0.5rem; flex-wrap: wrap; }
  .re-run-input { flex: 1; min-width: 200px; font-family: var(--sans); font-size: 0.85rem; padding: 0.5rem 0.75rem; background: var(--surface); color: var(--ink); border: 1px solid var(--line); border-radius: var(--radius); }
  .re-run-input:focus { outline: none; border-color: var(--line-strong); }
  .re-run-btn { font-family: var(--sans); font-size: 0.85rem; font-weight: 500; padding: 0.5rem 1rem; background: var(--ink); color: var(--surface); border: 1px solid var(--ink); border-radius: var(--radius); cursor: pointer; transition: opacity 150ms var(--ease); }
  .re-run-btn:hover { opacity: 0.85; }
  .re-run-btn:disabled { opacity: 0.5; cursor: wait; }

  .state { padding: 2rem 1rem; text-align: center; color: var(--muted); font-size: 0.9rem; }
  .state.error { color: var(--error); }
  .spinner { display: inline-block; width: 18px; height: 18px; border: 2px solid var(--line); border-top-color: var(--ink); border-radius: 50%; animation: spin 0.8s linear infinite; margin-right: 0.5rem; vertical-align: middle; }
  @keyframes spin { to { transform: rotate(360deg); } }
  @media (prefers-reduced-motion: reduce) { .spinner { animation: none; } .dial circle { transition: none !important; } }

  .footnote { margin-top: 2rem; padding-top: 1rem; border-top: 1px solid var(--line); font-size: 0.75rem; color: var(--muted-dim); }
  .footnote a { color: var(--muted); text-decoration: none; }
  .footnote a:hover { color: var(--ink); text-decoration: underline; }

  .hidden { display: none; }
</style>
</head>
<body>
<div class="eyebrow">Designesy Unified Report</div>
<h1 id="title">Design-Intelligence Report</h1>
<p class="target" id="targetLine">Target: <code id="targetUrl">—</code></p>

<div id="composite" class="composite hidden"></div>
<div id="engines" class="engines hidden"></div>
<div id="tabs" class="tabs hidden"></div>
<div id="checks" class="checks hidden"></div>

<div id="state" class="state">
  <span class="spinner" id="stateSpinner"></span>
  <span id="stateText">Loading report…</span>
</div>

<div class="re-run hidden" id="rerun">
  <form class="re-run-form" id="rerunForm">
    <input class="re-run-input" id="rerunInput" type="text" placeholder="Run a report on another URL…" autocomplete="off" spellcheck="false" />
    <button class="re-run-btn" id="rerunBtn" type="submit">Re-run report</button>
  </form>
</div>

<div class="footnote">
  Generated by <a href="${baseUrl}" target="_blank" rel="noopener">Designesy</a> · synthesis of /score (42-check), /drift (12-check), /readiness (10-check) ·
  <a href="${baseUrl}/report" target="_blank" rel="noopener">Open full report page →</a>
</div>

<script>
(function() {
  'use strict';
  var INITIAL_URL = ${safeUrl ? '"' + safeUrl + '"' : 'null'};
  var API = '${baseUrl}/api/report';
  var state = document.getElementById('state');
  var stateText = document.getElementById('stateText');
  var stateSpinner = document.getElementById('stateSpinner');
  var compositeEl = document.getElementById('composite');
  var enginesEl = document.getElementById('engines');
  var tabsEl = document.getElementById('tabs');
  var checksEl = document.getElementById('checks');
  var rerunEl = document.getElementById('rerun');
  var rerunForm = document.getElementById('rerunForm');
  var rerunInput = document.getElementById('rerunInput');
  var rerunBtn = document.getElementById('rerunBtn');
  var targetUrlEl = document.getElementById('targetUrl');
  var titleEl = document.getElementById('title');
  var activeTab = 'score';
  var lastResult = null;

  function setState(text, isError, spinner) {
    state.className = 'state' + (isError ? ' error' : '');
    stateSpinner.style.display = spinner === false ? 'none' : 'inline-block';
    stateText.textContent = text;
    if (isError || spinner === false) state.style.display = 'block';
    else state.style.display = 'block';
  }
  function hideResults() {
    compositeEl.classList.add('hidden');
    enginesEl.classList.add('hidden');
    tabsEl.classList.add('hidden');
    checksEl.classList.add('hidden');
  }
  function showResults() {
    compositeEl.classList.remove('hidden');
    enginesEl.classList.add('hidden');
    compositeEl.classList.remove('hidden');
    enginesEl.classList.remove('hidden');
    tabsEl.classList.remove('hidden');
    checksEl.classList.remove('hidden');
    rerunEl.classList.remove('hidden');
    state.style.display = 'none';
  }

  function dial(score, grade) {
    var r = 52, c = 2 * Math.PI * r, offset = c - (score / 100) * c;
    var fill = score >= 90 ? 'var(--ok)' : score >= 70 ? 'var(--warn)' : 'var(--error)';
    return '<svg class="dial" width="120" height="120" viewBox="0 0 120 120" role="img" aria-label="Grade ' + grade + ', ' + score + ' percent">' +
      '<circle cx="60" cy="60" r="' + r + '" fill="none" stroke="var(--line)" stroke-width="6" />' +
      '<circle cx="60" cy="60" r="' + r + '" fill="none" stroke="' + fill + '" stroke-width="6" stroke-linecap="round" stroke-dasharray="' + c + '" stroke-dashoffset="' + offset + '" transform="rotate(-90 60 60)" style="transition: stroke-dashoffset 0.6s var(--ease)" />' +
      '<text x="60" y="58" text-anchor="middle" style="font-size:2rem;font-weight:700;fill:var(--ink)">' + grade + '</text>' +
      '<text x="60" y="78" text-anchor="middle" style="font-size:0.8rem;fill:var(--muted-dim)">' + score + '/100</text>' +
      '</svg>';
  }

  function engineCard(label, weight, result, desc) {
    if (!result || !result.ok) {
      return '<div class="engine-card"><p class="engine-label">' + label + ' ' + weight + '</p>' +
        '<p class="engine-grade" style="color:var(--muted-dim)">—</p>' +
        '<p class="engine-fail">' + (result && result.error ? result.error : 'Engine did not return a score') + '</p></div>';
    }
    var s = result.score, g = result.grade;
    var fill = s >= 90 ? 'var(--ok)' : s >= 70 ? 'var(--warn)' : 'var(--error)';
    return '<div class="engine-card"><p class="engine-label">' + label + ' ' + weight + '</p>' +
      '<p class="engine-grade" style="color:' + fill + '">' + g + ' · ' + s + '</p>' +
      '<p class="engine-totals">' + (result.pass||0) + ' pass · ' + (result.warn||0) + ' warn · ' + (result.fail||0) + ' fail of ' + (result.total||0) + '</p>' +
      '<p class="engine-desc">' + desc + '</p></div>';
  }

  function statusBadge(status) {
    var label = status === 'MANUAL' ? 'Manual' : status === 'SKIP' ? 'N/A' : status;
    return '<span class="status status-' + status + '">' + label + '</span>';
  }

  function renderChecks(checks, emptyText) {
    if (!checks || checks.length === 0) {
      checksEl.innerHTML = '<p style="color:var(--muted);font-size:0.85rem;margin:1rem 0">' + emptyText + '</p>';
      return;
    }
    var html = '';
    for (var i = 0; i < checks.length; i++) {
      var c = checks[i];
      html += '<div class="check">' +
        '<span class="check-id">' + c.id + '</span>' +
        '<div class="check-body">' +
          '<p class="check-title">' + escapeHtml(c.item) + ' ' + statusBadge(c.status) + '</p>' +
          '<p class="check-detail">' + escapeHtml(c.detail) + '</p>' +
        '</div>' +
      '</div>';
    }
    checksEl.innerHTML = html;
  }

  function escapeHtml(s) {
    if (!s) return '';
    return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
  }

  function setTab(key) {
    activeTab = key;
    var tabs = tabsEl.querySelectorAll('.tab');
    for (var i = 0; i < tabs.length; i++) {
      tabs[i].setAttribute('aria-selected', tabs[i].getAttribute('data-tab') === key ? 'true' : 'false');
    }
    if (!lastResult) return;
    if (key === 'score') renderChecks(lastResult.score && lastResult.score.checks, 'Score engine did not return checks.');
    else if (key === 'drift') renderChecks(lastResult.drift && lastResult.drift.checks, 'Drift engine did not return checks.');
    else if (key === 'readiness') renderChecks(lastResult.readiness && lastResult.readiness.checks, 'Readiness engine did not return checks.');
    else if (key === 'synthesis') renderChecks(lastResult.synthesis, 'Synthesis checks not available.');
  }

  function renderTabs(result) {
    var tabs = [
      { key: 'score', label: 'Score', count: result.score && result.score.checks ? result.score.checks.length : 0 },
      { key: 'drift', label: 'Drift', count: result.drift && result.drift.checks ? result.drift.checks.length : 0 },
      { key: 'readiness', label: 'Readiness', count: result.readiness && result.readiness.checks ? result.readiness.checks.length : 0 },
      { key: 'synthesis', label: 'Synthesis', count: result.synthesis ? result.synthesis.length : 0 },
    ];
    var html = '';
    for (var i = 0; i < tabs.length; i++) {
      html += '<button class="tab" data-tab="' + tabs[i].key + '" aria-selected="' + (tabs[i].key === activeTab ? 'true' : 'false') + '">' + tabs[i].label + ' (' + tabs[i].count + ')</button>';
    }
    tabsEl.innerHTML = html;
    var btns = tabsEl.querySelectorAll('.tab');
    for (var j = 0; j < btns.length; j++) {
      btns[j].addEventListener('click', (function(k){ return function(){ setTab(k); }; })(btns[j].getAttribute('data-tab')));
    }
  }

  function render(result) {
    lastResult = result;
    if (!result.ok) {
      setState(result.error || 'Report generation failed.', true, false);
      hideResults();
      return;
    }
    targetUrlEl.textContent = result.url || '';
    titleEl.textContent = 'Design-Intelligence Report';

    var cs = result.compositeScore, cg = result.compositeGrade;
    compositeEl.innerHTML = dial(cs || 0, cg || 'F') +
      '<div class="composite-meta">' +
        '<p class="composite-grade">Composite grade ' + (cg || 'F') + '</p>' +
        '<p class="composite-score">' + (cs || 0) + '/100 · score×0.5 + drift×0.3 + readiness×0.2</p>' +
        '<p class="composite-totals"><span class="badge-pass">' + (result.totalPass||0) + ' pass</span> · ' +
          '<span class="badge-warn">' + (result.totalWarn||0) + ' warn</span> · ' +
          '<span class="badge-fail">' + (result.totalFail||0) + ' fail</span> · ' +
          (result.totalManual||0) + ' manual · ' +
          (result.totalSkip||0) + ' N/A of ' + (result.totalChecks||0) + ' checks</p>' +
      '</div>';

    enginesEl.innerHTML =
      engineCard('Score', '×0.5', result.score, '42-check audit') +
      engineCard('Drift', '×0.3', result.drift, '12-check drift radar') +
      engineCard('Readiness', '×0.2', result.readiness, '10-check AI readiness');

    renderTabs(result);
    setTab(activeTab);
    showResults();
  }

  function runReport(url) {
    setState('Running 3 engines in parallel…', false, true);
    hideResults();
    var body = JSON.stringify({ url: url });
    fetch(API, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: body })
      .then(function(res) { return res.json().then(function(d){ return { ok: res.ok, data: d }; }); })
      .then(function(r) {
        if (!r.ok && (!r.data || !r.data.ok)) {
          setState((r.data && r.data.error) || ('Report API returned an error.'), true, false);
          return;
        }
        render(r.data);
      })
      .catch(function(err) {
        setState('Network error — could not reach the report engine. ' + (err && err.message ? err.message : ''), true, false);
      });
  }

  rerunForm.addEventListener('submit', function(e) {
    e.preventDefault();
    var v = (rerunInput.value || '').trim();
    if (!v) return;
    if (!/^https?:\\/\\//i.test(v)) v = 'https://' + v;
    rerunBtn.disabled = true;
    runReport(v);
    setTimeout(function(){ rerunBtn.disabled = false; }, 30000);
  });

  // MCP Apps: announce to host that we're an interactive UI ready for tool-result injection.
  // Hosts that support io.modelcontextprotocol/ui will postMessage a tool-result; non-Apps
  // browsers ignore this and we fall back to the ?url= query param.
  function notifyHostReady() {
    if (window.parent && window.parent !== window) {
      window.parent.postMessage({ jsonrpc: '2.0', method: 'ui/notifications/tool-input', params: { ready: true, initialUrl: INITIAL_URL } }, '*');
    }
  }

  // Listen for tool-result pushes from the host (MCP Apps bidirectional channel).
  window.addEventListener('message', function(event) {
    if (!event.data || typeof event.data !== 'object') return;
    var msg = event.data;
    if (msg.jsonrpc !== '2.0') return;
    // Host pushing a fresh tool result for us to render
    if (msg.method === 'ui/notifications/tool-result' && msg.params && msg.params.result) {
      render(msg.params.result);
    }
    // Host asking us to run a report on a new URL
    if (msg.method === 'ui/message' && msg.params && msg.params.url) {
      runReport(msg.params.url);
    }
  });

  // Initial load
  if (INITIAL_URL) {
    runReport(INITIAL_URL);
  } else {
    setState('Enter a URL below to generate a design-intelligence report.', false, false);
    rerunEl.classList.remove('hidden');
    rerunInput.focus();
  }
  notifyHostReady();
})();
</script>
</body>
</html>`;
}