#!/usr/bin/env node
/**
 * Sound mute cue: muting sound plays the toggle cue to its end before
 * cuelume is turned off, and sound turned back on while that cue plays
 * stays on, so the switch and what is heard agree.
 *
 * WHY THIS EXISTS
 * From cuelume 0.2.6, setEnabled(false) fades whatever is still sounding
 * within 15 ms (SILENCE_FADE in cuelume's src/audio/output.ts). The sound
 * preference hook (app/lib/use-sound.tsx) plays the toggle cue and turns
 * cuelume off in the same click, so on cuelume 0.2.8 the cue that confirms a
 * mute was cut to a click. The hook now waits for the cue before it turns
 * cuelume off. A wait opens a second way to fail: sound turned back on
 * inside it must cancel the waiting mute, or cuelume goes silent while the
 * switch says on.
 *
 * HOW IT MEASURES
 * The real hook, loaded through scripts/lib/route-harness.js, with three
 * things swapped: a small stand-in for React's useState, useCallback and
 * useEffect, which applies a state update once, as React does for a click
 * in production, and keeps each mounted control's state apart; a stand-in
 * for cuelume that keeps what a listener would hear (when each cue starts,
 * when it ends, and when setEnabled(false) cut it); and a clock the check
 * moves by hand, so no case depends on how busy the machine is. How long the
 * toggle cue sounds is read from cuelume's own recipe through its
 * cuelume/themes export (from this checkout's node_modules): each layer of
 * the default theme's toggle cue starts at its offset, swells over its
 * attack and falls 60 dB over its decay. At the normal emphasis the site
 * plays, the cue ends when the last of the layers that emphasis plays has
 * fallen (a quick repeat only shortens it). The longest layer in the recipe,
 * at its recipe length, sets the latest moment cuelume may still be on. That
 * layer plays only at strong emphasis, which the site does not use, and
 * strong emphasis also makes every layer's decay 1.2 times longer, so this
 * bound holds for the subtle and normal emphasis only.
 *
 * WHAT IT ASSERTS
 *   - The toggle cue has no release part, so its layers are all of it.
 *   - A mute turns the switch off at once (its state, html[data-audio] and
 *     the stored preference), plays the toggle cue, and turns cuelume off
 *     no earlier than the end of that cue and no later than the end of the
 *     longest layer in its recipe, rounded up to a whole millisecond. Sound
 *     turned on a second later turns cuelume on and plays the toggle cue.
 *   - Sound turned back on 10 ms into the mute cue stays on: a second
 *     later cuelume, the switch, html[data-audio] and the stored preference
 *     all say on, and cuelume never received setEnabled(false).
 *   - A second sound control that mounts 10 ms into the mute cue reads the
 *     stored "off", says off, and leaves the cue to play to its end.
 *   - The wait comes from the recipe cuelume ships: the hook loaded with a
 *     recipe whose toggle layers ring twice as long waits for that longer
 *     cue, within the same bounds.
 *
 * PROVING IT CAN FAIL
 * --app <dir> loads app/lib/use-sound.tsx from another apps/site directory.
 * Against the hook before the wait, all four cases fail: it turns cuelume
 * off in the click, 0 ms into the cue. Each of these changes to the current
 * hook fails at least one case: no wait, a fixed wait of 34, 35, 39 or
 * 40 ms, no cancel on unmute, a timer that turns sound on, a mount that
 * turns cuelume off at once, and an unmute that plays the cue before
 * cuelume is on.
 *
 * Usage:  node scripts/check-sound-mute.mjs [--app <dir>]
 * Exits 1 on any failure.
 */

import assert from 'node:assert/strict';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const argApp = process.argv.indexOf('--app');
const APP = argApp > 0 ? path.resolve(process.argv[argApp + 1]) : path.join(HERE, '..');
const require = createRequire(import.meta.url);
const { createHarness } = require('./lib/route-harness.js');

// cuelume ships ES modules only, so its recipes are imported, not required.
const { THEMES } = await import('cuelume/themes');

