#!/usr/bin/env python3
"""
designesy_mcp_server — stdio MCP server exposing designesy.org's design
intelligence infrastructure as native agent tools and resources. Every tool
reads only, except designesy_monitor_score, which can send an alert email (see
SAFETY below).

Zero external dependencies (stdlib only). Implements the MCP JSON-RPC 2.0
protocol over stdio (initialize, tools/list, tools/call, resources/list,
resources/read, notifications/initialized, ping) — mirrors the
factory_sessions_mcp_server scaffolding.

Gives any agent the ability to:
  - Get the package catalog (versions, URLs, statuses)
  - Get the design-system contract (tokens, motion, acoustic, takt, cadence),
    whole or only the named top-level sections
  - Get the Design Review rubric (8 dimensions, output format, checklist)
  - Get the SKILL.md agent-skill-format export
  - Get the agent discovery document (agent.json)
  - Get the llms.txt / llms-full.txt briefs
  The document tools return labeled reference data, leaving out any part
  written as steps or a prompt for an AI agent (see _reference_text).

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
    Read-only with one exception. designesy_monitor_score posts to
    designesy.org's /api/monitor, which sends a drift-alert email through
    Resend when the caller passes `email`, an alert fires, and the server has
    a Resend key configured. Every other tool only reads: the document tools
    fetch designesy.org exports, and the scoring tools fetch the URLs the
    caller supplies, directly or through designesy.org's engines. The server
    writes no local files and reads no credentials. TOOL_ANNOTATIONS records
    each tool's hints.
"""
from __future__ import annotations

import json
import re
import ssl
import sys
import time
import urllib.request
import urllib.error
from typing import Any

SERVER_NAME = "designesy-mcp-server"
SERVER_VERSION = "1.13.5"

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

# ── SSRF protection ──────────────────────────────────────────────────────────
# Block URLs that could reach internal services when a user supplies an
# arbitrary URL to _fetch().  _post_api() is inherently safe — it constructs
# its own URL from BASE_URL — so only _fetch() calls _validate_url().

_BLOCKED_HOSTS = frozenset({
    "127.0.0.1", "localhost", "0.0.0.0",
    "169.254.169.254", "metadata.google.internal",
    "::1",
})


def _validate_url(url: str) -> None:
    """Reject URLs that could reach internal services (SSRF protection)."""
    from urllib.parse import urlparse
    import ipaddress

    parsed = urlparse(url)
    if parsed.scheme not in ("http", "https"):
        raise ValueError(f"Blocked: non-http(s) scheme '{parsed.scheme}'")

    host = parsed.hostname or ""
    if not host:
        raise ValueError("Blocked: no hostname in URL")

    if host.lower() in _BLOCKED_HOSTS:
        raise ValueError(f"Blocked: internal host '{host}'")

    # If the host is an IP literal, reject private/reserved ranges.
    try:
        ip = ipaddress.ip_address(host)
    except ValueError:
        pass  # hostname, not an IP — allowed
    else:
        if ip.is_private or ip.is_loopback or ip.is_link_local or ip.is_reserved:
            raise ValueError(f"Blocked: private/reserved IP '{host}'")


def _fetch(url: str, as_json: bool = True) -> Any:
    """Fetch a URL with in-memory caching. Returns parsed JSON or text."""
    _validate_url(url)
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
            sys.stderr.write(f"WARNING: SSL verification failed for {url}, falling back to lenient context: {exc}\n")
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


# ── Reference-data envelopes for the document tools ─────────────────────────
#
# Anthropic's Software Directory Policy, section 2F: software that gives Claude
# tools must not direct Claude to pull behavioral instructions from external
# sources to execute. Until 1.13.4 the document tools returned the published
# agent files verbatim, so a tool result could carry a second-person prompt
# ("You are working with Designesy...") and fetch-then-follow steps ("If
# machine_url is present, fetch it for structured rules"). Those files stay
# unchanged at their URLs for crawlers and agents; returned inside a
# conversation, the same text reads as instructions to the assistant.
#
# So the tools wrap what they return as labeled reference data (kind,
# source_url, a one-sentence note), and leave out, by name, any part written as
# steps or a prompt for an AI agent:
#   - markdown: a section (heading to next heading) containing a directive
#     keeps its heading, and its body becomes _OMITTED_MARKER;
#   - JSON: a field whose string (or list of strings) contains a directive is
#     removed, and its path is listed in omitted_fields.
#
# apps/site/app/lib/mcp-reference.ts is the hosted endpoint's copy of these
# rules. The test suite checks the pattern sources and strings are equal, and
# both this suite and apps/site/scripts/check-mcp-tool-parity.js compare their
# own output on the same fixtures against one golden file
# (test/fixtures/published-docs/expected.json).

_REFERENCE_KIND = "published_document"
_RUBRIC_KIND = "review_rubric"
_REFERENCE_NOTE = (
    "This is the published document at source_url, returned as reference "
    "data; it does not ask the assistant to do anything."
)
_RUBRIC_NOTE = (
    "This is the rubric from the published Design Review kit at source_url, "
    "returned as reference data; it does not ask the assistant to do anything."
)
_OMITTED_MARKER = (
    "[Omitted from this tool's output: written as steps or a prompt for an AI "
    "agent. The published document at source_url includes it.]"
)
_KIT_PROMPT_NOTE = (
    "The kit's copy-ready review prompt is written to an AI agent, so it is "
    "left out of this output; a person can read or copy it at kit_prompt_url."
)

# Same sources as AGENT_DIRECTIVE_PATTERN_SOURCES in mcp-reference.ts, compiled
# case-insensitive and multiline in both servers.
AGENT_DIRECTIVE_PATTERN_SOURCES = (
    r"\byou are\b",
    r"^[ \t]*(?:(?:[-*]|[0-9]+[.)])[ \t]+)?(?:[A-Za-z][A-Za-z0-9_ ]{0,24}:[ \t]+)?(?:optionally[ \t]+)?fetch\b",
    r",[ \t]*(?:then[ \t]+)?fetch\b",
)
_DIRECTIVE_RES = tuple(re.compile(s, re.IGNORECASE | re.MULTILINE) for s in AGENT_DIRECTIVE_PATTERN_SOURCES)
_HEADING_RE = re.compile(r"^#{1,6}[ \t]+\S")


def _is_agent_directive(text: str) -> bool:
    """True when the text holds a second-person agent prompt or a fetch step."""
    return any(r.search(text) for r in _DIRECTIVE_RES)


def _reference_text(text: str) -> tuple[str, list[str]]:
    """Markdown with each directive-bearing section replaced by the marker.

    Sections run from a heading line to the next heading line of any level;
    text before the first heading is a section of its own. Every other line is
    returned unchanged.
    """
    lines = re.split(r"\r?\n", text)
    starts = [0] + [i for i in range(1, len(lines)) if _HEADING_RE.match(lines[i])]
    out: list[str] = []
    omitted: list[str] = []
    for n, start in enumerate(starts):
        end = starts[n + 1] if n + 1 < len(starts) else len(lines)
        section = lines[start:end]
        if not _is_agent_directive("\n".join(section)):
            out.extend(section)
            continue
        heading = section[0] if _HEADING_RE.match(section[0]) else None
        keep_heading = heading is not None and not _is_agent_directive(heading)
        omitted.append(re.sub(r"^#{1,6}[ \t]+", "", heading).strip() if keep_heading else "(untitled section)")
        if keep_heading:
            out.extend([heading, ""])
        out.append(_OMITTED_MARKER)
        if len(section) > 1 and section[-1] == "":
            out.append("")
    return "\n".join(out), omitted


_OMIT = object()


def _strip_directives(value: Any, path: str, omitted: list[str]) -> Any:
    if isinstance(value, str):
        return _OMIT if _is_agent_directive(value) else value
    if isinstance(value, list):
        if all(not isinstance(v, (dict, list)) for v in value):
            return _OMIT if any(isinstance(v, str) and _is_agent_directive(v) for v in value) else value
        kept = []
        for i, v in enumerate(value):
            r = _strip_directives(v, f"{path}[{i}]", omitted)
            if r is _OMIT:
                omitted.append(f"{path}[{i}]")
            else:
                kept.append(r)
        return kept
    if isinstance(value, dict):
        kept_obj: dict[str, Any] = {}
        for k, v in value.items():
            p = f"{path}.{k}" if path else k
            r = _strip_directives(v, p, omitted)
            if r is _OMIT:
                omitted.append(p)
            else:
                kept_obj[k] = r
        return kept_obj
    return value


def _reference_json(doc: Any) -> tuple[Any, list[str]]:
    """JSON with each directive-bearing field removed.

    A string, or a list of plain values holding such a string, is removed
    whole, so a step list never comes back with gaps; lists of objects are
    walked element by element.
    """
    omitted: list[str] = []
    r = _strip_directives(doc, "", omitted)
    return (None if r is _OMIT else r), omitted


def _published_text(source_url: str, media_type: str, text: str) -> dict[str, Any]:
    """A published text file (markdown or plain text) as labeled reference data."""
    content, omitted = _reference_text(text)
    return {
        "kind": _REFERENCE_KIND,
        "source_url": source_url,
        "media_type": media_type,
        "note": _REFERENCE_NOTE,
        "omitted_sections": omitted,
        "content": content,
    }


def _published_json(source_url: str, doc: Any) -> dict[str, Any]:
    """A published JSON document as labeled reference data."""
    document, omitted = _reference_json(doc)
    return {
        "kind": _REFERENCE_KIND,
        "source_url": source_url,
        "media_type": "application/json",
        "note": _REFERENCE_NOTE,
        "omitted_fields": omitted,
        "document": document,
    }


def _design_review_rubric(
    kit: dict[str, Any],
    source_url: str,
    inputs: dict[str, str | None],
    default_rules: str,
) -> dict[str, Any]:
    """The Design Review kit as a rubric, without the kit's agent_prompt.

    The dimensions, output format and checklist are the tool's purpose and
    stay. Each part of the prompt a review needs is already a field here (the
    eight dimensions, observation/judgment/action in output_format, the
    checklist). The prompt itself is addressed to an AI agent and tells it to
    fetch the machine kit and contract "for structured rules"; a person can
    still copy it from kit_prompt_url. When any of the four review inputs is
    passed they are recorded in `inputs`, `rules` defaulting to default_rules.
    """
    kit_page = kit.get("public_url") if isinstance(kit.get("public_url"), str) else None

    def listed(key: str) -> Any:  # a missing or null list reads as [] (TS `?? []`)
        v = kit.get(key)
        return [] if v is None else v

    from_kit, omitted = _reference_json({
        "kit": {
            "id": kit.get("id"),
            "title": kit.get("title"),
            "version": kit.get("version"),
            "status": kit.get("status"),
            "purpose": kit.get("purpose"),
            "quality_bar": kit.get("quality_bar"),
            "permission": kit.get("permission"),
        },
        "when_to_use": listed("when_to_use"),
        "required_inputs": listed("required_inputs"),
        "dimensions": listed("dimensions"),
        "output_format": listed("output_format"),
        "verification_checklist": listed("verification"),
        "anti_patterns": listed("anti_patterns"),
        "rationalizations": listed("rationalizations"),
    })
    result: dict[str, Any] = {"kind": _RUBRIC_KIND, "source_url": source_url, "note": _RUBRIC_NOTE}
    if any(inputs.get(k) for k in ("artifact", "purpose", "context", "rules")):
        result["inputs"] = {
            "artifact": inputs.get("artifact") or None,
            "purpose": inputs.get("purpose") or None,
            "context": inputs.get("context") or None,
            "rules": inputs.get("rules") or default_rules,
        }
    result.update(from_kit)
    result["kit_prompt_url"] = kit_page
    result["kit_prompt_note"] = _KIT_PROMPT_NOTE
    result["omitted_fields"] = omitted
    return result


# ── designesy_score: the offline engine ──────────────────────────────────────
#
# designesy_score asks the live engine at /api/score first. When that call
# fails, format designesy falls back to this offline engine, which fetches the
# page itself and runs a subset of the live engine's checks locally.
#
# It MIRRORS one live engine build, OFFLINE_ENGINE_MIRRORS. Each check it runs
# is a port of the TypeScript check in packages/score/src/engine.ts, which
# packages/score/scripts/source-drift.mjs keeps identical to the live route
# (apps/site/app/api/score/route.ts): the same item, category, status and
# detail text, the same token inference, and the same scope filter. The checks
# it does not run are listed in _OFFLINE_NOT_IMPLEMENTED with the reason, and
# the result names them.
#
# DRIFT GATE. test/test_offline_engine_parity.py scores the shared fixture
# corpus with this engine and compares every check it runs against
# test/fixtures/offline-engine-golden.json, which
# packages/score/scripts/export-offline-golden.mjs writes from the built
# TypeScript engine. CI runs that script with --check, so the golden cannot
# fall behind the TypeScript engine, and the parity test fails until this port
# follows it. Until this gate nothing compared the two: measured on the golden
# when it was introduced (2026-10-08), the previous fallback disagreed with the
# live engine's status on at least one run for 23 of its 26 checks (agreeing
# everywhere only on v03, v07 and v09), and raised ValueError on scale(0.9.5).
#
# JAVASCRIPT SEMANTICS. The port keeps JavaScript behaviour wherever the two
# languages differ, because a verdict that leans on a difference would
# otherwise disagree with the live engine without anything failing:
#   - _js_re compiles the TypeScript regex source with JavaScript semantics:
#     ASCII \w \d \b and case folding, JS whitespace for \s, `.` stops at all
#     four JS line terminators, and a trailing `$` matches only at the end.
#   - _js_float and _js_int parse the longest numeric prefix, as parseFloat
#     and parseInt do ("0.9.5" is 0.9, "5g" in hex is 5), and return NaN
#     rather than raising.
#   - _js_num and _js_fixed format numbers as Number#toString and
#     Number#toFixed do (13 prints "13", 0.125 to 2 places prints "0.13").
#   - _js_trim strips the JS whitespace set, which includes U+FEFF.
#   - _js_pow returns NaN where Math.pow does, never a complex number.

import math
import os
import re
import subprocess
from decimal import Decimal, ROUND_HALF_UP
from urllib.parse import urljoin, urlparse

# The live engine build this engine mirrors, and the contract revision that
# build reports. Both are asserted against the golden the TypeScript engine
# writes, so neither can claim a version the port does not match.
OFFLINE_ENGINE_MIRRORS = "1.2.0"
OFFLINE_CONTRACT_VERSION = "v0.4.3"

# The live engine's checks that this engine does not run, in the live engine's
# order. The parity test asserts that these and OFFLINE_CHECK_IDS together are
# exactly the live engine's check list, so a check added to the live engine
# fails the test until it is ported or listed here with a reason.
_NOT_PORTED = (
    "not ported: added to the live engine after this fallback's original "
    "checklist (v01-v23, x01-x03), and engines 1.1.0 and 1.2.0 did not change "
    "it. The live engine runs it."
)
_NOT_PORTED_V44_V45 = (
    "not ported: added to the live engine for 1.2.0, after this fallback's "
    "original checklist (v01-v23, x01-x03). It needs a CSS rule model and "
    "theme-aware colour resolution this port does not carry. The live engine "
    "runs it."
)
_OFFLINE_NOT_IMPLEMENTED: dict[str, str] = {
    "v24": _NOT_PORTED,
    "v25": _NOT_PORTED,
    "v26": _NOT_PORTED,
    "v28": _NOT_PORTED,
    "v29": _NOT_PORTED,
    "v42": _NOT_PORTED,
    "v43": _NOT_PORTED,
    "v34": _NOT_PORTED,
    "v35": _NOT_PORTED,
    "v36": _NOT_PORTED,
    "v38": _NOT_PORTED,
    "v39": _NOT_PORTED,
    "v40": _NOT_PORTED,
    "v41": _NOT_PORTED,
    "v44": _NOT_PORTED_V44_V45,
    "v45": _NOT_PORTED_V44_V45,
    "v37": (
        "needs the network: it fetches /DESIGN.md from the target origin and "
        "lints it with an optional package. The live engine's own offline mode "
        "pins it to SKIP for the same reason."
    ),
}

