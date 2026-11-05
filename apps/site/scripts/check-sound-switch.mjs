#!/usr/bin/env node
/**
 * Sound switch: the extended cues play nothing while the site's sound switch
 * is off, and the score form follows the same switch as the rest of the site.
 *
 * WHY THIS EXISTS
 * The sound preference hook (app/lib/use-sound.tsx) turns cuelume on and off
 * and mirrors the setting on html[data-audio]. The extended cues
 * (app/lib/cuelume-extend.ts: error, warning, info, blocked, retry, the check
 * ticks, the processing loop and the grade reveal) do not go through cuelume,
 * so the switch never reached them: the copy button's cues and the error cue
 * on the 404 and error pages could sound with sound off, and a processing
 * loop kept pulsing after a mute. The score form gated its cues on a reading
 * of the preference of its own, which could disagree with the switch: it
 * said off under reduced motion even after the visitor had turned sound on,
 * and off whenever storage could not be read. Every extended cue now checks
 * one thing before it touches audio: html[data-audio] where a sound control
 * has set it, and on a page with none, the reading a sound control makes
 * when it mounts (soundPreference in use-sound.tsx): a stored "true" or
 * "false", else on unless reduced motion is set. The score form plays its
 * cues through them and keeps no reading of its own.
 *
 * HOW IT MEASURES
 * The real modules, loaded through scripts/lib/route-harness.js, on a page
 * stood in for: html[data-audio], window.matchMedia answering
 * prefers-reduced-motion, localStorage (a store, or one whose every call
 * throws, as a browser that blocks storage does), a clock the check moves by
 * hand for the timers and for requestAnimationFrame, and a Web Audio
 * AudioContext that counts each one made and records each oscillator
 * started. A cue is heard when it starts an oscillator. Each page loads the
 * modules fresh, so no AudioContext or loop carries over from another. The
 * extended cues are called by name, as the binder and the copy button call
 * them. The score form is rendered with a small stand-in for React
 * (useState, useRef, useMemo, useCallback, useEffect and useLayoutEffect;
 * effects run after a render when their dependencies change), its JSX built
 * as plain objects and never mounted. Given a URL, it scores it on mount, as
 * a deep link does. The check answers the scoring request by hand after
 * 1.2 s, then renders the form again and runs the count-up's frame 1.3 s
 * later, past its 1.2 s; a second form gets a rate-limit error. cuelume and
 * next/link are stood in for, and cuelume's recipes are its own
 * (cuelume/themes). Calls to the extended cues are labelled with their name
 * as they are made, so on an AudioContext that is running, a pulse of the
 * processing loop, which its timer plays, is the only sound with no label.
 * A cue played once a waiting AudioContext starts has no label either, so
 * the cases that start one waiting count every sound they hear.
 *
 * WHAT IT ASSERTS
 *   1. With html[data-audio] "on", every extended cue is heard: error,
 *      warning, info, blocked, retry, check-pass, check-fail, the grade
 *      reveal for A+, A, B, C, D and F, and the processing loop. With it
 *      "off", none is, and no AudioContext is made. The stored preference
 *      says the other way each time, as another tab can leave it, so only
 *      the attribute can decide.
 *   2. A processing loop started while sound is on pulses at 0, 500 and
 *      1000 ms; muted at 1200 ms, it is not heard in the next 3.8 s.
 *      Started again once sound is back on, it pulses, and processing-stop
 *      ends it. Started while sound is off, it is never heard and makes no
 *      AudioContext. Stopped while sound is off, it stays stopped when sound
 *      comes back on before its next pulse. Stopped before its AudioContext
 *      has started, it is not heard once that AudioContext starts.
 *   3. A cue asked for while sound is on, whose AudioContext starts only
 *      after a mute, is not heard; one whose AudioContext starts while sound
 *      is still on is.
 *   4. With no sound control on the page (no html[data-audio]), the info and
 *      error cues are heard exactly when a sound control mounting on that
 *      page says on: a stored "true" under reduced motion (on), a stored
 *      "false" (off), nothing stored under reduced motion (off) and without
 *      (on), and storage that throws, without reduced motion (on) and under
 *      it (off). The control is the real sound preference hook, mounted
 *      after the cues are played, and it writes that same answer to
 *      html[data-audio].
 *   5. to 8. The score form on four pages: the switch on (html[data-audio]
 *      "on" with a stored "true", under reduced motion: a visitor who turned
 *      sound on), the switch off ("off" with a stored "true"), no switch
 *      with a stored "true" under reduced motion, and no switch with storage
 *      that throws. Where the switch is on, a graded run plays the
 *      processing pulse while the request is out and the grade reveal when
 *      the result lands, and without reduced motion the check ticks of the
 *      count-up too; no pulse is heard once the answer is in; a run answered
 *      with a rate limit plays the blocked cue. Where it is off, neither run
 *      plays anything and no AudioContext is made.
 *
 * PROVING IT CAN FAIL
 * --app <dir> loads the modules from another apps/site directory. Against
 * the extended cues and the score form before this check, all 8 cases fail:
 * every cue is heard with the switch off, the processing loop pulses on
 * after a mute, and the score form plays nothing under reduced motion or
 * with storage that throws, whatever the switch says, and everything with
 * the switch off when the stored preference says on. Each of these changes
 * to the current code fails the cases in brackets:
 *   - In the extended cues: no switch check before the AudioContext is
 *     made, the one after it kept (1, 2, 6: an AudioContext made while
 *     off); no check when a waiting AudioContext starts (3); no check in the
 *     processing loop's pulse (2); processing-stop sent through the switch
 *     check (2); a processing-start whose AudioContext is still waiting
 *     begins its loop though a processing-stop came first (2);
 *     processing-stop not counted, so a waiting processing-start does not
 *     see it (2); only "on" read as on, so no switch reads as off (4, 7, 8);
 *     the attribute ignored, the stored preference read alone (1, 2, 3, 6);
 *     storage that throws read as off (4, 8).
 *   - In soundPreference: reduced motion read as off before a stored "true"
 *     (4, 7), so the sound control mounts off too.
 *   - In the score form: a reading of its own (reduced motion or a stored
 *     "false" says off, storage that throws says off) put back in front of
 *     the processing loop (5, 7, 8); the grade reveal dropped from its
 *     reduced-motion branch (5, 7).
 *
 * Usage:  node scripts/check-sound-switch.mjs [--app <dir>]
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

const STORAGE_KEY = 'designesy:sound';
const REDUCED_MOTION = '(prefers-reduced-motion: reduce)';
/** The cues the binder, the copy button and the score form play by name. */
const CUES = ['error', 'warning', 'info', 'blocked', 'retry', 'check-pass', 'check-fail'];
const GRADES = ['A+', 'A', 'B', 'C', 'D', 'F'];
/** How long the score form's request is out before the check answers it. */
const REQUEST_MS = 1200;
/** Past the score form's 1.2 s count-up, so one frame is its last. */
const COUNT_UP_MS = 1300;
/** A graded result, as /api/score answers one. */
const GRADED = {
  ok: true,
  score: 82.5,
  grade: 'B',
  pass: 30,
  fail: 3,
  warn: 2,
  skip: 1,
  manual: 1,
  total: 37,
  scope: 'universal',
  categoryScores: { accessibility: { score: 90, weight: 15, pass: 9, fail: 1, warn: 0, skip: 0 } },
  checks: [{ id: 'a01', item: 'Images have alt text', category: 'accessibility', status: 'PASS', detail: 'All images carry alt text.' }],
  tokensExtracted: 12,
};
/** A run the server refuses: the form plays the blocked cue for it. */
const RATE_LIMITED = { ok: false, error: 'Rate limit reached: try again in a minute.' };

