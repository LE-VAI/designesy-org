// @vai/motion — timing tests for the principles.
//
// A fake clock and a fake requestAnimationFrame stand in for the browser:
// frames come every 1000/60 ms of fake time, and the test waits for nothing
// real, so a run is the same on every machine. Each test reads what a
// principle wrote to its element, frame by frame.
//
// Eased progress is checked against a bisection solver written here, not
// against src/easing.js, so a bug in the reader cannot pass its own check.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { blockSettle } from '../src/principles/block-settle.js';
import { markSettle } from '../src/principles/mark-settle.js';
import { fieldBreath } from '../src/principles/field-breath.js';
import { waveformTrace } from '../src/principles/waveform-trace.js';
import { resolveDuration } from '../src/reduced-motion.js';

const FRAME = 1000 / 60;

// Installs the fake clock for one test and restores the globals after it.
// run(promise) steps frames until the promise settles and returns the
// fake time at which it did. advance(ms) steps frames for ms of fake time.
function useFrames(t, { reduced = false } = {}) {
  const saved = {
    performance: Object.getOwnPropertyDescriptor(globalThis, 'performance'),
    raf: Object.getOwnPropertyDescriptor(globalThis, 'requestAnimationFrame'),
    window: Object.getOwnPropertyDescriptor(globalThis, 'window'),
  };
  let frame = 0;
  let now = 0;
  let queue = [];
  // A browser reports an error thrown in a frame callback and carries on;
  // it does not reach the code that asked for the frame. So does this
  // clock, and a test fails if any frame threw.
  const frameErrors = [];
  const define = (key, value) =>
    Object.defineProperty(globalThis, key, { value, configurable: true, writable: true });
  define('performance', { now: () => now });
  define('requestAnimationFrame', (cb) => queue.push(cb));
  if (reduced) define('window', { matchMedia: (q) => ({ matches: /reduce/.test(q) }) });
  else delete globalThis.window;

  t.after(() => {
    for (const [key, desc] of Object.entries({
      performance: saved.performance,
      requestAnimationFrame: saved.raf,
      window: saved.window,
    })) {
      if (desc) Object.defineProperty(globalThis, key, desc);
      else delete globalThis[key];
    }
    if (frameErrors.length) throw frameErrors[0];
  });

  const turn = () => new Promise((r) => setImmediate(r)); // drains microtasks
  const step = async () => {
    frame += 1;
    now = (frame * 1000) / 60;
    const due = queue;
    queue = [];
    for (const cb of due) {
      try {
        cb(now);
      } catch (err) {
        frameErrors.push(err);
      }
    }
    await turn();
  };
  return {
    now: () => now,
    pending: () => queue.length,
    frameErrors,
    async run(promise, limit = 20000) {
      let done = false;
      let error = null;
      promise.then(
        () => (done = true),
        (e) => ((done = true), (error = e)),
      );
      await turn();
      while (!done) {
        if (now > limit) throw new Error(`still running at ${limit}ms of fake time`);
        await step();
      }
      if (error) throw error;
      return now;
    },
    async advance(ms) {
      const end = now + ms;
      await turn();
      while (now < end) await step();
    },
  };
}

// A stand-in element that records every style write with the fake time.
function element(clock, extra = {}) {
  const log = [];
  const style = {};
  const el = {
    log,
    style: new Proxy(style, {
      set(target, prop, value) {
        target[prop] = value;
        log.push({ at: clock.now(), prop, value });
        return true;
      },
    }),
    classList: { add() {}, remove() {} },
    ...extra,
  };
  style.setProperty = (prop, value) => {
    style[prop] = value;
    log.push({ at: clock.now(), prop, value });
  };
  return el;
}

const writes = (el, prop) => el.log.filter((w) => w.prop === prop).map((w) => ({ at: w.at, v: Number(w.value) }));
const firstMove = (el) => writes(el, 'opacity').find((w) => w.v > 0)?.at;
const landing = (el) => writes(el, 'opacity').find((w) => w.v === 1)?.at;

function oracle(css) {
  const [x1, y1, x2, y2] = css.match(/-?[\d.]+/g).map(Number);
  const axis = (a, b, s) => 3 * a * s * (1 - s) ** 2 + 3 * b * s * s * (1 - s) + s ** 3;
  return (t) => {
    let lo = 0;
    let hi = 1;
    while (hi - lo > 1e-13) {
      const mid = (lo + hi) / 2;
      if (axis(x1, x2, mid) < t) lo = mid;
      else hi = mid;
    }
    return axis(y1, y2, (lo + hi) / 2);
  };
}

