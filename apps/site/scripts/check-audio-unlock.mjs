#!/usr/bin/env node
/**
 * Audio unlock: a pointerdown, and the pointerup of a touch or a pen, start
 * the page's audio with cuelume's unlock(), which plays nothing. It waits
 * while the sound preference says off, and it counts as done only once audio
 * has started.
 *
 * WHY THIS EXISTS
 * Browsers start Web Audio only from a user gesture, and some mobile
 * browsers only inside the gesture itself, so a cue whose audio starts later
 * can stay silent. The site's cuelume binder (app/lib/cuelume-binder.tsx)
 * starts cuelume's shared AudioContext before any cue needs it. It did that
 * with play('tick') on the first pointerdown: a cue of its own, waiting on
 * the same resume as the press cue of the pointerdown that played it, so the
 * two sounded together. cuelume 0.2.6 added unlock(), which resumes the
 * context and plays nothing, and the binder now calls it. unlock() differs
 * from play() in two ways the binder has to answer for:
 *   - It starts audio whether or not cuelume is on, where play() did nothing
 *     while cuelume was off. So the binder skips it while html[data-audio]
 *     says off (the sound preference hook, app/lib/use-sound.tsx, writes
 *     it), and the binder starts no cuelume audio on a muted page.
 *   - It says whether audio started. It resolves false where the browser
 *     reports no user gesture yet. So the binder counts the unlock as done
 *     only once it resolves true, and the next attempt tries again.
 *     play('tick') spent the unlock on the first pointerdown, whatever that
 *     pointerdown did.
 * Which events are gestures is the HTML standard's list of activation-
 * triggering input events: a pointerdown only when its pointerType is mouse,
 * and a pointerup only when it is not, whatever button it reports. So a first
 * touch's pointerdown resolves false, and the binder tries again at that
 * touch's pointerup, the first gesture of the tap. It tries there even while
 * the pointerdown's call has not settled: where the browser cannot report a
 * gesture, a resume asked for outside one may wait, unsettled, until a resume
 * asked for inside one starts audio. A mouse pointerup is no gesture, and
 * its pointerdown has already tried, so it makes no call.
 *
 * HOW IT MEASURES
 * The real binder, loaded through scripts/lib/route-harness.js and mounted
 * once, with what it imports stood in for. React's useEffect runs the effect
 * on mount. cuelume's play records its calls, its bind returns an unbind
 * that does nothing, and its unlock records each call and returns a promise
 * the check resolves by hand, true or false, so each case decides when each
 * unlock ends and how. The binder's two
 * local modules, the haptics engine and the extended cues, load, and what in
 * them would sound or vibrate is swapped out: the extended cues record what
 * they are asked to play, and the haptics do nothing. The extended cues
 * import the sound preference hook (app/lib/use-sound.tsx), which reads
 * cuelume's recipes from cuelume/themes; those load for real, imported, since
 * cuelume's exports map offers them to import only. The page is a small
 * fake: a document that keeps the capture listeners the binder adds and the
 * html element's data-audio, an Element class for the binder's instanceof
 * test, window.matchMedia (a desktop mouse or a touch screen), and a
 * performance.now the check moves a second before each pointerdown, past the
 * binder's 700 ms guard against the mouse events a touch fires, and 100 ms
 * before each pointerup, a tap's length. A pointerdown or a pointerup goes to
 * the document's listeners as the browser sends it, with a pointerType and a
 * button (0, or 2 for a pen held with its barrel button pressed, per the
 * Pointer Events button table). Its unlock calls are counted as soon as the
 * listeners return, so a call made after the event itself does not count for
 * it. After it resolves an unlock, and before it reads what was played, the
 * check lets every pending promise callback run, and a promise the binder
 * leaves rejected fails the case.
 *
 * WHAT IT ASSERTS
 *   1. With no sound control on the page (no data-audio), mounting calls
 *      unlock() 0 times. A mouse pointerdown calls it once, inside the
 *      pointerdown, and plays nothing. Once it resolves true, two more
 *      pointerdowns call it 0 more times and play nothing.
 *   2. While data-audio says off, three pointerdowns call unlock() 0 times.
 *      Once it says on, the next pointerdown calls it.
 *   3. An unlock() that resolves false is called again by the next
 *      pointerdown, and again after a second false (touch pointerdowns with
 *      no pointerup). Once one resolves true, two more pointerdowns call it 0
 *      more times.
 *   4. With data-audio on, the first pointerdown calls unlock() once.
 *   5. On a touch screen, a touch's pointerdown on a press control calls
 *      unlock() once and plays the control's press cue and nothing else.
 *   6. Two pointerdowns before the first unlock() settles: when the first
 *      resolves true and any later one false, the next pointerdown calls
 *      unlock() 0 more times. A false that arrives late does not undo a true.
 *   7. On a touch screen, a first tap: its pointerdown calls unlock() once,
 *      which resolves false, and its pointerup calls it once more, inside the
 *      pointerup, which resolves true: 2 calls in the tap. Two more taps
 *      call it 0 more times. Nothing is played.
 *   8. On a touch screen, a tap on a control with a press and a release cue:
 *      its pointerup calls unlock() while the pointerdown's call has not
 *      settled, and the tap plays the press cue at its pointerdown and the
 *      release cue at its pointerup, nothing else. Once both resolve true, a
 *      tap calls it 0 more times.
 *   9. A mouse pointerup calls unlock() 0 times, on a desktop page and on a
 *      touch screen (a mouse on a tablet), though the mouse pointerdown's
 *      call resolved false; the next mouse pointerdown calls it again.
 *  10. On a touch screen, while data-audio says off, the pointerdown and the
 *      pointerup of two taps call unlock() 0 times. Once it says on, the next
 *      tap's pointerdown calls it (false) and its pointerup calls it again
 *      (true), and a later tap 0 more times.
 *  11. A pen does at its pointerup what a touch does, on a desktop page (a
 *      laptop's pen): its first tap's pointerdown resolves false, its
 *      pointerup calls unlock() again, which resolves true, and a later pen
 *      tap makes 0 calls. A pen tap with its barrel button pressed (button 2)
 *      calls unlock() at its pointerup too.
 *
 * PROVING IT CAN FAIL
 * --app <dir> loads app/lib/cuelume-binder.tsx from another apps/site
 * directory. Against the binder before unlock(), which played tick on the
 * first pointerdown, all eleven cases fail: it never calls unlock(). Against
 * the binder that called unlock() on a pointerdown only, cases 7, 8, 10 and
 * 11 fail and the other seven pass. Each of these changes to the current
 * binder fails the cases in brackets:
 *   - At the pointerup: the call dropped (7, 8, 10, 11); made for a mouse
 *     too (9); moved after guardButton, or made for button 0 only (11, the
 *     barrel-button pen); made for a touch only (11); gated on the screen,
 *     isCoarsePointer(), not the event's pointerType (9, 11); unlock() called
 *     there itself, past the data-audio and done checks (7, 8, 10, 11); made
 *     from a microtask after the pointerup (7, 8, 10, 11); moved below the
 *     press-host check (7, 10, 11); play('tick') beside it (7, 8, 10, 11).
 *   - At the pointerdown: the call made for a mouse only (3, 5, 7, 8, 10,
 *     11); moved below the desktop mouse branch (1, 2, 4, 6, 9).
 *   - In unlockAudio(): no new call while one is pending (8); no data-audio
 *     check (2, 10); a check for "on" where it checks for not "off" (1, 3,
 *     7, 9, 11); data-audio read once at mount (2, 10); done marked before
 *     the promise (3, 7, 8, 9, 10, 11), whatever it resolves (3, 7, 9, 10,
 *     11), never (1 to 4, 6 to 8, 10, 11), or to what each call resolves
 *     (6); unlock() called from a microtask (all eleven); play('tick') in
 *     place of unlock() (all eleven) or beside it (all but 6).
 *   - On mount: unlockAudio() also called (1, 3, 4, 7, 8, 9).
 *
 * Usage:  node scripts/check-audio-unlock.mjs [--app <dir>]
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

// cuelume's exports map offers cuelume/themes to import only, so its recipes are imported, not required.
const { THEMES } = await import('cuelume/themes');

/** The media queries the binder asks, answered for a desktop mouse or a touch screen. */
const MEDIA = {
  desktop: { '(hover: hover) and (pointer: fine)': true, '(pointer: coarse)': false },
  touch: { '(hover: hover) and (pointer: fine)': false, '(pointer: coarse)': true },
};
/** How far the clock moves before each pointerdown, past the binder's 700 ms guard against the mouse events a touch fires. */
const STEP_MS = 1000;
/** How far the clock moves before each pointerup: a tap's length. */
const TAP_MS = 100;
/** The button a pen reports while its barrel button is pressed (the Pointer Events button table). */
const PEN_BARREL = 2;

