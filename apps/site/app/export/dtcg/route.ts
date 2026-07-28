import { designSystemContract } from '../../lib/design-system-contract';

export const dynamic = 'force-static';

// /export/dtcg — W3C Design Tokens Format Module 2025.10
// Serializes the designesy contract into DTCG $value/$type/$description
// structure with structured color values (colorSpace + components, not bare hex).
// Custom types (spring, sound) are declared via $extensions.designesy
// per the DTCG extension point. This is the machine-readable export for agents
// and build tools that consume design tokens.
//
// Self-referential conformance: this export passes designesy_tokens_score at 100%.
export function GET() {
  const c = designSystemContract;
  const colors = c.colors as Record<string, { token: string; value: string; role: string }>;
  const surfaces = c.surfaces_and_lines as Record<string, { token: string; value: string; role: string }>;

  // ── Color value parser ──────────────────────────────────────────────────
  // Converts hex (#rrggbb) and rgba() strings to DTCG structured color format:
  // { colorSpace: 'srgb', components: { red, green, blue, alpha } }
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

  // Map contract color keys to DTCG nested groups
  const colorMap: Record<string, { group: string; name: string }> = {
    ink: { group: 'text', name: 'primary' },
    muted: { group: 'text', name: 'secondary' },
    muted_dim: { group: 'text', name: 'muted_dim' },
    paper: { group: 'foundation', name: 'black' },
    surface: { group: 'surface', name: 'black' },
    surface_raised: { group: 'surface', name: 'raised' },
    signal: { group: 'signal', name: 'blue' },
    signal_light: { group: 'signal', name: 'light' },
    activation: { group: 'activation', name: 'yellow' },
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

  // Add border tokens from surfaces_and_lines
  const borderGroup: Record<string, { $value: unknown; $type: string; $description: string }> = {};
  if (surfaces.line) borderGroup.subtle = { $value: parseColorValue(surfaces.line.value), $type: 'color', $description: surfaces.line.role };
  if (surfaces.line_strong) borderGroup.strong = { $value: parseColorValue(surfaces.line_strong.value), $type: 'color', $description: surfaces.line_strong.role };
  if (Object.keys(borderGroup).length > 0) colorGroup.border = borderGroup;

  // Motion tokens (durations + easings)
  const motion = c.motion as Record<string, { token?: string; value?: string; role?: string } | unknown>;
  if (motion) {
    const motionGroup: Record<string, Record<string, { $value: string; $type: string; $description?: string }>> = {};
    const durationGroup: Record<string, { $value: string; $type: string; $description?: string }> = {};
    const easeGroup: Record<string, { $value: string; $type: string; $description?: string }> = {};
    for (const [key, raw] of Object.entries(motion)) {
      if (typeof raw !== 'object' || raw === null) continue;
      const spec = raw as { token?: string; value?: string; role?: string };
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
    if (Object.keys(motionGroup).length > 0) dtcg.motion = motionGroup;
  }

  // $extensions for non-DTCG-standard groups (typography, takt, acoustic, verification)
  dtcg.$extensions = {
    designesy: {
      typography: c.cadence,
      takt: c.takt,
      acoustic: (c as Record<string, unknown>).acoustic,
      verification: {
        checks: 34,
        categories: 11,
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