// The largest gap between the eased progress a principle wrote and a curve.
function worstGap(samples, start, duration, curve) {
  let worst = 0;
  for (const { at, p } of samples) {
    const t = Math.min(1, Math.max(0, (at - start) / duration));
    worst = Math.max(worst, Math.abs(p - curve(t)));
  }
  return worst;
}

// --- block-settle: delay and stagger ---------------------------------------

test('settleAll: 3 blocks at 600ms with an 80ms stagger take about 760ms', async (t) => {
  const clock = useFrames(t);
  const els = [0, 1, 2].map(() => element(clock));
  const end = await clock.run(blockSettle.settleAll(els));
  assert.ok(end >= 760 && end < 760 + FRAME, `took ${end}ms`);
  els.forEach((el, i) => {
    const start = i * 80;
    assert.ok(firstMove(el) > start && firstMove(el) <= start + FRAME, `block ${i} first moved at ${firstMove(el)}ms`);
    assert.ok(landing(el) >= start + 600 && landing(el) < start + 600 + FRAME, `block ${i} landed at ${landing(el)}ms`);
  });
});

test('settleAll: 8 blocks take 600 + 7 × 80 = 1160ms', async (t) => {
  const clock = useFrames(t);
  const els = Array.from({ length: 8 }, () => element(clock));
  const end = await clock.run(blockSettle.settleAll(els));
  assert.ok(end >= 1160 && end < 1160 + FRAME, `took ${end}ms`);
});

test('settleAll: blocks overlap, and each holds opacity 0 until its start', async (t) => {
  const clock = useFrames(t);
  const els = [0, 1, 2].map(() => element(clock));
  await clock.run(blockSettle.settleAll(els));
  els.forEach((el, i) => {
    const early = writes(el, 'opacity').filter((w) => w.at <= i * 80);
    assert.ok(early.length > 0 && early.every((w) => w.v === 0), `block ${i} moved before ${i * 80}ms`);
  });
  // At 200ms all three are mid-flight.
  for (const el of els) {
    const at200 = writes(el, 'opacity').filter((w) => w.at <= 200).at(-1).v;
    assert.ok(at200 > 0 && at200 < 1, `opacity ${at200} at 200ms`);
  }
});

test('settleAll: delay and stagger options set each start', async (t) => {
  const clock = useFrames(t);
  const els = [0, 1, 2, 3].map(() => element(clock));
  const end = await clock.run(blockSettle.settleAll(els, { delay: 100, stagger: 30, duration: 400 }));
  els.forEach((el, i) => {
    const start = 100 + i * 30;
    assert.ok(firstMove(el) > start && firstMove(el) <= start + FRAME, `block ${i} first moved at ${firstMove(el)}ms`);
  });
  assert.ok(end >= 100 + 90 + 400 && end < 590 + FRAME, `took ${end}ms`);
});

test('settleAll accepts an array-like list (a NodeList)', async (t) => {
  const clock = useFrames(t);
  const a = element(clock);
  const b = element(clock);
  await clock.run(blockSettle.settleAll({ length: 2, 0: a, 1: b }));
  assert.ok(landing(a) !== undefined && landing(b) !== undefined);
});

test('settle: the delay option holds the block, then it moves', async (t) => {
  const clock = useFrames(t);
  const el = element(clock);
  const end = await clock.run(blockSettle.settle(el, { delay: 250 }));
  assert.ok(firstMove(el) > 250 && firstMove(el) <= 250 + FRAME, `first moved at ${firstMove(el)}ms`);
  assert.ok(end >= 850 && end < 850 + FRAME, `landed at ${end}ms`);
});

// --- block-settle under reduced motion -------------------------------------
// Tier 2 softens to ≤200ms. The delay and the stagger are dropped with the
// length, so every block settles in the same 200ms, as in the CSS layer.