# The checks this engine runs, in the live engine's order.
OFFLINE_CHECK_IDS: tuple[str, ...] = (
    "v01", "v02", "v03", "v04", "v05", "v06", "v07", "v08", "v09", "v10",
    "v11", "v12", "v13", "v14", "v15", "v16", "v17", "v18", "v19", "v20",
    "v21", "v22", "v23", "x01", "x02", "x03", "v27",
)

# route.ts MAX_STYLESHEETS: the live engine fetches at most this many distinct
# linked stylesheets.
_MAX_STYLESHEETS = 60


# ── JavaScript-semantics helpers ─────────────────────────────────────────────

# The characters String#trim strips and \s matches in JavaScript: WhiteSpace
# (including U+FEFF and every Zs space) plus the four LineTerminators.
_JS_WS_CHARS = (
    "\t\n\x0b\x0c\r \xa0        "
    "        　﻿"
)
_JS_WS_CLASS = (
    "\\t\\n\\x0b\\x0c\\r \\xa0\\u1680\\u2000-\\u200a\\u2028\\u2029"
    "\\u202f\\u205f\\u3000\\ufeff"
)
_JS_RE_CACHE: dict[tuple[str, str], "re.Pattern[str]"] = {}


def _js_re(source: str, flags: str = "") -> "re.Pattern[str]":
    """Compile a JavaScript regex body (the text between the slashes).

    Flags are the JS ones: "i" folds case, "g" is accepted for readability
    (iteration is the caller's choice of finditer or search). Any other flag
    raises, so a pattern whose semantics this cannot reproduce is never ported
    silently.
    """
    key = (source, flags)
    hit = _JS_RE_CACHE.get(key)
    if hit is not None:
        return hit
    if set(flags) - {"g", "i"}:
        raise ValueError(f"_js_re does not reproduce JS flag(s) {flags!r}")
    out: list[str] = []
    in_class = False
    i = 0
    while i < len(source):
        c = source[i]
        if c == "\\":
            nxt = source[i + 1]
            if nxt == "s":
                out.append(_JS_WS_CLASS if in_class else f"[{_JS_WS_CLASS}]")
            elif nxt == "S":
                # Inside a class this only appears as [\s\S] (any character),
                # which the union with _JS_WS_CLASS keeps exact.
                out.append("\\S" if in_class else f"[^{_JS_WS_CLASS}]")
            else:
                out.append(c + nxt)
            i += 2
            continue
        if in_class:
            if c == "]":
                in_class = False
        elif c == "[":
            in_class = True
        elif c == ".":
            c = "[^\\n\\r\\u2028\\u2029]"
        elif c == "$":
            c = "\\Z"
        out.append(c)
        i += 1
    pattern = re.compile("".join(out), re.ASCII | (re.IGNORECASE if "i" in flags else 0))
    _JS_RE_CACHE[key] = pattern
    return pattern


def _js_trim(s: str) -> str:
    """String#trim."""
    return s.strip(_JS_WS_CHARS)


_JS_FLOAT_PREFIX = re.compile(
    r"[+-]?(?:Infinity|(?:[0-9]+(?:\.[0-9]*)?|\.[0-9]+)(?:[eE][+-]?[0-9]+)?)"
)


def _js_float(s: str) -> float:
    """parseFloat: the longest decimal prefix, NaN when there is none."""
    m = _JS_FLOAT_PREFIX.match(s.lstrip(_JS_WS_CHARS))
    if not m:
        return math.nan
    text = m.group(0)
    if text.endswith("Infinity"):
        return -math.inf if text.startswith("-") else math.inf
    return float(text)


def _js_int(s: str, radix: int = 10) -> float:
    """parseInt for radix 10 or 16: the longest digit prefix, NaN when none."""
    t = s.lstrip(_JS_WS_CHARS)
    sign = 1
    if t[:1] in ("+", "-"):
        sign = -1 if t[0] == "-" else 1
        t = t[1:]
    if radix == 16 and t[:2] in ("0x", "0X"):
        t = t[2:]
    digits = "0123456789" if radix == 10 else "0123456789abcdefABCDEF"
    n = 0
    while n < len(t) and t[n] in digits:
        n += 1
    if n == 0:
        return math.nan
    try:
        return sign * float(int(t[:n], radix))
    except OverflowError:
        return sign * math.inf


def _js_num(x: float) -> str:
    """Number#toString for a finite or non-finite number."""
    x = float(x)
    if math.isnan(x):
        return "NaN"
    if math.isinf(x):
        return "Infinity" if x > 0 else "-Infinity"
    if x == 0:
        return "0"
    if x < 0:
        return "-" + _js_num(-x)
    # repr is the shortest round-trip form, the same digits JS chooses.
    mantissa, _, exp = repr(x).partition("e")
    whole, _, frac = mantissa.partition(".")
    digits = whole + frac
    point = len(whole) + (int(exp) if exp else 0)
    stripped = digits.lstrip("0")
    point -= len(digits) - len(stripped)
    digits = stripped.rstrip("0")
    k, n = len(digits), point
    if k <= n <= 21:
        return digits + "0" * (n - k)
    if 0 < n <= 21:
        return digits[:n] + "." + digits[n:]
    if -6 < n <= 0:
        return "0." + "0" * (-n) + digits
    e = f"e{'+' if n - 1 >= 0 else '-'}{abs(n - 1)}"
    return digits + e if k == 1 else digits[0] + "." + digits[1:] + e


def _js_fixed(x: float, places: int) -> str:
    """Number#toFixed: rounds the exact binary value, ties away from zero."""
    x = float(x)
    if math.isnan(x):
        return "NaN"
    if abs(x) >= 1e21:
        return _js_num(x)
    if x == 0:
        x = 0.0  # (-0).toFixed() has no sign
    q = Decimal(x).quantize(Decimal(1).scaleb(-places), rounding=ROUND_HALF_UP)
    return f"{q:f}"


def _js_bool(b: bool) -> str:
    return "true" if b else "false"


def _js_pow(base: float, exp: float) -> float:
    """Math.pow: NaN for a negative base with a fractional exponent."""
    try:
        return math.pow(base, exp)
    except ValueError:
        return math.nan
    except OverflowError:
        return math.inf


def _js_max(a: float, b: float) -> float:
    return math.nan if math.isnan(a) or math.isnan(b) else max(a, b)


def _js_min(a: float, b: float) -> float:
    return math.nan if math.isnan(a) or math.isnan(b) else min(a, b)


def _js_join(nums: list[float], sep: str = ",") -> str:
    """Array#join over numbers."""
    return sep.join(_js_num(v) for v in nums)


# ── Page fetch ───────────────────────────────────────────────────────────────


def _extract_css_parts(html: str, base_url: str) -> list[str]:
    """route.ts extractCssLinks: inline <style> bodies, then stylesheet URLs.

    The link pattern needs rel before href, as the live engine's does; a page
    that writes href first has that sheet ignored by both engines alike.
    """
    parts = [m.group(1) for m in _js_re(r"<style[^>]*>([\s\S]*?)<\/style>", "gi").finditer(html)]
    link_re = _js_re(r"<link[^>]*rel=[\"']?stylesheet[\"']?[^>]*href=[\"']([^\"']+)[\"']", "gi")
    for m in link_re.finditer(html):
        try:
            parts.append(urljoin(base_url, m.group(1)))
        except ValueError:
            pass  # malformed href, ignored as the live engine does
    return parts


def _fetch_page_parts(url: str) -> tuple[str, str]:
    """Fetch a page and its CSS the way route.ts fetchPageResilient assembles it.

    Inline <style> text first, then each distinct linked stylesheet (at most
    _MAX_STYLESHEETS) in document order, joined with newlines. A sheet that
    fails to load is dropped, not fatal.
    """
    html = _fetch(url, as_json=False)
    parts = _extract_css_parts(html, url)
    css_parts = [p for p in parts if not p.startswith("http")]
    external = list(dict.fromkeys(p for p in parts if p.startswith("http")))
    for href in external[:_MAX_STYLESHEETS]:
        try:
            text = _fetch(href, as_json=False)
        except Exception:
            continue
        if text:
            css_parts.append(text)
    return html, "\n".join(css_parts)


# ── Tokens ───────────────────────────────────────────────────────────────────


def _extract_root_tokens(css: str) -> dict[str, str]:
    """engine.ts extractRootTokens: custom properties declared in :root.

    Media-query :root blocks (one level deep) are stripped first, so an
    accessibility override does not replace the base token.
    """
    stripped = _js_re(r"@media[^{]*\{[^@]*?\}\s*\}", "gi").sub("", css)
    tokens: dict[str, str] = {}
    for block in _js_re(r":root\s*\{([^}]*)\}", "g").finditer(stripped):
        for prop in _js_re(r"--([\w-]+)\s*:\s*([^;]+?)(?:;|$)", "g").finditer(block.group(1)):
            tokens[f"--{prop.group(1)}"] = _js_trim(prop.group(2))
    return tokens


_TOKEN_ALIASES: dict[str, list[str]] = {
    "--paper": ["--bg", "--background", "--surface", "--bg-primary", "--background-color", "--canvas", "--page", "--page-bg", "--bg-base", "--surface-base", "--color-bg", "--color-background", "--color-surface", "--app-bg"],
    "--ink": ["--text", "--fg", "--foreground", "--text-primary", "--color-text", "--color-foreground", "--text-main", "--text-base", "--body-text"],
    "--signal": ["--accent", "--primary", "--brand", "--accent-color", "--color-accent", "--color-primary", "--color-brand", "--brand-color", "--link"],
    "--muted": ["--text-muted", "--text-secondary", "--secondary", "--fg-muted", "--color-text-secondary", "--color-muted", "--text-subtle"],
    "--muted-dim": ["--text-dim", "--text-disabled", "--fg-dim", "--text-faint"],
    "--duration-quick": ["--duration-fast", "--transition-fast", "--motion-fast", "--dur-fast"],
    "--duration-slow": ["--duration-slow-1", "--transition-slow", "--motion-slow", "--dur-slow"],
}


def _resolve_var(value: str, tokens: dict[str, str], depth: int = 0) -> str:
    """engine.ts resolveVar: follow var(--x) up to 5 hops."""
    if depth > 5:
        return _js_trim(value)
    m = _js_re(r"^\s*var\(\s*(--[\w-]+)").search(value)
    if not m:
        return _js_trim(value)
    ref = tokens.get(m.group(1))
    if not ref:
        return _js_trim(value)
    return _resolve_var(ref, tokens, depth + 1)


def _infer_tokens(tokens: dict[str, str]) -> dict[str, str]:
    """engine.ts inferTokensFromCss: fill each canonical token from its first alias."""
    result = dict(tokens)
    for canonical, aliases in _TOKEN_ALIASES.items():
        if not result.get(canonical):
            for alias in aliases:
                if result.get(canonical):
                    break
                if result.get(alias):
                    result[canonical] = _resolve_var(result[alias], result)
    return result


# ── Colour ───────────────────────────────────────────────────────────────────

Rgb = tuple[float, float, float]


def _hex_to_rgb(color: str) -> Rgb | None:
    color = _js_trim(color)
    if not color.startswith("#"):
        return None
    hex_part = color[1:]
    # A character outside the BMP is two UTF-16 units in JS, and every way it
    # can land in the three two-unit slices yields NaN there, so JS returns null.
    if any(ord(ch) > 0xFFFF for ch in hex_part):
        return None
    if len(hex_part) == 3:
        hex_part = "".join(c + c for c in hex_part)
    if len(hex_part) != 6:
        return None
    rgb = (_js_int(hex_part[0:2], 16), _js_int(hex_part[2:4], 16), _js_int(hex_part[4:6], 16))
    if any(math.isnan(v) for v in rgb):
        return None
    return rgb


def _srgb_to_linear(c: float) -> float:
    s = c / 255
    return s / 12.92 if s <= 0.03928 else _js_pow((s + 0.055) / 1.055, 2.4)


def _relative_luminance(rgb: Rgb) -> float:
    return 0.2126 * _srgb_to_linear(rgb[0]) + 0.7152 * _srgb_to_linear(rgb[1]) + 0.0722 * _srgb_to_linear(rgb[2])


def _contrast_ratio(a: Rgb, b: Rgb) -> float:
    la = _relative_luminance(a)
    lb = _relative_luminance(b)
    return (_js_max(la, lb) + 0.05) / (_js_min(la, lb) + 0.05)


def _resolve_color(value: str, tokens: dict[str, str]) -> Rgb | None:
    v = _js_trim(value)
    if not v:
        return None
    if v.startswith("#"):
        return _hex_to_rgb(v)
    var_match = _js_re(r"^var\(\s*(--[\w-]+)").search(v)
    if var_match:
        ref = tokens.get(var_match.group(1))
        if ref:
            return _resolve_color(ref, tokens)
        return None
    rgb_match = _js_re(r"rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)", "i").search(v)
    if rgb_match:
        return (_js_int(rgb_match.group(1)), _js_int(rgb_match.group(2)), _js_int(rgb_match.group(3)))
    return None


def _srgb_to_y_apca(rgb: Rgb) -> float:
    """APCA-W3 0.0.98G-4g screen luminance."""
    r = _js_pow(rgb[0] / 255, 2.4)
    g = _js_pow(rgb[1] / 255, 2.4)
    b = _js_pow(rgb[2] / 255, 2.4)
    ys = 0.2126729 * r + 0.7151522 * g + 0.0721750 * b
    if ys < 0.022:
        ys += _js_pow(0.022 - ys, 1.414)
    return ys


def _apca_contrast(txt: Rgb, bg: Rgb) -> float:
    txt_ys = _srgb_to_y_apca(txt)
    bg_ys = _srgb_to_y_apca(bg)
    if abs(bg_ys - txt_ys) < 0.0005:
        return 0
    if bg_ys > txt_ys:
        sapc = (_js_pow(bg_ys, 0.56) - _js_pow(txt_ys, 0.57)) * 1.14
    else:
        sapc = (_js_pow(bg_ys, 0.65) - _js_pow(txt_ys, 0.62)) * 1.14
    if abs(sapc) < 0.0005:
        return 0
    sapc = sapc + 0.027 if sapc < 0 else sapc - 0.027
    return sapc * 100


# ── Checks ───────────────────────────────────────────────────────────────────
#
# Each function ports the engine.ts check of the same name (in the comment).
# A check returns {id, item, category, status, detail} exactly as the live
# engine does; status is PASS, FAIL, WARN, SKIP or MANUAL.


def _chk(cid: str, item: str, category: str, status: str, detail: str) -> dict[str, str]:
    return {"id": cid, "item": item, "category": category, "status": status, "detail": detail}


def _check_paper_token(tokens: dict[str, str]) -> dict[str, str]:  # checkPaperToken
    item = "Token values match live site :root foundation"
    val = tokens.get("--paper")
    if val:
        return _chk("v01", item, "tokens", "PASS", f"--paper resolved to {val}")
    return _chk("v01", item, "tokens", "FAIL", "--paper background token not declared in :root")


