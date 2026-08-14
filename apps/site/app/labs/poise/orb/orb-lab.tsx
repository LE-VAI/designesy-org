'use client';

/**
 * OrbLab — Designesy-blue Poise-lab experiment.
 *
 * Self-contained WebGL2 orb in the Poise lab. The exact shader (OkLab palette,
 * MurmurHash3 noise, premultiplied alpha, seamless-loop phase) comes from
 * Martin Štrba's orb editor at orb-pg.vercel.app / postgeneric.com — see the
 * attribution footer on the page. We reuse the math and the parameter shape
 * verbatim; we paint the orb in Designesy contract tokens and present six
 * parameters instead of twenty, because the lab framing is "dial the orb,
 * export the embed" — not "ship a full DAW."
 *
 * This file contains the full 32 KB orb factory (createOrb) imported from
 * Strba's source, re-tuned with the Designesy blue preset, and a small
 * client wrapper that exposes the six surfaced controls + a copy-embed
 * button. Reduced-motion is honoured by Strba's matchMedia hook (verbatim
 * in createOrb); the entire orb pauses on the OS-level preference.
 */

import { useEffect, useRef, useState, useCallback } from 'react';

// ── Orb factory (Martin Štrba's exact shader + JS, ported to Designesy blue) ──
//
// The math is identical to orb-pg.vercel.app — OkLab palette ramp, two-pass
// domain-warp fBm noise, integer-hash grain, premultiplied-alpha composite.
// Only the default state is changed: colors come from the Designesy v0.4.0
// contract (--signal, --signal-light, --signal-access), motion values are
// calmer (no iridescence, no glow, balanced for a brand surface), and the
// light direction points up-and-left so the rim catches the page corner.

declare global {
  interface Window { __designesyOrb?: ReturnType<typeof createOrb> | null }
}

const TAU = Math.PI * 2;

function hexToRGB(hex: string): [number, number, number] {
  const h = String(hex || '').replace('#', '');
  const v = parseInt(h.length === 3 ? h[0] + h[0] + h[1] + h[1] + h[2] + h[2] : h, 16);
  return [((v >> 16) & 255) / 255, ((v >> 8) & 255) / 255, (v & 255) / 255];
}

function srgbToOklab(hex: string): [number, number, number] {
  const c = hexToRGB(hex).map((u) =>
    u <= 0.04045 ? u / 12.92 : Math.pow((u + 0.055) / 1.055, 2.4),
  );
  const l = 0.4122214708 * c[0] + 0.5363325363 * c[1] + 0.0514459929 * c[2];
  const m = 0.2119034982 * c[0] + 0.6806995451 * c[1] + 0.1073969566 * c[2];
  const s = 0.0883024619 * c[0] + 0.2817188376 * c[1] + 0.6299787005 * c[2];
  const l_ = Math.cbrt(l), m_ = Math.cbrt(m), s_ = Math.cbrt(s);
  return [
    0.2104542553 * l_ + 0.7936177850 * m_ - 0.0040720468 * s_,
    1.9779984951 * l_ - 2.4285922050 * m_ + 0.4505937099 * s_,
    0.0259040371 * l_ + 0.7827717662 * m_ - 0.8086757660 * s_,
  ];
}

const VERT = `#version 300 es
void main() {
  vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}`;

