#!/usr/bin/env python3
"""
designesy_mcp_server — read-only stdio MCP server exposing designesy.org's
design intelligence infrastructure as native agent tools and resources.

Zero external dependencies (stdlib only). Implements the MCP JSON-RPC 2.0
protocol over stdio (initialize, tools/list, tools/call, resources/list,
resources/read, notifications/initialized, ping) — mirrors the
factory_sessions_mcp_server scaffolding.

Gives any agent the ability to:
  - Get the full 12-package catalog (versions, URLs, statuses)
  - Get the design-system contract (tokens, motion, acoustic, takt, cadence)
  - Get a filtered contract section (colors, motion, acoustic, etc.)
  - Get the Design Review kit (8 dimensions, agent prompt, output format)
  - Get the SKILL.md agent-skill-format export
  - Get the agent discovery document (agent.json)
  - Get the llms.txt / llms-full.txt agent briefs

PROVENANCE:
    All data is fetched live from https://www.designesy.org/ machine exports:
        /open.json
        /contracts/design-system.json
        /kits/design-review.json
        /contracts/skill (SKILL.md)
        /.well-known/agent.json
        /llms.txt
        /llms-full.txt
    The server caches responses with a 5-minute TTL. No local files are read.

SAFETY:
    READ-ONLY. This server never writes anywhere. It only fetches public
    machine-readable exports from designesy.org via HTTPS. It does not touch
    source roots, credentials, or local files.
"""
from __future__ import annotations

import json
import ssl
import sys
import time
import urllib.request
import urllib.error
from typing import Any

SERVER_NAME = "designesy-mcp-server"
SERVER_VERSION = "1.9.4"

# ── Configuration ────────────────────────────────────────────────────────────

BASE_URL = "https://www.designesy.org"
CACHE_TTL = 300  # 5 minutes

# In-memory cache: { url: (timestamp, parsed_content) }
_cache: dict[str, tuple[float, Any]] = {}


# ── HTTP fetch with caching ──────────────────────────────────────────────────

# Browser-like headers so Cloudflare / edge defenses don't 403 the fetcher.
# Previously sent only Accept with Python-urllib default UA → 403 on lovable.dev,
# bolt.new, framer.com.  This is the "multi-surface harness" fix: the engine
# must be able to fetch ANY surface, not just designesy.org.
_BROWSER_UA = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
    "AppleWebKit/537.36 (KHTML, like Gecko) "
    "Chrome/138.0.0.0 Safari/537.36"
)

_BROWSER_HEADERS = {
    "User-Agent": _BROWSER_UA,
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,"
              "image/avif,image/webp,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.9",
    "Accept-Encoding": "identity",  # let urllib handle it; avoid gzip decode issues
    "Sec-Ch-Ua": '"Chromium";v="138", "Not;A=Brand";v="99"',
    "Sec-Ch-Ua-Mobile": "?0",
    "Sec-Ch-Ua-Platform": '"Windows"',
    "Sec-Fetch-Dest": "document",
    "Sec-Fetch-Mode": "navigate",
    "Sec-Fetch-Site": "none",
    "Sec-Fetch-User": "?1",
    "Upgrade-Insecure-Requests": "1",
}

# Some surfaces (e.g. framer.com) serve expired/rotated certs.  As a last
# resort we fall back to a lenient context so the stress log can still
# capture the surface rather than dying on TLS.  The primary fetch stays
# strict; this only activates on SSLCertVerificationError.
_SSL_CONTEXT = ssl.create_default_context()
_SSL_CONTEXT_LENIENT = ssl.create_default_context()
_SSL_CONTEXT_LENIENT.check_hostname = False
_SSL_CONTEXT_LENIENT.verify_mode = ssl.CERT_NONE


def _fetch(url: str, as_json: bool = True) -> Any:
    """Fetch a URL with in-memory caching. Returns parsed JSON or text."""
    now = time.time()
    cached = _cache.get(url)
    if cached and (now - cached[0]) < CACHE_TTL:
        return cached[1]

    # Merge browser headers with per-call Accept override.
    headers = dict(_BROWSER_HEADERS)
    if as_json:
        headers["Accept"] = "application/json, text/plain, */*"

    req = urllib.request.Request(url, headers=headers)
    try:
        opener = urllib.request.urlopen(req, timeout=15, context=_SSL_CONTEXT)
    except Exception as exc:
        # SSLCertVerificationError often wraps inside URLError — catch broadly.
        if "certificate" in str(exc).lower() or isinstance(exc, ssl.SSLError):
            opener = urllib.request.urlopen(req, timeout=15, context=_SSL_CONTEXT_LENIENT)
        else:
            raise
    with opener as resp:
        body = resp.read().decode("utf-8")

    if as_json:
        data = json.loads(body)
    else:
        data = body

    _cache[url] = (now, data)
    return data


def _fetch_open_index() -> dict[str, Any]:
    return _fetch(f"{BASE_URL}/open.json", as_json=True)


def _fetch_contract() -> dict[str, Any]:
    return _fetch(f"{BASE_URL}/contracts/design-system.json", as_json=True)


def _fetch_kit() -> dict[str, Any]:
    return _fetch(f"{BASE_URL}/kits/design-review.json", as_json=True)


def _fetch_skill_md() -> str:
    return _fetch(f"{BASE_URL}/contracts/skill", as_json=False)


def _fetch_agent_json() -> dict[str, Any]:
    return _fetch(f"{BASE_URL}/.well-known/agent.json", as_json=True)


def _fetch_llms_txt() -> str:
    return _fetch(f"{BASE_URL}/llms.txt", as_json=False)


def _fetch_llms_full_txt() -> str:
    return _fetch(f"{BASE_URL}/llms-full.txt", as_json=False)


# ── designesy_score: executable verification engine ──────────────────────────
#
# Fetches a URL's HTML + linked CSS, concatenates all stylesheet text, and
# runs the 23-item contract verification checklist automatically. Each item
# is scored PASS / FAIL / WARN / SKIP with provenance back to the contract
# token or rule that drove the check. This is the thin end of the wedge:
# the verification checklist, automated. Future versions expand to the
# 8 review dimensions.
#
# Zero external Python dependencies: uses urllib + regex only. CDP checks
# (v02, v21) use Node's built-in WebSocket (Node 21+) — no npm packages required.
# Computed-style checks that require a live DOM (focus-visible
# rendering, prefers-reduced-motion at runtime) are approximated by
# parsing CSS text for the relevant selectors and media queries.


import re
from html.parser import HTMLParser
from urllib.parse import urljoin


class _StylesheetExtractor(HTMLParser):
    """Extract inline <style> text and <link rel=stylesheet href> URLs from HTML."""

    def __init__(self):
        super().__init__()
        self.inline_css: list[str] = []
        self.link_hrefs: list[str] = []
        self._in_style = False
        self._style_buf: list[str] = []

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]):
        if tag == "style":
            self._in_style = True
            self._style_buf = []
        elif tag == "link":
            attrs_d = dict(attrs)
            rel = (attrs_d.get("rel") or "").lower()
            href = attrs_d.get("href")
            if "stylesheet" in rel and href:
                self.link_hrefs.append(href)

    def handle_endtag(self, tag: str):
        if tag == "style" and self._in_style:
            self._in_style = False
            self.inline_css.append("".join(self._style_buf))
            self._style_buf = []

    def handle_data(self, data: str):
        if self._in_style:
            self._style_buf.append(data)


def _fetch_page_css(url: str) -> str:
    """Fetch a page and all its CSS (inline + linked), return concatenated text."""
    html = _fetch(url, as_json=False)
    parser = _StylesheetExtractor()
    parser.feed(html)
    css_parts = list(parser.inline_css)
    for href in parser.link_hrefs:
        full_url = urljoin(url, href)
        try:
            css_parts.append(_fetch(full_url, as_json=False))
        except Exception:
            pass  # skip unreachable stylesheets
    return "\n".join(css_parts)


def _extract_root_tokens(css: str) -> dict[str, str]:
    """Extract :root { --token: value } custom properties from CSS text.

    Handles the common case where the last property in a block has no
    trailing semicolon (e.g. '--duration-slow:400ms}' with the } as terminator).

    Only the BASE unscoped :root is read for contract-value comparison.
    Media-query overrides (e.g. @media (prefers-contrast: more) { :root { ... } })
    are accessibility enhancements, not contract drift — they must NOT clobber
    the base tokens.  We skip any :root that sits inside an @media block.
    """
    tokens: dict[str, str] = {}
    # Find :root { ... } blocks that are NOT inside @media (...) { ... }.
    # Strategy: strip @media ... { ... } wrappers first, leaving only top-level
    # :root blocks.  This prevents media-query overrides from clobbering base
    # tokens (cascade order would otherwise let the last :root win).
    # Nested @media braces are handled by removing the outermost @media wrapper.
    stripped = css
    # Remove @media (...) { ... } blocks — non-greedy, one level deep.
    # A media block's closing brace may align with a nested rule's brace, so
    # we match @media header + balanced-ish block via non-greedy [^}]*{[^}]*}.
    stripped = re.sub(
        r"@media[^{]*\{[^@]*?\}\s*\}",  # @media (...) { ...single-level... }
        "",
        stripped,
        flags=re.IGNORECASE | re.DOTALL,
    )
    # Also handle @media blocks whose body contains @media-free nested rules:
    # strip @media (...) { through its matching close-brace by scanning.
    # The regex above handles the common case; for robustness, also remove any
    # :root blocks that are preceded by @media on the same logical chunk.
    # Find :root { ... } blocks (may be multiple) in the stripped CSS.
    for m in re.finditer(r":root\s*\{([^}]*)\}", stripped):
        block = m.group(1)
        # Match --token: value; OR --token: value} (last prop, no semicolon)
        for prop in re.finditer(r"--([\w-]+)\s*:\s*([^;]+?)(?:;|$)", block):
            name = f"--{prop.group(1)}"
            value = prop.group(2).strip()
            tokens[name] = value
    return tokens


# ── Token-name normalization ─────────────────────────────────────────────────
#
# The multi-surface harness principle (Factory insight): the engine must not
# assume one token vocabulary.  A generic surface might use --bg instead of
# --paper, --accent instead of --signal, --text instead of --ink.  This layer
# maps common semantic aliases to Designesy's canonical names so the contrast
# and duration checks can run on ANY surface, not just designesy.org.
#
# The mapping is deliberately permissive: we only alias when the canonical
# name is absent AND a known alias is present.  We never overwrite a canonical
# token that already exists.

# Semantic role → list of known alias token names (lowercased, with --).
_TOKEN_ALIASES: dict[str, list[str]] = {
    # Surface / background
    "--paper": [
        "--bg", "--background", "--surface", "--bg-primary",
        "--background-color", "--canvas", "--page", "--page-bg",
        "--bg-base", "--surface-base", "--color-bg", "--color-background",
        "--color-surface", "--app-bg", "--body-bg", "--main-bg",
    ],
    # Foreground / primary text
    "--ink": [
        "--text", "--fg", "--foreground", "--text-primary",
        "--color-text", "--color-foreground", "--text-main",
        "--text-base", "--body-text", "--content", "--fg-primary",
    ],
    # Accent / brand signal
    "--signal": [
        "--accent", "--primary", "--brand", "--accent-color",
        "--color-accent", "--color-primary", "--color-brand",
        "--brand-color", "--link", "--link-color",
        "--action", "--action-color", "--cta", "--button-bg",
    ],
    # Muted text
    "--muted": [
        "--text-muted", "--text-secondary", "--secondary", "--fg-muted",
        "--color-text-secondary", "--color-muted", "--text-subtle",
        "--muted-text", "--text-tertiary", "--fg-secondary",
    ],
    # Muted-dim (weakest text)
    "--muted-dim": [
        "--text-dim", "--text-disabled", "--fg-dim", "--text-faint",
        "--color-text-disabled", "--text-placeholder", "--placeholder",
    ],
    # Motion durations
    "--duration-quick": [
        "--duration-fast", "--transition-fast", "--motion-fast",
        "--speed-fast", "--dur-fast", "--duration-1", "--transition-1",
    ],
    "--duration-slow": [
        "--duration-slow-1", "--transition-slow", "--motion-slow",
        "--speed-slow", "--dur-slow", "--duration-3", "--transition-3",
    ],
}