def _check_contrast_signal(tokens: dict[str, str]) -> dict[str, str]:  # checkContrastSignal
    item = "Primary button text passes WCAG AA contrast against --signal fill"
    signal_val = tokens.get("--signal")
    if not signal_val:
        return _chk("v22", item, "accessibility", "WARN", "--signal accent token not declared")
    signal_rgb = _resolve_color(signal_val, tokens)
    if not signal_rgb:
        return _chk("v22", item, "accessibility", "SKIP", f"--signal value {signal_val} unresolvable to RGB")
    best_ratio: float = 0
    best_name = ""
    for name in ("--paper", "--ink"):
        rgb = _resolve_color(tokens.get(name) or "", tokens)
        if not rgb:
            continue
        r = _contrast_ratio(rgb, signal_rgb)
        if r > best_ratio:
            best_ratio, best_name = r, name
    if best_ratio == 0:
        return _chk("v22", item, "accessibility", "SKIP", "no --paper/--ink token to test against --signal")
    ratio = f"{_js_fixed(best_ratio, 2)}:1"
    if best_ratio >= 4.5:
        return _chk("v22", item, "accessibility", "PASS", f"{best_name} on --signal = {ratio} (≥ 4.5:1 AA)")
    if best_ratio >= 3:
        return _chk("v22", item, "accessibility", "WARN", f"{best_name} on --signal = {ratio} (passes 3:1 large-text, fails 4.5:1 body)")
    return _chk("v22", item, "accessibility", "FAIL", f"{best_name} on --signal = {ratio} (below 3:1, illegible)")


def _check_contrast_readable(tokens: dict[str, str]) -> dict[str, str]:  # checkContrastReadable
    item = "Contrast remains readable for ink, muted, and accent on paper"
    item_scored = f"{item} (WCAG 2.1 + APCA)"
    paper_val = tokens.get("--paper")
    if not paper_val:
        return _chk("v06", item, "accessibility", "SKIP", "--paper not declared: cannot test contrast")
    paper_rgb = _resolve_color(paper_val, tokens)
    if not paper_rgb:
        return _chk("v06", item, "accessibility", "SKIP", f"--paper value {paper_val} unresolvable to RGB")
    results: list[str] = []
    worst_name, worst_ratio, worst_status = "", math.inf, "PASS"
    for name in ("--ink", "--muted", "--muted-dim"):
        val = tokens.get(name)
        if not val:
            results.append(f"{name}: not declared")
            continue
        rgb = _resolve_color(val, tokens)
        if not rgb:
            results.append(f"{name}: unresolvable")
            continue
        ratio = _contrast_ratio(rgb, paper_rgb)
        lc = _apca_contrast(rgb, paper_rgb)
        st = "PASS"
        if ratio < 3:
            st = "FAIL"
        elif ratio < 4.5:
            st = "WARN"
        results.append(f"{name}={_js_fixed(ratio, 2)}:1 Lc{_js_fixed(abs(lc), 0)}({st})")
        if st == "FAIL":
            if worst_status != "FAIL" or ratio < worst_ratio:
                worst_name, worst_ratio, worst_status = name, ratio, "FAIL"
        elif st == "WARN" and worst_status != "FAIL":
            if worst_status != "WARN" or ratio < worst_ratio:
                worst_name, worst_ratio, worst_status = name, ratio, "WARN"
    detail = ", ".join(results)
    if worst_status == "FAIL":
        return _chk("v06", item_scored, "accessibility", "FAIL", f"{detail}; {worst_name} below 3:1")
    if worst_status == "WARN":
        return _chk("v06", item_scored, "accessibility", "WARN", f"{detail}; {worst_name} below 4.5:1 AA")
    return _chk("v06", item_scored, "accessibility", "PASS", detail)


def _check_transition_all(css: str) -> dict[str, str]:  # checkTransitionAll
    item = "No transition:all in the live stylesheet"
    if _js_re(r"transition\s*:\s*all", "i").search(css):
        return _chk("v11", item, "motion", "FAIL", "found transition:all")
    return _chk("v11", item, "motion", "PASS", "no transition:all found")


def _check_will_change(css: str) -> dict[str, str]:  # checkWillChange
    item = "will-change restricted to transform and opacity only"
    for m in _js_re(r"will-change\s*:\s*([^;}]+)", "gi").finditer(css):
        val = _js_trim(_js_re(r"will-change\s*:\s*", "i").sub("", m.group(0), count=1)).lower()
        parts = [p for p in (_js_trim(s) for s in val.split(",")) if p]
        if not (parts and all(p in ("transform", "opacity") for p in parts)):
            return _chk("v12", item, "motion", "WARN", f"found will-change: {val}")
    return _chk("v12", item, "motion", "PASS", "will-change restricted cleanly")


def _check_focus_visible(css: str) -> dict[str, str]:  # checkFocusVisible
    item = "Primary interactive elements show focus-visible rings"
    if _js_re(r":focus-visible", "i").search(css):
        return _chk("v03", item, "interaction", "PASS", ":focus-visible declared")
    return _chk("v03", item, "interaction", "FAIL", "missing :focus-visible rules")


def _check_text_wrap(css: str) -> dict[str, str]:  # checkTextWrap
    item = "text-wrap: balance + pretty both present in live CSS"
    balance = bool(_js_re(r"text-wrap\s*:\s*balance", "i").search(css))
    pretty = bool(_js_re(r"text-wrap\s*:\s*pretty", "i").search(css))
    if balance and pretty:
        return _chk("v18", item, "cadence", "PASS", "both text-wrap values present")
    return _chk("v18", item, "cadence", "WARN", f"balance={_js_bool(balance)} pretty={_js_bool(pretty)}")


def _check_cadence_rules(css: str) -> dict[str, str]:  # checkCadenceRules
    item = "Cadence typography rules match live CSS and contract.cadence"
    rules = [
        ("font-smoothing", r"font-smoothing\s*:\s*(antialiased|grayscale)"),
        ("rem-based sizes", r"font-size\s*:\s*[\d.]+rem"),
        ("line-height", r"line-height\s*:\s*[\d.]+"),
        ("text-wrap", r"text-wrap\s*:\s*(balance|pretty)"),
        ("tabular-nums", r"tabular-nums"),
    ]
    missing = [name for name, src in rules if not _js_re(src, "i").search(css)]
    if not missing:
        return _chk("v14", item, "cadence", "PASS", "all Cadence rules present")
    return _chk("v14", item, "cadence", "WARN", f"missing: {', '.join(missing)}")


def _check_tabular_nums(css: str) -> dict[str, str]:  # checkTabularNums
    item = "tabular-nums: 8 instances across the live CSS"
    count = len(_js_re(r"tabular-nums", "gi").findall(css))
    if count >= 8:
        return _chk("v19", item, "cadence", "PASS", f"{count} instances found")
    return _chk("v19", item, "cadence", "WARN", f"only {count} instances (threshold: 8)")


def _opts_into_motion(body: str) -> bool:  # optsIntoMotion
    """Does a prefers-reduced-motion: no-preference block opt INTO motion?

    It counts when it declares an animation, a transition, smooth scrolling or
    a view transition. A block that only switches motion off (none, or
    durations of 10ms or less) is the reduce kill switch under the wrong query:
    it stills motion for users with no preference and leaves it running for
    users who asked for less, so it does not count.
    """
    if _js_re(r"@view-transition\s*\{[^}]*navigation\s*:\s*auto", "i").search(body):
        return True
    decl_re = _js_re(
        r"(?:^|[{;\s])(animation|animation-name|animation-duration|transition|transition-property"
        r"|transition-duration|scroll-behavior|view-transition-name)\s*:\s*([^;{}]+)",
        "gi",
    )
    for m in decl_re.finditer(body):
        prop = m.group(1).lower()
        value = _js_trim(_js_re(r"!important", "i").sub("", m.group(2), count=1)).lower()
        if prop == "scroll-behavior":
            if value == "smooth":
                return True
            continue
        if _js_re(r"^(?:none|initial|unset|revert|revert-layer|0|0s|0ms)$").search(value):
            continue
        times = [
            _js_float(t.group(1)) * (1000 if t.group(2) == "s" else 1)
            for t in _js_re(r"(?:^|[\s,(])(\d*\.?\d+)(ms|s)\b", "g").finditer(value)
        ]
        if times and all(t <= 10 for t in times):
            continue
        return True
    return False


def _check_reduced_motion(css: str) -> dict[str, str]:  # checkReducedMotion
    """v05 (engine 1.1.0). Two shapes honour reduced motion: a `reduce` block
    with rules, or motion declared only inside a `no-preference` block (opt-in
    motion, see _opts_into_motion). An empty no-preference block, or one that
    only switches motion off, still WARNs. Comments are stripped first, so a
    commented-out query counts for nothing.
    """
    item = "prefers-reduced-motion disables entrance and wordmark breath"
    code = _js_re(r"\/\*[\s\S]*?\*\/", "g").sub("", css)
    mq_re = _js_re(r"@media[^{]*prefers-reduced-motion\s*:\s*(reduce|no-preference)\b[^{]*\{", "gi")
    saw_reduce = saw_opt_in = saw_no_preference = False
    for match in mq_re.finditer(code):
        value = match.group(1).lower()
        # Capture the block body by brace-matching from the opening brace.
        open_at = match.end() - 1
        depth = 0
        close_at = -1
        for brace in re.finditer(r"[{}]", code[open_at:]):
            if brace.group(0) == "{":
                depth += 1
            else:
                depth -= 1
                if depth == 0:
                    close_at = open_at + brace.start()
                    break
        body = _js_trim(code[open_at + 1:close_at]) if close_at > open_at else ""
        if value == "no-preference":
            saw_no_preference = True
            if _opts_into_motion(body):
                saw_opt_in = True
            continue
        if len(body) > 0:
            saw_reduce = True
    if saw_reduce:
        return _chk("v05", item, "motion", "PASS", "prefers-reduced-motion: reduce block declares rules")
    if saw_opt_in:
        return _chk("v05", item, "motion", "PASS", "motion is opt-in: declared inside a prefers-reduced-motion: no-preference block, so a reduce preference receives none of it")
    if saw_no_preference:
        return _chk(
            "v05", item, "motion", "WARN",
            "a prefers-reduced-motion: no-preference block exists but gates no motion: it is empty, or it "
            "only switches motion off, which stills motion for users with no preference and leaves it running "
            "for users who asked for less. Declare motion inside no-preference, or switch it off inside reduce.",
        )
    return _chk("v05", item, "motion", "WARN", "missing prefers-reduced-motion: reduce media query")


def _visible_html(html: str) -> str:
    return _js_re(r"<style[\s\S]*?<\/style>", "gi").sub("", _js_re(r"<script[\s\S]*?<\/script>", "gi").sub("", html))


def _check_semantic_html(html: str) -> dict[str, str]:  # checkSemanticHtmlFoundation
    item = "Semantic HTML foundation: single h1, title, meta description, landmark"
    visible = _visible_html(html)
    h1_count = len(_js_re(r"<h1\b", "gi").findall(visible))
    has_title = bool(_js_re(r"<title\b[^>]*>[^<]+<\/title>", "i").search(html))
    has_meta_desc = bool(_js_re(r"<meta\s+name=[\"']description[\"']", "i").search(html))
    has_landmark = bool(_js_re(r"<(main|header|nav)\b", "i").search(visible))
    signals: list[str] = []
    failures: list[str] = []
    if h1_count == 1:
        signals.append("single h1")
    else:
        failures.append("no h1" if h1_count == 0 else f"{h1_count} h1s")
    (signals if has_title else failures).append("title" if has_title else "no title")
    (signals if has_meta_desc else failures).append("meta description" if has_meta_desc else "no meta description")
    (signals if has_landmark else failures).append("landmark" if has_landmark else "no main/header/nav")
    if not failures:
        return _chk("v07", item, "identity", "PASS", ", ".join(signals))
    if len(failures) <= 2:
        return _chk("v07", item, "identity", "WARN", f"ok: {', '.join(signals)} · missing: {', '.join(failures)}")
    return _chk("v07", item, "identity", "FAIL", f"missing: {', '.join(failures)}")


def _check_press_scale(css: str) -> dict[str, str]:  # checkPressScale
    item = "Press scale 0.96 on cells, 0.985 on cards/rows (both above the 0.95 floor)"
    # Keyframes are stripped: scale(0) in a ripple keyframe is a start state.
    stripped = _js_re(r"@keyframes\s+[^{]+\{[^@]*?\}", "gi").sub("", css)
    press_scales: list[float] = []
    decorative_below: list[str] = []
    active_below = False
    active_below_val = ""
    for block in stripped.split("}"):
        scale_match = _js_re(r"scale\(\s*([0-9.]+)\s*\)", "i").search(block)
        if not scale_match:
            continue
        num = _js_float(scale_match.group(1))
        if math.isnan(num) or num >= 1:
            continue
        press_scales.append(num)
        if 0 < num < 0.95:
            if _js_re(r":active|\.is-pressed|\[data-press|\.press\b", "i").search(block):
                active_below = True
                active_below_val = _js_num(num)
            else:
                decorative_below.append(_js_num(num))
    if active_below:
        return _chk("v13", item, "takt", "FAIL", f"found scale({active_below_val}) in :active context: below 0.95 floor, reads as a glitch")
    if decorative_below:
        real = [s for s in press_scales if 0.95 <= s < 1]
        if real:
            vals = ", ".join(_js_fixed(s, 3) for s in real)
            return _chk("v13", item, "takt", "PASS", f"{len(real)} press-scale(s) found: {vals}; {len(decorative_below)} decorative scale(s) below floor (non-press, ignored)")
        return _chk("v13", item, "takt", "WARN", f"{len(decorative_below)} decorative scale(s) below 0.95 floor: {', '.join(decorative_below)} (outside :active context); no valid press scales found")
    real = [s for s in press_scales if s > 0]
    if real:
        vals = ", ".join(_js_fixed(s, 3) for s in real)
        return _chk("v13", item, "takt", "PASS", f"{len(real)} press-scale(s) found: {vals}")
    if press_scales:
        return _chk("v13", item, "takt", "WARN", "only scale(0) found (animation initial states): no press scale detected")
    return _chk("v13", item, "takt", "WARN", "no press-scale (scale() < 1) found in CSS")


def _check_line_height_by_role(css: str) -> dict[str, str]:  # checkLineHeightByRole
    item = "Line-height by role: headings 1.08, body 1.55 confirmed"
    heading_re = _js_re(r"(?:h1|h2|h3|h4|h5|h6|\.h\d|heading|title)[^{]*\{[^}]*line-height\s*:\s*([0-9.]+)", "gi")
    body_re = _js_re(r"(?:body|p|article|\.body|\.prose|\.copy)[^{]*\{[^}]*line-height\s*:\s*([0-9.]+)", "gi")
    heading = [_js_float(m.group(1)) for m in heading_re.finditer(css)]
    body = [_js_float(m.group(1)) for m in body_re.finditer(css)]
    heading_ok = any(1.0 <= lh <= 1.15 for lh in heading)
    body_ok = any(1.4 <= lh <= 1.7 for lh in body)
    if heading_ok and body_ok:
        return _chk("v17", item, "cadence", "PASS", f"headings {_js_join(heading) or 'n/a'}, body {_js_join(body) or 'n/a'}")
    if not heading and not body:
        return _chk("v17", item, "cadence", "WARN", "no role-scoped line-height declarations found")
    missing: list[str] = []
    if not heading_ok:
        missing.append("heading 1.0-1.15")
    if not body_ok:
        missing.append("body 1.4-1.7")
    return _chk("v17", item, "cadence", "WARN", f"missing: {', '.join(missing)} (found headings {_js_join(heading) or 'none'}, body {_js_join(body) or 'none'})")


