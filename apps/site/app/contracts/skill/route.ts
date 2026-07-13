import { designSystemContract } from '../../lib/design-system-contract';

export const dynamic = 'force-static';

/**
 * SKILL.md export of the design system contract.
 *
 * Serves a standard SKILL.md file generated from designSystemContract so
 * AI coding agents (Cursor, Claude Code, Codex, v0, Gemini CLI, Lovable)
 * can load Designesy design rules as behavioral instructions — not just
 * reference data. Generated from the same source as the JSON export so
 * both stay synchronized.
 *
 * Format follows the SKILL.md anatomy: frontmatter + Overview / When to
 * Use / Tokens / Rules / Anti-patterns / Verification / Provenance.
 */
export function GET() {
  const c = designSystemContract;

  const body = `---
name: designesy-design-system
version: ${c.version}
description: Design intelligence rules for building interfaces that match the Designesy contract. Use when building UI for Designesy, reviewing against the contract, or proposing design changes that must cite contract tokens.
---

# Designesy Design System — v${c.version}

> ${c.provenance.doctrine}

This is the portable SKILL.md export of the Designesy design system contract.
It encodes the same rules as the [human contract](${c.public_url}) and the
[machine JSON](${c.machine_url}), reformatted as behavioral instructions for
AI coding agents. Updated ${c.updated}.

**Canonical source:** ${c.public_url}
**Machine JSON:** ${c.machine_url}
**License:** https://creativecommons.org/licenses/by/4.0/

## When to Use

- When building or modifying UI for designesy.org or any Designesy surface
- When reviewing an interface against the Designesy contract
- When proposing design changes that must cite contract tokens or name open tensions
- When an agent needs to know which colors, radii, motion timings, or interaction rules Designesy uses

## Tokens

### Colors

| Token | Value | Role |
|---|---|---|
| \`--ink\` | ${c.colors.ink.value} | ${c.colors.ink.role} |
| \`--muted\` | ${c.colors.muted.value} | ${c.colors.muted.role} |
| \`--muted-dim\` | ${c.colors.muted_dim.value} | ${c.colors.muted_dim.role} |
| \`--paper\` | ${c.colors.paper.value} | ${c.colors.paper.role} |
| \`--surface\` | ${c.colors.surface.value} | ${c.colors.surface.role} |
| \`--surface-raised\` | ${c.colors.surface_raised.value} | ${c.colors.surface_raised.role} |
| \`--signal\` | ${c.colors.signal.value} | ${c.colors.signal.role} |
| \`--signal-light\` | ${c.colors.signal_light.value} | ${c.colors.signal_light.role} |
| \`--activation\` | ${c.colors.activation.value} | ${c.colors.activation.role} |

### Surfaces and lines

| Token | Value | Role |
|---|---|---|
| \`--surface-soft\` | ${c.surfaces_and_lines.surface_soft.value} | ${c.surfaces_and_lines.surface_soft.role} |
| \`--surface-hover\` | ${c.surfaces_and_lines.surface_hover.value} | ${c.surfaces_and_lines.surface_hover.role} |
| \`--line\` | ${c.surfaces_and_lines.line.value} | ${c.surfaces_and_lines.line.role} |
| \`--line-strong\` | ${c.surfaces_and_lines.line_strong.value} | ${c.surfaces_and_lines.line_strong.role} |
| \`--line-faint\` | ${c.surfaces_and_lines.line_faint.value} | ${c.surfaces_and_lines.line_faint.role} |
| \`--signal-dim\` | ${c.surfaces_and_lines.signal_dim.value} | ${c.surfaces_and_lines.signal_dim.role} |

### Shadows

| Token | Value |
|---|---|
| \`--shadow-sm\` | ${c.shadows.sm.value} |
| \`--shadow-md\` | ${c.shadows.md.value} |
| \`--shadow-lg\` | ${c.shadows.lg.value} |

### Radius

| Token | Value | Role |
|---|---|---|
| \`--radius\` | ${c.rounded.default.value} | ${c.rounded.default.role} |
| \`--radius-sm\` | ${c.rounded.sm.value} | ${c.rounded.sm.role} |

### Layout

- Max width: ${c.layout.max_width.value} (${c.layout.max_width.role})
- Shell horizontal padding: ${c.layout.shell_horizontal}
- Section vertical rhythm: ${c.layout.section_vertical}
- Card padding: ${c.layout.card_padding}
- Grid gap: ${c.layout.grid_gap}
- Control min height: ${c.layout.control_min_height}
- Breakpoints: grids ${c.layout.breakpoints.grids}, topbar ${c.layout.breakpoints.topbar}, single column ${c.layout.breakpoints.single_column}

### Motion

| Token | Value | Role |
|---|---|---|
| \`--duration\` | ${c.motion.duration.value} | ${c.motion.duration.role} |
| \`--ease\` | ${c.motion.ease.value} | ${c.motion.ease.role} |
| \`--ease-out\` | ${c.motion.ease_out.value} | ${c.motion.ease_out.role} |
| \`--ease-in-out\` | ${c.motion.ease_in_out.value} | ${c.motion.ease_in_out.role} |
| \`--ease-drawer\` | ${c.motion.ease_drawer.value} | ${c.motion.ease_drawer.role} |

### Typography

- Body: ${c.typography.body}
- Headings: ${c.typography.headings}
- Hero wordmark: ${c.typography.hero_wordmark}
- Eyebrows: ${c.typography.eyebrows}
- Lede: ${c.typography.lede}
- Supporting note: ${c.typography.supporting_note}
- Rule: ${c.typography.rule}

## Rules — Interaction (Poise, adopted v${c.interaction.adopted_in})

${c.interaction.rules.map((r) => `- ${r}`).join('\n')}

## Rules — Interface Feel (Takt, adopted v${c.takt.adopted_in})

${c.takt.rules.map((r) => `- ${r}`).join('\n')}

## Rules — Typography (Cadence, adopted v${c.cadence.adopted_in})

${c.cadence.rules.map((r) => `- ${r}`).join('\n')}

## Rules — Motion

${c.motion.rules.map((r) => `- ${r}`).join('\n')}

## Component states

${c.components.map((comp) => `- **${comp.name}**: ${comp.states}`).join('\n')}

## Accessibility

${c.accessibility.map((a) => `- ${a}`).join('\n')}

## Anti-patterns — do not

${c.anti_patterns.map((a) => `- ${a}`).join('\n')}

## Implementation notes

${c.implementation.map((i) => `- ${i}`).join('\n')}

## Verification — evidence requirements

Before shipping, verify:

${c.verification.map((v) => `- ${v}`).join('\n')}

## Open tensions — unresolved

These are known gaps. If you encounter them, name the tension instead of inventing policy:

${c.open_tensions.map((t) => `- ${t}`).join('\n')}

## Semantic roles

- **Surfaces:** ${c.semantic.surface_roles}
- **Lines:** ${c.semantic.line_roles}
- **Accents:** ${c.semantic.accent_roles}
- **Types:** ${c.semantic.type_roles}

## Provenance

- Implementation: ${c.provenance.implementation}
- Token source: ${c.provenance.token_source}
- Interaction audio: ${c.provenance.interaction_audio}
- Motion references: ${c.provenance.motion_references}

### Source labs

- [Lab One · Poise](${c.provenance.first_lab.url}) — ${c.provenance.first_lab.role}
- [Lab Two · Takt](${c.provenance.second_lab.url}) — ${c.provenance.second_lab.role}
- [Lab Three · Cadence](${c.provenance.third_lab.url}) — ${c.provenance.third_lab.role}

### Field checks

${c.interaction.verification.map((v) => `- ${v}`).join('\n')}
${c.takt.verification.map((v) => `- ${v}`).join('\n')}
${c.cadence.verification.map((v) => `- ${v}`).join('\n')}

### External ingests

${c.provenance.external_ingests.map((e) => `- [${e.name}](${e.url}) by ${e.author} — ${e.role}${e.license ? ` (${e.license})` : ''}`).join('\n')}

### Adoption history

${c.adoption_history.map((h) => `- **v${h.version}** (${h.date}): ${h.summary}${h.from_lab ? ` — from Lab ${h.from_lab}` : ''}${h.evidence ? `\n  Evidence: ${h.evidence.join(', ')}` : ''}`).join('\n')}
`;

  return new Response(body, {
    headers: {
      'Content-Type': 'text/markdown; charset=utf-8',
      'Cache-Control': 'public, max-age=3600, s-maxage=3600',
      'Access-Control-Allow-Origin': '*',
      'Content-Disposition':
        'inline; filename="designesy-design-system-v' + c.version + '.skill.md"',
    },
  });
}