const STORAGE_KEY = 'designesy:sound';
/** cuelume's emphasis ranks (src/sounds/context.ts): a layer plays at its own rank and above. */
const RANK = { subtle: 0, normal: 1, strong: 2 };
/** When a layer has fallen 60 dB, in ms from the start of its cue. */
const layerEnd = (layer) => 1000 * ((layer.offset ?? 0) + layer.attack + layer.decay);

/**
 * The toggle cue of a set of themes: how long it sounds at the normal
 * emphasis the site plays, and the end of the longest layer in its recipe,
 * rounded up to a whole ms, by which cuelume is off.
 */
function toggleCue(themes) {
  const { layers } = themes.default.toggle;
  return {
    cueMs: Math.max(...layers.filter((l) => RANK[l.from ?? 'subtle'] <= RANK.normal).map(layerEnd)),
    latestMs: Math.ceil(Math.max(...layers.map(layerEnd))),
  };
}

const TOGGLE = THEMES.default.toggle;
const SHIPPED = toggleCue(THEMES);
/** cuelume's themes with every layer of the default toggle cue ringing twice as long. */
const SLOWER = {
  ...THEMES,
  default: {
    ...THEMES.default,
    toggle: { ...TOGGLE, layers: TOGGLE.layers.map((layer) => ({ ...layer, decay: layer.decay * 2 })) },
  },
};
/** Where each case's mute happens, well after the mount. */
const MUTE_AT = 1000;
/** How far into the mute cue the second and third cases act. */
const INSIDE = 10;

/** A clock the check moves by hand, with setTimeout and clearTimeout on it. */
function fakeClock() {
  let seq = 0;
  const timers = new Map();
  const clock = {
    now: 0,
    setTimeout(fn, ms = 0) {
      seq += 1;
      timers.set(seq, { at: clock.now + Math.max(0, Number(ms) || 0), fn });
      return seq;
    },
    clearTimeout(id) {
      timers.delete(id);
    },
    advance(ms) {
      const end = clock.now + ms;
      for (;;) {
        let next = null;
        for (const [id, t] of timers) {
          if (t.at <= end && (!next || t.at < next.t.at)) next = { id, t };
        }
        if (!next) break;
        timers.delete(next.id);
        clock.now = next.t.at;
        next.t.fn();
      }
      clock.now = end;
    },
  };
  return clock;
}

/** cuelume as a listener hears it: each cue's start and end, and when a mute cut it. */
function fakeCuelume(clock, cueMs) {
  const state = { enabled: true, cues: [], calls: [] };
  const api = {
    play(name) {
      state.calls.push({ fn: 'play', arg: name, at: clock.now });
      if (!state.enabled) return;
      state.cues.push({ name, at: clock.now, end: clock.now + (name === 'toggle' ? cueMs : 0), cutAt: null });
    },
    setEnabled(on) {
      state.calls.push({ fn: 'setEnabled', arg: on, at: clock.now });
      state.enabled = on;
      if (on) return;
      for (const cue of state.cues) {
        if (cue.cutAt === null && cue.end > clock.now) cue.cutAt = clock.now;
      }
    },
    bind() {},
  };
  return { state, api };
}

/**
 * useState, useCallback and useEffect for any number of mounted controls,
 * each keeping its own state; a state update is applied once.
 */
function fakeReact() {
  const instances = new Map();
  let slots = [];
  let cursor = 0;
  let effects = [];
  const api = {
    useState(initial) {
      const i = cursor++;
      if (i >= slots.length) slots.push(typeof initial === 'function' ? initial() : initial);
      const own = slots;
      return [own[i], (v) => { own[i] = typeof v === 'function' ? v(own[i]) : v; }];
    },
    useCallback(fn) {
      cursor++;
      return fn;
    },
    useEffect(fn) {
      cursor++;
      effects.push(fn);
    },
  };
  /** Render the hook as control `id`; on mount, run its effects, as React does once. */
  const render = (hook, id, mount) => {
    if (!instances.has(id)) instances.set(id, []);
    slots = instances.get(id);
    cursor = 0;
    effects = [];
    const out = hook();
    if (mount) for (const fn of effects) fn();
    return out;
  };
  return { api, render };
}