/** Lets every pending promise callback run: the queue empties before the next turn of the event loop. */
const settle = () => new Promise((resolve) => setImmediate(resolve));

/** An element with attributes and a parent, enough for closest('[attr]'), getAttribute and hasAttribute. */
class FakeElement {
  constructor(attrs = {}, parent = null) {
    this.attrs = { ...attrs };
    this.parent = parent;
  }
  getAttribute(name) {
    return Object.prototype.hasOwnProperty.call(this.attrs, name) ? this.attrs[name] : null;
  }
  hasAttribute(name) {
    return Object.prototype.hasOwnProperty.call(this.attrs, name);
  }
  closest(selector) {
    const m = /^\[([\w-]+)\]$/.exec(selector);
    if (!m) throw new Error(`the fake element answers closest() for one [attribute] selector only, not ${selector}`);
    for (let el = this; el; el = el.parent) if (el.hasAttribute(m[1])) return el;
    return null;
  }
}

/**
 * One page: the binder loaded fresh with its own cuelume, React, document
 * and clock. `open` puts the page's globals in place for one case and
 * `close` restores Node's.
 */
function newPage({ audio, media = 'desktop' } = {}) {
  const clock = { now: 10_000 };
  const unlocks = [];
  const played = [];
  const listeners = [];
  const effects = [];
  const html = { dataset: {} };
  if (audio !== undefined) html.dataset.audio = audio;
  const body = new FakeElement();

  const cuelume = {
    play(name) {
      played.push(`play('${name}')`);
    },
    unlock() {
      const call = { settled: undefined };
      call.promise = new Promise((resolve) => {
        call.resolve = (value) => {
          call.settled = value;
          resolve(value);
        };
      });
      unlocks.push(call);
      return call.promise;
    },
    bind() {
      return () => {};
    },
  };
  const react = {
    useEffect(fn) {
      effects.push(fn);
    },
  };
  const document = {
    documentElement: html,
    body,
    addEventListener(type, fn, options) {
      const capture = options === true || Boolean(options && options.capture);
      listeners.push({ type, fn, capture });
    },
    removeEventListener(type, fn, options) {
      const capture = options === true || Boolean(options && options.capture);
      const i = listeners.findIndex((l) => l.type === type && l.fn === fn && l.capture === capture);
      if (i >= 0) listeners.splice(i, 1);
    },
    contains(node) {
      return node instanceof FakeElement;
    },
  };
  const globals = {
    document,
    window: { matchMedia: (query) => ({ matches: Boolean(MEDIA[media][query]) }) },
    Element: FakeElement,
    performance: { now: () => clock.now },
  };

  let saved = null;
  const open = () => {
    saved = Object.keys(globals).map((k) => [k, Object.getOwnPropertyDescriptor(globalThis, k)]);
    for (const [k, value] of Object.entries(globals)) {
      Object.defineProperty(globalThis, k, { value, configurable: true, writable: true });
    }
  };
  const close = () => {
    for (const [k, d] of saved) {
      if (d) Object.defineProperty(globalThis, k, d);
      else delete globalThis[k];
    }
  };

  const h = createHarness({
    app: APP,
    stubs: { react, cuelume, 'cuelume/themes': { THEMES } },
    overrides: {
      'app/lib/haptics-engine.ts': (real) => ({
        ...real,
        warmHaptics() {},
        triggerHapticForCue() {},
        triggerHaptic() {},
      }),
      'app/lib/cuelume-extend.ts': (real) => ({
        ...real,
        playExtended(name) {
          played.push(`playExtended('${name}')`);
        },
      }),
    },
  });

  /** Load the binder and mount it once, as the root layout does. */
  const mount = () => {
    const { CuelumeBinder } = h.load('app/lib/cuelume-binder.tsx');
    CuelumeBinder();
    for (const fn of effects.splice(0)) fn();
  };

  /**
   * Send one pointer event to the document's listeners, capture first, as the
   * browser sends it; returns how many unlock() calls it made while the
   * listeners ran. The clock moves a second before a pointerdown and a tap's
   * length before a pointerup.
   */
  const send = (type, { pointerType = 'mouse', button = 0, target = body } = {}) => {
    clock.now += type === 'pointerdown' ? STEP_MS : TAP_MS;
    const before = unlocks.length;
    let stopped = false;
    const event = {
      type,
      pointerType,
      button,
      target,
      stopImmediatePropagation() {
        stopped = true;
      },
      stopPropagation() {},
      preventDefault() {},
    };
    const ordered = [...listeners.filter((l) => l.capture), ...listeners.filter((l) => !l.capture)];
    for (const l of ordered) {
      if (l.type !== type) continue;
      l.fn(event);
      if (stopped) break;
    }
    return unlocks.length - before;
  };
  const pointerdown = (options) => send('pointerdown', options);
  const pointerup = (options) => send('pointerup', options);
  /** One tap: a pointerdown, then its pointerup; returns the unlock() calls each made. */
  const tap = (options) => {
    const down = pointerdown(options);
    return { down, up: pointerup(options) };
  };

  /** Resolve unlock() call `i` (0-based, in call order) with `value`. */
  const resolveUnlock = (i, value) => {
    const call = unlocks[i];
    assert.ok(call, `there is no unlock() call ${i + 1} to resolve (${unlocks.length} made)`);
    assert.equal(call.settled, undefined, `unlock() call ${i + 1} already resolved`);
    call.resolve(value);
  };

  return { html, body, unlocks, played, open, close, mount, pointerdown, pointerup, tap, resolveUnlock };
}