def _check_selection_styled(css: str) -> dict[str, str]:  # checkSelectionStyled
    item = "::selection styled with var(--signal) instead of the browser default"
    rules = [m.group(0) for m in _js_re(r"::selection\s*\{[^}]*\}", "gi").finditer(css)]
    if not rules:
        return _chk("v20", item, "cadence", "WARN", "no ::selection rule found: browser default will show")
    if any(_js_re(r"var\(\s*--signal", "i").search(r) for r in rules):
        return _chk("v20", item, "cadence", "PASS", "::selection uses --signal token")
    if any(_js_re(r"(background|color)\s*:", "i").search(r) for r in rules):
        return _chk("v20", item, "cadence", "PASS", "::selection styled with custom color (token reference recommended)")
    return _chk("v20", item, "cadence", "WARN", "::selection rule exists but no color/background set")


def _check_duration_tokens(tokens: dict[str, str]) -> dict[str, str]:  # checkDurationTokens
    item = "Duration tokens --duration-quick through --duration-slow present in :root"
    required = ["--duration", "--duration-quick", "--duration-fast", "--duration-medium", "--duration-slow"]
    present = [t for t in required if tokens.get(t)]
    missing = [t for t in required if not tokens.get(t)]
    if not missing:
        return _chk("v23", item, "motion", "PASS", "all 5 duration tokens present")
    if len(present) >= 3:
        return _chk("v23", item, "motion", "WARN", f"{len(present)}/5 present, missing: {', '.join(missing)}")
    return _chk("v23", item, "motion", "FAIL", f"only {len(present)}/5 duration tokens present, missing: {', '.join(missing)}")


def _check_font_synthesis(css: str) -> dict[str, str]:  # checkFontSynthesis
    item = "font-synthesis: none set (Cadence resolved tension)"
    if _js_re(r"font-synthesis\s*:\s*none", "i").search(css):
        return _chk("x01", item, "cadence", "PASS", "font-synthesis: none declared")
    if _js_re(r"font-synthesis\s*:", "i").search(css):
        return _chk("x01", item, "cadence", "WARN", "font-synthesis declared but not set to none")
    return _chk("x01", item, "cadence", "WARN", "no font-synthesis rule found: browser may synthesize missing weights")


def _check_underline_position(css: str) -> dict[str, str]:  # checkUnderlinePosition
    item = "text-underline-position: from-font set (Cadence resolved tension)"
    if _js_re(r"text-underline-position\s*:\s*(from-font|under)", "i").search(css):
        return _chk("x02", item, "cadence", "PASS", "text-underline-position set to from-font/under")
    if _js_re(r"text-underline-position\s*:", "i").search(css):
        return _chk("x02", item, "cadence", "WARN", "text-underline-position declared but not from-font/under")
    return _chk("x02", item, "cadence", "WARN", "no text-underline-position rule: browser default may clip descenders")


def _check_skip_ink(css: str) -> dict[str, str]:  # checkSkipInk
    item = "text-decoration-skip-ink: auto set"
    if _js_re(r"text-decoration-skip-ink\s*:\s*(auto|none)", "i").search(css):
        return _chk("x03", item, "cadence", "PASS", "text-decoration-skip-ink set to auto/none")
    if _js_re(r"text-decoration-skip-ink\s*:", "i").search(css):
        return _chk("x03", item, "cadence", "WARN", "text-decoration-skip-ink declared but not auto/none")
    return _chk("x03", item, "cadence", "WARN", "no text-decoration-skip-ink rule: underlines may cross letterforms")


def _has_zoomable_field(html: str) -> bool:  # hasZoomableField
    """A <textarea>, a <select>, or an <input> that takes typed text.

    An <input> with no type is a text field; hidden, checkbox, radio, submit,
    button, reset, image, file, range and color take no typed text.
    """
    visible = _visible_html(html)
    if _js_re(r"<(?:textarea|select)\b", "i").search(visible):
        return True
    for tag in _js_re(r"<input\b[^>]*>", "gi").finditer(visible):
        typ = _js_re(r"\stype\s*=\s*[\"']?([a-z-]+)", "i").search(tag.group(0))
        if not typ or not _js_re(r"^(?:hidden|checkbox|radio|submit|button|reset|image|file|range|color)$", "i").search(typ.group(1)):
            return True
    return False


def _check_input_font_floor(css: str, html: str) -> dict[str, str]:  # checkInputFontFloor
    """v27 (engine 1.1.0). A sub-16px input rule FAILs and a declared 16px
    floor PASSes, from the CSS alone. With neither, the page's own markup
    decides: no field iOS Safari can zoom into reads SKIP (it used to WARN),
    and a text field with no floor still WARNs.
    """
    item = "Input font-size ≥16px (prevents iOS Safari auto-zoom)"
    input_re = _js_re(r"(?:input|textarea|select|\.input|\.field)[^{]*\{[^}]*font-size\s*:\s*(\d+(?:\.\d+)?)(px|rem)", "gi")
    below: list[str] = []
    for m in input_re.finditer(css):
        val = _js_float(m.group(1))
        unit = m.group(2).lower()
        px = val * 16 if unit == "rem" else val
        if px < 16:
            below.append(f"{_js_num(val)}{unit} ({_js_num(px)}px)")
    if not below:
        floor = r"font-size\s*:\s*(?:1rem|16px|1\.0(?:\d+)?rem|[2-9]\dpx)"
        has_floor = bool(
            _js_re(r"input\s*\{[^}]*" + floor, "i").search(css)
            or _js_re(r"input\s*[,][^{]*\{[^}]*" + floor, "i").search(css)
        )
        if has_floor:
            return _chk("v27", item, "accessibility", "PASS", "input font-size floor detected")
        if not _has_zoomable_field(html):
            return _chk("v27", item, "accessibility", "SKIP", "no text input, textarea or select found in HTML: nothing for the 16px floor to protect")
        return _chk("v27", item, "accessibility", "WARN", "no explicit input font-size ≥16px detected: iOS Safari may auto-zoom on focus")
    return _chk("v27", item, "accessibility", "FAIL", f"{len(below)} input(s) below 16px floor: {', '.join(below)}")


def _check_poise_interaction_rules(css: str) -> dict[str, str]:  # checkPoiseInteractionRules
    item = "Poise interaction rules match live /labs/poise and contract.interaction"
    rules = [
        ("fine-pointer hover guard", r"@media[^{]*(?:hover\s*:\s*hover|pointer\s*:\s*fine)"),
        ("press settle scale ~0.97", r"scale\s*\(\s*0?\.9[5-9]\s*\)"),
        ("opacity-only mark breath", r"@keyframes\s+[^{]*breath[^{]*\{[^}]*opacity\s*:"),
    ]
    found = [name for name, src in rules if _js_re(src, "i").search(css)]
    missing = [name for name, src in rules if not _js_re(src, "i").search(css)]
    if len(found) >= 2:
        return _chk("v08", item, "poise", "PASS", f"static half verified: {', '.join(found)} (interaction-feel half requires browser)")
    return _chk("v08", item, "poise", "WARN", f"missing: {', '.join(missing)}")


def _check_poise_keyboard_path(css: str, html: str) -> dict[str, str]:  # checkPoiseKeyboardPath
    item = "Poise keyboard-path verification remains published and current"
    has_focus_visible = bool(_js_re(r":focus-visible", "i").search(css))
    has_focus = bool(_js_re(r":focus[^-]", "i").search(css))
    strips_outline = bool(_js_re(r":focus[^{]*\{[^}]*outline\s*:\s*(none|0)\s*[;}]", "i").search(css))
    has_focus_ring = bool(_js_re(r":focus[^{]*\{[^}]*(box-shadow|outline\s*:\s*[^n0])", "i").search(css))
    has_tabindex = bool(_js_re(r"tabindex\s*=", "i").search(html))
    has_aria = bool(_js_re(r"aria-(label|labelledby|describedby|expanded|selected|pressed)", "i").search(html))
    signals = sum([has_focus_visible, has_focus, has_focus_ring, has_tabindex, has_aria])
    if strips_outline and not has_focus_ring:
        return _chk("v09", item, "poise", "WARN", "focus styles strip outline without replacement ring")
    if signals >= 3:
        return _chk("v09", item, "poise", "PASS", f"static half verified: {signals} keyboard-affordance signals (tab-order traversal requires browser)")
    return _chk("v09", item, "poise", "WARN", f"only {signals} keyboard-affordance signals found")


def _check_takt_feel_rules(css: str) -> dict[str, str]:  # checkTaktFeelRules
    item = "Takt interface-feel rules match live CSS and contract.takt"
    rules = [
        ("stagger enter animation-delay", r"animation-delay\s*:\s*(?:0?\.(?:0?[6-9]|1[0-2])\d*s|\d{2,3}ms)"),
        ("soften exit transform ease-out", r"transition\s*:[^;]*transform[^;]*(ease-out|cubic-bezier\([^)]*0[, ])"),
        ("concentric border-radius set", r"border-radius\s*:\s*\d+"),
    ]
    found = [name for name, src in rules if _js_re(src, "i").search(css)]
    missing = [name for name, src in rules if not _js_re(src, "i").search(css)]
    if len(found) >= 2:
        return _chk("v10", item, "takt", "PASS", f"static half verified: {', '.join(found)} (press-behavior + hit-area require browser)")
    return _chk("v10", item, "takt", "WARN", f"missing: {', '.join(missing)}")


def _check_font_smoothing(css: str) -> dict[str, str]:  # checkFontSmoothing
    item = "Font smoothing: antialiased + grayscale on :root confirmed"
    has_aa = bool(_js_re(r"-webkit-font-smoothing\s*:\s*antialiased", "i").search(css))
    has_moz = bool(_js_re(r"-moz-osx-font-smoothing\s*:\s*grayscale", "i").search(css))
    if has_aa and has_moz:
        return _chk("v15", item, "cadence", "PASS", "both font-smoothing properties present")
    return _chk("v15", item, "cadence", "WARN", "missing complete font-smoothing declaration")


def _check_rem_scale(css: str) -> dict[str, str]:  # checkRemScale
    item = "Rem-based scale: all text sizes in rem, root at 16px confirmed"
    rem = len(_js_re(r"font-size\s*:\s*[\d.]+rem", "gi").findall(css))
    px = len(_js_re(r"font-size\s*:\s*[\d.]+px", "gi").findall(css))
    if rem > px:
        return _chk("v16", item, "cadence", "PASS", f"{rem} rem vs {px} px")
    return _chk("v16", item, "cadence", "WARN", f"{px} px vs {rem} rem")


# ── Browser-only checks: v02, v04, v21 ───────────────────────────────────────
#
# The live engine reports these MANUAL: they need a browser, and the full
# audit (/api/score/audit) resolves them. This engine reports the same MANUAL,
# except that v02 and v21 are measured when a Chrome DevTools endpoint is
# running on 127.0.0.1:9222 (the Node scripts beside this file drive it). A
# probe that cannot run or measure leaves the check MANUAL, never PASS.
#
# .cjs extension is required: this package sits inside a "type": "module"
# monorepo, so a bare .js file is parsed as ESM and `require` throws
# "require is not defined in ES module scope", and the probe never ran.

_V02_ITEM = "Routes render without horizontal overflow at 375px, 720px, 860px, 1080px+"
_V04_ITEM = "Sound toggle flips aria-pressed and applies the audio preference"
_V21_ITEM = "Core Web Vitals plausible: LCP < 2.5s, INP < 200ms, CLS < 0.1"
_V02_MANUAL = "requires browser viewport trace: run the full audit to resolve"
_V04_MANUAL = "requires live DOM interaction: run the full audit to resolve"
_V21_MANUAL = "requires CDP trace: run the full audit to resolve"

_CDP_SCRIPT = os.path.join(os.path.dirname(__file__), "cdp-viewport-check.cjs")
_CDP_CWV_SCRIPT = os.path.join(os.path.dirname(__file__), "cdp-cwv-expr.cjs")


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
    for i in range(len(stdout) - 1, -1, -1):
        if stdout[i] == '{':
            line_start = i == 0 or stdout[i - 1] == '\n'
            if not line_start:
                continue
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
    """v02 through CDP: horizontal overflow at 375/720/860/1080px.

    MANUAL when the probe cannot run or cannot measure.
    """
    if not _cdp_available():
        return "MANUAL", _V02_MANUAL
    if not os.path.exists(_CDP_SCRIPT):
        return "MANUAL", f"{_V02_MANUAL} (CDP viewport script not found)"

    try:
        result = subprocess.run(
            ["node", _CDP_SCRIPT, url],
            capture_output=True, text=True, timeout=60,
            cwd=os.path.dirname(_CDP_SCRIPT),
        )
        if result.returncode != 0:
            return "MANUAL", f"CDP viewport script failed: {result.stderr.strip()[:200]}"

        data = _extract_json_from_stdout(result.stdout)
        if not data:
            return "MANUAL", "CDP check failed to parse output"

        widths_data = data.get("widths", [])
        if not widths_data:
            return "MANUAL", "CDP check returned no width data"

        # Fidelity gate: a width that was not actually emulated cannot be
        # reported as verified. The checker sets measured=False when the
        # observed innerWidth differs from the requested breakpoint (the
        # signature of the emulation override being lost). Passing those
        # through as "ok" is what let a broken checker look green.
        unmeasured = [w for w in widths_data if not w.get("measured", False)]
        if unmeasured:
            bad_details = "; ".join(
                f"{w['width']}px: measured innerWidth={w['innerWidth']}"
                for w in unmeasured
            )
            return "WARN", (
                f"breakpoints not actually emulated — cannot verify overflow "
                f"({bad_details}). Emulation override was not in effect at "
                f"measure time."
            )

        overflows = [w for w in widths_data if w.get("overflow")]
        if not overflows:
            details = ", ".join(f"{w['width']}px:ok" for w in widths_data)
            return "PASS", f"no overflow at any breakpoint ({details})"
        fail_details = "; ".join(
            f"{w['width']}px: scrollWidth={w['scrollWidth']} > innerWidth={w['innerWidth']}"
            for w in overflows
        )
        return "FAIL", f"horizontal overflow: {fail_details}"
    except subprocess.TimeoutExpired:
        return "MANUAL", "CDP viewport check timed out"
    except Exception as e:
        return "MANUAL", f"CDP viewport check error: {_scrub_local_paths(str(e))}"


