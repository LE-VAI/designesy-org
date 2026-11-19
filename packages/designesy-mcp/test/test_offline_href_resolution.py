"""The offline engine resolves a stylesheet href as new URL resolves it.

WHY THIS EXISTS
The npm engine (packages/score/src/engine.ts) resolves each stylesheet href
with new URL(href, pageUrl).href, the URL Standard's parser. Until
designesy-mcp's next release the offline engine resolved it with urllib's
urljoin, which follows RFC 3986, and the two differ on some spellings:
urljoin kept a host's case and a default port, read a backslash as part of a
path segment, kept a space or other character new URL percent-encodes, kept
dot segments in an absolute href, and kept a host new URL rejects. Hrefs the
npm engine reads as one sheet could take two of the 60 places here, and a
sheet it reads could fail here or never be asked for.

CASES
test/fixtures/href-resolution.json holds hrefs, each with the URL of the page
that links it and what new URL gives for it on the Node the file names (null
where new URL throws). `node test/fixtures/href-resolution.mjs`, run from
packages/designesy-mcp, checks them against the Node it runs on. Each case
here puts its href in a <link rel="stylesheet"> and requires
_extract_css_parts to give new URL's href, or nothing where new URL throws,
and one test requires _resolve_href to give each without raising. A case whose
href types its own host as a number in a form other than four decimal parts
also holds "as_typed": the same URL with that host kept as typed, which
_extract_css_parts gives in place of new URL's four decimal parts so that the
address checks refuse it, as they refuse it in the page URL and in a redirect.
href-resolution.mjs checks that new URL reads each as_typed as the case's
expected URL, and one test here that the address checks refuse each. The cases
in the group "control" are spellings urljoin and new URL resolve alike. The
group "page host read leniently" holds page URLs for the lenient host checks
(_page_base): hosts this engine's own checks reject for want of Unicode data
Node has, which Node accepts, and three beside them: two that Node and the
lenient checks both reject, and one that this engine's own checks accept.

The other tests run _fetch_page_parts with urllib's opener (_urlopen)
replaced by a stand-in that answers from a table (which sheets a page reads,
in what order, and which URLs it asks for), leave out one href the parser
raises on, time hrefs with one long part at two lengths and count the lines
of Python the parser runs and the bytes it allocates on them, leave out a
host whose label is too long for DNS before NFC and the punycode codec run
on it, hold a page's hrefs to the budget, each charged the longer of its
bytes and its URL, and to 60 distinct sheets (_extract_css_parts), count
the labels checked to show that no more of a host is built once it can
no longer fit what is left, and check that the scan for links stops where
the parse stops.

THROUGH THE ADDRESS CHECKS
Two tests run _fetch_page_parts with the real opener, so every sheet URL
the parser gives goes through the offline URL checks on each hop: the host
before any lookup, every address it resolves to, and each redirect. The
page is read from a server on 127.0.0.1 through a name that resolves here
to a public address, as in test_offline_redirect_deadline.py, and a second
name resolves to 127.0.0.1, which the checks refuse. conftest.py's guard
refuses any other lookup and any connection past 127.0.0.1.

WHAT THIS DOES NOT MEASURE
A host with a character outside ASCII is mapped from Python's unicodedata,
whose Unicode version is not Node's. For a host with one such character,
every code point Unicode 13.0 assigns resolves as Node 24.15.0 resolves it
(measured outside this file, on Python 3.10, 3.12, 3.13 and 3.14). The
cases here use only characters Unicode 13.0 assigns, but for four page
URLs: two with U+0897, which Unicode 16.0 assigns, and two with U+0C5C,
which Unicode 16.0 does not and Node 24.15.0 accepts. A ZWNJ that is not right
after a virama is rejected in an href's host, where Node accepts one
between joining letters. On Python 3.12 and later an RTL label holding a
code point newer than Unicode 13.0 (U+0870, for one) can be accepted here
where Node rejects it. The line count and the allocation count see work
done in lines of Python and in memory. A part searched again from its
start at each code point by a call into C that allocates nothing (`in` or
str.find, for one) runs no more lines and allocates no more bytes, and
work that grows with the square of a length inside one such call, as NFC
of a run of combining marks does on Python 3.10 to 3.13, does neither:
both show only in the timed tests.
"""

from __future__ import annotations

import functools
import http.server
import io
import ipaddress
import json
import os
import random
import socket
import socketserver
import sys
import threading
import time
import tracemalloc
import unicodedata
from pathlib import Path
from unittest.mock import MagicMock, patch

import pytest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

import designesy_mcp_server as mcp  # noqa: E402

HERE = Path(__file__).resolve().parent

with (HERE / "fixtures" / "href-resolution.json").open(encoding="utf-8") as _f:
    CASES: list[dict] = json.load(_f)["cases"]


def _link(href: str) -> str:
    return f'<link rel="stylesheet" href="{href}">'


@pytest.mark.parametrize(
    "case", CASES, ids=[f"{i:03d}-{c['group'].replace(' ', '-')}" for i, c in enumerate(CASES)]
)
def test_a_stylesheet_href_resolves_as_new_url_resolves_it(case):
    html = _link(case["href"])
    # The href reaches the resolver whole, as it reaches new URL in the npm
    # engine.
    assert [m.groups[0] for m in mcp._stylesheet_link_matches(html)] == [case["href"]]
    want = [] if case["expected"] is None else [case.get("as_typed", case["expected"])]
    assert mcp._extract_css_parts(html, case["base"]) == want


def test_a_sheet_url_that_keeps_its_host_as_typed_is_refused_by_the_address_checks():
    typed = [case["as_typed"] for case in CASES if "as_typed" in case]
    assert typed
    for url in typed:
        with pytest.raises(mcp._BlockedURL, match=r"^Blocked: numeric host '.+' not written as four decimal parts$"):
            mcp._validate_url(url)


def test_the_parser_gives_each_case_with_nothing_to_catch_what_it_raises():
    # _extract_css_parts leaves out an href the parser raises ValueError on;
    # _resolve_href has no such handler, so a case whose href makes the
    # parser raise shows here.
    differ = {}
    for i, case in enumerate(CASES):
        try:
            got = mcp._resolve_href(case["href"], case["base"])
        except ValueError as e:
            got = f"raises {type(e).__name__}"
        if got != case["expected"]:
            differ[f"{i:03d}-{case['group']}"] = got
    assert differ == {}


# Hrefs that new URL makes one sheet, on a page at https://h.example/. With
# urljoin each pair took two places among the 60.
ONE_SHEET = {
    "default-port": (["/a.css", "https://h.example:443/a.css"], "https://h.example/a.css"),
    "host-case": (["/a.css", "https://H.example/a.css"], "https://h.example/a.css"),
    "raw-space": (["/a b.css", "/a%20b.css"], "https://h.example/a%20b.css"),
    "absolute-dot-segments": (["/a.css", "https://h.example/x/../a.css"], "https://h.example/a.css"),
}


@pytest.mark.parametrize("name", sorted(ONE_SHEET))
def test_two_spellings_of_one_sheet_take_one_place(name):
    hrefs, url = ONE_SHEET[name]
    parts = mcp._extract_css_parts("".join(_link(h) for h in hrefs), "https://h.example/")
    assert list(dict.fromkeys(parts)) == [url]


def test_a_host_new_url_rejects_takes_no_place():
    assert mcp._extract_css_parts(_link("https://exa mple.com/b.css"), "https://h.example/") == []


def _raising_parser(monkeypatch, raises_on: str) -> None:
    """Replace _parse_url with one that raises ValueError on one text."""
    real = mcp._parse_url

    def parse(text, base, lenient=False, built=None, room=None):
        if text == raises_on:
            raise ValueError("a stand-in for an error the parser has no case for")
        return real(text, base, lenient, built, room)

    monkeypatch.setattr(mcp, "_parse_url", parse)


def test_an_href_the_parser_raises_on_is_left_out_alone(monkeypatch):
    # urljoin's ValueError left out one href; the parser's does the same.
    _raising_parser(monkeypatch, "/raises.css")
    html = _link("/a.css") + _link("/raises.css") + _link("/b.css")
    assert mcp._extract_css_parts(html, "https://h.example/") == ["https://h.example/a.css", "https://h.example/b.css"]