test('reduced motion: 8 blocks settle together in 200ms, no stagger', async (t) => {
  const clock = useFrames(t, { reduced: true });
  const els = Array.from({ length: 8 }, () => element(clock));
  const end = await clock.run(blockSettle.settleAll(els));
  assert.ok(end >= 200 && end < 200 + FRAME, `took ${end}ms`);
  for (const el of els) {
    assert.equal(firstMove(el), FRAME);
    assert.equal(landing(el), landing(els[0]));
  }
});

test('reduced motion: an explicit delay is dropped too', async (t) => {
  const clock = useFrames(t, { reduced: true });
  const el = element(clock);
  const end = await clock.run(blockSettle.settle(el, { delay: 500 }));
  assert.ok(end >= 200 && end < 200 + FRAME, `took ${end}ms`);
});

test('reduced motion: softening never lengthens a motion', async (t) => {
  const clock = useFrames(t, { reduced: true });
  assert.deepEqual([0, 50, 100, 150, 600, 3200].map((d) => resolveDuration('tier2', d)), [0, 50, 100, 120, 200, 200]);
  const el = element(clock);
  const end = await clock.run(blockSettle.settle(el, { duration: 0 }));
  assert.equal(end, 0);
  assert.equal(el.style.opacity, '1');
});

// --- block-settle: options that are unset or not numbers -------------------

test('settleAll: delay, stagger and ease passed as undefined take their defaults', async (t) => {
  const clock = useFrames(t);
  const els = [0, 1, 2].map(() => element(clock));
  const end = await clock.run(blockSettle.settleAll(els, { delay: undefined, stagger: undefined, ease: undefined }));
  assert.ok(end >= 760 && end < 760 + FRAME, `took ${end}ms`);
  for (const el of els) assert.equal(el.style.opacity, '1');
});

test('settleAll rejects a time that is not a finite number, before any write', async (t) => {
  const clock = useFrames(t);
  const cases = [{ stagger: '80ms' }, { delay: '100' }, { delay: NaN }, { stagger: null }, { duration: Infinity }, { duration: -1 }];
  for (const bad of cases) {
    const els = [0, 1, 2].map(() => element(clock));
    await assert.rejects(clock.run(blockSettle.settleAll(els, bad)), TypeError, String(Object.values(bad)[0]));
    for (const el of els) assert.equal(el.log.length, 0, String(Object.values(bad)[0]));
  }
});

test('settleAll: a block that fails does not stop the others; the promise rejects after they land', async (t) => {
  const clock = useFrames(t);
  const a = element(clock);
  const b = element(clock);
  const err = await clock.run(blockSettle.settleAll([a, null, b])).catch((e) => e);
  assert.ok(err instanceof TypeError, String(err));
  assert.ok(clock.now() >= 760 && clock.now() < 760 + FRAME, `settled at ${clock.now()}ms`);
  assert.equal(a.style.opacity, '1');
  assert.equal(b.style.opacity, '1');
});

test('an ease function that fails mid-curve rejects the promise; it does not stay pending', async (t) => {
  const clock = useFrames(t);
  const el = element(clock);
  const ease = (x) => (x > 0.5 && x < 1 ? NaN : x);
  await assert.rejects(clock.run(blockSettle.settle(el, { ease, duration: 600 })), TypeError);
  assert.ok(clock.now() > 300 && clock.now() <= 300 + FRAME, `rejected at ${clock.now()}ms`);
  assert.equal(clock.frameErrors.length, 0, 'the error escaped into the frame callback');
  assert.equal(clock.pending(), 0);
  assert.ok(writes(el, 'opacity').every((w) => Number.isFinite(w.v)));
});

// --- block-settle: duration 0 ----------------------------------------------

test('settle with duration 0 lands at once, or when its delay ends', async (t) => {
  const clock = useFrames(t);
  const now = element(clock);
  assert.equal(await clock.run(blockSettle.settle(now, { duration: 0 })), 0);
  assert.equal(now.style.opacity, '1');

  const els = [0, 1, 2].map(() => element(clock));
  const start = clock.now();
  await clock.run(blockSettle.settleAll(els, { duration: 0, delay: 300 }));
  els.forEach((el, i) => {
    const due = start + 300 + i * 80;
    const early = writes(el, 'opacity').filter((w) => w.at < due);
    assert.ok(early.every((w) => w.v === 0), `block ${i} showed before ${due}ms`);
    assert.ok(landing(el) >= due && landing(el) < due + FRAME, `block ${i} landed at ${landing(el)}ms`);
  });
});