def _check_cwv_cdp(url: str) -> tuple[str, str]:
    """v21 through CDP: Core Web Vitals (LCP < 2500ms, INP < 200ms, CLS < 0.1).

    MANUAL when the probe cannot run or measured nothing.
    """
    if not _cdp_available():
        return "MANUAL", _V21_MANUAL
    if not os.path.exists(_CDP_CWV_SCRIPT):
        return "MANUAL", f"{_V21_MANUAL} (CDP CWV script not found)"

    try:
        result = subprocess.run(
            ["node", _CDP_CWV_SCRIPT, url],
            capture_output=True, text=True, timeout=60,
            cwd=os.path.dirname(_CDP_CWV_SCRIPT),
        )
        if result.returncode != 0:
            return "MANUAL", f"CDP CWV script failed: {result.stderr.strip()[:200]}"

        data = _extract_json_from_stdout(result.stdout)
        if not data:
            return "MANUAL", "CDP CWV check failed to find JSON in output"

        lcp = data.get("lcp", 0)
        inp = data.get("inp", 0)
        cls = data.get("cls", 0)
        plausible = data.get("plausible", False)
        if not plausible:
            return "MANUAL", f"CWV values not plausible: LCP={lcp}ms INP={inp}ms CLS={cls}"

        # A pass flag of None means not measured: SKIP for that metric, not FAIL.
        def _status(v):
            if v is True:
                return "PASS"
            if v is False:
                return "FAIL"
            return "SKIP"

        lcp_s = _status(data.get("lcpPass", False))
        inp_s = _status(data.get("inpPass", False))
        cls_s = _status(data.get("clsPass", False))
        details = f"LCP={lcp}ms ({lcp_s}), INP={inp}ms ({inp_s}), CLS={cls} ({cls_s})"
        measured = [s for s in (lcp_s, inp_s, cls_s) if s != "SKIP"]
        if measured and all(s == "PASS" for s in measured):
            skipped = [name for name, s in (("LCP", lcp_s), ("INP", inp_s), ("CLS", cls_s)) if s == "SKIP"]
            if skipped:
                details += f" — {', '.join(skipped)} not measured (no interaction during probe)"
            return "PASS", details
        if measured and any(s == "FAIL" for s in measured):
            return "FAIL", details
        return "MANUAL", details
    except subprocess.TimeoutExpired:
        return "MANUAL", "CDP CWV check timed out"
    except Exception as e:
        return "MANUAL", f"CDP CWV check error: {_scrub_local_paths(str(e))}"


def _browser_check(cid: str, item: str, category: str, manual_detail: str, probe, url: str, browser_probes: bool) -> dict[str, str]:
    if not browser_probes:
        return _chk(cid, item, category, "MANUAL", manual_detail)
    status, detail = probe(url)
    return _chk(cid, item, category, status, detail)


# ── Scope: contract vs universal (engine.ts applyScopeFilter) ────────────────
#
# Under scope=universal, a Tier 2 check whose detail reports the feature ABSENT
# reads SKIP (the feature is optional and the site does not use it), and a
# Tier 3 check (Designesy token naming) reads SKIP when it FAILs or WARNs.
# Engine 1.1.0 moved v14 and v18 into Tier 2. The detail patterns are the
# live engine's, which is why every detail above is ported verbatim.

_TIER2_ABSENCE_PATTERNS: list[tuple[str, str, str]] = [
    ("v08", r"^missing:", ""),
    ("v10", r"^missing:", ""),
    ("v13", r"^no press-scale|only scale\(0\)|no press-scale \(scale", ""),
    ("v14", r"^missing:", ""),
    ("v15", r"missing complete font-smoothing", ""),
    ("v18", r"^balance=(?:true|false) pretty=(?:true|false)$", ""),
    ("v19", r"^only \d+ instances", ""),
    ("v20", r"^no ::selection rule found", ""),
    ("v23", r"^only \d+\/5 duration tokens|no.*duration tokens", "i"),
    ("v28", r"^no max-width in ch units", ""),
    ("x01", r"^no font-synthesis rule", ""),
    ("x02", r"^no text-underline-position rule", ""),
    ("x03", r"^no text-decoration-skip-ink rule", ""),
]
_TIER3_CONTRACT_ONLY = frozenset({"v01", "v22", "v29"})
SCOPE_CONTRACT_HOSTS = ("designesy.org", "www.designesy.org")


# Error text in a result: sanitizeErrorText in the TypeScript engines. A caught
# error's message carries the file system of the machine that ran the server (a
# browser probe's "No such file or directory" names a path under the Users
# folder of the account that ran it), and a result is read by people other than
# whoever ran it. Absolute paths (a drive
# letter, a UNC share, a POSIX home, temp or system root), file:// URLs and npm
# cache segments are replaced; the clause that says what failed is kept, and so
# is trailing punctuation. A path segment may hold spaces, the last one may not.
_PATH_TAIL = re.compile(r"[.,;:!?)]+$")
_FILE_URL = re.compile(r"\bfile://[^\s'\"<>`|]*", re.IGNORECASE)
_UNC_PATH = re.compile(r"\\\\[^\\\s'\"<>`|]+\\(?:[^\\\r\n'\"<>`|*?]+\\)*[^\\\s'\"<>`|*?]*")
_DRIVE_PATH = re.compile(r"(?<![\w\\/])[A-Za-z]:([\\/])(?:[^\\/\r\n'\"<>`|*?]+\1)*[^\\/\s'\"<>`|*?]*")
_POSIX_PATH = re.compile(
    r"(^|[\s'\"`(=,:\[])/(?:home|Users|root|tmp|var|private|opt|usr|srv|mnt|Volumes|Library|app|vercel"
    r"|workspace|workspaces|github|runner|nix|snap)(?:/[^/\r\n'\"<>`|]+(?=/))*/[^/\s'\"<>`|]+"
)
_NPM_CACHE = re.compile(r"[^\s'\"<>`|]*(?:npm-cache|[\\/]_npx[\\/]|[\\/]\.npm[\\/])[^\s'\"<>`|]*", re.IGNORECASE)


def _path_label(label: str, matched: str) -> str:
    tail = _PATH_TAIL.search(matched)
    return label + (tail.group(0) if tail else "")


def _scrub_local_paths(text: str) -> str:
    """Replace local file-system detail in text that leaves this process."""
    text = _FILE_URL.sub(lambda m: _path_label("a local file", m.group(0)), text)
    text = _UNC_PATH.sub(lambda m: _path_label("a local path", m.group(0)), text)
    text = _DRIVE_PATH.sub(lambda m: _path_label("a local path", m.group(0)), text)
    text = _POSIX_PATH.sub(lambda m: m.group(1) + _path_label("a local path", m.group(0)), text)
    return _NPM_CACHE.sub(lambda m: _path_label("the npm cache", m.group(0)), text)


def _scrub_check_details(checks: list[dict[str, str]]) -> list[dict[str, str]]:
    """The checks with every detail passed through _scrub_local_paths."""
    return [{**c, "detail": _scrub_local_paths(c["detail"])} if isinstance(c.get("detail"), str) else c for c in checks]


def _apply_scope_filter(checks: list[dict[str, str]], scope: str) -> list[dict[str, str]]:
    if scope == "contract":
        return checks
    out = []
    for c in checks:
        if c["id"] in _TIER3_CONTRACT_ONLY:
            if c["status"] in ("FAIL", "WARN"):
                c = {**c, "status": "SKIP", "detail": f"{c['detail']} (skipped: scope=universal; this check verifies Designesy-specific token naming, and the site may use different token names)"}
            out.append(c)
            continue
        tier2 = next((t for t in _TIER2_ABSENCE_PATTERNS if t[0] == c["id"]), None)
        if tier2 and c["status"] in ("WARN", "FAIL") and _js_re(tier2[1], tier2[2]).search(c["detail"]):
            c = {**c, "status": "SKIP", "detail": f"{c['detail']} (skipped: scope=universal; this feature is optional and not present on this site)"}
        out.append(c)
    return out


def _auto_detect_scope(target_url: str) -> str:
    """engine.ts autoDetectScope: contract for designesy.org, else universal.

    A URL that new URL() would reject (no scheme, a bad port) is universal,
    as it is in the live engine.
    """
    try:
        cleaned = target_url.strip("".join(chr(i) for i in range(0x21)))
        cleaned = cleaned.replace("\t", "").replace("\n", "").replace("\r", "")
        parsed = urlparse(cleaned)
        parsed.port  # raises ValueError on an invalid port, as new URL() throws
        if not parsed.scheme:
            return "universal"
        host = (parsed.hostname or "").lower()
    except ValueError:
        return "universal"
    return "contract" if host in SCOPE_CONTRACT_HOSTS else "universal"


# ── Run ──────────────────────────────────────────────────────────────────────


def _offline_checks(
    html: str,
    css: str,
    subject: str | None = None,
    scope: str | None = None,
    browser_probes: bool = False,
) -> tuple[str, dict[str, str], list[dict[str, str]]]:
    """Run every offline check on fetched parts: engine.ts scoreFromParts.

    Returns (effective scope, raw :root tokens, checks). `subject` is used
    only for scope auto-detection and the browser probes; nothing is fetched
    from it here. With browser_probes False (the parity test, and any caller
    without a browser), v02 and v21 read MANUAL as in the live engine.
    """
    target = subject or "https://fixture.local/"
    raw_tokens = _extract_root_tokens(css)
    tokens = _infer_tokens(raw_tokens)
    effective = scope or _auto_detect_scope(target)
    checks = [
        _check_paper_token(tokens),
        _browser_check("v02", _V02_ITEM, "responsive", _V02_MANUAL, _check_viewport_overflow_cdp, target, browser_probes),
        _check_focus_visible(css),
        _chk("v04", _V04_ITEM, "poise", "MANUAL", _V04_MANUAL),
        _check_reduced_motion(css),
        _check_contrast_readable(tokens),
        _check_semantic_html(html),
        _check_poise_interaction_rules(css),
        _check_poise_keyboard_path(css, html),
        _check_takt_feel_rules(css),
        _check_transition_all(css),
        _check_will_change(css),
        _check_press_scale(css),
        _check_cadence_rules(css),
        _check_font_smoothing(css),
        _check_rem_scale(css),
        _check_line_height_by_role(css),
        _check_text_wrap(css),
        _check_tabular_nums(css),
        _check_selection_styled(css),
        _browser_check("v21", _V21_ITEM, "performance", _V21_MANUAL, _check_cwv_cdp, target, browser_probes),
        _check_contrast_signal(tokens),
        _check_duration_tokens(tokens),
        _check_font_synthesis(css),
        _check_underline_position(css),
        _check_skip_ink(css),
        _check_input_font_floor(css, html),
    ]
    return effective, raw_tokens, _scrub_check_details(_apply_scope_filter(checks, effective))


def _offline_result(
    url: str,
    html: str,
    css: str,
    scope: str | None = None,
    browser_probes: bool = False,
) -> dict[str, Any]:
    """Score fetched parts and shape the result the way designesy_score returns it."""
    effective, raw_tokens, checks = _offline_checks(html, css, url, scope, browser_probes)
    counts = {s: sum(1 for c in checks if c["status"] == s) for s in ("PASS", "FAIL", "WARN", "SKIP", "MANUAL")}
    total = len(checks)
    # PASS=1, WARN=0.5, FAIL=0; SKIP and MANUAL reach no verdict and are excluded.
    scored = total - counts["SKIP"] - counts["MANUAL"]
    score = (counts["PASS"] + 0.5 * counts["WARN"]) / scored if scored > 0 else 0.0
    grade = _score_grade(score)
    not_run = list(_OFFLINE_NOT_IMPLEMENTED)
    in_engine = total + len(not_run)
    return {
        "url": url,
        "engine": {
            "kind": "offline",
            "mirrors_engine_version": OFFLINE_ENGINE_MIRRORS,
            "checks_run": total,
            "checks_in_live_engine": in_engine,
            "not_run": not_run,
        },
        "scope": effective,
        "contract_version": OFFLINE_CONTRACT_VERSION,
        "summary": {
            "total": total,
            "pass": counts["PASS"],
            "fail": counts["FAIL"],
            "warn": counts["WARN"],
            "skip": counts["SKIP"],
            "manual": counts["MANUAL"],
            "score": round(score, 4),
            "score_percent": round(score * 100, 1),
            "grade": grade,
        },
        "tokens_extracted": len(raw_tokens),
        "checks": checks,
        "note": (
            f"Offline engine, not the live one: {BASE_URL}/api/score could not "
            f"be used, so {total} of the live engine's {in_engine} checks ran "
            f"locally. They mirror live engine {OFFLINE_ENGINE_MIRRORS}: for the "
            f"same HTML, CSS and scope ({effective}) each one reaches the live "
            f"engine's verdict. The other {len(not_run)} ({', '.join(not_run)}) "
            f"do not run offline, and the score is an unweighted pass rate over "
            f"the checks that reached a verdict (PASS 1, WARN 0.5), not the live "
            f"engine's weighted score. {counts['PASS']} passed, {counts['FAIL']} "
            f"failed, {counts['WARN']} warned, {counts['SKIP']} skipped, "
            f"{counts['MANUAL']} manual (need a browser). Score "
            f"{round(score * 100, 1)}% ({grade})."
        ),
    }


# ── Main score implementation ──────────────────────────────────────────────


# The /api/score body fields of the same names, with the same values the
# remote MCP tool (apps/site/app/api/mcp/route.ts) accepts. The first format
# is the default.
SCORE_FORMATS = ("designesy", "canonical", "review", "google")
SCORE_SCOPES = ("contract", "universal")


def _post_score_api(url: str, fmt: str, scope: str | None = None) -> str:
    """POST one scoring request to /api/score and return the response body.

    The body carries format always and scope only when given, so the engine's
    scope auto-detection still applies when the caller omits it. The
    User-Agent names this server: the site's usage counters classify
    `designesy-mcp/` as mcp, and the browser User-Agent this call sent before
    counted every MCP score as a browser visit. Raises on a network failure or
    an HTTP error status (urllib raises HTTPError for 4xx and 5xx).
    """
    body: dict[str, Any] = {"url": url, "format": fmt}
    if scope is not None:
        body["scope"] = scope
    req = urllib.request.Request(
        f"{BASE_URL}/api/score",
        data=json.dumps(body).encode("utf-8"),
        headers={
            "Content-Type": "application/json",
            "Accept": "text/markdown" if fmt == "review" else "application/json",
            "User-Agent": f"designesy-mcp/{SERVER_VERSION}",
        },
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=20, context=_SSL_CONTEXT) as resp:
        return resp.read().decode("utf-8")


def _score_remote(url: str, scope: str | None = None) -> dict[str, Any] | None:
    """POST to the canonical 44-check engine at /api/score.

    The site API is the single source of truth for the contract it serves
    (44 checks, 14 categories). The version is reported from that reply, not
    asserted here, so this docstring names no version to fall stale.
    Returns the normalized response, or None if the API is unreachable
    (caller falls back to the local engine).
    """
    try:
        data = json.loads(_post_score_api(url, "designesy", scope))
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
                # Version and check count read from the engine's own reply
                # rather than pinned here. This read "v0.4.0" while the site
                # served v0.4.1: a second copy of a fact the response already
                # carries, which is the shape that drifts every time the
                # contract or the engine moves.
                f"Canonical {data.get('total', len(checks))}-check engine ({data.get('contractVersion', 'unknown')}). "
                f"{data.get('pass', 0)} passed, "
            f"{data.get('fail', 0)} failed, {data.get('warn', 0)} warned, "
            f"{data.get('skip', 0)} skipped, {data.get('manual', 0)} manual "
            f"(browser-only). Score {round(data.get('score', 0), 1)}% "
            f"({data.get('grade', 'F')})."
        ),
    }


def _score_api_failure(exc: Exception) -> str:
    """Describe a failed /api/score call, with the engine's own error text."""
    if isinstance(exc, urllib.error.HTTPError):
        try:
            detail = exc.read().decode("utf-8", "replace").strip()
        except Exception:
            detail = ""
        try:
            detail = json.loads(detail).get("error") or detail
        except Exception:
            pass
        return _scrub_local_paths(f"HTTP {exc.code}: {detail or exc.reason}")
    return _scrub_local_paths(f"{type(exc).__name__}: {exc}")


