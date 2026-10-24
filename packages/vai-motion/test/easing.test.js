// @vai/motion — tests for the shared ease reader (src/easing.js).
//
// The reader is checked against its own oracle: a plain bisection, written
// here and run to 1e-13, so the two solvers share no code.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { readEase, EASE_TOLERANCE } from '../src/easing.js';
import { EASE } from '../src/reduced-motion.js';

const KEYWORDS = {
  ease: [0.25, 0.1, 0.25, 1],
  'ease-in': [0.42, 0, 1, 1],
  'ease-out': [0, 0, 0.58, 1],
  'ease-in-out': [0.42, 0, 0.58, 1],
};

function oracle([x1, y1, x2, y2]) {
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

function numbers(css) {
  return css.match(/-?[\d.]+/g).map(Number);
}

// Every declared curve: the four EASE tokens and the four CSS keywords.
const CURVES = [
  ...Object.entries(EASE).map(([name, css]) => [`EASE.${name}`, css, numbers(css)]),
  ...Object.entries(KEYWORDS).map(([name, pts]) => [name, name, pts]),
];

for (const [label, css, points] of CURVES) {
  test(`${label} (${css}) matches an independent solver to 1e-6`, () => {
    const ease = readEase(css);
    const ref = oracle(points);
    let worst = 0;
    for (let i = 0; i <= 2000; i++) {
      const t = i / 2000;
      worst = Math.max(worst, Math.abs(ease(t) - ref(t)));
    }
    assert.ok(worst <= 1e-6, `largest error ${worst}`);
    assert.equal(ease(0), 0);
    assert.equal(ease(1), 1);
  });
}

test('the stated x tolerance is 1e-7', () => {
  assert.equal(EASE_TOLERANCE, 1e-7);
});

test('linear is the identity on [0, 1]', () => {
  const ease = readEase('linear');
  for (const t of [0, 0.1, 0.5, 0.9, 1]) assert.equal(ease(t), t);
});

test('t outside [0, 1] is clamped', () => {
  for (const css of ['linear', EASE.out, 'ease-in-out']) {
    const ease = readEase(css);
    assert.equal(ease(-0.5), 0);
    assert.equal(ease(1.5), 1);
  }
});

test('CSS spelling: case, spacing and number forms', () => {
  const ref = oracle([0.23, 1, 0.32, 1]);
  for (const css of [
    'CUBIC-BEZIER(0.23,1,0.32,1)',
    '  cubic-bezier( .23 , 1 , .32 , 1 )  ',
    'cubic-bezier(2.3e-1, 1.0, 0.32, +1)',
  ]) {
    assert.ok(Math.abs(readEase(css)(0.3) - ref(0.3)) <= 1e-6, css);
  }
  assert.ok(Math.abs(readEase('Ease-Out')(0.3) - oracle(KEYWORDS['ease-out'])(0.3)) <= 1e-6);
});

test('y may leave [0, 1] (overshoot), as in CSS', () => {
  const ease = readEase('cubic-bezier(0.3, -0.5, 0.7, 1.5)');
  const ref = oracle([0.3, -0.5, 0.7, 1.5]);
  assert.ok(ease(0.1) < 0);
  assert.ok(ease(0.9) > 1);
  assert.ok(Math.abs(ease(0.9) - ref(0.9)) <= 1e-6);
});

test('a function is used as given, with t clamped', () => {
  const ease = readEase((t) => t * t);
  assert.equal(ease(0.5), 0.25);
  assert.equal(ease(2), 1);
  assert.equal(ease(-1), 0);
});

test('anything else throws a TypeError that names the accepted forms', () => {
  for (const bad of [
    'cubic-bezier(1.2, 0, 0.5, 1)', // x1 outside [0, 1]
    'cubic-bezier(0.2, 0, -0.1, 1)', // x2 outside [0, 1]
    'cubic-bezier(0.2, 0.3, 0.4)',
    'cubic-bezier (0.2, 0, 0.4, 1)',
    'var(--ease-out)',
    'easeOutCubic',
    'steps(4)',
    'linear(0, 1)',
    '',
    undefined,
    null,
    0.5,
    {},
  ]) {
    assert.throws(() => readEase(bad), (err) => err instanceof TypeError && /ease must be/.test(err.message), String(bad));
  }
});