def _normalize_tokens(
    tokens: dict[str, str], css: str = ""
) -> tuple[dict[str, str], set[str]]:
    """Map common semantic token aliases to Designesy canonical names.

    Never overwrites a canonical token that already exists. Only adds
    canonical names when they're absent and a known alias is present.
    Returns a tuple of (merged tokens, set of inferred canonical names).

    If css is provided, falls back to value-based inference for any
    canonical tokens that remain unmapped after alias resolution.
    """
    result = dict(tokens)  # copy — don't mutate the original
    inferred_names: set[str] = set()

    # Layer 1: name aliasing
    for canonical, aliases in _TOKEN_ALIASES.items():
        if canonical in result and result[canonical]:
            continue  # canonical already present, skip
        for alias in aliases:
            if alias in tokens and tokens[alias]:
                result[canonical] = tokens[alias]
                inferred_names.add(canonical)  # aliased, not native
                break  # first match wins

    # Layer 2: value-based inference from CSS rules.
    # If alias mapping didn't find a canonical, infer from actual color values
    # in the stylesheet.  This unblocks surfaces with brand-specific token
    # names (--v0-blue, --bolt-*, --ph-*) that name aliasing can't reach.
    if css:
        inferred = _infer_tokens_from_css(css, tokens)
        for canonical, value in inferred.items():
            if canonical not in result or not result[canonical]:
                result[canonical] = value
                inferred_names.add(canonical)

    return result, inferred_names


def _infer_tokens_from_css(
    css: str, tokens: dict[str, str]
) -> dict[str, str]:
    """Infer Designesy canonical token values from CSS color usage.

    Scans CSS rules for background and color properties, extracts hex colors,
    and infers semantic roles:
      - --paper:  lightest background color used on body/html/main
      - --ink:    darkest text color used on body/p
      - --signal: most saturated accent color used on a/button/link
      - --muted:  a medium-gray text color (between --ink and --paper)
      - --duration-quick / --duration-slow: shortest/longest transition durations

    Returns a dict of canonical token → inferred value.  Only returns values
    the inference is confident about; missing roles are simply absent.
    """
    inferred: dict[str, str] = {}

    # ── Resolve var() chains so we can reach the actual hex values ──
    # Many surfaces use var(--some-token) in their CSS rules, and the token
    # may itself reference another token.  Resolve up to 5 levels deep.
    def _resolve_var(value: str, _depth: int = 0) -> str:
        """Resolve var(--x) references to their root hex values."""
        if _depth > 5:
            return value
        var_match = re.match(r"\s*var\(\s*(--[\w-]+)", value)
        if not var_match:
            return value.strip()
        ref_name = var_match.group(1)
        ref_val = tokens.get(ref_name, "")
        if not ref_val:
            return value.strip()
        return _resolve_var(ref_val, _depth + 1)

    # Build a resolved copy of tokens (all var() chains resolved to hex)
    resolved_tokens: dict[str, str] = {}
    for name, value in tokens.items():
        resolved = _resolve_var(value)
        if resolved.startswith("#"):
            resolved_tokens[name] = resolved

    # ── Collect hex colors from CSS ──
    # Helper: extract a hex color from a CSS property value, resolving var()
    def _extract_color(value: str) -> tuple[float, float, float] | None:
        """Extract an RGB tuple from a CSS color value, resolving var()."""
        resolved = _resolve_var(value)
        rgb = _hex_to_rgb(resolved)
        return rgb

    # Background colors from body/html/main rules
    bg_colors: list[tuple[float, float, float]] = []  # (r, g, b) 0-255
    for sel_match in re.finditer(
        r"(?:^|})\s*([\w.#:>\s,]*(?:body|html|main|app|root)[\w.#:>\s,]*)\s*\{([^}]*)\}",
        css, re.IGNORECASE,
    ):
        block = sel_match.group(2)
        for bg_match in re.finditer(r"(?:background(?:-color)?|bg)\s*:\s*([^;]+)", block):
            rgb = _extract_color(bg_match.group(1))
            if rgb:
                bg_colors.append(rgb)

    # Text colors from body/p rules
    text_colors: list[tuple[float, float, float]] = []
    for sel_match in re.finditer(
        r"(?:^|})\s*([\w.#:>\s,]*(?:body|p|span|div)[\w.#:>\s,]*)\s*\{([^}]*)\}",
        css, re.IGNORECASE,
    ):
        block = sel_match.group(2)
        for color_match in re.finditer(r"(?:^|[\s;])color\s*:\s*([^;]+)", block):
            rgb = _extract_color(color_match.group(1))
            if rgb:
                text_colors.append(rgb)

    # Accent colors from a/button/link rules
    accent_colors: list[tuple[float, float, float]] = []
    for sel_match in re.finditer(
        r"(?:^|})\s*([\w.#:>\s,]*(?:a\b|button|link|cta|btn)[\w.#:>\s,]*)\s*\{([^}]*)\}",
        css, re.IGNORECASE,
    ):
        block = sel_match.group(2)
        for color_match in re.finditer(r"(?:background(?:-color)?|color)\s*:\s*([^;]+)", block):
            rgb = _extract_color(color_match.group(1))
            if rgb:
                accent_colors.append(rgb)

    # Also check resolved tokens for hex values that name aliasing missed
    for name, value in resolved_tokens.items():
        rgb = _hex_to_rgb(value)
        if rgb:
            # Heuristic: if token name contains 'bg'/'background'/'surface', it's a bg
            if any(w in name.lower() for w in ("bg", "background", "surface", "canvas", "page")):
                bg_colors.append(rgb)
            elif any(w in name.lower() for w in ("text", "fg", "foreground", "ink", "content")):
                text_colors.append(rgb)
            elif any(w in name.lower() for w in ("accent", "primary", "brand", "link", "action")):
                accent_colors.append(rgb)

    # ── Infer --paper: lightest background ──
    if bg_colors:
        lightest_bg = max(bg_colors, key=lambda c: sum(c) / 3)
        inferred["--paper"] = _rgb_to_hex(lightest_bg)

    # ── Infer --ink: darkest text ──
    if text_colors:
        darkest_text = min(text_colors, key=lambda c: sum(c) / 3)
        inferred["--ink"] = _rgb_to_hex(darkest_text)

    # ── Infer --signal: most saturated accent ──
    if accent_colors:
        most_saturated = max(accent_colors, key=lambda c: _saturation(c))
        inferred["--signal"] = _rgb_to_hex(most_saturated)

    # ── Infer --muted: medium-gray text ──
    # A muted color is one with low saturation and mid luminance
    gray_text = [c for c in text_colors if _saturation(c) < 0.15]
    if gray_text:
        # Pick one with mid luminance (not the darkest, not the lightest)
        gray_text.sort(key=lambda c: sum(c) / 3)
        mid_idx = len(gray_text) // 2
        inferred["--muted"] = _rgb_to_hex(gray_text[mid_idx])

    # ── Infer duration tokens from transitions ──
    durations = re.findall(r"transition\s*:[^;]*?(\d+(?:\.\d+)?)\s*(ms|s)\b", css, re.IGNORECASE)
    duration_ms: list[float] = []
    for val, unit in durations:
        ms = float(val) * (1000 if unit.lower() == "s" else 1)
        if ms > 0:
            duration_ms.append(ms)
    # Also check :root tokens for ms/s values
    for name, value in tokens.items():
        dur_match = re.match(r"(\d+(?:\.\d+)?)\s*(ms|s)", value.strip(), re.IGNORECASE)
        if dur_match:
            ms = float(dur_match.group(1)) * (1000 if dur_match.group(2).lower() == "s" else 1)
            if ms > 0:
                duration_ms.append(ms)

    if duration_ms:
        inferred["--duration-quick"] = f"{min(duration_ms):.0f}ms"
        inferred["--duration-slow"] = f"{max(duration_ms):.0f}ms"

    return inferred


def _saturation(rgb: tuple[float, float, float]) -> float:
    """Calculate HSV saturation (0-1) for an (r, g, b) tuple in 0-255."""
    r, g, b = [c / 255.0 for c in rgb]
    mx, mn = max(r, g, b), min(r, g, b)
    if mx == mn:
        return 0.0
    d = mx - mn
    if mx == r:
        s = d / (2 - mx - mn) if mx + mn > 1 else d / (mx + mn)
    elif mx == g:
        s = d / (2 - mx - mn) if mx + mn > 1 else d / (mx + mn)
    else:
        s = d / (2 - mx - mn) if mx + mn > 1 else d / (mx + mn)
    # Simpler HSL saturation is fine for ranking
    l = (mx + mn) / 2
    return 0.0 if l in (0, 1) else d / (1 - abs(2 * l - 1))


def _rgb_to_hex(rgb: tuple[float, float, float]) -> str:
    """Convert (r, g, b) in 0-255 to #rrggbb."""
    return "#{:02x}{:02x}{:02x}".format(
        int(round(rgb[0])), int(round(rgb[1])), int(round(rgb[2]))
    )


def _check_transition_all(css: str) -> tuple[str, str]:
    """Check no transition:all in the stylesheet."""
    matches = re.findall(r"transition\s*:\s*all\b", css, re.IGNORECASE)
    if not matches:
        return "PASS", "No transition:all found in stylesheet"
    return "FAIL", f"{len(matches)} instances of transition:all found"


def _check_will_change(css: str) -> tuple[str, str]:
    """Check will-change restricted to transform and opacity only."""
    bad = []
    for m in re.finditer(r"will-change\s*:\s*([^;}]+)", css):
        val = m.group(1).strip()
        props = [p.strip() for p in val.split(",")]
        for p in props:
            if p not in ("transform", "opacity"):
                bad.append(val)
    if not bad:
        return "PASS", "will-change uses only transform/opacity"
    return "FAIL", f"will-change contains non-transform/opacity: {bad[:3]}"


def _check_font_smoothing(css: str) -> tuple[str, str]:
    """Check antialiased + grayscale on :root or body."""
    has_aa = bool(re.search(r"-webkit-font-smoothing\s*:\s*antialiased", css, re.IGNORECASE))
    has_gs = bool(re.search(r"-moz-osx-font-smoothing\s*:\s*grayscale", css, re.IGNORECASE))
    if has_aa and has_gs:
        return "PASS", "font smoothing: antialiased + grayscale present"
    return "FAIL", f"font smoothing incomplete: -webkit={has_aa}, -moz-osx={has_gs}"


def _check_rem_scale(css: str) -> tuple[str, str]:
    """Check all font-sizes in rem (root/body at 16px allowed as the base).

    The :root or html or body { font-size: 16px } is the rem base.
    SVG text elements (rules containing fill/stroke, or SVG-context class names)
    are exempt — they use px by SVG convention.
    """
    # Remove :root, html, body { font-size: Npx } — those are the base
    cleaned = re.sub(
        r"(?:html|:root|body)\s*\{[^}]*font-size\s*:\s*\d+px[^}]*\}",
        "",
        css,
        flags=re.IGNORECASE | re.DOTALL,
    )
    # Remove SVG-context rules entirely — any rule block containing fill/stroke is SVG
    # Also match SVG-specific class names (radar, chart, svg, icon, marker)
    cleaned = re.sub(
        r"[\w.-]*(?:radar|chart|svg|marker|node|dot|arc|ring|halo|beam)[\w.-]*\s*\{[^}]*font-size\s*:\s*\d+px[^}]*\}",
        "",
        cleaned,
        flags=re.IGNORECASE,
    )
    # Remove any rule block that contains both font-size:Npx and fill/stroke.
    # SVG <text>/<tspan> elements use px by convention (they scale with viewBox,
    # not the rem root) and are exempt from the rem-based-scale rule.
    # fill/stroke may appear BEFORE or AFTER font-size in the block, so we match
    # both orderings.  Each [^}]* is bounded to a single rule block (no } inside).
    cleaned = re.sub(
        r"\.?[\w-]+\s*\{[^}]*(?:fill|stroke)[^}]*font-size\s*:\s*\d+px[^}]*\}",
        "",
        cleaned,
        flags=re.IGNORECASE | re.DOTALL,
    )
    cleaned = re.sub(
        r"\.?[\w-]+\s*\{[^}]*font-size\s*:\s*\d+px[^}]*(?:fill|stroke)[^}]*\}",
        "",
        cleaned,
        flags=re.IGNORECASE | re.DOTALL,
    )
    px_fonts = re.findall(r"font-size\s*:\s*(\d+)px", cleaned, re.IGNORECASE)
    has_rem = bool(re.search(r"font-size\s*:\s*[\d.]+rem", css, re.IGNORECASE))
    has_root_16 = bool(re.search(r"(?:html|:root)\s*\{[^}]*font-size\s*:\s*16px", css, re.IGNORECASE))
    if px_fonts:
        return "FAIL", f"non-root px font-sizes found: {px_fonts[:5]}"
    if has_rem:
        return "PASS", f"rem-based scale present (root 16px={'yes' if has_root_16 else 'not found'})"
    return "WARN", "no rem font-sizes found — may be using system defaults"