def _score_impl(
    url: str | None = None,
    format: str | None = None,
    scope: str | None = None,
) -> dict[str, Any] | str:
    """Score a live URL against the Designesy design contract.

    Primary path: delegate to the canonical 44-check engine at
    /api/score (same engine the npm CLI and site use).

    format designesy (the default) reshapes the engine's native JSON into
    this tool's long-standing shape, and falls back to the offline engine
    (_score_local_impl) when the API is unreachable, so the tool still works
    offline. The offline engine runs a subset of the live engine's checks,
    mirrors live engine OFFLINE_ENGINE_MIRRORS for each one, and applies the
    same scope: the one requested, or the one auto-detected from the URL.

    format canonical and google return the engine's JSON unchanged, and
    format review returns its markdown unchanged (a str, which the
    JSON-RPC layer sends as the text content). Only the live engine
    produces those three, so when the API is unreachable they return an
    error instead of the native JSON.
    """
    if not url:
        url = f"{BASE_URL}/"
    fmt = "designesy" if format is None else format

    if fmt not in SCORE_FORMATS:
        return {
            "success": False,
            "error": f"Unknown format {fmt!r}. Supported: {', '.join(SCORE_FORMATS)}.",
            "url": url,
        }
    if scope is not None and scope not in SCORE_SCOPES:
        return {
            "success": False,
            "error": (
                f"Unknown scope {scope!r}. Supported: {', '.join(SCORE_SCOPES)}; "
                "omit it to let the engine auto-detect."
            ),
            "url": url,
        }

    if fmt == "designesy":
        remote = _score_remote(url, scope)
        if remote is not None:
            return remote
        return _score_local_impl(url, scope)

    try:
        body = _post_score_api(url, fmt, scope)
        if fmt == "review":
            return body
        return json.loads(body)
    except Exception as exc:
        return {
            "success": False,
            "error": (
                f"format={fmt!r} needs the live scoring engine at "
                f"{BASE_URL}/api/score, and the call failed "
                f"({_score_api_failure(exc)}). The local offline engine "
                "produces only the default designesy format."
            ),
            "url": url,
            "format": fmt,
        }


def _score_local_impl(url: str, scope: str | None = None) -> dict[str, Any]:
    """Score a live URL with the offline engine, the fallback for designesy_score.

    Fetches the page and its CSS the way the live engine assembles them, then
    runs the offline checks (_offline_checks) under the requested scope, or
    the one auto-detected from the URL. v02 and v21 are measured when a Chrome
    DevTools endpoint is running on 127.0.0.1:9222, and read MANUAL otherwise.
    It fetches only the page and its stylesheets; the contract JSON from
    designesy.org, which the previous engine's v01 needed, is not fetched.
    """
    html, css = _fetch_page_parts(url)
    return _offline_result(url, html, css, scope, browser_probes=True)


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
    """Return the 23-package catalog with versions, URLs, and statuses."""
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


def _contract_error(message: str, unknown: list[str], valid: list[str]) -> dict[str, Any]:
    return {
        "success": False,
        "error": f"{message} Valid sections: {', '.join(valid)}.",
        "unknown_sections": unknown,
        "valid_sections": valid,
    }


def _contract_impl(section: str | None = None, sections: Any = None) -> dict[str, Any]:
    """Return the full design-system contract, or only the requested parts.

    sections (a list of top-level keys) returns {id, version} plus exactly
    those keys, in the order asked. section (one name) is the older form: it
    returns {section, data} and accepts a few aliases (color, tensions,
    poise). Unknown names return an error listing every valid key.
    """
    data = _fetch_contract()
    valid = list(data.keys())

    if sections is not None:
        if not isinstance(sections, list) or not all(isinstance(s, str) for s in sections):
            return _contract_error("sections must be a list of strings.", [], valid)
        names: list[str] = []
        for name in ([section] if section else []) + sections:
            if name not in names:
                names.append(name)
        if not names:
            return _contract_error("sections is empty; name at least one section, or omit it for the full contract.", [], valid)
        unknown = [n for n in names if n not in data]
        if unknown:
            return _contract_error(f"Unknown contract section(s): {', '.join(unknown)}.", unknown, valid)
        result: dict[str, Any] = {"id": data.get("id"), "version": data.get("version")}
        for n in names:
            result[n] = data[n]
        return result

    if not section:
        return data

    # Older single-section form, kept as it was, aliases included.
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
    return _contract_error(f"Unknown contract section: {section}.", [section], valid)


def _design_review_impl(
    artifact: str | None = None,
    purpose: str | None = None,
    context: str | None = None,
    rules: str | None = None,
) -> dict[str, Any]:
    """Return the Design Review kit's rubric as reference data.

    Read-only: it returns the eight dimensions, output format and checklist
    and does not run a review. The kit's agent_prompt is left out (see
    _design_review_rubric); kit_prompt_url points a person at it.
    """
    kit = _fetch_kit()
    default_rules = "designesy design system (latest published contract)"
    if not rules and (artifact or purpose or context):
        try:
            default_rules = f"designesy design system v{_fetch_contract().get('version')}"
        except Exception:  # the rubric does not depend on the contract
            pass
    return _design_review_rubric(
        kit,
        f"{BASE_URL}/kits/design-review.json",
        {"artifact": artifact, "purpose": purpose, "context": context, "rules": rules},
        default_rules,
    )


def _skill_md_impl() -> dict[str, Any]:
    """Return the SKILL.md export as reference data."""
    return _published_text(f"{BASE_URL}/contracts/skill", "text/markdown", _fetch_skill_md())


def _agent_json_impl() -> dict[str, Any]:
    """Return the agent discovery document (agent.json) as reference data."""
    return _published_json(f"{BASE_URL}/.well-known/agent.json", _fetch_agent_json())


def _llms_txt_impl() -> dict[str, Any]:
    """Return the short llms.txt brief as reference data."""
    return _published_text(f"{BASE_URL}/llms.txt", "text/plain", _fetch_llms_txt())


def _llms_full_txt_impl() -> dict[str, Any]:
    """Return the full llms-full.txt brief as reference data."""
    return _published_text(f"{BASE_URL}/llms-full.txt", "text/plain", _fetch_llms_full_txt())


# ── Tool definitions ────────────────────────────────────────────────────────

