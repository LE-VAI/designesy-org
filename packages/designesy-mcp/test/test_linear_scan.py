"""Engine 1.5.1: linear-time scanning returns exactly what the old patterns
returned, in the Python offline engine.

WHY THIS EXISTS
Engine 1.5.1 replaced the regular expressions that read page CSS and HTML by
retrying from every candidate start (or by trying every way to split a run
between two quantifiers) with helpers that read each run once. The TypeScript
engine made the change first (packages/score/test/linear-scan.test.mjs is its
proof); this port follows it. The helpers must not change a single result: no
check, verdict, detail or score may move. For every rewritten call site this
file runs the old pattern, exactly as the port ran it, and the new helper,
exactly as the port now calls it, on the same input, and requires identical
output: the same matches at the same offsets with the same groups, the same
string after the same replace, or the same value.

INPUTS
  (a) every fixture page the offline-engine golden carries (the calibration
      corpus, the recorded parity page and the edge cases) and the
      own-contract site pages; whole, and cut into fragments at braces,
      semicolons and angle brackets;
  (b) at least 10,000 generated strings per site (seeded, so a failure
      reproduces): random tokens from the site's alphabet, mutated samples
      that match, and long repeated runs, with whitespace, quotes, brackets
      and non-ASCII characters mixed in. LINEAR_SCAN_CASES raises the count.
The old patterns live only here, as the reference.

TIME
Each helper is also timed on 100 KB inputs built from long runs of its
alphabet and samples, and must finish well inside a quarter of a second. The
patterns they replaced take seconds to minutes on the worst of those inputs.
"""
from __future__ import annotations

import json
import os
import random
import sys
import time
from pathlib import Path

import pytest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

import designesy_mcp_server as mcp  # noqa: E402

HERE = Path(__file__).resolve().parent
REPO = HERE.parents[2]
J = mcp._js_re
GENERATED = int(os.environ.get("LINEAR_SCAN_CASES", "10000"))
BUDGET_MS = 250.0


# ── The old code, as the port ran it before engine 1.5.1 ─────────────────────


def _all(pat, s):
    return [(m.start(), m.group(0), m.groups()) for m in pat.finditer(s)]


def _scan(items):
    return [tuple(x) for x in items]


def old_css_number(token, percent_scale):
    t = mcp._js_trim(token).lower()
    if t == "none":
        return 0
    m = J(r"^([+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?)(%|deg|turn|rad|grad)?$").search(t)
    if not m:
        return None
    x = mcp._js_float(m.group(1))
    unit = m.group(2)
    if unit == "%":
        return (x / 100) * percent_scale
    if unit == "turn":
        return x * 360
    if unit == "rad":
        return (x * 180) / mcp.math.pi
    if unit == "grad":
        return x * 0.9
    return x


def old_opts_into_motion(body):
    if J(r"@view-transition\s*\{[^}]*navigation\s*:\s*auto", "i").search(body):
        return True
    decl_re = J(
        r"(?:^|[{;\s])(animation|animation-name|animation-duration|transition|transition-property"
        r"|transition-duration|scroll-behavior|view-transition-name)\s*:\s*([^;{}]+)",
        "gi",
    )
    for m in decl_re.finditer(body):
        prop = m.group(1).lower()
        value = mcp._js_trim(J(r"!important", "i").sub("", m.group(2), count=1)).lower()
        if prop == "scroll-behavior":
            if value == "smooth":
                return True
            continue
        if J(r"^(?:none|initial|unset|revert|revert-layer|0|0s|0ms)$").search(value):
            continue
        times = [
            mcp._js_float(t.group(1)) * (1000 if t.group(2) == "s" else 1)
            for t in J(r"(?:^|[\s,(])(\d*\.?\d+)(ms|s)\b", "g").finditer(value)
        ]
        if times and all(t <= 10 for t in times):
            continue
        return True
    return False


def old_check_reduced_motion(css):
    item = "prefers-reduced-motion disables entrance and wordmark breath"
    code = J(r"\/\*[\s\S]*?\*\/", "g").sub("", css)
    mq_re = J(r"@media[^{]*prefers-reduced-motion\s*:\s*(reduce|no-preference)\b[^{]*\{", "gi")
    saw_reduce = saw_opt_in = saw_no_preference = False
    for match in mq_re.finditer(code):
        value = match.group(1).lower()
        open_at = match.end() - 1
        depth = 0
        close_at = -1
        for brace in mcp.re.finditer(r"[{}]", code[open_at:]):
            if brace.group(0) == "{":
                depth += 1
            else:
                depth -= 1
                if depth == 0:
                    close_at = open_at + brace.start()
                    break
        body = mcp._js_trim(code[open_at + 1:close_at]) if close_at > open_at else ""
        if value == "no-preference":
            saw_no_preference = True
            if old_opts_into_motion(body):
                saw_opt_in = True
            continue
        if len(body) > 0:
            saw_reduce = True
    if saw_reduce:
        return mcp._chk("v05", item, "motion", "PASS", "prefers-reduced-motion: reduce block declares rules")
    if saw_opt_in:
        return mcp._chk("v05", item, "motion", "PASS", "motion is opt-in: declared inside a prefers-reduced-motion: no-preference block, so a reduce preference receives none of it")
    if saw_no_preference:
        return mcp._chk(
            "v05", item, "motion", "WARN",
            "a prefers-reduced-motion: no-preference block exists but gates no motion: it is empty, or it "
            "only switches motion off, which stills motion for users with no preference and leaves it running "
            "for users who asked for less. Declare motion inside no-preference, or switch it off inside reduce.",
        )
    return mcp._chk("v05", item, "motion", "WARN", "missing prefers-reduced-motion: reduce media query")