// --- one run per element ---------------------------------------------------

test('a second settle on an element stops the first, which writes nothing more', async (t) => {
  const clock = useFrames(t);
  const el = element(clock);
  const first = blockSettle.settle(el, { duration: 1000 });
  await clock.advance(100);
  const end = await clock.run(blockSettle.settle(el, { duration: 200 }));
  await clock.run(first); // it resolves: stopped, not failed
  await clock.advance(1000);
  const after = writes(el, 'opacity').filter((w) => w.at > end);
  assert.equal(after.length, 0, `writes after the second landed: ${after.map((w) => `${w.at}=${w.v}`)}`);
  assert.equal(el.style.opacity, '1');
});

// --- every declared ease is the ease that runs -----------------------------

const CASES = [
  {
    name: 'block-settle',
    principle: blockSettle,
    go: (el, o) => blockSettle.settle(el, o),
    progress: (el) => writes(el, 'opacity').map(({ at, v }) => ({ at, p: v })),
  },
  {
    name: 'mark-settle',
    principle: markSettle,
    go: (el, o) => markSettle.settle(el, o),
    progress: (el) => writes(el, 'opacity').map(({ at, v }) => ({ at, p: v })),
  },
  {
    name: 'field-breath',
    principle: fieldBreath,
    go: (el, o) => fieldBreath.breathe(el, o),
    progress: (el) => {
      const { minOpacity: lo, maxOpacity: hi } = fieldBreath.defaultOptions;
      return writes(el, 'opacity').map(({ at, v }) => ({ at, p: (v - lo) / (hi - lo) }));
    },
  },
  {
    name: 'waveform-trace plotPath',
    principle: waveformTrace,
    go: (el, o) => waveformTrace.plotPath(el, o),
    extra: { getTotalLength: () => 100 },
    progress: (el) =>
      writes(el, 'strokeDashoffset')
        .slice(1) // the first write hides the path before the clock starts
        .map(({ at, v }) => ({ at, p: 1 - v / 100 })),
  },
  {
    name: 'waveform-trace drawLine',
    principle: waveformTrace,
    go: (el, o) => waveformTrace.drawLine(el, o),
    progress: (el) => writes(el, '--vai-trace-progress').map(({ at, v }) => ({ at, p: v })),
  },
];

for (const c of CASES) {
  test(`${c.name} runs its declared default ease (${c.principle.defaultOptions.ease})`, async (t) => {
    const clock = useFrames(t);
    const el = element(clock, c.extra);
    await clock.run(c.go(el, {}));
    const samples = c.progress(el);
    const duration = c.principle.defaultOptions.duration;
    assert.ok(samples.length > 10, `${samples.length} frames`);
    const gap = worstGap(samples, 0, duration, oracle(c.principle.defaultOptions.ease));
    assert.ok(gap <= 1e-6, `largest gap from the declared curve: ${gap}`);
  });

  test(`${c.name} honours ease: 'linear', a cubic-bezier and a function`, async (t) => {
    const clock = useFrames(t);
    const duration = c.principle.defaultOptions.duration;
    for (const [ease, curve] of [
      ['linear', (x) => x],
      ['cubic-bezier(0.5, 0, 0.9, 0.4)', oracle('cubic-bezier(0.5, 0, 0.9, 0.4)')],
      [(x) => x * x, (x) => x * x],
    ]) {
      const el = element(clock, c.extra);
      const start = clock.now();
      await clock.run(c.go(el, { ease }));
      const gap = worstGap(c.progress(el), start, duration, curve);
      assert.ok(gap <= 1e-6, `${String(ease)}: largest gap ${gap}`);
    }
  });

  test(`${c.name} rejects an unparseable ease before writing a style`, async (t) => {
    const clock = useFrames(t);
    const el = element(clock, c.extra);
    await assert.rejects(clock.run(c.go(el, { ease: 'var(--ease-out)' })), TypeError);
    assert.equal(el.log.length, 0);
  });
}

test('fieldBreath.loop throws on an unparseable ease, at the call', (t) => {
  const clock = useFrames(t);
  const el = element(clock);
  assert.throws(() => fieldBreath.loop(el, { ease: 'ease-out-cubic' }), TypeError);
  assert.equal(el.log.length, 0);
});