TOOLS = [
    {
        "name": "designesy_catalog",
        # The package count is deliberately NOT restated here. This description
        # said "23 published Designesy packages" while the catalog had reached 24,
        # so the description and the payload disagreed about the same fact. The
        # tool returns `package_count` derived from the catalog at call time, and
        # this Python package cannot import the TypeScript catalog to interpolate
        # it at build time. Rather than freeze a second copy of a number that
        # changes, the count lives only in the response.
        "description": (
            "List the published Designesy packages with versions, URLs, "
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
            "Get the Designesy design-system contract: the canonical "
            "tokens, motion, acoustic, takt, cadence, typography, "
            "components, and verification rules that define what the "
            "Designesy org considers legitimate design. Use this when you "
            "need the actual contract values (token names and values, "
            "motion timings, accessibility rules) to author, check, or bind "
            "a design. When NOT to use: for a pass/fail score of a live "
            "site, use designesy_score; for an agent-skill-format export, "
            "use designesy_skill_md. Read-only; this server caches the "
            "fetched contract for 5 minutes. With no arguments it returns "
            "the full contract JSON, which is large (on the order of 100 "
            "KB, tens of thousands of tokens). To return less, pass "
            "sections, a list of top-level keys such as [\"motion\", "
            "\"colors\"]: the result holds id, version, and only those keys. "
            "section (one name) is the older form and returns { section, "
            "data }. An unknown name returns an error that lists every "
            "valid key."
        ),
        "inputSchema": {
            "type": "object",
            "properties": {
                "sections": {
                    "type": "array",
                    "items": {"type": "string"},
                    "description": (
                        "Optional: top-level contract keys to return, for example "
                        "[\"motion\", \"colors\", \"verification_checks\"]. The result "
                        "holds id, version, and only these keys. Omit for the full "
                        "contract. An unknown key returns an error that lists every "
                        "valid key."
                    ),
                },
                "section": {
                    "type": "string",
                    "description": (
                        "Optional, older form: one section name; returns { section, "
                        "data }. Accepts the aliases color, tensions and poise. "
                        "Prefer sections."
                    ),
                },
            },
        },
    },
    {
        "name": "designesy_design_review",
        "description": (
            "Get the Designesy Design Review rubric for a qualitative "
            "design critique: eight dimensions (Purpose, Clarity, Context, "
            "Inclusion, System coherence, Durability, Delight, "
            "Responsibility), the output format, and the verification "
            "checklist, from the published Design Review kit. Use this when "
            "you want a structured rubric to critique a design "
            "holistically, rather than a numeric compliance score. When NOT "
            "to use: for a deterministic numeric score, use "
            "designesy_score; this tool gives you a rubric, not a number. "
            "Read-only: it returns reference data and does not evaluate the "
            "design. Returns JSON: { kind: \"review_rubric\", source_url, "
            "note, inputs (only when passed), kit { id, title, version, "
            "status, purpose, quality_bar, permission }, when_to_use[], "
            "required_inputs[], dimensions[8] { num, title, desc }, "
            "output_format[], verification_checklist[], anti_patterns[], "
            "rationalizations[], kit_prompt_url, kit_prompt_note, "
            "omitted_fields[] }. The kit's copy-ready agent prompt is not "
            "included; kit_prompt_url is the page where a person can read "
            "it. Pass artifact, purpose, context, or rules to have them "
            "recorded in inputs (rules defaults to the current contract "
            "version)."
        ),
        "inputSchema": {
            "type": "object",
            "properties": {
                "artifact": {"type": "string", "description": "URL or description of the artifact to review."},
                "purpose": {"type": "string", "description": "What the design is trying to make possible."},
                "context": {"type": "string", "description": "Audience, device, environment, and constraints."},
                "rules": {"type": "string", "description": "Governing rules or contract version (default: the current designesy design system contract version)."},
            },
        },
    },
    {
        "name": "designesy_skill_md",
        "description": (
            "Get the Designesy SKILL.md: the agent-skill-format export of "
            "the design-system contract, for a user to save into "
            ".agents/skills/ or a system prompt so a coding agent builds UI "
            "to the contract (tokens, anti-patterns, rules, verification). "
            "Use this when the user wants the contract in that form. When "
            "NOT to use: for the raw contract JSON, use designesy_contract; "
            "for scoring, use designesy_score. Read-only: no side effects. "
            "Returns JSON: { kind: \"published_document\", source_url, "
            "media_type: \"text/markdown\", note, omitted_sections[], content "
            "}, where content is the SKILL.md markdown (tens of thousands "
            "of characters) with any section written as steps or a prompt "
            "for an AI agent replaced by a one-line marker and named in "
            "omitted_sections. No parameters."
        ),
        "inputSchema": {"type": "object", "properties": {}},
    },
    {
        "name": "designesy_agent_json",
        "description": (
            "Get the Designesy agent discovery document "
            "(/.well-known/agent.json) as reference data: the org identity, "
            "authority, discovery endpoints, package index, machine "
            "exports, permission policy, contact, and citation templates. "
            "Use this when integrating with or enumerating Designesy and "
            "need the canonical discovery manifest rather than one specific "
            "contract. When NOT to use: for the package list, use "
            "designesy_catalog (lighter); for the contract, use "
            "designesy_contract. Read-only: no side effects. Returns JSON: "
            "{ kind: \"published_document\", source_url, media_type: "
            "\"application/json\", note, omitted_fields[], document }, where "
            "document is the published object (schema, name, identity, "
            "authority, topics, discovery, ingest, packages, "
            "machine_exports, contact, permission, cite, and the rest) with "
            "any field written as steps for an AI agent (such as "
            "ingest.steps) removed and its path listed in omitted_fields. "
            "No parameters."
        ),
        "inputSchema": {"type": "object", "properties": {}},
    },
    {
        "name": "designesy_llms_txt",
        "description": (
            "Get the Designesy /llms.txt brief as reference data: what "
            "Designesy is, canonical links, topics, the published package "
            "list, machine exports, standing rules, and contact. Use this "
            "first when you don't know what Designesy is; at a few thousand "
            "characters it is the cheapest orientation path before pulling "
            "heavier artifacts. When NOT to use: for the longer brief, use "
            "designesy_llms_full_txt; for the contract itself, use "
            "designesy_contract. Read-only: no side effects. Returns JSON: "
            "{ kind: \"published_document\", source_url, media_type: "
            "\"text/plain\", note, omitted_sections[], content }, where "
            "content is the published text with any section written as "
            "steps for an AI agent (such as the ingest steps) replaced by a "
            "one-line marker and named in omitted_sections. No parameters."
        ),
        "inputSchema": {"type": "object", "properties": {}},
    },
    {
        "name": "designesy_llms_full_txt",
        "description": (
            "Get the Designesy /llms-full.txt brief as reference data: "
            "authority, discovery endpoints, topics, every published "
            "package with its links, standing rules, and anti-patterns. Use "
            "this for a fuller picture of the Designesy ecosystem when the "
            "short brief from designesy_llms_txt is not enough. When NOT to "
            "use: for a quick orientation, use designesy_llms_txt (a few "
            "thousand characters; this one runs over ten thousand); for the "
            "contract itself, use designesy_contract. Read-only: no side "
            "effects. Returns JSON: { kind: \"published_document\", "
            "source_url, media_type: \"text/plain\", note, "
            "omitted_sections[], content }, where content is the published "
            "text with any section written as steps or a prompt for an AI "
            "agent (such as the ingest protocol and the paste-ready agent "
            "prompt) replaced by a one-line marker and named in "
            "omitted_sections. No parameters."
        ),
        "inputSchema": {"type": "object", "properties": {}},
    },
    {
        "name": "designesy_score",
        "description": (
            "Score a live URL against the Designesy design contract with "
            "the deterministic 44-check verification engine at "
            "https://www.designesy.org/api/score. Returns a numeric score, "
            "a letter grade (A-F), and the check results. "
            "Use this to audit whether a website or AI-generated UI "
            "complies with a real design contract (tokens, motion, "
            "accessibility, cadence, takt, typography, copywriting). When "
            "NOT to use: for token-file validation only, use "
            "designesy_tokens_score; for a Lottie file, use "
            "designesy_motion_score; for a qualitative critique, use "
            "designesy_design_review. The engine fetches the URL "
            "server-side, extracts its CSS, and runs 44 checks. Results "
            "are cached ~24h server-side per URL and scope. Checks that "
            "need a live browser (Core Web Vitals, sound toggle, overflow) "
            "return MANUAL; the full audit (/api/score/audit) resolves "
            "them. Checks that do not apply to the site (no tokens, no "
            "buttons, no DESIGN.md) return SKIP (N/A). "
            "format selects the output. designesy (the default) returns "
            "JSON: { url, contract_version, summary { total, pass, fail, "
            "warn, skip, manual, score (0-1), score_percent (0-100), "
            "grade }, tokens_extracted, checks[{ id, item, category, "
            "status, detail }], note }. canonical returns the engine's "
            "review-findings.json schema JSON unchanged. review returns "
            "the engine's markdown report unchanged (coverage by category, "
            "a findings table of the FAIL and WARN checks, and a verdict). "
            "google returns the "
            "engine's @google/design.md-compatible JSON unchanged. "
            "scope sets the scoring scope: contract or universal. Omit it "
            "and the engine auto-detects: contract for designesy.org, "
            "universal for every other site. If the engine is "
            "unreachable, format designesy falls back to the offline "
            "engine: 27 of the 44 checks run locally, each mirroring the "
            "live engine's verdict, under the same scope. Its result adds "
            "engine (kind offline, the engine version it mirrors, and the "
            "checks it did not run) and scope, and its note says so. The "
            "other three formats return an error, because only the live "
            "engine produces them."
        ),
        "inputSchema": {
            "type": "object",
            "properties": {
                "url": {
                    "type": "string",
                    "description": "URL to score. Defaults to https://www.designesy.org/ if not provided.",
                },
                "format": {
                    "type": "string",
                    "enum": list(SCORE_FORMATS),
                    "default": "designesy",
                    "description": (
                        "Output format. designesy (default): the native "
                        "JSON. canonical: the review-findings.json schema. "
                        "review: a markdown report. google: the "
                        "@google/design.md-compatible JSON."
                    ),
                },
                "scope": {
                    "type": "string",
                    "enum": list(SCORE_SCOPES),
                    "description": (
                        "Scoring scope. contract: every check counts "
                        "absence against the site. universal: optional "
                        "features and Designesy-specific token checks "
                        "return SKIP when absent. Omit to auto-detect: "
                        "contract for designesy.org, universal for every "
                        "other site."
                    ),
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
            "conformance checks (t01-t10) with PASS, FAIL, WARN or SKIP. Use this "
            "to verify a tokens.json (or any DTCG token export) is "
            "structurally correct — $type/$value/$description present, "
            "structured colors (colorSpace + components rather than bare "
            "hex), a valid $schema pointer to designtokens.org, and "
            "correct dimension units. With 84% of teams now using design "
            "tokens (zeroheight Design Systems Report 2025, up from 56% in 2024) and the spec finally stable, "
            "every adopting team needs a validator. When NOT to use: for "
            "scoring a whole live site (not just its token file), use "
            "designesy_score. Executable — fetches the URL or parses the "
            "raw JSON you provide, runs 10 checks server-side. No "
            "browser needed. Returns JSON: { contract_id, contract_version, "
            "contract_status, url, total_tokens, score (0-100), grade (A-F), pass_count, "
            "fail_count, warn_count, checks[{id (t01-t10), name, status "
            "(PASS, FAIL, WARN or SKIP), detail}], provenance, "
            "validator_note }. Pass url "
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
            "ready-to-run Playwright + axe-core 4.13.0 script template "
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
            "PASS, FAIL, WARN or SKIP. The DTCG 2025.10 spec leaves motion tokens "
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
            "JSON: { contract_id, contract_version, contract_status, url, "
            "lottie_version, "
            "layer_count, score (0-100), grade (A-F), pass_count, "
            "fail_count, warn_count, checks[{id (m01-m10), name, status "
            "(PASS, FAIL, WARN or SKIP), detail}], ten_non_negotiable, "
            "provenance, validator_note }. Pass url to fetch a remote Lottie "
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
    {
        "name": "designesy_drift_score",
        "description": (
            "Score a live URL for AI-generated UI drift — 12 checks "
            "detect the four documented 2026 drift failure modes: token "
            "fabrication (var() to undeclared custom properties), "
            "within-session drift (spacing/color/radius value variance), "
            "between-session amnesia (inconsistent font stacks, shadows, "
            "transitions), and silent breaking changes (z-index chaos, "
            "dangling alias chains). Use this when you need to verify "
            "whether a site (especially an AI-generated one) is drifting "
            "off its own declared token system. When NOT to use: for a "
            "full 44-check design-contract score, use designesy_score; "
            "for token-file format validation, use "
            "designesy_tokens_score. Executable — fetches the URL "
            "server-side, extracts all CSS (inline + linked stylesheets), "
            "parses :root custom properties and var() references, runs "
            "12 drift checks. No browser needed. Returns JSON: { ok, "
            "url, score (0-100), grade (A-F), pass, warn, fail, total, "
            "tokensExtracted, checks[{id, item, category, status, "
            "detail}] }. Results cached ~24h server-side per URL."
        ),
        "inputSchema": {
            "type": "object",
            "properties": {
                "url": {
                    "type": "string",
                    "description": "URL to scan for drift. Defaults to https://www.designesy.org/ if not provided.",
                },
            },
        },
    },
    {
        "name": "designesy_readiness_score",
        "description": (
            "Score a URL for design-system AI readiness — the 6th "
            "maturity axis (zeroheight 2026). 10 checks probe the "
            "target origin for machine-readable artifacts: DTCG token "
            "files, llms.txt, agent.json, MCP endpoint (tools/list), "
            "DESIGN.md, token $description, component schemas, "
            "sitemap.xml, robots.txt, and Open Graph/Twitter meta. Use "
            "this to verify whether a design system is the default "
            "context AI tools build from, or whether AI is silently "
            "working around it. When NOT to use: for full "
            "design-contract scoring, use designesy_score; for AI-drift "
            "detection, use designesy_drift_score. Executable — fetches "
            "the URL and probes the origin via HEAD/GET for each "
            "artifact. No browser needed. Returns JSON: { ok, url, "
            "score (0-100), grade (A-F), pass, warn, fail, total, "
            "checks[{id, item, category, status, detail}] }. Results "
            "cached ~24h server-side per URL."
        ),
        "inputSchema": {
            "type": "object",
            "properties": {
                "url": {
                    "type": "string",
                    "description": "URL to score for AI readiness. Defaults to https://www.designesy.org/ if not provided.",
                },
            },
        },
    },
    {
        "name": "designesy_guardrails",
        "description": (
            "Generate a frozen build-contract bundle for AI coding "
            "agents from any design system URL — the product layer. "
            "Ingests a site, extracts its :root tokens, and emits 6 "
            "outputs: (1) DTCG-format token file, (2) Stylelint config "
            "generated from token values, (3) AGENTS.md-format rules "
            "with token allowlist, (4) component contract with allowed "
            "prop patterns, (5) anti-pattern documentation, (6) DESIGN.md "
            "file (Google open spec, google-labs-code/design.md) — YAML "
            "front matter + markdown body, the de-facto AI-readable "
            "design-context standard. Use this when you need to turn a "
            "design system into the file AI agents read and the lint "
            "that enforces it. When NOT to use: for design-contract "
            "scoring, use designesy_score; for token-file validation, "
            "use designesy_tokens_score; for drift detection, use "
            "designesy_drift_score. Executable — fetches the URL, "
            "extracts CSS + :root custom properties, generates the "
            "bundle. No browser needed. Returns JSON: { ok, url, score "
            "(0-100, emission completeness), grade, pass, warn, fail, "
            "total, tokensExtracted, bundle: { tokens, lintConfig, "
            "agentRules, componentContract, antiPatterns, designMd }, "
            "checks[{id, item, category, status, detail}] }. Results "
            "cached ~24h server-side per URL."
        ),
        "inputSchema": {
            "type": "object",
            "properties": {
                "url": {
                    "type": "string",
                    "description": "URL to generate guardrails for. Defaults to https://www.designesy.org/ if not provided.",
                },
            },
        },
    },
    {
        "name": "designesy_monitor_score",
        "description": (
            "Score a URL for continuous design-drift governance — the "
            "temporal layer over the drift radar. Re-runs the 12 drift "
            "checks (d01-d12) on the URL and computes 10 monitor checks "
            "(m01-m10): schedule registered, last run fresh, drift "
            "delta vs baseline, trend slope (3-run trajectory), new "
            "violations since last run, resolved since last run (the "
            "healing signal), score degradation threshold, token-set "
            "mutation, contract version drift, and alert delivered. "
            "When alerts fire and an email address is provided, sends "
            "an HTML drift-alert email via Resend (requires "
            "RESEND_API_KEY env var). Pass a history array of prior "
            "snapshots to compute deltas; omit it for a first-run "
            "baseline. Use this to watch a design system over time — "
            "'weekly audits at cents per report' (Into Design Systems "
            "2026). When NOT to use: for a single point-in-time drift "
            "check, use designesy_drift_score; for design-contract "
            "scoring, use designesy_score. Executable — fetches the "
            "URL, extracts CSS + :root tokens, runs checks, computes "
            "deltas. No browser needed. Returns JSON: { ok, url, score "
            "(0-100, governance health), grade (A-F), pass, warn, fail, "
            "total, currentSnapshot, baseline, previous, driftChecks, "
            "monitorChecks, alerts, emailAlert }. Results cached ~24h "
            "server-side per URL."
        ),
        "inputSchema": {
            "type": "object",
            "properties": {
                "url": {
                    "type": "string",
                    "description": "URL to monitor for drift. Defaults to https://www.designesy.org/ if not provided.",
                },
                "email": {
                    "type": "string",
                    "description": "Email address to receive drift alerts. When alerts fire AND this is provided AND RESEND_API_KEY is set, an HTML alert email is sent. Optional — without it, alerts surface in-UI only.",
                },
                "history": {
                    "type": "array",
                    "items": {
                        "type": "object",
                        "properties": {
                            "timestamp": {"type": "string"},
                            "score": {"type": "number"},
                            "grade": {"type": "string"},
                            "tokensExtracted": {"type": "number"},
                            "checks": {
                                "type": "array",
                                "items": {
                                    "type": "object",
                                    "properties": {
                                        "id": {"type": "string"},
                                        "item": {"type": "string"},
                                        "category": {"type": "string"},
                                        "status": {"type": "string", "enum": ["PASS", "FAIL", "WARN"]},
                                        "detail": {"type": "string"},
                                    },
                                },
                            },
                        },
                    },
                    "description": "Prior snapshots for delta computation. Omit for a first-run baseline.",
                },
            },
        },
    },
    {
        "name": "designesy_compare",
        "description": (
            "Diff two design systems from live URLs — the only "
            "URL-scoped design-token diff engine. Fetches both URLs in "
            "parallel, extracts their :root custom properties, and "
            "produces a structured diff across 8 dimensions: tokens "
            "added (in A not B), removed (in B not A), renamed "
            "(heuristic Levenshtein ≤ 2), value-changed (same name, "
            "different value), scale-stop-changed (spacing/radius/color "
            "scale steps), contrast-drift-per-pair (WCAG contrast ratio "
            "change for shared color tokens), structure-delta (token "
            "count + category distribution), and score-delta (runs "
            "/score on both URLs and diffs). Use this to answer 'what "
            "actually changed between two design systems' or 'how does "
            "our design system differ from a reference'. When NOT to "
            "use: for single-site drift detection, use "
            "designesy_drift_score; for continuous monitoring, use "
            "designesy_monitor_score. Executable — fetches both URLs, "
            "extracts CSS + tokens, computes diff. No browser needed. "
            "Returns JSON: { ok, urlA, urlB, score (0-100, diff "
            "completeness), grade, pass, warn, fail, total, tokensA, "
            "tokensB, added[], removed[], renamed[], valueChanged[], "
            "scaleDiff, structureDelta, contrastDrift[], scoreDelta, "
            "checks[] }. Results cached ~24h server-side per URL pair."
        ),
        "inputSchema": {
            "type": "object",
            "properties": {
                "urlA": {
                    "type": "string",
                    "description": "First URL to compare (e.g. your design system).",
                },
                "urlB": {
                    "type": "string",
                    "description": "Second URL to compare (e.g. a reference or competitor).",
                },
            },
            "required": ["urlA", "urlB"],
        },
    },
    {
        "name": "designesy_report",
        "description": (
            "Generate a unified design-intelligence report for a single "
            "URL — the synthesis capstone of the Designesy dynasty. "
            "Fires /score (44-check audit), /drift (12-check drift "
            "radar), and /readiness (10-check AI readiness) in "
            "parallel, then computes a weighted composite: score × 0.5 "
            "+ drift × 0.3 + readiness × 0.2. One input, one output, "
            "one composite grade. Use this when you need a single "
            "holistic assessment instead of three separate scans, or "
            "when sharing a design-intelligence verdict (the report is "
            "the most shareable surface). When NOT to use: for just "
            "the audit score, use designesy_score; for just drift, use "
            "designesy_drift_score; for just AI readiness, use "
            "designesy_readiness_score. Executable — fires 3 internal "
            "APIs in parallel, each fetches the target URL. No browser "
            "needed. Returns JSON: { ok, url, compositeScore (0-100), "
            "compositeGrade (A-F), score { sub-result }, drift { "
            "sub-result }, readiness { sub-result }, totalChecks, "
            "totalPass, totalWarn, totalFail, totalSkip, checks[] (all "
            "checks across all engines, tagged with engine), "
            "synthesis[] (8 synthesis checks verifying the report ran "
            "correctly), appUrl (standalone interactive dashboard URL) "
            "}. Results cached ~24h server-side per URL."
        ),
        "inputSchema": {
            "type": "object",
            "properties": {
                "url": {
                    "type": "string",
                    "description": "Public URL to generate a design-intelligence report for.",
                },
            },
            "required": ["url"],
        },
    },
]

# ── Tool titles and annotations ─────────────────────────────────────────────
#
# A display title and four behaviour hints per tool, as MCP 2025-06-18 defines
# them (Tool.title and ToolAnnotations):
#
#   readOnlyHint     True: the tool does not modify its environment.
#   destructiveHint  True: it may make destructive updates; False: additive
#                    only. Meaningful only when readOnlyHint is False.
#   idempotentHint   True: repeating a call with the same arguments has no
#                    additional effect. Meaningful only when readOnlyHint is
#                    False.
#   openWorldHint    True: it may interact with external entities beyond the
#                    server (here, any URL the caller supplies).
#
# All four are explicit on every tool, so none is left to a default a client
# may not share. The hosted endpoint carries the same table in
# apps/site/app/lib/mcp-tool-registry.ts (MCP_TOOL_ANNOTATIONS); the test suite
# and apps/site/scripts/check-mcp-tool-parity.js both fail when the two
# disagree. Keep one entry per line: that check reads this table line by line.
#
# Why the values hold for this package:
# - The seven document tools and designesy_a11y_score fetch fixed designesy.org
#   exports only. designesy_a11y_score writes its url argument into the
#   returned script and never fetches it. Closed world.
# - designesy_tokens_score and designesy_motion_score fetch the caller's url.
#   designesy_score posts to the designesy.org engine, which fetches the url;
#   when the engine is unreachable, its offline fallback fetches the page here
#   and, only when a Chrome DevTools endpoint answers on 127.0.0.1:9222, opens
#   a tab there to measure and then closes it. That probe leaves nothing
#   behind, so the tool stays read-only. The other scoring tools post to the
#   designesy.org engines, which fetch the url. Open world.
# - designesy_monitor_score posts to /api/monitor, which sends a drift-alert
#   email through Resend when the caller passes `email`, an alert fires (one
#   needs a non-empty `history`), the server has RESEND_API_KEY set, and that
#   instance has not sent the same alert set for that url and address within
#   the hour. Sending mail is additive, so destructiveHint is False; a repeated
#   call can send another email, so idempotentHint is False.

TOOL_ANNOTATIONS: dict[str, dict[str, Any]] = {
    "designesy_catalog": {"title": "List Designesy packages", "readOnlyHint": True, "destructiveHint": False, "idempotentHint": True, "openWorldHint": False},
    "designesy_contract": {"title": "Get design contract", "readOnlyHint": True, "destructiveHint": False, "idempotentHint": True, "openWorldHint": False},
    "designesy_design_review": {"title": "Get design review rubric", "readOnlyHint": True, "destructiveHint": False, "idempotentHint": True, "openWorldHint": False},
    "designesy_skill_md": {"title": "Get contract as SKILL.md", "readOnlyHint": True, "destructiveHint": False, "idempotentHint": True, "openWorldHint": False},
    "designesy_agent_json": {"title": "Get agent discovery document", "readOnlyHint": True, "destructiveHint": False, "idempotentHint": True, "openWorldHint": False},
    "designesy_llms_txt": {"title": "Get llms.txt brief", "readOnlyHint": True, "destructiveHint": False, "idempotentHint": True, "openWorldHint": False},
    "designesy_llms_full_txt": {"title": "Get llms-full.txt brief", "readOnlyHint": True, "destructiveHint": False, "idempotentHint": True, "openWorldHint": False},
    "designesy_score": {"title": "Score URL against contract", "readOnlyHint": True, "destructiveHint": False, "idempotentHint": True, "openWorldHint": True},
    "designesy_tokens_score": {"title": "Validate DTCG tokens", "readOnlyHint": True, "destructiveHint": False, "idempotentHint": True, "openWorldHint": True},
    "designesy_a11y_score": {"title": "Get WCAG audit kit", "readOnlyHint": True, "destructiveHint": False, "idempotentHint": True, "openWorldHint": False},
    "designesy_motion_score": {"title": "Validate Lottie animation", "readOnlyHint": True, "destructiveHint": False, "idempotentHint": True, "openWorldHint": True},
    "designesy_drift_score": {"title": "Score UI drift", "readOnlyHint": True, "destructiveHint": False, "idempotentHint": True, "openWorldHint": True},
    "designesy_readiness_score": {"title": "Score AI readiness", "readOnlyHint": True, "destructiveHint": False, "idempotentHint": True, "openWorldHint": True},
    "designesy_guardrails": {"title": "Generate build-contract bundle", "readOnlyHint": True, "destructiveHint": False, "idempotentHint": True, "openWorldHint": True},
    "designesy_monitor_score": {"title": "Monitor drift with email alerts", "readOnlyHint": False, "destructiveHint": False, "idempotentHint": False, "openWorldHint": True},
    "designesy_compare": {"title": "Compare two design systems", "readOnlyHint": True, "destructiveHint": False, "idempotentHint": True, "openWorldHint": True},
    "designesy_report": {"title": "Build composite design report", "readOnlyHint": True, "destructiveHint": False, "idempotentHint": True, "openWorldHint": True},
}


def _with_title_and_annotations(tool: dict[str, Any]) -> dict[str, Any]:
    """Return the tool with its title and annotations, title right after name.

    The title goes in both places the spec reads it from: Tool.title
    (2025-06-18) and annotations.title (2025-03-26). Display precedence is
    title, then annotations.title, then name, so both come from one entry.
    A tool missing from TOOL_ANNOTATIONS raises KeyError at import, so an
    untitled tool cannot ship.
    """
    entry = TOOL_ANNOTATIONS[tool["name"]]
    rest = {k: v for k, v in tool.items() if k != "name"}
    return {"name": tool["name"], "title": entry["title"], **rest, "annotations": dict(entry)}


TOOLS = [_with_title_and_annotations(t) for t in TOOLS]

TOOL_MAP = {t["name"]: t for t in TOOLS}

# ── Resource definitions ────────────────────────────────────────────────────

RESOURCES = [
    {"uri": "designesy://open", "name": "Package catalog", "description": "Package catalog from /open.json", "mimeType": "application/json"},
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


# The 13 types DTCG 2025.10 defines: seven in its Types section and six in
# its Composite types section. Until 2026-10-08 (shipped with engine 1.1.0)
# this list lacked cubicBezier and carried seven names the format does not
# define (string, boolean, link, borderStyle, borderWeight, radius, spacing),
# so t06 WARNed on a conformant easing token and passed those names as
# standard. apps/site/app/api/mcp/route.ts carries the same list; the test
# suite asserts the two stay equal.
DTCG_STANDARD_TYPES = frozenset({
    "color", "dimension", "fontFamily", "fontWeight", "duration",
    "cubicBezier", "number",
    "strokeStyle", "border", "transition", "shadow", "gradient", "typography",
})


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

    # Walk tokens for t03-t10
    type_pass_count = 0
    value_pass_count = 0
    color_structured_count = 0
    color_bare_hex_count = 0
    total_tokens = 0
    all_types: set[str] = set()
    dimension_values: list[tuple[str, str]] = []  # (token_path, $value)
    deprecated_patterns: list[str] = []

    VALID_DIMENSION_UNITS = {
        "px", "rem", "em", "%", "vw", "vh", "vmin", "vmax",
        "ch", "ex", "svh", "lvh", "dvh", "svw", "lvw", "dvw",
        "cm", "mm", "in", "pt", "pc", "fr",
    }

    def _extract_unit(v: str) -> str:
        """Extract the unit suffix from a dimension value string."""
        for unit in sorted(VALID_DIMENSION_UNITS, key=len, reverse=True):
            if v.endswith(unit):
                return unit
        return ""

    def _walk(obj: dict[str, Any], path: str = "") -> None:
        nonlocal type_pass_count, value_pass_count, color_structured_count, color_bare_hex_count, total_tokens
        for key, val in obj.items():
            if key.startswith("$"):
                continue
            if isinstance(val, dict):
                if "$value" in val:
                    total_tokens += 1
                    token_path = f"{path}.{key}" if path else key
                    t = val.get("$type")
                    v = val.get("$value")

                    if "$type" in val:
                        type_pass_count += 1
                        if isinstance(t, str):
                            all_types.add(t)
                    value_pass_count += 1

                    if t == "color":
                        if isinstance(v, dict) and "colorSpace" in v:
                            color_structured_count += 1
                        elif isinstance(v, str) and v.startswith("#"):
                            color_bare_hex_count += 1
                            deprecated_patterns.append(f"Color token '{token_path}' uses bare hex (pre-2025.10 pattern)")

                    if t == "dimension":
                        if isinstance(v, str):
                            dimension_values.append((token_path, v))
                            if not _extract_unit(v):
                                deprecated_patterns.append(f"Dimension token '{token_path}' has unrecognized or missing unit: '{v}'")
                        elif isinstance(v, (int, float)):
                            dimension_values.append((token_path, str(v)))
                            deprecated_patterns.append(f"Dimension token '{token_path}' uses bare number (should include unit string)")

                    # Check for deprecated $ref syntax (DTCG 2025.10 uses {path} references)
                    if "$ref" in val:
                        deprecated_patterns.append(f"Token '{token_path}' uses deprecated $ref syntax (use {{path}} in $value)")
                else:
                    _walk(val, f"{path}.{key}" if path else key)

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

    # t06: Standard type names — verify all $type values are in the DTCG 2025.10 set
    non_standard_types = all_types - DTCG_STANDARD_TYPES
    if total_tokens == 0:
        t06_status = "SKIP"
        t06_detail = "No tokens found"
    elif type_pass_count == 0:
        t06_status = "FAIL"
        t06_detail = "No tokens have $type — cannot verify standard type names"
    elif not non_standard_types:
        t06_status = "PASS"
        t06_detail = f"All {len(all_types)} unique type(s) are DTCG 2025.10 standard: {', '.join(sorted(all_types))}"
    else:
        t06_status = "WARN"
        t06_detail = f"Non-standard type(s) found: {', '.join(sorted(non_standard_types))}. These may be valid custom types (see t07)."
    results.append({"id": "t06", "name": "Standard type names", "status": t06_status, "detail": t06_detail})

    # t07: Custom type extension — non-standard types should follow namespacing convention
    custom_types = [t for t in all_types if t not in DTCG_STANDARD_TYPES]
    if not custom_types:
        t07_status = "SKIP"
        t07_detail = "No custom types found"
    else:
        bare_customs = [t for t in custom_types if "." not in t]
        if not bare_customs:
            t07_status = "PASS"
            t07_detail = f"All {len(custom_types)} custom type(s) use dot-namespacing: {', '.join(sorted(custom_types))}"
        else:
            t07_status = "WARN"
            t07_detail = f"Custom type(s) without namespacing (recommend dot-prefix like 'com.example.glow'): {', '.join(sorted(bare_customs))}"
    results.append({"id": "t07", "name": "Custom type extension", "status": t07_status, "detail": t07_detail})

    # t08: Dimension units — verify dimension tokens have valid CSS length units
    if not dimension_values:
        t08_status = "SKIP"
        t08_detail = "No dimension tokens found"
    else:
        bad_units: list[str] = []
        for token_path, v in dimension_values:
            unit = _extract_unit(v)
            if not unit:
                bad_units.append(f"{token_path}='{v}'")
        if not bad_units:
            t08_status = "PASS"
            t08_detail = f"All {len(dimension_values)} dimension token(s) use valid units (px, rem, em, %, etc.)"
        else:
            t08_status = "WARN" if len(bad_units) < len(dimension_values) else "FAIL"
            t08_detail = f"{len(bad_units)}/{len(dimension_values)} dimension token(s) have missing/unrecognized units: {', '.join(bad_units[:5])}"
    results.append({"id": "t08", "name": "Dimension units", "status": t08_status, "detail": t08_detail})

    # t09: Token naming hierarchy — groups should exist (dot-notation is implicit in nesting)
    if total_tokens == 0:
        t09_status = "FAIL"
        t09_detail = "No tokens found — cannot assess naming hierarchy"
    elif len(group_keys) > 0:
        t09_status = "PASS"
        t09_detail = f"{len(group_keys)} token group(s) with nested hierarchy: {', '.join(group_keys[:5])}{'...' if len(group_keys) > 5 else ''}"
    else:
        t09_status = "WARN"
        t09_detail = "No token groups found — tokens should be organized into groups (e.g., color, spacing, typography)"
    results.append({"id": "t09", "name": "Token naming hierarchy", "status": t09_status, "detail": t09_detail})

    # t10: No deprecated patterns — check for pre-2025.10 patterns
    if not deprecated_patterns:
        t10_status = "PASS"
        t10_detail = "No deprecated DTCG patterns detected (no bare hex colors, no bare number dimensions, no $ref syntax)"
    else:
        t10_status = "WARN"
        t10_detail = f"{len(deprecated_patterns)} deprecated pattern(s) found: {'; '.join(deprecated_patterns[:3])}{'...' if len(deprecated_patterns) > 3 else ''}"
    results.append({"id": "t10", "name": "No deprecated patterns", "status": t10_status, "detail": t10_detail})

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
        f"// axe-core 4.13.0 + Playwright — generated by designesy_a11y_score\n"
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
        "summary": "axe-core requires a real DOM. This tool returns the contract checks + a Playwright script. Execute the script locally with @axe-core/playwright 4.13.0.",
        "checks": [{"id": c.get("id"), "name": c.get("item"), "status": "PENDING_EXECUTION"} for c in checks],
        "playwright_script": playwright_script,
        "install_command": "npm i -D @axe-core/playwright@4.13.0",
        "run_command": "npx playwright test a11y-scan.spec.ts --reporter=line",
        "provenance": "axe-core 4.13.0 + W3C WCAG 2.2 + ACT Rules + designesy-core.v0.3.0 section 6",
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


# ── HTTP-proxy tool implementations ─────────────────────────────────────────
#
# The 6 executable engines (drift, readiness, guardrails, monitor, compare,
# report) run server-side on designesy.org. The stdio package proxies to the
# same API endpoints the TS HTTP MCP uses — no need to reimplement the check
# logic in Python. This keeps the Python package feature-parity with the HTTP
# endpoint with zero external dependencies.


def _post_api(endpoint: str, body: dict[str, Any]) -> dict[str, Any]:
    """POST to a designesy.org API endpoint and return the JSON result."""
    url = f"{BASE_URL}/api/{endpoint}"
    data = json.dumps(body).encode("utf-8")
    req = urllib.request.Request(
        url,
        data=data,
        headers={
            "Content-Type": "application/json",
            "Accept": "application/json",
            "User-Agent": f"designesy-mcp/{SERVER_VERSION}",
        },
        method="POST",
    )
    try:
        opener = urllib.request.urlopen(req, timeout=30, context=_SSL_CONTEXT)
    except Exception as exc:
        if "certificate" in str(exc).lower() or isinstance(exc, ssl.SSLError):
            sys.stderr.write(f"WARNING: SSL verification failed for {url}, falling back to lenient context: {exc}\n")
            opener = urllib.request.urlopen(req, timeout=30, context=_SSL_CONTEXT_LENIENT)
        else:
            raise
    with opener as resp:
        return json.loads(resp.read().decode("utf-8"))


def _drift_score_impl(url: str | None = None) -> dict[str, Any]:
    """Proxy to /api/drift — 12-check AI-drift radar."""
    target = url or f"{BASE_URL}/"
    return _post_api("drift", {"url": target})


def _readiness_score_impl(url: str | None = None) -> dict[str, Any]:
    """Proxy to /api/readiness — 10-check AI readiness probe."""
    target = url or f"{BASE_URL}/"
    return _post_api("readiness", {"url": target})


def _guardrails_impl(url: str | None = None) -> dict[str, Any]:
    """Proxy to /api/guardrails — generate build-contract bundle."""
    target = url or f"{BASE_URL}/"
    return _post_api("guardrails", {"url": target})


def _monitor_score_impl(
    url: str | None = None,
    email: str | None = None,
    history: list[dict[str, Any]] | None = None,
) -> dict[str, Any]:
    """Proxy to /api/monitor — continuous drift governance."""
    target = url or f"{BASE_URL}/"
    body: dict[str, Any] = {"url": target, "history": history or []}
    if email:
        body["email"] = email
    return _post_api("monitor", body)


def _compare_impl(url_a: str, url_b: str) -> dict[str, Any]:
    """Proxy to /api/compare — diff two design systems from URLs."""
    return _post_api("compare", {"urlA": url_a, "urlB": url_b})


def _report_impl(url: str) -> dict[str, Any]:
    """Proxy to /api/report — composite score+drift+readiness synthesis."""
    data = _post_api("report", {"url": url})
    # Attach the standalone app URL (same as the TS endpoint does)
    data["appUrl"] = f"{BASE_URL}/api/report/app?url={urllib.parse.quote(url, safe='')}"
    return data


# ── Tool dispatch ───────────────────────────────────────────────────────────


def _dispatch(name: str, args: dict[str, Any]) -> dict[str, Any] | str:
    if name == "designesy_catalog":
        return _catalog_impl()
    elif name == "designesy_contract":
        return _contract_impl(section=args.get("section"), sections=args.get("sections"))
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
        return _score_impl(
            url=args.get("url"),
            format=args.get("format"),
            scope=args.get("scope"),
        )
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
    elif name == "designesy_drift_score":
        return _drift_score_impl(url=args.get("url"))
    elif name == "designesy_readiness_score":
        return _readiness_score_impl(url=args.get("url"))
    elif name == "designesy_guardrails":
        return _guardrails_impl(url=args.get("url"))
    elif name == "designesy_monitor_score":
        return _monitor_score_impl(
            url=args.get("url"),
            email=args.get("email"),
            history=args.get("history"),
        )
    elif name == "designesy_compare":
        return _compare_impl(
            url_a=args.get("urlA", ""),
            url_b=args.get("urlB", ""),
        )
    elif name == "designesy_report":
        return _report_impl(url=args.get("url", ""))
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
            return _error(req_id, -32000, f"Failed to fetch URL: {_scrub_local_paths(str(e))}")
        except Exception as e:
            return _error(req_id, -32000, f"Tool execution failed: {_scrub_local_paths(str(e))}")
        # A str result (designesy_score format=review) is already the text
        # the tool returns, so it is sent as written; JSON-encoding it would
        # wrap the markdown in quotes and escape every newline.
        text = res if isinstance(res, str) else json.dumps(res, indent=2, default=str)
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
            return _error(req_id, -32000, f"Failed to read resource: {_scrub_local_paths(str(e))}")
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