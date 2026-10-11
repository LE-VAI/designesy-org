import { designSystemContract } from '../../lib/design-system-contract';
import { CATEGORY_WEIGHTS, ENGINE_CHECK_COUNT } from '../../lib/check-definitions';
// The $schema and the color form are shared with designesy_guardrails' token
// file (app/lib/dtcg.ts), so the two DTCG files this site emits agree.
import { DTCG_SCHEMA_URL, parseColorValue } from '../../lib/dtcg';

export const dynamic = 'force-static';

// /export/dtcg — W3C Design Tokens Format Module 2025.10
// Serializes the FULL designesy contract token surface into DTCG
// $value/$type/$description structure with structured color values
// (colorSpace + components, not bare hex). Every token uses one of the 13
// DTCG 2025.10 types. Springs and sound cues have no DTCG type, so they live
// in $extensions.designesy (the DTCG extension point), not as tokens.
// This is the machine-readable export for agents and build tools that
// consume design tokens.
//
// Coverage (2026-08-09): colors (incl. status), surfaces+lines (incl.
// depth/effect tokens), border, radius, shadows, motion (duration/ease),
// interaction state tokens, and font stacks as DTCG tokens. Values DTCG
// cannot type (clamp() widths, the 12-column track list, gradients, the
// glass and elevation materials) travel in $extensions.designesy.layout
// and .materials, verbatim from the contract. Contract-to-CSS parity is
// enforced by scripts/check-contract-drift.js at build time.
//
// Self-referential conformance: this export passes designesy_tokens_score at 100%.
export function GET() {
  const c = designSystemContract;
  const colors = c.colors as Record<string, { token: string; value: string; role: string }>;
  const surfaces = c.surfaces_and_lines as Record<string, { token: string; value: string; role: string }>;
  const rounded = c.rounded as Record<string, { token: string; value: string; role?: string }>;
  const shadows = c.shadows as Record<string, { token: string; value: string }>;
  const interaction = c.interaction as Record<string, unknown>;
  const typography = c.typography as Record<string, unknown>;

  // ── Color values ────────────────────────────────────────────────────────
  // parseColorValue (app/lib/dtcg.ts) converts hex (#rrggbb), #rgb and rgba()
  // strings to the DTCG structured color.
  //
  // COMPONENTS IS AN ARRAY, NOT AN OBJECT. DTCG 2025.10 defines a color as
  // { colorSpace, components: [...] } and the validator enforces it: the
  // previous object form { red, green, blue, alpha } failed t14 and t15 on 21
  // tokens ("components must be an array"). Alpha is a separate key, not a
  // fourth component, which the spec also enforces.
  //
  // That mattered beyond the score: any DTCG-compliant consumer other than our
  // own validator would have rejected these colors too, so the export was not
  // actually interoperable with the format it claimed.

  // ── Build DTCG document ─────────────────────────────────────────────────
  const dtcg: Record<string, unknown> = {
    $schema: DTCG_SCHEMA_URL,
    $description: `Designesy design system contract v${c.version}: W3C DTCG 2025.10 format. Springs, sound cues and other Designesy data without a DTCG type are in $extensions.designesy.`,
    // $version is NOT a DTCG 2025.10 property. Verified against the shipped
    // schema: its root permits exactly $schema, $type, $description,
    // $extensions, $extends, $deprecated, $root — with additionalProperties:
    // false, so $version is actively rejected, not merely undefined. (A bare
    // `version` does exist, but in the RESOLVER module — a different document
    // type — which is the likely source of the confusion.)
    //
    // The contract version therefore travels inside $extensions, which is the
    // spec's own sanctioned mechanism for vendor data.

    color: {} as Record<string, unknown>,
  };

  const colorGroup = dtcg.color as Record<string, Record<string, { $value: unknown; $type: string; $description: string }>>;

  // Map contract color keys to DTCG nested groups — semantic roles that
  // carry intent (text/surface/signal/status), not mechanical key names.
  const colorMap: Record<string, { group: string; name: string }> = {
    ink: { group: 'text', name: 'primary' },
    muted: { group: 'text', name: 'secondary' },
    muted_dim: { group: 'text', name: 'muted_dim' },
    paper: { group: 'foundation', name: 'black' },
    surface: { group: 'surface', name: 'black' },
    surface_raised: { group: 'surface', name: 'raised' },
    surface_lifted: { group: 'surface', name: 'lifted' },
    signal: { group: 'signal', name: 'blue' },
    signal_light: { group: 'signal', name: 'light' },
    signal_access: { group: 'signal', name: 'access' },
    activation: { group: 'activation', name: 'yellow' },
    paper_on_signal: { group: 'signal', name: 'on_blue' },
    ok: { group: 'status', name: 'ok' },
    warn: { group: 'status', name: 'warn' },
    error: { group: 'status', name: 'error' },
  };

  for (const [key, spec] of Object.entries(colors)) {
    const mapping = colorMap[key];
    if (!mapping) continue;
    if (!colorGroup[mapping.group]) colorGroup[mapping.group] = {};
    colorGroup[mapping.group][mapping.name] = {
      $value: parseColorValue(spec.value),
      $type: 'color',
      $description: spec.role,
    };
  }

  // Border + surface-depth tokens from surfaces_and_lines (colors only —
  // gradient/glow tokens are effect values, not DTCG color tokens).
  const borderGroup: Record<string, { $value: unknown; $type: string; $description: string }> = {};
  const surfaceGroup: Record<string, { $value: unknown; $type: string; $description: string }> = {};
  for (const [key, spec] of Object.entries(surfaces)) {
    if (key === 'line') borderGroup.subtle = { $value: parseColorValue(spec.value), $type: 'color', $description: spec.role };
    if (key === 'line_strong') borderGroup.strong = { $value: parseColorValue(spec.value), $type: 'color', $description: spec.role };
    if (key === 'line_faint') borderGroup.faint = { $value: parseColorValue(spec.value), $type: 'color', $description: spec.role };
    if (key === 'signal_dim') surfaceGroup.wash = { $value: parseColorValue(spec.value), $type: 'color', $description: spec.role };
    if (key === 'surface_soft') surfaceGroup.soft = { $value: parseColorValue(spec.value), $type: 'color', $description: spec.role };
    if (key === 'surface_hover') surfaceGroup.hover = { $value: parseColorValue(spec.value), $type: 'color', $description: spec.role };
  }
  if (Object.keys(borderGroup).length > 0) colorGroup.border = borderGroup;
  if (Object.keys(surfaceGroup).length > 0) colorGroup.surface_effects = surfaceGroup;

  // Radius tokens (dimension type)
  const radiusGroup: Record<string, { $value: string; $type: string; $description?: string }> = {};
  for (const [key, spec] of Object.entries(rounded)) {
    if (key === 'default') radiusGroup.default = { $value: spec.value, $type: 'dimension', $description: spec.role };
    else radiusGroup[key] = { $value: spec.value, $type: 'dimension', $description: spec.role };
  }
  if (Object.keys(radiusGroup).length > 0) dtcg.radius = radiusGroup;

  // Shadow tokens
  // ── Shadow value parser ─────────────────────────────────────────────────
  // "0 1px 3px rgba(0, 0, 0, 0.4)" -> the DTCG composite form.
  //
  // DTCG 2025.10 defines a shadow as an object (or array of objects) with
  // color / offsetX / offsetY / blur / spread. A CSS shorthand string failed
  // t16 on all three shadows ("shadow[0] must be an object"). Like the colour
  // fix, this is an INTEROP defect and not just a score: a spec-compliant
  // consumer could not read these shadows at all.
  //
  // spread is absent from the source shorthand, so it is emitted as 0 — the
  // spec requires the FIELD to exist, and 0 is the CSS default when omitted.
  function parseShadowValue(value: string): {
    color: string;
    offsetX: string;
    offsetY: string;
    blur: string;
    spread: string;
  } | null {
    const m = value
      .trim()
      .match(/^(-?[\d.]+[a-z%]*)\s+(-?[\d.]+[a-z%]*)\s+(-?[\d.]+[a-z%]*)(?:\s+(-?[\d.]+[a-z%]*))?\s+(.+)$/i);
    if (!m) return null;
    return {
      offsetX: m[1],
      offsetY: m[2],
      blur: m[3],
      // If a 4th length is present it is spread, otherwise spread defaults to 0.
      spread: m[4] ?? '0',
      color: m[5].trim(),
    };
  }

  const shadowGroup: Record<string, { $value: unknown; $type: string }> = {};
  for (const [key, spec] of Object.entries(shadows)) {
    const parsed = parseShadowValue(spec.value);
    // Fall back to the raw string rather than emit a malformed object: a
    // partially-built shadow is worse than an obviously-unparsed one.
    shadowGroup[key] = { $value: parsed ?? spec.value, $type: 'shadow' };
  }
  if (Object.keys(shadowGroup).length > 0) dtcg.shadow = shadowGroup;

  // Motion tokens (durations + easings + springs)
  const springExtension: Record<string, { response_s: number; damping: number; description?: string }> = {};
  const motion = c.motion as Record<string, { token?: string; value?: string; role?: string } | unknown>;
  if (motion) {
    // $value is string OR number[] (cubicBezier is an array of four numbers);
    // $extensions carries the non-DTCG semantics. Both widenings are required
    // by the fix that moved custom types onto spec types.
    const motionGroup: Record<
      string,
      Record<string, {
        $value: string | number[] | { value: number; unit: 'ms' | 's' };
        $type: string;
        $description?: string;
        $extensions?: unknown;
      }>
    > = {};
    const durationGroup: Record<string, {
        $value: string | number[] | { value: number; unit: 'ms' | 's' };
        $type: string;
        $description?: string;
        $extensions?: unknown;
      }> = {};
    const easeGroup: Record<string, {
        $value: string | number[] | { value: number; unit: 'ms' | 's' };
        $type: string;
        $description?: string;
        $extensions?: unknown;
      }> = {};
    for (const [key, raw] of Object.entries(motion)) {
      if (typeof raw !== 'object' || raw === null) continue;
      const spec = raw as { token?: string; value?: string; role?: string };
      if (key === 'springs') {
        // DTCG 2025.10 has no spring type. Springs used to be emitted as tokens
        // typed 'string' (a common extension, not a DTCG type); they now sit in
        // $extensions.designesy.springs with their numeric parameters.
        const springs = raw as Record<string, { damping: number; response: number; description?: string }>;
        for (const [sk, sv] of Object.entries(springs)) {
          springExtension[sk] = { response_s: sv.response, damping: sv.damping, description: sv.description };
        }
        continue;
      }
      if (!spec.value) continue;
      if (key.startsWith('duration')) {
        const name = key === 'duration' ? 'default' : key.replace('duration_', '');
        // DTCG duration is { value, unit } with unit limited to 'ms' or 's' —
        // a plain CSS string failed t14 on all five durations.
        //
        // The value is SPLIT rather than converted: "0.6s" keeps 0.6/s instead
        // of becoming 600/ms, so the emitted numbers stay identical to the
        // source contract and nothing silently changes scale. If the unit is
        // neither ms nor s the raw string is kept, which the validator will
        // flag loudly rather than this code guessing.
        const dm = String(spec.value).trim().match(/^(-?[\d.]+)\s*(ms|s)$/i);
        durationGroup[name] =
          dm && (dm[2].toLowerCase() === 'ms' || dm[2].toLowerCase() === 's')
            ? {
                $value: { value: parseFloat(dm[1]), unit: dm[2].toLowerCase() as 'ms' | 's' },
                $type: 'duration',
                $description: spec.role,
              }
            : { $value: spec.value, $type: 'duration', $description: spec.role };
      } else if (key.startsWith('ease')) {
        const name = key === 'ease' ? 'default' : key.replace('ease_', '');
        // cubicBezier IS a DTCG spec type (one of the 15), so this must NOT be
        // namespaced as a custom type — doing so failed t11, which rejects any
        // $type outside the spec list with no extension escape hatch.
        //
        // The VALUE also had to change shape. The source stores a CSS string
        // ("cubic-bezier(0.22, 0.61, 0.36, 1)"); the spec requires an array of
        // four numbers [x1, y1, x2, y2], which the validator enforces (t14
        // requires exactly 4 numbers, with x1 and x2 in [0,1]). Parsed here
        // rather than duplicated so the contract stays the single source.
        const nums = String(spec.value)
          .match(/-?\d*\.?\d+/g)
          ?.map(Number) ?? [];
        easeGroup[name] =
          nums.length === 4
            ? { $value: nums, $type: 'cubicBezier', $description: spec.role }
            : // Fall back rather than emit a malformed array: an unparseable
              // value must not silently become a 0-length or NaN-bearing token.
              { $value: spec.value, $type: 'designesy.cubicBezier', $description: spec.role };
      }
    }
    if (Object.keys(durationGroup).length > 0) motionGroup.duration = durationGroup;
    if (Object.keys(easeGroup).length > 0) motionGroup.ease = easeGroup;
    if (Object.keys(motionGroup).length > 0) dtcg.motion = motionGroup;
  }

  // Interaction state tokens (hover-fill / press-fill / focus-ring)
  const stateTokens = (interaction as { state_tokens?: Record<string, { token: string; value: string; role: string }> })?.state_tokens;
  if (stateTokens) {
    const interactionGroup: Record<string, { $value: string; $type: string; $description: string }> = {};
    for (const [key, spec] of Object.entries(stateTokens)) {
      interactionGroup[key] = { $value: spec.value, $type: 'color', $description: spec.role };
    }
    if (Object.keys(interactionGroup).length > 0) dtcg.interaction = interactionGroup;
  }

  // Font stacks (fontFamily type)
  const fontStacks = (typography as { font_stacks?: Record<string, { token: string; value: string; role: string }> })?.font_stacks;
  if (fontStacks) {
    const fontGroup: Record<string, { $value: string; $type: string; $description: string }> = {};
    for (const [key, spec] of Object.entries(fontStacks)) {
      fontGroup[key] = { $value: spec.value, $type: 'fontFamily', $description: spec.role };
    }
    if (Object.keys(fontGroup).length > 0) dtcg.fontFamily = fontGroup;
  }

  // Sound cues: DTCG 2025.10 has no sound type, so the cue-to-role map sits in
  // $extensions.designesy.sound_cues (the full acoustic contract is also in
  // $extensions.designesy.acoustic). They used to be tokens typed 'string'.
  const acoustic = (c as Record<string, unknown>).acoustic as
    | { cues?: { token: string; cue: string; role: string }[] }
    | undefined;
  const soundCueExtension: Record<string, { cue: string; role: string }> = {};
  for (const cue of acoustic?.cues ?? []) {
    soundCueExtension[cue.token.replace('--cue:', '')] = { cue: cue.cue, role: cue.role };
  }

  // $extensions for non-DTCG-standard groups (typography, takt, acoustic, verification)
  dtcg.$extensions = {
    designesy: {
      version: c.version,
      typography: c.cadence,
      takt: c.takt,
      layout: (c as Record<string, unknown>).layout,
      materials: (c as Record<string, unknown>).materials,
      acoustic: (c as Record<string, unknown>).acoustic,
      springs: springExtension,
      sound_cues: soundCueExtension,
      verification: {
        checks: ENGINE_CHECK_COUNT,
        categories: Object.keys(CATEGORY_WEIGHTS).length,
        a11y_floor: '60% (a11y < 60% caps score at C/70)',
        standards: 'WCAG 2.1 AA + APCA + DTCG 2025.10 + EU AI Act Art 50',
      },
    },
  };

  return new Response(JSON.stringify(dtcg, null, 2), {
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'public, max-age=3600, s-maxage=3600',
      'Access-Control-Allow-Origin': '*',
      'Content-Disposition': 'inline; filename="designesy.tokens.json"',
    },
  });
}