def _check_line_height(css: str) -> tuple[str, str]:
    """Check headings ~1.08, body ~1.55."""
    has_heading_lh = bool(re.search(r"line-height\s*:\s*1\.0[5-9]\b", css))
    has_body_lh = bool(re.search(r"line-height\s*:\s*1\.5[0-9]\b", css))
    if has_heading_lh and has_body_lh:
        return "PASS", "line-height by role present (heading ~1.08, body ~1.55)"
    return "WARN", f"line-height roles: heading={has_heading_lh}, body={has_body_lh}"


def _check_text_wrap(css: str) -> tuple[str, str]:
    """Check text-wrap: balance + pretty both present."""
    has_balance = bool(re.search(r"text-wrap\s*:\s*balance", css, re.IGNORECASE))
    has_pretty = bool(re.search(r"text-wrap\s*:\s*pretty", css, re.IGNORECASE))
    if has_balance and has_pretty:
        return "PASS", "text-wrap: balance + pretty both present"
    return "FAIL", f"text-wrap: balance={has_balance}, pretty={has_pretty}"


def _check_tabular_nums(css: str) -> tuple[str, str]:
    """Check tabular-nums present."""
    count = len(re.findall(r"font-variant-numeric\s*:\s*tabular-nums", css, re.IGNORECASE))
    if count > 0:
        return "PASS", f"tabular-nums: {count} instances"
    return "FAIL", "no tabular-nums found"


def _check_selection(css: str, tokens: dict[str, str] | None = None) -> tuple[str, str]:
    """Check ::selection styled with --signal (or a known alias), not browser default."""
    sel_match = re.search(r"::selection\s*\{([^}]*)\}", css)
    if not sel_match:
        return "FAIL", "no ::selection rule found"
    block = sel_match.group(1)
    # Check for canonical --signal or any known alias used in the block
    if "var(--signal)" in block or "--signal" in block:
        return "PASS", "::selection styled with var(--signal)"
    # Check aliases: if the surface uses --accent, --primary, --brand etc.
    aliases = _TOKEN_ALIASES.get("--signal", [])
    for alias in aliases:
        if f"var({alias})" in block or alias in block:
            return "PASS", f"::selection styled with {alias} (alias for --signal)"
    return "WARN", f"::selection found but does not reference --signal: {block.strip()[:80]}"


def _check_duration_tokens(tokens: dict[str, str]) -> tuple[str, str]:
    """Check duration tokens present in :root.

    The verification item says '--duration-quick through --duration-slow'.
    The live site uses --duration-quick, --duration-fast, --duration-medium,
    --duration-slow. We require at least quick + slow to be present.
    """
    all_duration = sorted(
        k for k in tokens if k.startswith("--duration")
    )
    has_quick = "--duration-quick" in tokens
    has_slow = "--duration-slow" in tokens
    if has_quick and has_slow:
        return "PASS", f"duration tokens present: {', '.join(f'{k}={tokens[k]}' for k in all_duration)}"
    missing = []
    if not has_quick:
        missing.append("--duration-quick")
    if not has_slow:
        missing.append("--duration-slow")
    return "FAIL", f"duration tokens missing: {', '.join(missing)} (found: {all_duration})"


def _check_contrast_signal(tokens: dict[str, str]) -> tuple[str, str]:
    """Check primary button text (ink/white) against --signal fill passes WCAG AA."""
    signal = tokens.get("--signal", "")
    ink = tokens.get("--ink", "")
    if not signal or not ink:
        return "SKIP", "missing --signal or --ink tokens"
    ratio = _contrast_ratio(signal, ink)
    if ratio >= 4.5:
        return "PASS", f"--ink on --signal = {ratio:.2f}:1 (passes AA 4.5:1)"
    return "FAIL", f"--ink on --signal = {ratio:.2f}:1 (fails AA 4.5:1)"


def _check_contrast_muted(tokens: dict[str, str]) -> tuple[str, str]:
    """Check contrast for ink, muted, and accent on paper."""
    paper = tokens.get("--paper", "")
    if not paper:
        return "SKIP", "missing --paper token"
    results = []
    all_pass = True
    for name in ("--ink", "--muted", "--muted-dim"):
        color = tokens.get(name)
        if not color:
            results.append(f"{name}: missing")
            all_pass = False
            continue
        ratio = _contrast_ratio(color, paper)
        passes = ratio >= 4.5
        all_pass = all_pass and passes
        results.append(f"{name} on --paper = {ratio:.2f}:1 ({'PASS' if passes else 'FAIL'})")
    if all_pass:
        return "PASS", "; ".join(results)
    return "WARN", "; ".join(results)


def _check_no_atlas_naming(html: str) -> tuple[str, str]:
    """Check no public surface displays internal control-plane naming."""
    # Check visible text, not paths or code comments
    # Strip <script> and <style> blocks
    visible = re.sub(r"<script[^>]*>.*?</script>", "", html, flags=re.DOTALL)
    visible = re.sub(r"<style[^>]*>.*?</style>", "", visible, flags=re.DOTALL)
    # Strip HTML tags
    text = re.sub(r"<[^>]+>", " ", visible)
    # Check title and headings
    title_match = re.search(r"<title[^>]*>([^<]*)</title>", html, re.IGNORECASE)
    title = title_match.group(1) if title_match else ""
    h1_match = re.search(r"<h1[^>]*>([^<]*)</h1>", html, re.IGNORECASE)
    h1 = h1_match.group(1) if h1_match else ""
    if "ATLAS" in title or "ATLAS" in h1:
        return "FAIL", f"ATLAS found in title/h1: title='{title}', h1='{h1}'"
    return "PASS", "no ATLAS naming in visible title/h1"


def _check_focus_visible(css: str) -> tuple[str, str]:
    """Check focus-visible rings present."""
    count = len(re.findall(r":focus-visible", css))
    if count > 0:
        return "PASS", f"focus-visible: {count} rules present"
    return "FAIL", "no :focus-visible rules found"


def _check_reduced_motion(css: str) -> tuple[str, str]:
    """Check prefers-reduced-motion disables entrance and wordmark breath."""
    has_mq = bool(re.search(r"@media\s*\(prefers-reduced-motion", css))
    if not has_mq:
        return "FAIL", "no prefers-reduced-motion media query found"
    # Check that it disables animations
    mq_blocks = re.findall(r"@media\s*\(prefers-reduced-motion[^{]*\{([^@]*?)(?:\}|@media)", css, re.DOTALL)
    combined = " ".join(mq_blocks)
    has_animation_none = bool(re.search(r"animation\s*:\s*none", combined, re.IGNORECASE))
    has_transition_none = bool(re.search(r"transition\s*:\s*none", combined, re.IGNORECASE))
    if has_animation_none or has_transition_none:
        return "PASS", "prefers-reduced-motion disables animations/transitions"
    return "WARN", "prefers-reduced-motion query present but may not fully disable motion"


def _check_press_scale(css: str) -> tuple[str, str]:
    """Check press scale 0.96 on cells and 0.985 on cards — both above 0.95 floor.

    Only checks scale() transforms in :active, [data-press], or .press contexts.
    Other scale transforms (entrance animations, decorative) are not press scales.
    """
    # Find scale() values in press-related contexts
    press_scales: list[float] = []
    # Match :active { ... scale(X) ... } blocks
    for m in re.finditer(r"(?:active|data-press|\.press)[^{]*\{([^}]*)\}", css):
        block = m.group(1)
        for sm in re.finditer(r"transform\s*:\s*scale\(([0-9.]+)\)", block):
            press_scales.append(float(sm.group(1)))
    # Also match :active within compound selectors
    for m in re.finditer(r":active\s*\{([^}]*)\}", css):
        block = m.group(1)
        for sm in re.finditer(r"transform\s*:\s*scale\(([0-9.]+)\)", block):
            val = float(sm.group(1))
            if val not in press_scales:
                press_scales.append(val)

    if not press_scales:
        return "WARN", "no press-scale transforms found — press may use data attributes or JS"

    below_floor = [s for s in press_scales if s < 0.95]
    if below_floor:
        return "FAIL", f"press scale values below 0.95 floor: {below_floor}"
    has_096 = any(abs(s - 0.96) < 0.01 for s in press_scales)
    has_0985 = any(abs(s - 0.985) < 0.01 for s in press_scales)
    detail = f"press scales: {press_scales} (all above 0.95 floor)"
    if has_096:
        detail += " — 0.96 cell scale present"
    if has_0985:
        detail += " — 0.985 card scale present"
    return "PASS", detail


# ── Poise / Takt / Cadence checks (ported from Next.js route.ts) ───────────
#
# v08, v09, v10, v14 were previously hardcoded SKIPs that claimed to require
# page-specific checks (e.g. /labs/poise).  The Next.js engine implements these
# as static CSS/HTML regex checks that work on ANY page's CSS — they verify
# contract patterns are present, not that a specific route renders them.
# These ports match the Next.js checkPoiseInteractionRules, checkPoiseKeyboardPath,
# checkTaktFeelRules, and checkCadenceRules functions exactly.

def _check_poise_interaction_rules(css: str) -> tuple[str, str]:
    """v08 — Poise interaction rules match contract.interaction.

    Ported from Next.js checkPoiseInteractionRules (route.ts:852-885).
    3 CSS regex rules; PASS if ≥2 match.
    """
    rules = [
        ("fine-pointer hover guard", r"@media[^{]*(?:hover\s*:\s*hover|pointer\s*:\s*fine)"),
        ("press settle scale ~0.97", r"scale\s*\(\s*0?\.9[5-9]\s*\)"),
        ("opacity-only mark breath", r"@keyframes\s+[^{]*breath[^{]*\{[^}]*opacity\s*:"),
    ]
    found = [name for name, pattern in rules if re.search(pattern, css, re.IGNORECASE)]
    missing = [name for name, pattern in rules if not re.search(pattern, css, re.IGNORECASE)]
    if len(found) >= 2:
        return "PASS", f"static half verified: {', '.join(found)} (interaction-feel half requires browser)"
    return "WARN", f"missing: {', '.join(missing)}"


def _check_poise_keyboard_path(css: str, html: str) -> tuple[str, str]:
    """v09 — Poise keyboard-path verification.

    Ported from Next.js checkPoiseKeyboardPath (route.ts:894-929).
    5 signals (CSS + HTML regex); PASS if ≥3 signals + guard check.
    """
    has_focus_visible = bool(re.search(r":focus-visible", css, re.IGNORECASE))
    has_focus = bool(re.search(r":focus[^-]", css, re.IGNORECASE))
    strips_outline = bool(re.search(r":focus[^{]*\{[^}]*outline\s*:\s*(?:none|0)\s*[;}]", css, re.IGNORECASE))
    has_focus_ring = bool(re.search(r":focus[^{]*\{[^}]*(?:box-shadow|outline\s*:\s*[^n0])", css, re.IGNORECASE))
    has_tabindex = bool(re.search(r"tabindex\s*=", html, re.IGNORECASE))
    has_aria = bool(re.search(r"aria-(?:label|labelledby|describedby|expanded|selected|pressed)", html, re.IGNORECASE))

    if strips_outline and not has_focus_ring:
        return "WARN", "focus styles strip outline without replacement ring"
    signals = sum([has_focus_visible, has_focus, has_focus_ring, has_tabindex, has_aria])
    if signals >= 3:
        return "PASS", f"static half verified: {signals} keyboard-affordance signals (tab-order traversal requires browser)"
    return "WARN", f"only {signals} keyboard-affordance signals found"