/** Lets every pending promise callback run: the queue empties before the next turn of the event loop. */
const settle = () => new Promise((resolve) => setImmediate(resolve));

/** setTimeout, setInterval and their clears on a clock the check moves by hand. */
function fakeClock() {
  let seq = 0;
  const timers = new Map();
  const add = (fn, ms, every) => {
    seq += 1;
    timers.set(seq, { at: clock.now + Math.max(0, Number(ms) || 0), fn, every });
    return seq;
  };
  const clock = {
    now: 0,
    setTimeout: (fn, ms) => add(fn, ms, 0),
    setInterval: (fn, ms) => add(fn, ms, Math.max(1, Number(ms) || 0)),
    clear: (id) => {
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
        clock.now = next.t.at;
        if (next.t.every) next.t.at += next.t.every;
        else timers.delete(next.id);
        next.t.fn();
      }
      clock.now = end;
    },
  };
  return clock;
}

/** A Web Audio AudioContext that counts each one made and records each oscillator started. */
function fakeAudioContext(page) {
  const param = () => ({
    value: 0,
    setValueAtTime(v) {
      this.value = v;
      return this;
    },
    linearRampToValueAtTime() {
      return this;
    },
    exponentialRampToValueAtTime() {
      return this;
    },
  });
  const node = (extra = {}) => ({ connect: (to) => to, disconnect() {}, ...extra });
  return class FakeAudioContext {
    constructor() {
      page.contexts += 1;
      this.state = page.startSuspended ? 'suspended' : 'running';
      this.sampleRate = 8000;
      this.destination = node();
    }
    get currentTime() {
      return page.clock.now / 1000;
    }
    resume() {
      return new Promise((resolve) => {
        page.resumes.push(() => {
          this.state = 'running';
          resolve();
        });
      });
    }
    createGain() {
      return node({ gain: param() });
    }
    createBiquadFilter() {
      return node({ type: 'lowpass', frequency: param() });
    }
    createConvolver() {
      return node({ buffer: null });
    }
    createBuffer(channels, length) {
      const data = Array.from({ length: channels }, () => new Float32Array(length));
      return { getChannelData: (ch) => data[ch] };
    }
    createOscillator() {
      const osc = node({
        type: 'sine',
        frequency: param(),
        start() {
          page.heard.push({ at: page.clock.now, cue: page.cue, freq: osc.frequency.value, type: osc.type });
        },
        stop() {},
      });
      return osc;
    }
  };
}

