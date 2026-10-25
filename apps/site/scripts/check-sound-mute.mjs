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
 * in production; a stand-in for cuelume that keeps what a listener would
 * hear (when each cue starts, when it ends, and when setEnabled(false) cut
 * it); and a clock the check moves by hand, so no case depends on how busy
 * the machine is. How long the toggle cue sounds is read from cuelume's own
 * recipe through its cuelume/themes export (from this checkout's
 * node_modules): each layer of the default theme's toggle cue starts at its
 * offset, swells over its attack and falls 60 dB over its decay. At the
 * normal emphasis the site plays, the cue ends when the last of the layers
 * that emphasis plays has fallen (a quick repeat only shortens it). The
 * layer only strong emphasis adds sets the latest moment cuelume may still
 * be on.
 *
 * WHAT IT ASSERTS
 *   - The toggle cue has no release part, so its layers are all of it.
 *   - A mute turns the switch off at once (its state, html[data-audio] and
 *     the stored preference), plays the toggle cue, and turns cuelume off
 *     no earlier than the end of that cue and no later than the end of its
 *     longest layer at any emphasis, rounded up to a whole millisecond.
 *   - Sound turned back on 10 ms into the mute cue stays on: a second
 *     later cuelume, the switch, html[data-audio] and the stored preference
 *     all say on, and cuelume never received setEnabled(false).
 *
 * PROVING IT CAN FAIL
 * --app <dir> loads app/lib/use-sound.tsx from another apps/site directory.
 * Against the hook before this change, both cases fail: it turns cuelume
 * off in the click, 0 ms into the cue. Against this hook with the lines
 * that cancel a waiting mute removed, the second case fails: cuelume turns
 * off after the wait while the switch says on.
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

const TOGGLE = THEMES.default.toggle;
/** The toggle cue as the site plays it, at normal emphasis. */
const CUE_MS = Math.max(...TOGGLE.layers.filter((l) => RANK[l.from ?? 'subtle'] <= RANK.normal).map(layerEnd));
/** Its longest layer at any emphasis, rounded up to a whole ms: cuelume is off by then. */
const LATEST_MS = Math.ceil(Math.max(...TOGGLE.layers.map(layerEnd)));
/** Where each case's mute happens, well after the mount. */
const MUTE_AT = 1000;
/** How far into the mute cue the second case turns sound back on. */
const UNMUTE_AFTER = 10;

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
function fakeCuelume(clock) {
  const state = { enabled: true, cues: [], calls: [] };
  const module = {
    play(name) {
      state.calls.push({ fn: 'play', arg: name, at: clock.now });
      if (!state.enabled) return;
      state.cues.push({ name, at: clock.now, end: clock.now + (name === 'toggle' ? CUE_MS : 0), cutAt: null });
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
  return { state, module };
}

/** useState, useCallback and useEffect for one hook; a state update is applied once. */
function fakeReact() {
  const slots = [];
  let cursor = 0;
  let effects = [];
  const module = {
    useState(initial) {
      const i = cursor++;
      if (i >= slots.length) slots.push(typeof initial === 'function' ? initial() : initial);
      return [slots[i], (v) => { slots[i] = typeof v === 'function' ? v(slots[i]) : v; }];
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
  /** Render the hook; on mount, run its effects, as React does once. */
  const render = (hook, mount = false) => {
    cursor = 0;
    effects = [];
    const out = hook();
    if (mount) for (const fn of effects) fn();
    return out;
  };
  return { module, render };
}

/**
 * One page: the hook loaded fresh with its own cuelume, React and clock, and
 * the browser globals it reads. `run` puts the page's globals in place for
 * the length of one synchronous step and restores Node's afterwards.
 */
function newPage() {
  const clock = fakeClock();
  const cuelume = fakeCuelume(clock);
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
  const h = createHarness({ app: APP, stubs: { react: react.module, cuelume: cuelume.module, 'cuelume/themes': { THEMES } } });
  const { useSoundPreference } = run(() => h.load('app/lib/use-sound.tsx'));
  const render = (mount = false) => run(() => react.render(useSoundPreference, mount));
  const click = () => run(() => render().toggle());
  const advance = (ms) => run(() => clock.advance(ms));
  return { clock, cuelume: cuelume.state, storage, html, render, click, advance };
}

/** The setEnabled(false) calls cuelume received at or after `from`. */
const offCalls = (page, from) => page.cuelume.calls.filter((c) => c.fn === 'setEnabled' && c.arg === false && c.at >= from);

const CASES = [
  {
    name: 'a mute plays the toggle cue to its end, then turns cuelume off',
    run() {
      assert.equal(TOGGLE.release, undefined, 'the toggle cue has a release part now: its length is no longer its layers alone');
      const page = newPage();
      page.render(true);
      page.advance(MUTE_AT);
      assert.equal(page.render().enabled, true, 'sound is not on after the mount');
      page.click();
      assert.equal(page.render().enabled, false, 'the switch still says on after the mute');
      assert.equal(page.html.dataset.audio, 'off', 'html[data-audio] still says on after the mute');
      assert.equal(page.storage.get(STORAGE_KEY), 'false', 'the mute was not stored');
      const cue = page.cuelume.cues.find((c) => c.at === MUTE_AT);
      assert.ok(cue && cue.name === 'toggle', 'the mute played no toggle cue');
      page.advance(1000);
      const off = offCalls(page, MUTE_AT);
      assert.ok(off.length > 0, 'cuelume was never turned off after the mute');
      const offMs = off[0].at - MUTE_AT;
      assert.ok(offMs >= CUE_MS, `cuelume was turned off ${offMs} ms into the ${CUE_MS.toFixed(1)} ms toggle cue`);
      assert.ok(offMs <= LATEST_MS, `cuelume stayed on ${offMs} ms after the mute, past the ${LATEST_MS} ms its longest layer lasts`);
      assert.equal(cue.cutAt, null, 'the toggle cue was cut before its end');
      assert.equal(page.cuelume.enabled, false, 'cuelume is on a second after the mute');
      return `toggle cue ${CUE_MS.toFixed(1)} ms, cuelume off ${offMs} ms after the mute (latest allowed ${LATEST_MS} ms)`;
    },
  },
  {
    name: `sound turned back on ${UNMUTE_AFTER} ms into the mute cue stays on`,
    run() {
      const page = newPage();
      page.render(true);
      page.advance(MUTE_AT);
      page.click();
      page.advance(UNMUTE_AFTER);
      page.click();
      assert.equal(page.render().enabled, true, 'the switch says off after sound was turned back on');
      page.advance(1000);
      const view = page.render();
      assert.equal(view.enabled, true, 'the switch says off a second after sound was turned back on');
      assert.equal(page.cuelume.enabled, view.enabled, `cuelume is ${page.cuelume.enabled ? 'on' : 'off'} while the switch says ${view.enabled ? 'on' : 'off'}`);
      assert.equal(page.html.dataset.audio, 'on', 'html[data-audio] says off after sound was turned back on');
      assert.equal(page.storage.get(STORAGE_KEY), 'true', 'the stored preference says off after sound was turned back on');
      const off = offCalls(page, MUTE_AT);
      assert.equal(off.length, 0, `cuelume received setEnabled(false) ${off.map((c) => `${c.at - MUTE_AT} ms`).join(', ')} after the mute, though sound came back on at ${UNMUTE_AFTER} ms`);
      return `cuelume and the switch both on a second later; cuelume never received setEnabled(false)`;
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