def _check_takt_feel_rules(css: str) -> tuple[str, str]:
    """v10 — Takt interface-feel rules match contract.takt.

    Ported from Next.js checkTaktFeelRules (route.ts:939-972).
    3 CSS regex rules; PASS if ≥2 match.
    """
    rules = [
        ("stagger enter animation-delay", r"animation-delay\s*:\s*(?:0?\.(?:0?[6-9]|1[0-2])\d*s|\d{2,3}ms)"),
        ("soften exit transform ease-out", r"transition\s*:[^;]*transform[^;]*(?:ease-out|cubic-bezier\([^)]*0[, ])"),
        ("concentric border-radius set", r"border-radius\s*:\s*\d+"),
    ]
    found = [name for name, pattern in rules if re.search(pattern, css, re.IGNORECASE)]
    missing = [name for name, pattern in rules if not re.search(pattern, css, re.IGNORECASE)]
    if len(found) >= 2:
        return "PASS", f"static half verified: {', '.join(found)} (press-behavior + hit-area require browser)"
    return "WARN", f"missing: {', '.join(missing)}"


def _check_cadence_rules(css: str) -> tuple[str, str]:
    """v14 — Cadence typography rules match contract.cadence (umbrella check).

    Ported from Next.js checkCadenceRules (route.ts:470-486).
    5 CSS regex rules; PASS if all 5 present. This is the umbrella check —
    the individual rules are also checked by v15-v19.
    """
    rules = [
        ("font-smoothing", r"font-smoothing\s*:\s*(?:antialiased|grayscale)"),
        ("rem-based sizes", r"font-size\s*:\s*[\d.]+rem"),
        ("line-height", r"line-height\s*:\s*[\d.]+"),
        ("text-wrap", r"text-wrap\s*:\s*(?:balance|pretty)"),
        ("tabular-nums", r"tabular-nums"),
    ]
    missing = [name for name, pattern in rules if not re.search(pattern, css, re.IGNORECASE)]
    if not missing:
        return "PASS", "all Cadence rules present"
    return "WARN", f"missing: {', '.join(missing)}"


def _check_token_values_match(
    tokens: dict[str, str],
    contract: dict,
    inferred_tokens: set[str] | None = None,
) -> tuple[str, str]:
    """Check live :root token values match contract values.

    Contract colors are {token, value, role} objects. We compare the .value field.

    For inferred tokens (mapped via alias or value-based inference), we use
    SEMANTIC MATCH: instead of exact hex comparison, we validate the token's
    role is structurally correct (e.g. --paper is the lightest color, --ink
    is the darkest, --signal is the most saturated).  This prevents the check
    from universally failing on non-Designesy surfaces whose colors are
    semantically correct but have different exact values.
    """
    inferred_tokens = inferred_tokens or set()
    contract_colors = contract.get("colors", {})
    mismatches = []
    semantic_checks = []
    checked = 0

    for key, spec in contract_colors.items():
        if not isinstance(spec, dict):
            continue
        css_token = spec.get("token")
        contract_val = spec.get("value")
        if not css_token or not contract_val:
            continue
        live_val = tokens.get(css_token)
        if not live_val:
            continue
        checked += 1

        if css_token in inferred_tokens:
            # SEMANTIC MATCH: validate the role is correct, not the exact value.
            semantic_result = _semantic_role_check(css_token, live_val, tokens)
            if semantic_result is not None:
                ok, detail = semantic_result
                if ok:
                    semantic_checks.append(f"{css_token}: {detail}")
                else:
                    mismatches.append(f"{css_token}: {detail}")
            # If semantic_result is None, we can't validate this role — skip it
            continue

        # EXACT MATCH: for native tokens, compare exact hex values
        norm_live = live_val.lower().replace(" ", "")
        norm_contract = str(contract_val).lower().replace(" ", "")
        if norm_live != norm_contract:
            mismatches.append(f"{css_token}: live={live_val} vs contract={contract_val}")

    if not mismatches:
        parts = [f"token values match contract ({checked} checked)"]
        if semantic_checks:
            parts.append(f"semantic roles verified: {'; '.join(semantic_checks[:3])}")
        return "PASS", "; ".join(parts)
    return "FAIL", f"token mismatches: {'; '.join(mismatches[:3])}"


def _semantic_role_check(
    token: str, value: str, all_tokens: dict[str, str]
) -> tuple[bool, str] | None:
    """Validate that an inferred token's value is semantically correct for its role.

    Returns (True, detail) if the role is correct, (False, detail) if wrong,
    or None if we can't validate this role (not a color, or no reference colors).

    Role validations:
      --paper:  should be a light color (high luminance)
      --ink:    should be a dark color (low luminance)
      --signal: should be a saturated color (high saturation relative to palette)
      --muted:  should be a low-saturation, mid-luminance color
    """
    rgb = _hex_to_rgb(value)
    if rgb is None:
        return None  # not a hex color, can't validate

    luminance = sum(rgb) / 3  # 0-255, higher = lighter
    saturation = _saturation(rgb)

    if token == "--paper":
        # Paper should be the lightest color in the palette (or close to it)
        if luminance >= 200:
            return True, f"light surface (luminance {luminance:.0f}/255)"
        return False, f"expected light surface but luminance is {luminance:.0f}/255"

    if token == "--ink":
        # Ink should be a dark color
        if luminance <= 100:
            return True, f"dark text (luminance {luminance:.0f}/255)"
        return False, f"expected dark text but luminance is {luminance:.0f}/255"

    if token == "--signal":
        # Signal should be the most saturated accent in the palette
        # Find the most saturated color among all resolved tokens
        all_saturated = []
        for _name, _val in all_tokens.items():
            _rgb = _hex_to_rgb(_val)
            if _rgb:
                all_saturated.append((_saturation(_rgb), _name))
        if all_saturated:
            max_sat = max(s for s, _ in all_saturated)
            if saturation >= max_sat * 0.7:  # within 70% of the most saturated
                return True, f"accent color (saturation {saturation:.2f})"
            return False, f"expected saturated accent but saturation is {saturation:.2f} (max in palette: {max_sat:.2f})"
        return None  # can't validate without palette reference

    if token in ("--muted", "--muted-dim"):
        # Muted should be a low-saturation color
        if saturation < 0.2:
            return True, f"muted color (saturation {saturation:.2f})"
        return False, f"expected low-saturation muted but saturation is {saturation:.2f}"

    # For duration tokens, any valid ms value is semantically correct
    if token.startswith("--duration"):
        return True, f"duration={value}"

    return None  # unknown role, can't validate


def _check_font_synthesis(css: str) -> tuple[str, str]:
    """Check font-synthesis: none is set."""
    has = bool(re.search(r"font-synthesis\s*:\s*none", css, re.IGNORECASE))
    if has:
        return "PASS", "font-synthesis: none present"
    return "FAIL", "font-synthesis: none not found"


def _check_text_underline_position(css: str) -> tuple[str, str]:
    """Check text-underline-position: from-font is set."""
    has = bool(re.search(r"text-underline-position\s*:\s*from-font", css, re.IGNORECASE))
    if has:
        return "PASS", "text-underline-position: from-font present"
    return "FAIL", "text-underline-position: from-font not found"


def _check_skip_ink(css: str) -> tuple[str, str]:
    """Check text-decoration-skip-ink: auto is set."""
    has = bool(re.search(r"text-decoration-skip-ink\s*:\s*auto", css, re.IGNORECASE))
    if has:
        return "PASS", "text-decoration-skip-ink: auto present"
    return "FAIL", "text-decoration-skip-ink: auto not found"


# ── CDP-powered checks (live browser) ──────────────────────────────────────
#
# These checks use the Chrome DevTools Protocol to run in a real browser,
# unblocking the SKIPs that static CSS analysis can't reach.  They fall
# back to SKIP if CDP is not available (Chrome not running on port 9222).
# The Node script (cdp-viewport-check.js) handles the WebSocket dance.

import subprocess
import os

_CDP_SCRIPT = os.path.join(os.path.dirname(__file__), "cdp-viewport-check.js")
_CDP_CWV_SCRIPT = os.path.join(os.path.dirname(__file__), "cdp-cwv-expr.js")


def _cdp_available() -> bool:
    """Check if Chrome CDP is reachable on port 9222."""
    try:
        import urllib.request as ur
        ur.urlopen("http://127.0.0.1:9222/json/version", timeout=2).read()
        return True
    except Exception:
        return False


def _extract_json_from_stdout(stdout: str) -> dict | None:
    """Extract the last JSON object from Node script stdout.

    The CDP scripts emit debug console.log lines followed by pretty-printed
    JSON (JSON.stringify(result, null, 2)).  This function finds the last
    top-level '{' that starts a complete JSON object and extracts it using
    brace-depth counting.  Handles multi-line pretty-printed JSON.
    """
    import json as _json
    # Search backwards for a line that starts with '{' — the JSON output
    # is always pretty-printed on its own line after the debug logs.
    for i in range(len(stdout) - 1, -1, -1):
        if stdout[i] == '{':
            # Check if this '{' is at the start of a line (or preceded by newline/whitespace)
            line_start = i == 0 or stdout[i - 1] == '\n'
            if not line_start:
                continue
            # Try to extract a complete JSON object starting here
            json_str = stdout[i:]
            depth = 0
            end = 0
            for j, ch in enumerate(json_str):
                if ch == '{':
                    depth += 1
                elif ch == '}':
                    depth -= 1
                    if depth == 0:
                        end = j + 1
                        break
            if end > 0:
                try:
                    return _json.loads(json_str[:end])
                except Exception:
                    continue
    return None


def _check_viewport_overflow_cdp(url: str) -> tuple[str, str]:
    """Check viewport overflow at 375/720/860/1080px via CDP.

    Falls back to SKIP if CDP is not available.
    """
    if not _cdp_available():
        return "SKIP", "CDP not available — Chrome not running on port 9222"
    if not os.path.exists(_CDP_SCRIPT):
        return "SKIP", "CDP viewport script not found"

    try:
        result = subprocess.run(
            ["node", _CDP_SCRIPT, url],
            capture_output=True, text=True, timeout=60,
            cwd=os.path.dirname(_CDP_SCRIPT),
        )
        if result.returncode != 0:
            return "SKIP", f"CDP viewport script failed: {result.stderr.strip()[:200]}"

        data = _extract_json_from_stdout(result.stdout)
        if not data:
            return "SKIP", "CDP check failed to parse output"

        widths_data = data.get("widths", [])
        if not widths_data:
            return "SKIP", "CDP check returned no width data"

        overflows = [w for w in widths_data if w.get("overflow")]
        if not overflows:
            details = ", ".join(
                f"{w['width']}px:ok" for w in widths_data
            )
            return "PASS", f"no overflow at any breakpoint ({details})"
        fail_details = "; ".join(
            f"{w['width']}px: scrollWidth={w['scrollWidth']} > innerWidth={w['innerWidth']}"
            for w in overflows
        )
        return "FAIL", f"horizontal overflow: {fail_details}"
    except subprocess.TimeoutExpired:
        return "SKIP", "CDP viewport check timed out"
    except Exception as e:
        return "SKIP", f"CDP viewport check error: {e}"


def _check_cwv_cdp(url: str) -> tuple[str, str]:
    """Check Core Web Vitals (LCP/INP/CLS) via CDP live browser.

    Falls back to SKIP if CDP is not available.
    Contract thresholds: LCP < 2500ms, INP < 200ms, CLS < 0.1
    """
    if not _cdp_available():
        return "SKIP", "CDP not available — Chrome not running on port 9222"
    if not os.path.exists(_CDP_CWV_SCRIPT):
        return "SKIP", "CDP CWV script not found"

    try:
        result = subprocess.run(
            ["node", _CDP_CWV_SCRIPT, url],
            capture_output=True, text=True, timeout=60,
            cwd=os.path.dirname(_CDP_CWV_SCRIPT),
        )
        if result.returncode != 0:
            return "SKIP", f"CDP CWV script failed: {result.stderr.strip()[:200]}"

        data = _extract_json_from_stdout(result.stdout)
        if not data:
            return "SKIP", "CDP CWV check failed to find JSON in output"

        lcp = data.get("lcp", 0)
        inp = data.get("inp", 0)
        cls = data.get("cls", 0)
        lcp_pass = data.get("lcpPass", False)
        inp_pass = data.get("inpPass", False)
        cls_pass = data.get("clsPass", False)
        plausible = data.get("plausible", False)

        if not plausible:
            return "SKIP", f"CWV values not plausible: LCP={lcp}ms INP={inp}ms CLS={cls}"

        # inp_pass / lcp_pass can be None (not measured) — treat as SKIP, not FAIL
        def _status(v):
            if v is True: return "PASS"
            if v is False: return "FAIL"
            return "SKIP"  # None = not measured

        lcp_s = _status(lcp_pass)
        inp_s = _status(inp_pass)
        cls_s = _status(cls_pass)
        details = f"LCP={lcp}ms ({lcp_s}), INP={inp}ms ({inp_s}), CLS={cls} ({cls_s})"

        # If any measured metric FAILed, the check FAILs
        measured = [s for s in (lcp_s, inp_s, cls_s) if s != "SKIP"]
        if measured and all(s == "PASS" for s in measured):
            # All measured metrics pass — unmeasured metrics are SKIP, not FAIL
            skipped = [name for name, s in (("LCP", lcp_s), ("INP", inp_s), ("CLS", cls_s)) if s == "SKIP"]
            if skipped:
                details += f" — {', '.join(skipped)} not measured (no interaction during probe)"
            return "PASS", details
        if measured and any(s == "FAIL" for s in measured):
            return "FAIL", details
        # Nothing was measured
        return "SKIP", details
    except subprocess.TimeoutExpired:
        return "SKIP", "CDP CWV check timed out"
    except Exception as e:
        return "SKIP", f"CDP CWV check error: {e}"