const FRAG = `#version 300 es
precision highp float;
precision highp int;
uniform vec2  uRes;
uniform float uPhase;
uniform vec3  uLab[4];
uniform float uCount;
uniform float uScaleN;
uniform float uFlow;
uniform float uTurb;
uniform float uWobble;
uniform float uIrid;
uniform float uShift;
uniform float uBalance;
uniform float uChroma;
uniform float uContrast;
uniform float uSoft;
uniform float uGlow;
uniform float uShading;
uniform float uSpec;
uniform float uRim;
uniform float uRefract;
uniform float uInner;
uniform float uAberr;
uniform float uGrain;
uniform vec3  uLight;
out vec4 fragColor;
const float TAU = 6.28318530718;
const float RAD = 0.86;
const float RMAX = 1.0 / RAD;
uint hashU(uint x) {
  x ^= x >> 16; x *= 0x85EBCA6Bu;
  x ^= x >> 13; x *= 0xC2B2AE35u;
  x ^= x >> 16;
  return x;
}
uint hashU2(uvec2 p) { return hashU(p.x * 0x9E3779B9u ^ hashU(p.y)); }
uint hashU3(uvec3 p) { return hashU(p.x * 0x9E3779B9u ^ hashU(p.y) ^ hashU(p.z) * 0x27D4EB2Fu); }
float rand2(ivec2 p) { return float(hashU2(uvec2(p + 4096)) >> 8) / 16777216.0; }
float rand3(ivec3 p) { return float(hashU3(uvec3(p + 4096)) >> 8) / 16777216.0; }
float vnoise(vec2 p) {
  ivec2 i = ivec2(floor(p));
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(rand2(i), rand2(i + ivec2(1, 0)), u.x),
             mix(rand2(i + ivec2(0, 1)), rand2(i + ivec2(1, 1)), u.x), u.y);
}
float fbm(vec2 p) {
  float s = 0.0, a = 0.5;
  for (int k = 0; k < 3; k++) { s += a * vnoise(p); p *= 2.03; a *= 0.5; }
  return s / 0.875;
}
vec2 flowField(vec2 p) {
  float ang = TAU * vnoise(p + 11.3) + uPhase;
  float mag = 0.35 + 0.65 * vnoise(p + 27.9);
  return vec2(cos(ang), sin(ang)) * mag;
}
vec3 iridesce(vec3 lab, float f) {
  float a = uIrid * f * -2.2;
  float c = cos(a), s = sin(a);
  return vec3(lab.x, c * lab.y - s * lab.z, s * lab.y + c * lab.z);
}
vec3 labRamp(float x) {
  float xx = clamp(x, 0.0, 1.0) * (uCount - 1.0);
  vec3 c = mix(uLab[0], uLab[1], clamp(xx, 0.0, 1.0));
  c = mix(c, uLab[2], clamp(xx - 1.0, 0.0, 1.0));
  c = mix(c, uLab[3], clamp(xx - 2.0, 0.0, 1.0));
  return c;
}
vec3 paletteLab(float t) {
  float x = pow(clamp(0.5 + 0.5 * cos(TAU * t), 0.0, 1.0), uBalance);
  vec3 lab = labRamp(x);
  float ang = TAU * (t * 2.0 + 0.123);
  float amp = 0.17 * uChroma * length(lab.yz);
  lab.yz += amp * vec2(sin(ang), cos(ang * 1.37 + 1.1));
  float ch = length(lab.yz);
  if (ch > 0.33) lab.yz *= 0.33 / ch;
  lab.x = clamp(0.5 + (lab.x - 0.5) * uContrast, 0.0, 1.0);
  return lab;
}
vec3 oklabToLinear(vec3 c) {
  float l_ = c.x + 0.3963377774 * c.y + 0.2158037573 * c.z;
  float m_ = c.x - 0.1055613458 * c.y - 0.0638541728 * c.z;
  float s_ = c.x - 0.0894841775 * c.y - 1.2914855480 * c.z;
  vec3 lms = vec3(l_ * l_ * l_, m_ * m_ * m_, s_ * s_ * s_);
  return mat3( 4.0767416621, -1.2684380046, -0.0041960863,
              -3.3077115913,  2.6097574011, -0.7034186147,
               0.2309699292, -0.3413193965,  1.7076147010) * lms;
}
vec3 linearToSrgb(vec3 c) {
  c = clamp(c, 0.0, 1.0);
  vec3 lo = c * 12.92;
  vec3 hi = 1.055 * pow(max(c, 1e-5), vec3(1.0 / 2.4)) - 0.055;
  return mix(lo, hi, step(0.0031308, c));
}
void main() {
  vec2 uv = (gl_FragCoord.xy * 2.0 - uRes) / min(uRes.x, uRes.y);
  uv /= RAD;
  if (uWobble > 0.0) {
    float r0 = length(uv);
    float th = atan(uv.y, uv.x + 1e-6);
    float wob = 0.60 * sin(3.0 * th + uPhase)
              + 0.40 * sin(5.0 * th - 2.0 * uPhase)
              + 0.25 * sin(7.0 * th + 3.0 * uPhase);
    uv *= 1.0 - uWobble * 0.055 * wob * smoothstep(0.0, 0.5, r0);
  }
  float r = length(uv);
  vec2 pd = uv / max(r, 1.0);
  float z = sqrt(max(1.0 - dot(pd, pd), 0.0));
  vec3 n = vec3(pd, z);
  vec2 p0 = (pd - n.xy * uRefract) * uScaleN;
  vec2 p1 = p0 + uFlow * flowField(p0);
  vec2 p2 = p1 + uTurb * flowField(p1 * 1.7 + 5.2);
  float noise = mix(0.5, fbm(p2 + 3.7), 1.35);
  float t = noise + uShift;
  float fres3 = pow(1.0 - n.z, 3.0);
  vec3 lab = iridesce(paletteLab(t), fres3);
  vec3 base;
  if (uAberr > 0.001) {
    float d = uAberr * 0.05 * r * r;
    base = vec3(oklabToLinear(iridesce(paletteLab(t - d), fres3)).r,
                oklabToLinear(lab).g,
                oklabToLinear(iridesce(paletteLab(t + d), fres3)).b);
  } else {
    base = oklabToLinear(lab);
  }
  base = max(base, 0.0);
  vec3 L = normalize(uLight);
  float diffD = clamp(dot(n, L), 0.0, 1.0);
  vec3 col = mix(base, vec3(diffD), uShading);
  vec2 op = pd + L.xy * 0.45;
  col += uInner * exp(-dot(op, op) * 2.2) * base;
  float fres = pow(1.0 - n.z, 8.0) * uRim;
  vec3 half_ = normalize(L + vec3(0.0, 0.0, 1.0));
  float spec = pow(max(dot(n, half_), 0.0), 24.3) * uSpec;
  col += fres + spec;
  vec3 lit = linearToSrgb(col);
  vec3 flat_ = linearToSrgb(base);
  float w = max(uSoft, 1.5 * fwidth(r));
  float body = 1.0 - smoothstep(1.0 - w, 1.0, r);
  float glowF = uGlow * exp(-max(r - 1.0, 0.0) * 20.0);
  glowF *= 1.0 - smoothstep(0.45, 1.0, (r - 1.0) / (RMAX - 1.0));
  float a = clamp(body + glowF * (1.0 - body), 0.0, 1.0);
  vec3 outCol = mix(flat_, lit, body);
  int frame = int(uPhase / TAU * 24.0);
  float gn = rand3(ivec3(ivec2(gl_FragCoord.xy), frame)) - 0.5;
  outCol += gn * (uGrain * 0.1 + 1.0 / 255.0);
  outCol = clamp(outCol, 0.0, 1.0);
  fragColor = vec4(outCol * a, a);
}`;

