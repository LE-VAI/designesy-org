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
    each tool's hints. Every certificate is verified unless the operator sets
    DESIGNESY_INSECURE_TLS=1, which covers a caller's URL only, and no
    browser is used unless the operator sets DESIGNESY_CDP_URL.
"""
from __future__ import annotations

import json
import os
import re
import ssl
import sys
import time
import urllib.request
import urllib.error
from typing import Any

SERVER_NAME = "designesy-mcp-server"
SERVER_VERSION = "1.13.10"

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

# Certificates are always verified. Until 1.13.10, _fetch and _post_api
# retried with CERT_NONE after a failed verification, a raw ssl.SSLError of
# any kind, or any error whose text said "certificate" (an HTTP 495 reply
# included), so a POST to designesy.org's engines, monitor email and all,
# could go out unverified. A failed verification is now the result. An operator who has to read a site with a
# bad certificate can set DESIGNESY_INSECURE_TLS=1: a caller's URL (never
# designesy.org's) whose certificate fails verification is then read without
# it, and the tool's result says tls_verified: false.
_SSL_CONTEXT = ssl.create_default_context()

# Caller URLs whose cached body was read without certificate verification.
_TLS_UNVERIFIED: set[str] = set()


def _unverified_ssl_context() -> ssl.SSLContext:
    """A context that checks neither the certificate nor the host name."""
    ctx = ssl.create_default_context()
    ctx.check_hostname = False
    ctx.verify_mode = ssl.CERT_NONE
    return ctx


def _insecure_tls_allowed(url: str) -> bool:
    """True when DESIGNESY_INSECURE_TLS=1 and url is not on designesy.org."""
    from urllib.parse import urlparse

    if os.environ.get("DESIGNESY_INSECURE_TLS") != "1":
        return False
    host = (urlparse(url).hostname or "").lower()
    return host != "designesy.org" and not host.endswith(".designesy.org")


def _is_cert_failure(exc: BaseException) -> bool:
    """True for a failed certificate verification, raised or wrapped in a URLError."""
    return isinstance(exc, ssl.SSLCertVerificationError) or isinstance(
        getattr(exc, "reason", None), ssl.SSLCertVerificationError
    )


def _tls_flagged(result: Any, *urls: str) -> Any:
    """The result, with tls_verified False if any of urls was read unverified."""
    if isinstance(result, dict) and any(u in _TLS_UNVERIFIED for u in urls):
        result["tls_verified"] = False
    return result

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
    verified = True
    try:
        opener = urllib.request.urlopen(req, timeout=15, context=_SSL_CONTEXT)
    except Exception as exc:
        if not (_is_cert_failure(exc) and _insecure_tls_allowed(url)):
            raise
        sys.stderr.write(f"WARNING: certificate verification failed for {url}, reading it unverified (DESIGNESY_INSECURE_TLS=1): {exc}\n")
        opener = urllib.request.urlopen(req, timeout=15, context=_unverified_ssl_context())
        verified = False
    with opener as resp:
        body = resp.read().decode("utf-8")

    if as_json:
        data = json.loads(body)
    else:
        data = body

    _cache[url] = (now, data)
    if verified:
        _TLS_UNVERIFIED.discard(url)
    else:
        _TLS_UNVERIFIED.add(url)
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
from bisect import bisect_left, bisect_right
from decimal import Decimal, ROUND_HALF_UP
from typing import Callable, NamedTuple
from urllib.parse import urljoin, urlparse

# The live engine build this engine mirrors, and the contract revision that
# build reports. Both are asserted against the golden the TypeScript engine
# writes, so neither can claim a version the port does not match.
OFFLINE_ENGINE_MIRRORS = "1.5.3"
OFFLINE_CONTRACT_VERSION = "v0.4.7"

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
_NOT_PORTED_V46 = (
    "not ported: added to the live engine for 1.4.0, after this fallback's "
    "original checklist (v01-v23, x01-x03). It reads the type scale from the "
    ":root tokens and judges every font-size against it; the live engine runs it."
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
    "v46": _NOT_PORTED_V46,
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


# ── Linear-time scanning (engine 1.5.1) ──────────────────────────────────────
#
# Engine 1.5.1 replaced the patterns that read page CSS and HTML by retrying
# from every candidate start, or by trying every way to split a run between
# two quantifiers, with helpers that read each run once. The TypeScript engine
# made the same change; these are its helpers, ported. Each returns what the
# pattern it replaced returned: the same matches at the same offsets with the
# same groups, the same string after the same replace, or the same boolean.
# The small patterns they still use are the replaced pattern's own pieces,
# compiled through _js_re with the same flags, so case folding and the
# whitespace set are unchanged. test/test_linear_scan.py runs every helper
# against the pattern it replaced and times each on 100 KB.

_INF = math.inf
_JS_WS_SET = frozenset(_JS_WS_CHARS)
_WS_RUN = _js_re(r"\s*")
_NAME_RUN = _js_re(r"[\w-]*")


class _Scan(NamedTuple):
    """A match as the helpers report it: start offset, matched text, groups."""

    index: int
    text: str
    groups: tuple


def _ws_end(s: str, i: int) -> int:
    """The index after the run of JavaScript whitespace that starts at `i`."""
    return i if i >= len(s) else _WS_RUN.match(s, i).end()


def _name_end(s: str, i: int) -> int:
    """The index after the run of [\\w-] (ASCII) that starts at `i`."""
    return i if i >= len(s) else _NAME_RUN.match(s, i).end()


def _replace_spans(text: str, spans: list[tuple[int, int]], rep: str) -> str:
    """`text` with each [start, end) span replaced by `rep`."""
    if not spans:
        return text
    parts: list[str] = []
    last = 0
    for a, b in spans:
        parts.append(text[last:a])
        parts.append(rep)
        last = b
    parts.append(text[last:])
    return "".join(parts)


def _lazy_block_spans(text: str, open_re: "re.Pattern[str]", close_re: "re.Pattern[str]") -> list[tuple[int, int]]:
    """Spans of OPEN[\\s\\S]*?CLOSE, global and leftmost. A closer is looked for
    once per opener; when there is none after one opener there is none after
    any later one, so the scan stops there."""
    spans: list[tuple[int, int]] = []
    pos = 0
    while True:
        o = open_re.search(text, pos)
        if o is None:
            break
        c = close_re.search(text, o.end())
        if c is None:
            break
        spans.append((o.start(), c.end()))
        pos = c.end()
    return spans


def _next_match_finder(text: str, pat: "re.Pattern[str]") -> Callable[[int], float]:
    """The start of the first match at or after `from_`, remembered while later
    queries fall before it (inf when there is none)."""
    memo_from = -1
    memo_at: float = -1

    def at(from_: int) -> float:
        nonlocal memo_from, memo_at
        if not (memo_from >= 0 and memo_from <= from_ <= memo_at):
            m = pat.search(text, from_)
            memo_from = from_
            memo_at = m.start() if m else _INF
        return memo_at

    return at


def _next_char_finder(text: str, ch: str) -> Callable[[int], float]:
    """_next_match_finder for one literal character."""
    memo_from = -1
    memo_at: float = -1

    def at(from_: int) -> float:
        nonlocal memo_from, memo_at
        if not (memo_from >= 0 and memo_from <= from_ <= memo_at):
            k = text.find(ch, from_)
            memo_from = from_
            memo_at = k if k >= 0 else _INF
        return memo_at

    return at


def _match_starts(text: str, pat: "re.Pattern[str]") -> list[int]:
    """Start offsets of every match of `pat`, ascending."""
    return [m.start() for m in pat.finditer(text)]


_Starts = Callable[[int, int], "tuple[int, int] | None"]


def _rule_body_scan(css: str, next_: _Starts, lead: "re.Pattern[str]", body: "re.Pattern[str]", first: bool) -> list[_Scan]:
    """Matches of START[^{]*\\{[^}]*BODY (global): after each start, the rule
    body from the first `{` to the first `}` must hold BODY, and the match ends
    where BODY last matches in it (the greedy [^}]*). `next_(from_, last_end)`
    returns (start, brace) for the first start at or after `from_` whose
    prelude reaches a `{` (brace -1 when no later start can), or None. `lead`
    finds where BODY can begin and `body` is BODY, matched at a position.
    Starts that share a body's `}` share its answer, so each body is read
    once. `first` stops at one match."""
    out: list[_Scan] = []
    leads = _match_starts(css, lead)
    n = len(css)
    ptr = 0
    pos = 0
    last_end = 0
    dead_until = -1
    while True:
        st = next_(pos, last_end)
        if st is None or st[1] < 0:
            break
        index, b = st
        if b < dead_until:
            pos = b + 1
            continue
        c = css.find("}", b + 1)
        if c < 0:
            c = n
        dead_until = c
        ptr = bisect_right(leads, b, ptr)
        end = bisect_right(leads, c, ptr)
        hit = None
        for k in range(end - 1, ptr - 1, -1):
            hit = body.match(css, leads[k])
            if hit:
                break
        ptr = end
        if hit is None:
            pos = b + 1
            continue
        stop = hit.end()
        out.append(_Scan(index, css[index:stop], hit.groups()))
        if first:
            break
        pos = stop
        last_end = stop
    return out


def _braced_starts(css: str, start: "re.Pattern[str]") -> _Starts:
    """next_ for _rule_body_scan when the start is a plain pattern followed by [^{]*\\{."""
    brace = _next_char_finder(css, "{")

    def nxt(from_: int, _last_end: int = 0) -> "tuple[int, int] | None":
        m = start.search(css, from_)
        if m is None:
            return None
        b = brace(m.end())
        return (m.start(), -1 if b == _INF else int(b))

    return nxt


def _input_floor_starts(css: str) -> _Starts:
    """next_ for v27's floor rule: input\\s*(?:,[^{]*)?\\{"""
    start = _js_re("input", "gi")
    brace = _next_char_finder(css, "{")
    n = len(css)

    def nxt(from_: int, _last_end: int = 0) -> "tuple[int, int] | None":
        at = from_
        while True:
            m = start.search(css, at)
            if m is None:
                return None
            p = _ws_end(css, m.end())
            if p < n and css[p] == "{":
                return (m.start(), p)
            if p < n and css[p] == ",":
                b = brace(p + 1)
                return (m.start(), -1 if b == _INF else int(b))
            at = m.start() + 1

    return nxt


def _breath_keyframe_starts(css: str) -> _Starts:
    """next_ for v08's breath keyframes: @keyframes\\s+[^{]*breath[^{]*\\{"""
    start = _js_re("@keyframes", "gi")
    brace = _next_char_finder(css, "{")
    breath = _next_match_finder(css, _js_re("breath", "gi"))
    n = len(css)

    def nxt(from_: int, _last_end: int = 0) -> "tuple[int, int] | None":
        at = from_
        while True:
            m = start.search(css, at)
            if m is None:
                return None
            after = m.end()
            if not (after < n and css[after] in _JS_WS_SET):
                at = m.start() + 1
                continue
            b = brace(after)
            if b == _INF:
                return (m.start(), -1)
            if breath(after + 1) < b:
                return (m.start(), int(b))
            at = int(b) + 1

    return nxt


def _prelude_has(css: str, start: "re.Pattern[str]", x: "re.Pattern[str]") -> bool:
    """START[^{]*X searched: X (holding no `{`) begins in the prelude between a
    start and the first `{` after it. Only the first start of each prelude
    needs reading; later ones see less of it."""
    brace = _next_char_finder(css, "{")
    found = _next_match_finder(css, x)
    pos = 0
    while True:
        m = start.search(css, pos)
        if m is None:
            return False
        after = m.end()
        b = brace(after)
        if found(after) < b:
            return True
        if b == _INF:
            return False
        pos = int(b) + 1


def _prelude_matches(css: str, start: "re.Pattern[str]", lead: "re.Pattern[str]", x: "re.Pattern[str]") -> list[_Scan]:
    """Matches of START[^{]*X[^{]*\\{ (global): X's last match in the prelude
    before the first `{` after the start; the match runs to that `{`. `lead`
    finds where X can begin, `x` is X, matched at a position."""
    out: list[_Scan] = []
    leads = _match_starts(css, lead)
    ptr = 0
    pos = 0
    while True:
        m = start.search(css, pos)
        if m is None:
            break
        after = m.end()
        b = css.find("{", after)
        if b < 0:
            break
        ptr = bisect_left(leads, after, ptr)
        end = bisect_left(leads, b, ptr)
        hit = None
        for k in range(end - 1, ptr - 1, -1):
            hit = x.match(css, leads[k])
            if hit:
                break
        ptr = end
        if hit:
            out.append(_Scan(m.start(), css[m.start():b + 1], hit.groups()))
        pos = b + 1
    return out


def _closing_braces(code: str, opens: set[int]) -> dict[int, int]:
    """For each `{` in `opens`, the index of the `}` that brings the depth back
    to zero from it: what a depth-counting walk from that brace finds, for
    every brace in one pass. A brace with no such `}` is absent."""
    out: dict[int, int] = {}
    if not opens:
        return out
    stack: list[int] = []
    for m in re.finditer(r"[{}]", code):
        k = m.start()
        if code[k] == "{":
            stack.append(k)
        elif stack:
            o = stack.pop()
            if o in opens:
                out[o] = k
    return out


# ── The call sites, one helper each, so the test runs exactly what they run ──


def _without_scripts_and_styles(html: str) -> str:
    """<script[\\s\\S]*?<\\/script> then <style[\\s\\S]*?<\\/style> removed (gi)."""
    no_scripts = _replace_spans(html, _lazy_block_spans(html, _js_re("<script", "gi"), _js_re(r"<\/script>", "gi")), "")
    return _replace_spans(no_scripts, _lazy_block_spans(no_scripts, _js_re("<style", "gi"), _js_re(r"<\/style>", "gi")), "")


def _without_css_comments(css: str, rep: str) -> str:
    """\\/\\*[\\s\\S]*?\\*\\/ (g) replaced by `rep`."""
    return _replace_spans(css, _lazy_block_spans(css, _js_re(r"\/\*", "g"), _js_re(r"\*\/", "g")), rep)


def _style_elements(html: str) -> list[_Scan]:
    """Matches of <style[^>]*>([\\s\\S]*?)<\\/style> (gi): groups (content,)."""
    open_re = _js_re("<style", "gi")
    close_re = _js_re(r"<\/style>", "gi")
    out: list[_Scan] = []
    pos = 0
    while True:
        o = open_re.search(html, pos)
        if o is None:
            break
        gt = html.find(">", o.end())
        if gt < 0:
            break
        c = close_re.search(html, gt + 1)
        if c is None:
            break
        out.append(_Scan(o.start(), html[o.start():c.end()], (html[gt + 1:c.start()],)))
        pos = c.end()
    return out


def _stylesheet_link_matches(html: str) -> list[_Scan]:
    """Matches of <link[^>]*rel=["']?stylesheet["']?[^>]*href=["']([^"']+)["']
    (gi): group 1 is the last quoted href in the tag after its first
    rel=stylesheet."""
    start = _js_re("<link", "gi")
    rel = _next_match_finder(html, _js_re("rel=[\"']?stylesheet", "gi"))
    hrefs = _match_starts(html, _js_re("href=[\"']", "gi"))
    gt = _next_char_finder(html, ">")
    quote = _js_re("[\"']")
    n = len(html)
    last_quote = max(html.rfind('"'), html.rfind("'"))
    out: list[_Scan] = []
    ptr = 0
    pos = 0
    while True:
        m = start.search(html, pos)
        if m is None:
            break
        after = m.end()
        g = int(min(gt(after), n))
        ptr = bisect_left(hrefs, after, ptr)
        end = bisect_left(hrefs, g, ptr)
        # The last href=" in the tag whose value is non-empty and closes.
        h = -1
        for k in range(end - 1, ptr - 1, -1):
            v = hrefs[k] + 6
            if v < n and html[v] not in "\"'" and last_quote > v:
                h = hrefs[k]
                break
        r = rel(after)
        if h >= 0 and r < g and r + (15 if html[int(r) + 4] in "\"'" else 14) <= h:
            q = quote.search(html, h + 7).start()
            out.append(_Scan(m.start(), html[m.start():q + 1], (html[h + 6:q],)))
            pos = q + 1
            continue
        # Every start before g sees less of the same tag.
        if g >= n:
            break
        pos = g + 1
    return out


def _without_media_blocks(css: str) -> str:
    """@media[^{]*\\{[^@]*?\\}\\s*\\} (gi) removed."""
    start = _js_re("@media", "gi")
    double_close = _js_re(r"\}\s*\}")
    close = _next_match_finder(css, double_close)
    at_sign = _next_char_finder(css, "@")
    spans: list[tuple[int, int]] = []
    pos = 0
    while True:
        m = start.search(css, pos)
        if m is None:
            break
        b = css.find("{", m.end())
        if b < 0:
            break
        k = close(b + 1)
        # The first `}` that whitespace and a second `}` follow, before any `@`.
        if k >= at_sign(b + 1):
            pos = b + 1
            continue
        end = double_close.match(css, int(k)).end()
        spans.append((m.start(), end))
        pos = end
    return _replace_spans(css, spans, "")


def _without_keyframes_blocks(css: str) -> str:
    """@keyframes\\s+[^{]+\\{[^@]*?\\} (gi) removed."""
    start = _js_re("@keyframes", "gi")
    rbrace = _next_char_finder(css, "}")
    at_sign = _next_char_finder(css, "@")
    n = len(css)
    spans: list[tuple[int, int]] = []
    pos = 0
    while True:
        m = start.search(css, pos)
        if m is None:
            break
        after = m.end()
        if not (after < n and css[after] in _JS_WS_SET):
            pos = m.start() + 1
            continue
        b = css.find("{", after)
        if b < 0:
            break
        if b < after + 2:
            pos = m.start() + 1
            continue
        c = rbrace(b + 1)
        if c >= at_sign(b + 1):
            pos = b + 1
            continue
        spans.append((m.start(), int(c) + 1))
        pos = int(c) + 1
    return _replace_spans(css, spans, "")


def _root_token_blocks(css: str) -> list[_Scan]:
    """Matches of :root(?:\\s*,\\s*:host)?\\s*\\{([^}]*)\\} (g): groups (body,)."""
    start = _js_re(":root", "g")
    host = _js_re(r"\s*,\s*:host")
    n = len(css)
    out: list[_Scan] = []
    pos = 0
    while True:
        m = start.search(css, pos)
        if m is None:
            break
        p = m.end()
        b = -1
        h = host.match(css, p)
        if h:
            q = _ws_end(css, h.end())
            if q < n and css[q] == "{":
                b = q
        if b < 0:
            q = _ws_end(css, p)
            if q < n and css[q] == "{":
                b = q
        if b < 0:
            pos = m.start() + 1
            continue
        c = css.find("}", b + 1)
        if c < 0:
            break
        out.append(_Scan(m.start(), css[m.start():c + 1], (css[b + 1:c],)))
        pos = c + 1
    return out


def _custom_property_values(block: str) -> list[_Scan]:
    """Matches of --([\\w-]+)\\s*:\\s*([^;]+?)(?:;|$) (g): groups (name, value)."""
    out: list[_Scan] = []
    n = len(block)
    pos = 0
    while True:
        i = block.find("--", pos)
        if i < 0:
            break
        r = _name_end(block, i + 2)
        if r == i + 2:
            pos = i + 1
            continue
        colon = _ws_end(block, r)
        if not (colon < n and block[colon] == ":"):
            # Every later `--` inside the same name ends at the same r.
            pos = r
            continue
        v = _ws_end(block, colon + 1)
        # ([^;]+?) needs one character: when the space runs up to a ';' or the
        # end, the last space is that character.
        if v >= n or block[v] == ";":
            if v == colon + 1:
                pos = r
                continue
            v -= 1
        e = block.find(";", v + 1)
        if e < 0:
            e = n
        stop = e + 1 if e < n else n
        out.append(_Scan(i, block[i:stop], (block[i + 2:r], block[v:e])))
        pos = stop
    return out


def _has_view_transition_navigation(body: str) -> bool:
    """v05: @view-transition\\s*\\{[^}]*navigation\\s*:\\s*auto (i) found."""
    start = _js_re("@view-transition", "gi")
    found = _next_match_finder(body, _js_re(r"navigation\s*:\s*auto", "gi"))
    close = _next_char_finder(body, "}")
    n = len(body)
    pos = 0
    while True:
        m = start.search(body, pos)
        if m is None:
            return False
        b = _ws_end(body, m.end())
        if not (b < n and body[b] == "{"):
            pos = m.start() + 1
            continue
        c = close(b + 1)
        if found(b + 1) < c:
            return True
        if c == _INF:
            return False
        # Every later start before c reads the same body, or less of it.
        pos = int(c) + 1


def _reduced_motion_queries(code: str) -> list[_Scan]:
    """v05: matches of @media[^{]*prefers-reduced-motion\\s*:\\s*(reduce|no-preference)\\b[^{]*\\{ (gi)."""
    return _prelude_matches(
        code,
        _js_re("@media", "gi"),
        _js_re("prefers-reduced-motion", "gi"),
        _js_re(r"prefers-reduced-motion\s*:\s*(reduce|no-preference)\b", "i"),
    )


def _has_title_text(html: str) -> bool:
    """v07: <title\\b[^>]*>[^<]+<\\/title> (i) found."""
    start = _js_re(r"<title\b", "gi")
    close = _js_re(r"<\/title>", "i")
    pos = 0
    while True:
        m = start.search(html, pos)
        if m is None:
            return False
        g = html.find(">", m.end())
        if g < 0:
            return False
        lt = html.find("<", g + 1)
        if lt < 0:
            return False
        if lt > g + 1 and close.match(html, lt):
            return True
        # Every start before g reaches the same `>` and the same `<` after it.
        pos = g + 1


def _heading_line_heights(css: str) -> list[_Scan]:
    """v17: (?:h1|h2|h3|h4|h5|h6|\\.h\\d|heading|title)[^{]*\\{[^}]*line-height\\s*:\\s*([0-9.]+) (gi)."""
    return _rule_body_scan(
        css, _braced_starts(css, _js_re(r"h1|h2|h3|h4|h5|h6|\.h\d|heading|title", "gi")),
        _js_re("line-height", "gi"), _js_re(r"line-height\s*:\s*([0-9.]+)", "i"), False,
    )


def _body_line_heights(css: str) -> list[_Scan]:
    """v17: (?:body|p|article|\\.body|\\.prose|\\.copy)[^{]*\\{[^}]*line-height\\s*:\\s*([0-9.]+) (gi)."""
    return _rule_body_scan(
        css, _braced_starts(css, _js_re(r"body|p|article|\.body|\.prose|\.copy", "gi")),
        _js_re("line-height", "gi"), _js_re(r"line-height\s*:\s*([0-9.]+)", "i"), False,
    )


def _selection_rules(css: str) -> list[str]:
    """v20: every match of ::selection\\s*\\{[^}]*\\} (gi)."""
    start = _js_re("::selection", "gi")
    n = len(css)
    out: list[str] = []
    pos = 0
    while True:
        m = start.search(css, pos)
        if m is None:
            break
        b = _ws_end(css, m.end())
        if not (b < n and css[b] == "{"):
            pos = m.start() + 1
            continue
        c = css.find("}", b + 1)
        if c < 0:
            break
        out.append(css[m.start():c + 1])
        pos = c + 1
    return out


def _input_tags(html: str) -> list[str]:
    """v27: every match of <input\\b[^>]*> (gi)."""
    start = _js_re(r"<input\b", "gi")
    out: list[str] = []
    pos = 0
    while True:
        m = start.search(html, pos)
        if m is None:
            break
        g = html.find(">", m.end())
        if g < 0:
            break
        out.append(html[m.start():g + 1])
        pos = g + 1
    return out


def _font_size_var_matches(css: str) -> list[_Scan]:
    """v27: the matches (font-size\\s*:\\s*)(var\\([^;{}]*\\)) (gi) hands a
    replacement: groups (lead, value)."""
    start = _js_re("font-size", "gi")
    var_at = _js_re(r"var\(", "i")
    stop_at = _js_re("[;{}]")
    n = len(css)
    out: list[_Scan] = []
    pos = 0
    while True:
        m = start.search(css, pos)
        if m is None:
            break
        colon = _ws_end(css, m.end())
        if not (colon < n and css[colon] == ":"):
            pos = m.start() + 1
            continue
        v = _ws_end(css, colon + 1)
        if not var_at.match(css, v):
            pos = m.start() + 1
            continue
        s = stop_at.search(css, v + 4)
        r = s.start() if s else n
        close = css.rfind(")", v + 4, r)
        if close >= 0:
            out.append(_Scan(m.start(), css[m.start():close + 1], (css[m.start():v], css[v:close + 1])))
        # Every later start before r ends at the same r and finds no ')' after this one.
        pos = r
    return out


def _field_font_sizes(sheet: str) -> list[_Scan]:
    """v27: (?:input|textarea|select|\\.input|\\.field)[^{]*\\{[^}]*font-size\\s*:\\s*(\\d+(?:\\.\\d+)?)(px|rem) (gi)."""
    return _rule_body_scan(
        sheet, _braced_starts(sheet, _js_re(r"input|textarea|select|\.input|\.field", "gi")),
        _js_re("font-size", "gi"), _js_re(r"font-size\s*:\s*(\d+(?:\.\d+)?)(px|rem)", "i"), False,
    )


def _field_font_floors(sheet: str) -> list[_Scan]:
    """v27: input\\s*(?:,[^{]*)?\\{[^}]*font-size\\s*:\\s*(?:1rem|16px|1\\.0(?:\\d+)?rem|[2-9]\\dpx) (gi)."""
    return _rule_body_scan(
        sheet, _input_floor_starts(sheet),
        _js_re("font-size", "gi"), _js_re(r"font-size\s*:\s*(?:1rem|16px|1\.0(?:\d+)?rem|[2-9]\dpx)", "i"), False,
    )


def _media_query_has_hover_guard(css: str) -> bool:
    """v08: @media[^{]*(?:hover\\s*:\\s*hover|pointer\\s*:\\s*fine) (i) found."""
    return _prelude_has(css, _js_re("@media", "gi"), _js_re(r"hover\s*:\s*hover|pointer\s*:\s*fine", "gi"))


def _has_breath_keyframes(css: str) -> bool:
    """v08: @keyframes\\s+[^{]*breath[^{]*\\{[^}]*opacity\\s*: (i) found."""
    return len(_rule_body_scan(css, _breath_keyframe_starts(css), _js_re("opacity", "gi"), _js_re(r"opacity\s*:", "i"), True)) > 0


def _focus_strips_outline(css: str) -> bool:
    """v09: :focus[^{]*\\{[^}]*outline\\s*:\\s*(none|0)\\s*[;}] (i) found."""
    return len(_rule_body_scan(
        css, _braced_starts(css, _js_re(":focus", "gi")),
        _js_re("outline", "gi"), _js_re(r"outline\s*:\s*(none|0)\s*[;}]", "i"), True,
    )) > 0


def _focus_has_ring(css: str) -> bool:
    """v09: :focus[^{]*\\{[^}]*(box-shadow|outline\\s*:\\s*[^n0]) (i) found."""
    return len(_rule_body_scan(
        css, _braced_starts(css, _js_re(":focus", "gi")),
        _js_re("box-shadow|outline", "gi"), _js_re(r"(box-shadow|outline\s*:\s*[^n0])", "i"), True,
    )) > 0


def _has_transform_ease_transition(css: str) -> bool:
    """v10: transition\\s*:[^;]*transform[^;]*(ease-out|cubic-bezier\\([^)]*0[, ]) (i) found."""
    start = _js_re(r"transition\s*:", "gi")
    transform = _next_match_finder(css, _js_re("transform", "gi"))
    ease = _next_match_finder(css, _js_re("ease-out", "gi"))
    paren = _next_char_finder(css, ")")
    beziers = _match_starts(css, _js_re(r"cubic-bezier\(", "gi"))
    zeros = _match_starts(css, _js_re("0[, ]", "g"))
    n = len(css)
    pos = 0
    while True:
        m = start.search(css, pos)
        if m is None:
            return False
        p = m.end()
        r = css.find(";", p)
        if r < 0:
            r = n
        t = transform(p)
        if t < r:
            from_ = int(t) + 9
            if ease(from_) < r:
                return True
            # A cubic-bezier( that starts before r and holds a 0 followed by a
            # comma or a space before its first ')'.
            k = bisect_left(beziers, from_)
            while k < len(beziers) and beziers[k] < r:
                inner = beziers[k] + 13
                z = bisect_left(zeros, inner)
                if z < len(zeros) and zeros[z] + 1 < paren(inner):
                    return True
                k += 1
        # Every later start before r reads the same declaration, or less of it.
        if r >= n:
            return False
        pos = r + 1


def _percent_after(p: str) -> tuple[str, str] | None:
    """color-mix: ^([\\s\\S]*?)\\s+(\\d*\\.?\\d+)%$ on `p`: groups (colour, number)."""
    n = len(p)
    if n == 0 or p[-1] != "%":
        return None
    q = n - 1
    while q > 0 and p[q - 1] in "0123456789.":
        q -= 1
    if not _js_re(r"^(?:\d+(?:\.\d+)?|\.\d+)$").search(p[q:n - 1]):
        return None
    if q == 0 or p[q - 1] not in _JS_WS_SET:
        return None
    w = q - 1
    while w > 0 and p[w - 1] in _JS_WS_SET:
        w -= 1
    return (p[:w], p[q:n - 1])


def _relative_color_match(args: str) -> tuple[str, str, str | None] | None:
    """Relative colour syntax:
    ^from\\s+([\\s\\S]+?)\\s+(r\\s+g\\s+b|h\\s+s\\s+l|l\\s+c\\s+h|l\\s+a\\s+b)\\s*(?:\\/\\s*([\\s\\S]+))?$
    on `args`: groups (base, channels, alpha)."""
    if not args.startswith("from") or len(args) < 5 or args[4] not in _JS_WS_SET:
        return None
    channels = _js_re(r"(r\s+g\s+b|h\s+s\s+l|l\s+c\s+h|l\s+a\s+b)\s*(?:\/\s*([\s\S]+))?$")
    start = _ws_end(args, 4)
    # The base is lazy: it ends at the first run of space after its first
    # character that the channel keywords and the rest of the value follow.
    k = start + 1
    while k < len(args):
        if args[k] not in _JS_WS_SET:
            k += 1
            continue
        w = _ws_end(args, k)
        t = channels.match(args, w)
        if t:
            return (args[start:k], t.group(1), t.group(2))
        k = w + 1
    # With less of the leading space taken, the base can be one space whose
    # following space leads straight to the keywords.
    if start - 4 >= 3:
        t = channels.match(args, start)
        if t:
            return (args[start - 2:start - 1], t.group(1), t.group(2))
    return None


# ── Page fetch ───────────────────────────────────────────────────────────────


def _extract_css_parts(html: str, base_url: str) -> list[str]:
    """route.ts extractCssLinks: inline <style> bodies, then stylesheet URLs.

    The link pattern needs rel before href, as the live engine's does; a page
    that writes href first has that sheet ignored by both engines alike.
    """
    parts = [m.groups[0] for m in _style_elements(html)]
    for m in _stylesheet_link_matches(html):
        try:
            parts.append(urljoin(base_url, m.groups[0]))
        except ValueError:
            pass  # malformed href, ignored as the live engine does
    return parts


def _fetch_page_parts(url: str) -> tuple[str, str, list[str]]:
    """Fetch a page and its CSS the way route.ts fetchPageResilient assembles it.

    Inline <style> text first, then each distinct linked stylesheet (at most
    _MAX_STYLESHEETS) in document order, joined with newlines. A sheet that
    fails to load is dropped, not fatal. The third item lists the URLs read:
    the page, then each sheet that loaded.
    """
    html = _fetch(url, as_json=False)
    read = [url]
    parts = _extract_css_parts(html, url)
    css_parts = [p for p in parts if not p.startswith("http")]
    external = list(dict.fromkeys(p for p in parts if p.startswith("http")))
    for href in external[:_MAX_STYLESHEETS]:
        try:
            text = _fetch(href, as_json=False)
        except Exception:
            continue
        read.append(href)
        if text:
            css_parts.append(text)
    return html, "\n".join(css_parts), read


# ── Tokens ───────────────────────────────────────────────────────────────────


def _extract_root_tokens(css: str) -> dict[str, str]:
    """engine.ts extractRootTokens: custom properties declared in :root.

    Media-query :root blocks (one level deep) are stripped first, so an
    accessibility override does not replace the base token. `:root, :host`
    (the block Tailwind v4 writes its theme into) is read too, from 1.3.0.
    """
    stripped = _without_media_blocks(css)
    tokens: dict[str, str] = {}
    for block in _root_token_blocks(stripped):
        for prop in _custom_property_values(block.groups[0]):
            tokens[f"--{prop.groups[0]}"] = _js_trim(prop.groups[1])
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


def _srgb_to_linear(c: float) -> float:
    s = c / 255
    return s / 12.92 if s <= 0.03928 else _js_pow((s + 0.055) / 1.055, 2.4)


def _relative_luminance(rgb: Rgb) -> float:
    return 0.2126 * _srgb_to_linear(rgb[0]) + 0.7152 * _srgb_to_linear(rgb[1]) + 0.0722 * _srgb_to_linear(rgb[2])


def _contrast_ratio(a: Rgb, b: Rgb) -> float:
    la = _relative_luminance(a)
    lb = _relative_luminance(b)
    return (_js_max(la, lb) + 0.05) / (_js_min(la, lb) + 0.05)


def _split_css_top_level(s: str, sep: str) -> list[str]:
    """engine.ts splitCssTopLevel: split outside parentheses, brackets and quotes."""
    out: list[str] = []
    depth = 0
    quote = ""
    start = 0
    i = 0
    n = len(s)
    while i < n:
        ch = s[i]
        if quote:
            if ch == "\\":
                i += 1
            elif ch == quote:
                quote = ""
            i += 1
            continue
        if ch in ('"', "'"):
            quote = ch
            i += 1
            continue
        if ch in ("(", "["):
            depth += 1
        elif ch in (")", "]") and depth > 0:
            depth -= 1
        elif depth == 0 and ((ch in (" ", "\n", "\t", "\r", "\f")) if sep == " " else ch == sep):
            piece = _js_trim(s[start:i])
            if piece:
                out.append(piece)
            start = i + 1
        i += 1
    piece = _js_trim(s[start:])
    if piece:
        out.append(piece)
    return out


def _substitute_css_vars(value: str, scope: list[dict[str, str]], depth: int = 0) -> str | None:
    """engine.ts substituteCssVars: each var(--x[, fallback]) replaced from the first scope declaring it."""
    if depth > 16:
        return None
    out = ""
    i = 0
    while True:
        k = value.find("var(", i)
        if k < 0:
            return out + value[i:]
        out += value[i:k]
        d = 0
        j = k + 3
        while j < len(value):
            if value[j] == "(":
                d += 1
            elif value[j] == ")":
                d -= 1
                if d == 0:
                    break
            j += 1
        if j >= len(value):
            return None
        inner = value[k + 4 : j]
        parts = _split_css_top_level(inner, ",")
        name = _js_trim(parts[0] if parts else "")
        comma = inner.find(",")
        fallback = None if comma < 0 else _js_trim(inner[comma + 1 :])
        rep: str | None = None
        for s in scope:
            if name in s:
                rep = s[name]
                break
        if rep is None:
            rep = fallback
        if rep is None:
            return None
        sub = _substitute_css_vars(rep, scope, depth + 1)
        if sub is None:
            return None
        out += sub
        i = j + 1


Rgba = tuple[float, float, float, float]

_CSS_NAMED_COLORS: dict[str, Rgba] = {
    "transparent": (0, 0, 0, 0), "white": (255, 255, 255, 1), "black": (0, 0, 0, 1),
    "red": (255, 0, 0, 1), "green": (0, 128, 0, 1), "blue": (0, 0, 255, 1), "yellow": (255, 255, 0, 1),
    "orange": (255, 165, 0, 1), "gray": (128, 128, 128, 1), "grey": (128, 128, 128, 1),
    "silver": (192, 192, 192, 1), "maroon": (128, 0, 0, 1), "purple": (128, 0, 128, 1),
    "navy": (0, 0, 128, 1), "teal": (0, 128, 128, 1), "olive": (128, 128, 0, 1), "lime": (0, 255, 0, 1),
}


def _cbrt(x: float) -> float:
    """Math.cbrt (math.cbrt is Python 3.11+)."""
    if hasattr(math, "cbrt"):
        return math.cbrt(x)
    return math.copysign(abs(x) ** (1 / 3), x)


def _srgb_to_oklab(rgb: Rgb) -> Rgb:
    lin = []
    for c in rgb:
        s = c / 255
        lin.append(s / 12.92 if s <= 0.04045 else _js_pow((s + 0.055) / 1.055, 2.4))
    l = _cbrt(0.4122214708 * lin[0] + 0.5363325363 * lin[1] + 0.0514459929 * lin[2])
    m = _cbrt(0.2119034982 * lin[0] + 0.6806995451 * lin[1] + 0.1073969566 * lin[2])
    s = _cbrt(0.0883024619 * lin[0] + 0.2817188376 * lin[1] + 0.6299787005 * lin[2])
    return (
        0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
        1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
        0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
    )


def _oklab_to_srgb(lab: Rgb) -> Rgb:
    """Oklab to 0-255 sRGB, clipped per channel to the sRGB gamut."""
    L, a, b = lab
    l = _js_pow(L + 0.3963377774 * a + 0.2158037573 * b, 3)
    m = _js_pow(L - 0.1055613458 * a - 0.0638541728 * b, 3)
    s = _js_pow(L - 0.0894841775 * a - 1.291485548 * b, 3)
    lin = (
        4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
        -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
        -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
    )
    out = []
    for c in lin:
        x = _js_min(1, _js_max(0, c))
        g = 12.92 * x if x <= 0.0031308 else 1.055 * _js_pow(x, 1 / 2.4) - 0.055
        out.append(_js_min(1, _js_max(0, g)) * 255)
    return (out[0], out[1], out[2])


def _css_number(token: str, percent_scale: float) -> float | None:
    t = _js_trim(token).lower()
    if t == "none":
        return 0
    # Engine 1.5.1: \d+(?:\.\d*)? reads the integer part once (\d+\.?\d* tried
    # every split of a digit run between its two quantifiers).
    m = _js_re(r"^([+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?)(%|deg|turn|rad|grad)?$").search(t)
    if not m:
        return None
    x = _js_float(m.group(1))
    unit = m.group(2)
    if unit == "%":
        return (x / 100) * percent_scale
    if unit == "turn":
        return x * 360
    if unit == "rad":
        return (x * 180) / math.pi
    if unit == "grad":
        return x * 0.9
    return x


def _css_alpha(token: str | None) -> float | None:
    if token is None:
        return 1
    a = _css_number(token, 1)
    return None if a is None else _js_min(1, _js_max(0, a))


def _css_color_args(args: str) -> list[str] | None:
    """Function arguments as [c1, c2, c3, alpha?], comma or space syntax."""
    slash = _split_css_top_level(args, "/")
    head = slash[0] if slash else ""
    channels = _split_css_top_level(head, ",") if "," in head else _split_css_top_level(head, " ")
    if len(slash) == 2:
        channels.append(slash[1])
    if len(slash) > 2 or len(channels) < 3 or len(channels) > 4:
        return None
    return channels


def _hsl_to_rgb(h: float, s: float, l: float) -> Rgb:
    hh = math.fmod(math.fmod(h, 360) + 360, 360) / 360

    def f(n: float) -> float:
        k = math.fmod(n + hh * 12, 12)
        return l - s * _js_min(l, 1 - l) * _js_max(-1, _js_min(_js_min(k - 3, 9 - k), 1))

    return (f(0) * 255, f(8) * 255, f(4) * 255)


def _parse_css_color(value: str, dark: bool, depth: int = 0) -> Rgba | None:
    """engine.ts parseCssColor: a CSS colour value, vars already substituted, to (r, g, b, alpha)."""
    if depth > 8:
        return None
    v = _js_trim(value).lower()
    if not v:
        return None
    if v[0] == "#":
        hx = v[1:]
        if not _js_re(r"^[0-9a-f]+$").search(hx) or len(hx) not in (3, 4, 6, 8):
            return None
        full = "".join(c + c for c in hx) if len(hx) <= 4 else hx
        ch = [int(full[k : k + 2], 16) if k < len(full) else 255 for k in (0, 2, 4, 6)]
        return (ch[0], ch[1], ch[2], ch[3] / 255)
    if v in _CSS_NAMED_COLORS:
        return _CSS_NAMED_COLORS[v]
    fn = _js_re(r"^([a-z-]+)\(([\s\S]*)\)$").search(v)
    if not fn:
        return None
    name = fn.group(1)
    args = _js_trim(fn.group(2))
    if name == "light-dark":
        pair = _split_css_top_level(args, ",")
        return _parse_css_color(pair[1 if dark else 0], dark, depth + 1) if len(pair) == 2 else None
    if name == "color-mix":
        parts = _split_css_top_level(args, ",")
        if len(parts) != 3:
            return None
        sm = _js_re(r"^in\s+([a-z-]+)").search(parts[0])
        space = sm.group(1) if sm else ""
        if space not in ("srgb", "oklab", "oklch"):
            return None

        def side(p: str) -> tuple[str, float | None]:
            after = _percent_after(p)
            # The number without the ambiguous \d*\.?\d+ (engine 1.5.1).
            before = _js_re(r"^(\d+(?:\.\d+)?|\.\d+)%\s+([\s\S]*)$").search(p)
            if after:
                return after[0], _js_float(after[1]) / 100
            if before:
                return before.group(2), _js_float(before.group(1)) / 100
            return p, None

        a_color, p1 = side(parts[1])
        b_color, p2 = side(parts[2])
        ca = _parse_css_color(a_color, dark, depth + 1)
        cb = _parse_css_color(b_color, dark, depth + 1)
        if not ca or not cb:
            return None
        if p1 is None and p2 is None:
            p1, p2 = 0.5, 0.5
        elif p1 is None:
            p1 = 1 - p2
        elif p2 is None:
            p2 = 1 - p1
        total = p1 + p2
        if total <= 0:
            return None
        w1 = p1 / total
        w2 = p2 / total
        alpha = ca[3] * w1 + cb[3] * w2
        if alpha <= 0:
            return (0, 0, 0, 0)
        if space == "srgb":
            rgb = tuple((ca[k] * ca[3] * w1 + cb[k] * cb[3] * w2) / alpha for k in range(3))
        else:
            la = _srgb_to_oklab((ca[0], ca[1], ca[2]))
            lb = _srgb_to_oklab((cb[0], cb[1], cb[2]))
            if space == "oklab":
                lab = tuple((la[k] * ca[3] * w1 + lb[k] * cb[3] * w2) / alpha for k in range(3))
            else:
                def lch(x: Rgb) -> Rgb:
                    return (x[0], math.hypot(x[1], x[2]), (math.atan2(x[2], x[1]) * 180) / math.pi)

                A = lch(la)
                B = lch(lb)
                h1, h2 = A[2], B[2]
                if A[1] < 1e-4:
                    h1 = h2
                if B[1] < 1e-4:
                    h2 = h1
                if h2 - h1 > 180:
                    h1 += 360
                elif h1 - h2 > 180:
                    h2 += 360
                Lm = (A[0] * ca[3] * w1 + B[0] * cb[3] * w2) / alpha
                Cm = (A[1] * ca[3] * w1 + B[1] * cb[3] * w2) / alpha
                H = ((h1 * w1 + h2 * w2) * math.pi) / 180
                lab = (Lm, Cm * math.cos(H), Cm * math.sin(H))
            rgb = _oklab_to_srgb(lab)
        mult = _js_min(1, total)
        return (_js_round(rgb[0]), _js_round(rgb[1]), _js_round(rgb[2]), _js_round(alpha * mult * 255) / 255)
    rel = _relative_color_match(args)
    if rel:
        base = _parse_css_color(rel[0], dark, depth + 1)
        if not base:
            return None
        a = base[3] if rel[2] is None else _css_alpha(rel[2])
        return None if a is None else (base[0], base[1], base[2], a)
    if name == "color":
        m = _js_re(r"^srgb\s+([\s\S]+)$").search(args)
        ch = _css_color_args(m.group(1)) if m else None
        if not ch:
            return None
        c = [_css_number(t, 1) for t in ch[:3]]
        a = _css_alpha(ch[3] if len(ch) > 3 else None)
        if any(x is None for x in c) or a is None:
            return None
        return (c[0] * 255, c[1] * 255, c[2] * 255, a)
    ch = _css_color_args(args)
    if not ch:
        return None
    alpha = _css_alpha(ch[3] if len(ch) > 3 else None)
    if alpha is None:
        return None
    if name in ("rgb", "rgba"):
        c = [_css_number(t, 255) for t in ch[:3]]
        if any(x is None for x in c):
            return None
        return (*(_js_min(255, _js_max(0, x)) for x in c), alpha)
    if name in ("hsl", "hsla"):
        h = _css_number(ch[0], 1)
        s = _css_number(ch[1] if ch[1].endswith("%") else f"{ch[1]}%", 1)
        l = _css_number(ch[2] if ch[2].endswith("%") else f"{ch[2]}%", 1)
        if h is None or s is None or l is None:
            return None
        return (*_hsl_to_rgb(h, _js_min(1, _js_max(0, s)), _js_min(1, _js_max(0, l))), alpha)
    if name in ("oklch", "oklab"):
        L = _css_number(ch[0], 1)
        x = _css_number(ch[1], 0.4)
        y = _css_number(ch[2], 1 if name == "oklch" else 0.4)
        if L is None or x is None or y is None:
            return None
        lab = (L, x * math.cos((y * math.pi) / 180), x * math.sin((y * math.pi) / 180)) if name == "oklch" else (L, x, y)
        return (*_oklab_to_srgb(lab), alpha)
    return None


def _resolve_theme_color(value: str, scope: list[dict[str, str]], dark: bool) -> Rgba | None:
    """engine.ts resolveThemeColor: vars substituted, then parsed; bare HSL channels read as hsl()."""
    sub = _substitute_css_vars(value, scope)
    if sub is None:
        return None
    direct = _parse_css_color(sub, dark)
    if direct:
        return direct
    if _js_re(r"^\s*-?[\d.]+(?:deg)?\s+[\d.]+%\s+[\d.]+%\s*$").search(sub):
        return _parse_css_color(f"hsl({sub})", dark)
    return None


def _composite(fg: Rgba, bg: Rgba) -> Rgba:
    """engine.ts v44Composite: fg over an opaque bg, rounded to 8 bits as a browser paints it."""
    a = _js_round(fg[3] * 255) / 255
    return (
        _js_round(fg[0] * a + bg[0] * (1 - a)),
        _js_round(fg[1] * a + bg[1] * (1 - a)),
        _js_round(fg[2] * a + bg[2] * (1 - a)),
        1,
    )


def _resolve_token_color(value: str, tokens: dict[str, str], under: Rgb | None) -> Rgb | None:
    """engine.ts resolveTokenColor: a token value as the opaque sRGB colour v06 and v22 measure.

    Read through the CSS Color 4 reader (oklch, space-syntax rgb/hsl, 8-digit
    hex, color-mix, light-dark read light). A translucent colour is
    composited over `under`; with nothing under it, it is not measured.
    """
    if not _js_trim(value):
        return None
    c = _resolve_theme_color(value, [tokens], False)
    if not c:
        return None
    if c[3] >= 1:
        return (c[0], c[1], c[2])
    if under is None:
        return None
    painted = _composite(c, (under[0], under[1], under[2], 1))
    return (painted[0], painted[1], painted[2])


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
    # A contract that names its primary action pair (--action fill, --on-action
    # label) is measured on exactly that pair; otherwise the better of --paper
    # or --ink on --signal, as before.
    action_val = tokens.get("--action")
    on_action_val = tokens.get("--on-action")
    # The page under a translucent fill is --paper; a translucent label sits on the fill.
    page_rgb = _resolve_token_color(tokens.get("--paper") or "", tokens, None)
    if action_val and on_action_val:
        fill_rgb = _resolve_token_color(action_val, tokens, page_rgb)
        label_rgb = _resolve_token_color(on_action_val, tokens, fill_rgb) if fill_rgb else None
        if not fill_rgb or not label_rgb:
            return _chk("v22", item, "accessibility", "SKIP", f"--action {action_val} or --on-action {on_action_val} unresolvable to RGB")
        pair = _contrast_ratio(label_rgb, fill_rgb)
        pair_str = f"{_js_fixed(pair, 2)}:1"
        if pair >= 4.5:
            return _chk("v22", item, "accessibility", "PASS", f"--on-action on --action = {pair_str} (≥ 4.5:1 AA)")
        if pair >= 3:
            return _chk("v22", item, "accessibility", "WARN", f"--on-action on --action = {pair_str} (passes 3:1 large-text, fails 4.5:1 body)")
        return _chk("v22", item, "accessibility", "FAIL", f"--on-action on --action = {pair_str} (below 3:1, illegible)")
    signal_val = tokens.get("--signal")
    if not signal_val:
        return _chk("v22", item, "accessibility", "WARN", "--signal accent token not declared")
    signal_rgb = _resolve_token_color(signal_val, tokens, page_rgb)
    if not signal_rgb:
        return _chk("v22", item, "accessibility", "SKIP", f"--signal value {signal_val} unresolvable to RGB")
    best_ratio: float = 0
    best_name = ""
    for name in ("--paper", "--ink"):
        rgb = _resolve_token_color(tokens.get(name) or "", tokens, signal_rgb)
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
    paper_rgb = _resolve_token_color(paper_val, tokens, None)
    if not paper_rgb:
        return _chk("v06", item, "accessibility", "SKIP", f"--paper value {paper_val} unresolvable to RGB")
    results: list[str] = []
    worst_name, worst_ratio, worst_status = "", math.inf, "PASS"
    # --muted-foreground, where declared, is the muted text: in the shadcn
    # convention --muted is a surface (engine.ts checkContrastReadable, 1.3.0).
    muted = "--muted-foreground" if tokens.get("--muted-foreground") else "--muted"
    for name in ("--ink", muted, "--muted-dim"):
        val = tokens.get(name)
        if not val:
            results.append(f"{name}: not declared")
            continue
        rgb = _resolve_token_color(val, tokens, paper_rgb)
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
    if _has_view_transition_navigation(body):
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
            for t in _js_re(r"(?:^|[\s,(])(\d+(?:\.\d+)?|\.\d+)(ms|s)\b", "g").finditer(value)
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
    code = _without_css_comments(css, "")
    queries = _reduced_motion_queries(code)
    saw_reduce = saw_opt_in = saw_no_preference = False
    # Each block body ends at the brace that brings the depth back to zero,
    # found for every query in one pass (engine 1.5.1; a walk per query read
    # nested queries' bodies over and over).
    closes = _closing_braces(code, {q.index + len(q.text) - 1 for q in queries})
    # A no-preference block inside one already read opts into motion only if
    # that one does, so it is not read again.
    read_until = -1
    for match in queries:
        value = match.groups[0].lower()
        open_at = match.index + len(match.text) - 1
        close_at = closes.get(open_at, -1)
        body = _js_trim(code[open_at + 1:close_at]) if close_at > open_at else ""
        if value == "no-preference":
            saw_no_preference = True
            if not saw_opt_in and close_at > read_until:
                if _opts_into_motion(body):
                    saw_opt_in = True
                read_until = close_at
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
    return _without_scripts_and_styles(html)


def _check_semantic_html(html: str) -> dict[str, str]:  # checkSemanticHtmlFoundation
    item = "Semantic HTML foundation: single h1, title, meta description, landmark"
    visible = _visible_html(html)
    h1_count = len(_js_re(r"<h1\b", "gi").findall(visible))
    has_title = _has_title_text(html)
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
    stripped = _without_keyframes_blocks(css)
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
    heading = [_js_float(m.groups[0]) for m in _heading_line_heights(css)]
    body = [_js_float(m.groups[0]) for m in _body_line_heights(css)]
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
    rules = _selection_rules(css)
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
    for tag in _input_tags(visible):
        typ = _js_re(r"\stype\s*=\s*[\"']?([a-z-]+)", "i").search(tag)
        if not typ or not _js_re(r"^(?:hidden|checkbox|radio|submit|button|reset|image|file|range|color)$", "i").search(typ.group(1)):
            return True
    return False


def _is_field_selector(selector: str) -> bool:  # isFieldSelector
    """v27 helper (engine 1.3.1): the subject of some selector in the list is an
    input, textarea or select element, or carries the exact class .input or
    .field, and is not a pseudo-element."""
    clean = _without_css_comments(selector, " ")
    for part in _split_css_top_level(clean, ","):
        compounds = _js_re(r"\s*[>+~]\s*|\s+").split(_js_trim(part))
        subject = compounds[-1] if compounds and compounds[-1] else ""
        if "::" in subject:
            continue
        if _js_re(r"(?:^|[^\w.#:-])(?:input|textarea|select)(?![\w-])", "i").search(subject) or _js_re(
            r"\.(?:input|field)(?![\w-])", "i"
        ).search(subject):
            return True
    return False


_RULE_MARKS = re.compile(r"[{};]")


def _rule_selector_finder(css: str) -> Callable[[int], tuple[int, int] | None]:  # ruleSelectorFinder
    """v27 helper (engine 1.4.1): the rule whose body holds the declaration at
    an offset in the sheet, its selector read back from that body's opening
    brace to the previous closing brace, opening brace or semicolon. The finder
    returns (start, open), the selector being css[start:open], or None when
    the offset is not inside a rule body.

    Engine 1.5.1: the finder lists the sheet's braces and semicolons once and
    answers each offset by binary search. Before, each declaration ran three
    rfind scans, each reading back to the last character of its kind, so a
    sheet with no semicolons was read back to its start once per declaration
    and cost the square of its length. Each answer is the one those scans
    gave."""
    opens: list[int] = []
    closes: list[int] = []
    marks: list[int] = []
    for m in _RULE_MARKS.finditer(css):
        k = m.start()
        marks.append(k)
        if css[k] == "{":
            opens.append(k)
        elif css[k] == "}":
            closes.append(k)

    def rule_at(offset: int) -> tuple[int, int] | None:
        i = bisect_right(opens, offset)
        if not i:
            return None
        open_ = opens[i - 1]
        j = bisect_right(closes, offset)
        if j and closes[j - 1] > open_:
            return None
        k = bisect_left(marks, open_)
        return (marks[k - 1] + 1 if k else 0, open_)

    return rule_at


def _field_rule_finder(css: str) -> Callable[[int], bool]:  # fieldRuleFinder
    """v27 helper (engine 1.4.1): for an offset, whether the font-size
    declaration there sits in a rule whose own selector names a field keyword
    (input, textarea, select, .field). v27's literal regexes run `[^{]*` across
    a closing brace, so "select" in `user-select: none` carried into the next
    rule; each candidate is now judged by the selector of the rule it actually
    sits in. Class names such as `.search-input` stay matched, as before. The
    declarations of one rule share its verdict (engine 1.5.1: each one read the
    selector again)."""
    rule_at = _rule_selector_finder(css)
    field = _js_re(r"input|textarea|select|\.field", "i")
    seen = [-1, False]

    def in_field_rule(offset: int) -> bool:
        rule = rule_at(offset)
        if rule is None:
            return False
        if rule[1] != seen[0]:
            seen[0] = rule[1]
            seen[1] = bool(field.search(_without_css_comments(css[rule[0]:rule[1]], " ")))
        return seen[1]

    return in_field_rule


def _resolve_font_size_vars(css: str, tokens: dict[str, str]) -> str:  # resolveFontSizeVars
    """v27 helper (engine 1.3.1): in each rule that styles a field, every
    `font-size: var(...)` is rewritten to its :root token value; a value that
    does not resolve, and every other rule, is left as written."""
    if "var(" not in css:
        return css
    parts: list[str] = []
    rule_at = _rule_selector_finder(css)
    seen = -1
    styled = False
    last = 0
    for m in _font_size_var_matches(css):
        parts.append(css[last:m.index])
        last = m.index + len(m.text)
        rule = rule_at(m.index)
        if rule is None:
            parts.append(m.text)
            continue
        if rule[1] != seen:
            seen = rule[1]
            styled = _is_field_selector(css[rule[0]:rule[1]])
        if not styled:
            parts.append(m.text)
            continue
        sub = _substitute_css_vars(m.groups[1], [tokens])
        parts.append(m.text if sub is None else m.groups[0] + _js_trim(sub))
    parts.append(css[last:])
    return "".join(parts)


def _check_input_font_floor(css: str, html: str, tokens: dict[str, str] | None = None) -> dict[str, str]:  # checkInputFontFloor
    """v27 (engine 1.1.0). A sub-16px input rule FAILs and a declared 16px
    floor PASSes, from the CSS alone. With neither, the page's own markup
    decides: no field iOS Safari can zoom into reads SKIP (it used to WARN),
    and a text field with no floor still WARNs. From engine 1.3.1 a
    `font-size: var(...)` in a rule that styles a field is read through the
    :root token table first (_resolve_font_size_vars).
    """
    item = "Input font-size ≥16px (prevents iOS Safari auto-zoom)"
    css = _resolve_font_size_vars(css, tokens or {})
    in_field_rule = _field_rule_finder(css)
    below: list[str] = []
    for m in _field_font_sizes(css):
        # Engine 1.4.1: only a declaration whose own rule styles a field counts.
        if not in_field_rule(m.index + m.text.rfind("font-size")):
            continue
        val = _js_float(m.groups[0])
        unit = m.groups[1].lower()
        px = val * 16 if unit == "rem" else val
        if px < 16:
            below.append(f"{_js_num(val)}{unit} ({_js_num(px)}px)")
    if not below:
        # Engine 1.4.1: the floor rule must itself style a field, as above.
        has_floor = any(
            in_field_rule(f.index + f.text.rfind("font-size"))
            for f in _field_font_floors(css)
        )
        if has_floor:
            return _chk("v27", item, "accessibility", "PASS", "input font-size floor detected")
        if not _has_zoomable_field(html):
            return _chk("v27", item, "accessibility", "SKIP", "no text input, textarea or select found in HTML: nothing for the 16px floor to protect")
        return _chk("v27", item, "accessibility", "WARN", "no explicit input font-size ≥16px detected: iOS Safari may auto-zoom on focus")
    return _chk("v27", item, "accessibility", "FAIL", f"{len(below)} input(s) below 16px floor: {', '.join(below)}")


def _check_poise_interaction_rules(css: str) -> dict[str, str]:  # checkPoiseInteractionRules
    item = "Poise interaction rules match live /labs/poise and contract.interaction"
    rules: list[tuple[str, Callable[[str], bool]]] = [
        ("fine-pointer hover guard", _media_query_has_hover_guard),
        ("press settle scale ~0.97", lambda s: bool(_js_re(r"scale\s*\(\s*0?\.9[5-9]\s*\)", "i").search(s))),
        ("opacity-only mark breath", _has_breath_keyframes),
    ]
    found = [name for name, test in rules if test(css)]
    missing = [name for name, test in rules if not test(css)]
    if len(found) >= 2:
        return _chk("v08", item, "poise", "PASS", f"static half verified: {', '.join(found)} (interaction-feel half requires browser)")
    return _chk("v08", item, "poise", "WARN", f"missing: {', '.join(missing)}")


def _check_poise_keyboard_path(css: str, html: str) -> dict[str, str]:  # checkPoiseKeyboardPath
    item = "Poise keyboard-path verification remains published and current"
    has_focus_visible = bool(_js_re(r":focus-visible", "i").search(css))
    has_focus = bool(_js_re(r":focus[^-]", "i").search(css))
    strips_outline = _focus_strips_outline(css)
    has_focus_ring = _focus_has_ring(css)
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
    rules: list[tuple[str, Callable[[str], bool]]] = [
        ("stagger enter animation-delay", lambda s: bool(_js_re(r"animation-delay\s*:\s*(?:0?\.(?:0?[6-9]|1[0-2])\d*s|\d{2,3}ms)", "i").search(s))),
        ("soften exit transform ease-out", _has_transform_ease_transition),
        ("concentric border-radius set", lambda s: bool(_js_re(r"border-radius\s*:\s*\d+", "i").search(s))),
    ]
    found = [name for name, test in rules if test(css)]
    missing = [name for name, test in rules if not test(css)]
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
# except that v02 and v21 are measured when the operator sets
# DESIGNESY_CDP_URL to a Chrome DevTools endpoint that answers (the Node
# scripts beside this file open a tab there, measure, and close it). Until
# 1.13.10 any endpoint answering on 127.0.0.1:9222 was used unasked, so a
# score call could open the caller's URL in the operator's own browser. A
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


def _cdp_url() -> str | None:
    """The DevTools endpoint DESIGNESY_CDP_URL names, or None when it is unset."""
    return os.environ.get("DESIGNESY_CDP_URL", "").strip().rstrip("/") or None


def _cdp_available() -> bool:
    """Check that DESIGNESY_CDP_URL is set and its DevTools endpoint answers."""
    base = _cdp_url()
    if base is None:
        return False
    try:
        import urllib.request as ur
        ur.urlopen(f"{base}/json/version", timeout=2).read()
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
_PATH_TAIL_CHARS = frozenset(".,;:!?)")
_FILE_URL = re.compile(r"\bfile://[^\s'\"<>`|]*", re.IGNORECASE)
_UNC_PATH = re.compile(r"\\\\[^\\\s'\"<>`|]+\\(?:[^\\\r\n'\"<>`|*?]+\\)*[^\\\s'\"<>`|*?]*")
_DRIVE_PATH = re.compile(r"(?<![\w\\/])[A-Za-z]:([\\/])(?:[^\\/\r\n'\"<>`|*?]+\1)*[^\\/\s'\"<>`|*?]*")
_POSIX_PATH = re.compile(
    r"(^|[\s'\"`(=,:\[])/(?:home|Users|root|tmp|var|private|opt|usr|srv|mnt|Volumes|Library|app|vercel"
    r"|workspace|workspaces|github|runner|nix|snap)(?:/[^/\r\n'\"<>`|]+(?=/))*/[^/\s'\"<>`|]+"
)
# An npm cache segment is a run of characters other than space, quotes, angle
# brackets, backtick and pipe that holds npm-cache, /_npx/ or /.npm/; the run is
# replaced whole. Each run is read once (engine 1.5.1: the run pattern was
# retried from every character in it).
_NPM_RUN = re.compile(r"[^\s'\"<>`|]+", re.IGNORECASE)
_NPM_MARKER = re.compile(r"npm-cache|[\\/]_npx[\\/]|[\\/]\.npm[\\/]", re.IGNORECASE)


def _path_tail(matched: str) -> str:
    """The trailing run of [.,;:!?)] that `[.,;:!?)]+$` finds, read back from
    the end once (engine 1.5.1: the pattern was retried from every mark in a
    run). Python's `$` also matches before a final newline, so that run counts
    too, as it did."""
    end = len(matched) - 1 if matched.endswith("\n") else len(matched)
    k = end
    while k > 0 and matched[k - 1] in _PATH_TAIL_CHARS:
        k -= 1
    return matched[k:end]


def _path_label(label: str, matched: str) -> str:
    return label + _path_tail(matched)


def _without_npm_cache(text: str) -> str:
    """Each run holding an npm cache marker replaced by its label."""
    parts: list[str] = []
    last = 0
    marker_at: float = -1
    for run in _NPM_RUN.finditer(text):
        a, b = run.span()
        if marker_at < a:
            found = _NPM_MARKER.search(text, a)
            marker_at = found.start() if found else _INF
        if marker_at < b:
            parts.append(text[last:a])
            parts.append(_path_label("the npm cache", text[a:b]))
            last = b
    parts.append(text[last:])
    return "".join(parts)


def _scrub_local_paths(text: str) -> str:
    """Replace local file-system detail in text that leaves this process."""
    text = _FILE_URL.sub(lambda m: _path_label("a local file", m.group(0)), text)
    text = _UNC_PATH.sub(lambda m: _path_label("a local path", m.group(0)), text)
    text = _DRIVE_PATH.sub(lambda m: _path_label("a local path", m.group(0)), text)
    text = _POSIX_PATH.sub(lambda m: m.group(1) + _path_label("a local path", m.group(0)), text)
    return _without_npm_cache(text)


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
        _check_input_font_floor(css, html, raw_tokens),
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
    # No A while any check FAILs, as the live engine rules from 1.3.0
    # (scoreArithmetic): any FAIL caps the score at 89.9%, a B at most.
    ceiling = ""
    if counts["FAIL"] > 0 and score > _ANY_FAIL_CAP:
        score = _ANY_FAIL_CAP
        failed = [c["id"] for c in checks if c["status"] == "FAIL"]
        named = f"{failed[0]} fails" if len(failed) == 1 else f"{', '.join(failed[:-1])} and {failed[-1]} fail"
        ceiling = f" A FAIL caps the grade at B: {named}, and the score cannot exceed 89.9% while any check fails."
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
            f"{round(score * 100, 1)}% ({grade}).{ceiling}"
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
    """POST to the canonical 45-check engine at /api/score.

    The site API is the single source of truth for the contract it serves
    (45 checks, 14 categories). The version is reported from that reply, not
    asserted here, so this docstring names no version to fall stale.
    Returns the normalized response; None when the API cannot be reached at
    all (a URLError with no HTTP status), and the caller falls back to the
    local engine; or an error result when the engine answered without a
    score: an HTTP error status (a refused URL, a rate limit, a page it could
    not reach), ok false, or a reply that is not JSON. Until 1.13.10 those
    fell back too, so a URL the engine refused, such as
    http://100.100.100.200/, was fetched from this machine instead, through
    _validate_url, which lets that address through.
    """
    try:
        data = json.loads(_post_score_api(url, "designesy", scope))
    except urllib.error.HTTPError as exc:
        return _score_declined(url, _score_api_failure(exc))
    except urllib.error.URLError:
        return None
    except Exception as exc:
        return _score_declined(url, _score_api_failure(exc))
    if not isinstance(data, dict) or not data.get("ok"):
        error = data.get("error") if isinstance(data, dict) else None
        return _score_declined(url, _scrub_local_paths(str(error or "the reply was not ok")))

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


def _score_declined(url: str, reason: str) -> dict[str, Any]:
    """The designesy_score error for an engine that answered without a score."""
    return {
        "success": False,
        "error": (
            f"The scoring engine at {BASE_URL}/api/score did not score {url} "
            f"({reason}). The offline engine runs only when the engine "
            "cannot be reached, so nothing was scored locally."
        ),
        "url": url,
    }


def _score_impl(
    url: str | None = None,
    format: str | None = None,
    scope: str | None = None,
) -> dict[str, Any] | str:
    """Score a live URL against the Designesy design contract.

    Primary path: delegate to the canonical 45-check engine at
    /api/score (same engine the npm CLI and site use).

    format designesy (the default) reshapes the engine's native JSON into
    this tool's long-standing shape, and falls back to the offline engine
    (_score_local_impl) when the API is unreachable, so the tool still works
    offline. An engine that answers with an error is not unreachable: its
    error is the result (see _score_remote). The offline engine runs a
    subset of the live engine's checks, mirrors live engine
    OFFLINE_ENGINE_MIRRORS for each one, and applies the same scope: the one
    requested, or the one auto-detected from the URL.

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
    the one auto-detected from the URL. v02 and v21 are measured when
    DESIGNESY_CDP_URL names a Chrome DevTools endpoint that answers, and read
    MANUAL otherwise. It fetches only the page and its stylesheets; the
    contract JSON from designesy.org, which the previous engine's v01 needed,
    is not fetched.
    """
    html, css, read = _fetch_page_parts(url)
    return _tls_flagged(_offline_result(url, html, css, scope, browser_probes=True), *read)


# The live engine's cap on a page with any FAIL (scoreArithmetic, engine
# 1.3.0), as a 0-1 score: 89.9%, the top of the B band.
_ANY_FAIL_CAP = 0.899


def _score_grade(score: float) -> str:
    """Letter grade for a 0-1 score, on the live engine's bands (computeGrade).

    A 90 and up, B 80, C 70, D 60, F under 60, read on the percentage at one
    decimal, the number score_percent reports, so the letter always matches the
    number shown. Until 1.3.0 this used A 95, B 85, C 75, so 92% read B here and
    A everywhere else; test/test_grade_parity.py reads the bands from engine.ts.
    """
    pct = round(score * 100, 1)
    if pct >= 90:
        return "A"
    if pct >= 80:
        return "B"
    if pct >= 70:
        return "C"
    if pct >= 60:
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
            "the deterministic 45-check verification engine at "
            "https://www.designesy.org/api/score. Returns a numeric score, "
            "a letter grade (A-F), and the check results. "
            "Use this to audit whether a website or AI-generated UI "
            "complies with a real design contract (tokens, motion, "
            "accessibility, cadence, takt, typography, copywriting). When "
            "NOT to use: for token-file validation only, use "
            "designesy_tokens_score; for a Lottie file, use "
            "designesy_motion_score; for a qualitative critique, use "
            "designesy_design_review. The engine fetches the URL "
            "server-side, extracts its CSS, and runs 45 checks. Results "
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
            "engine: 27 of the 45 checks run locally, each mirroring the "
            "live engine's verdict, under the same scope. Its result adds "
            "engine (kind offline, the engine version it mirrors, and the "
            "checks it did not run) and scope, and its note says so. "
            "Offline, overflow (v02) and Core Web Vitals (v21) are measured "
            "only when the server sets DESIGNESY_CDP_URL to a Chrome "
            "DevTools endpoint, where the page opens in a new tab; otherwise "
            "both read MANUAL. An engine that answers with an error (a "
            "refused URL, a rate limit, a page it could not reach) returns "
            "that error, and nothing is scored offline. The other three "
            "formats return an error, because only the live engine produces "
            "them."
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
            "(the spec's first stable version, published Oct 28 2025 as a "
            "Candidate Recommendation and considered stable). Returns 10 "
            "conformance checks (t01-t10) with PASS, FAIL, WARN or SKIP. Use this "
            "to verify a tokens.json (or any DTCG token export) is "
            "structurally correct: $type/$value/$description present, "
            "structured colors (colorSpace + components rather than bare "
            "hex), a valid $schema pointer to designtokens.org, and "
            "correct dimension units. With 84% of teams now using design "
            "tokens (zeroheight Design Systems Report 2025, up from 56% in 2024) and the spec finally stable, "
            "every adopting team needs a validator. When NOT to use: for "
            "scoring a whole live site (not just its token file), use "
            "designesy_score. Executable: fetches the URL or parses the "
            "raw JSON you provide, runs 10 checks server-side. No "
            "browser needed. Score: PASS=1, WARN=0.5, FAIL=0, SKIP is not "
            "scored; points / scored checks x 100. Returns JSON: { "
            "contract_id, contract_version, contract_status, url, "
            "total_tokens, score (0-100), grade (A-F), pass_count, "
            "fail_count, warn_count, skip_count, scoring, checks[{id "
            "(t01-t10), name, status (PASS, FAIL, WARN or SKIP), detail}], "
            "provenance, validator_note }. Pass url "
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
            "Does NOT run the scan: axe-core needs a real browser DOM. "
            "Returns the 11 checks + a Playwright script you execute "
            "locally (npm i -D @axe-core/playwright). The score comes "
            "from your local run, not from this tool. Returns JSON: { "
            'checks[{id (a01-a11), name, status: "PENDING_EXECUTION"}], '
            "playwright_script, install_command, run_command }. Pass "
            "config (JSON string) to customize axe.configure(), for "
            "example with branding overrides or rule disables. Omit for "
            "standard WCAG 2.2 AA."
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
            "Validate one Lottie animation file against the Designesy motion "
            "contract: its ten checks (m01-m10), drawn from the Lottie spec "
            "v1.0.1 and the Designesy §16 Ten Non-Negotiable Motion Standards. "
            "Each check returns PASS, FAIL, WARN or SKIP under the contract's "
            "own name for its id: m01 the schema's top-level animation object "
            "(layer contents are not validated, so a clean file returns SKIP, "
            "not PASS), m02 the required fields (v, fr, ip, op, w, h, layers), "
            "m03 no deprecated 4.x Bodymovin version, m04 a markers array, m05 "
            "a meta object, m06 a reduced-motion path (a marker or slot named "
            "for it, or a meta note of an external prefers-reduced-motion "
            "wrapper), m07 keyframe easing (linear, ease and ease-in curves "
            "fail), m08 duration within 300 ms (longer returns WARN, since a "
            "justification cannot be read from a file), m09 layout-property "
            "animation and m10 keyboard-initiated motion (both SKIP: they "
            "concern the page that embeds the file). Use this to check that a "
            "motion asset is well formed and carries reduced-motion support. "
            "When NOT to use: for the motion CSS of a whole site, use "
            "designesy_score. Executable: fetches the URL or parses the inline "
            "JSON; no browser needed. Score: PASS=1, WARN=0.5, FAIL=0, SKIP is "
            "not scored; points / scored checks x 100. Returns JSON: { "
            "contract_id, contract_version, contract_status, url, "
            "lottie_version, layer_count, score (0-100), grade (A-F), "
            "pass_count, fail_count, warn_count, skip_count, scoring, "
            "checks[{id (m01-m10), name, status (PASS, FAIL, WARN or SKIP), "
            "detail}], ten_non_negotiable, provenance, validator_note }. Pass "
            "url to fetch a remote Lottie file, or lottie_file to validate an "
            "inline JSON string. Provide exactly one."
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
            "Score a live URL for AI-generated UI drift. Its 12 checks detect "
            "the four documented 2026 drift failure modes: token fabrication "
            "(var() references with no fallback to custom properties declared "
            "nowhere: not in a stylesheet, a <style> block or a style "
            "attribute), within-session drift (spacing/color/radius value "
            "variance), between-session amnesia (inconsistent font stacks, "
            "shadows, transitions), and silent breaking changes (z-index chaos, "
            "alias chains that end in an undeclared property). Use this when "
            "you need to verify whether a site (especially an AI-generated one) "
            "is drifting off its own declared token system. When NOT to use: "
            "for a full 45-check design-contract score, use designesy_score; "
            "for token-file format validation, use designesy_tokens_score. "
            "Executable: fetches the URL server-side, extracts all CSS (inline "
            "+ linked stylesheets), parses custom property declarations "
            "(stylesheets, <style> blocks and style attributes) and var() "
            "references, runs 12 drift checks. No browser needed. Returns JSON: "
            "{ ok, url, scope, score (0-100), grade (A-F), pass, warn, fail, "
            "skip, total, tokensExtracted, checks[{id, item, category, status, "
            "detail}] }. Results cached ~24h per URL."
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
            "Generate a frozen build-contract bundle for AI coding agents from "
            "any design system URL (the product layer). Ingests a site, "
            "extracts its :root tokens, and emits 6 outputs: (1) DTCG-format "
            "token file, (2) Stylelint config generated from token values, (3) "
            "AGENTS.md-format rules with token allowlist, (4) component "
            "contract with allowed prop patterns, (5) anti-pattern "
            "documentation, (6) DESIGN.md file (Google open spec, "
            "google-labs-code/design.md), the de-facto AI-readable "
            "design-context standard: YAML front matter plus a markdown body. "
            "Use this when you need to turn a design system into the file AI "
            "agents read and the lint that enforces it. When NOT to use: for "
            "design-contract scoring, use designesy_score; for token-file "
            "validation, use designesy_tokens_score; for drift detection, use "
            "designesy_drift_score. Executable: fetches the URL, extracts CSS + "
            ":root custom properties, generates the bundle. No browser needed. "
            "The full bundle grows with the number of tokens a site declares: "
            "about 7 KB to about 530 KB of JSON on the 26 sites measured "
            "(about 110 KB for designesy.org). To trim it, pass parts, a list of "
            "bundle file names such as [\"designMd\"] or [\"tokens\", "
            "\"lintConfig\"]: the result keeps score, grade, counts and checks, "
            "and its bundle holds only those files, in the order asked. Valid "
            "parts: tokens, lintConfig, agentRules, componentContract, "
            "antiPatterns, designMd. A single part can still be large on a site "
            "with many tokens. An unknown name returns an error that lists the "
            "valid parts. Returns JSON: { ok, url, score (0-100, emission "
            "completeness), grade, pass, warn, fail, total, tokensExtracted, "
            "bundle: { tokens, lintConfig, agentRules, componentContract, "
            "antiPatterns, designMd }, checks[{id, item, category, status, "
            "detail}] }; with parts it adds parts, and bundle holds only the "
            "named files. Results cached ~24h per URL."
        ),
        "inputSchema": {
            "type": "object",
            "properties": {
                "url": {
                    "type": "string",
                    "description": "URL to generate guardrails for. Defaults to https://www.designesy.org/ if not provided.",
                },
                "parts": {
                    "type": "array",
                    "items": {"type": "string"},
                    "description": "Optional: the bundle files to return, by name. Omit for the whole bundle. Valid parts: tokens, lintConfig, agentRules, componentContract, antiPatterns, designMd.",
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
            "Generate a unified design-intelligence report for a single URL, "
            "the synthesis capstone. Fires /score (45-check audit), /drift "
            "(12-check drift radar), and /readiness (10-check AI readiness) in "
            "parallel, then computes a weighted composite: score × 0.5 + drift "
            "× 0.3 + readiness × 0.2. One input, one output, one composite "
            "grade. Use this when you need a single holistic assessment instead "
            "of three separate scans, or when sharing a design-intelligence "
            "verdict (the report is the most shareable surface). When NOT to "
            "use: for just the audit score, use designesy_score; for just "
            "drift, use designesy_drift_score; for just AI readiness, use "
            "designesy_readiness_score. Executable: fires 3 internal APIs in "
            "parallel, each fetches the target URL. No browser needed. The full "
            "result is large: about 75 to 100 KB of JSON on the ten sites "
            "measured, on the order of 20,000 tokens or more, because it "
            "carries each engine's whole result beside the merged check list. "
            "To trim it, pass detail \"summary\": the same keys with fewer rows, "
            "about 4 to 31 KB on the same sites. It keeps the composite, the "
            "totals, each engine's score, grade and counts, and only the checks "
            "and synthesis entries that did not PASS; omitted counts what was "
            "left out. detail \"full\" (the default) returns everything. Returns "
            "JSON: { ok, url, compositeScore (0-100), compositeGrade (A-F), "
            "score { sub-result }, drift { sub-result }, readiness { sub-result "
            "}, totalChecks, totalPass, totalWarn, totalFail, totalSkip, "
            "totalManual, checks[] (all checks across all engines, tagged with "
            "engine), synthesis[] (8 synthesis checks verifying the report ran "
            "correctly), appUrl (standalone interactive dashboard URL) }; with "
            "detail \"summary\" it adds detail and omitted. Results cached ~24h "
            "per URL. MCP Apps: hosts that support io.modelcontextprotocol/ui "
            "render an interactive dashboard inline; others get the JSON plus "
            "an appUrl link."
        ),
        "inputSchema": {
            "type": "object",
            "properties": {
                "url": {
                    "type": "string",
                    "description": "Public URL to generate a design-intelligence report for.",
                },
                "detail": {
                    "type": "string",
                    "enum": ["summary", "full"],
                    "description": "Optional: \"full\" (the default) returns everything; \"summary\" returns the composite, the totals, each engine's score, grade and counts, and only the checks that did not PASS.",
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
#   and, only when the operator sets DESIGNESY_CDP_URL to a Chrome DevTools
#   endpoint that answers, opens a tab there to measure and then closes it.
#   That probe leaves nothing behind, so the tool stays read-only. The other
#   scoring tools post to the designesy.org engines, which fetch the url.
#   Open world.
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
# standard. apps/site/app/lib/tokens-score.ts carries the same list; the test
# suite asserts the two stay equal.
DTCG_STANDARD_TYPES = frozenset({
    "color", "dimension", "fontFamily", "fontWeight", "duration",
    "cubicBezier", "number",
    "strokeStyle", "border", "transition", "shadow", "gradient", "typography",
})


def _tokens_score_impl(url: str | None = None, dtcg_file: str | None = None) -> dict[str, Any]:
    """Run the tokens contract's ten checks on one DTCG token file (see _tokens_score)."""
    contract = _fetch("https://www.designesy.org/contracts/tokens.json", as_json=True)

    token_data: Any = None
    if dtcg_file:
        try:
            token_data = json.loads(dtcg_file, parse_constant=_reject_json_constant)
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
    result = _tokens_score(token_data, contract, url or "(inline dtcg_file)")
    return result if dtcg_file else _tls_flagged(result, url)


# ── designesy_tokens_score: the tokens contract's ten checks ─────────────────
#
# A line-for-line port of apps/site/app/lib/tokens-score.ts. The score used to
# be PASS / all ten checks x 100, so a check that could not apply counted as a
# zero (a clean file whose t07 had no custom types scored 90, not 100). It is
# now PASS / scored checks x 100: SKIP is not scored. Since 1.13.8 a WARN
# counts half (it counted zero), as in designesy_motion_score, the score engine
# and the npm @designesy/tokens validator; a {group.token} alias on a dimension
# token is a reference, checked by the value it resolves to (it was read as a
# literal with no unit, a spurious WARN in t08 and t10); a $root token (a
# group's own value) is checked like any other (it was skipped); and the
# 2025.10 dimension form {value, unit} is checked in t08 (it was not read).
# Check names are the contract's own, looked up by id. Both
# implementations run on test/fixtures/tokens/ and must produce expected.json
# there (test/test_tokens_score.py here, check-mcp-tool-parity.js there).
#
# Object keys are walked in JavaScript's order (_js_keys), truthiness follows
# JavaScript (_js_truthy), numbers print as JavaScript prints them (_js_num)
# and rounding follows Math.round (_js_round), so the two servers write the
# same result for the same file.

TOKENS_CHECK_NAMES = {
    "t01": "$schema declaration",
    "t02": "Token groups present",
    "t03": "$type on all tokens",
    "t04": "$value on all tokens",
    "t05": "Structured color format",
    "t06": "Standard type names",
    "t07": "Custom type extension",
    "t08": "Dimension units",
    "t09": "Token naming hierarchy",
    "t10": "No deprecated patterns",
}

TOKENS_SCORING = (
    "PASS=1, WARN=0.5, FAIL=0; SKIP is not scored. Score = points / scored checks x 100. "
    "A>=90, B>=80, C>=70, D>=60, F<60."
)

_DIMENSION_UNITS = sorted(
    ["px", "rem", "em", "%", "vw", "vh", "vmin", "vmax",
     "ch", "ex", "svh", "lvh", "dvh", "svw", "lvw", "dvw",
     "cm", "mm", "in", "pt", "pc", "fr"],
    key=len, reverse=True,
)


def _js_truthy(x: Any) -> bool:
    """JavaScript truthiness for a JSON value: objects and arrays are truthy."""
    if isinstance(x, (dict, list)):
        return True
    return bool(x)


def _js_keys(d: dict[str, Any]) -> list[str]:
    """Object.keys order: array-index keys ascending, then the rest as inserted."""
    def is_index(k: str) -> bool:
        return k.isascii() and k.isdigit() and (k == "0" or not k.startswith("0")) and int(k) < 4294967295
    index = sorted((k for k in d if is_index(k)), key=int)
    return index + [k for k in d if not is_index(k)]


def _dimension_unit(v: str) -> str:
    for unit in _DIMENSION_UNITS:
        if v.endswith(unit):
            return unit
    return ""


_ALIAS = re.compile(r"\{[^{}]+\}")


def _is_alias(v: Any) -> bool:
    """A DTCG alias: the whole value is one {path.to.token} reference."""
    return isinstance(v, str) and _ALIAS.fullmatch(v) is not None


# t01: a $schema points at designtokens.org when its URL's host is that name or
# a subdomain of it. The pattern is DTCG_SCHEMA_HOST in tokens-score.ts, written
# for Python: re.ASCII keeps case folding to ASCII letters, as JavaScript's /i
# does, and \Z is JavaScript's $ (Python's $ also matches before a final
# newline). A substring test passed any URL that only contained the name.
_DTCG_SCHEMA_HOST = re.compile(
    r"https?://(?:[a-z0-9-]+\.)*designtokens\.org(?::[0-9]+)?(?:[/?#]|\Z)",
    re.IGNORECASE | re.ASCII,
)


def _resolve_alias(alias: str, root: dict[str, Any]) -> tuple[Any, str | None] | None:
    """(value, $type): the literal value an alias names, through any chain of
    aliases, with the $type of the token that holds it (None when it has none);
    None when a segment is missing, the target is not a token, or the chain
    loops. Path segments are group and token names, $root included."""
    seen: set[str] = set()
    ref = alias
    while _is_alias(ref):
        if ref in seen:
            return None
        seen.add(ref)
        node: Any = root
        for part in ref[1:-1].split("."):
            node = node.get(part) if isinstance(node, dict) else None
        if not isinstance(node, dict) or "$value" not in node:
            return None
        if not _is_alias(node["$value"]):
            t = node.get("$type")
            return (node["$value"], t if isinstance(t, str) else None)
        ref = node["$value"]
    return None


def _js_typeof(v: Any) -> str:
    """JavaScript's typeof for a JSON value (null and arrays are 'object')."""
    if isinstance(v, bool):
        return "boolean"
    if isinstance(v, (int, float)):
        return "number"
    if isinstance(v, str):
        return "string"
    return "object"


def _is_js_number(v: Any) -> bool:
    return isinstance(v, (int, float)) and not isinstance(v, bool)


def _dimension_unit_of(v: Any) -> str:
    """The unit of a dimension value, or '' when it has none the checks accept:
    a string ending in a CSS length unit, or the 2025.10 object form
    {value: number, unit}."""
    if isinstance(v, str):
        return _dimension_unit(v)
    if isinstance(v, dict) and _is_js_number(v.get("value")) and isinstance(v.get("unit"), str) and v["unit"] in _DIMENSION_UNITS:
        return v["unit"]
    return ""


def _dimension_text(v: Any) -> str:
    """How a dimension value prints in a detail line."""
    if isinstance(v, str):
        return v
    if _is_js_number(v):
        return _js_num(v)
    if isinstance(v, dict):
        value = _js_num(v["value"]) if _is_js_number(v.get("value")) else ("undefined" if "value" not in v else _js_typeof(v["value"]))
        unit = v["unit"] if isinstance(v.get("unit"), str) else ("undefined" if "unit" not in v else _js_typeof(v["unit"]))
        return f"{{value: {value}, unit: {unit}}}"
    return _js_typeof(v)


def _tokens_check_names(contract: dict[str, Any]) -> dict[str, str]:
    names = dict(TOKENS_CHECK_NAMES)
    verification = contract.get("verification") if isinstance(contract, dict) else None
    rows = verification.get("checks") if isinstance(verification, dict) else None
    for row in rows if isinstance(rows, list) else []:
        if isinstance(row, dict) and isinstance(row.get("id"), str) and isinstance(row.get("item"), str) and row["id"] in names:
            names[row["id"]] = row["item"]
    return names


def _tokens_score(tokens: dict[str, Any], contract: dict[str, Any], url: str) -> dict[str, Any]:
    """Run t01-t10 on one parsed token file (a JSON object)."""
    names = _tokens_check_names(contract)
    results: list[dict[str, Any]] = []

    def add(cid: str, status: str, detail: str) -> None:
        results.append({"id": cid, "name": names[cid], "status": status, "detail": detail})

    # tokens.$tokens || tokens.tokens || tokens
    picked: Any = tokens
    for key in ("$tokens", "tokens"):
        if _js_truthy(tokens.get(key)):
            picked = tokens[key]
            break
    token_groups: dict[str, Any] = picked if isinstance(picked, dict) else {}

    # t01: $schema present and points to designtokens.org
    schema = tokens.get("$schema")
    has_schema = isinstance(schema, str) and schema != ""
    schema_valid = has_schema and _DTCG_SCHEMA_HOST.match(schema) is not None
    add("t01", "PASS" if schema_valid else ("WARN" if has_schema else "FAIL"),
        f"Schema: {schema}" if has_schema else
        "No $schema found. DTCG 2025.10 requires $schema pointing to designtokens.org/schemas/2025.10/format.json")

    # t02: token groups exist
    group_keys = [k for k in _js_keys(token_groups) if not k.startswith("$")]
    add("t02", "PASS" if group_keys else "FAIL",
        f"{len(group_keys)} token groups found: {', '.join(group_keys[:5])}{'...' if len(group_keys) > 5 else ''}")

    # t03-t10: one walk over the tokens
    counts = {"type": 0, "value": 0, "structured": 0, "bare_hex": 0, "total": 0}
    all_types: list[str] = []  # insertion-ordered, as a JS Set
    dimension_values: list[tuple[str, str, bool]] = []
    deprecated: list[str] = []

    def walk(obj: dict[str, Any], path: str) -> None:
        for key in _js_keys(obj):
            # $root is a token (a group's own value), not a property of the group.
            if key.startswith("$") and key != "$root":
                continue
            val = obj[key]
            current = f"{path}.{key}" if path else key
            if not isinstance(val, dict):
                continue
            if "$value" not in val:
                walk(val, current)
                continue
            counts["total"] += 1
            t = val.get("$type")
            v = val["$value"]
            if _js_truthy(t):
                counts["type"] += 1
                if isinstance(t, str) and t not in all_types:
                    all_types.append(t)
            counts["value"] += 1
            if t == "color":
                if isinstance(v, dict) and "colorSpace" in v:
                    counts["structured"] += 1
                elif isinstance(v, str) and v.startswith("#"):
                    counts["bare_hex"] += 1
                    deprecated.append(f"Color token '{current}' uses bare hex (pre-2025.10 pattern)")
            if t == "dimension":
                if _is_alias(v):
                    # A reference: its unit is the unit of the value it resolves
                    # to, and the target, if it is a dimension token, answers t10
                    # for itself. A target of another type is named as such.
                    target = _resolve_alias(v, token_groups)
                    if target is None:
                        dimension_values.append((current, f"{v} (unresolved alias)", False))
                    elif target[1] is not None and target[1] != "dimension":
                        dimension_values.append((current, f"{v} -> a {target[1]} token", False))
                    else:
                        dimension_values.append((current, f"{v} -> {_dimension_text(target[0])}", bool(_dimension_unit_of(target[0]))))
                elif isinstance(v, str):
                    dimension_values.append((current, v, bool(_dimension_unit(v))))
                    if not _dimension_unit(v):
                        deprecated.append(f"Dimension token '{current}' has unrecognized or missing unit: '{v}'")
                elif _is_js_number(v):
                    dimension_values.append((current, _js_num(v), False))
                    deprecated.append(f"Dimension token '{current}' uses bare number (should include unit string)")
                elif isinstance(v, dict):
                    dimension_values.append((current, _dimension_text(v), bool(_dimension_unit_of(v))))
            if "$ref" in val:
                deprecated.append(f"Token '{current}' uses deprecated $ref syntax (use {{path}} in $value)")

    walk(token_groups, "")
    total, typed = counts["total"], counts["type"]

    # t03: $type on all tokens
    add("t03", "PASS" if total > 0 and typed == total else ("WARN" if typed > 0 else "FAIL"),
        f"{typed}/{total} tokens have $type")

    # t04: $value on all tokens
    add("t04", "PASS" if total > 0 and counts["value"] == total else "FAIL",
        f"{counts['value']}/{total} tokens have $value")

    # t05: structured color format (colorSpace + components)
    structured, bare_hex = counts["structured"], counts["bare_hex"]
    if structured + bare_hex > 0:
        add("t05", "PASS" if bare_hex == 0 else ("WARN" if structured > 0 else "FAIL"),
            f"{structured} structured, {bare_hex} bare hex. DTCG 2025.10 prefers {{colorSpace, components}} over bare hex strings.")
    else:
        add("t05", "SKIP", "No color tokens found")

    # t06: standard type names
    non_standard = sorted(t for t in all_types if t not in DTCG_STANDARD_TYPES)
    if total == 0:
        add("t06", "SKIP", "No tokens found")
    elif typed == 0:
        add("t06", "FAIL", "No tokens have $type: cannot verify standard type names")
    elif not non_standard:
        add("t06", "PASS", f"All {len(all_types)} unique type(s) are DTCG 2025.10 standard: {', '.join(sorted(all_types))}")
    else:
        add("t06", "WARN", f"Non-standard type(s) found: {', '.join(non_standard)}. These may be valid custom types (see t07).")

    # t07: custom types follow the dot-namespacing convention
    custom = sorted(t for t in all_types if t not in DTCG_STANDARD_TYPES)
    if not custom:
        add("t07", "SKIP", "No custom types found")
    else:
        bare_customs = [t for t in custom if "." not in t]
        if not bare_customs:
            add("t07", "PASS", f"All {len(custom)} custom type(s) use dot-namespacing: {', '.join(custom)}")
        else:
            add("t07", "WARN", f"Custom type(s) without namespacing (recommend dot-prefix like 'com.example.glow'): {', '.join(bare_customs)}")

    # t08: dimension tokens have valid CSS length units
    if not dimension_values:
        add("t08", "SKIP", "No dimension tokens found")
    else:
        bad_units = [f"{p}='{v}'" for p, v, ok in dimension_values if not ok]
        if not bad_units:
            add("t08", "PASS", f"All {len(dimension_values)} dimension token(s) use valid units (px, rem, em, %, etc.)")
        else:
            add("t08", "WARN" if len(bad_units) < len(dimension_values) else "FAIL",
                f"{len(bad_units)}/{len(dimension_values)} dimension token(s) have missing/unrecognized units: {', '.join(bad_units[:5])}")

    # t09: tokens are organised into groups (nesting is the dot hierarchy)
    if total == 0:
        add("t09", "FAIL", "No tokens found: cannot assess naming hierarchy")
    elif group_keys:
        add("t09", "PASS", f"{len(group_keys)} token group(s) with nested hierarchy: {', '.join(group_keys[:5])}{'...' if len(group_keys) > 5 else ''}")
    else:
        add("t09", "WARN", "No token groups found: tokens should be organized into groups (e.g., color, spacing, typography)")

    # t10: no pre-2025.10 patterns
    if not deprecated:
        add("t10", "PASS", "No deprecated DTCG patterns detected (no bare hex colors, no bare number dimensions, no $ref syntax)")
    else:
        add("t10", "WARN", f"{len(deprecated)} deprecated pattern(s) found: {'; '.join(deprecated[:3])}{'...' if len(deprecated) > 3 else ''}")

    tally = {s: sum(1 for r in results if r["status"] == s) for s in ("PASS", "WARN", "FAIL", "SKIP")}
    scored = tally["PASS"] + tally["WARN"] + tally["FAIL"]
    score = _js_round((tally["PASS"] + tally["WARN"] * 0.5) / scored * 100) if scored > 0 else 0
    grade = "A" if score >= 90 else ("B" if score >= 80 else ("C" if score >= 70 else ("D" if score >= 60 else "F")))

    return {
        "contract_id": contract.get("id"),
        "contract_version": contract.get("version"),
        "contract_status": contract.get("status"),
        "url": url,
        "total_tokens": total,
        "score": score,
        "grade": grade,
        "pass_count": tally["PASS"],
        "fail_count": tally["FAIL"],
        "warn_count": tally["WARN"],
        "skip_count": tally["SKIP"],
        "scoring": TOKENS_SCORING,
        "checks": results,
        "provenance": "W3C DTCG 2025.10 CG-FINAL + designesy-core.v0.4.0 §8",
        "validator_note": "Canonical validator: @terrazzo/parser 2.4.0 (npm i -D @terrazzo/parser, run: tz check tokens.json)",
    }


# The axe-core tags each WCAG level includes (axe-core API documentation,
# "Axe-core Tags"); the hosted route carries the same table.
_AXE_LEVEL_TAGS: dict[str, list[str]] = {
    "wcag2a": ["wcag2a"],
    "wcag2aa": ["wcag2a", "wcag2aa"],
    "wcag21a": ["wcag2a", "wcag21a"],
    "wcag21aa": ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"],
    "wcag22aa": ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"],
}


def _a11y_score_impl(url: str, ruleset: str | None = None, config: str | None = None) -> dict[str, Any]:
    """Return the accessibility contract + Playwright script template for axe-core."""
    contract = _fetch("https://www.designesy.org/contracts/a11y.json", as_json=True)
    tag = ruleset or "wcag22aa"
    # axe-core tags are not cumulative: wcag22aa alone ran one rule
    # (target-size, axe-core 4.13.0). A WCAG level expands to every tag it
    # includes; anything else runs as given. As the hosted route does.
    tags = _AXE_LEVEL_TAGS.get(tag, [tag])
    tags_js = json.dumps(tags, separators=(",", ":"), ensure_ascii=False)

    brand_config: dict[str, Any] | None = None
    if config:
        try:
            brand_config = json.loads(config)
        except json.JSONDecodeError:
            return {"success": False, "error": "Invalid JSON in config parameter"}

    # With a config, the script used to call axe.configure() in the test body,
    # where nothing defines axe, so it threw on every run. axe.configure() has
    # to run inside the page, and @axe-core/playwright 4.13.0 has no
    # configure(): it injects the string it is given as axeSource. So the
    # script imports axe-core and appends the configure() call to its source.
    # As the hosted route does.
    # The url argument is written into the script as a JavaScript string
    # literal (json.dumps), never spliced between quotes: a quote, a backtick
    # or ${ in it used to break out of the literal, and the caller runs this
    # script. As the hosted route does.
    url_js = json.dumps(url, ensure_ascii=False)
    title_js = json.dumps(f"{url} — WCAG 2.2 AA scan", ensure_ascii=False)
    config_import = ""
    config_line = ""
    builder_args = "{ page }"
    if brand_config:
        config_import = "import axe from 'axe-core';\n"
        config_line = (
            "  // axe.configure() runs in the page, so it travels with the axe-core source.\n"
            f"  const brandConfig = {json.dumps(brand_config, indent=2)};\n"
            "  const axeSource = axe.source + ';axe.configure(' + JSON.stringify(brandConfig) + ');';"
        )
        builder_args = "{ page, axeSource }"

    playwright_script = (
        f"// axe-core 4.13.0 + Playwright — generated by designesy_a11y_score\n"
        f"// Install: npm i -D @axe-core/playwright\n"
        f"import {{ test, expect }} from '@playwright/test';\n"
        f"import AxeBuilder from '@axe-core/playwright';\n"
        f"{config_import}\n"
        f"test({title_js}, async ({{ page }}) => {{\n"
        f"  await page.goto({url_js});\n"
        f"{config_line}\n"
        f"  const results = await new AxeBuilder({builder_args})\n"
        f"    .withTags({tags_js})\n"
        f"    .analyze();\n\n"
        f"  const violations = results.violations;\n"
        f"  const passCount = results.passes.length;\n"
        f"  const failCount = violations.length;\n"
        f"  // passes + violations counts the rules that applied. With none, nothing\n"
        f"  // was measured: no score and no grade, never an F.\n"
        f"  const applicable = passCount + failCount;\n"
        f"  const score = applicable === 0 ? null : Math.round((passCount / applicable) * 100);\n"
        f"  const grade = score === null ? null : score >= 90 ? 'A' : score >= 80 ? 'B' : score >= 70 ? 'C' : score >= 60 ? 'D' : 'F';\n"
        f"  const note = score === null ? 'not scored: no axe rule in these tags applied to this page' : null;\n"
        f"  console.log(JSON.stringify({{ url: {url_js}, ruleset: {json.dumps(tag, ensure_ascii=False)}, tags: {tags_js}, score, grade, scored: score !== null, note, passCount, failCount, violations }}, null, 2));\n"
        f"}});\n"
    )

    checks = contract.get("verification", {}).get("checks", [])
    return {
        "contract_id": contract.get("id"),
        "contract_version": contract.get("version"),
        "contract_status": contract.get("status"),
        "url": url,
        "ruleset": tag,
        "tags": tags,
        "brand_config": brand_config,
        "summary": "axe-core requires a real DOM. This tool returns the contract checks + a Playwright script. Execute the script locally with @axe-core/playwright 4.13.0.",
        "checks": [{"id": c.get("id"), "name": c.get("item"), "status": "PENDING_EXECUTION"} for c in checks],
        "playwright_script": playwright_script,
        "install_command": "npm i -D @axe-core/playwright@4.13.0 axe-core@4.13.0" if brand_config else "npm i -D @axe-core/playwright@4.13.0",
        "run_command": "npx playwright test a11y-scan.spec.ts --reporter=line",
        "provenance": "axe-core 4.13.0 + W3C WCAG 2.2 + ACT Rules + designesy-core.v0.3.0 section 6",
        "priority": "HIGH",
    }


def _reject_json_constant(name: str) -> Any:
    """NaN and Infinity are not JSON; JSON.parse rejects them, so this does too."""
    raise json.JSONDecodeError(f"{name} is not valid JSON", name, 0)


def _motion_score_impl(url: str | None = None, lottie_file: str | None = None) -> dict[str, Any]:
    """Run the motion contract's ten checks on one Lottie file (see _motion_score)."""
    contract = _fetch("https://www.designesy.org/contracts/motion.json", as_json=True)

    lottie_data: Any = None
    if lottie_file:
        try:
            lottie_data = json.loads(lottie_file, parse_constant=_reject_json_constant)
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
    result = _motion_score(lottie_data, contract, url or "(inline lottie_file)")
    return result if lottie_file else _tls_flagged(result, url)


# ── designesy_motion_score: the motion contract's ten checks ─────────────────
#
# A line-for-line port of apps/site/app/lib/motion-score.ts. The tool used to
# compute its own ten checks and label them with the contract's names by array
# position, so every verdict sat under another check's name ("meta object
# present" FAILed because a file had zero layers). Each check now computes its
# own verdict under its own id and the contract's name for that id. Both
# implementations run on test/fixtures/motion/ and must produce expected.json
# there (test/test_motion_score.py here, check-mcp-tool-parity.js there).
#
# Numbers in details print as JavaScript prints them (_js_num), and rounding
# follows Math.round (_js_round), so the two servers write the same text.

LOTTIE_SCHEMA_URL = "https://lottie.github.io/lottie-spec/1.0.1/lottie.schema.json"

MOTION_CHECK_NAMES = {
    "m01": "Lottie file validates against LAC v1.0.1 JSON Schema",
    "m02": "Required fields present (v, fr, ip, op, w, h, layers)",
    "m03": 'No deprecated Bodymovin version (v: "4.x")',
    "m04": "markers array present (reduced-motion support)",
    "m05": "meta object present (attribution, author, description)",
    "m06": "prefers-reduced-motion path documented (§3.4)",
    "m07": "Easing uses deliberate curves (§16.1, §16.10)",
    "m08": "Duration ≤ 300ms for UI motion (§16.7)",
    "m09": "No layout-property animation (§16.5)",
    "m10": "No motion on keyboard-initiated actions (§16.4)",
}

_MOTION_REQUIRED = ["v", "fr", "ip", "op", "w", "h", "layers"]
# re.ASCII keeps IGNORECASE to ASCII letters, as a JavaScript /i pattern does.
_REDUCED_NAME = re.compile(r"reduc|calm|static|still|no[-_ ]?motion", re.IGNORECASE | re.ASCII)
_EXTERNAL_NOTE = re.compile(r"prefers-reduced-motion|reduced[- ]motion", re.IGNORECASE | re.ASCII)
_EASE_EPS = 0.001
_UI_BOUND_MS = 300


def _is_num(x: Any) -> bool:
    return isinstance(x, (int, float)) and not isinstance(x, bool) and math.isfinite(x)


def _is_int(x: Any) -> bool:
    return _is_num(x) and float(x).is_integer()


def _js_round(x: float) -> int:
    """Math.round: the nearest integer, halves toward +infinity."""
    r = math.floor(x)
    return int(r + 1) if x - r >= 0.5 else int(r)


def _js_json(s: str) -> str:
    return json.dumps(s, ensure_ascii=False)


def _show(o: dict[str, Any], k: str) -> str:
    """A value for a sentence: numbers as JS prints them, anything else by kind."""
    if k not in o:
        return "missing"
    x = o[k]
    if _is_num(x):
        return _js_num(x)
    if x is None:
        return "null"
    if isinstance(x, list):
        return "an array"
    if isinstance(x, str):
        return "a string"
    if isinstance(x, bool):
        return "a boolean"
    if isinstance(x, dict):
        return "an object"
    return "not a number"


def _plural(n: int, word: str) -> str:
    return f"{n} {word}{'' if n == 1 else 's'}"


def _clip(s: str) -> str:
    return s[:40] + "..." if len(s) > 40 else s


def _standard(contract: dict[str, Any], num: int) -> str:
    """'§16.5 (Layout is not animated)', read from the contract's ten_non_negotiable."""
    conf = contract.get("conformance")
    items = conf.get("ten_non_negotiable") if isinstance(conf, dict) else None
    for s in items if isinstance(items, list) else []:
        if isinstance(s, dict) and _is_num(s.get("num")) and s.get("num") == num and isinstance(s.get("rule"), str):
            return f"§16.{num} ({s['rule']})"
    return f"§16.{num}"


def _motion_check_names(contract: dict[str, Any]) -> dict[str, str]:
    names = dict(MOTION_CHECK_NAMES)
    ver = contract.get("verification")
    items = ver.get("checks") if isinstance(ver, dict) else None
    for c in items if isinstance(items, list) else []:
        if isinstance(c, dict) and isinstance(c.get("id"), str) and isinstance(c.get("item"), str) and c["id"] in names:
            names[c["id"]] = c["item"]
    return names


def _m01_schema(l: dict[str, Any]) -> tuple[str, str]:
    v: list[str] = []
    for f in ("w", "h", "fr", "op", "ip", "layers"):
        if f not in l:
            v.append(f"{f} is missing")
    for f in ("w", "h"):
        if f in l and not (_is_int(l[f]) and l[f] >= 0):
            v.append(f"{f} must be an integer of at least 0")
    if "fr" in l and not (_is_num(l["fr"]) and l["fr"] > 0):
        v.append("fr must be a number above 0")
    for f in ("ip", "op"):
        if f in l and not _is_num(l[f]):
            v.append(f"{f} must be a number")
    if "layers" in l:
        if not isinstance(l["layers"], list):
            v.append("layers must be an array")
        else:
            bad = sum(1 for x in l["layers"] if not isinstance(x, dict))
            if bad > 0:
                v.append("1 layer is not an object" if bad == 1 else f"{bad} layers are not objects")
    if "ver" in l and not (_is_int(l["ver"]) and l["ver"] >= 10000):
        v.append("ver must be an integer of at least 10000")
    if "nm" in l and not isinstance(l["nm"], str):
        v.append("nm must be a string")
    if "markers" in l:
        if not isinstance(l["markers"], list):
            v.append("markers must be an array")
        elif any(not isinstance(m, dict) for m in l["markers"]):
            v.append("every marker must be an object")
    if "slots" in l and not isinstance(l["slots"], dict):
        v.append("slots must be an object")
    if "assets" in l and not isinstance(l["assets"], list):
        v.append("assets must be an array")
    if v:
        return "FAIL", f"Schema violations in the top-level animation object: {'; '.join(v)}. Schema: {LOTTIE_SCHEMA_URL}."
    return "SKIP", (
        "Schema: the top-level animation object has no violation (w, h, fr, ip, op and layers are present and "
        "typed as the schema requires). Layer contents are not validated here, so this is not a full schema "
        f"pass: validate the file with ajv 8 (ajv/dist/2020) and ajv-formats against {LOTTIE_SCHEMA_URL}."
    )


def _near(a: float, b: float) -> bool:
    return abs(a - b) <= _EASE_EPS


def _classify_curve(x1: float, y1: float, x2: float, y2: float) -> str:
    """cubic-bezier(x1, y1, x2, y2) from a keyframe's out (o) and in (i) handles."""
    if _near(x1, y1) and _near(x2, y2):
        return "linear"
    if _near(x1, 0.25) and _near(y1, 0.1) and _near(x2, 0.25) and _near(y2, 1):
        return "ease"
    # Second handle on the diagonal (no deceleration into the next keyframe) and
    # first handle below it (acceleration away from this one): an ease-in.
    if _near(x2, y2) and y1 < x1 - _EASE_EPS:
        return "ease-in"
    return "custom"


def _comps(x: Any) -> list[Any]:
    return x if isinstance(x, list) else [x]


def _keyframe_curve(kf: dict[str, Any]) -> str | None:
    """The curve of one keyframe: its first rejected dimension, else custom. None when it has none."""
    h = kf.get("h")
    if (_is_num(h) and h == 1) or not isinstance(kf.get("o"), dict) or not isinstance(kf.get("i"), dict):
        return None
    ox, oy = _comps(kf["o"].get("x")), _comps(kf["o"].get("y"))
    ix, iy = _comps(kf["i"].get("x")), _comps(kf["i"].get("y"))
    dims = max(len(ox), len(oy), len(ix), len(iy))
    seen = False
    for d in range(dims):
        p = [a[min(d, len(a) - 1)] if a else None for a in (ox, oy, ix, iy)]
        if not all(_is_num(x) for x in p):
            continue
        seen = True
        c = _classify_curve(p[0], p[1], p[2], p[3])
        if c != "custom":
            return c
    return "custom" if seen else None


def _m07_easing(l: dict[str, Any], contract: dict[str, Any], layer_count: int) -> tuple[str, str]:
    counts = {"linear": 0, "ease": 0, "ease-in": 0, "custom": 0}
    stack: list[Any] = [l]
    while stack:
        node = stack.pop()
        if isinstance(node, list):
            stack.extend(node)
        elif isinstance(node, dict):
            a = node.get("a")
            if _is_num(a) and a == 1 and isinstance(node.get("k"), list):
                for kf in node["k"]:
                    if isinstance(kf, dict):
                        c = _keyframe_curve(kf)
                        if c:
                            counts[c] += 1
            stack.extend(node.values())
    total = sum(counts.values())
    stds = f"{_standard(contract, 1)} and {_standard(contract, 10)}"
    if total == 0:
        return "SKIP", (
            f"Easing: no eased keyframes to check ({_plural(layer_count, 'layer')}, no animated property with "
            f"bezier handles), so {stds} have nothing to test."
        )
    rejected = counts["linear"] + counts["ease"] + counts["ease-in"]
    if rejected == 0:
        every = "the one eased keyframe uses a custom curve" if total == 1 else f"all {total} eased keyframes use custom curves"
        return "PASS", f"Easing: {every}, as {stds} require."
    parts = [f"{counts[k]} {k}" for k in ("linear", "ease", "ease-in") if counts[k] > 0]
    return "FAIL", (
        f"Easing: {rejected} of {_plural(total, 'eased keyframe')} {'uses' if rejected == 1 else 'use'} a curve {stds} reject ({', '.join(parts)}). "
        "Use a custom curve that decelerates, such as the contract's cubicBezier tokens."
    )


def _motion_score(lottie: dict[str, Any], contract: dict[str, Any], url: str) -> dict[str, Any]:
    """Score one parsed Lottie file (a JSON object) against the motion contract."""
    l = lottie
    if not isinstance(contract, dict):
        contract = {}
    names = _motion_check_names(contract)
    layers = l.get("layers") if isinstance(l.get("layers"), list) else None
    layer_count = len(layers) if layers is not None else 0
    out: list[dict[str, str]] = []

    def add(cid: str, verdict: tuple[str, str]) -> None:
        out.append({"id": cid, "name": names[cid], "status": verdict[0], "detail": verdict[1]})

    add("m01", _m01_schema(l))

    missing = [f for f in _MOTION_REQUIRED if f not in l]
    required = ", ".join(_MOTION_REQUIRED)
    if missing:
        add("m02", ("FAIL", f"Required fields missing: {', '.join(missing)}. The contract requires {required}."))
    elif layers is not None and len(layers) == 0:
        add("m02", ("WARN", f"Required fields present ({required}), but layers is empty, so the animation draws nothing."))
    else:
        add("m02", ("PASS", f"Required fields present: {required}."))

    if "v" not in l:
        add("m03", ("SKIP", "Bodymovin version: the file has no v field, so its exporter version cannot be checked (m02 reports the missing field)."))
    else:
        v = l["v"] if isinstance(l["v"], str) else None
        major = re.match(r"[0-9]+", v) if v is not None else None
        if v is None or major is None:
            shown = _show(l, "v") if v is None else _js_json(_clip(v))
            add("m03", ("WARN", f'Bodymovin version: v is {shown}, not a version string such as "5.12.0", so deprecation cannot be checked.'))
        elif int(major.group(0)) < 5:
            add("m03", ("FAIL", f"Bodymovin version: v is {_js_json(_clip(v))}, a {major.group(0)}.x export, which is deprecated: re-export with an exporter that follows the Lottie spec."))
        else:
            add("m03", ("PASS", f"Bodymovin version: v is {_js_json(_clip(v))}, 5.x or later, so not deprecated."))

    markers = l.get("markers") if isinstance(l.get("markers"), list) else None
    if markers:
        named = [m["cm"] for m in markers if isinstance(m, dict) and isinstance(m.get("cm"), str)]
        listed = f": {', '.join(_clip(n) for n in named[:5])}{', ...' if len(named) > 5 else ''}" if named else ""
        add("m04", ("PASS", f"markers array present with {_plural(len(markers), 'marker')}{listed}."))
    elif markers is not None:
        add("m04", ("FAIL", "markers array is empty, so a player has no named segment to choose for reduced motion."))
    else:
        add("m04", ("FAIL", "No markers array, so a player has no named segment to choose for reduced motion."))

    meta = l.get("meta") if isinstance(l.get("meta"), dict) else None
    if meta is not None:
        fields = [n for k, n in (("a", "author"), ("d", "description"), ("k", "keywords"), ("g", "generator"), ("tc", "theme color")) if k in meta]
        add("m05", ("PASS", f"meta object present with {', '.join(fields)}." if fields else "meta object present, with none of author, description or keywords filled in."))
    else:
        add("m05", ("WARN", "No meta object, so the file carries no attribution, author or description (an attribution gap)."))

    reduced_marker = next(
        (m["cm"] for m in (markers or []) if isinstance(m, dict) and isinstance(m.get("cm"), str) and _REDUCED_NAME.search(m["cm"])),
        None,
    )
    slots = l.get("slots")
    reduced_slot = next((k for k in slots if _REDUCED_NAME.search(k)), None) if isinstance(slots, dict) else None
    meta_text: list[str] = []
    if meta is not None:
        k = meta.get("k")
        meta_text = [t for t in [meta.get("d"), *(k if isinstance(k, list) else [k])] if isinstance(t, str)]
    if reduced_marker is not None:
        add("m06", ("PASS", f"Reduced-motion path documented in the file: marker {_js_json(_clip(reduced_marker))}."))
    elif reduced_slot is not None:
        add("m06", ("PASS", f"Reduced-motion path documented in the file: slot {_js_json(_clip(reduced_slot))}."))
    elif any(_EXTERNAL_NOTE.search(t) for t in meta_text):
        add("m06", ("WARN", "Reduced motion is handled outside the file: meta notes an external prefers-reduced-motion wrapper, which this tool cannot see."))
    else:
        add("m06", ("FAIL", "No reduced-motion path documented: no marker or slot is named for reduced motion (reduced, calm, static, still, no-motion), and meta does not note an external prefers-reduced-motion wrapper."))

    add("m07", _m07_easing(l, contract, layer_count))

    fr, ip, op = l.get("fr"), l.get("ip"), l.get("op")
    if _is_num(fr) and fr > 0 and _is_num(ip) and _is_num(op) and op > ip:
        ms = _js_round(((op - ip) / fr) * 1000)
        span = f"{ms} ms ({_js_num(op - ip)} frames at {_js_num(fr)} fps)"
        if ms <= _UI_BOUND_MS:
            add("m08", ("PASS", f"Duration {span} is within the {_UI_BOUND_MS} ms bound for UI motion, {_standard(contract, 7)}."))
        else:
            add("m08", ("WARN", (
                f"Duration {span} exceeds the {_UI_BOUND_MS} ms bound for UI motion, {_standard(contract, 7)}. "
                "Longer motion needs a stated justification, which this tool cannot read from a file: shorten it if it is UI motion."
            )))
    else:
        add("m08", ("SKIP", f"Duration cannot be computed: it needs fr above 0 and op greater than ip (fr {_show(l, 'fr')}, ip {_show(l, 'ip')}, op {_show(l, 'op')})."))

    add("m09", ("SKIP", (
        f"Not applicable to a Lottie file: {_standard(contract, 5)} concerns CSS layout properties (width, height, "
        "margin, padding, top, left), and a Lottie file has none; it animates transforms, opacity and vector shapes "
        "inside its own canvas. Check the page that embeds it with designesy_score."
    )))
    add("m10", ("SKIP", (
        f"Not applicable to a Lottie file: {_standard(contract, 4)} concerns what starts playback, and whether a "
        "keyboard action starts it is decided by the page that embeds the file. Check that page with designesy_score."
    )))

    def count(s: str) -> int:
        return sum(1 for c in out if c["status"] == s)

    passed, warned, failed, skipped = count("PASS"), count("WARN"), count("FAIL"), count("SKIP")
    scored = passed + warned + failed
    score = _js_round(((passed + warned * 0.5) / scored) * 100) if scored > 0 else 0
    grade = "A" if score >= 90 else "B" if score >= 80 else "C" if score >= 70 else "D" if score >= 60 else "F"
    conf = contract.get("conformance")
    ten = conf.get("ten_non_negotiable") if isinstance(conf, dict) else None

    return {
        "contract_id": contract.get("id"),
        "contract_version": contract.get("version"),
        "contract_status": contract.get("status"),
        "url": url,
        "lottie_version": l["v"] if isinstance(l.get("v"), str) else None,
        "layer_count": layer_count,
        "score": score,
        "grade": grade,
        "pass_count": passed,
        "fail_count": failed,
        "warn_count": warned,
        "skip_count": skipped,
        "scoring": "PASS=1, WARN=0.5, FAIL=0; SKIP is not scored. Score = points / scored checks x 100. A>=90, B>=80, C>=70, D>=60, F<60.",
        "checks": out,
        "ten_non_negotiable": ten if isinstance(ten, list) else [],
        "provenance": "Lottie Animation Community spec v1.0.1 and Designesy core §7 (Motion Stance) and §16 (Ten Non-Negotiable Motion Standards)",
        "validator_note": (
            'm01 checks the top-level animation object only. For full schema validation use ajv 8 (import Ajv from "ajv/dist/2020") '
            f"with ajv-formats 3 against {LOTTIE_SCHEMA_URL}."
        ),
    }


# ── HTTP-proxy tool implementations ─────────────────────────────────────────
#
# The 6 executable engines (drift, readiness, guardrails, monitor, compare,
# report) run server-side on designesy.org. The stdio package proxies to the
# same API endpoints the TS HTTP MCP uses — no need to reimplement the check
# logic in Python. This keeps the Python package feature-parity with the HTTP
# endpoint with zero external dependencies.


def _post_api(endpoint: str, body: dict[str, Any]) -> dict[str, Any]:
    """POST to a designesy.org API endpoint and return the JSON result.

    The certificate is always verified: DESIGNESY_INSECURE_TLS covers a
    caller's URL only, and this body can carry a monitor email address.
    """
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
    with urllib.request.urlopen(req, timeout=30, context=_SSL_CONTEXT) as resp:
        return json.loads(resp.read().decode("utf-8"))


def _drift_score_impl(url: str | None = None) -> dict[str, Any]:
    """Proxy to /api/drift — 12-check AI-drift radar."""
    target = url or f"{BASE_URL}/"
    return _post_api("drift", {"url": target})


def _readiness_score_impl(url: str | None = None) -> dict[str, Any]:
    """Proxy to /api/readiness — 10-check AI readiness probe."""
    target = url or f"{BASE_URL}/"
    return _post_api("readiness", {"url": target})


def _guardrails_impl(url: str | None = None, parts: Any = None) -> dict[str, Any]:
    """Proxy to /api/guardrails: generate the build-contract bundle.

    parts (a list of bundle file names) returns only those files; see
    _guardrails_parts. Bad names are refused before the API is called.
    """
    names: list[str] | None = None
    if parts is not None:
        if not isinstance(parts, list) or not all(isinstance(p, str) for p in parts):
            return _parts_error("parts must be a list of strings.", [])
        picked = _guardrails_part_names(parts)
        if isinstance(picked, tuple):
            return _parts_error(*picked)
        names = picked
    target = url or f"{BASE_URL}/"
    data = _post_api("guardrails", {"url": target})
    return _guardrails_parts(data, names) if names is not None else data


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


def _report_impl(url: str, detail: Any = None) -> dict[str, Any]:
    """Proxy to /api/report: composite score+drift+readiness synthesis.

    detail "summary" returns _report_summary of the result; "full" (the
    default) returns all of it.
    """
    if detail is not None and detail not in REPORT_DETAILS:
        return {"success": False, "error": 'detail must be "summary" or "full".'}
    data = _post_api("report", {"url": url})
    # Attach the standalone app URL (same as the TS endpoint does)
    data["appUrl"] = f"{BASE_URL}/api/report/app?url={urllib.parse.quote(url, safe='')}"
    return _report_summary(data) if detail == "summary" else data


# ── Narrower results for report and guardrails ──────────────────────────────
#
# A line-for-line port of apps/site/app/lib/mcp-trim.ts. On www.designesy.org
# designesy_report returned about 100,000 characters and designesy_guardrails
# about 90,000, and a client that caps tool output cut both off (Anthropic
# Software Directory Policy 5B: be frugal with tokens, and give users a way to
# trim). The parameters are optional; without them the tools return what they
# always did. Both implementations run on test/fixtures/trim/ and must produce
# expected.json there (test/test_trim.py here, check-mcp-tool-parity.js there).

REPORT_DETAILS = ("summary", "full")
REPORT_ENGINES = ("score", "drift", "readiness")
GUARDRAILS_PARTS = ("tokens", "lintConfig", "agentRules", "componentContract", "antiPatterns", "designMd")


def _is_scalar(x: Any) -> bool:
    return x is None or not isinstance(x, (dict, list))


def _not_pass(items: Any) -> list[Any]:
    if not isinstance(items, list):
        return []
    return [c for c in items if not (isinstance(c, dict) and c.get("status") == "PASS")]


def _report_summary(report: Any) -> Any:
    """designesy_report with detail "summary": the same keys as the full report,
    fewer rows. The composite and the totals stay; each engine keeps only its
    single values (score, grade, counts), without its check list, category
    scores or receipt; checks and synthesis keep the entries that did not PASS.
    A result without a check list (an error) is returned unchanged.
    """
    if not isinstance(report, dict) or not isinstance(report.get("checks"), list):
        return report
    out: dict[str, Any] = {"detail": "summary"}
    for k, v in report.items():
        if _is_scalar(v):
            out[k] = v
        elif k in REPORT_ENGINES and isinstance(v, dict):
            out[k] = {ek: ev for ek, ev in v.items() if _is_scalar(ev)}
        elif k in ("checks", "synthesis"):
            out[k] = _not_pass(v)

    def kept(k: str) -> int:
        return len(out[k]) if isinstance(out.get(k), list) else 0

    def given(k: str) -> int:
        return len(report[k]) if isinstance(report.get(k), list) else 0

    out["omitted"] = {
        "pass_checks": given("checks") - kept("checks"),
        "pass_synthesis": given("synthesis") - kept("synthesis"),
        "note": (
            "Left out: the checks that PASS, and from each engine its check list, category scores "
            'and receipt. Call again with detail "full" for everything.'
        ),
    }
    return out


def _guardrails_part_names(parts: list[str]) -> list[str] | tuple[str, list[str]]:
    """The names asked for, duplicates dropped, or (error, unknown names)."""
    names = list(dict.fromkeys(parts))
    if not names:
        return ("parts is empty; name at least one part, or omit it for the whole bundle.", [])
    unknown = [n for n in names if n not in GUARDRAILS_PARTS]
    if unknown:
        return (f"Unknown guardrails part(s): {', '.join(unknown)}.", unknown)
    return names


def _parts_error(message: str, unknown: list[str]) -> dict[str, Any]:
    return {
        "success": False,
        "error": f"{message} Valid parts: {', '.join(GUARDRAILS_PARTS)}.",
        "unknown_parts": unknown,
        "valid_parts": list(GUARDRAILS_PARTS),
    }


def _guardrails_parts(result: Any, names: list[str]) -> Any:
    """designesy_guardrails with parts: only the named bundle files, in the order
    asked, and a parts list naming them. Everything outside the bundle (score,
    grade, counts, checks) is kept. A result without a bundle is unchanged.
    """
    if not isinstance(result, dict) or not isinstance(result.get("bundle"), dict):
        return result
    bundle = result["bundle"]
    out: dict[str, Any] = {}
    for k, v in result.items():
        if k != "bundle":
            out[k] = v
            continue
        out["parts"] = list(names)
        out["bundle"] = {n: bundle.get(n) for n in names}
    return out


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
        return _guardrails_impl(url=args.get("url"), parts=args.get("parts"))
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
        return _report_impl(url=args.get("url", ""), detail=args.get("detail"))
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


def _tool_error(req_id: Any, text: str) -> dict[str, Any]:
    """A tool that ran and failed: an isError result the model can read and act on."""
    return _result(req_id, {"content": [{"type": "text", "text": text}], "isError": True})


# ── Message rules ───────────────────────────────────────────────────────────
#
# JSON-RPC 2.0 and the 2024-11-05 revision this server negotiates. Until
# 1.13.10, an array, a bare string or a null params raised AttributeError and
# ended the session, and a notification such as notifications/cancelled got an
# error frame back.
#   - A line that is not JSON gets -32700, and a message that is not an object
#     gets -32600, both with id null. 2024-11-05 has no batches (2025-03-26
#     added them, 2025-06-18 removed them), so an array is not an object either.
#   - A message with no id is a notification and gets no reply.
#   - params or arguments null reads as {}; any other non-object is -32602.
#   - An unknown tool is -32602 and an unknown resource -32002, the codes the
#     2024-11-05 tools and resources pages give. A tool that runs and fails
#     (a fetch error, a blocked URL, an engine error) is an isError result.


def _handle(msg: Any) -> dict[str, Any] | None:
    if not isinstance(msg, dict):
        return _error(None, -32600, "Invalid Request: a message must be a JSON object; batches are not supported")
    method = msg.get("method")
    req_id = msg.get("id")
    if not isinstance(method, str):
        return _error(req_id, -32600, "Invalid Request: method must be a string")
    if "id" not in msg:
        return None
    params = msg.get("params")
    if params is None:
        params = {}
    elif not isinstance(params, dict):
        return _error(req_id, -32602, "Invalid params: params must be an object")

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
        args = params.get("arguments")
        if args is None:
            args = {}
        if not isinstance(name, str) or name not in TOOL_MAP:
            return _error(req_id, -32602, f"Unknown tool: {name}")
        if not isinstance(args, dict):
            return _error(req_id, -32602, "Invalid params: arguments must be an object")
        try:
            res = _dispatch(name, args)
        except urllib.error.URLError as e:
            return _tool_error(req_id, f"Failed to fetch URL: {_scrub_local_paths(str(e))}")
        except Exception as e:
            return _tool_error(req_id, f"Tool execution failed: {_scrub_local_paths(str(e))}")
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
        if not isinstance(uri, str) or uri not in _RESOURCE_FETCHERS:
            return _error(req_id, -32002, f"Unknown resource: {uri}")
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
    """Read JSON-RPC messages from stdin, one per line.

    No line ends the session: one that is not JSON gets -32700, and a request
    whose handler raises gets -32603 while the loop reads on.
    """
    for line in sys.stdin:
        line = line.strip()
        if not line:
            continue
        try:
            msg = json.loads(line)
        except (ValueError, RecursionError):
            _send(_error(None, -32700, "Parse error: the line is not valid JSON"))
            continue
        try:
            response = _handle(msg)
        except Exception as e:
            if not (isinstance(msg, dict) and "id" in msg):
                continue
            response = _error(msg.get("id"), -32603, f"Internal error: {_scrub_local_paths(str(e))}")
        if response is not None:
            _send(response)


if __name__ == "__main__":
    main()