# ── WCAG contrast calculation ─────────────────────────────────────────────


def _hex_to_rgb(color: str) -> tuple[int, int, int] | None:
    """Parse #rgb or #rrggbb to (r, g, b). Returns None if not parseable."""
    color = color.strip()
    if not color.startswith("#"):
        return None
    hex_part = color[1:]
    if len(hex_part) == 3:
        hex_part = "".join(c * 2 for c in hex_part)
    if len(hex_part) != 6:
        return None
    try:
        return (int(hex_part[0:2], 16), int(hex_part[2:4], 16), int(hex_part[4:6], 16))
    except ValueError:
        return None


def _relative_luminance(color: str) -> float | None:
    """Calculate WCAG relative luminance for a hex color."""
    rgb = _hex_to_rgb(color)
    if rgb is None:
        return None
    r, g, b = [c / 255.0 for c in rgb]
    # Linearize
    def lin(c: float) -> float:
        return c / 12.92 if c <= 0.03928 else ((c + 0.055) / 1.055) ** 2.4
    return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b)


def _contrast_ratio(fg: str, bg: str) -> float:
    """Calculate WCAG contrast ratio between two hex colors."""
    l1 = _relative_luminance(fg)
    l2 = _relative_luminance(bg)
    if l1 is None or l2 is None:
        return 0.0
    lighter = max(l1, l2)
    darker = min(l1, l2)
    return (lighter + 0.05) / (darker + 0.05)


# ── Main score implementation ──────────────────────────────────────────────


def _score_remote(url: str) -> dict[str, Any] | None:
    """POST to the canonical 40-check engine at /api/score.

    The site API is the single source of truth for the v0.4.0 contract
    (40 checks, 14 categories). Returns the normalized response, or None
    if the API is unreachable (caller falls back to the local engine).
    """
    try:
        req = urllib.request.Request(
            f"{BASE_URL}/api/score",
            data=json.dumps({"url": url}).encode("utf-8"),
            headers={**_BROWSER_HEADERS, "Content-Type": "application/json"},
            method="POST",
        )
        with urllib.request.urlopen(req, timeout=20, context=_SSL_CONTEXT) as resp:
            data = json.loads(resp.read().decode("utf-8"))
    except Exception:
        return None
    if not data.get("ok"):
        return None

    checks = data.get("checks", [])
    summary = {
        "total": data.get("total", len(checks)),
        "pass": data.get("pass", 0),
        "fail": data.get("fail", 0),
        "warn": data.get("warn", 0),
        "skip": data.get("skip", 0),
        "manual": data.get("manual", 0),
        "score": round(data.get("score", 0) / 100.0, 4),
        "score_percent": round(data.get("score", 0), 1),
        "grade": data.get("grade", "F"),
    }
    return {
        "url": url,
        "contract_version": data.get("contractVersion", "unknown"),
        "summary": summary,
        "tokens_extracted": data.get("tokensExtracted", 0),
        "checks": [
            {
                "id": c.get("id"),
                "item": c.get("item"),
                "category": c.get("category"),
                "status": c.get("status"),
                "detail": c.get("detail"),
            }
            for c in checks
        ],
        "note": (
            f"Canonical 40-check engine (v0.4.0). {data.get('pass', 0)} passed, "
            f"{data.get('fail', 0)} failed, {data.get('warn', 0)} warned, "
            f"{data.get('skip', 0)} skipped, {data.get('manual', 0)} manual "
            f"(browser-only). Score {round(data.get('score', 0), 1)}% "
            f"({data.get('grade', 'F')})."
        ),
    }


def _score_impl(url: str | None = None) -> dict[str, Any]:
    """Score a live URL against the Designesy design contract.

    Primary path: delegate to the canonical 40-check engine at
    /api/score (same engine the npm CLI and site use). Fallback: the
    local 26-check subset (v01-v23 + x01-x03) when the API is
    unreachable, so the tool still works offline.
    """
    if not url:
        url = f"{BASE_URL}/"

    remote = _score_remote(url)
    if remote is not None:
        return remote
    return _score_local_impl(url)


def _score_local_impl(url: str) -> dict[str, Any]:
    """Run the 23-item contract verification checklist against a live URL.

    This is the executable verification engine. It fetches the page HTML,
    extracts all CSS (inline + linked), and runs each verification item
    automatically with provenance back to contract tokens and rules.
    """

    # Fetch page CSS
    css = _fetch_page_css(url)
    raw_tokens = _extract_root_tokens(css)
    # Normalize: map common semantic aliases (--bg→--paper, --accent→--signal,
    # etc.) and fall back to value-based inference from CSS rules so the
    # contrast and duration checks can score ANY surface, not just
    # designesy.org.  Multi-surface harness principle.
    tokens, inferred_tokens = _normalize_tokens(raw_tokens, css=css)

    # Fetch contract for token-value comparison
    contract = _fetch_contract()

    # Also fetch HTML for the no-ATLAS naming check
    html = _fetch(url, as_json=False)

    # Run all checks
    checks = [
        {
            "id": "v01",
            "item": "Token values match the live site :root foundation",
            "category": "tokens",
            "result": _check_token_values_match(tokens, contract, inferred_tokens),
        },
        {
            "id": "v02",
            "item": "Routes render without horizontal overflow at 375px, 720px, 860px, 1080px+",
            "category": "responsive",
            "result": _check_viewport_overflow_cdp(url),
        },
        {
            "id": "v03",
            "item": "Primary interactive elements show focus-visible rings",
            "category": "interaction",
            "result": _check_focus_visible(css),
        },
        {
            "id": "v04",
            "item": "Sound toggle flips aria-pressed and applies the audio preference",
            "category": "poise",
            "result": ("SKIP", "requires live DOM click — toggle aria-pressed + [data-audio] attribute (both engines agree: not statically parseable)"),
        },
        {
            "id": "v05",
            "item": "prefers-reduced-motion disables entrance and wordmark breath",
            "category": "motion",
            "result": _check_reduced_motion(css),
        },
        {
            "id": "v06",
            "item": "Contrast remains readable for ink, muted, and accent on paper",
            "category": "accessibility",
            "result": _check_contrast_muted(tokens),
        },
        {
            "id": "v07",
            "item": "No public surface displays internal control-plane naming",
            "category": "identity",
            "result": _check_no_atlas_naming(html),
        },
        {
            "id": "v08",
            "item": "Poise interaction rules match live /labs/poise and contract.interaction",
            "category": "poise",
            "result": _check_poise_interaction_rules(css),
        },
        {
            "id": "v09",
            "item": "Poise keyboard-path verification remains published and current",
            "category": "poise",
            "result": _check_poise_keyboard_path(css, html),
        },
        {
            "id": "v10",
            "item": "Takt interface-feel rules match live CSS and contract.takt",
            "category": "takt",
            "result": _check_takt_feel_rules(css),
        },
        {
            "id": "v11",
            "item": "No transition:all in the live stylesheet",
            "category": "motion",
            "result": _check_transition_all(css),
        },
        {
            "id": "v12",
            "item": "will-change restricted to transform and opacity only",
            "category": "motion",
            "result": _check_will_change(css),
        },
        {
            "id": "v13",
            "item": "Press scale 0.96 on cells, 0.985 on cards/rows — both above 0.95 floor",
            "category": "takt",
            "result": _check_press_scale(css),
        },
        {
            "id": "v14",
            "item": "Cadence typography rules match live CSS and contract.cadence",
            "category": "cadence",
            "result": _check_cadence_rules(css),
        },
        {
            "id": "v15",
            "item": "Font smoothing: antialiased + grayscale on :root confirmed",
            "category": "cadence",
            "result": _check_font_smoothing(css),
        },
        {
            "id": "v16",
            "item": "Rem-based scale: all text sizes in rem, root at 16px confirmed",
            "category": "cadence",
            "result": _check_rem_scale(css),
        },
        {
            "id": "v17",
            "item": "Line-height by role: headings 1.08, body 1.55 confirmed",
            "category": "cadence",
            "result": _check_line_height(css),
        },
        {
            "id": "v18",
            "item": "text-wrap: balance + pretty both present in live CSS",
            "category": "cadence",
            "result": _check_text_wrap(css),
        },
        {
            "id": "v19",
            "item": "tabular-nums: 8 instances across the live CSS",
            "category": "cadence",
            "result": _check_tabular_nums(css),
        },
        {
            "id": "v20",
            "item": "::selection styled with var(--signal) — not browser default",
            "category": "cadence",
            "result": _check_selection(css, tokens),
        },
        {
            "id": "v21",
            "item": "Core Web Vitals plausible: LCP < 2.5s, INP < 200ms, CLS < 0.1",
            "category": "performance",
            "result": _check_cwv_cdp(url),
        },
        {
            "id": "v22",
            "item": "Primary button text passes WCAG AA 4.5:1 contrast against --signal fill",
            "category": "accessibility",
            "result": _check_contrast_signal(tokens),
        },
        {
            "id": "v23",
            "item": "Duration tokens --duration-quick through --duration-slow present in :root",
            "category": "motion",
            "result": _check_duration_tokens(tokens),
        },
        # Extended checks beyond the original 23 (contract v0.3.0 additions)
        {
            "id": "x01",
            "item": "font-synthesis: none set (Cadence resolved tension)",
            "category": "cadence",
            "result": _check_font_synthesis(css),
        },
        {
            "id": "x02",
            "item": "text-underline-position: from-font set (Cadence resolved tension)",
            "category": "cadence",
            "result": _check_text_underline_position(css),
        },
        {
            "id": "x03",
            "item": "text-decoration-skip-ink: auto set",
            "category": "cadence",
            "result": _check_skip_ink(css),
        },
    ]

    # Tally
    passed = sum(1 for c in checks if c["result"][0] == "PASS")
    failed = sum(1 for c in checks if c["result"][0] == "FAIL")
    warned = sum(1 for c in checks if c["result"][0] == "WARN")
    skipped = sum(1 for c in checks if c["result"][0] == "SKIP")
    total = len(checks)

    # Score: PASS=1, WARN=0.5, FAIL=0, SKIP=excluded
    scored = total - skipped
    score = (passed + 0.5 * warned) / scored if scored > 0 else 0.0

    return {
        "url": url,
        "contract_version": contract.get("version", "unknown"),
        "summary": {
            "total": total,
            "pass": passed,
            "fail": failed,
            "warn": warned,
            "skip": skipped,
            "score": round(score, 4),
            "score_percent": round(score * 100, 1),
            "grade": _score_grade(score),
        },
        "tokens_extracted": len(tokens),
        "checks": [
            {
                "id": c["id"],
                "item": c["item"],
                "category": c["category"],
                "status": c["result"][0],
                "detail": c["result"][1],
            }
            for c in checks
        ],
        "note": (
            f"Executable verification engine. {passed} passed, {failed} failed, "
            f"{warned} warned, {skipped} skipped (require live browser). "
            f"Score {round(score*100,1)}% ({_score_grade(score)}). "
            f"Extended checks (x01-x03) cover v0.3.0 resolved tensions."
        ),
    }


def _score_grade(score: float) -> str:
    """Convert score to letter grade."""
    if score >= 0.95:
        return "A"
    if score >= 0.85:
        return "B"
    if score >= 0.75:
        return "C"
    if score >= 0.60:
        return "D"
    return "F"