_NO_REDUCED_MOTION = "missing prefers-reduced-motion: reduce media query"


def old_extract_root_tokens(css):
    stripped = J(r"@media[^{]*\{[^@]*?\}\s*\}", "gi").sub("", css)
    tokens = {}
    for block in J(r":root(?:\s*,\s*:host)?\s*\{([^}]*)\}", "g").finditer(stripped):
        for prop in J(r"--([\w-]+)\s*:\s*([^;]+?)(?:;|$)", "g").finditer(block.group(1)):
            tokens[f"--{prop.group(1)}"] = mcp._js_trim(prop.group(2))
    return tokens


def old_rule_selector_at(css, offset):
    open_ = css.rfind("{", 0, offset + 1)
    if open_ < 0 or css.rfind("}", 0, offset + 1) > open_:
        return None
    start = max(css.rfind("}", 0, max(open_, 0)), css.rfind("{", 0, max(open_, 0)), css.rfind(";", 0, max(open_, 0))) + 1
    return css[start:open_]


def old_in_field_rule(css, offset):
    selector = old_rule_selector_at(css, offset)
    if selector is None:
        return False
    clean = J(r"\/\*[\s\S]*?\*\/", "g").sub(" ", selector)
    return bool(J(r"input|textarea|select|\.field", "i").search(clean))


def old_resolve_font_size_vars(css, tokens):
    if "var(" not in css:
        return css

    def decl(m):
        selector = old_rule_selector_at(css, m.start())
        if selector is None or not mcp._is_field_selector(selector):
            return m.group(0)
        sub = mcp._substitute_css_vars(m.group(2), [tokens])
        return m.group(0) if sub is None else m.group(1) + mcp._js_trim(sub)

    return J(r"(font-size\s*:\s*)(var\([^;{}]*\))", "gi").sub(decl, css)


def old_check_input_font_floor(css, html, tokens=None):
    item = "Input font-size ≥16px (prevents iOS Safari auto-zoom)"
    css = old_resolve_font_size_vars(css, tokens or {})
    input_re = J(r"(?:input|textarea|select|\.input|\.field)[^{]*\{[^}]*font-size\s*:\s*(\d+(?:\.\d+)?)(px|rem)", "gi")
    below = []
    for m in input_re.finditer(css):
        if not old_in_field_rule(css, m.start() + m.group(0).rfind("font-size")):
            continue
        val = mcp._js_float(m.group(1))
        unit = m.group(2).lower()
        px = val * 16 if unit == "rem" else val
        if px < 16:
            below.append(f"{mcp._js_num(val)}{unit} ({mcp._js_num(px)}px)")
    if not below:
        floor = r"font-size\s*:\s*(?:1rem|16px|1\.0(?:\d+)?rem|[2-9]\dpx)"
        has_floor = any(
            old_in_field_rule(css, f.start() + f.group(0).rfind("font-size"))
            for f in J(r"input\s*(?:,[^{]*)?\{[^}]*" + floor, "gi").finditer(css)
        )
        if has_floor:
            return mcp._chk("v27", item, "accessibility", "PASS", "input font-size floor detected")
        if not mcp._has_zoomable_field(html):
            return mcp._chk("v27", item, "accessibility", "SKIP", "no text input, textarea or select found in HTML: nothing for the 16px floor to protect")
        return mcp._chk("v27", item, "accessibility", "WARN", "no explicit input font-size ≥16px detected: iOS Safari may auto-zoom on focus")
    return mcp._chk("v27", item, "accessibility", "FAIL", f"{len(below)} input(s) below 16px floor: {', '.join(below)}")


_OLD_PATH_TAIL = mcp.re.compile(r"[.,;:!?)]+$")
_OLD_NPM_CACHE = mcp.re.compile(r"[^\s'\"<>`|]*(?:npm-cache|[\\/]_npx[\\/]|[\\/]\.npm[\\/])[^\s'\"<>`|]*", mcp.re.IGNORECASE)


def _old_label(label, matched):
    tail = _OLD_PATH_TAIL.search(matched)
    return label + (tail.group(0) if tail else "")


def old_scrub_local_paths(text):
    text = mcp._FILE_URL.sub(lambda m: _old_label("a local file", m.group(0)), text)
    text = mcp._UNC_PATH.sub(lambda m: _old_label("a local path", m.group(0)), text)
    text = mcp._DRIVE_PATH.sub(lambda m: _old_label("a local path", m.group(0)), text)
    text = mcp._POSIX_PATH.sub(lambda m: m.group(1) + _old_label("a local path", m.group(0)), text)
    return _OLD_NPM_CACHE.sub(lambda m: _old_label("the npm cache", m.group(0)), text)


def _old_relative(args):
    m = J(r"^from\s+([\s\S]+?)\s+(r\s+g\s+b|h\s+s\s+l|l\s+c\s+h|l\s+a\s+b)\s*(?:\/\s*([\s\S]+))?$").search(args)
    return m.groups() if m else None


def _old_after(p):
    m = J(r"^([\s\S]*?)\s+(\d*\.?\d+)%$").search(p)
    return m.groups() if m else None