def test_a_page_url_the_parser_raises_on_keeps_its_inline_css(monkeypatch):
    _raising_parser(monkeypatch, "https://h.example/")
    html = "<style>:root{--a:#000}</style>" + _link("/a.css")
    assert mcp._extract_css_parts(html, "https://h.example/") == [":root{--a:#000}"]


def _cjk(n: int) -> str:
    """n distinct code points outside ASCII, from U+4E00 on."""
    return "".join(chr(0x4E00 + i) for i in range(n))


# Hrefs with one long part, each as a function of a length n, and the n it
# is timed at. The parser builds the userinfo, path, query, fragment, host
# and an opaque path a code point at a time. A host outside ASCII, or with
# an xn-- label, also goes through the UTS #46 mapping and Python's punycode
# codec, whose time grows with a label's length times its distinct code
# points; those hosts are timed at smaller n, as each code point costs more.
LONG_HREFS = {
    "path": (lambda n: "/" + "x" * n, 150_000),
    "query": (lambda n: "/a.css?" + "x" * n, 150_000),
    "fragment": (lambda n: "/a.css#" + "x" * n, 150_000),
    "userinfo": (lambda n: "https://" + "u" * n + "@h.example/a.css", 150_000),
    "userinfo after a colon": (lambda n: "https://u:" + "p" * n + "@h.example/a.css", 150_000),
    "opaque path": (lambda n: "data:text/css," + "x" * n, 150_000),
    "host": (lambda n: "https://" + "h" * n + ".example/a.css", 150_000),
    "an @ in every other character": (lambda n: "https://" + "u@" * (n // 2) + "h.example/a.css", 150_000),
    "one label of distinct code points outside ASCII": (lambda n: "https://" + _cjk(n) + ".example/a.css", 2_500),
    "labels of 63 distinct code points outside ASCII": (
        lambda n: "https://" + ".".join([_cjk(63)] * (n // 64)) + ".example/a.css", 10_000),
    "an xn-- label": (lambda n: "https://xn--" + "9" * n + ".example/a.css", 25_000),
}


class _TooManyLines(BaseException):
    """Raised by the line count once it passes the count it is held to."""


def _lines(href: str, stop: int | None = None) -> int:
    """The lines of Python run while _resolve_href reads href, in the
    server and in every function it calls that is written in Python (the
    punycode codec among them), counted with sys.settrace. Past stop the
    count ends the read, so a parser whose lines grow with the square of
    the length fails at once rather than running for hours. No time is
    measured, so the count does not move with a machine's load."""
    count = 0

    def line(frame, event, arg):
        nonlocal count
        if event == "line":
            count += 1
            if stop is not None and count > stop:
                raise _TooManyLines
        return line

    def call(frame, event, arg):
        return line

    tracer = sys.gettrace()
    sys.settrace(call)
    try:
        mcp._resolve_href(href, "https://h.example/")
    except _TooManyLines:
        pass
    finally:
        sys.settrace(tracer)
    return count


# The hrefs of the line count, each counted at n = 500 and at 2,000: those
# of LONG_HREFS whose parts the parser reads a code point at a time, and
# one label of distinct code points outside ASCII.
LINE_HREFS = {name: (LONG_HREFS[name][0], 500) for name in (
    "path", "query", "fragment", "userinfo", "userinfo after a colon", "opaque path", "host",
    "an @ in every other character", "an xn-- label", "one label of distinct code points outside ASCII")}


def test_a_long_href_runs_lines_that_grow_with_its_length():
    # The timing test's check, counted in lines of Python run, not seconds.
    # Lines that grow with the length are about four times as many at four
    # times the length; a part read again from its start at each code
    # point a code point at a time in Python, about sixteen times. Six
    # times is the bound, and the count stops there. This test runs before
    # the timing test, which such a parser would hold for hours. A part
    # searched again at each code point by one call into C runs no more
    # lines, and only the timing test sees it.
    grew = {}
    for name, (href, n) in LINE_HREFS.items():
        once = _lines(href(n))
        longer = _lines(href(4 * n), stop=6 * once)
        if longer > 6 * once:
            grew[name] = (once, f"more than {6 * once}")
    assert grew == {}


def _seconds(short: str, long: str) -> tuple[float, float]:
    """The best of three times _resolve_href takes on each of two hrefs,
    timed in turn: short, long, short, long, short, long. A spell of load
    on the machine then slows a try of each, where timing one href three
    times and then the other could put every try of one inside it."""
    best = [float("inf"), float("inf")]
    for _ in range(3):
        for i, href in enumerate((short, long)):
            start = time.perf_counter()
            mcp._resolve_href(href, "https://h.example/")
            best[i] = min(best[i], time.perf_counter() - start)
    return best[0], best[1]


def test_a_long_href_takes_time_that_grows_with_its_length():
    # Each href is timed at n and at 4n. Time that grows with the length is
    # about four times as long; time that grows with its square, as it did
    # for a part built by adding to a string held in an attribute and for a
    # long label through the punycode codec, about sixteen times. Eight
    # times the first, and 50 ms for a slow tick, is the bound. Load on the
    # machine can put one try over it, so an href over it is timed again,
    # and fails only when both tries are over it, as an href whose time
    # grows with the square of its length is each time.
    slow = {}
    for name, (href, n) in LONG_HREFS.items():
        tries = []
        for _ in range(2):
            once, longer = _seconds(href(n), href(4 * n))
            tries.append((round(once, 3), round(longer, 3)))
            if longer <= 8 * once + 0.05:
                break
        else:
            slow[name] = tries
    assert slow == {}


# The hrefs of the allocation count, each with the n it is counted at, and
# four times that: those of LONG_HREFS whose parts the parser builds a code
# point at a time, and one label of distinct code points outside ASCII, which
# would go through the punycode codec were it not held to 63 code points.
# That label is counted at a smaller n, as each code point costs more.
ALLOCATION_HREFS = {name: (LONG_HREFS[name][0], 4_000) for name in (
    "path", "query", "fragment", "userinfo", "userinfo after a colon", "opaque path", "host",
    "an @ in every other character", "an xn-- label")}
ALLOCATION_HREFS["one label of distinct code points outside ASCII"] = (
    LONG_HREFS["one label of distinct code points outside ASCII"][0], 500)


def _allocated(href: str) -> int:
    """The bytes allocated while _resolve_href reads href, counted with
    tracemalloc at each call and return (sys.setprofile): at each, the most
    memory held since the last one, above what was held then. A string
    made anew each time a code point is added to a part, as a quadratic
    parser makes it, counts its whole length each time; a string extended
    in place counts what it grows by. No time is measured, so the count
    does not move with a machine's load."""
    total = 0
    tracing = tracemalloc.is_tracing()
    if not tracing:
        tracemalloc.start()
    profile = sys.getprofile()
    tracemalloc.reset_peak()
    start = tracemalloc.get_traced_memory()[0]

    def count(frame, event, arg):
        nonlocal total, start
        total += tracemalloc.get_traced_memory()[1] - start
        tracemalloc.reset_peak()
        start = tracemalloc.get_traced_memory()[0]

    sys.setprofile(count)
    try:
        mcp._resolve_href(href, "https://h.example/")
    finally:
        sys.setprofile(profile)
        total += tracemalloc.get_traced_memory()[1] - start
        if not tracing:
            tracemalloc.stop()
    return total


def test_a_long_href_allocates_bytes_that_grow_with_its_length():
    # The timing test's check, counted in bytes, not seconds. Bytes that
    # grow with the length are about four times as many at four times the
    # length; a part built by making a new string for each code point, as
    # a quadratic parser builds it, about sixteen times. Six times is the
    # bound.
    grew = {}
    for name, (href, n) in ALLOCATION_HREFS.items():
        once, longer = _allocated(href(n)), _allocated(href(4 * n))
        if longer > 6 * once:
            grew[name] = (once, longer, round(longer / once, 1))
    assert grew == {}


def test_a_label_of_more_than_63_code_points_through_punycode_is_left_out():
    # new URL accepts such a label. Its ASCII form is longer than the 63
    # octets DNS allows in a label, so no engine can read a sheet there. The
    # engine leaves the href out before the punycode codec runs on it.
    page = "https://h.example/"
    long_xn = "xn--" + ("\u00e9" * 58).encode("punycode").decode("ascii")
    assert len(long_xn) == 64
    assert mcp._resolve_href(f"https://{_cjk(64)}.example/a.css", page) is None
    assert mcp._resolve_href(f"https://{long_xn}.example/a.css", page) is None
    # One label of 63 such code points, or an xn-- label of 63 characters,
    # resolves as new URL resolves it: the case set holds each.
    hosts = {case["href"].split("/")[2] for case in CASES if case["href"].startswith("https://")}
    assert f"{_cjk(63)}.example" in hosts
    assert "xn--" + ("\u00e9" * 57).encode("punycode").decode("ascii") + ".example" in hosts


def _falling_marks(nbytes: int) -> str:
    """An href of nbytes or one fewer, on a host of combining marks of two
    bytes each, in eight runs of falling combining class, which NFC must
    put in order."""
    head, tail = "https://a", "/a.css"
    marks = "\u035d\u035c\u031a\u0301\u0316\u031b\u0321\u0334"
    per = (nbytes - len(head) - len(tail)) // 2 // len(marks)
    return head + "".join(mark * per for mark in marks) + tail


def test_nfc_runs_on_one_label_at_a_time_once_its_length_is_checked(monkeypatch):
    # NFC's time on a run of combining marks out of order grows with the
    # square of the run's length on CPython 3.10 to 3.13. A label of more
    # than four times 63 code points is still past 63 after NFC, and is
    # rejected before NFC runs on it; NFC is never given more, nor where
    # the bound on a page's hrefs counts a label's floor (_url_label_floor).
    given = []

    class Recording:
        def __getattr__(self, name):
            return getattr(unicodedata, name)

        def normalize(self, form, text):
            if form == "NFC":
                given.append(len(text))
            return unicodedata.normalize(form, text)

    monkeypatch.setattr(mcp, "unicodedata", Recording())
    href = _falling_marks(mcp._HREF_BUDGET_BYTES)
    assert len(href) > 32_000
    assert mcp._resolve_href(href, "https://h.example/") is None
    assert mcp._extract_css_parts(_link(href), "https://h.example/") == []
    assert mcp._resolve_href("https://" + ".".join(["\u00e9" * 63] * 3) + "/a.css", "https://h.example/")
    assert given and max(given) <= mcp._URL_IDNA_MAX_LABEL * mcp._URL_IDNA_MAX_COMPOSED


def test_nfc_of_a_domain_is_nfc_of_its_labels_and_composes_at_most_four_into_one():
    # A full stop is in no code point's canonical decomposition, NFC
    # composes it with nothing before or after it, and its combining class
    # is 0, so NFC of each label is NFC of the domain split at its full
    # stops. No code point decomposes into more than _URL_IDNA_MAX_COMPOSED,
    # the check that lets a label be rejected before NFC. Every code point
    # of this Python's unicodedata.
    def nfc(text):
        return unicodedata.normalize("NFC", text)

    def nfd(text):
        return unicodedata.normalize("NFD", text)

    assert unicodedata.combining(".") == 0
    longest, joins = 0, []
    for cp in range(0x110000):
        ch = chr(cp)
        longest = max(longest, len(nfd(ch)))
        if cp != 0x2E and ("." in nfd(ch) or nfc(ch + ".") != nfc(ch) + "." or nfc("." + ch) != "." + nfc(ch)):
            joins.append(hex(cp))
    assert joins == []
    assert longest <= mcp._URL_IDNA_MAX_COMPOSED


def test_a_label_nfc_brings_to_63_code_points_resolves_as_its_composed_form():
    # U+01DC is u, U+0308 and U+0300 composed: 63 of them, decomposed, are
    # 189 code points before NFC and 63 after it, a label new URL and this
    # engine resolve as the composed form. 64 are past the label limit.
    page = "https://h.example/"
    composed = mcp._resolve_href("https://" + "\u01dc" * 63 + ".example/a.css", page)
    assert composed is not None
    assert mcp._resolve_href("https://" + "u\u0308\u0300" * 63 + ".example/a.css", page) == composed
    assert mcp._resolve_href("https://" + "u\u0308\u0300" * 64 + ".example/a.css", page) is None


# ── Through _fetch_page_parts ────────────────────────────────────────────────


def _urlopen(table: dict[str, bytes], calls: list[str]):
    """A stand-in for _urlopen that answers from table and records each URL."""

    def urlopen(req, timeout=None, context=None):
        url = req.full_url
        calls.append(url)
        if url not in table:
            raise mcp.urllib.error.HTTPError(url, 404, "Not Found", {}, None)
        resp = MagicMock()
        sent = io.BytesIO(table[url])
        resp.read.side_effect = sent.read
        resp.read1.side_effect = sent.read1
        resp.headers = {}
        resp.geturl.return_value = url
        cm = MagicMock()
        cm.__enter__.return_value = resp
        cm.__exit__.return_value = False
        return cm

    return urlopen


def _page_parts(table: dict[str, bytes], url: str):
    calls: list[str] = []
    mcp._cache.clear()
    mcp._FINAL_URL.clear()
    mcp._DECODED_BYTES.clear()
    with patch.object(mcp, "_urlopen", _urlopen(table, calls)):
        _html, css, read = mcp._fetch_page_parts(url)
    return css, read, calls


def _page(hrefs: list[str]) -> bytes:
    links = "".join(_link(h) for h in hrefs)
    return f"<html><head>{links}</head><body><main><h1>x</h1></main></body></html>".encode()


def test_a_page_asks_once_for_each_sheet_at_the_url_new_url_gives():
    page = "https://site.example.test/blog/post"
    sheets = {
        "https://site.example.test/css/a.css": b":root{--a:#000}",
        "https://site.example.test/css/b.css": b":root{--b:#111}",
        "https://site.example.test/css/c%20d.css": b":root{--c:#222}",
        "https://cdn.example.test/x.css": b":root{--x:#333}",
        "https://site.example.test/css/caf%C3%A9.css": b":root{--e:#444}",
        "https://cdn.example.test/y.css": b":root{--y:#555}",
    }
    hrefs = [
        "/css/a.css",
        "https://SITE.example.test:443/css/a.css",  # a.css: host case, default port
        " /css/a.css ",  # a.css: spaces at both ends
        "..\\css\\b.css",  # backslashes
        "/css/c d.css",  # a raw space
        "HTTPS://CDN.example.test/x.css",  # scheme and host case
        "https://exa mple.test/z.css",  # a host new URL rejects
        "/css/caf\u00e9.css",  # a character outside ASCII
        "https://cdn.example.test/y/../y.css",  # dot segments in an absolute href
    ]
    css, read, calls = _page_parts({page: _page(hrefs), **sheets}, page)
    assert calls == [page, *sheets]
    assert read == [page, *sheets]
    assert css == "\n".join(body.decode() for body in sheets.values())


def test_a_second_spelling_of_a_sheet_takes_no_place_among_the_60():
    page = "https://cap.example.test/"
    sheets = {f"https://cap.example.test/s{i}.css": f":root{{--s{i}:#000}}".encode() for i in range(1, 62)}
    hrefs = ["/s1.css", "https://CAP.example.test/s1.css"] + [f"/s{i}.css" for i in range(2, 62)]
    _css, read, calls = _page_parts({page: _page(hrefs), **sheets}, page)
    want = [page] + [f"https://cap.example.test/s{i}.css" for i in range(1, 61)]
    # s60 is read; s61 is the 61st distinct sheet and is not asked for.
    assert calls == want
    assert read == want


def test_a_sheet_on_an_internal_address_written_another_way_is_refused():
    page = "https://site.example.test/"
    sheets = {"https://site.example.test/ok.css": b":root{--ok:#000}"}
    hrefs = [
        "http://0x7f.1/a.css",  # 127.0.0.1
        "http://2130706433/b.css",  # 127.0.0.1
        "https://10.1/c.css",  # 10.0.0.1
        # 127.0.0.1 with its digits percent-encoded, which urllib's Request
        # decodes before it connects, and in fullwidth digits.
        "http://%31%32%37.0.0.1/d.css",
        "http://１２７.０.０.１/e.css",
        "/ok.css",
    ]
    _css, read, calls = _page_parts({page: _page(hrefs), **sheets}, page)
    # Each sheet URL keeps a host typed as a number in a form other than
    # four decimal parts as typed, and _validate_url refuses it before a
    # request is made; the others are written as four decimal parts, which
    # it refuses as private. The offline URL checks refuse each href as
    # urljoin left it too, so this holds without the parser as well.
    assert calls == [page, "https://site.example.test/ok.css"]
    assert read == [page, "https://site.example.test/ok.css"]


def test_a_number_past_int_s_digit_limit_in_one_href_leaves_the_others_read():
    # int() of a decimal string of more than 4,300 digits raises ValueError
    # (CPython 3.10.7 and later), which failed the whole page here.
    page = "https://site.example.test/"
    sheets = {
        "https://cdn.example.test:80/a.css": b":root{--a:#000}",
        "https://site.example.test/ok.css": b":root{--ok:#000}",
    }
    hrefs = [
        "https://cdn.example.test:" + "0" * 4299 + "80/a.css",  # port 80, in 4,301 digits
        "http://" + "1" * 5000 + "/b.css",  # a host new URL rejects, in 5,000 digits
        "/ok.css",
    ]
    css, read, calls = _page_parts({page: _page(hrefs), **sheets}, page)
    assert calls == [page, *sheets]
    assert read == [page, *sheets]
    assert css == "\n".join(body.decode() for body in sheets.values())


# ── The bound on a page's hrefs ──────────────────────────────────────────────


def _recording_parser(monkeypatch) -> list[str]:
    """Record each href _parse_url is given against a page; the page URL,
    which _page_base parses with no base, is not recorded."""
    real = mcp._parse_url
    texts: list[str] = []

    def parse(text, base, lenient=False, built=None, room=None):
        if base is not None:
            texts.append(text)
        return real(text, base, lenient, built, room)

    monkeypatch.setattr(mcp, "_parse_url", parse)
    return texts


def _sized(nbytes: int, kind: str) -> str:
    """An href to a sheet on https://h.example/ charged exactly nbytes,
    the longer of its bytes in UTF-8 and its URL. "url": an absolute href
    that is its own URL. "relative": an href 18 characters shorter than
    its URL, which is charged its URL. "two-byte": an href whose host is
    labels of 63 U+00E9, two bytes each in UTF-8 and fewer in its URL's
    xn-- form, which is charged its own bytes."""
    if kind == "url":
        head = "https://h.example/f.css?"
    elif kind == "relative":
        head = "f.css?"
        nbytes -= len("https://h.example/")
    else:
        head = "https://" + ".".join(["\u00e9" * 63] * ((nbytes - 1_000) // 127)) + ".example/f.css?"
    return head + "x" * (nbytes - len(head.encode("utf-8")))


@pytest.mark.parametrize("kind", ["url", "relative", "two-byte"])
@pytest.mark.parametrize("over", [0, 1], ids=["to-the-byte", "one-byte-over"])
def test_the_parse_stops_at_the_href_that_would_pass_the_budget(monkeypatch, kind, over):
    # Each href is charged the longer of its bytes in UTF-8 and its URL.
    # Two hrefs whose charges come to the budget exactly are both kept. One
    # byte more, and the second is not, nor anything after it: an href whose
    # own bytes pass what is left is not resolved, and one whose URL does is
    # resolved, to learn that, and left out. U+00E9 counts two bytes.
    page = "https://h.example/"
    first = "/a.css"
    charge = mcp._HREF_BUDGET_BYTES - len(page + "a.css") + over
    second = _sized(charge, kind)
    own, url = len(second.encode("utf-8")), len(mcp._resolve_href(second, page))
    assert max(own, url) == charge
    assert (own < url) == (kind == "relative")
    texts = _recording_parser(monkeypatch)
    hrefs = [first, second, "/c.css"]
    parts = mcp._extract_css_parts("".join(_link(h) for h in hrefs), page)
    assert len(parts) == (1 if over else 2)
    assert texts == (hrefs[:1] if over and kind != "relative" else hrefs[:2])


def test_an_href_is_charged_the_url_it_resolves_to(monkeypatch):
    # A relative href takes the page URL's path. On a page read at a URL of
    # 700 path segments, which a redirect's Location can set, the one-byte
    # href "x" resolves to a URL of 1,419 characters, and the budget holds
    # 46 of them. Charged its own byte alone, each of 65,536 such hrefs
    # wrote that URL, and a page at the read cap of them took about 3 s on
    # Python 3.10, and 6 s held to a slower core.
    page = "https://h.example" + "/a" * 700 + "/page"
    url = page.rsplit("/", 1)[0] + "/x"
    texts = _recording_parser(monkeypatch)
    parts = mcp._extract_css_parts(_link("x") * 200, page)
    assert len(url) == 1_419
    assert parts == [url] * (65_536 // 1_419)
    # The href past the budget is resolved to learn its URL, and no other.
    assert len(texts) == 65_536 // 1_419 + 1


def _squares_labels() -> list[str]:
    """Labels of CJK compatibility squares (U+3300 to U+3357), each of which
    maps to several katakana, each label at most 63 code points once mapped,
    to about 4,000 bytes in UTF-8. Their xn-- form is longer than their
    bytes, so an href on these labels and .example is charged its URL."""
    squares = [chr(c) for c in range(0x3300, 0x3358)
               if all("\u30a0" <= k <= "\u30ff" for k in mcp._url_idna_map(chr(c)) or "x")]
    labels, label, size = [], "", 0
    for i in range(10_000):
        ch = squares[i % len(squares)]
        if len("".join(map(mcp._url_idna_map, label + ch))) > 63:
            labels.append(label)
            size += len(label.encode("utf-8")) + 1
            if size >= 4_000:
                break
            label = ""
        label += ch
    return labels


def _rejected_once_built(labels: list[str]) -> dict[str, str]:
    """Hrefs on the squares labels that new URL rejects only after the host
    parser has mapped the host and built some or all of its labels, one of
    them in a file URL, whose host the parser reads in a state of its own."""
    host, half = ".".join(labels), len(labels) // 2
    return {
        "port-past-65535": f"https://{host}.example:99999/a.css",
        "number-as-last-label": f"https://{host}.1/a.css",
        "forbidden-once-mapped": f"https://{host}.example\uff5c/a.css",
        "file-host-forbidden-once-mapped": f"file://{host}.example\uff5c/a.css",
        "invalid-last-label": f"https://{host}.\u0301a/a.css",
        "invalid-label-among-them": f"https://{'.'.join(labels[:half])}.\u0301a.{'.'.join(labels[half:])}.example/a.css",
        "disallowed-once-the-rest-is-mapped": f"https://{host}.example\ufffd/a.css",
    }


def _parsed(href: str) -> tuple[int, list[str]]:
    """How many hrefs _extract_css_parts gives _parse_url on a page of more
    copies of href than the budget holds by their own bytes, and the parts."""
    real = mcp._parse_url
    texts: list[str] = []

    def parse(text, base, lenient=False, built=None, room=None):
        if base is not None:
            texts.append(text)
        return real(text, base, lenient, built, room)

    page = _link(href) * (mcp._HREF_BUDGET_BYTES // len(href.encode("utf-8")) + 2)
    with patch.object(mcp, "_parse_url", parse):
        parts = mcp._extract_css_parts(page, "https://h.example/")
    return len(texts), parts


@functools.lru_cache(maxsize=None)
def _resolving_parsed() -> int:
    """_parsed for the href on the squares labels that resolves: the budget
    holds 9 of its URL, and a 10th is parsed to learn that it does not
    fit."""
    parsed, parts = _parsed("https://" + ".".join(_squares_labels()) + ".example/a.css")
    assert (len(parts), len(set(parts)), parsed) == (9, 1, 10)
    return parsed


@pytest.mark.parametrize("kind", list(_rejected_once_built(["x"])))
def test_an_href_rejected_once_its_squares_are_mapped_lets_no_more_hrefs_in_than_one_that_resolves(kind):
    # An href on the squares labels that resolves is charged its URL, so
    # the budget holds 9 of them where it would hold 16 by their bytes.
    # Rejected only once the host parser has mapped the squares (the port
    # is read after the host, a number or a forbidden code point is found
    # once the labels are built, a label is checked once the host is
    # mapped), such an href was charged its own bytes, and 16 were parsed.
    # It is now charged what its host grew by as far as the parser built
    # it. Mapping makes these labels more than three times as long, so no
    # more are parsed than of the href that resolves, whichever step
    # rejects it.
    href = _rejected_once_built(_squares_labels())[kind]
    parsed, parts = _parsed(href)
    assert parts == []
    assert _resolving_parsed() < mcp._HREF_BUDGET_BYTES // len(href.encode("utf-8"))
    assert parsed <= _resolving_parsed()
    if kind in ("port-past-65535", "number-as-last-label", "forbidden-once-mapped",
                "file-host-forbidden-once-mapped", "invalid-last-label"):
        # Every label in its ASCII form, or every label but a last one of
        # two code points, which is charged as mapped: within a few bytes of
        # that URL, so parsed as often, or once less where its bytes no
        # longer fit.
        assert parsed >= _resolving_parsed() - 1


def _to_4_000_bytes(label: str) -> list[str]:
    """Copies of one label, to about 4,000 bytes in UTF-8 with their full
    stops."""
    return [label] * (4_000 // (len(label.encode("utf-8")) + 1) + 1)


def _port_host(name: str) -> list[str]:
    """The labels of a host for the port test. "two-byte-letters": 63
    lowercase two-byte letters that each map to themselves, every eighth
    from U+00E0 (to U+056A), so the host grows once its labels are in
    their xn-- form, and not while it is mapped. "cjk-code-points": 63 in
    a row, whose xn-- form is shorter than their bytes.
    "one-square-labels": 1,000 labels of one CJK compatibility square
    each, a quarter of whose bytes are full stops."""
    if name == "two-byte-letters":
        pool = [c for c in range(0xE0, 0x800) if unicodedata.category(chr(c)) == "Ll"
                and unicodedata.bidirectional(chr(c)) == "L" and mcp._url_idna_map(chr(c)) == chr(c)]
        return _to_4_000_bytes("".join(chr(c) for c in pool[::len(pool) // 63][:63]))
    if name == "cjk-code-points":
        return _to_4_000_bytes("".join(map(chr, range(0x4E00, 0x4E00 + 63))))
    squares = [chr(c) for c in range(0x3300, 0x3358)
               if all("\u30a0" <= k <= "\u30ff" for k in mcp._url_idna_map(chr(c)) or "x")]
    return [squares[i % len(squares)] for i in range(1_000)]


@pytest.mark.parametrize("host", ["two-byte-letters", "cjk-code-points", "one-square-labels"])
def test_an_href_rejected_for_its_port_is_charged_as_its_twin_that_resolves(host):
    # The port is read once every label of the host is in its ASCII form.
    # An href with port 65536 is rejected there and charged its own bytes
    # and what its host grew by, never less than its own bytes: the longer
    # of its bytes and the URL its twin with port 65535 resolves to, which
    # is the twin's charge. So as many of each reach the parser. The
    # letters' host grows only in its xn-- form; the CJK code points' xn--
    # form is shorter than their bytes, and the href is still charged its
    # bytes; the full stops between the one-square labels are charged too.
    host_ = ".".join(_port_host(host))
    rejected, twin = (f"https://{host_}.example:{port}/a.css" for port in (65536, 65535))
    own, url = len(twin.encode("utf-8")), len(mcp._resolve_href(twin, "https://h.example/"))
    assert (url > own) == (host != "cjk-code-points")
    parsed, parts = _parsed(rejected)
    twin_parsed, twin_parts = _parsed(twin)
    assert parts == [] and len(set(twin_parts)) == 1
    assert parsed == twin_parsed


@pytest.mark.parametrize("kind", ["ascii-host-port-past-65535", "first-code-point-disallowed"])
def test_an_href_rejected_before_its_host_is_mapped_is_charged_its_own_bytes(kind):
    # Rejected before the host parser maps a code point, an href is charged
    # its own bytes, as any other href new URL rejects.
    if kind == "ascii-host-port-past-65535":
        href = "https://h.example:99999/" + "x" * 4_000
    else:
        href = "https://\ufffd" + ".".join(_squares_labels()) + ".example/a.css"
    parsed, parts = _parsed(href)
    assert parts == []
    assert parsed == mcp._HREF_BUDGET_BYTES // len(href.encode("utf-8"))


@pytest.mark.parametrize("kind", ["starts-with-a-mark", "64-code-points", "pipe-at-its-end"])
@pytest.mark.parametrize("labels", [1, 24], ids=["one-label", "24-labels"])
def test_an_href_rejected_at_its_last_label_is_charged_that_label_as_mapped(labels, kind):
    # The parser rejects the last label before it has an ASCII form: the
    # label starts with a combining mark, holds 64 code points, or is made
    # 64 by a '|' typed at its end. The href is charged each label before
    # it in its xn-- form and the last as mapped, here as written, where
    # its twin that resolves is charged that label's xn-- form, 17 bytes
    # longer. So more reach the parser than of the twin, each having run
    # the work of every label before the last: 468, 461 and 464 where 417
    # resolve on one label, and 19 where 18 resolve on 24.
    label = _port_host("two-byte-letters")[0]
    before = [label] * (labels - 1)
    last = {"starts-with-a-mark": "\u0301" + label[1:], "64-code-points": label + label[-1],
            "pipe-at-its-end": label + "|"}[kind]
    path = "/a.css" if labels == 1 else "/axx.css"
    href, twin = ("https://" + ".".join(before + [lab]) + path for lab in (last, label))
    xn = "xn--" + label.encode("punycode").decode("ascii")
    charge = len(("https://" + ".".join([xn] * len(before) + [last]) + path).encode("utf-8"))
    own = len(href.encode("utf-8"))
    parsed, parts = _parsed(href)
    twin_parsed, twin_parts = _parsed(twin)
    assert parts == [] and len(set(twin_parts)) == 1
    assert parsed == (mcp._HREF_BUDGET_BYTES - own) // charge + 1
    assert parsed > twin_parsed


@pytest.mark.parametrize("kind", ["invalid-first-label", "disallowed-at-the-end"])
def test_an_href_rejected_before_its_labels_are_built_is_charged_them_as_mapped(kind):
    # Labels of one U+00E9 each map to themselves and take 2 bytes, and 7
    # in their xn-- form. Rejected at its first label, or at a code point
    # disallowed once the rest is mapped, an href on 1,334 of them is
    # charged them as mapped, its own bytes, so 16 reach the parser where 6
    # that resolve do; none of their labels reaches the punycode codec.
    host = ".".join(["\u00e9"] * 1_334)
    href = {"invalid-first-label": f"https://\u0301a.{host}.example/a.css",
            "disallowed-at-the-end": f"https://{host}.example\ufffd/a.css"}[kind]
    own = len(href.encode("utf-8"))
    parsed, parts = _parsed(href)
    twin_parsed, twin_parts = _parsed(f"https://{host}.example/a.css")
    assert parts == [] and len(set(twin_parts)) == 1
    assert parsed == (mcp._HREF_BUDGET_BYTES - own) // own + 1
    assert parsed > twin_parsed


def _checked_labels(monkeypatch) -> list[str]:
    """Record each label _url_idna checks (_url_idna_label_ok) before it
    gives the label its ASCII form."""
    real = mcp._url_idna_label_ok
    checked: list[str] = []

    def ok(label, lenient=False):
        checked.append(label)
        return real(label, lenient)

    monkeypatch.setattr(mcp, "_url_idna_label_ok", ok)
    return checked


@pytest.mark.parametrize("where", ["before-a-path", "before-a-port", "in-a-file-url"])
def test_an_href_whose_host_cannot_fit_what_is_left_is_built_no_further(monkeypatch, where):
    # One href whose own bytes fit the budget, on 1,110 labels of
    # compatibility squares, whose URL is about 1.65 times as long. Resolved
    # in full to learn its URL, it had each label checked and given its
    # xn-- form by the punycode codec. A label not yet in its ASCII form now
    # counts at its floor, the lesser of its bytes as mapped and xn-- with a
    # character for each code point after NFC (_url_label_floor). The
    # floors pass the budget once the host is mapped, so no label is checked
    # or goes through the punycode codec, where with no room each one does.
    # The href is left out with every href after it, as before.
    labels = _squares_labels() * 15
    host = ".".join(labels)
    href = {"before-a-path": f"https://{host}.example/a.css", "before-a-port": f"https://{host}.example:8080/a.css",
            "in-a-file-url": f"file://{host}.example/a.css"}[where]
    page = "https://h.example/"
    floors = [mcp._url_label_floor("".join(map(mcp._url_idna_map, label))) for label in labels]
    assert len(href.encode("utf-8")) <= mcp._HREF_BUDGET_BYTES < sum(floors)
    checked = _checked_labels(monkeypatch)
    assert len(mcp._resolve_href(href, page)) > mcp._HREF_BUDGET_BYTES
    assert len(checked) == len(labels) + 1
    checked.clear()
    texts = _recording_parser(monkeypatch)
    assert mcp._extract_css_parts(_link(href) + _link("/b.css"), page) == []
    assert texts == [href]
    assert checked == []


def test_the_labels_of_a_host_get_their_ascii_form_only_while_they_fit(monkeypatch):
    # Labels of 63 two-byte letters take 126 bytes as mapped and 143 in
    # their xn-- form, and count 67 until they have it. An href of 500 of
    # them fits the budget by its own bytes (63,513) and not by its URL
    # (72,013). Before each label is checked, the full stops, the labels in
    # their xn-- form and 67 for each other label are added up: 33,999 at
    # the first label and 76 more at each next one. The parse stops at the
    # first label at which they pass the budget, the 416th, where with no
    # room all 500 are checked.
    label = _port_host("two-byte-letters")[0]
    xn = "xn--" + label.encode("punycode").decode("ascii")
    assert (len(label.encode("utf-8")), len(xn), mcp._url_label_floor(label)) == (126, 143, 67)
    n = 500
    href = "https://" + ".".join([label] * n) + "/a.css"
    page = "https://h.example/"
    stop = next(i for i in range(n) if n - 1 + 143 * i + 67 * (n - i) > mcp._HREF_BUDGET_BYTES)
    assert stop == 415
    checked = _checked_labels(monkeypatch)
    assert len(mcp._resolve_href(href, page)) == 72_013
    assert len(checked) == n
    checked.clear()
    assert mcp._extract_css_parts(_link(href) + _link("/b.css"), page) == []
    assert len(checked) == stop


def test_the_path_of_an_href_whose_whole_host_passes_what_is_left_is_not_parsed(monkeypatch):
    # 400 labels of those letters, then a path of 6,000 characters, after an
    # href charged 7,976 bytes, so 57,560 are left. The added-up floors stay
    # within them up to the last label (57,523), and the host built passes
    # them (57,599), so the parse ends at the host. The path, which the
    # parser would percent-encode a code point at a time, is not read, and
    # the href is left out with the one after it, as its URL (63,608) is
    # past what is left.
    label = _port_host("two-byte-letters")[0]
    href = "https://" + ".".join([label] * 400) + "/" + "x" * 6_000
    first = _sized(mcp._HREF_BUDGET_BYTES - 57_560, "url")
    page = "https://h.example/"
    encoded: list[str] = []
    reading = [False]
    real_pct, real_parse = mcp._url_pct, mcp._parse_url

    def pct(ch, encode_set):
        if reading[0]:
            encoded.append(ch)
        return real_pct(ch, encode_set)

    def parse(text, base, lenient=False, built=None, room=None):
        reading[0] = text == href
        try:
            return real_parse(text, base, lenient, built, room)
        finally:
            reading[0] = False

    monkeypatch.setattr(mcp, "_url_pct", pct)
    monkeypatch.setattr(mcp, "_parse_url", parse)
    assert len(mcp._resolve_href(href, page)) == 63_608
    assert len(encoded) == 6_000
    encoded.clear()
    assert mcp._extract_css_parts(_link(first) + _link(href) + _link("/b.css"), page) == [first]
    assert encoded == []


@pytest.mark.parametrize("kind", ["squares-shorter-in-xn-form", "rejected-at-its-first-label", "url-to-the-byte",
                                  "a-label-nfc-shortens-to-the-byte"])
def test_the_bound_on_a_host_leaves_out_no_href_that_fits(kind):
    # Each href fits what is left, and is read or charged as with no bound
    # on its host. 897 labels of 15 U+3300 each take 180 bytes as mapped
    # and 72 in their xn-- form, so 162,356 bytes in all as mapped and a
    # URL of 65,502, which is read, then /z.css. 15,000 labels of U+00E9
    # after an invalid first label are charged as mapped, 2 bytes each, and
    # /z.css is read after them; at xn-- and one character each they would
    # pass the budget. An href whose URL is what is left, to the byte, is
    # read, and nothing after it. So is one whose last label is 63 e, each
    # typed with U+0301, after 8 labels of the two-byte letters: 189 bytes
    # and 126 code points, which NFC makes 63 and whose xn-- form is 69
    # characters. Its floor is 67, four more than its code points after
    # NFC; at four more than its code points before NFC (130), or at its
    # bytes (189), the floors would pass what is left at that label.
    page = "https://h.example/"
    z = "https://h.example/z.css"
    if kind == "squares-shorter-in-xn-form":
        label = "㌀" * 15
        mapped = "".join(map(mcp._url_idna_map, label))
        assert (len(mapped.encode("utf-8")), mcp._url_label_floor(mapped)) == (180, 64)
        href = "https://" + ".".join([label] * 897) + ".example/a.css"
        hrefs, want = [href, "/z.css"], [mcp._resolve_href(href, page), z]
        assert len(want[0]) == 65_502 and 897 * 181 > mcp._HREF_BUDGET_BYTES
    elif kind == "rejected-at-its-first-label":
        href = "https://́a." + ".".join(["é"] * 15_000) + ".example/a.css"
        assert 15_000 * (4 + 1) > mcp._HREF_BUDGET_BYTES
        hrefs, want = [href, "/z.css"], [z]
    elif kind == "url-to-the-byte":
        href = "https://" + ".".join([_port_host("two-byte-letters")[0]] * 400) + "/a.css"
        url = mcp._resolve_href(href, page)
        first = _sized(mcp._HREF_BUDGET_BYTES - len(url), "url")
        hrefs, want = [first, href, "/z.css"], [first, url]
    else:
        last = "e\u0301" * 63
        composed = unicodedata.normalize("NFC", last)
        xn = "xn--" + composed.encode("punycode").decode("ascii")
        assert (len(last), len(last.encode("utf-8")), len(composed), len(xn)) == (126, 189, 63, 69)
        href = "https://" + ".".join([_port_host("two-byte-letters")[0]] * 8 + [last]) + "/a.css"
        url = mcp._resolve_href(href, page)
        assert (len(href.encode("utf-8")), len(url)) == (1_219, 1_235)
        first = _sized(mcp._HREF_BUDGET_BYTES - len(url), "url")
        hrefs, want = [first, href, "/z.css"], [first, url]
    assert mcp._extract_css_parts("".join(_link(h) for h in hrefs), page) == want


def test_the_scan_for_links_stops_where_the_parse_stops(monkeypatch):
    # The link scan finds a page's links as the parse takes them, so it
    # makes no match past the 60th distinct sheet, or past the href that
    # does not fit the budget, and reads at most _LINK_SCAN_AHEAD characters
    # further: 10,000 more links make no match.
    made: list[int] = []

    class Counted(mcp._Scan):
        def __new__(cls, *args):
            made.append(args[0])
            return super().__new__(cls, *args)

    monkeypatch.setattr(mcp, "_Scan", Counted)
    more = _link("/x.css") * 10_000
    sixty = "".join(_link(f"/s{i}.css") for i in range(1, 71))
    assert len(mcp._extract_css_parts(sixty + more, "https://h.example/")) == 60
    assert len(made) == 61
    made.clear()
    fills = _sized(mcp._HREF_BUDGET_BYTES, "url")
    assert mcp._extract_css_parts(_link(fills) + more, "https://h.example/") == [fills]
    assert len(made) == 2


# The pattern the link scan reads (engine 1.5.4), as test_linear_scan.py
# holds it.
_LINK_1_5_4 = mcp._js_re(
    r"<link(?:[^>]*rel=[\"']?stylesheet[\"']?[^>]*href=[\"']([^\"']+)[\"']|[^>]*href=[\"']([^\"']+)[\"'][^>]*rel=[\"']?stylesheet)",
    "gi")


@pytest.mark.parametrize("ahead", [0, 1, 7])
def test_the_link_scan_in_short_runs_gives_each_match_of_its_pattern(monkeypatch, ahead):
    # The scan finds the starts of rel=stylesheet and of href=" in runs of
    # _LINK_SCAN_AHEAD characters. Runs shorter than a tag end inside the
    # tags of these pages, and the scan still gives each match of its
    # pattern, and the first k of them when the first k are taken.
    # test_linear_scan.py checks it with runs of the default length.
    monkeypatch.setattr(mcp, "_LINK_SCAN_AHEAD", ahead)
    pieces = ["<link", "<LINK", " rel=", "rel=", '"stylesheet"', "'stylesheet'", "stylesheet", "href=", 'href="',
              "href='", '"', "'", "a.css", ">", " ", "x", ' rel="stylesheet">', 'href="a.css" ']
    rng = random.Random(ahead)
    for _ in range(2_000):
        s = "".join(rng.choice(pieces) for _ in range(rng.randint(0, 40)))
        want = [(m.start(), m.group(0), (m.group(1) if m.group(1) is not None else m.group(2),))
                for m in _LINK_1_5_4.finditer(s)]
        assert [tuple(x) for x in mcp._stylesheet_link_matches(s)] == want, s
        k = rng.randint(0, len(want))
        found = mcp._stylesheet_links(s)
        assert [tuple(next(found)) for _ in range(k)] == want[:k], s


def test_the_link_scan_asks_where_rel_starts_only_in_a_tag_with_an_href(monkeypatch):
    # A tag with no href=" before its first > gives no match by either
    # alternative, so the scan asks where the next rel=stylesheet starts
    # only in a tag that holds an href with a value. Asked in every tag,
    # a page at the read cap of bare <link> tags took about half as long
    # again to scan.
    asked: list[int] = []
    real = mcp._next_match_finder

    def finder(text, pat):
        at = real(text, pat)

        def counted(from_):
            asked.append(from_)
            return at(from_)

        return counted

    monkeypatch.setattr(mcp, "_next_match_finder", finder)
    page = "<link>" * 1_000 + '<link href="">' * 10 + '<link href="a">' * 10 + '<link rel="stylesheet" href="b.css">'
    assert [m.groups[0] for m in mcp._stylesheet_links(page)] == ["b.css"]
    assert len(asked) == 11


def test_a_sheet_after_an_href_past_the_budget_is_not_asked_for():
    # The parse stops at the href that does not fit: a shorter one after it
    # is not resolved either, so its sheet is not asked for.
    page = "https://site.example.test/"
    sheets = {"https://site.example.test/a.css": b":root{--a:#000}", "https://site.example.test/b.css": b":root{--b:#000}"}
    hrefs = ["/a.css", _sized(mcp._HREF_BUDGET_BYTES, "url"), "/b.css"]
    css, read, calls = _page_parts({page: _page(hrefs), **sheets}, page)
    assert calls == [page, "https://site.example.test/a.css"]
    assert read == calls
    assert css == ":root{--a:#000}"


def test_the_parse_stops_once_60_distinct_sheets_are_found(monkeypatch):
    # A repeat, an href new URL rejects and one that is not http do not
    # count among the 60. The 60th distinct sheet ends the parse: what
    # follows it is not resolved, a repeat, the text of a data: URL and a
    # 61st sheet alike.
    texts = _recording_parser(monkeypatch)
    before = ["/s1.css", "/s1.css", "https://exa mple.com/x.css", "data:text/css,a{}"] + [f"/s{i}.css" for i in range(2, 61)]
    after = ["/s1.css", "data:text/css,b{}", "/s61.css"]
    parts = mcp._extract_css_parts("".join(_link(h) for h in before + after), "https://h.example/")
    assert texts == before
    assert "data:text/css,a{}" in parts
    assert "data:text/css,b{}" not in parts
    sheets = [p for p in dict.fromkeys(parts) if p.startswith("http")]
    assert sheets == [f"https://h.example/s{i}.css" for i in range(1, 61)]


def test_control_a_page_with_more_than_60_sheets_reads_its_first_60_in_order():
    # An ordinary page with 70 sheets, some linked twice and one href that
    # is not http: the first 60 distinct sheets are asked for, in order, and
    # the data: URL's text goes into the CSS, as before this change.
    page = "https://cap.example.test/blog/"
    sheets = {f"https://cap.example.test/css/s{i}.css": f":root{{--s{i}:#000}}".encode() for i in range(1, 71)}
    hrefs = ["data:text/css,a{}"]
    for i in range(1, 71):
        hrefs.append(f"/css/s{i}.css")
        if i % 7 == 0:
            hrefs.append(f"../css/s{i - 3}.css")
    css, read, calls = _page_parts({page: _page(hrefs), **sheets}, page)
    want = [page] + [f"https://cap.example.test/css/s{i}.css" for i in range(1, 61)]
    assert calls == want
    assert read == want
    assert css.split("\n")[0] == "data:text/css,a{}"


@pytest.mark.parametrize("labels", [1_562, 21], ids=["hosts-of-1562-labels", "hosts-of-21-labels"])
def test_a_page_of_long_hosts_at_the_read_cap_resolves_within_the_read_deadline(labels):
    # Hosts of labels of 63 CJK code points are among the hrefs that cost
    # the parser the most per byte, of the kinds tried. A page of them at
    # the 16 MiB read cap took more than a minute to resolve with no bound.
    # Hosts of 21 labels, about 4,000 bytes, let 16 hrefs into the budget;
    # one of 1,562 labels is past it alone.
    href = "https://" + ".".join([_cjk(63)] * labels) + ".example/a.css"
    link = _link(href) + "\n"
    html = "<html><head>" + link * (16 * 1024 * 1024 // len(link.encode("utf-8"))) + "</head></html>"
    start = time.perf_counter()
    parts = mcp._extract_css_parts(html, "https://h.example/")
    took = time.perf_counter() - start
    assert len(parts) == mcp._HREF_BUDGET_BYTES // len(href.encode("utf-8"))
    assert took < mcp._READ_DEADLINE_SECONDS, f"{took:.2f} s"


def test_a_page_read_at_a_long_url_resolves_within_the_read_deadline():
    # One-byte hrefs at the read cap on a page read at a URL of 700 path
    # segments: each is charged its URL of 1,419 characters, so the budget
    # of 65,536 bytes holds 46 of them.
    page = "https://h.example" + "/a" * 700 + "/page"
    link = _link("x") + "\n"
    html = "<html><head>" + link * (16 * 1024 * 1024 // len(link)) + "</head></html>"
    start = time.perf_counter()
    parts = mcp._extract_css_parts(html, page)
    took = time.perf_counter() - start
    assert len(parts) == 65_536 // 1_419
    assert took < mcp._READ_DEADLINE_SECONDS, f"{took:.2f} s"


def test_a_page_of_long_hosts_then_short_links_at_the_read_cap_resolves_within_the_read_deadline():
    # Links whose hosts are 21 labels of 63 CJK code points until the budget
    # is spent, then the shortest tag the link scan reads, to the read cap.
    # The scan stops where the parse does, so the short links are not
    # scanned.
    long = _link("https://" + ".".join([_cjk(63)] * 21) + ".example/a.css") + "\n"
    lead = long * 17
    short = '<linkrel=stylesheethref="a">'
    html = "<html><head>" + lead + short * ((16 * 1024 * 1024 - len(lead.encode("utf-8"))) // len(short)) + "</head></html>"
    start = time.perf_counter()
    parts = mcp._extract_css_parts(html, "https://h.example/")
    took = time.perf_counter() - start
    assert len(parts) == 16
    assert took < mcp._READ_DEADLINE_SECONDS, f"{took:.2f} s"


def test_a_page_of_hosts_of_combining_marks_at_the_read_cap_resolves_within_the_read_deadline():
    # One href fills the budget with a host of combining marks NFC must put
    # in order. With NFC on the whole host before the label limit, CPython
    # 3.10 to 3.13 took about 0.7 s on that one href; NFC's time grows with
    # the square of such a run, and the budget holds the run's length. The
    # tests of NFC above check that NFC is given one label at a time.
    href = _falling_marks(mcp._HREF_BUDGET_BYTES)
    link = _link(href) + "\n"
    html = "<html><head>" + link * (16 * 1024 * 1024 // len(link.encode("utf-8"))) + "</head></html>"
    start = time.perf_counter()
    parts = mcp._extract_css_parts(html, "https://h.example/")
    took = time.perf_counter() - start
    assert parts == []
    assert took < mcp._READ_DEADLINE_SECONDS, f"{took:.2f} s"


# ── Through the address checks ───────────────────────────────────────────────

# The name the page is read by, and the public address it resolves to here.
NAME = "site.example.test"
PUBLIC = "93.184.215.14"
# A name that resolves here to 127.0.0.1, which the address checks refuse.
INSIDE = "inside.example.test"


class _NoReverseLookupServer(http.server.ThreadingHTTPServer):
    """ThreadingHTTPServer without the reverse lookup of its own address
    that HTTPServer.server_bind makes, which conftest.py's guard refuses."""

    def server_bind(self) -> None:
        socketserver.TCPServer.server_bind(self)
        self.server_name, self.server_port = self.server_address[:2]


class _Server:
    """An HTTP server on 127.0.0.1 that answers each path from `routes`
    (status, headers, body) and records each path it is asked for."""

    def __init__(self) -> None:
        self.routes: dict[str, tuple[int, dict[str, str], bytes]] = {}
        self.seen: list[str] = []
        server = self

        class Handler(http.server.BaseHTTPRequestHandler):
            def do_GET(self) -> None:
                server.seen.append(self.path)
                status, headers, body = server.routes.get(self.path, (404, {}, b"not here"))
                self.send_response(status)
                for name, value in headers.items():
                    self.send_header(name, value)
                self.send_header("Content-Length", str(len(body)))
                self.end_headers()
                self.wfile.write(body)

            def log_message(self, *args: object) -> None:
                pass

        self._httpd = _NoReverseLookupServer(("127.0.0.1", 0), Handler)
        self._httpd.daemon_threads = True
        self.port = self._httpd.server_address[1]
        threading.Thread(target=self._httpd.serve_forever, kwargs={"poll_interval": 0.02}, daemon=True).start()

    def close(self) -> None:
        self._httpd.shutdown()
        self._httpd.server_close()


def _clear() -> None:
    for state in (mcp._cache, mcp._FINAL_URL, mcp._DECODED_BYTES, mcp._TLS_UNVERIFIED):
        state.clear()


@pytest.fixture
def checked(monkeypatch):
    """The server, and the names looked up, with the real opener.

    NAME resolves to PUBLIC, and a connection to PUBLIC is made to the
    server; INSIDE resolves to 127.0.0.1. Any other lookup or connection
    goes to conftest.py's guard. No proxy is used.
    """
    for name in ("http_proxy", "https_proxy", "all_proxy", "no_proxy"):
        monkeypatch.delenv(name, raising=False)
        monkeypatch.delenv(name.upper(), raising=False)
    # No proxy for any host, so urllib reads none from the system either.
    monkeypatch.setenv("no_proxy", "*")
    monkeypatch.delenv("DESIGNESY_INSECURE_TLS", raising=False)
    server = _Server()
    looked_up: list[str] = []
    lookup, connect = socket.getaddrinfo, socket.socket.connect

    def getaddrinfo(host, port=None, *args, **kwargs):
        looked_up.append(host)
        # A name is looked up whatever its case, as a resolver looks it up.
        name = host.lower() if isinstance(host, str) else host
        if name in (NAME, INSIDE):
            address = PUBLIC if name == NAME else "127.0.0.1"
            return [(socket.AF_INET, socket.SOCK_STREAM, socket.IPPROTO_TCP, "", (address, int(port or 0)))]
        return lookup(host, port, *args, **kwargs)

    def to_server(sock, address):
        return connect(sock, ("127.0.0.1", address[1]) if address[0] == PUBLIC else address)

    monkeypatch.setattr(socket, "getaddrinfo", getaddrinfo)
    monkeypatch.setattr(socket.socket, "connect", to_server)
    _clear()
    try:
        yield server, looked_up
    finally:
        server.close()
        _clear()


def test_each_sheet_url_the_parser_gives_is_checked_on_every_hop(checked):
    server, looked_up = checked
    port = server.port
    page = f"http://{NAME}:{port}/blog/page"
    hrefs = [
        # Backslashes: new URL reads this as a sheet on INSIDE, which the
        # checks refuse once its name resolves to 127.0.0.1. urljoin read
        # it as a path on the page's own host.
        f"\\\\{INSIDE}:{port}\\a.css",
        # The page's host in capitals, read here, and redirected to INSIDE,
        # which the checks refuse before the redirect is followed.
        f"HTTP://{NAME.upper()}:{port}/hop.css",
        "/ok.css",
    ]
    server.routes["/blog/page"] = (200, {}, _page(hrefs))
    server.routes["/hop.css"] = (302, {"Location": f"http://{INSIDE}:{port}/c.css"}, b"")
    server.routes["/a.css"] = (200, {}, b":root{--a:#000}")
    server.routes["/c.css"] = (200, {}, b":root{--c:#000}")
    server.routes["/ok.css"] = (200, {}, b":root{--ok:#fff}")
    _html, css, read = mcp._fetch_page_parts(page)
    assert css == ":root{--ok:#fff}"
    assert read == [page, f"http://{NAME}:{port}/ok.css"]
    assert server.seen == ["/blog/page", "/hop.css", "/ok.css"]
    assert looked_up.count(INSIDE) == 2


def test_a_sheet_host_typed_as_one_number_is_refused_as_in_the_page_url_and_a_redirect(checked):
    # The address checks refuse a host typed as a number in a form other
    # than four decimal parts, public or not. new URL writes such a host as
    # four decimal parts, so the sheet URL keeps it as typed and the checks
    # refuse it, as they refuse it in the page URL and in a redirect's
    # Location, which urllib reads as typed. A sheet whose host is typed as
    # four decimal parts is read when its address is public.
    server, _looked_up = checked
    port = server.port
    page = f"http://{NAME}:{port}/"
    public = int(ipaddress.IPv4Address(PUBLIC))
    loopback = int(ipaddress.IPv4Address("127.0.0.1"))
    hrefs = [f"http://{public}:{port}/n.css", f"http://{loopback}:{port}/m.css", "/hop.css",
             f"http://{PUBLIC}:{port}/q.css", "/ok.css"]
    server.routes["/"] = (200, {}, _page(hrefs))
    server.routes["/hop.css"] = (302, {"Location": f"http://{public}:{port}/r.css"}, b"")
    for name in ("n", "m", "q", "r", "ok"):
        server.routes[f"/{name}.css"] = (200, {}, f":root{{--{name}:#000}}".encode())
    _html, css, read = mcp._fetch_page_parts(page)
    assert read == [page, f"http://{PUBLIC}:{port}/q.css", f"http://{NAME}:{port}/ok.css"]
    assert css == ":root{--q:#000}\n:root{--ok:#000}"
    assert server.seen == ["/", "/hop.css", "/q.css", "/ok.css"]
    with pytest.raises(mcp._BlockedURL, match=r"^Blocked: numeric host '\d+' not written as four decimal parts$"):
        mcp._fetch_page_parts(f"http://{public}:{port}/")
    assert server.seen == ["/", "/hop.css", "/q.css", "/ok.css"]