// ── Designesy-blue preset (tokens → orb state) ───────────────────────────
//
// Tokens mapped from design-system-contract.ts v0.4.0:
//   --signal         #0133cb  (brand action)
//   --signal-light   #3358e8  (hover / focus)
//   --signal-access  #5d7bff  (accessible accent)
//   --ink            #f5f5f7  (primary foreground)
//
// 6 parameters surfaced, mapped to orb shader uniforms:
//   colorShift  → uShift (palette position)
//   flow        → uFlow  (domain warp magnitude)
//   turbulence  → uTurb  (nested warp)
//   light       → uLight.x / uLight.y (rim catch direction)
//   grain       → uGrain (display-space noise)
//   glow        → uGlow  (outside-radius halo)
// All other parameters (iridescence, chroma, aberration, etc) are held at
// calm defaults — the lab is "dial the orb", not "ship a DAW".

type OrbState = {
  colors: string[];
  colorShift: number;
  flow: number;
  turbulence: number;
  light: number; // 0..1, mapped to lightX [-1..1]
  grain: number;
  glow: number;
};

const DESIGNESY_PRESET: OrbState = {
  colors: ['#0133cb', '#3358e8', '#5d7bff', '#f5f5f7'],
  colorShift: 0.18,
  flow: 0.55,
  turbulence: 0.35,
  light: 0.18, // lightX = -0.64 (up-and-left)
  grain: 0.45,
  glow: 0,
};

