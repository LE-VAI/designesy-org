// One-off: score every leaderboard seed URL through the local /api/score and
// capture the real per-category breakdowns. Output -> batch-out.json, consumed
// to author app/leaderboard/batch-data.ts. The composite p/f/w/s the seed ships
// stays the editorial snapshot from the 2026-07-28 batch; this records the
// honest category fingerprint the ring needs.
const BASE = 'http://localhost:3000';

// Pull the seed URLs straight from the live leaderboard API (same source).
const lb = await (await fetch(`${BASE}/api/leaderboard`)).json();
const urls = lb.sites.map((s) => s.url);

const RING = ['cadence','accessibility','semantic','motion','tokens','takt','poise','identity','interaction','performance','responsive'];

const out = {};
let done = 0;
for (const url of urls) {
  try {
    const res = await fetch(`${BASE}/api/score`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url }),
    });
    const d = await res.json();
    const cs = d.categoryScores || {};
    // Map onto the full 11-key ring; missing -> unscored (score:null).
    const mapped = {};
    for (const k of RING) {
      const v = cs[k];
      mapped[k] = v && v.score !== null && v.score !== undefined
        ? { score: Math.round(v.score * 10) / 10, weight: RING.indexOf(k) >= 0 ? ({cadence:18,accessibility:15,semantic:12,motion:10,tokens:9,takt:8,poise:7,identity:6,interaction:6,performance:6,responsive:3})[k] : 5, pass: v.pass|0, fail: v.fail|0, warn: v.warn|0, skip: v.skip|0 }
        : { score: null, weight: ({cadence:18,accessibility:15,semantic:12,motion:10,tokens:9,takt:8,poise:7,identity:6,interaction:6,performance:6,responsive:3})[k], pass: 0, fail: 0, warn: 0, skip: 0 };
    }
    out[url] = mapped;
    done++;
    console.log(`[${done}/${urls.length}] ${url}  score=${d.score} grade=${d.grade}  cats=${Object.values(mapped).filter(c=>c.score!==null).length}`);
  } catch (e) {
    out[url] = null;
    console.log(`[${done}/${urls.length}] ${url}  ERROR ${e.message}`);
  }
  // be polite to the dev server; also lets 24h cache settle
  await new Promise((r) => setTimeout(r, 1800));
}

const { writeFileSync } = await import('node:fs');
writeFileSync(new URL('./batch-out.json', import.meta.url), JSON.stringify(out, null, 2));
console.log(`\nWROTE batch-out.json (${done}/${urls.length} scored)`);