/**
 * useState, useRef, useMemo, useCallback, useEffect and useLayoutEffect for
 * any number of rendered components, each with its own hooks. An effect runs
 * after the render that declared it when its dependencies changed, and its
 * cleanup first; a state update is applied at once and read on the next
 * render. Any other hook throws, naming itself.
 */
function fakeReact() {
  let inst = null;
  const changed = (a, b) => !a || !b || a.length !== b.length || a.some((v, i) => !Object.is(v, b[i]));
  const next = () => {
    if (!inst) throw new Error('a hook was called outside a render');
    inst.cursor += 1;
    return inst.cursor - 1;
  };
  const effect = (fn, deps) => {
    const i = next();
    const prev = inst.slots[i];
    if (!prev || !deps || changed(prev.deps, deps)) inst.queue.push(i);
    inst.slots[i] = { fn, deps, cleanup: prev ? prev.cleanup : undefined };
  };
  const hooks = {
    useState(initial) {
      const i = next();
      if (!(i in inst.slots)) inst.slots[i] = { value: typeof initial === 'function' ? initial() : initial };
      const s = inst.slots[i];
      return [s.value, (v) => {
        s.value = typeof v === 'function' ? v(s.value) : v;
      }];
    },
    useRef(initial) {
      const i = next();
      if (!(i in inst.slots)) inst.slots[i] = { current: initial };
      return inst.slots[i];
    },
    useMemo(fn, deps) {
      const i = next();
      const prev = inst.slots[i];
      if (!prev || changed(prev.deps, deps)) inst.slots[i] = { value: fn(), deps };
      return inst.slots[i].value;
    },
    useCallback(fn, deps) {
      return hooks.useMemo(() => fn, deps);
    },
    useEffect: effect,
    useLayoutEffect: effect,
  };
  const api = new Proxy(hooks, {
    get(target, key) {
      if (key in target) return target[key];
      if (typeof key === 'string' && /^use[A-Z]/.test(key)) {
        return () => {
          throw new Error(`the stand-in for React has no ${key}; the code under test now calls it`);
        };
      }
      return undefined;
    },
  });
  const instance = () => ({ slots: [], cursor: 0, queue: [] });
  const render = (one, component, props) => {
    inst = one;
    one.cursor = 0;
    one.queue = [];
    let tree;
    try {
      tree = component(props);
    } finally {
      inst = null;
    }
    for (const i of one.queue) {
      const s = one.slots[i];
      if (typeof s.cleanup === 'function') s.cleanup();
      s.cleanup = s.fn();
    }
    return tree;
  };
  return { api, instance, render };
}

/** JSX as plain objects: nothing is mounted, and child components are never called. */
const jsx = (type, props) => ({ type, props });