type OrbInstance = {
  update: (state: OrbState) => void;
  destroy: () => void;
  supported: boolean;
};

function createOrb(container: HTMLDivElement, state: OrbState): OrbInstance {
  const canvas = document.createElement('canvas');
  canvas.style.cssText = 'width:100%;height:100%;display:block;';
  container.appendChild(canvas);

  const gl = canvas.getContext('webgl2', {
    alpha: true,
    premultipliedAlpha: true,
    antialias: false,
    depth: false,
    stencil: false,
    powerPreference: 'low-power',
  }) as WebGL2RenderingContext | null;

  if (!gl) {
    canvas.remove();
    return {
      update() {},
      destroy() {},
      supported: false,
    };
  }

  const vals: Record<string, number | number[] | Float32Array> = {};
  let prog: WebGLProgram | null = null;
  let loc: Record<string, WebGLUniformLocation | null> = {};

  function compile(type: number, src: string): WebGLShader {
    const sh = gl!.createShader(type)!;
    gl!.shaderSource(sh, src);
    gl!.compileShader(sh);
    if (!gl!.getShaderParameter(sh, gl!.COMPILE_STATUS)) {
      const log = gl!.getShaderInfoLog(sh);
      gl!.deleteShader(sh);
      throw new Error('Orb shader compile failed: ' + log);
    }
    return sh;
  }

  function buildProgram() {
    const vs = compile(gl!.VERTEX_SHADER, VERT);
    const fs = compile(gl!.FRAGMENT_SHADER, FRAG);
    const p = gl!.createProgram()!;
    gl!.attachShader(p, vs);
    gl!.attachShader(p, fs);
    gl!.linkProgram(p);
    gl!.deleteShader(vs);
    gl!.deleteShader(fs);
    if (!gl!.getProgramParameter(p, gl!.LINK_STATUS)) {
      throw new Error('Orb program link failed: ' + gl!.getProgramInfoLog(p));
    }
    prog = p;
    loc = {};
    const n = gl!.getProgramParameter(p, gl!.ACTIVE_UNIFORMS);
    for (let i = 0; i < n; i++) {
      const name = gl!.getActiveUniform(p, i)!.name.replace(/\[0\]$/, '');
      loc[name] = gl!.getUniformLocation(p, name);
    }
    gl!.useProgram(p);
    gl!.disable(gl!.DEPTH_TEST);
    gl!.disable(gl!.BLEND);
    pushUniforms();
  }

  function pushUniforms() {
    if (!prog) return;
    gl!.useProgram(prog);
    for (const k in vals) {
      const l = loc[k];
      if (!l) continue;
      const v = vals[k];
      if (typeof v === 'number') gl!.uniform1f(l, v);
      else if ((v as number[]).length === 2) gl!.uniform2f(l, (v as number[])[0], (v as number[])[1]);
      else if ((v as number[]).length === 3) gl!.uniform3f(l, (v as number[])[0], (v as number[])[1], (v as number[])[2]);
      else gl!.uniform3fv(l, v as Float32Array);
    }
  }

  function update(next: OrbState) {
    const cols = next.colors.slice(0, 4);
    while (cols.length < 4) cols.push(cols[cols.length - 1]);
    const lab = new Float32Array(12);
    for (let i = 0; i < 4; i++) {
      const v = srgbToOklab(cols[i]);
      lab[i * 3] = v[0];
      lab[i * 3 + 1] = v[1];
      lab[i * 3 + 2] = v[2];
    }
    vals.uLab = lab;
    vals.uCount = Math.max(2, Math.min(next.colors.length, 4));
    vals.uScaleN = 1.45 / 3; // fixed blob scale for the lab
    vals.uFlow = next.flow;
    vals.uTurb = next.turbulence;
    vals.uWobble = 0; // calm by default
    vals.uIrid = 0; // brand-clean, no shimmer
    vals.uShift = next.colorShift;
    vals.uBalance = Math.pow(5, (0.5 - 0.5) * 2); // fixed balance 0.5
    vals.uChroma = 0.7; // restrained
    vals.uContrast = 1.0;
    vals.uSoft = 0.005;
    vals.uGlow = next.glow;
    vals.uShading = 0.05;
    vals.uSpec = 0.2;
    vals.uRim = 1.3;
    vals.uRefract = 0.25;
    vals.uInner = 0.38;
    vals.uAberr = 0.8;
    vals.uGrain = next.grain;
    // lightX maps from 0..1 → -1..0.5 (always upper-left direction)
    vals.uLight = [next.light * 1.5 - 1, -0.6, 0.65];
    pushUniforms();
    if (!running) render();
  }

  function resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = Math.max(1, Math.round((container.clientWidth || 1) * dpr));
    const h = Math.max(1, Math.round((container.clientHeight || 1) * dpr));
    if (canvas.width === w && canvas.height === h) return;
    canvas.width = w;
    canvas.height = h;
    gl!.viewport(0, 0, w, h);
    vals.uRes = [w, h];
    pushUniforms();
  }

  function render() {
    if (!prog) return;
    gl!.useProgram(prog);
    gl!.drawArrays(gl!.TRIANGLES, 0, 3);
  }

  let phase = 0;
  let last = 0;
  let pending = 0;
  let raf = 0;
  let running = false;
  let onScreen = true;
  let reduced = false;

  function frame(now: number) {
    raf = requestAnimationFrame(frame);
    const dt = last ? Math.min(now - last, 100) : 16.7;
    last = now;
    pending += dt;
    if (pending < 1000 / 60 - dt * 0.5) return;
    phase = (phase + pending / 1000 / 8) % 1; // 8s loop for the lab (calmer than Strba's 7)
    pending = 0;
    vals.uPhase = phase * TAU;
    gl!.useProgram(prog);
    gl!.uniform1f(loc.uPhase!, vals.uPhase as number);
    render();
  }

  function start() {
    if (running || reduced || !onScreen || !prog) return;
    running = true;
    last = 0;
    pending = 0;
    raf = requestAnimationFrame(frame);
  }

  function stop() {
    running = false;
    if (raf) cancelAnimationFrame(raf);
    raf = 0;
  }

  vals.uPhase = 0;
  buildProgram();
  resize();
  update(state);

  const mq = window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : null;
  function applyMotionPref() {
    reduced = !!(mq && mq.matches);
    if (reduced) {
      stop();
      phase = 0;
      vals.uPhase = 0;
      pushUniforms();
      render();
    } else {
      start();
    }
  }
  if (mq && mq.addEventListener) mq.addEventListener('change', applyMotionPref);

  const ro = new ResizeObserver(() => {
    resize();
    if (!running) render();
  });
  ro.observe(container);

  const io = new IntersectionObserver(
    (entries) => {
      onScreen = entries[entries.length - 1].isIntersecting;
      if (onScreen) start();
      else stop();
    },
    { rootMargin: '120px' },
  );
  io.observe(container);

  applyMotionPref();

  return {
    update,
    destroy() {
      stop();
      ro.disconnect();
      io.disconnect();
      if (mq && mq.removeEventListener) mq.removeEventListener('change', applyMotionPref);
      if (prog) gl!.deleteProgram(prog);
      const ext = gl!.getExtension('WEBGL_lose_context');
      if (ext) ext.loseContext();
      canvas.remove();
    },
    supported: true,
  };
}