TOKENS = {"--text-body": "1rem", "--sm": "14px", "--a": "var(--sm)", "--big": "24px"}


def _rule_offsets(s):
    """The offsets the v27 rule-selector site reads: every offset of a short
    input; a stride and the places beside the first braces and semicolons of
    a long one, since the old reference costs the distance back to the last
    brace or semicolon at each offset."""
    if len(s) <= 2000:
        return list(range(len(s) + 1))
    out = {len(s)}
    out.update(range(0, len(s), -(-len(s) // 500)))
    n = 0
    for i, c in enumerate(s):
        if n >= 500:
            break
        if c in "{};":
            out.update((i, i + 1))
            n += 1
    return sorted(out)


def _new_rule_selectors(s):
    rule_at = mcp._rule_selector_finder(s)
    out = []
    for o in _rule_offsets(s):
        r = rule_at(o)
        if r is not None:
            out.append([o, s[r[0]:r[1]]])
    return out


def _floor_verdict(r):
    """A WARN carries one fixed detail, so None stands for it and a result is
    produced only when a rule is found."""
    return None if r["status"] == "WARN" else [r["status"], r["detail"]]


# ── The sites ─────────────────────────────────────────────────────────────────
#
# One entry per rewritten call site. `old` is the code as the port ran it
# before 1.5.1, `new` the helper as it runs now. Inputs are drawn from
# `alphabet`; `samples` are strings that match, mutated before use; `long`
# adds (prefix, unit, suffix) runs to the timing inputs; `prefix` starts every
# generated input with one of its entries; `anchored` sites read a whole value.

SITES = [
    {
        "id": "script and style strip",
        "old": lambda s: J(r"<style[\s\S]*?<\/style>", "gi").sub("", J(r"<script[\s\S]*?<\/script>", "gi").sub("", s)),
        "new": lambda s: mcp._without_scripts_and_styles(s),
        "samples": ["<script>x</script>", "<style>a{}</style>", "<SCRIPT src=x></Script>"],
        "alphabet": ["<script", "<SCRIPT", "</script>", "</Script>", "<style", "</style>", "<STYLE", "</STYLE>", "<scrip", "</script", "<style>", "x", " ", ">", "<"],
    },
    {
        "id": "CSS comment strip",
        "old": lambda s: [J(r"\/\*[\s\S]*?\*\/", "g").sub("", s), J(r"\/\*[\s\S]*?\*\/", "g").sub(" ", s)],
        "new": lambda s: [mcp._without_css_comments(s, ""), mcp._without_css_comments(s, " ")],
        "replaces": True,
        "samples": ["/* a */", "x/**/y", "/*/ */"],
        "alphabet": ["/*", "*/", "/", "*", "/*/", "a", " ", "**", "//"],
    },
    {
        "id": "inline <style> blocks",
        "old": lambda s: _all(J(r"<style[^>]*>([\s\S]*?)<\/style>", "gi"), s),
        "new": lambda s: _scan(mcp._style_elements(s)),
        "samples": ["<style>a{b:c}</style>", '<style media="x">p{}</STYLE>'],
        "alphabet": ["<style", "<STYLE", "</style>", "</Style>", ">", "<", "x", " ", "<styles", "</styl"],
    },
    {
        "id": "stylesheet <link> hrefs",
        "old": lambda s: _all(J(r"<link[^>]*rel=[\"']?stylesheet[\"']?[^>]*href=[\"']([^\"']+)[\"']", "gi"), s),
        "new": lambda s: _scan(mcp._stylesheet_link_matches(s)),
        "samples": ['<link rel="stylesheet" href="/a.css">', "<link rel=stylesheet href='b.css' >", '<LINK REL="stylesheet" media=x href="c.css" href="d.css">', '<link rel="stylesheet"href=""x">'],
        "long": [["<link rel=stylesheet ", "href='", ""], ["", "<link", "\u2600"]],
        "alphabet": ["<link", "<LINK", " rel=", "rel=", '"stylesheet"', "'stylesheet'", "stylesheet", "styleshee", "href=", 'href="', "href='", '"', "'", "a.css", ">", " ", "x", "<"],
    },
    {
        "id": "@media block strip",
        "old": lambda s: J(r"@media[^{]*\{[^@]*?\}\s*\}", "gi").sub("", s),
        "new": lambda s: mcp._without_media_blocks(s),
        "replaces": True,
        "samples": ["@media x{a{b}}", "@media (y) { a { b } }", ":root{--a:1}@media z{:root{--a:2}  }"],
        "long": [["", "@media{", ""], ["@media{", "}", "@"]],
        "alphabet": ["@media", "@MEDIA", "@", "{", "}", " ", "\n", "x", "}}", "} }", ":root"],
    },
    {
        "id": ":root blocks",
        "old": lambda s: _all(J(r":root(?:\s*,\s*:host)?\s*\{([^}]*)\}", "g"), s),
        "new": lambda s: _scan(mcp._root_token_blocks(s)),
        "samples": [":root{--a:1}", ":root , :host {--b:2}", ":root,:host{}"],
        "long": [["", ":root{", ""], ["", ":root , :host ", ""]],
        "alphabet": [":root", ":ROOT", ",", " ", ":host", "{", "}", "--a:1;", "x"],
    },
    {
        "id": ":root custom properties",
        "old": lambda s: _all(J(r"--([\w-]+)\s*:\s*([^;]+?)(?:;|$)", "g"), s),
        "new": lambda s: _scan(mcp._custom_property_values(s)),
        "samples": ["--a:1;", "--x-y : red", "--b: ;", "--c:", "--d:\t"],
        "long": [["", "--a:", "\u2600"], ["", "--", "\u2600"]],
        "alphabet": ["--", "-", "a", "_", "0", " ", ":", ";", "red", "\t", "x", "\u00e9"],
    },
    {
        "id": "extract :root tokens",
        "old": old_extract_root_tokens,
        "new": lambda s: mcp._extract_root_tokens(s),
        "samples": [":root{--a:1;--b : 2}", "@media x{:root{--a:3}}:root,:host{--c:4}", ":root{--d: x ;}"],
        "alphabet": [":root", "@media", "{", "}", "--a", "--b", ":", ";", " ", "1", "x", ":host", ","],
    },
    {
        "id": "cssNumber",
        "old": lambda s: [old_css_number(s, 1), old_css_number(s, 255)],
        "new": lambda s: [mcp._css_number(s, 1), mcp._css_number(s, 255)],
        "anchored": True,
        "samples": ["1", "1.5", "-.5", "+2.e3", "50%", "10deg", "0.25turn", "3rad", "100grad", "1.", "none", "1e-2"],
        "long": [["", "1", "x"], ["1.", "1", "x"]],
        "alphabet": ["1", "0", "5", ".", "+", "-", "e", "%", "deg", "turn", "rad", "grad", " ", "x", "none"],
    },
    {
        "id": "color-mix() percent after",
        "old": _old_after,
        "new": lambda s: mcp._percent_after(s),
        "anchored": True,
        "samples": ["red 50%", "var(--x)  12.5%", " .5%", "red\t1.%"],
        "long": [["", " ", "x"], ["", " 1", "%"], ["a", "1", "%"]],
        "alphabet": [" ", "\t", "0", "5", ".", "%", "red", "x"],
    },
    {
        "id": "color-mix() percent before",
        "old": lambda s: (lambda m: m.groups() if m else None)(J(r"^(\d*\.?\d+)%\s+([\s\S]*)$").search(s)),
        "new": lambda s: (lambda m: m.groups() if m else None)(J(r"^(\d+(?:\.\d+)?|\.\d+)%\s+([\s\S]*)$").search(s)),
        "anchored": True,
        "samples": ["50% red", "12.5%  var(--x)", ".5% x", "1.% x"],
        "long": [["", "0", "x"]],
        "alphabet": [" ", "\t", "0", "5", ".", "%", "red", "x"],
    },
    {
        "id": "relative colour",
        "old": _old_relative,
        "new": lambda s: mcp._relative_color_match(s),
        "anchored": True,
        "prefix": ["from", "from ", "from  ", "from   ", "from\t", "from    "],
        "samples": ["from red r g b", "from var(--x) l c h / 0.5", "from  red  h s l /", "from #fff l a b/ .2", "from   l a b"],
        "long": [["from ", " ", "x"], ["from x", " r g b", "x"]],
        "alphabet": [" ", "\t", "r", "g", "b", "h", "s", "l", "c", "a", "/", "x", "red", "r g b", "l c h", "l a b", "h s l", "0.5"],
    },
    {
        "id": "@view-transition navigation",
        "old": lambda s: bool(J(r"@view-transition\s*\{[^}]*navigation\s*:\s*auto", "i").search(s)),
        "new": lambda s: mcp._has_view_transition_navigation(s),
        "samples": ["@view-transition{navigation:auto}", "@view-transition {\n navigation : auto; }"],
        "long": [["", "@view-transition{", ""], ["@view-transition{", "navigation", ""]],
        "alphabet": ["@view-transition", "@VIEW-TRANSITION", "{", "}", "navigation", ":", "auto", " ", "x", ";"],
    },
    {
        "id": "motion times",
        "old": lambda s: _all(J(r"(?:^|[\s,(])(\d*\.?\d+)(ms|s)\b", "g"), s),
        "new": lambda s: _all(J(r"(?:^|[\s,(])(\d+(?:\.\d+)?|\.\d+)(ms|s)\b", "g"), s),
        "samples": ["opacity 200ms ease", "all .3s", "x 1.5s, y 10ms", "(0.2s)"],
        "long": [["", "1", "x"], [" ", "1", "x"]],
        "alphabet": [" ", ",", "(", "0", "1", ".", "5", "ms", "s", "x", "m"],
    },
    {
        "id": "v05 motion opt-in",
        "old": old_opts_into_motion,
        "new": lambda s: mcp._opts_into_motion(s),
        "samples": ["a{animation: fade 1s}", "transition: none", "scroll-behavior: smooth", "@view-transition{navigation:auto}", "transition: opacity 5ms !important"],
        "alphabet": ["animation", "transition", "scroll-behavior", "view-transition-name", ":", ";", "{", "}", " ", "none", "0s", "10ms", "1s", "smooth", "!important", "x", "@view-transition", "navigation:auto"],
    },
    {
        "id": "reduced-motion queries",
        "old": lambda s: _all(J(r"@media[^{]*prefers-reduced-motion\s*:\s*(reduce|no-preference)\b[^{]*\{", "gi"), s),
        "new": lambda s: _scan(mcp._reduced_motion_queries(s)),
        "samples": ["@media (prefers-reduced-motion: reduce){a{}}", "@media screen and (prefers-reduced-motion:no-preference) {", "@media(prefers-reduced-motion : reduce)and x{"],
        "long": [["", "@media", "\u2600"], ["@media ", "prefers-reduced-motion:reduce ", ""]],
        "alphabet": ["@media", "prefers-reduced-motion", ":", " ", "reduce", "no-preference", "REDUCE", "x", "reduced", "{", "}", "(", ")", "and"],
    },
    {
        "id": "v05 reduced motion",
        "old": old_check_reduced_motion,
        "new": lambda s: mcp._check_reduced_motion(s),
        "samples": [
            "@media (prefers-reduced-motion: reduce){*{animation:none}}",
            "@media (prefers-reduced-motion: no-preference){a{transition: opacity .2s}}",
            "@media (prefers-reduced-motion: no-preference){@media (prefers-reduced-motion: no-preference){a{animation:x 1s}}}",
            "/* @media (prefers-reduced-motion: reduce){a{b:c}} */",
        ],
        "long": [["", "@media (prefers-reduced-motion: no-preference){", ""]],
        "alphabet": ["@media", "(prefers-reduced-motion: reduce)", "(prefers-reduced-motion: no-preference)", "{", "}", "a", "animation: x 1s", "transition: none", ";", " ", "/*", "*/"],
    },
    {
        "id": "<title> text",
        "old": lambda s: bool(J(r"<title\b[^>]*>[^<]+<\/title>", "i").search(s)),
        "new": lambda s: mcp._has_title_text(s),
        "samples": ["<title>x</title>", "<TITLE lang=en>Home</Title>"],
        "long": [["", "<title", ""], ["", "<title>", ""]],
        "alphabet": ["<title", "<TITLE", "<titles", "</title>", "</TITLE>", ">", "<", "x", " "],
    },
    {
        "id": "@keyframes strip",
        "old": lambda s: J(r"@keyframes\s+[^{]+\{[^@]*?\}", "gi").sub("", s),
        "new": lambda s: mcp._without_keyframes_blocks(s),
        "replaces": True,
        "samples": ["@keyframes a{0%{opacity:0}}", "@keyframes  spin {to{transform:rotate(1turn)}}", "@keyframes x\n{}"],
        "long": [["", "@keyframes x{", ""], ["@keyframes ", "\u00a0", "\u2600"]],
        "alphabet": ["@keyframes", "@KEYFRAMES", " ", "\t", "x", "{", "}", "@", "0%", "opacity:0"],
    },
    {
        "id": "heading line-height",
        "old": lambda s: _all(J(r"(?:h1|h2|h3|h4|h5|h6|\.h\d|heading|title)[^{]*\{[^}]*line-height\s*:\s*([0-9.]+)", "gi"), s),
        "new": lambda s: _scan(mcp._heading_line_heights(s)),
        "samples": ["h1{line-height:1.1}", ".title{color:red;line-height: 1.05;}"],
        "long": [["h1{", "line-height", ""], ["", "h1", "\u2600"]],
        "alphabet": ["h1", "H2", ".h3", "heading", "title", "{", "}", "line-height", "LINE-HEIGHT", ":", " ", "1.2", ".", "0", ";", "x", "line-height:1.1;"],
    },
    {
        "id": "body line-height",
        "old": lambda s: _all(J(r"(?:body|p|article|\.body|\.prose|\.copy)[^{]*\{[^}]*line-height\s*:\s*([0-9.]+)", "gi"), s),
        "new": lambda s: _scan(mcp._body_line_heights(s)),
        "samples": ["p{line-height:1.5}", "body{line-height :1.6}"],
        "long": [["p{", "line-height", ""], ["", "p", "\u2600"]],
        "alphabet": ["body", "p", "P", "article", ".prose", ".copy", "{", "}", "line-height", ":", " ", "1.5", ";", "x", "line-height: 1.6"],
    },
    {
        "id": "::selection rules",
        "old": lambda s: [m.group(0) for m in J(r"::selection\s*\{[^}]*\}", "gi").finditer(s)],
        "new": lambda s: mcp._selection_rules(s),
        "samples": ["::selection{background:var(--signal)}", "a::SELECTION {color:red}"],
        "long": [["", "::selection{", ""], ["", "::selection ", ""]],
        "alphabet": ["::selection", "::SELECTION", "::selectio", " ", "{", "}", "color:red", "x"],
    },
    {
        "id": "<input> tags",
        "old": lambda s: [m.group(0) for m in J(r"<input\b[^>]*>", "gi").finditer(s)],
        "new": lambda s: mcp._input_tags(s),
        "samples": ['<input type="text">', "<INPUT\nhidden>"],
        "long": [["", "<input", ""], ["", "<input ", ">"]],
        "alphabet": ["<input", "<INPUT", "<inputs", " ", ">", 'type="text"', "x"],
    },
    {
        "id": "font-size var() declarations",
        "old": lambda s: [(m.start(), m.group(0), m.groups()) for m in J(r"(font-size\s*:\s*)(var\([^;{}]*\))", "gi").finditer(s)],
        "new": lambda s: _scan(mcp._font_size_var_matches(s)),
        "samples": ["input{font-size:var(--text-body)}", "font-size : VAR(--a) ;", "font-size:var(--b, calc(1px))"],
        "long": [["", "font-size:var(", ""], ["", "font-size:", ""]],
        "alphabet": ["font-size", "FONT-SIZE", ":", " ", "var(", "VAR(", "--a", ")", "(", ";", "{", "}", "x"],
    },
    {
        "id": "v27 font-size var() resolution",
        "old": lambda s: old_resolve_font_size_vars(s, TOKENS),
        "new": lambda s: mcp._resolve_font_size_vars(s, TOKENS),
        "samples": ["input{font-size:var(--text-body)}", ".field{font-size: var(--a)}", "p{font-size:var(--sm)}", "select, .x{font-size:var(--missing)}"],
        "alphabet": ["input", ".field", "select", "p", "{", "}", "font-size", ":", "var(--text-body)", "var(--a)", "var(--sm)", ";", " ", ",", "/*", "*/"],
    },
    {
        "id": "field font-size",
        "old": lambda s: _all(J(r"(?:input|textarea|select|\.input|\.field)[^{]*\{[^}]*font-size\s*:\s*(\d+(?:\.\d+)?)(px|rem)", "gi"), s),
        "new": lambda s: _scan(mcp._field_font_sizes(s)),
        "samples": ["input{font-size:14px}", ".field{font-size:0.875rem}"],
        "long": [["input{", "font-size", ""], ["", ".input", "\u2600"]],
        "alphabet": ["input", "textarea", ".field", "select", "{", "}", "font-size", ":", " ", "14", ".5", "px", "rem", "REM", ";", "x", "font-size:12px"],
    },
    {
        "id": "field font-size floor",
        "old": lambda s: _all(J(r"input\s*(?:,[^{]*)?\{[^}]*font-size\s*:\s*(?:1rem|16px|1\.0(?:\d+)?rem|[2-9]\dpx)", "gi"), s),
        "new": lambda s: _scan(mcp._field_font_floors(s)),
        "samples": ["input{font-size:1rem}", "input, textarea{font-size:16px}", "input ,select{color:red;font-size: 24px}", "input\n{font-size:1.05rem}"],
        "long": [["input{", "font-size", ""], ["", "input,", ""]],
        "alphabet": ["input", "INPUT", ",", " ", "\n", "{", "}", "font-size", ":", "1rem", "16px", "1.05rem", "24px", "9px", "x", ";", "textarea"],
    },
    {
        "id": "v08 hover guard",
        "old": lambda s: bool(J(r"@media[^{]*(?:hover\s*:\s*hover|pointer\s*:\s*fine)", "i").search(s)),
        "new": lambda s: mcp._media_query_has_hover_guard(s),
        "samples": ["@media (hover: hover){a{}}", "@media (pointer:fine) and x {"],
        "long": [["", "@media", "\u2600"], ["", "@media ", "pointer"]],
        "alphabet": ["@media", "hover", "pointer", ":", " ", "fine", "{", "}", "x"],
    },
    {
        "id": "v08 breath keyframes",
        "old": lambda s: bool(J(r"@keyframes\s+[^{]*breath[^{]*\{[^}]*opacity\s*:", "i").search(s)),
        "new": lambda s: mcp._has_breath_keyframes(s),
        "samples": ["@keyframes breath{0%{opacity:0}}", "@keyframes  wordmark-breath {from{opacity: 1}}"],
        "long": [["@keyframes\t", "\t", ""], ["@keyframes breath{", "opacity", ""]],
        "alphabet": ["@keyframes", "@KEYFRAMES", " ", "\t", "breath", "BREATH", "x", "{", "}", "opacity", ":", "0%", ";"],
    },
    {
        "id": "v09 focus strips outline",
        "old": lambda s: bool(J(r":focus[^{]*\{[^}]*outline\s*:\s*(none|0)\s*[;}]", "i").search(s)),
        "new": lambda s: mcp._focus_strips_outline(s),
        "samples": [":focus{outline:none}", "a:focus-visible { outline : 0 ; }"],
        "long": [[":focus{", "outline", ""], ["", ":focus", "\u2600"]],
        "alphabet": [":focus", "{", "}", "outline", ":", "none", "0", ";", " ", "x", "2px"],
    },
    {
        "id": "v09 focus ring",
        "old": lambda s: bool(J(r":focus[^{]*\{[^}]*(box-shadow|outline\s*:\s*[^n0])", "i").search(s)),
        "new": lambda s: mcp._focus_has_ring(s),
        "samples": [":focus{box-shadow:0 0 0 2px}", "a:focus{outline:2px solid}"],
        "long": [[":focus{", "outline", ""], ["", ":focus", "\u2600"]],
        "alphabet": [":focus", "{", "}", "outline", "box-shadow", ":", "none", "0", ";", " ", "x", "n", "2px"],
    },
    {
        "id": "v10 transform ease-out",
        "old": lambda s: bool(J(r"transition\s*:[^;]*transform[^;]*(ease-out|cubic-bezier\([^)]*0[, ])", "i").search(s)),
        "new": lambda s: mcp._has_transform_ease_transition(s),
        "samples": ["transition: transform .2s ease-out", "transition:transform 1s cubic-bezier(0, 0, .2, 1)", "transition: transform cubic-bezier(.2,.8,.2,1)"],
        "long": [["transition:", "transform", ""], ["transition: transform ", "cubic-bezier(", ""], ["", "transition:", "\u2600"]],
        "alphabet": ["transition", ":", "transform", "ease-out", "cubic-bezier(", ")", "0", "0,", "0 ", ",", ";", " ", "x", ".2"],
    },
    {
        "id": "error text trailing punctuation",
        "old": lambda s: (lambda m: m.group(0) if m else "")(_OLD_PATH_TAIL.search(s)),
        "new": lambda s: mcp._path_tail(s),
        "samples": ["C:/x/y.txt.", "a)!", "b..\n", "c?).\n"],
        "long": [["", ".", "\u2600"], ["", ".a", ""], ["x", ")", "\n"]],
        "alphabet": [".", ",", ";", ":", "!", "?", ")", "x", " ", "\n", "("],
    },
    {
        "id": "error text npm cache",
        "old": lambda s: _OLD_NPM_CACHE.sub(lambda m: _old_label("the npm cache", m.group(0)), s),
        "new": lambda s: mcp._without_npm_cache(s),
        "replaces": True,
        "samples": ["at C:/x/npm-cache/_npx/a.js:1.", "/home/u/.npm/x).", "see \\_npx\\y,"],
        "long": [["", "a", "\u2600"], ["", "npm-cach", ""]],
        "alphabet": ["npm-cache", "NPM-CACHE", "/_npx/", "\\_npx\\", "/.npm/", "npm", "/", "\\", " ", "'", "|", "`", "x", ".", ")", "\u2028", "\x1c", "\x85"],
    },
    {
        "id": "v27 rule selector",
        "old": lambda s: [[o, sel] for o in _rule_offsets(s) if (sel := old_rule_selector_at(s, o)) is not None],
        "new": _new_rule_selectors,
        "samples": ["input{font-size:12px}", "a;b{c}d{e;f}", "{x}", ".field , select/* c */{font-size:1rem;color:red}", "}{"],
        "alphabet": ["{", "}", ";", "input", ".field", " ", "x", "font-size:12px", "/*", "*/", ","],
    },
    {
        "id": "v27 input font floor",
        "old": lambda s: _floor_verdict(old_check_input_font_floor(s, "<input>", TOKENS)),
        "new": lambda s: _floor_verdict(mcp._check_input_font_floor(s, "<input>", TOKENS)),
        "samples": ["input{font-size:12px}", ".field{font-size:var(--sm)}", "input,textarea{font-size:1rem}", ".chip{user-select:none}.chip-label{font-size:12px}", "select{font-size:var(--text-body)}", "input{color:red;font-size:14px}"],
        "alphabet": ["input", "textarea", "select", ".field", ".chip", "user-select:none", "{", "}", ";", ":", " ", ",", "font-size", "font-size:12px", "font-size:1rem", "var(--a)", "var(--sm)", "14px", "16px", "/*", "*/"],
    },
    {
        "id": "error text",
        "old": old_scrub_local_paths,
        "new": lambda s: mcp._scrub_local_paths(s),
        "replaces": True,
        "samples": ["No such file C:\\Users\\a\\b.txt.", "file:///tmp/x!)", "/home/u/proj/x.js:1:2,", "\\\\srv\\share\\f).", "x/npm-cache/y..\n"],
        "long": [["file://", "!", "x"], ["", ".", "\u2600"], ["C:/", "a", ""]],
        "alphabet": ["C:", "\\", "/", "file://", "/home", "/tmp", "npm-cache", ".", ",", ")", "!", " ", "\n", "x", "Users", "\\\\"],
    },
]


# ── Inputs ────────────────────────────────────────────────────────────────────

WS = [" ", "\t", "\n", "\r", "\u00a0", "\u2028", "\ufeff", "  ", "\x1c", "\x85"]
ODD = ["\u00e9", "\u017f", "\u212a", "\u0130", "\u0131", "\U0001f600", "\u2600", "\ufe0f", "\u2b50", "_", "0", "9", "x", "A", "Z", "#", "%", "!", ".", ",", ";", ":", "(", ")", "{", "}", "[", "]", "<", ">", "/", "\\", '"', "'", "=", "-", "+", "*", "@", "`", "|", "&"]


def generator(site, rand):
    """Generated inputs for one site: tokens, mutated samples, and repeated runs."""
    alphabet = site["alphabet"]
    samples = site.get("samples")

    def tokens(n):
        toks = alphabet if rand.random() < 0.85 else alphabet + WS + ODD
        return "".join(rand.choice(WS) if rand.random() < 0.15 else rand.choice(toks) for _ in range(n))

    def mutate(s):
        for _ in range(int(rand.random() * 4)):
            at = int(rand.random() * (len(s) + 1))
            r = rand.random()
            if r < 0.4:
                s = s[:at] + tokens(1 + int(rand.random() * 2)) + s[at:]
            elif r < 0.7:
                s = s[:at] + s[at + 1 + int(rand.random() * 3):]
            elif r < 0.85:
                b = int(rand.random() * (len(s) + 1))
                x, y = (at, b) if at < b else (b, at)
                s = s[:y] + s[x:y] + s[y:]
            else:
                s = s[:at] + rand.choice(WS) + s[at:]
        return s

    def nxt():
        r = rand.random()
        s = rand.choice(site["prefix"]) if site.get("prefix") else ""
        if samples and site.get("anchored") and r < 0.3:
            return s + mutate(rand.choice(samples))
        if samples and r < 0.55:
            for _ in range(1 + int(rand.random() * 4)):
                s += tokens(int(rand.random() * 4)) + mutate(rand.choice(samples))
            return s + tokens(int(rand.random() * 4))
        if r < 0.62:
            unit = tokens(1 + int(rand.random() * 3))
            return s + tokens(int(rand.random() * 3)) + unit * (2 + int(rand.random() * 12)) + tokens(int(rand.random() * 3))
        return s + tokens(int(rand.random() * (12 if r < 0.8 else 40)))

    return nxt


def fixture_pages():
    """The golden's pages (corpus, parity page, edge cases) and the own-contract site pages."""
    with (HERE / "fixtures" / "offline-engine-golden.json").open(encoding="utf-8") as f:
        golden = json.load(f)
    pages = []
    for case in golden["case_detail"]:
        if "input_ref" in case:
            with (REPO / case["input_ref"]).open(encoding="utf-8") as f:
                page = json.load(f)
            pages.append((page["html"], page["css"]))
        else:
            pages.append((case["html"], case["css"]))
    sites = REPO / "apps" / "site" / "scripts" / "fixtures" / "own-contract" / "sites"
    if sites.is_dir():
        for html in sorted(sites.glob("*.html")):
            css = html.with_suffix(".css")
            pages.append((html.read_text(encoding="utf-8"), css.read_text(encoding="utf-8") if css.exists() else ""))
    return pages


def fixture_inputs(pages):
    """Each page whole, and its fragments between braces, semicolons and angle brackets."""
    out = {}
    for html, css in pages:
        out[html] = None
        out[css] = None
        for piece in mcp.re.split(r"[{};]", css):
            if len(piece) < 2000:
                out[piece] = None
        for piece in mcp.re.split(r"[<>]", html):
            if len(piece) < 2000:
                out[piece] = None
    return list(out)


PAGES = fixture_pages()
INPUTS = fixture_inputs(PAGES)


def run(f, s):
    try:
        return f(s)
    except Exception as e:  # noqa: BLE001 - a throw must match a throw
        return f"threw {type(e).__name__}: {e}"


def produced(site, result, s):
    """Whether the old code found something in `s`: a replacement, a match, a true."""
    if isinstance(result, str):
        return result != s
    if isinstance(result, bool):
        return result
    if isinstance(result, list):
        if site.get("replaces"):
            return any(r != s for r in result)
        return len(result) > 0 and any(r not in (None, []) for r in result)
    if isinstance(result, dict):
        if site["id"] == "v05 reduced motion":
            return result["detail"] != _NO_REDUCED_MOTION
        return len(result) > 0
    return result is not None


# ── Tests ─────────────────────────────────────────────────────────────────────


def test_js_whitespace_set_matches_the_regex_class_on_every_code_point():
    ws = J(r"\s")
    for c in range(0x110000):
        ch = chr(c)
        assert (ch in mcp._JS_WS_SET) == bool(ws.match(ch)), f"\\s at {c:#x}"


def test_name_run_and_digits_match_their_regex_classes():
    name = J(r"[\w-]")
    digit = J(r"[0-9]")
    for c in range(0x10000):
        ch = chr(c)
        assert (mcp._name_end(ch, 0) == 1) == bool(name.match(ch)), f"[\\w-] at {c:#x}"
        assert (ch in "0123456789") == bool(digit.match(ch)), f"[0-9] at {c:#x}"


def test_the_fixture_pages_are_read():
    assert len(PAGES) >= 150
    assert len(INPUTS) >= 1000


@pytest.mark.parametrize("site", SITES, ids=[s["id"] for s in SITES])
def test_identical_on_fixture_pages_and_generated_inputs(site):
    for s in INPUTS:
        a = run(site["old"], s)
        b = run(site["new"], s)
        assert a == b, f"fixture input differs ({len(s)} chars): {s[:200]!r}"
    rand = random.Random(0x5EED + len(site["id"]) * 7919)
    nxt = generator(site, rand)
    changed = 0
    for k in range(GENERATED):
        s = nxt()
        a = run(site["old"], s)
        b = run(site["new"], s)
        assert a == b, f"generated input {k} differs: {s!r}\nold {a!r}\nnew {b!r}"
        if produced(site, a, s):
            changed += 1
    # The generated inputs must exercise the pattern, not only miss it.
    assert changed >= GENERATED // 100, f"only {changed} generated inputs produced a result"


SIZE = 100_000


def _build(pre, unit, suf):
    reps = (SIZE - len(pre)) // max(1, len(unit)) + 1
    return (pre + unit * reps)[:SIZE] + suf


@pytest.mark.parametrize("site", SITES, ids=[s["id"] for s in SITES])
def test_each_helper_reads_100_kb_quickly(site):
    pre = site["prefix"][-1] if site.get("prefix") else ""
    units = []
    for a in site["alphabet"]:
        units += [(pre, a, ""), (pre, a + " ", "")]
    for x in site.get("samples") or []:
        units += [(pre, x, ""), (pre, x[: (len(x) + 1) // 2], "")]
    units += [tuple(u) for u in site.get("long") or []]
    worst = 0.0
    worst_unit = None
    for u in units:
        s = _build(*u)
        best = float("inf")
        for _ in range(2):
            t0 = time.perf_counter()
            site["new"](s)
            best = min(best, (time.perf_counter() - t0) * 1000)
        if best > worst:
            worst, worst_unit = best, u
    assert worst < BUDGET_MS, f"{site['id']} took {worst:.1f} ms on 100 KB of {worst_unit!r}"
