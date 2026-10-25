// @vai/motion - tests for the CSS layer (styles/vai-motion.css).
//
// Node has no CSS engine, so this file carries a small reader for the part
// of CSS the stylesheet uses: plain rules, @media, @supports and
// @keyframes; class selectors, the child combinator with * and
// :nth-child(An+B), and ::before and ::after. For one element it applies
// the cascade (!important, then specificity, then source order) and reads
// the value a browser computes. A selector, condition or value outside that
// part throws, so a rule the reader cannot read fails the suite instead of
// being skipped. The reader is checked on its own small sheets first.
//
// Each test runs twice where it matters: in a browser with sibling-index()
// (Chrome 138, Safari 26.2, Firefox 154 and later) and in one without it,
// which drops any declaration that uses it.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { blockSettle } from '../src/principles/block-settle.js';
import { waveformTrace } from '../src/principles/waveform-trace.js';
import { EASE } from '../src/reduced-motion.js';

const SHEET = readFileSync(new URL('../styles/vai-motion.css', import.meta.url), 'utf8');

// --- the reader ------------------------------------------------------------

// Splits text on `sep` where it is outside parentheses and quotes.
function split(text, sep) {
  const parts = [];
  let depth = 0;
  let quote = null;
  let start = 0;
  for (let i = 0; i < text.length; i += 1) {
    const c = text[i];
    if (quote) {
      if (c === quote) quote = null;
    } else if (c === '"' || c === "'") quote = c;
    else if (c === '(') depth += 1;
    else if (c === ')') depth -= 1;
    else if (c === sep && depth === 0) {
      parts.push(text.slice(start, i));
      start = i + 1;
    }
  }
  parts.push(text.slice(start));
  return parts.map((p) => p.trim()).filter(Boolean);
}

// Yields each top-level `prelude { body }` in src, in order.
function* blocks(src) {
  let i = 0;
  while (i < src.length) {
    const open = src.indexOf('{', i);
    if (open === -1) {
      if (src.slice(i).trim()) throw new Error(`stray text: ${src.slice(i).trim()}`);
      return;
    }
    let depth = 1;
    let close = open + 1;
    while (depth > 0) {
      if (close >= src.length) throw new Error('unbalanced braces');
      if (src[close] === '{') depth += 1;
      else if (src[close] === '}') depth -= 1;
      close += 1;
    }
    yield { prelude: src.slice(i, open).trim().replace(/\s+/g, ' '), body: src.slice(open + 1, close - 1) };
    i = close;
  }
}

function parseDecls(body) {
  return split(body, ';').map((d) => {
    const colon = d.indexOf(':');
    if (colon === -1) throw new Error(`unread declaration: ${d}`);
    const raw = d.slice(colon + 1).trim();
    const important = /\s*!important$/.test(raw);
    return { prop: d.slice(0, colon).trim(), value: raw.replace(/\s*!important$/, ''), important };
  });
}

