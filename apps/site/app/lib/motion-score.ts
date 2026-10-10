// designesy_motion_score: the ten checks of the motion contract (m01-m10),
// run on one Lottie file.
//
// WHY THIS MODULE EXISTS
// The tool used to compute its own ten checks (required fields, version, frame
// rate, dimensions, layers, in/out points, markers, deprecated layers, a §16
// placeholder, schema) and then label them with the contract's check names by
// array position. The contract's m01-m10 are different checks, so every
// verdict sat under another check's name: "meta object present" FAILed because
// a file had zero layers, and "Duration ≤ 300ms" PASSed because no layer type
// was deprecated. Here each check computes its own verdict under its own id and
// the contract's own name for that id, looked up by id, never by position.
//
// The PyPI server (packages/designesy-mcp, _motion_score) ports this module
// line for line. Both run on the fixtures in
// packages/designesy-mcp/test/fixtures/motion/ and must produce expected.json
// there: the Python suite checks its output, scripts/check-mcp-tool-parity.js
// checks this module's.
//
// What a single file can and cannot show is stated per check. A check the
// file cannot settle returns SKIP with the reason, never a PASS: m01 checks the
// schema's top-level animation object but not layer contents, and §16.5 and
// §16.4 (m09, m10) concern the page that embeds the file.
//
// PURE AND IMPORT-FREE: the parity gate loads this file with Node's type
// stripping, so it takes the contract as an argument and imports nothing.

export type MotionStatus = 'PASS' | 'FAIL' | 'WARN' | 'SKIP';

export type MotionCheck = { id: string; name: string; status: MotionStatus; detail: string };

type Json = unknown;
type Obj = Record<string, Json>;

/** The parts of the motion contract (/contracts/motion.json) this module reads. */
export type MotionContractLike = {
  id?: Json;
  version?: Json;
  status?: Json;
  conformance?: { ten_non_negotiable?: ReadonlyArray<Obj> | Json } | Json;
  verification?: { checks?: ReadonlyArray<Obj> | Json } | Json;
};

/** The full LAC v1.0.1 schema (the URL the contract's json_schema page links to). */
export const LOTTIE_SCHEMA_URL = 'https://lottie.github.io/lottie-spec/1.0.1/lottie.schema.json';

/** The contract's own names, used only when a contract lacks a check id. */
export const MOTION_CHECK_NAMES: Readonly<Record<string, string>> = {
  m01: 'Lottie file validates against LAC v1.0.1 JSON Schema',
  m02: 'Required fields present (v, fr, ip, op, w, h, layers)',
  m03: 'No deprecated Bodymovin version (v: "4.x")',
  m04: 'markers array present (reduced-motion support)',
  m05: 'meta object present (attribution, author, description)',
  m06: 'prefers-reduced-motion path documented (§3.4)',
  m07: 'Easing uses deliberate curves (§16.1, §16.10)',
  m08: 'Duration ≤ 300ms for UI motion (§16.7)',
  m09: 'No layout-property animation (§16.5)',
  m10: 'No motion on keyboard-initiated actions (§16.4)',
};

const REQUIRED = ['v', 'fr', 'ip', 'op', 'w', 'h', 'layers'];
// A marker or slot named for a calmer variant (the contract leaves the name
// open: "reduced"/"calm"/"static" is one of its open questions).
const REDUCED_NAME = /reduc|calm|static|still|no[-_ ]?motion/i;
// meta noting that the embedding page gates playback (the contract's WARN).
const EXTERNAL_NOTE = /prefers-reduced-motion|reduced[- ]motion/i;
const EPS = 0.001;
const UI_BOUND_MS = 300;

function isObj(x: Json): x is Obj {
  return x !== null && typeof x === 'object' && !Array.isArray(x);
}

function isNum(x: Json): x is number {
  return typeof x === 'number' && Number.isFinite(x);
}

function has(o: Obj, k: string): boolean {
  return Object.prototype.hasOwnProperty.call(o, k);
}