/** Run one case's steps on a fresh page whose globals stay in place for the length of the case. */
async function onPage(options, steps) {
  const page = newPage(options);
  page.open();
  try {
    return await steps(page);
  } finally {
    page.close();
  }
}

const nothingPlayed = (page, when) =>
  assert.deepEqual(page.played, [], `${when}, the binder played ${page.played.join(', ')}`);
/** What the page played so far, for a failure message. */
const playedSoFar = (page) => (page.played.length ? page.played.join(', ') : 'nothing');

const CASES = [
  {
    name: 'with no sound control on the page, a mouse pointerdown calls unlock() once and plays nothing; once it resolves true, later pointerdowns leave it alone',
    run: () =>
      onPage({ media: 'desktop' }, async (page) => {
        page.mount();
        await settle();
        assert.equal(page.unlocks.length, 0, 'mounting the binder called unlock() before any pointerdown');
        const first = page.pointerdown();
        assert.equal(first, 1, `the first pointerdown made ${first} unlock() call(s) while it ran (${page.unlocks.length} in all), expected 1; it played ${playedSoFar(page)}`);
        await settle();
        nothingPlayed(page, 'after the first pointerdown on a plain element');
        page.resolveUnlock(0, true);
        await settle();
        page.pointerdown();
        page.pointerdown();
        await settle();
        assert.equal(page.unlocks.length, 1, `unlock() was called ${page.unlocks.length} times; it resolved true on the first, so 1 was enough`);
        nothingPlayed(page, 'after three pointerdowns on a plain element');
        return '1 unlock() call, made inside the first pointerdown; 0 cues played; 0 calls after it resolved true';
      }),
  },
  {
    name: 'while html[data-audio] says off, pointerdowns do not call unlock(); the first pointerdown after it says on does',
    run: () =>
      onPage({ audio: 'off', media: 'desktop' }, async (page) => {
        page.mount();
        page.pointerdown();
        page.pointerdown();
        page.pointerdown();
        await settle();
        assert.equal(page.unlocks.length, 0, `three pointerdowns while sound was off called unlock() ${page.unlocks.length} time(s): a muted page would start audio`);
        page.html.dataset.audio = 'on';
        const made = page.pointerdown();
        assert.equal(made, 1, `the first pointerdown after sound came on made ${made} unlock() call(s), expected 1`);
        page.resolveUnlock(0, true);
        await settle();
        page.pointerdown();
        await settle();
        assert.equal(page.unlocks.length, 1, `unlock() was called ${page.unlocks.length} times after sound came on; it resolved true on the first`);
        nothingPlayed(page, 'after five pointerdowns on a plain element');
        return '0 unlock() calls while off; 1 on the first pointerdown after on, and none after it resolved true';
      }),
  },
  {
    name: 'an unlock() that resolves false is tried again on the next pointerdown, until one resolves true (touch pointerdowns, no pointerup)',
    run: () =>
      onPage({ media: 'touch' }, async (page) => {
        page.mount();
        for (let i = 0; i < 2; i += 1) {
          const made = page.pointerdown({ pointerType: 'touch' });
          assert.equal(made, 1, `touch pointerdown ${i + 1} made ${made} unlock() call(s), expected 1 (${i} earlier call(s) resolved false)`);
          page.resolveUnlock(i, false);
          await settle();
        }
        const third = page.pointerdown({ pointerType: 'touch' });
        assert.equal(third, 1, `touch pointerdown 3, after two unlock() calls resolved false, made ${third} call(s), expected 1`);
        page.resolveUnlock(2, true);
        await settle();
        page.pointerdown({ pointerType: 'touch' });
        page.pointerdown({ pointerType: 'touch' });
        await settle();
        assert.equal(page.unlocks.length, 3, `unlock() was called ${page.unlocks.length} times; the third resolved true, so 3 were enough`);
        nothingPlayed(page, 'after five touch pointerdowns on a plain element');
        return 'false, false, true: 3 unlock() calls, one per touch pointerdown, and none after the true';
      }),
  },
  {
    name: 'with html[data-audio="on"], the first pointerdown calls unlock()',
    run: () =>
      onPage({ audio: 'on', media: 'desktop' }, async (page) => {
        page.mount();
        const made = page.pointerdown();
        assert.equal(made, 1, `the first pointerdown with sound on made ${made} unlock() call(s), expected 1`);
        page.resolveUnlock(0, true);
        await settle();
        page.pointerdown();
        await settle();
        assert.equal(page.unlocks.length, 1, `unlock() was called ${page.unlocks.length} times; it resolved true on the first`);
        nothingPlayed(page, 'after two pointerdowns on a plain element');
        return '1 unlock() call, on the first pointerdown';
      }),
  },
  {
    name: "on a touch screen, a touch's pointerdown on a press control calls unlock() and plays only its press cue",
    run: () =>
      onPage({ audio: 'on', media: 'touch' }, async (page) => {
        page.mount();
        const control = new FakeElement({ 'data-cuelume-press': '' }, page.body);
        const made = page.pointerdown({ pointerType: 'touch', target: control });
        assert.equal(made, 1, `the touch pointerdown made ${made} unlock() call(s), expected 1; it played ${playedSoFar(page)}`);
        await settle();
        assert.deepEqual(page.played, ["play('press')"], `the touch pointerdown played ${page.played.join(', ') || 'nothing'}, expected its press cue alone`);
        return "1 unlock() call; played play('press') alone";
      }),
  },
  {
    name: 'a false that resolves after a true does not undo it: two pointerdowns before the first unlock() settles',
    run: () =>
      onPage({ audio: 'on', media: 'desktop' }, async (page) => {
        page.mount();
        page.pointerdown();
        page.pointerdown();
        assert.ok(page.unlocks.length >= 1, 'two pointerdowns called unlock() 0 times');
        const calls = page.unlocks.length;
        page.resolveUnlock(0, true);
        await settle();
        for (let i = 1; i < calls; i += 1) page.resolveUnlock(i, false);
        await settle();
        const made = page.pointerdown();
        await settle();
        assert.equal(made, 0, `the pointerdown after unlock() resolved true (and then false ${calls - 1} time(s)) made ${made} more call(s)`);
        return `${calls} unlock() call(s) before any settled; first true, the rest false; 0 calls after`;
      }),
  },
  {
    name: "on a touch screen, a first tap's pointerdown resolves false and its pointerup calls unlock() again, which resolves true; later taps leave it alone",
    run: () =>
      onPage({ media: 'touch' }, async (page) => {
        page.mount();
        const down = page.pointerdown({ pointerType: 'touch' });
        assert.equal(down, 1, `the first touch pointerdown made ${down} unlock() call(s), expected 1`);
        page.resolveUnlock(0, false);
        await settle();
        const up = page.pointerup({ pointerType: 'touch' });
        assert.equal(up, 1, `the first touch pointerup, after its pointerdown's unlock() resolved false, made ${up} unlock() call(s) while it ran (${page.unlocks.length} in all), expected 1: a touch is a user gesture only at its pointerup`);
        page.resolveUnlock(1, true);
        await settle();
        for (let i = 2; i <= 3; i += 1) {
          const { down: d, up: u } = page.tap({ pointerType: 'touch' });
          assert.equal(d + u, 0, `tap ${i}, after the first tap's pointerup resolved true, made ${d} call(s) at its pointerdown and ${u} at its pointerup, expected 0`);
        }
        await settle();
        assert.equal(page.unlocks.length, 2, `three taps called unlock() ${page.unlocks.length} times, expected 2`);
        nothingPlayed(page, 'after three taps on a plain element');
        return '1 unlock() call at the pointerdown (false), 1 inside the pointerup (true); 0 in two more taps; 0 cues played';
      }),
  },
  {
    name: "on a touch screen, a tap's pointerup calls unlock() while its pointerdown's call has not settled, and the tap plays only the control's press and release cues",
    run: () =>
      onPage({ audio: 'on', media: 'touch' }, async (page) => {
        page.mount();
        const control = new FakeElement({ 'data-cuelume-press': '', 'data-cuelume-release': '' }, page.body);
        const down = page.pointerdown({ pointerType: 'touch', target: control });
        assert.equal(down, 1, `the touch pointerdown made ${down} unlock() call(s), expected 1`);
        await settle();
        assert.deepEqual(page.played, ["play('press')"], `the touch pointerdown played ${playedSoFar(page)}, expected its press cue alone`);
        assert.equal(page.unlocks[0].settled, undefined, "the pointerdown's unlock() call settled before the check resolved it");
        const up = page.pointerup({ pointerType: 'touch', target: control });
        assert.equal(up, 1, `the touch pointerup, with its pointerdown's unlock() not yet settled, made ${up} unlock() call(s) while it ran, expected 1: the pointerdown's resume may be waiting for a gesture, and this pointerup is one`);
        await settle();
        assert.deepEqual(page.played, ["play('press')", "play('release')"], `the tap played ${playedSoFar(page)}, expected its press cue, then its release cue`);
        page.resolveUnlock(0, true);
        page.resolveUnlock(1, true);
        await settle();
        const { down: d, up: u } = page.tap({ pointerType: 'touch' });
        await settle();
        assert.equal(d + u, 0, `the tap after both calls resolved true made ${d} call(s) at its pointerdown and ${u} at its pointerup, expected 0`);
        assert.equal(page.unlocks.length, 2, `two taps called unlock() ${page.unlocks.length} times, expected 2`);
        return "1 call at the pointerdown, 1 at the pointerup with the first unsettled; played play('press'), play('release'); 0 calls after both resolved true";
      }),
  },
  {
    name: "a mouse pointerup never calls unlock(), on a desktop or a touch screen; only the mouse's pointerdown does",
    run: async () => {
      const desktop = await onPage({ media: 'desktop' }, async (page) => {
        page.mount();
        const down = page.pointerdown();
        assert.equal(down, 1, `the mouse pointerdown made ${down} unlock() call(s), expected 1`);
        page.resolveUnlock(0, false);
        await settle();
        const up = page.pointerup();
        assert.equal(up, 0, `a mouse pointerup on a desktop page, after its pointerdown's unlock() resolved false, made ${up} unlock() call(s), expected 0: a mouse pointerup is no gesture`);
        const again = page.pointerdown();
        assert.equal(again, 1, `the next mouse pointerdown made ${again} unlock() call(s), expected 1`);
        page.resolveUnlock(1, true);
        await settle();
        const upAfter = page.pointerup();
        assert.equal(upAfter, 0, `a mouse pointerup after unlock() resolved true made ${upAfter} call(s), expected 0`);
        await settle();
        assert.equal(page.unlocks.length, 2, `two mouse clicks called unlock() ${page.unlocks.length} times, expected 2, both at a pointerdown`);
        nothingPlayed(page, 'after two mouse clicks on a plain element');
        return page.unlocks.length;
      });
      const tablet = await onPage({ media: 'touch' }, async (page) => {
        page.mount();
        const down = page.pointerdown();
        assert.equal(down, 1, `a mouse pointerdown on a touch screen made ${down} unlock() call(s), expected 1`);
        page.resolveUnlock(0, false);
        await settle();
        const up = page.pointerup();
        assert.equal(up, 0, `a mouse pointerup on a touch screen (a mouse on a tablet), after its pointerdown's unlock() resolved false, made ${up} unlock() call(s), expected 0: the binder goes by the event's pointerType, not the screen`);
        await settle();
        nothingPlayed(page, 'after a mouse click on a plain element of a touch screen');
        return page.unlocks.length;
      });
      return `desktop: ${desktop} calls in two clicks, both at a pointerdown; touch screen: ${tablet} call in one click, at its pointerdown; 0 at any mouse pointerup`;
    },
  },
  {
    name: 'on a touch screen, while html[data-audio] says off, neither the pointerdown nor the pointerup of a tap calls unlock(); after it says on, both do',
    run: () =>
      onPage({ audio: 'off', media: 'touch' }, async (page) => {
        page.mount();
        for (let i = 1; i <= 2; i += 1) {
          const { down, up } = page.tap({ pointerType: 'touch' });
          assert.equal(down, 0, `touch pointerdown ${i} while sound was off made ${down} unlock() call(s), expected 0`);
          assert.equal(up, 0, `touch pointerup ${i} while sound was off made ${up} unlock() call(s), expected 0: a muted page would start audio`);
        }
        await settle();
        assert.equal(page.unlocks.length, 0, `two taps while sound was off called unlock() ${page.unlocks.length} time(s)`);
        page.html.dataset.audio = 'on';
        const down = page.pointerdown({ pointerType: 'touch' });
        assert.equal(down, 1, `the first touch pointerdown after sound came on made ${down} unlock() call(s), expected 1`);
        page.resolveUnlock(0, false);
        await settle();
        const up = page.pointerup({ pointerType: 'touch' });
        assert.equal(up, 1, `the first touch pointerup after sound came on made ${up} unlock() call(s), expected 1`);
        page.resolveUnlock(1, true);
        await settle();
        const { down: d, up: u } = page.tap({ pointerType: 'touch' });
        await settle();
        assert.equal(d + u, 0, `the tap after unlock() resolved true made ${d + u} more call(s)`);
        nothingPlayed(page, 'after four taps on a plain element');
        return '0 unlock() calls in two taps while off; after on, 1 at the pointerdown (false) and 1 at the pointerup (true); 0 after';
      }),
  },
  {
    name: 'a pen does at its pointerup what a touch does, whatever button it reports',
    run: async () => {
      const tip = await onPage({ media: 'desktop' }, async (page) => {
        page.mount();
        const down = page.pointerdown({ pointerType: 'pen' });
        assert.equal(down, 1, `the first pen pointerdown made ${down} unlock() call(s), expected 1`);
        page.resolveUnlock(0, false);
        await settle();
        const up = page.pointerup({ pointerType: 'pen' });
        assert.equal(up, 1, `the first pen pointerup on a desktop page (a laptop's pen), after its pointerdown's unlock() resolved false, made ${up} unlock() call(s) while it ran, expected 1: a pen is a user gesture at its pointerup, as a touch is`);
        page.resolveUnlock(1, true);
        await settle();
        const { down: d, up: u } = page.tap({ pointerType: 'pen' });
        await settle();
        assert.equal(d + u, 0, `the pen tap after unlock() resolved true made ${d + u} more call(s)`);
        nothingPlayed(page, 'after two pen taps on a plain element');
        return page.unlocks.length;
      });
      await onPage({ media: 'touch' }, async (page) => {
        page.mount();
        page.pointerdown({ pointerType: 'pen', button: PEN_BARREL });
        for (let i = 0; i < page.unlocks.length; i += 1) page.resolveUnlock(i, false);
        await settle();
        const before = page.unlocks.length;
        const up = page.pointerup({ pointerType: 'pen', button: PEN_BARREL });
        assert.equal(up, 1, `a pen pointerup with its barrel button pressed (button ${PEN_BARREL}) made ${up} unlock() call(s) while it ran, expected 1: the pointerup is a user gesture whatever button it reports`);
        page.resolveUnlock(before, true);
        await settle();
        nothingPlayed(page, 'after a barrel-button pen tap');
      });
      return `${tip} unlock() calls for the pen tip: 1 at the pointerdown (false), 1 at the pointerup (true), 0 after; 1 at the pointerup of a barrel-button pen tap`;
    },
  },
];

const stray = [];
process.on('unhandledRejection', (reason) => {
  stray.push(reason);
});

console.log(`Audio unlock (${path.relative(process.cwd(), APP) || '.'}, node ${process.version})`);
const failures = [];
for (const [i, c] of CASES.entries()) {
  stray.length = 0;
  try {
    const detail = await c.run();
    await settle();
    if (stray.length) throw new Error(`a promise the binder left rejected: ${String(stray[0] && stray[0].message ? stray[0].message : stray[0])}`);
    console.log(`  ok    ${i + 1}. ${c.name}\n        ${detail}`);
  } catch (e) {
    failures.push(c.name);
    console.log(`  FAIL  ${i + 1}. ${c.name}\n        ${String(e && e.message).split('\n')[0]}`);
  }
}

console.log(`\n${CASES.length - failures.length} passed, ${failures.length} failed`);
if (failures.length) {
  console.log(`Audio unlock: ${failures.length} case(s) failed.`);
  process.exit(1);
}
console.log('Audio unlock: pointerdowns, and the pointerups of a touch or a pen, start audio with unlock() and play nothing, never while sound is off, until audio has started.');