// Returns { rules, keyframes }. Each rule is { selectors, decls, conditions,
// order }, with conditions the @media and @supports preludes around it.
// keyframes maps a name to its steps: { from: { transform: ... }, ... }.
function parseSheet(css) {
  const rules = [];
  const keyframes = {};
  const walk = (src, conditions) => {
    for (const { prelude, body } of blocks(src)) {
      if (prelude.startsWith('@keyframes ')) {
        const steps = {};
        for (const step of blocks(body)) {
          const decls = Object.fromEntries(parseDecls(step.body).map((d) => [d.prop, d.value]));
          for (const at of split(step.prelude, ',')) steps[at] = decls;
        }
        keyframes[prelude.slice('@keyframes '.length)] = steps;
      } else if (prelude.startsWith('@media ') || prelude.startsWith('@supports ')) {
        walk(body, [...conditions, prelude]);
      } else if (prelude.startsWith('@')) {
        throw new Error(`unknown at-rule: ${prelude}`);
      } else {
        rules.push({ selectors: split(prelude, ','), decls: parseDecls(body), conditions, order: rules.length + 1 });
      }
    }
  };
  walk(css.replace(/\/\*[\s\S]*?\*\//g, ''), []);
  return { rules, keyframes };
}

// A declaration a browser cannot parse is dropped. Here that is only one
// that uses sibling-index() in a browser without it.
function parses(value, env) {
  return env.siblingIndex || !value.includes('sibling-index(');
}

function conditionHolds(prelude, env) {
  if (prelude === '@media (prefers-reduced-motion: reduce)') return env.reduce;
  const m = prelude.match(/^@supports (not )?\(([\w-]+): (.+)\)$/);
  if (m && !/\b(and|or)\b/.test(m[3])) return Boolean(m[1]) !== parses(m[3], env);
  throw new Error(`unknown condition: ${prelude}`);
}

// One compound selector: * or classes, then :nth-child(), then ::after or
// ::before. Returns { classes, nth, pseudo, spec: [classes, elements] }.
function parseCompound(text) {
  const out = { classes: [], nth: null, pseudo: null, spec: [0, 0] };
  const re = /\*|\.([\w-]+)|:nth-child\(([^)]*)\)|::(after|before)/y;
  let i = 0;
  while (i < text.length) {
    re.lastIndex = i;
    const m = re.exec(text);
    if (!m) throw new Error(`unsupported selector: ${text}`);
    if (m[1]) {
      out.classes.push(m[1]);
      out.spec[0] += 1;
    } else if (m[2] !== undefined) {
      out.nth = parseNth(m[2]);
      out.spec[0] += 1;
    } else if (m[3]) {
      out.pseudo = `::${m[3]}`;
      out.spec[1] += 1;
    }
    i = re.lastIndex;
  }
  return out;
}

function parseNth(text) {
  const t = text.replace(/\s+/g, '');
  if (/^\d+$/.test(t)) return { a: 0, b: Number(t) };
  const m = t.match(/^([+-]?\d*)n([+-]\d+)?$/);
  if (!m) throw new Error(`unsupported :nth-child(${text})`);
  const a = m[1] === '' || m[1] === '+' ? 1 : m[1] === '-' ? -1 : Number(m[1]);
  return { a, b: m[2] ? Number(m[2]) : 0 };
}

function nthMatches({ a, b }, index) {
  if (a === 0) return index === b;
  const k = (index - b) / a;
  return Number.isInteger(k) && k >= 0;
}

// A selector is one compound, or `parent > child`. Returns { parent, self,
// spec }, where spec is [classes and pseudo-classes, pseudo-elements].
function parseSelector(text) {
  // Spaces inside :nth-child( ) are not combinators.
  const tight = text.replace(/\(([^)]*)\)/g, (_, inner) => `(${inner.replace(/\s+/g, '')})`);
  const parts = tight.split('>').map((p) => p.trim());
  if (parts.length > 2 || parts.some((p) => p === '' || /\s/.test(p))) {
    throw new Error(`unsupported selector: ${text}`);
  }
  const self = parseCompound(parts[parts.length - 1]);
  const parent = parts.length === 2 ? parseCompound(parts[0]) : null;
  if (parent && (parent.pseudo || parent.nth)) throw new Error(`unsupported selector: ${text}`);
  const spec = [self.spec[0] + (parent ? parent.spec[0] : 0), self.spec[1]];
  return { parent, self, spec };
}

// el: { classes, pseudo, index, parent: { classes } }
function selectorMatches(sel, el) {
  const { parent, self } = sel;
  if (self.pseudo !== (el.pseudo || null)) return false;
  if (!self.classes.every((c) => el.classes.includes(c))) return false;
  if (self.nth && !nthMatches(self.nth, el.index)) return false;
  if (parent && !(el.parent && parent.classes.every((c) => el.parent.classes.includes(c)))) return false;
  return true;
}