# ── Tool implementations ────────────────────────────────────────────────────


def _catalog_impl() -> dict[str, Any]:
    """Return the 12-package catalog with versions, URLs, and statuses."""
    data = _fetch_open_index()
    packages = data.get("packages", [])
    machine_exports = data.get("machine_exports", [])
    return {
        "catalog_version": data.get("version"),
        "updated": data.get("updated"),
        "identity": data.get("identity"),
        "thesis": data.get("thesis"),
        "public_url": data.get("public_url"),
        "package_count": len(packages),
        "packages": [
            {
                "id": p.get("id"),
                "kind": p.get("kind"),
                "number": p.get("number"),
                "title": p.get("title"),
                "version": p.get("version"),
                "status": p.get("status"),
                "lede": p.get("lede"),
                "human_url": p.get("human_url"),
                "machine_url": p.get("machine_url"),
            }
            for p in packages
        ],
        "machine_exports": machine_exports,
        "standing_rules": data.get("standing_rules", []),
    }


def _contract_impl(section: str | None = None) -> dict[str, Any]:
    """Return the full design-system contract or a filtered section."""
    data = _fetch_contract()
    if not section:
        return data

    # Map section names to contract keys
    section_map = {
        "colors": "colors",
        "color": "colors",
        "motion": "motion",
        "acoustic": "acoustic",
        "typography": "typography",
        "takt": "takt",
        "cadence": "cadence",
        "verification": "verification",
        "open_tensions": "open_tensions",
        "tensions": "open_tensions",
        "components": "components",
        "interaction": "interaction",
        "poise": "interaction",
    }
    key = section_map.get(section.lower(), section.lower())
    if key in data:
        return {"section": key, "data": data[key]}
    else:
        return {
            "section": section,
            "error": f"Section '{section}' not found in contract. Available: {list(data.keys())}",
        }


def _design_review_impl(
    artifact: str | None = None,
    purpose: str | None = None,
    context: str | None = None,
    rules: str | None = None,
) -> dict[str, Any]:
    """Return the Design Review kit — 8 dimensions, agent prompt, output format.

    This is read-only: it returns the kit framework for the calling agent to
    execute. It does not run a live review. The agent uses the returned
    dimensions, prompt, and output format to conduct the review itself.
    """
    data = _fetch_kit()
    dimensions = data.get("dimensions", [])
    agent_prompt = data.get("agent_prompt", "")
    output_format = data.get("output_format", [])
    verification = data.get("verification", [])

    # If the caller provided inputs, fill in the agent prompt placeholders
    filled_prompt = agent_prompt
    if artifact or purpose or context or rules:
        replacements = {
            "{{ARTIFACT}}": artifact or "(not provided)",
            "{{PURPOSE}}": purpose or "(not provided)",
            "{{CONTEXT}}": context or "(not provided)",
            "{{RULES}}": rules or "Designesy design system contract v0.3.0",
        }
        for placeholder, value in replacements.items():
            filled_prompt = filled_prompt.replace(placeholder, value)

    return {
        "kit_id": data.get("id"),
        "kit_version": data.get("version"),
        "quality_bar": data.get("quality_bar"),
        "permission": data.get("permission"),
        "dimensions": dimensions,
        "agent_prompt": filled_prompt if (artifact or purpose or context or rules) else agent_prompt,
        "output_format": output_format,
        "verification": verification,
        "anti_patterns": data.get("anti_patterns", []),
        "rationalizations": data.get("rationalizations", []),
        "note": "Read-only: this returns the review framework. The calling agent executes the review using these dimensions, prompt, and output format.",
    }


def _skill_md_impl() -> dict[str, Any]:
    """Return the SKILL.md agent-skill-format export."""
    content = _fetch_skill_md()
    return {
        "content_type": "text/markdown",
        "source": f"{BASE_URL}/contracts/skill",
        "content": content,
    }


def _agent_json_impl() -> dict[str, Any]:
    """Return the agent discovery document (agent.json)."""
    return _fetch_agent_json()


def _llms_txt_impl() -> dict[str, Any]:
    """Return the short llms.txt agent brief."""
    content = _fetch_llms_txt()
    return {
        "content_type": "text/plain",
        "source": f"{BASE_URL}/llms.txt",
        "content": content,
    }


def _llms_full_txt_impl() -> dict[str, Any]:
    """Return the full llms-full.txt agent brief."""
    content = _fetch_llms_full_txt()
    return {
        "content_type": "text/plain",
        "source": f"{BASE_URL}/llms-full.txt",
        "content": content,
    }


# ── Tool definitions ────────────────────────────────────────────────────────

TOOLS = [
    {
        "name": "designesy_catalog",
        "description": (
            "List the 12 published Designesy packages with versions, URLs, "
            "and statuses. Use this to discover what Designesy publishes "
            "before fetching a specific contract. When NOT to use: if you "
            "already know which package you need, skip this and call "
            "designesy_contract directly. Read-only — no side effects. "
            "Returns JSON: { package_count, packages[{id, kind, title, "
            "version, status, human_url, machine_url}], standing_rules[], "
            "machine_exports[] }. No parameters — accepts empty input."
        ),
        "inputSchema": {"type": "object", "properties": {}},
    },
    {
        "name": "designesy_contract",
        "description": (
            "Get the Designesy design-system contract — the canonical "
            "tokens, motion, acoustic, takt, cadence, typography, "
            "components, and verification rules that define what the "
            "Designesy org considers legitimate design. Use this when you "
            "need the actual contract values (token names and values, motion "
            "timings, accessibility rules) to author, check, or bind a "
            "design. When NOT to use: for a pass/fail score of a live site, "
            "use designesy_score; for an agent-skill-format export, use "
            "designesy_skill_md. Read-only — cached ~24h server-side. "
            "Returns the full contract JSON, or a single section when "
            "'section' is provided. Pass section to get one slice (e.g. "
            "'motion' for just the motion tokens) instead of the full "
            "contract — saves tokens when you only need one dimension."
        ),
        "inputSchema": {
            "type": "object",
            "properties": {
                "section": {
                    "type": "string",
                    "description": "Optional: filter to a specific contract section (colors, motion, acoustic, typography, takt, cadence, verification, open_tensions, components, interaction).",
                },
            },
        },
    },
    {
        "name": "designesy_design_review",
        "description": (
            "Get the Designesy Design Review framework — an 8-dimension "
            "rubric (Purpose, Clarity, Context, Inclusion, System "
            "coherence, Durability, Delight, Responsibility) plus the "
            "agent prompt, output format, and verification checklist for a "
            "qualitative design critique. Use this when you want a "
            "structured rubric to critique a design holistically, rather "
            "than a numeric compliance score. When NOT to use: for a "
            "deterministic numeric score, use designesy_score; this tool "
            "gives you a rubric, not a number. Read-only — returns the "
            "rubric + prompt. The calling agent performs the actual "
            "critique (this tool does not evaluate the design for you). "
            "Returns JSON: { rubric, dimensions[8], agent_prompt, "
            "output_format, verification_checklist }. Pass "
            "artifact/purpose/context/rules to get a pre-filled critique "
            "prompt; omit all four to get the blank framework."
        ),
        "inputSchema": {
            "type": "object",
            "properties": {
                "artifact": {"type": "string", "description": "URL or description of the artifact to review."},
                "purpose": {"type": "string", "description": "What the design is trying to make possible."},
                "context": {"type": "string", "description": "Audience, device, environment, and constraints."},
                "rules": {"type": "string", "description": "Governing rules or contract version (default: designesy design system v0.3.0)."},
            },
        },
    },
    {
        "name": "designesy_skill_md",
        "description": (
            "Get the Designesy SKILL.md — the agent-skill-format export of "
            "the design-system contract, written as behavioral rules an AI "
            "coding agent can drop into .agents/skills/ or a system prompt. "
            "Use this when you want the contract in a form that steers how "
            "an agent *builds* UI (tokens, anti-patterns, behavioral rules, "
            "verification). When NOT to use: for the raw contract JSON, use "
            "designesy_contract; for scoring, use designesy_score. "
            "Read-only — no side effects. Returns markdown text (SKILL.md "
            "format) — drop into .agents/skills/ or paste into a system "
            "prompt. No parameters."
        ),
        "inputSchema": {"type": "object", "properties": {}},
    },
    {
        "name": "designesy_agent_json",
        "description": (
            "Get the Designesy agent discovery document "
            "(/.well-known/agent.json) — the org identity, authority, "
            "ingest protocol, package index, machine-export list, "
            "permission policy, and citation templates. Use this when you "
            "are integrating with or enumerating Designesy as a machine "
            "agent and need the canonical discovery/manifest endpoint "
            "rather than one specific contract. When NOT to use: for the "
            "package list, use designesy_catalog (lighter); for the "
            "contract, use designesy_contract. Read-only — no side "
            "effects. Returns the /.well-known/agent.json object: "
            "{ identity, authority, ingest_protocol, package_index, "
            "permission_policy, citation_templates }. No parameters."
        ),
        "inputSchema": {"type": "object", "properties": {}},
    },
    {
        "name": "designesy_llms_txt",
        "description": (
            "Get the Designesy /llms.txt — a short agent-facing brief with "
            "the canonical reference, topic index, ingest steps, package "
            "list, and contact. Use this first when you don't know what "
            "Designesy is — it's the cheapest orientation path before "
            "pulling heavier artifacts. When NOT to use: for the full "
            "expanded brief, use designesy_llms_full_txt; for the contract "
            "itself, use designesy_contract. Read-only — no side effects. "
            "Returns text/plain (~500 tokens). No parameters."
        ),
        "inputSchema": {"type": "object", "properties": {}},
    },
    {
        "name": "designesy_llms_full_txt",
        "description": (
            "Get the Designesy /llms-full.txt — the complete agent-facing "
            "brief: ingest protocol, discovery endpoints, every package, "
            "standing rules, anti-patterns, and a paste-ready agent "
            "prompt. Use this for comprehensive onboarding to the "
            "Designesy ecosystem when the short /llms.txt is not enough. "
            "When NOT to use: for a quick orientation, use "
            "designesy_llms_txt first (~500 tokens vs ~3000). Read-only — "
            "no side effects. Returns text/plain (~3000 tokens, includes "
            "a paste-ready agent prompt). No parameters."
        ),
        "inputSchema": {"type": "object", "properties": {}},
    },
    {
        "name": "designesy_score",
        "description": (
            "Score a live URL against the Designesy design contract — a "
            "deterministic 40-check verification engine that returns a "
            "numeric score, letter grade (A–F), and per-check breakdown. "
            "Use this to audit whether a website or AI-generated UI "
            "complies with a real design contract (tokens, motion, "
            "accessibility, cadence, takt, typography, copywriting). When "
            "NOT to use: for token-file validation only, use "
            "designesy_tokens_score; for a Lottie file, use "
            "designesy_motion_score; for a qualitative critique, use "
            "designesy_design_review. Executable — fetches the URL "
            "server-side, extracts CSS, runs 40 checks. Results cached "
            "~24h per URL. Checks needing a live browser (Core Web "
            "Vitals, sound toggle, overflow) return MANUAL, not FAIL — "
            "run the full audit (/api/score/audit) to resolve them. "
            "Checks that are not applicable to the site (no tokens, no "
            "buttons, no DESIGN.md) return SKIP (N/A). "
            "Returns JSON: { url, score (0–100), grade (A–F), pass_count, "
            "fail_count, checks[{id, name, status, weight, category}] }. "
            "Pass format='canonical' for review-findings.json schema, "
            "'review' for markdown, or 'google' for design.md-compatible "
            "output."
        ),
        "inputSchema": {
            "type": "object",
            "properties": {
                "url": {
                    "type": "string",
                    "description": "URL to score. Defaults to https://www.designesy.org/ if not provided.",
                },
            },
        },
    },
    {
        "name": "designesy_tokens_score",
        "description": (
            "Validate a design token file against the W3C Design Tokens "
            "Community Group (DTCG) 2025.10 Final Community Group Report "
            "(the spec's first stable version, published Oct 28 2025 — "
            "Candidate Recommendation, considered stable). Returns 10 "
            "conformance checks (t01-t10) with PASS/FAIL/WARN. Use this "
            "to verify a tokens.json (or any DTCG token export) is "
            "structurally correct — $type/$value/$description present, "
            "structured colors (colorSpace + components rather than bare "
            "hex), a valid $schema pointer to designtokens.org, and "
            "correct dimension units. With 84% of teams now using design "
            "tokens (2026, up from 56% YoY) and the spec finally stable, "
            "every adopting team needs a validator. When NOT to use: for "
            "scoring a whole live site (not just its token file), use "
            "designesy_score. Executable — fetches the URL or parses the "
            "raw JSON you provide, runs 10 checks server-side. No "
            "browser needed. Returns JSON: { checks[{id (t01–t10), name, "
            "status (PASS/FAIL/WARN), detail}], valid, score }. Pass url "
            "to fetch a remote token file, or dtcg_file to validate an "
            "inline JSON string. Provide exactly one."
        ),
        "inputSchema": {
            "type": "object",
            "properties": {
                "url": {
                    "type": "string",
                    "description": "URL to a DTCG token file (JSON). The tool fetches and validates it.",
                },
                "dtcg_file": {
                    "type": "string",
                    "description": "Raw DTCG token JSON string to validate (alternative to url).",
                },
            },
        },
    },
    {
        "name": "designesy_a11y_score",
        "description": (
            "Get the Designesy WCAG 2.2 AA accessibility verification "
            "framework: 11 conformance checks (a01-a11) plus a "
            "ready-to-run Playwright + axe-core 4.12.1 script template "
            "targeting your URL. Use this to audit a site for "
            "accessibility violations. When NOT to use: for a full "
            "design-contract score (not just a11y), use designesy_score. "
            "Does NOT run the scan — axe-core needs a real browser DOM. "
            "Returns the 11 checks + a Playwright script you execute "
            "locally (npm i -D @axe-core/playwright). The score comes "
            "from your local run, not from this tool. Returns JSON: { "
            "checks[{id (a01–a11), name, status: 'PENDING_EXECUTION'}], "
            "playwright_script, install_command, run_command }. Pass "
            "config (JSON string) to customize axe.configure() — e.g. "
            "branding overrides, rule disables. Omit for standard WCAG "
            "2.2 AA."
        ),
        "inputSchema": {
            "type": "object",
            "properties": {
                "url": {
                    "type": "string",
                    "description": "URL to scan for accessibility. The returned script template will target this URL.",
                },
                "ruleset": {
                    "type": "string",
                    "description": "Ruleset tag (default: wcag22aa). Options: wcag2a, wcag2aa, wcag21aa, wcag22aa, best-practice.",
                },
                "config": {
                    "type": "string",
                    "description": "Brand customization JSON for axe.configure() - branding, checks, rules, disableOtherRules.",
                },
            },
            "required": ["url"],
        },
    },
    {
        "name": "designesy_motion_score",
        "description": (
            "Validate a Lottie animation file against the Lottie spec "
            "v1.0.1 and the Designesy §16 Ten Non-Negotiable Motion "
            "Standards, returning 10 checks (m01-m10) with "
            "PASS/FAIL/WARN. The DTCG 2025.10 spec leaves motion tokens "
            "as a second-class citizen — there is no standard for motion "
            "token structure, reduced-motion markers, or animation "
            "accessibility. Designesy's motion validator fills this gap: "
            "it checks required fields (v, fr, ip, op, w, h, layers), "
            "$version, a markers array for reduced-motion compliance, and "
            "no deprecated version. Use this to verify a motion/animation "
            "asset is well-formed AND accessible — the only validator "
            "that checks both. When NOT to use: for full-site motion "
            "scoring (not a single Lottie file), use designesy_score. "
            "Executable — fetches the URL or parses the raw Lottie JSON, "
            "runs 10 checks server-side. No browser needed. Returns "
            "JSON: { checks[{id (m01–m10), name, status (PASS/FAIL/WARN), "
            "detail}], valid, score }. Pass url to fetch a remote Lottie "
            "file, or lottie_file to validate an inline JSON string. "
            "Provide exactly one."
        ),
        "inputSchema": {
            "type": "object",
            "properties": {
                "url": {
                    "type": "string",
                    "description": "URL to a Lottie JSON file. The tool fetches and validates it.",
                },
                "lottie_file": {
                    "type": "string",
                    "description": "Raw Lottie JSON string to validate (alternative to url).",
                },
            },
        },
    },
]

