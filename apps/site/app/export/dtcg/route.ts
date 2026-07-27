import { designSystemContract } from '../../lib/design-system-contract';

export const dynamic = 'force-static';

// /export/dtcg — W3C Design Tokens Format Module 2025.10
// Serializes the designesy contract into DTCG $value/$type/$description
// structure. Custom types (spring, sound) are declared via $extensions.designesy
// per the DTCG extension point. This is the machine-readable export for agents
// and build tools that consume design tokens.
export function GET() {
  const c = designSystemContract;
  const colors = c.colors as Record<string, { token: string; value: string; role: string }>;
  const surfaces = c.surfaces_and_lines as Record<string, { token: string; value: string; role: string }>;

  const dtcg: Record<string, unknown> = {
    $description: `Designesy design system contract v${c.version} — W3C DTCG 2025.10 format. Custom types (spring, sound) declared via $extensions.designesy.`,
    $version: c.version,
    color: {} as Record<string, unknown>,
  };

  const colorGroup = dtcg.color as Record<string, Record<string, { $value: string; $type: string; $description: string }>>;

  // Map contract color keys to DTCG nested groups
  // Contract: { ink: {value}, paper: {value}, surface: {value}, ... }
  // DTCG:     { color: { text: { primary: {$value, $type} }, surface: { black: {...} } } }
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
      $value: spec.value,
      $type: 'color',
      $description: spec.role,
    };
  }

  // Add border tokens from surfaces_and_lines
  const borderGroup: Record<string, { $value: string; $type: string; $description: string }> = {};
  if (surfaces.line) borderGroup.subtle = { $value: surfaces.line.value, $type: 'color', $description: surfaces.line.role };
  if (surfaces.line_strong) borderGroup.strong = { $value: surfaces.line_strong.value, $type: 'color', $description: surfaces.line_strong.role };
  if (Object.keys(borderGroup).length > 0) colorGroup.border = borderGroup;

  // Motion tokens (durations + easings) — contract has a flat motion object
  // with duration, duration_quick, ease, ease_out, ease_in_out, etc.
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