/**
 * One page: the modules loaded fresh, with the browser globals stood in for.
 * `audio` is html[data-audio] (undefined: no sound control on the page);
 * `stored` the stored preference (undefined: nothing stored); `storage`
 * 'throws' for a store whose every call throws. `open` puts the page's
 * globals in place for one case and `close` restores Node's.
 */
function newPage({ audio, stored, storage = 'store', reducedMotion = false, startSuspended = false } = {}) {
  const clock = fakeClock();
  const page = { clock, contexts: 0, heard: [], cue: null, resumes: [], frames: [], startSuspended, answer: null };
  const html = { dataset: {} };
  if (audio !== undefined) html.dataset.audio = audio;
  const store = new Map(stored === undefined ? [] : [[STORAGE_KEY, stored]]);
  const refuse = () => {
    throw new DOMException('The operation is insecure.', 'SecurityError');
  };
  const localStorage =
    storage === 'throws'
      ? { getItem: refuse, setItem: refuse, removeItem: refuse }
      : {
          getItem: (k) => (store.has(k) ? store.get(k) : null),
          setItem: (k, v) => {
            store.set(k, String(v));
          },
          removeItem: (k) => {
            store.delete(k);
          },
        };
  const window = {
    AudioContext: fakeAudioContext(page),
    matchMedia: (query) => ({ matches: query === REDUCED_MOTION ? reducedMotion : false }),
    localStorage,
    location: { origin: 'https://designesy.test' },
    scrollY: 0,
    addEventListener() {},
    removeEventListener() {},
  };
  const globals = {
    window,
    document: { documentElement: html, body: {}, activeElement: null },
    localStorage,
    setTimeout: clock.setTimeout,
    clearTimeout: clock.clear,
    setInterval: clock.setInterval,
    clearInterval: clock.clear,
    performance: { now: () => clock.now },
    requestAnimationFrame: (fn) => {
      page.frames.push(fn);
      return page.frames.length;
    },
    cancelAnimationFrame: () => {},
    fetch: () =>
      new Promise((resolve) => {
        page.answer = (body) => resolve({ json: async () => body });
      }),
  };

  let saved = null;
  page.open = () => {
    saved = Object.keys(globals).map((k) => [k, Object.getOwnPropertyDescriptor(globalThis, k)]);
    for (const [k, value] of Object.entries(globals)) {
      Object.defineProperty(globalThis, k, { value, configurable: true, writable: true });
    }
  };
  page.close = () => {
    for (const [k, d] of saved) {
      if (d) Object.defineProperty(globalThis, k, d);
      else delete globalThis[k];
    }
  };

  /** Run fn with every sound it starts labelled `cue`. */
  page.during = (cue, fn) => {
    page.cue = cue;
    try {
      return fn();
    } finally {
      page.cue = null;
    }
  };

  const react = fakeReact();
  const h = createHarness({
    app: APP,
    stubs: {
      react: react.api,
      'react/jsx-runtime': { jsx, jsxs: jsx, Fragment: Symbol.for('react.fragment') },
      cuelume: { play() {}, setEnabled() {}, bind: () => () => {}, unlock: async () => true },
      'cuelume/themes': { THEMES },
      'next/link': { __esModule: true, default: function Link() { return null; } },
    },
    overrides: {
      'app/lib/cuelume-extend.ts': (real) => ({
        ...real,
        playExtended: (name) => page.during(name, () => real.playExtended(name)),
        playGradeReveal: (grade) => page.during(`grade reveal ${grade}`, () => real.playGradeReveal(grade)),
      }),
    },
  });

  page.html = html;
  page.react = react;
  page.extend = () => h.load('app/lib/cuelume-extend.ts');
  page.soundHook = () => h.load('app/lib/use-sound.tsx').useSoundPreference;
  page.scoreForm = () => h.load('app/score/score-form.tsx').ScoreForm;
  /** How many oscillators fn starts, the timers it moves the clock past included. */
  page.listen = (fn) => {
    const before = page.heard.length;
    fn();
    return page.heard.length - before;
  };
  /** Move the clock past the timers due, then run the animation frames asked for. */
  page.frame = (ms) => {
    clock.advance(ms);
    for (const fn of page.frames.splice(0)) fn(clock.now);
  };
  /** Start each AudioContext that is waiting to resume. */
  page.startAudio = () => {
    for (const start of page.resumes.splice(0)) start();
  };
  return page;
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

/** When each cue in `heard` sounded, in ms, one entry per cue (a cue may start several oscillators). */
const times = (heard) => {
  const seen = [...new Set(heard.map((r) => `${r.at} ms (${r.cue || 'loop pulse'})`))];
  return seen.length ? seen.join(', ') : 'none';
};
/** A pulse of the processing loop on a running AudioContext: the first comes with processing-start, the rest from its timer, unlabelled. */
const isPulse = (r) => r.cue === null || r.cue === 'processing-start';

/** What a page with this switch should do: on, or off. */
const label = (on) => (on ? 'on' : 'off');

/**
 * Score a URL on one score form and listen. Returns what was heard while the
 * request was out, after the answer, and in all, from the form's mount.
 */
async function scoreRun(page, ScoreForm, body) {
  const form = page.react.instance();
  const props = { initialUrl: 'example.test' };
  const from = page.clock.now;
  page.answer = null;
  page.render = (component) => page.react.render(form, component, props);
  page.render(ScoreForm);
  assert.ok(page.answer, 'the score form, given a URL, did not ask /api/score on mount');
  page.clock.advance(REQUEST_MS);
  const answeredAt = page.clock.now;
  page.answer(body);
  await settle();
  await settle();
  page.render(ScoreForm);
  page.frame(COUNT_UP_MS);
  page.clock.advance(2000);
  const heard = page.heard.filter((r) => r.at >= from);
  return {
    heard,
    during: heard.filter((r) => isPulse(r) && r.at < answeredAt),
    after: heard.filter((r) => isPulse(r) && r.at >= answeredAt),
    has: (cue) => heard.some((r) => r.cue === cue || (r.cue && r.cue.startsWith(`${cue} `))),
  };
}

/**
 * A score form case: a graded run, then a rate-limited run on a second
 * form, on one page. `on` is what the switch says there.
 */
function scoreFormCase(name, options, on) {
  return {
    name,
    run: () =>
      onPage(options, async (page) => {
        const ScoreForm = page.scoreForm();
        const graded = await scoreRun(page, ScoreForm, GRADED);
        const refused = await scoreRun(page, ScoreForm, RATE_LIMITED);
        if (!on) {
          assert.equal(graded.heard.length, 0, `the switch is off, and a graded run was heard at ${times(graded.heard)}`);
          assert.equal(refused.heard.length, 0, `the switch is off, and a rate-limited run was heard at ${times(refused.heard)}`);
          assert.equal(page.contexts, 0, `the switch is off, and the score form made ${page.contexts} AudioContext(s)`);
          return 'nothing heard in either run; no AudioContext made';
        }
        assert.ok(graded.during.length > 0, `the switch is on, and no processing pulse was heard while the request was out (heard: ${times(graded.heard)})`);
        assert.ok(graded.has('grade reveal'), `the switch is on, and the grade reveal was not heard when the result landed (heard: ${times(graded.heard)})`);
        if (!options.reducedMotion) {
          assert.ok(graded.has('check-pass') && graded.has('check-fail'), `the switch is on, and the count-up's check ticks were not heard (heard: ${times(graded.heard)})`);
        }
        assert.equal(graded.after.length, 0, `the processing loop was heard after the answer, at ${times(graded.after)}`);
        assert.ok(refused.during.length > 0, `the switch is on, and no processing pulse was heard while the rate-limited request was out`);
        assert.ok(refused.has('blocked'), `the switch is on, and the rate-limited run did not play the blocked cue (heard: ${times(refused.heard)})`);
        assert.equal(refused.after.length, 0, `the processing loop was heard after the rate-limit answer, at ${times(refused.after)}`);
        const ticks = graded.has('check-pass') ? ', check ticks' : '';
        return `graded run: ${graded.during.length} pulse(s) while the request was out, 0 after${ticks}, grade reveal; rate-limited run: ${refused.during.length} pulse(s), blocked`;
      }),
  };
}

const CASES = [
  {
    name: 'every extended cue is heard while html[data-audio] says on, and none while it says off',
    run: async () => {
      const on = await onPage({ audio: 'on', stored: 'false' }, (page) => {
        const x = page.extend();
        const silent = [];
        let count = 0;
        for (const cue of CUES) {
          const n = page.listen(() => x.playExtended(cue));
          if (n === 0) silent.push(cue);
          count += 1;
        }
        for (const grade of GRADES) {
          const n = page.listen(() => x.playGradeReveal(grade));
          if (n === 0) silent.push(`grade reveal ${grade}`);
          count += 1;
        }
        const pulses = page.listen(() => {
          x.playExtended('processing-start');
          page.clock.advance(1200);
          x.playExtended('processing-stop');
        });
        if (pulses === 0) silent.push('processing loop');
        count += 1;
        assert.deepEqual(silent, [], `with html[data-audio]="on" (and a stored "false"), not heard: ${silent.join(', ')}`);
        return count;
      });
      const off = await onPage({ audio: 'off', stored: 'true' }, (page) => {
        const x = page.extend();
        const heard = [];
        for (const cue of CUES) if (page.listen(() => x.playExtended(cue)) > 0) heard.push(cue);
        for (const grade of GRADES) if (page.listen(() => x.playGradeReveal(grade)) > 0) heard.push(`grade reveal ${grade}`);
        const pulses = page.listen(() => {
          x.playExtended('processing-start');
          page.clock.advance(1200);
          x.playExtended('processing-stop');
        });
        if (pulses > 0) heard.push(`processing loop (${pulses} pulses)`);
        assert.deepEqual(heard, [], `with html[data-audio]="off" (and a stored "true"), heard: ${heard.join(', ')}`);
        assert.equal(page.contexts, 0, `with html[data-audio]="off", the extended cues made ${page.contexts} AudioContext(s)`);
        return 0;
      });
      return `on: ${on} of ${on} cues heard; off: ${off} heard, no AudioContext made`;
    },
  },
  {
    name: 'a processing loop stops sounding at a mute, does not start while sound is off, and processing-stop still ends it',
    run: async () => {
      const first = await onPage({ audio: 'on' }, (page) => {
        const x = page.extend();
        x.playExtended('processing-start');
        page.clock.advance(1200);
        const before = page.heard.map((r) => r.at);
        assert.deepEqual(before, [0, 500, 1000], `a loop started at 0 ms pulsed at ${times(page.heard)}, expected 0, 500 and 1000 ms`);
        page.html.dataset.audio = 'off';
        page.clock.advance(3800);
        const afterMute = page.heard.filter((r) => r.at >= 1200);
        assert.equal(afterMute.length, 0, `muted at 1200 ms, the loop was still heard at ${times(afterMute)}`);
        page.html.dataset.audio = 'on';
        const restart = page.clock.now;
        x.playExtended('processing-start');
        page.clock.advance(700);
        x.playExtended('processing-stop');
        const stoppedAt = page.clock.now;
        page.clock.advance(2000);
        const again = page.heard.filter((r) => r.at >= restart && r.at < stoppedAt);
        assert.ok(again.length > 0, 'started again once sound was back on, the loop was not heard');
        const afterStop = page.heard.filter((r) => r.at >= stoppedAt);
        assert.equal(afterStop.length, 0, `after processing-stop at ${stoppedAt} ms, the loop was heard at ${times(afterStop)}`);
        return `pulses at ${before.join(', ')} ms, none in the 3.8 s after the mute; started again, ${again.length} pulse(s), none after processing-stop`;
      });
      await onPage({ audio: 'off' }, (page) => {
        const x = page.extend();
        x.playExtended('processing-start');
        page.clock.advance(3000);
        assert.equal(page.heard.length, 0, `started while sound was off, the loop was heard at ${times(page.heard)}`);
        assert.equal(page.contexts, 0, `started while sound was off, the loop made ${page.contexts} AudioContext(s)`);
      });
      await onPage({ audio: 'on' }, (page) => {
        const x = page.extend();
        x.playExtended('processing-start');
        page.clock.advance(200);
        page.html.dataset.audio = 'off';
        page.clock.advance(100);
        x.playExtended('processing-stop');
        page.clock.advance(100);
        page.html.dataset.audio = 'on';
        page.clock.advance(2600);
        const late = page.heard.filter((r) => r.at > 0);
        assert.equal(late.length, 0, `stopped at 300 ms while sound was off, with sound back on at 400 ms, the loop was heard at ${times(late)}`);
      });
      await onPage({ audio: 'on', startSuspended: true }, async (page) => {
        const x = page.extend();
        x.playExtended('processing-start');
        assert.ok(page.resumes.length > 0, 'processing-start did not ask its AudioContext to start');
        page.clock.advance(300);
        x.playExtended('processing-stop');
        page.clock.advance(300);
        page.startAudio();
        await settle();
        page.clock.advance(3000);
        assert.equal(page.heard.length, 0, `stopped at 300 ms, before its AudioContext started at 600 ms, the loop was heard at ${times(page.heard)}`);
      });
      return `${first}; started while off: never heard; stopped while off: stays stopped; stopped before its AudioContext started: never heard`;
    },
  },
  {
    name: 'a cue whose AudioContext starts only after a mute is not heard; one whose AudioContext starts while sound is on is',
    run: async () => {
      await onPage({ audio: 'on', startSuspended: true }, async (page) => {
        const x = page.extend();
        x.playExtended('info');
        assert.ok(page.resumes.length > 0, 'the cue did not ask its AudioContext to start');
        page.html.dataset.audio = 'off';
        page.startAudio();
        await settle();
        assert.equal(page.heard.length, 0, `asked for while on, started after a mute, the info cue started ${page.heard.length} oscillator(s) once its AudioContext ran`);
      });
      await onPage({ audio: 'on', startSuspended: true }, async (page) => {
        const x = page.extend();
        x.playExtended('info');
        page.startAudio();
        await settle();
        assert.ok(page.heard.length > 0, 'asked for while on, started while still on, the info cue was not heard');
      });
      return 'started after the mute: not heard; started while on: heard';
    },
  },
  {
    name: 'with no sound control on the page, the info and error cues are heard exactly when a sound control mounting there says on',
    run: async () => {
      const ROWS = [
        { what: 'a stored "true" under reduced motion', stored: 'true', reducedMotion: true, on: true },
        { what: 'a stored "false"', stored: 'false', on: false },
        { what: 'nothing stored, under reduced motion', reducedMotion: true, on: false },
        { what: 'nothing stored', on: true },
        { what: 'storage that throws', storage: 'throws', on: true },
        { what: 'storage that throws, under reduced motion', storage: 'throws', reducedMotion: true, on: false },
      ];
      const wrong = [];
      for (const row of ROWS) {
        await onPage(row, (page) => {
          const x = page.extend();
          const info = page.listen(() => x.playExtended('info')) > 0;
          const error = page.listen(() => x.playExtended('error')) > 0;
          page.react.render(page.react.instance(), page.soundHook(), undefined);
          const control = page.html.dataset.audio;
          if (info !== row.on || error !== row.on) {
            wrong.push(`${row.what}: info ${info ? 'heard' : 'silent'}, error ${error ? 'heard' : 'silent'}, expected ${row.on ? 'heard' : 'silent'}`);
          }
          if (control !== label(row.on)) wrong.push(`${row.what}: the sound control mounted ${control ?? 'without writing html[data-audio]'}, expected ${label(row.on)}`);
        });
      }
      assert.deepEqual(wrong, [], wrong.join('; '));
      return ROWS.map((r) => `${r.what}: ${label(r.on)}`).join('; ');
    },
  },
  scoreFormCase('the score form plays its cues with the switch on, under reduced motion with a stored "true"', { audio: 'on', stored: 'true', reducedMotion: true }, true),
  scoreFormCase('the score form plays nothing with the switch off, though another tab stored "true"', { audio: 'off', stored: 'true' }, false),
  scoreFormCase('with no sound control, the score form plays its cues for a stored "true" under reduced motion', { stored: 'true', reducedMotion: true }, true),
  scoreFormCase('with no sound control, the score form plays its cues when storage throws, without reduced motion', { storage: 'throws' }, true),
];

console.log(`Sound switch (${path.relative(process.cwd(), APP) || '.'}, node ${process.version})`);
const failures = [];
for (const [i, c] of CASES.entries()) {
  try {
    const detail = await c.run();
    console.log(`  ok    ${i + 1}. ${c.name}\n        ${detail}`);
  } catch (e) {
    failures.push(c.name);
    console.log(`  FAIL  ${i + 1}. ${c.name}\n        ${String(e && e.message).split('\n')[0]}`);
  }
}

console.log(`\n${CASES.length - failures.length} passed, ${failures.length} failed`);
if (failures.length) {
  console.log(`Sound switch: ${failures.length} case(s) failed.`);
  process.exit(1);
}
console.log('Sound switch: the extended cues and the score form are heard while the switch is on and not while it is off.');