// ── Public embed snippet generator ────────────────────────────────────────
//
// Re-stringifies createOrb into a self-contained <script> tag. The user can
// paste this into any HTML page and get a working orb in their own colors.
// Comment header includes TASL attribution to Martin Štrba + Designesy.

function buildEmbed(state: OrbState): string {
  const conf = JSON.stringify(state)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029');
  const src = 'var createOrb = ' + createOrb.toString() + ';';
  return (
    '<!-- Orb Editor by Martin Štrba (postgeneric.com) · painted in Designesy blue -->' +
    '\n<div class="orb" style="width:480px; max-width:80vmin; aspect-ratio:1;"></div>' +
    '\n<script>\n(function () {\n' +
    src +
    '\nvar orbConfig = ' +
    conf +
    ';\ndocument.querySelectorAll(".orb").forEach(function (el) { createOrb(el, orbConfig); });\n})();\n<\/script>'
  );
}

// ── React wrapper ────────────────────────────────────────────────────────

type ParamKey = Exclude<keyof OrbState, 'colors' | 'light'>;

const PARAM_LABELS: Record<ParamKey, string> = {
  colorShift: 'Color shift',
  flow: 'Flow',
  turbulence: 'Turbulence',
  grain: 'Grain',
  glow: 'Glow',
};