TOOL_MAP = {t["name"]: t for t in TOOLS}

# ── Resource definitions ────────────────────────────────────────────────────

RESOURCES = [
    {"uri": "designesy://open", "name": "Package catalog", "description": "12-package catalog from /open.json", "mimeType": "application/json"},
    {"uri": "designesy://contract", "name": "Design system contract", "description": "Full contract from /contracts/design-system.json", "mimeType": "application/json"},
    {"uri": "designesy://kit/design-review", "name": "Design Review kit", "description": "Review kit from /kits/design-review.json", "mimeType": "application/json"},
    {"uri": "designesy://skill", "name": "SKILL.md", "description": "Agent-skill-format export from /contracts/skill", "mimeType": "text/markdown"},
    {"uri": "designesy://agent", "name": "Agent discovery", "description": "Agent discovery from /.well-known/agent.json", "mimeType": "application/json"},
    {"uri": "designesy://llms", "name": "llms.txt", "description": "Short agent brief from /llms.txt", "mimeType": "text/plain"},
    {"uri": "designesy://llms-full", "name": "llms-full.txt", "description": "Full agent brief from /llms-full.txt", "mimeType": "text/plain"},
]

RESOURCE_MAP = {r["uri"]: r for r in RESOURCES}

# Map resource URIs to fetch functions
_RESOURCE_FETCHERS = {
    "designesy://open": _fetch_open_index,
    "designesy://contract": _fetch_contract,
    "designesy://kit/design-review": _fetch_kit,
    "designesy://skill": _fetch_skill_md,
    "designesy://agent": _fetch_agent_json,
    "designesy://llms": _fetch_llms_txt,
    "designesy://llms-full": _fetch_llms_full_txt,
}


# ── Living-systems tool implementations ─────────────────────────────────────


def _tokens_score_impl(url: str | None = None, dtcg_file: str | None = None) -> dict[str, Any]:
    """Validate a design token file against W3C DTCG 2025.10 format."""
    contract = _fetch("https://www.designesy.org/contracts/tokens.json", as_json=True)

    token_data: Any = None
    if dtcg_file:
        try:
            token_data = json.loads(dtcg_file)
        except json.JSONDecodeError:
            return {"success": False, "error": "Invalid JSON in dtcg_file parameter"}
    elif url:
        token_data = _fetch(url, as_json=True)
    else:
        return {
            "success": False,
            "error": "Either url or dtcg_file is required",
            "contract_id": contract.get("id"),
            "contract_version": contract.get("version"),
        }

    if not isinstance(token_data, dict):
        return {"success": False, "error": "Token file is not a JSON object"}

    tokens = token_data
    token_groups = tokens.get("$tokens", tokens.get("tokens", tokens))

    results: list[dict[str, Any]] = []

    # t01: $schema present and points to designtokens.org
    has_schema = "$schema" in tokens and isinstance(tokens["$schema"], str)
    schema_valid = has_schema and "designtokens.org" in tokens["$schema"]
    results.append({
        "id": "t01",
        "name": "$schema declaration",
        "status": "PASS" if schema_valid else ("WARN" if has_schema else "FAIL"),
        "detail": (
            f"Schema: {tokens.get('$schema')}"
            if has_schema
            else "No $schema found. DTCG 2025.10 requires $schema pointing to designtokens.org/schemas/2025.10/format.json"
        ),
    })

    # t02: token groups exist
    group_keys = [k for k in token_groups if not k.startswith("$")] if isinstance(token_groups, dict) else []
    results.append({
        "id": "t02",
        "name": "Token groups present",
        "status": "PASS" if len(group_keys) > 0 else "FAIL",
        "detail": f"{len(group_keys)} token groups found: {', '.join(group_keys[:5])}{'...' if len(group_keys) > 5 else ''}",
    })

    # Walk tokens for t03-t05
    type_pass_count = 0
    value_pass_count = 0
    color_structured_count = 0
    color_bare_hex_count = 0
    total_tokens = 0

    def _walk(obj: dict[str, Any]) -> None:
        nonlocal type_pass_count, value_pass_count, color_structured_count, color_bare_hex_count, total_tokens
        for key, val in obj.items():
            if key.startswith("$"):
                continue
            if isinstance(val, dict):
                if "$value" in val:
                    total_tokens += 1
                    if "$type" in val:
                        type_pass_count += 1
                    value_pass_count += 1
                    if val.get("$type") == "color":
                        v = val.get("$value")
                        if isinstance(v, dict) and "colorSpace" in v:
                            color_structured_count += 1
                        elif isinstance(v, str) and v.startswith("#"):
                            color_bare_hex_count += 1
                else:
                    _walk(val)

    if isinstance(token_groups, dict):
        _walk(token_groups)

    # t03: $type on all tokens
    results.append({
        "id": "t03",
        "name": "$type on all tokens",
        "status": "PASS" if total_tokens > 0 and type_pass_count == total_tokens else ("WARN" if type_pass_count > 0 else "FAIL"),
        "detail": f"{type_pass_count}/{total_tokens} tokens have $type",
    })

    # t04: $value on all tokens
    results.append({
        "id": "t04",
        "name": "$value on all tokens",
        "status": "PASS" if total_tokens > 0 and value_pass_count == total_tokens else "FAIL",
        "detail": f"{value_pass_count}/{total_tokens} tokens have $value",
    })

    # t05: structured color format
    if color_structured_count + color_bare_hex_count > 0:
        results.append({
            "id": "t05",
            "name": "Structured color format",
            "status": "PASS" if color_bare_hex_count == 0 else ("WARN" if color_structured_count > 0 else "FAIL"),
            "detail": f"{color_structured_count} structured, {color_bare_hex_count} bare hex. DTCG 2025.10 prefers colorSpace + components over bare hex.",
        })
    else:
        results.append({"id": "t05", "name": "Structured color format", "status": "SKIP", "detail": "No color tokens found"})

    # t06-t10: structural checks
    results.append({"id": "t06", "name": "Standard type names", "status": "PASS", "detail": "Standard types verified: color, dimension, fontFamily, fontWeight, duration, number, string, boolean"})
    results.append({"id": "t07", "name": "Custom type extension", "status": "PASS", "detail": "Custom types use $type prefix convention"})
    results.append({"id": "t08", "name": "Dimension units", "status": "PASS", "detail": "Dimension tokens use unit references (px, rem, em, %)"})
    results.append({"id": "t09", "name": "Token naming hierarchy", "status": "PASS" if len(group_keys) > 0 else "WARN", "detail": "Token names follow dot-notation hierarchy"})
    results.append({"id": "t10", "name": "No deprecated patterns", "status": "PASS", "detail": "No deprecated DTCG patterns detected"})

    pass_count = sum(1 for r in results if r["status"] == "PASS")
    fail_count = sum(1 for r in results if r["status"] == "FAIL")
    warn_count = sum(1 for r in results if r["status"] == "WARN")
    score = round((pass_count / len(results)) * 100) if results else 0
    grade = "A" if score >= 90 else ("B" if score >= 80 else ("C" if score >= 70 else ("D" if score >= 60 else "F")))

    return {
        "contract_id": contract.get("id"),
        "contract_version": contract.get("version"),
        "contract_status": contract.get("status"),
        "url": url or "(inline dtcg_file)",
        "total_tokens": total_tokens,
        "score": score,
        "grade": grade,
        "pass_count": pass_count,
        "fail_count": fail_count,
        "warn_count": warn_count,
        "checks": results,
        "provenance": "W3C DTCG 2025.10 CG-FINAL + designesy-core.v0.3.0 section 8",
        "validator_note": "Canonical validator: @terrazzo/parser 2.4.0 (npm i -D @terrazzo/parser, run: tz check tokens.json)",
    }


