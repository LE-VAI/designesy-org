---
version: alpha
name: Acme Design System
description: Product UI for the Acme web surfaces.
colors:
  primary: "#1A5CFF"
  on-primary: "#FFFFFF"
  ink: "#111418"
  ink-muted: "#4A5160"
  surface: "#FFFFFF"
  surface-raised: "#F4F6FA"
  line: "#DCE1EA"
  success: "#127A4B"
  warning: "#9A5B00"
  danger: "#C2283A"
  focus: "{colors.primary}"
  link: "{colors.primary}"
  border-strong: "{colors.ink-muted}"
  surface-inverse: "{colors.ink}"
  on-surface: "{colors.ink}"
  on-danger: "{colors.on-primary}"
typography:
  display-lg:
    fontFamily: Manrope
    fontSize: 56px
    fontWeight: 700
    lineHeight: 1.05
  display-md:
    fontFamily: Manrope
    fontSize: 44px
    fontWeight: 700
    lineHeight: 1.1
  headline:
    fontFamily: Manrope
    fontSize: 32px
    fontWeight: 700
    lineHeight: 1.15
  title:
    fontFamily: Manrope
    fontSize: 24px
    fontWeight: 600
    lineHeight: 1.25
  body-lg:
    fontFamily: Manrope
    fontSize: 18px
    fontWeight: 400
    lineHeight: 1.6
  body-md:
    fontFamily: Manrope
    fontSize: 16px
    fontWeight: 400
    lineHeight: 1.6
  body-sm:
    fontFamily: Manrope
    fontSize: 14px
    fontWeight: 400
    lineHeight: 1.5
  label:
    fontFamily: Manrope
    fontSize: 13px
    fontWeight: 600
    lineHeight: 1.3
    letterSpacing: 0.02em
  caption:
    fontFamily: Manrope
    fontSize: 12px
    fontWeight: 500
    lineHeight: 1.4
  code:
    fontFamily: IBM Plex Mono
    fontSize: 15px
    fontWeight: 400
    lineHeight: 1.5
rounded:
  xs: 2px
  sm: 4px
  md: 8px
  lg: 12px
  xl: 20px
  full: 9999px
spacing:
  2xs: 2px
  xs: 4px
  sm: 8px
  md: 12px
  base: 16px
  lg: 20px
  xl: 24px
  2xl: 32px
  3xl: 40px
  4xl: 48px
  5xl: 64px
  6xl: 96px
components:
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.on-primary}"
    rounded: "{rounded.md}"
    padding: 12px
    height: 44px
  button-secondary:
    backgroundColor: "{colors.surface-raised}"
    textColor: "{colors.ink}"
    rounded: "{rounded.md}"
    height: 44px
  input:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.sm}"
    height: 44px
  badge-success:
    backgroundColor: "{colors.success}"
    textColor: "{colors.on-primary}"
    rounded: "{rounded.full}"
  chip:
    height: 32px
  tab:
    height: 40px
  checkbox:
    size: 20px
---

## Overview

Acme's product UI: calm surfaces, one blue for action, type set in Manrope.

## Colors

`primary` is the only action color. Status colors appear with a word, never alone.

## Typography

Manrope for every role except code, which uses IBM Plex Mono.

## Layout

Spacing follows the scale above. Radii stay on the `rounded` scale.

## Components

`button-primary` is the one filled button per view.
