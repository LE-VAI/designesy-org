import { designSystemContract } from '../../lib/design-system-contract';

export const dynamic = 'force-static';

// /export/designmd — Google Labs DESIGN.md format
// YAML frontmatter + markdown sections. The 8 canonical sections (Overview,
// Tokens, Typography, Motion, Acoustic, Takt, Verification, Provenance) plus
// Designesy-specific extensions. This is the contract-as-code export for
// AI coding assistants (Claude/Cursor/Replit) and AI app platforms
// (Lovable/v0/Bolt) that consume DESIGN.md as prompt context.
export function GET() {
  const c = designSystemContract;
  const colors = c.colors as Record<string, { token: string; value: string; role: string }>;

  const colorRows = Object.entries(colors)
    .map(([key, spec]) => {
      const tokenName = `color.${key.replace(/_/g, '.')}`;
      return `| \`${tokenName}\` | \`${spec.value}\` | ${spec.role} |`;
    })
    .join('\n');

  const md = `---
name: Designesy
version: ${c.version}
description: Organization-first design system contract. Deterministic verification, DTCG-aligned tokens, 34 automated checks.
standards:
  - WCAG 2.1 AA
  - APCA
  - DTCG 2025.10
  - EU AI Act Article 50
---

# Designesy Design System

## Overview

Organization-first design system with deterministic verification. The contract is the scoring basis — 34 automated checks extract live CSS, compare :root tokens, run WCAG/APCA contrast math, and score against 11 weighted categories. No LLM, no vibes.

## Tokens

### Colors

| Token | Value | Role |
|---|---|---|
${colorRows}

## Typography

- **Root font size:** 16px (never lower — iOS Safari auto-zooms inputs below 16px)
- **Heading line-height:** 1.08 (tight, deliberate)
- **Body line-height:** 1.55 (relaxed, confident)
- **Font smoothing:** antialiased + grayscale (prevents subpixel artifacts on dark backgrounds)
- **Font synthesis:** none (prevents browser from synthesizing missing weights)
- **Text wrap:** balance (headings) + pretty (body)
- **Underline position:** from-font (uses font designer's position, not browser default)
- **Skip ink:** auto (underlines skip descenders — g, j, p, q, y)
- **Tabular nums:** required on numeric displays (scores, counts, prices, timestamps)

## Motion

- **Durations:** 150ms (quick), 250ms (fast), 350ms (medium), 400ms (slow), 600ms (default)
- **Easing:** cubic-bezier(0.22, 1, 0.36, 1) primary out; cubic-bezier(0.65, 0, 0.35, 1) in-out
- **Press scale (Takt):** 0.96 cells, 0.985 cards, 0.995 large surfaces — all above 0.95 floor
- **Reduced motion:** prefers-reduced-motion disables all animations and transitions
- **No transition:all:** use named properties to avoid layout-thrash

## Acoustic

- **Sound toggle:** aria-pressed + data-audio attribute on html/body
- **Reduced motion:** prefers-reduced-motion disables entrance loops, parallax, wordmark breath

## Takt

- **Press scale floor:** 0.95 (below reads as a glitch, not a press)
- **Cell press:** 0.96 (buttons, chips, toggles)
- **Card press:** 0.985 (cards, rows)
- **Large surface press:** 0.995 (panels, sheets)
- **Stagger enter:** animation-delay 60-120ms band
- **Soften exits:** transition on transform with ease-out

## Verification

- **Checks:** 34 (v01-v35)
- **Categories:** 11 weighted (cadence 18, accessibility 15, semantic 12, motion 10, tokens 9, takt 8, poise 7, identity 6, interaction 6, performance 6, responsive 3)
- **A11y floor:** 60% (accessibility category below 60% caps overall score at C/70)
- **Standards:** WCAG 2.1 AA + APCA supplementary + DTCG 2025.10 + EU AI Act Art 50
- **v34 AI-Disclosure:** effective 2026-08-02 (EU AI Act Art 50)
- **v35 Forced-colors:** Windows HCM / Chrome forced-colors readiness

## Provenance

Contract v${c.version}. DTCG 2025.10 aligned. EU AI Act Art 50 check (v34) effective 2026-08-02. Forced-colors readiness (v35) per WCAG 2.2 HCM guidance.
`;

  return new Response(md, {
    headers: {
      'Content-Type': 'text/markdown; charset=utf-8',
      'Cache-Control': 'public, max-age=3600, s-maxage=3600',
      'Access-Control-Allow-Origin': '*',
      'Content-Disposition': 'inline; filename="DESIGN.md"',
    },
  });
}