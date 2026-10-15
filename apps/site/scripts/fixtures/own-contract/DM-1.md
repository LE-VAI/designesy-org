---
version: alpha
name: Fixture Full
description: Every DESIGN.md color form, both line-height forms, features, every group.
colors:
  primary: "#1A5CFF"
  on-primary: "#fff"
  ink: "#111418"
  ink-soft: "#111418cc"
  veil: "#0008"
  surface: white
  surface-raised: rgb(244, 246, 250)
  line: rgba(220, 225, 234, 1)
  success: hsl(153 74% 27%)
  warning: hsla(35, 100%, 30%, 1)
  danger: hwb(353 16% 24%)
  accent: oklch(66% 0.18 250)
  accent-soft: oklab(0.9 -0.01 -0.03)
  info: lch(50 60 260)
  info-deep: lab(30 10 -50)
  mixed: "color-mix(in srgb, #1A5CFF 50%, white)"
  focus: "{colors.primary}"
  link: "{colors.accent}"
typography:
  display:
    fontFamily: Manrope, sans-serif
    fontSize: 48px
    fontWeight: 700
    lineHeight: 1.1
  body-md:
    fontFamily: Manrope
    fontSize: 1rem
    fontWeight: 400
    lineHeight: 24px
  label:
    fontFamily: Manrope
    fontSize: 14px
    fontWeight: 600
    lineHeight: 1.3
    letterSpacing: 0.02em
  code:
    fontFamily: IBM Plex Mono, monospace
    fontSize: 15px
    lineHeight: 1.5
    fontFeature: "'tnum' 1, 'zero'"
rounded:
  sm: 4px
  md: 8px
  lg: 16px
  full: 9999px
spacing:
  xs: 4px
  sm: 8px
  md: 16px
  lg: 24px
  xl: 2rem
  ratio: 4
components:
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.on-primary}"
    rounded: "{rounded.md}"
    padding: 12px
    height: 44px
  card:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: 6px
  hero:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.surface}"
    typography: "{typography.display}"
  checkbox:
    size: 20px
---

## Overview

A fixture with every group.

## Colors

Prose about the palette.