/**
 * One page: the hook loaded fresh with its own cuelume, React and clock, and
 * the browser globals it reads. `run` puts the page's globals in place for
 * the length of one synchronous step and restores Node's afterwards.
 */
function newPage({ themes = THEMES } = {}) {
  const cue = toggleCue(themes);
  const clock = fakeClock();
  const cuelume = fakeCuelume(clock, cue.cueMs);
  const react = fakeReact();
  const storage = new Map();
  const html = { dataset: {} };
  const globals = {
    setTimeout: clock.setTimeout,
    clearTimeout: clock.clearTimeout,
    window: { matchMedia: () => ({ matches: false }) },
    document: { documentElement: html },
    localStorage: {
      getItem: (k) => (storage.has(k) ? storage.get(k) : null),
      setItem: (k, v) => { storage.set(k, String(v)); },
    },
  };
  const run = (fn) => {
    const saved = Object.keys(globals).map((k) => [k, Object.getOwnPropertyDescriptor(globalThis, k)]);
    for (const [k, value] of Object.entries(globals)) {
      Object.defineProperty(globalThis, k, { value, configurable: true, writable: true });
    }
    try {
      return fn();
    } finally {
      for (const [k, d] of saved) {
        if (d) Object.defineProperty(globalThis, k, d);
        else delete globalThis[k];
      }
    }
  };
  const h = createHarness({ app: APP, stubs: { react: react.api, cuelume: cuelume.api, 'cuelume/themes': { THEMES: themes } } });
  const { useSoundPreference } = run(() => h.load('app/lib/use-sound.tsx'));
  const render = (id = 'menu', mount = false) => run(() => react.render(useSoundPreference, id, mount));
  const mount = (id = 'menu') => render(id, true);
  const click = (id = 'menu') => run(() => render(id).toggle());
  const advance = (ms) => run(() => clock.advance(ms));
  return { cue, clock, cuelume: cuelume.state, storage, html, render, mount, click, advance };
}

/** The setEnabled(false) calls cuelume received at or after `from`. */
const offCalls = (page, from) => page.cuelume.calls.filter((c) => c.fn === 'setEnabled' && c.arg === false && c.at >= from);

/**
 * After a mute at MUTE_AT and a second of waiting: the toggle cue the mute
 * played sounded to its end, and cuelume went off between that end and the
 * end of the longest layer in the recipe. Returns how long after the mute.
 */
function assertMuteHeard(page) {
  const { cueMs, latestMs } = page.cue;
  const cue = page.cuelume.cues.find((c) => c.at === MUTE_AT && c.name === 'toggle');
  assert.ok(cue, 'the mute played no toggle cue');
  const off = offCalls(page, MUTE_AT);
  assert.ok(off.length > 0, 'cuelume was never turned off after the mute');
  const offMs = off[0].at - MUTE_AT;
  assert.ok(offMs >= cueMs, `cuelume was turned off ${offMs} ms into the ${cueMs.toFixed(1)} ms toggle cue`);
  assert.ok(offMs <= latestMs, `cuelume stayed on ${offMs} ms after the mute, past the ${latestMs} ms its longest layer lasts`);
  assert.equal(cue.cutAt, null, `the toggle cue was cut ${cue.cutAt - MUTE_AT} ms into its ${cueMs.toFixed(1)} ms`);
  assert.equal(page.cuelume.enabled, false, 'cuelume is on a second after the mute');
  return offMs;
}