/** A value for a sentence: numbers as JS prints them, anything else by kind. */
function show(o: Obj, k: string): string {
  if (!has(o, k)) return 'missing';
  const x = o[k];
  if (isNum(x)) return String(x);
  if (x === null) return 'null';
  if (Array.isArray(x)) return 'an array';
  if (typeof x === 'string') return 'a string';
  if (typeof x === 'boolean') return 'a boolean';
  if (typeof x === 'object') return 'an object';
  return 'not a number';
}

function plural(n: number, word: string): string {
  return `${n} ${word}${n === 1 ? '' : 's'}`;
}

function clip(s: string): string {
  return s.length > 40 ? `${s.slice(0, 40)}...` : s;
}

/** "§16.5 (Layout is not animated)", read from the contract's ten_non_negotiable. */
function standard(contract: MotionContractLike, num: number): string {
  const conf = isObj(contract.conformance) ? contract.conformance : {};
  const list = Array.isArray(conf.ten_non_negotiable) ? conf.ten_non_negotiable : [];
  for (const s of list) {
    if (isObj(s) && s.num === num && typeof s.rule === 'string') return `§16.${num} (${s.rule})`;
  }
  return `§16.${num}`;
}

function checkNames(contract: MotionContractLike): Record<string, string> {
  const names: Record<string, string> = { ...MOTION_CHECK_NAMES };
  const ver = isObj(contract.verification) ? contract.verification : {};
  const list = Array.isArray(ver.checks) ? ver.checks : [];
  for (const c of list) {
    if (isObj(c) && typeof c.id === 'string' && typeof c.item === 'string' && has(names, c.id)) names[c.id] = c.item;
  }
  return names;
}

// ── m01: the schema's top-level animation object ─────────────────────────────

function m01Schema(l: Obj): [MotionStatus, string] {
  const v: string[] = [];
  for (const f of ['w', 'h', 'fr', 'op', 'ip', 'layers']) if (!has(l, f)) v.push(`${f} is missing`);
  for (const f of ['w', 'h']) {
    if (has(l, f) && !(isNum(l[f]) && Number.isInteger(l[f]) && (l[f] as number) >= 0)) v.push(`${f} must be an integer of at least 0`);
  }
  if (has(l, 'fr') && !(isNum(l.fr) && l.fr > 0)) v.push('fr must be a number above 0');
  for (const f of ['ip', 'op']) if (has(l, f) && !isNum(l[f])) v.push(`${f} must be a number`);
  if (has(l, 'layers')) {
    if (!Array.isArray(l.layers)) v.push('layers must be an array');
    else {
      const bad = l.layers.filter((x) => !isObj(x)).length;
      if (bad > 0) v.push(bad === 1 ? '1 layer is not an object' : `${bad} layers are not objects`);
    }
  }
  if (has(l, 'ver') && !(isNum(l.ver) && Number.isInteger(l.ver) && l.ver >= 10000)) v.push('ver must be an integer of at least 10000');
  if (has(l, 'nm') && typeof l.nm !== 'string') v.push('nm must be a string');
  if (has(l, 'markers')) {
    if (!Array.isArray(l.markers)) v.push('markers must be an array');
    else if (l.markers.some((m) => !isObj(m))) v.push('every marker must be an object');
  }
  if (has(l, 'slots') && !isObj(l.slots)) v.push('slots must be an object');
  if (has(l, 'assets') && !Array.isArray(l.assets)) v.push('assets must be an array');
  if (v.length > 0) {
    return ['FAIL', `Schema violations in the top-level animation object: ${v.join('; ')}. Schema: ${LOTTIE_SCHEMA_URL}.`];
  }
  return ['SKIP', `Schema: the top-level animation object has no violation (w, h, fr, ip, op and layers are present and typed as the schema requires). Layer contents are not validated here, so this is not a full schema pass: validate the file with ajv 8 (ajv/dist/2020) and ajv-formats against ${LOTTIE_SCHEMA_URL}.`];
}