const INITIAL = {
  'animation-name': 'none',
  'animation-duration': '0s',
  'animation-delay': '0s',
  'animation-timing-function': 'ease',
  'animation-iteration-count': '1',
  'animation-fill-mode': 'none',
  'animation-direction': 'normal',
  'animation-play-state': 'running',
  transform: 'none',
  filter: 'none',
  opacity: '1',
};
const LONGHANDS = Object.keys(INITIAL).filter((k) => k.startsWith('animation-'));
const TIMING_WORDS = ['linear', 'ease', 'ease-in', 'ease-out', 'ease-in-out', 'step-start', 'step-end'];

// The `animation` shorthand, for one animation, as its longhands.
function expandAnimation(value) {
  if (['inherit', 'initial', 'unset'].includes(value)) {
    return Object.fromEntries(LONGHANDS.map((k) => [k, value === 'inherit' ? 'inherit' : INITIAL[k]]));
  }
  const out = Object.fromEntries(LONGHANDS.map((k) => [k, INITIAL[k]]));
  if (value === 'none') return out;
  if (split(value, ',').length > 1) throw new Error(`more than one animation: ${value}`);
  const times = [];
  for (const token of split(value, ' ')) {
    if (/^-?(\d*\.)?\d+m?s$/.test(token)) times.push(token);
    else if (/^(cubic-bezier|steps)\(/.test(token) || TIMING_WORDS.includes(token)) {
      out['animation-timing-function'] = token;
    } else if (token === 'infinite' || /^(\d*\.)?\d+$/.test(token)) out['animation-iteration-count'] = token;
    else if (['forwards', 'backwards', 'both'].includes(token)) out['animation-fill-mode'] = token;
    else if (['reverse', 'alternate', 'alternate-reverse'].includes(token)) out['animation-direction'] = token;
    else if (['paused', 'running'].includes(token)) out['animation-play-state'] = token;
    else if (/^[a-z_-][\w-]*$/i.test(token)) out['animation-name'] = token;
    else throw new Error(`unread animation token: ${token}`);
  }
  if (times.length > 2) throw new Error(`three times in: ${value}`);
  if (times[0]) out['animation-duration'] = times[0];
  if (times[1]) out['animation-delay'] = times[1];
  return out;
}

// Reads a stylesheet and answers "what does this element compute for prop"
// in an environment { reduce, siblingIndex }.
function reader(css, env) {
  const { rules, keyframes } = parseSheet(css);
  const live = rules.filter((r) => r.conditions.every((c) => conditionHolds(c, env)));
  const cascaded = (el, prop) => {
    let best = null;
    for (const rule of live) {
      const sels = rule.selectors.map(parseSelector).filter((s) => selectorMatches(s, el));
      if (!sels.length) continue;
      const spec = sels.map((s) => s.spec).sort((x, y) => y[0] - x[0] || y[1] - x[1])[0];
      rule.decls.forEach((d, at) => {
        if (!parses(d.value, env)) return;
        let value;
        if (d.prop === prop) value = d.value;
        else if (d.prop === 'animation' && LONGHANDS.includes(prop)) value = expandAnimation(d.value)[prop];
        else return;
        const rank = [d.important ? 1 : 0, spec[0], spec[1], rule.order, at];
        if (!best || compareRank(rank, best.rank) > 0) best = { rank, value };
      });
    }
    return best ? best.value : null;
  };
  const computed = (el, prop) => {
    const value = cascaded(el, prop);
    if (value === 'inherit') {
      // A pseudo-element inherits from the element it belongs to.
      if (el.pseudo) return computed({ ...el, pseudo: null }, prop);
      if (el.parent) return computed({ ...el.parent, pseudo: null }, prop);
      return INITIAL[prop];
    }
    return value ?? INITIAL[prop];
  };
  return {
    keyframes,
    rules,
    get: (el, prop) => computed(el, prop),
    ms: (el, prop) => toMs(computed(el, prop), el),
  };
}

function compareRank(a, b) {
  for (let i = 0; i < a.length; i += 1) if (a[i] !== b[i]) return a[i] - b[i];
  return 0;
}

// A time, or a calc() of times and numbers with sibling-index(), in ms.
function toMs(value, el) {
  const src = value.startsWith('calc(') ? value.slice(5, -1) : value;
  const tokens = src
    .replace(/sibling-index\(\)/g, String(el.index))
    .match(/(\d*\.)?\d+(ms|s)?|[-+*/()]/g);
  if (tokens.join('') !== src.replace(/sibling-index\(\)/g, String(el.index)).replace(/\s+/g, '')) {
    throw new Error(`unread time: ${value}`);
  }
  let i = 0;
  const atom = () => {
    const t = tokens[i++];
    if (t === '(') {
      const v = sum();
      if (tokens[i++] !== ')') throw new Error(`unbalanced: ${value}`);
      return v;
    }
    if (t === '-') {
      const a = atom();
      return { v: -a.v, time: a.time };
    }
    const m = t.match(/^((\d*\.)?\d+)(ms|s)?$/);
    if (!m) throw new Error(`unread time: ${value}`);
    const n = Number(m[1]);
    return m[3] ? { v: m[3] === 's' ? n * 1000 : n, time: true } : { v: n, time: false };
  };
  const product = () => {
    let left = atom();
    while (tokens[i] === '*' || tokens[i] === '/') {
      const op = tokens[i++];
      const right = atom();
      if (left.time && right.time) throw new Error(`time * time: ${value}`);
      if (op === '/' && right.time) throw new Error(`divide by a time: ${value}`);
      left = { v: op === '*' ? left.v * right.v : left.v / right.v, time: left.time || right.time };
    }
    return left;
  };
  const sum = () => {
    let left = product();
    while (tokens[i] === '+' || tokens[i] === '-') {
      const op = tokens[i++];
      const right = product();
      if (left.time !== right.time) throw new Error(`time + number: ${value}`);
      left = { v: op === '+' ? left.v + right.v : left.v - right.v, time: left.time };
    }
    return left;
  };
  const out = sum();
  if (i !== tokens.length || !out.time) throw new Error(`unread time: ${value}`);
  return Math.round(out.v * 1e6) / 1e6;
}

const flat = (s) => s.replace(/\s+/g, '');

// --- elements ----------------------------------------------------------------

const WAVEFORM = { classes: ['vai-waveform', 'vai-waveform--css'], pseudo: null, index: 1, parent: { classes: [] } };
const STAGGER_PARENT = { classes: ['vai-block-settle--stagger'] };
const child = (n) => ({ classes: [], pseudo: null, index: n, parent: STAGGER_PARENT });
const CHILDREN = Array.from({ length: 24 }, (_, i) => child(i + 1));

const ENVS = [
  { reduce: false, siblingIndex: true },
  { reduce: false, siblingIndex: false },
  { reduce: true, siblingIndex: true },
  { reduce: true, siblingIndex: false },
];
const label = (env) =>
  `${env.reduce ? 'reduced motion' : 'full motion'}, ${env.siblingIndex ? 'with' : 'without'} sibling-index()`;

// --- the reader, checked on small sheets -------------------------------------

test('reader: specificity beats order, !important beats specificity, the shorthand resets the delay', () => {
  const css = `
    .p > *:nth-child(n + 3) { animation-delay: 1s; }
    .p > * { animation: x 2s ease 0.5s; }
    .p > *:nth-child(4) { animation-delay: 0.25s !important; }
    .p > *:nth-child(4) { animation-delay: 3s; }
    .q > * { animation-delay: 0.1s; animation: y 1s both; }`;
  const r = reader(css, { reduce: false, siblingIndex: true });
  const kid = (classes, n) => ({ classes: [], pseudo: null, index: n, parent: { classes } });
  assert.equal(r.ms(kid(['p'], 2), 'animation-delay'), 500);
  assert.equal(r.ms(kid(['p'], 3), 'animation-delay'), 1000);
  assert.equal(r.ms(kid(['p'], 4), 'animation-delay'), 250);
  assert.equal(r.get(kid(['p'], 4), 'animation-name'), 'x');
  assert.equal(r.ms(kid(['q'], 1), 'animation-delay'), 0, 'a later shorthand in the same rule resets the delay');
});

test('reader: sibling-index() in calc(), @supports, and a dropped declaration', () => {
  const css = `
    .p > * { animation-delay: 0.1s; animation-delay: calc((sibling-index() - 1) * 0.08s); }
    @supports not (animation-delay: calc(sibling-index() * 1s)) {
      .p > *:nth-child(n + 2) { animation-delay: 0.7s; }
    }`;
  const kid = (n) => ({ classes: [], pseudo: null, index: n, parent: { classes: ['p'] } });
  const withIt = reader(css, { reduce: false, siblingIndex: true });
  const without = reader(css, { reduce: false, siblingIndex: false });
  assert.deepEqual([1, 2, 3, 10].map((n) => withIt.ms(kid(n), 'animation-delay')), [0, 80, 160, 720]);
  assert.deepEqual([1, 2, 3, 10].map((n) => without.ms(kid(n), 'animation-delay')), [100, 700, 700, 700]);
});

test('reader: a pseudo-element inherits from its element, and unread selectors throw', () => {
  const css = `.a { animation: x 1s; } .a::after { animation: inherit; } .b::after { transform: scaleX(0); }`;
  const r = reader(css, { reduce: false, siblingIndex: true });
  const after = { classes: ['a', 'b'], pseudo: '::after', index: 1, parent: { classes: [] } };
  assert.equal(r.get(after, 'animation-name'), 'x');
  assert.equal(r.get(after, 'transform'), 'scaleX(0)');
  assert.equal(r.get({ ...after, pseudo: null }, 'transform'), 'none');
  assert.throws(() => parseSelector('.a .b'), /unsupported selector/);
  assert.throws(() => parseSelector('div.a'), /unsupported selector/);
  assert.throws(() => conditionHolds('@media (min-width: 1px)', ENVS[0]), /unknown condition/);
});

test('reader: reads every rule, selector and condition in styles/vai-motion.css', () => {
  for (const env of ENVS) {
    const r = reader(SHEET, env);
    assert.ok(r.rules.length > 0);
    for (const rule of r.rules) {
      for (const c of rule.conditions) conditionHolds(c, env);
      for (const s of rule.selectors) parseSelector(s);
      for (const d of rule.decls) if (d.prop === 'animation') expandAnimation(d.value);
    }
    for (const rule of r.rules) {
      for (const d of rule.decls) {
        if (d.prop !== 'animation') continue;
        const name = expandAnimation(d.value)['animation-name'];
        if (!['none', 'inherit'].includes(name)) assert.ok(r.keyframes[name], `no @keyframes ${name}`);
      }
    }
  }
});

// --- waveform-trace (tier 1) ---------------------------------------------------

test('waveform: under reduced motion nothing on .vai-waveform--css moves, and the line is drawn', () => {
  for (const env of ENVS.filter((e) => e.reduce)) {
    const r = reader(SHEET, env);
    assert.equal(r.get(WAVEFORM, 'animation-name'), 'none', `the element animates (${label(env)})`);
    const line = { ...WAVEFORM, pseudo: '::after' };
    assert.equal(r.get(line, 'animation-name'), 'none', `the line animates (${label(env)})`);
    assert.equal(flat(r.get(line, 'transform')), 'scaleX(1)');
    const alone = { ...line, classes: ['vai-waveform--css'] };
    assert.equal(r.get(alone, 'animation-name'), 'none');
    assert.equal(r.get({ ...alone, pseudo: null }, 'animation-name'), 'none');
  }
});

test('waveform: at full motion only the line draws, once, at the JS defaults', () => {
  for (const env of ENVS.filter((e) => !e.reduce)) {
    const r = reader(SHEET, env);
    assert.equal(r.get(WAVEFORM, 'animation-name'), 'none', `the element itself animates (${label(env)})`);
    const line = { ...WAVEFORM, pseudo: '::after' };
    assert.equal(r.get(line, 'animation-name'), 'vai-waveform-draw');
    assert.equal(r.ms(line, 'animation-duration'), waveformTrace.defaultOptions.duration);
    assert.equal(flat(r.get(line, 'animation-timing-function')), flat(waveformTrace.defaultOptions.ease));
    assert.equal(flat(r.get(line, 'animation-timing-function')), flat(EASE.default));
    assert.equal(r.get(line, 'animation-iteration-count'), '1');
    assert.equal(r.get(line, 'animation-fill-mode'), 'both');
    assert.equal(r.ms(line, 'animation-delay'), 0);
    const draw = r.keyframes['vai-waveform-draw'];
    assert.equal(flat(draw.from.transform), 'scaleX(0)');
    assert.equal(flat(draw.to.transform), 'scaleX(1)');
  }
});

// --- block-settle stagger (tier 2) ---------------------------------------------

const STEP = blockSettle.defaultOptions.stagger; // 80, as settleAll uses

test('stagger: child n starts at (n - 1) * 80ms, as settleAll() starts block n - 1', () => {
  const r = reader(SHEET, { reduce: false, siblingIndex: true });
  const delays = CHILDREN.map((c) => r.ms(c, 'animation-delay'));
  assert.deepEqual(delays, CHILDREN.map((c) => (c.index - 1) * STEP));
});

test('stagger: without sibling-index(), children 1 to 9 keep that step and later ones start with child 9', () => {
  const r = reader(SHEET, { reduce: false, siblingIndex: false });
  const delays = CHILDREN.map((c) => r.ms(c, 'animation-delay'));
  assert.deepEqual(delays, CHILDREN.map((c) => Math.min(c.index - 1, 8) * STEP));
});

test('stagger: no child starts before the children ahead of it', () => {
  for (const env of ENVS) {
    const r = reader(SHEET, env);
    const delays = CHILDREN.map((c) => r.ms(c, 'animation-delay'));
    for (let i = 1; i < delays.length; i += 1) {
      assert.ok(
        delays[i] >= delays[i - 1],
        `child ${i + 1} starts at ${delays[i]}ms, before child ${i} at ${delays[i - 1]}ms (${label(env)})`,
      );
    }
  }
});

test('stagger: every child keeps the declared ease and duration', () => {
  for (const env of ENVS.filter((e) => !e.reduce)) {
    const r = reader(SHEET, env);
    for (const c of [...CHILDREN, { ...child(1), classes: ['vai-block-settle'], parent: { classes: [] } }]) {
      assert.equal(r.get(c, 'animation-name'), 'vai-block-settle');
      assert.equal(r.ms(c, 'animation-duration'), blockSettle.defaultOptions.duration);
      assert.equal(flat(r.get(c, 'animation-timing-function')), flat(blockSettle.defaultOptions.ease));
      assert.equal(flat(r.get(c, 'animation-timing-function')), flat(EASE.out));
      assert.equal(r.get(c, 'animation-fill-mode'), 'both');
    }
  }
});

test('reduced motion: tier 2 runs 200ms or less with no stagger, and tier 1 runs nothing', () => {
  for (const env of ENVS.filter((e) => e.reduce)) {
    const r = reader(SHEET, env);
    for (const c of CHILDREN) {
      assert.equal(r.ms(c, 'animation-delay'), 0, `child ${c.index} waits (${label(env)})`);
      assert.equal(r.ms(c, 'animation-duration'), 200);
    }
    const one = (classes, pseudo = null) => ({ classes, pseudo, index: 1, parent: { classes: [] } });
    for (const cls of ['vai-field-breath', 'vai-mark-settle', 'vai-block-settle']) {
      assert.ok(r.ms(one([cls]), 'animation-duration') <= 200, cls);
      assert.ok(r.ms(one([cls]), 'animation-delay') <= 0, cls);
    }
    assert.equal(r.get(one(['vai-mark-settle']), 'filter'), 'none');
    assert.equal(r.get(one(['vai-grain'], '::before'), 'animation-name'), 'none');
    assert.equal(r.get(one(['vai-waveform'], '::after'), 'animation-name'), 'none');
  }
});
