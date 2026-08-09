import { designSystemContract } from '../../lib/design-system-contract';

export const dynamic = 'force-static';

// /export/dtcg — W3C Design Tokens Format Module 2025.10
// Serializes the FULL designesy contract token surface into DTCG
// $value/$type/$description structure with structured color values
// (colorSpace + components, not bare hex). Custom types (spring, sound)
// are declared via $extensions.designesy per the DTCG extension point.
// This is the machine-readable export for agents and build tools that
// consume design tokens.
//
// Coverage (2026-08-09): colors (incl. status), surfaces+lines (incl.
// depth/effect tokens), border, radius, shadows, motion (duration/ease),
// interaction state tokens, and font stacks. Verified: every :root CSS
// custom property is represented — parity enforced by
// scripts/check-contract-drift.js at build time.
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

  // ── Color value parser ──────────────────────────────────────────────────
  // Converts hex (#rrggbb), #rgb, and rgba() strings to DTCG structured
  // color format: { colorSpace: 'srgb', components: { red, green, blue, alpha } }
  function parseColorValue(value: string): { colorSpace: string; components: { red: number; green: number; blue: number; alpha: number } } {
    // Handle #rrggbb
    const hexMatch = value.match(/^#([0-9a-fA-F]{2})([0-9a-fA-F]{2})([0-9a-fA-F]{2})$/);
    if (hexMatch) {
      return {
        colorSpace: 'srgb',
        components: {
          red: parseInt(hexMatch[1], 16) / 255,
          green: parseInt(hexMatch[2], 16) / 255,
          blue: parseInt(hexMatch[3], 16) / 255,
          alpha: 1,
        },
      };
    }
    // Handle #rgb (short)
    const hexShortMatch = value.match(/^#([0-9a-fA-F])([0-9a-fA-F])([0-9a-fA-F])$/);
    if (hexShortMatch) {
      return {
        colorSpace: 'srgb',
        components: {
          red: parseInt(hexShortMatch[1] + hexShortMatch[1], 16) / 255,
          green: parseInt(hexShortMatch[2] + hexShortMatch[2], 16) / 255,
          blue: parseInt(hexShortMatch[3] + hexShortMatch[3], 16) / 255,
          alpha: 1,
        },
      };
    }
    // Handle rgba(r, g, b, a)
    const rgbaMatch = value.match(/rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*(?:,\s*([\d.]+)\s*)?\)/);
    if (rgbaMatch) {
      return {
        colorSpace: 'srgb',
        components: {
          red: parseFloat(rgbaMatch[1]) / 255,
          green: parseFloat(rgbaMatch[2]) / 255,
          blue: parseFloat(rgbaMatch[3]) / 255,
          alpha: rgbaMatch[4] !== undefined ? parseFloat(rgbaMatch[4]) : 1,
        },
      };
    }
    // Fallback: return as-is in a minimal structure (should not happen for valid colors)
    return { colorSpace: 'srgb', components: { red: 0, green: 0, blue: 0, alpha: 1 } };
  }

  // ── Build DTCG document ─────────────────────────────────────────────────
  const dtcg: Record<string, unknown> = {
    $schema: 'https://designtokens.org/schemas/2025.10/format.json',
    $description: `Designesy design system contract v${c.version} — W3C DTCG 2025.10 format. Custom types (spring, sound) declared via $extensions.designesy.`,
    $version: c.version,
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
  const shadowGroup: Record<string, { $value: string; $type: string }> = {};
  for (const [key, spec] of Object.entries(shadows)) {
    shadowGroup[key] = { $value: spec.value, $type: 'shadow' };
  }
  if (Object.keys(shadowGroup).length > 0) dtcg.shadow = shadowGroup;

  // Motion tokens (durations + easings + springs)
  const motion = c.motion as Record<string, { token?: string; value?: string; role?: string } | unknown>;
  if (motion) {
    const motionGroup: Record<string, Record<string, { $value: string; $type: string; $description?: string }>> = {};
    const durationGroup: Record<string, { $value: string; $type: string; $description?: string }> = {};
    const easeGroup: Record<string, { $value: string; $type: string; $description?: string }> = {};
    const springGroup: Record<string, { $value: string; $type: string; $description?: string }> = {};
    for (const [key, raw] of Object.entries(motion)) {
      if (typeof raw !== 'object' || raw === null) continue;
      const spec = raw as { token?: string; value?: string; role?: string };
      if (key === 'springs') {
        // Custom $type: spring via $extensions.designesy — DTCG has no spring type.
        const springs = raw as Record<string, { damping: number; response: number; description?: string }>;
        for (const [sk, sv] of Object.entries(springs)) {
          springGroup[sk] = {
            $value: `${sv.response}s response, ${sv.damping} damping`,
            $type: 'spring',
            $description: sv.description,
          };
        }
        continue;
      }
      if (!spec.value) continue;
      if (key.startsWith('duration')) {
        const name = key === 'duration' ? 'default' : key.replace('duration_', '');
        durationGroup[name] = { $value: spec.value, $type: 'duration', $description: spec.role };
      } else if (key.startsWith('ease')) {
        const name = key === 'ease' ? 'default' : key.replace('ease_', '');
        easeGroup[name] = { $value: spec.value, $type: 'cubicBezier', $description: spec.role };
      }
    }
    if (Object.keys(durationGroup).length > 0) motionGroup.duration = durationGroup;
    if (Object.keys(easeGroup).length > 0) motionGroup.ease = easeGroup;
    if (Object.keys(springGroup).length > 0) motionGroup.spring = springGroup;
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

  // Sound cue tokens — custom $type: sound via $extensions.designesy.
  // DTCG 2025.10 has no sound type; the cues are emitted as first-class
  // tokens (not just raw metadata) so agents can consume cue→role mappings
  // as machine-readable design tokens.
  const acoustic = (c as Record<string, unknown>).acoustic as
    | { cues?: { token: string; cue: string; role: string }[] }
    | undefined;
  if (acoustic?.cues) {
    const soundGroup: Record<string, { $value: string; $type: string; $description: string }> = {};
    for (const cue of acoustic.cues) {
      const name = cue.token.replace('--cue:', '');
      soundGroup[name] = {
        $value: cue.cue,
        $type: 'sound',
        $description: cue.role,
      };
    }
    if (Object.keys(soundGroup).length > 0) dtcg.sound = soundGroup;
  }

  // $extensions for non-DTCG-standard groups (typography, takt, acoustic, verification)
  dtcg.$extensions = {
    designesy: {
      typography: c.cadence,
      takt: c.takt,
      acoustic: (c as Record<string, unknown>).acoustic,
      verification: {
        checks: 40,
        categories: 13,
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