// ── m07: keyframe easing ─────────────────────────────────────────────────────

type Curve = 'linear' | 'ease' | 'ease-in' | 'custom';

function near(a: number, b: number): boolean {
  return Math.abs(a - b) <= EPS;
}

/** cubic-bezier(x1, y1, x2, y2) from a keyframe's out (o) and in (i) handles. */
function classify(x1: number, y1: number, x2: number, y2: number): Curve {
  if (near(x1, y1) && near(x2, y2)) return 'linear';
  if (near(x1, 0.25) && near(y1, 0.1) && near(x2, 0.25) && near(y2, 1)) return 'ease';
  // Second handle on the diagonal (no deceleration into the next keyframe) and
  // first handle below it (acceleration away from this one): an ease-in.
  if (near(x2, y2) && y1 < x1 - EPS) return 'ease-in';
  return 'custom';
}

function comps(x: Json): Json[] {
  return Array.isArray(x) ? x : [x];
}

/** The curve of one keyframe: its first rejected dimension, else custom. Null when it has none. */
function keyframeCurve(kf: Obj): Curve | null {
  if (kf.h === 1 || !isObj(kf.o) || !isObj(kf.i)) return null;
  const ox = comps(kf.o.x), oy = comps(kf.o.y), ix = comps(kf.i.x), iy = comps(kf.i.y);
  const dims = Math.max(ox.length, oy.length, ix.length, iy.length);
  let seen = false;
  for (let d = 0; d < dims; d++) {
    const at = (a: Json[]) => a[Math.min(d, a.length - 1)];
    const p = [at(ox), at(oy), at(ix), at(iy)];
    if (!p.every(isNum)) continue;
    seen = true;
    const c = classify(p[0] as number, p[1] as number, p[2] as number, p[3] as number);
    if (c !== 'custom') return c;
  }
  return seen ? 'custom' : null;
}

function m07Easing(l: Obj, contract: MotionContractLike, layerCount: number): [MotionStatus, string] {
  const counts: Record<Curve, number> = { linear: 0, ease: 0, 'ease-in': 0, custom: 0 };
  const stack: Json[] = [l];
  while (stack.length > 0) {
    const node = stack.pop();
    if (Array.isArray(node)) {
      for (const x of node) stack.push(x);
    } else if (isObj(node)) {
      if (node.a === 1 && Array.isArray(node.k)) {
        for (const kf of node.k) {
          if (!isObj(kf)) continue;
          const c = keyframeCurve(kf);
          if (c) counts[c]++;
        }
      }
      for (const k of Object.keys(node)) stack.push(node[k]);
    }
  }
  const total = counts.linear + counts.ease + counts['ease-in'] + counts.custom;
  const stds = `${standard(contract, 1)} and ${standard(contract, 10)}`;
  if (total === 0) {
    return ['SKIP', `Easing: no eased keyframes to check (${plural(layerCount, 'layer')}, no animated property with bezier handles), so ${stds} have nothing to test.`];
  }
  const rejected = counts.linear + counts.ease + counts['ease-in'];
  if (rejected === 0) {
    const all = total === 1 ? 'the one eased keyframe uses a custom curve' : `all ${total} eased keyframes use custom curves`;
    return ['PASS', `Easing: ${all}, as ${stds} require.`];
  }
  const parts = (['linear', 'ease', 'ease-in'] as const).filter((k) => counts[k] > 0).map((k) => `${counts[k]} ${k}`);
  const verb = rejected === 1 ? 'uses' : 'use';
  return ['FAIL', `Easing: ${rejected} of ${plural(total, 'eased keyframe')} ${verb} a curve ${stds} reject (${parts.join(', ')}). Use a custom curve that decelerates, such as the contract's cubicBezier tokens.`];
}

// ── The ten checks ───────────────────────────────────────────────────────────

/**
 * Score one parsed Lottie file against the motion contract. `lottie` must be a
 * JSON object (the callers reject anything else before calling this).
 */