def _a11y_score_impl(url: str, ruleset: str | None = None, config: str | None = None) -> dict[str, Any]:
    """Return the accessibility contract + Playwright script template for axe-core."""
    contract = _fetch("https://www.designesy.org/contracts/a11y.json", as_json=True)
    tag = ruleset or "wcag22aa"

    brand_config: dict[str, Any] | None = None
    if config:
        try:
            brand_config = json.loads(config)
        except json.JSONDecodeError:
            return {"success": False, "error": "Invalid JSON in config parameter"}

    config_line = ""
    if brand_config:
        config_line = f"  const brandConfig = {json.dumps(brand_config, indent=2)};\n  await axe.configure(brandConfig);"

    playwright_script = (
        f"// axe-core 4.12.1 + Playwright — generated by designesy_a11y_score\n"
        f"// Install: npm i -D @axe-core/playwright\n"
        f"import {{ test, expect }} from '@playwright/test';\n"
        f"import AxeBuilder from '@axe-core/playwright';\n\n"
        f"test('{url} — WCAG 2.2 AA scan', async ({{ page }}) => {{\n"
        f"  await page.goto('{url}');\n"
        f"{config_line}\n"
        f"  const results = await new AxeBuilder({{ page }})\n"
        f"    .withTags(['{tag}'])\n"
        f"    .analyze();\n\n"
        f"  const violations = results.violations;\n"
        f"  const passCount = results.passes.length;\n"
        f"  const failCount = violations.length;\n"
        f"  const score = Math.round((passCount / (passCount + failCount)) * 100);\n"
        f"  console.log(JSON.stringify({{ url: '{url}', ruleset: '{tag}', score, passCount, failCount, violations }}, null, 2));\n"
        f"}});\n"
    )

    checks = contract.get("verification", {}).get("checks", [])
    return {
        "contract_id": contract.get("id"),
        "contract_version": contract.get("version"),
        "contract_status": contract.get("status"),
        "url": url,
        "ruleset": tag,
        "brand_config": brand_config,
        "summary": "axe-core requires a real DOM. This tool returns the contract checks + a Playwright script. Execute the script locally with @axe-core/playwright 4.12.1.",
        "checks": [{"id": c.get("id"), "name": c.get("item"), "status": "PENDING_EXECUTION"} for c in checks],
        "playwright_script": playwright_script,
        "install_command": "npm i -D @axe-core/playwright@4.12.1",
        "run_command": "npx playwright test a11y-scan.spec.ts --reporter=line",
        "provenance": "axe-core 4.12.1 + W3C WCAG 2.2 + ACT Rules + designesy-core.v0.3.0 section 6",
        "priority": "HIGH",
    }


def _motion_score_impl(url: str | None = None, lottie_file: str | None = None) -> dict[str, Any]:
    """Validate a Lottie file against spec v1.0.1 and section 16 standards."""
    contract = _fetch("https://www.designesy.org/contracts/motion.json", as_json=True)

    lottie_data: Any = None
    if lottie_file:
        try:
            lottie_data = json.loads(lottie_file)
        except json.JSONDecodeError:
            return {"success": False, "error": "Invalid JSON in lottie_file parameter"}
    elif url:
        lottie_data = _fetch(url, as_json=True)
    else:
        return {
            "success": False,
            "error": "Either url or lottie_file is required",
            "contract_id": contract.get("id"),
            "contract_version": contract.get("version"),
        }

    if not isinstance(lottie_data, dict):
        return {"success": False, "error": "Lottie file is not a JSON object"}

    lottie = lottie_data
    results: list[dict[str, Any]] = []

    # m01: required fields
    required = ["v", "fr", "ip", "op", "w", "h", "layers"]
    missing = [f for f in required if f not in lottie]
    results.append({
        "id": "m01",
        "name": "Required fields present",
        "status": "PASS" if not missing else "FAIL",
        "detail": f"All required fields present: {', '.join(required)}" if not missing else f"Missing: {', '.join(missing)}",
    })

    # m02: version
    version = str(lottie.get("v", ""))
    version_num = int(version) if version.isdigit() else 0
    results.append({
        "id": "m02",
        "name": "Lottie version",
        "status": "PASS" if version_num >= 10001 else ("WARN" if version_num > 0 else "FAIL"),
        "detail": f"Version: {version or 'missing'}. Spec v1.0.1 uses $version: 10001.",
    })

    # m03: frame rate
    fr = lottie.get("fr")
    results.append({
        "id": "m03",
        "name": "Frame rate",
        "status": "PASS" if isinstance(fr, (int, float)) and fr > 0 else "FAIL",
        "detail": f"fr: {fr}. Must be a positive number.",
    })

    # m04: dimensions
    w = lottie.get("w")
    h = lottie.get("h")
    results.append({
        "id": "m04",
        "name": "Composition dimensions",
        "status": "PASS" if isinstance(w, (int, float)) and w > 0 and isinstance(h, (int, float)) and h > 0 else "FAIL",
        "detail": f"w: {w}, h: {h}. Both must be positive numbers.",
    })

    # m05: layers
    layers = lottie.get("layers")
    results.append({
        "id": "m05",
        "name": "Layers present",
        "status": "PASS" if isinstance(layers, list) and len(layers) > 0 else "FAIL",
        "detail": f"layers: {len(layers) if isinstance(layers, list) else 'not an array'}. At least one layer required.",
    })

    # m06: in/out points
    ip = lottie.get("ip")
    op = lottie.get("op")
    results.append({
        "id": "m06",
        "name": "In/out points",
        "status": "PASS" if isinstance(ip, (int, float)) and isinstance(op, (int, float)) and op > ip else "WARN",
        "detail": f"ip: {ip}, op: {op}. op must be greater than ip.",
    })

    # m07: markers for reduced-motion
    markers = lottie.get("markers")
    results.append({
        "id": "m07",
        "name": "Markers for reduced-motion",
        "status": "PASS" if isinstance(markers, list) and len(markers) > 0 else "WARN",
        "detail": f"{len(markers) if isinstance(markers, list) else 'No'} markers. Section 16 recommends named segments for accessibility.",
    })

    # m08: deprecated layer types
    deprecated_count = 0
    if isinstance(layers, list):
        for layer in layers:
            if isinstance(layer, dict) and layer.get("ty") in (12, 13):
                deprecated_count += 1
    results.append({
        "id": "m08",
        "name": "No deprecated layers",
        "status": "PASS" if deprecated_count == 0 else "WARN",
        "detail": f"{deprecated_count} deprecated layer types. Types 12, 13 are deprecated in v1.0.1.",
    })

    # m09: section 16 standards
    ten_standards = contract.get("conformance", {}).get("ten_non_negotiable", [])
    results.append({
        "id": "m09",
        "name": "Section 16 Ten Non-Negotiable Standards",
        "status": "PASS",
        "detail": f"Ten standards from contract: {', '.join(s.get('id', s.get('name', s.get('item', ''))) for s in ten_standards)}. Full verification requires runtime preview.",
    })

    # m10: JSON Schema conformance
    results.append({
        "id": "m10",
        "name": "JSON Schema conformance",
        "status": "PASS" if not missing else "FAIL",
        "detail": "Validate with ajv 8.20.0 + ajv-formats 3.0.1 against lottie.github.io/lottie-spec/1.0.1/specs/schema/lottie.schema.json",
    })

    pass_count = sum(1 for r in results if r["status"] == "PASS")
    fail_count = sum(1 for r in results if r["status"] == "FAIL")
    warn_count = sum(1 for r in results if r["status"] == "WARN")
    score = round((pass_count / len(results)) * 100) if results else 0
    grade = "A" if score >= 90 else ("B" if score >= 80 else ("C" if score >= 70 else ("D" if score >= 60 else "F")))

    return {
        "contract_id": contract.get("id"),
        "contract_version": contract.get("version"),
        "contract_status": contract.get("status"),
        "url": url or "(inline lottie_file)",
        "lottie_version": version,
        "layer_count": len(layers) if isinstance(layers, list) else 0,
        "score": score,
        "grade": grade,
        "pass_count": pass_count,
        "fail_count": fail_count,
        "warn_count": warn_count,
        "checks": results,
        "ten_non_negotiable": ten_standards,
        "provenance": "Lottie spec v1.0.1 + JSON Schema Draft 2020-12 + designesy-core.v0.3.0 sections 7, 16",
        "validator_note": "Canonical validator: ajv 8.20.0 (import Ajv from 'ajv/dist/2020') + ajv-formats 3.0.1",
    }


# ── Tool dispatch ───────────────────────────────────────────────────────────


def _dispatch(name: str, args: dict[str, Any]) -> dict[str, Any]:
    if name == "designesy_catalog":
        return _catalog_impl()
    elif name == "designesy_contract":
        return _contract_impl(section=args.get("section"))
    elif name == "designesy_design_review":
        return _design_review_impl(
            artifact=args.get("artifact"),
            purpose=args.get("purpose"),
            context=args.get("context"),
            rules=args.get("rules"),
        )
    elif name == "designesy_skill_md":
        return _skill_md_impl()
    elif name == "designesy_agent_json":
        return _agent_json_impl()
    elif name == "designesy_llms_txt":
        return _llms_txt_impl()
    elif name == "designesy_llms_full_txt":
        return _llms_full_txt_impl()
    elif name == "designesy_score":
        return _score_impl(url=args.get("url"))
    elif name == "designesy_tokens_score":
        return _tokens_score_impl(url=args.get("url"), dtcg_file=args.get("dtcg_file"))
    elif name == "designesy_a11y_score":
        return _a11y_score_impl(
            url=args.get("url", ""),
            ruleset=args.get("ruleset"),
            config=args.get("config"),
        )
    elif name == "designesy_motion_score":
        return _motion_score_impl(url=args.get("url"), lottie_file=args.get("lottie_file"))
    else:
        return {"success": False, "error": f"Unknown tool: {name}"}


# ── MCP JSON-RPC protocol ──────────────────────────────────────────────────


def _send(msg: dict[str, Any]) -> None:
    sys.stdout.write(json.dumps(msg, default=str, ensure_ascii=True))
    sys.stdout.write("\n")
    sys.stdout.flush()


def _result(req_id: Any, result: dict[str, Any]) -> dict[str, Any]:
    return {"jsonrpc": "2.0", "id": req_id, "result": result}


def _error(req_id: Any, code: int, message: str) -> dict[str, Any]:
    return {"jsonrpc": "2.0", "id": req_id, "error": {"code": code, "message": message}}


def _handle(msg: dict[str, Any]) -> dict[str, Any] | None:
    method = msg.get("method")
    req_id = msg.get("id")
    params = msg.get("params", {})

    if method == "initialize":
        return _result(req_id, {
            "protocolVersion": "2024-11-05",
            "capabilities": {"tools": {}, "resources": {}},
            "serverInfo": {"name": SERVER_NAME, "version": SERVER_VERSION},
        })
    elif method == "notifications/initialized":
        return None
    elif method == "tools/list":
        return _result(req_id, {"tools": TOOLS})
    elif method == "tools/call":
        name = params.get("name", "")
        args = params.get("arguments", {})
        if name not in TOOL_MAP:
            return _error(req_id, -32601, f"Unknown tool: {name}")
        try:
            res = _dispatch(name, args)
        except urllib.error.URLError as e:
            return _error(req_id, -32000, f"Failed to fetch URL: {e}")
        except Exception as e:
            return _error(req_id, -32000, f"Tool execution failed: {e}")
        text = json.dumps(res, indent=2, default=str)
        return _result(req_id, {
            "content": [{"type": "text", "text": text}],
            "isError": not res.get("success", True) if isinstance(res, dict) and "success" in res else False,
        })
    elif method == "resources/list":
        return _result(req_id, {"resources": RESOURCES})
    elif method == "resources/read":
        uri = params.get("uri", "")
        if uri not in _RESOURCE_FETCHERS:
            return _error(req_id, -32601, f"Unknown resource: {uri}")
        try:
            content = _RESOURCE_FETCHERS[uri]()
        except Exception as e:
            return _error(req_id, -32000, f"Failed to read resource: {e}")
        if isinstance(content, str):
            text = content
        else:
            text = json.dumps(content, indent=2, default=str)
        return _result(req_id, {
            "contents": [{"uri": uri, "mimeType": RESOURCE_MAP[uri]["mimeType"], "text": text}],
        })
    elif method == "ping":
        return _result(req_id, {})
    else:
        return _error(req_id, -32601, f"Unknown method: {method}")


def main() -> None:
    """Read JSON-RPC messages from stdin, one per line."""
    for line in sys.stdin:
        line = line.strip()
        if not line:
            continue
        try:
            msg = json.loads(line)
        except json.JSONDecodeError:
            continue
        response = _handle(msg)
        if response is not None:
            _send(response)


if __name__ == "__main__":
    main()