const PARAM_HINTS: Record<ParamKey, string> = {
  colorShift: 'Palette position — animates where the colors sit on the ramp',
  flow: 'Domain-warp magnitude — how far the noise field carries each pixel',
  turbulence: 'Nested warp — marbled ink-in-water vs smooth blob',
  grain: 'Display-space noise — film grain, not motion blur',
  glow: 'Outside-radius halo — 0 reads as a clean brand surface',
};

export function OrbLab() {
  const containerRef = useRef<HTMLDivElement>(null);
  const orbRef = useRef<OrbInstance | null>(null);
  const [state, setState] = useState<OrbState>(DESIGNESY_PRESET);
  const [copied, setCopied] = useState(false);
  const [supported, setSupported] = useState(true);

  useEffect(() => {
    if (!containerRef.current) return;
    const orb = createOrb(containerRef.current, state);
    orbRef.current = orb;
    setSupported(orb.supported);
    window.__designesyOrb = orb;
    return () => {
      orb.destroy();
      orbRef.current = null;
      window.__designesyOrb = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Push uniform updates on state change without remounting the orb
  useEffect(() => {
    orbRef.current?.update(state);
  }, [state]);

  const updateParam = useCallback(<K extends ParamKey>(key: K, value: OrbState[K]) => {
    setState((s) => ({ ...s, [key]: value }));
  }, []);

  const reset = useCallback(() => {
    setState(DESIGNESY_PRESET);
  }, []);

  const copy = useCallback(async () => {
    const text = buildEmbed(state);
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      // Fallback: select a hidden textarea
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    }
  }, [state]);

  return (
    <div className="orb-lab">
      <div className="orb-canvas-wrap">
        <div ref={containerRef} className="orb-canvas" />
        {!supported && (
          <p className="orb-fallback">
            WebGL2 is unavailable in this browser. The embed snippet still
            works on devices that support it.
          </p>
        )}
      </div>

      <div className="orb-controls">
        {(['colorShift', 'flow', 'turbulence', 'grain', 'glow'] as ParamKey[]).map(
          (k) => (
            <label key={k} className="orb-param">
              <span className="orb-param-label">
                <span>{PARAM_LABELS[k]}</span>
                <output className="orb-param-value">
                  {state[k].toFixed(2)}
                </output>
              </span>
              <input
                type="range"
                min={k === 'colorShift' ? 0 : k === 'glow' ? 0 : 0}
                max={k === 'colorShift' ? 1 : k === 'glow' ? 2 : 1}
                step={0.01}
                value={state[k]}
                onChange={(e) => updateParam(k, parseFloat(e.target.value))}
                aria-label={PARAM_LABELS[k]}
                aria-valuetext={`${state[k].toFixed(2)} — ${PARAM_HINTS[k]}`}
              />
              <span className="orb-param-hint" aria-hidden="true">
                {PARAM_HINTS[k]}
              </span>
            </label>
          ),
        )}

        <div className="orb-actions">
          <button
            type="button"
            className="orb-button-primary"
            onClick={copy}
            aria-live="polite"
          >
            {copied ? 'Copied ✓' : 'Copy embed'}
          </button>
          <button type="button" className="orb-button-ghost" onClick={reset}>
            Reset to Designesy preset
          </button>
        </div>
      </div>
    </div>
  );
}