const CASES = [
  {
    name: 'a mute plays the toggle cue to its end, then turns cuelume off; sound turned on later plays its cue',
    run() {
      assert.equal(TOGGLE.release, undefined, 'the toggle cue has a release part now: its length is no longer its layers alone');
      const page = newPage();
      page.mount();
      page.advance(MUTE_AT);
      assert.equal(page.render().enabled, true, 'sound is not on after the mount');
      page.click();
      assert.equal(page.render().enabled, false, 'the switch still says on after the mute');
      assert.equal(page.html.dataset.audio, 'off', 'html[data-audio] still says on after the mute');
      assert.equal(page.storage.get(STORAGE_KEY), 'false', 'the mute was not stored');
      page.advance(1000);
      const offMs = assertMuteHeard(page);
      const onAt = page.clock.now;
      page.click();
      assert.equal(page.render().enabled, true, 'the switch says off after sound was turned on');
      assert.equal(page.cuelume.enabled, true, 'cuelume is off after sound was turned on');
      assert.ok(
        page.cuelume.cues.some((c) => c.at === onAt && c.name === 'toggle'),
        'turning sound on a second after the mute played no toggle cue (cuelume was off when it was asked to play)',
      );
      return `toggle cue ${page.cue.cueMs.toFixed(1)} ms, cuelume off ${offMs} ms after the mute (latest allowed ${page.cue.latestMs} ms); turning sound on later played the cue`;
    },
  },
  {
    name: `sound turned back on ${INSIDE} ms into the mute cue stays on`,
    run() {
      const page = newPage();
      page.mount();
      page.advance(MUTE_AT);
      page.click();
      page.advance(INSIDE);
      page.click();
      assert.equal(page.render().enabled, true, 'the switch says off after sound was turned back on');
      page.advance(1000);
      const view = page.render();
      assert.equal(view.enabled, true, 'the switch says off a second after sound was turned back on');
      assert.equal(page.cuelume.enabled, view.enabled, `cuelume is ${page.cuelume.enabled ? 'on' : 'off'} while the switch says ${view.enabled ? 'on' : 'off'}`);
      assert.equal(page.html.dataset.audio, 'on', 'html[data-audio] says off after sound was turned back on');
      assert.equal(page.storage.get(STORAGE_KEY), 'true', 'the stored preference says off after sound was turned back on');
      const off = offCalls(page, MUTE_AT);
      assert.equal(off.length, 0, `cuelume received setEnabled(false) ${off.map((c) => `${c.at - MUTE_AT} ms`).join(', ')} after the mute, though sound came back on at ${INSIDE} ms`);
      return `cuelume and the switch both on a second later; cuelume never received setEnabled(false)`;
    },
  },
  {
    name: `a second sound control mounting ${INSIDE} ms into the mute cue lets the cue finish`,
    run() {
      const page = newPage();
      page.mount('menu');
      page.advance(MUTE_AT);
      page.click('menu');
      page.advance(INSIDE);
      page.mount('switch');
      assert.equal(page.render('switch').enabled, false, 'the control that mounted after the mute says on');
      page.advance(1000);
      const offMs = assertMuteHeard(page);
      assert.equal(page.render('menu').enabled, false, 'the control that muted says on a second later');
      assert.equal(page.html.dataset.audio, 'off', 'html[data-audio] says on a second after the mute');
      return `the second control says off; cuelume off ${offMs} ms after the mute, the cue uncut`;
    },
  },
  {
    name: 'the wait comes from the recipe cuelume ships: a toggle cue whose layers ring twice as long is waited for',
    run() {
      const page = newPage({ themes: SLOWER });
      assert.ok(page.cue.cueMs > SHIPPED.latestMs, 'the slower recipe does not outlast the shipped wait, so it cannot tell a fixed wait from a read one');
      page.mount();
      page.advance(MUTE_AT);
      page.click();
      page.advance(1000);
      const offMs = assertMuteHeard(page);
      return `with every toggle layer's decay doubled: cue ${page.cue.cueMs.toFixed(1)} ms, cuelume off ${offMs} ms after the mute (latest allowed ${page.cue.latestMs} ms)`;
    },
  },
];

console.log(`Sound mute cue (${path.relative(process.cwd(), APP) || '.'}, node ${process.version})`);
const failures = [];
for (const c of CASES) {
  try {
    const detail = c.run();
    console.log(`  ok    ${c.name}\n        ${detail}`);
  } catch (e) {
    failures.push(c.name);
    console.log(`  FAIL  ${c.name}\n        ${String(e && e.message).split('\n')[0]}`);
  }
}

console.log(`\n${CASES.length - failures.length} passed, ${failures.length} failed`);
if (failures.length) {
  console.log(`Sound mute cue: ${failures.length} case(s) failed.`);
  process.exit(1);
}
console.log('Sound mute cue: a mute is heard to the end of its cue, and sound turned back on inside it stays on.');