test('settleAll rejects an unparseable ease and leaves every block untouched', async (t) => {
  const clock = useFrames(t);
  const els = [0, 1, 2].map(() => element(clock));
  await assert.rejects(clock.run(blockSettle.settleAll(els, { ease: 'bounce' })), TypeError);
  for (const el of els) assert.equal(el.log.length, 0);
});

// --- waveform-trace delay ----------------------------------------------------

test('waveform-trace keeps the path hidden through its delay', async (t) => {
  const clock = useFrames(t);
  const path = element(clock, { getTotalLength: () => 100 });
  await clock.run(waveformTrace.plotPath(path, { delay: 200 }));
  const offsets = writes(path, 'strokeDashoffset');
  const early = offsets.filter((w) => w.at <= 200);
  assert.ok(early.length > 1 && early.every((w) => w.v === 100), `offsets before 200ms: ${early.map((w) => w.v)}`);
  assert.equal(offsets.at(-1).v, 0);
});

test('waveform-trace drawLine keeps the trace at 0 through its delay', async (t) => {
  const clock = useFrames(t);
  const el = element(clock);
  await clock.run(waveformTrace.drawLine(el, { delay: 200 }));
  const progress = writes(el, '--vai-trace-progress');
  const early = progress.filter((w) => w.at <= 200);
  assert.ok(early.length > 1 && early.every((w) => w.v === 0), `progress before 200ms: ${early.map((w) => w.v)}`);
  const moved = progress.find((w) => w.v > 0);
  assert.ok(moved.at > 200 && moved.at <= 200 + FRAME, `first moved at ${moved.at}ms`);
  assert.equal(progress.at(-1).v, 1);
});

// --- mark-settle blur --------------------------------------------------------

const filters = (el) => el.log.filter((w) => w.prop === 'filter').map((w) => w.value);

test('mark-settle never writes a negative blur, even with an ease that overshoots', async (t) => {
  const clock = useFrames(t);
  const el = element(clock);
  await clock.run(markSettle.settle(el, { ease: 'cubic-bezier(0.3, -0.5, 0.7, 1.5)' }));
  const negative = filters(el).filter((f) => f.startsWith('blur(-'));
  assert.equal(negative.length, 0, negative.join(' '));
  assert.equal(filters(el).at(-1), 'blur(0px)');
});

test('reduced motion: mark-settle has no blur, only opacity and scale', async (t) => {
  const clock = useFrames(t, { reduced: true });
  const el = element(clock);
  const end = await clock.run(markSettle.settle(el));
  assert.ok(end >= 200 && end < 200 + FRAME, `took ${end}ms`);
  assert.deepEqual(filters(el), ['none']);
  assert.equal(el.style.opacity, '1');
});

// --- field-breath loop -------------------------------------------------------

// Frames where opacity fell by more than 0.2 from the frame before.
function drops(el) {
  const o = writes(el, 'opacity');
  return o.filter((w, i) => i > 0 && o[i - 1].v - w.v > 0.2);
}

test('fieldBreath.loop keeps breathing at full motion: one swell every 3.2s', async (t) => {
  const clock = useFrames(t);
  const el = element(clock);
  const stop = fieldBreath.loop(el);
  await clock.advance(7000);
  stop();
  assert.equal(drops(el).length, 2, drops(el).map((w) => w.at).join(', '));
});

test('fieldBreath.loop stop() takes effect on the next frame', async (t) => {
  const clock = useFrames(t);
  const el = element(clock);
  const stop = fieldBreath.loop(el);
  await clock.advance(500);
  stop();
  el.style.opacity = '0.7'; // what the demo does after stop()
  const count = el.log.length;
  await clock.advance(4000);
  assert.equal(el.log.length, count, 'the loop wrote after stop()');
  assert.equal(clock.pending(), 0);
});

test('reduced motion: fieldBreath.loop runs one 200ms swell, then rests', async (t) => {
  const clock = useFrames(t, { reduced: true });
  const el = element(clock);
  fieldBreath.loop(el);
  await clock.advance(2000);
  const o = writes(el, 'opacity');
  assert.equal(drops(el).length, 0);
  assert.ok(o.at(-1).at <= 200 + FRAME, `last write at ${o.at(-1).at}ms`);
  assert.equal(o.at(-1).v, fieldBreath.defaultOptions.maxOpacity);
  assert.equal(clock.pending(), 0);
});