export function scoreLottie(lottie: Obj, contract: MotionContractLike, url: string) {
  const l = lottie;
  const names = checkNames(contract);
  const layers = Array.isArray(l.layers) ? l.layers : null;
  const layerCount = layers ? layers.length : 0;
  const out: MotionCheck[] = [];
  const add = (id: string, [status, detail]: [MotionStatus, string]) => out.push({ id, name: names[id], status, detail });

  add('m01', m01Schema(l));

  const missing = REQUIRED.filter((f) => !has(l, f));
  if (missing.length > 0) {
    add('m02', ['FAIL', `Required fields missing: ${missing.join(', ')}. The contract requires ${REQUIRED.join(', ')}.`]);
  } else if (layers && layers.length === 0) {
    add('m02', ['WARN', `Required fields present (${REQUIRED.join(', ')}), but layers is empty, so the animation draws nothing.`]);
  } else {
    add('m02', ['PASS', `Required fields present: ${REQUIRED.join(', ')}.`]);
  }

  if (!has(l, 'v')) {
    add('m03', ['SKIP', 'Bodymovin version: the file has no v field, so its exporter version cannot be checked (m02 reports the missing field).']);
  } else {
    const v = typeof l.v === 'string' ? l.v : null;
    const major = v === null ? null : /^([0-9]+)/.exec(v);
    if (v === null || major === null) {
      add('m03', ['WARN', `Bodymovin version: v is ${v === null ? show(l, 'v') : JSON.stringify(clip(v))}, not a version string such as "5.12.0", so deprecation cannot be checked.`]);
    } else if (Number(major[1]) < 5) {
      add('m03', ['FAIL', `Bodymovin version: v is ${JSON.stringify(clip(v))}, a ${major[1]}.x export, which is deprecated: re-export with an exporter that follows the Lottie spec.`]);
    } else {
      add('m03', ['PASS', `Bodymovin version: v is ${JSON.stringify(clip(v))}, 5.x or later, so not deprecated.`]);
    }
  }

  const markers = Array.isArray(l.markers) ? l.markers : null;
  if (markers && markers.length > 0) {
    const named = markers.filter(isObj).map((m) => m.cm).filter((c): c is string => typeof c === 'string');
    const list = named.length > 0 ? `: ${named.slice(0, 5).map(clip).join(', ')}${named.length > 5 ? ', ...' : ''}` : '';
    add('m04', ['PASS', `markers array present with ${plural(markers.length, 'marker')}${list}.`]);
  } else if (markers) {
    add('m04', ['FAIL', 'markers array is empty, so a player has no named segment to choose for reduced motion.']);
  } else {
    add('m04', ['FAIL', 'No markers array, so a player has no named segment to choose for reduced motion.']);
  }

  if (isObj(l.meta)) {
    const meta = l.meta;
    const fields = ([['a', 'author'], ['d', 'description'], ['k', 'keywords'], ['g', 'generator'], ['tc', 'theme color']] as const)
      .filter(([k]) => has(meta, k)).map(([, n]) => n);
    add('m05', ['PASS', fields.length > 0 ? `meta object present with ${fields.join(', ')}.` : 'meta object present, with none of author, description or keywords filled in.']);
  } else {
    add('m05', ['WARN', 'No meta object, so the file carries no attribution, author or description (an attribution gap).']);
  }

  const reducedMarker = (markers || []).filter(isObj).map((m) => m.cm).find((c): c is string => typeof c === 'string' && REDUCED_NAME.test(c));
  const reducedSlot = isObj(l.slots) ? Object.keys(l.slots).find((k) => REDUCED_NAME.test(k)) : undefined;
  const metaText = isObj(l.meta)
    ? [l.meta.d, ...(Array.isArray(l.meta.k) ? l.meta.k : [l.meta.k])].filter((x): x is string => typeof x === 'string')
    : [];
  if (reducedMarker !== undefined) {
    add('m06', ['PASS', `Reduced-motion path documented in the file: marker ${JSON.stringify(clip(reducedMarker))}.`]);
  } else if (reducedSlot !== undefined) {
    add('m06', ['PASS', `Reduced-motion path documented in the file: slot ${JSON.stringify(clip(reducedSlot))}.`]);
  } else if (metaText.some((t) => EXTERNAL_NOTE.test(t))) {
    add('m06', ['WARN', 'Reduced motion is handled outside the file: meta notes an external prefers-reduced-motion wrapper, which this tool cannot see.']);
  } else {
    add('m06', ['FAIL', 'No reduced-motion path documented: no marker or slot is named for reduced motion (reduced, calm, static, still, no-motion), and meta does not note an external prefers-reduced-motion wrapper.']);
  }

  add('m07', m07Easing(l, contract, layerCount));

  if (isNum(l.fr) && l.fr > 0 && isNum(l.ip) && isNum(l.op) && l.op > l.ip) {
    const ms = Math.round(((l.op - l.ip) / l.fr) * 1000);
    const span = `${ms} ms (${String(l.op - l.ip)} frames at ${String(l.fr)} fps)`;
    if (ms <= UI_BOUND_MS) {
      add('m08', ['PASS', `Duration ${span} is within the ${UI_BOUND_MS} ms bound for UI motion, ${standard(contract, 7)}.`]);
    } else {
      add('m08', ['WARN', `Duration ${span} exceeds the ${UI_BOUND_MS} ms bound for UI motion, ${standard(contract, 7)}. Longer motion needs a stated justification, which this tool cannot read from a file: shorten it if it is UI motion.`]);
    }
  } else {
    add('m08', ['SKIP', `Duration cannot be computed: it needs fr above 0 and op greater than ip (fr ${show(l, 'fr')}, ip ${show(l, 'ip')}, op ${show(l, 'op')}).`]);
  }

  add('m09', ['SKIP', `Not applicable to a Lottie file: ${standard(contract, 5)} concerns CSS layout properties (width, height, margin, padding, top, left), and a Lottie file has none; it animates transforms, opacity and vector shapes inside its own canvas. Check the page that embeds it with designesy_score.`]);
  add('m10', ['SKIP', `Not applicable to a Lottie file: ${standard(contract, 4)} concerns what starts playback, and whether a keyboard action starts it is decided by the page that embeds the file. Check that page with designesy_score.`]);

  const count = (s: MotionStatus) => out.filter((c) => c.status === s).length;
  const pass = count('PASS'), warn = count('WARN'), fail = count('FAIL'), skip = count('SKIP');
  const scored = pass + warn + fail;
  const score = scored > 0 ? Math.round(((pass + warn * 0.5) / scored) * 100) : 0;
  const grade = score >= 90 ? 'A' : score >= 80 ? 'B' : score >= 70 ? 'C' : score >= 60 ? 'D' : 'F';
  const conf = isObj(contract.conformance) ? contract.conformance : {};

  return {
    contract_id: contract.id ?? null,
    contract_version: contract.version ?? null,
    contract_status: contract.status ?? null,
    url,
    lottie_version: typeof l.v === 'string' ? l.v : null,
    layer_count: layerCount,
    score,
    grade,
    pass_count: pass,
    fail_count: fail,
    warn_count: warn,
    skip_count: skip,
    scoring: 'PASS=1, WARN=0.5, FAIL=0; SKIP is not scored. Score = points / scored checks x 100. A>=90, B>=80, C>=70, D>=60, F<60.',
    checks: out,
    ten_non_negotiable: Array.isArray(conf.ten_non_negotiable) ? conf.ten_non_negotiable : [],
    provenance: 'Lottie Animation Community spec v1.0.1 and Designesy core §7 (Motion Stance) and §16 (Ten Non-Negotiable Motion Standards)',
    validator_note: `m01 checks the top-level animation object only. For full schema validation use ajv 8 (import Ajv from "ajv/dist/2020") with ajv-formats 3 against ${LOTTIE_SCHEMA_URL}.`,
  };
}
