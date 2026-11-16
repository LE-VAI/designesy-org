"""designesy-mcp, next release: every body the offline engine reads stops at
16 MiB, and so does a failed score call's error body.

Each case runs the real _fetch (and through it _fetch_page_parts and the
offline score), the browser probe, or designesy_score's call to the score
engine and the read of its error body, against a server on 127.0.0.1 that
writes each response byte for byte, with bodies built at run time to an
exact length. _fetch reads the server as NAME, which resolves here to
PUBLIC, a public address, and a connection to PUBLIC on the server's port
is made to the server: every hop passes the offline URL checks as a public
site's does, and nothing else is looked up or connected to. The score
engine's address and DESIGNESY_CDP_URL, which those checks do not cover,
point at the server on 127.0.0.1.

A route can hold back the end of its body until the socket closes or a set
time passes (HOLD, 3 s, unless the case gives another). A case that holds one
checks that the socket closed before any of it was sent, so a read that
stopped at its bound is told from one that read on.

Run against the server before the read cap, every case with "control" in
its name passes and every other case fails.
"""

from __future__ import annotations

import gzip
import http.client
import io
import json
import re
import socket
import struct
import sys
import threading
import time
import urllib.error
import urllib.request
import zlib
from pathlib import Path
from urllib.parse import urlparse

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import designesy_mcp_server as mcp  # noqa: E402

MiB = 1024 * 1024
CAP = 16 * MiB
HOLD = 3.0

# The name _fetch reads the server by, and the public address it resolves to.
NAME = "site.example.test"
PUBLIC = "93.184.215.14"

PAST_THE_CAP = "the response body is over 16 MiB, the most this server reads from one body"
DECODES_PAST = "the response body decodes to over 16 MiB, the most this server reads from one body"
SENT_PAST = "the response body as sent is over 16 MiB, the most this server reads from one body"

_REASONS = {200: "OK", 301: "Moved Permanently", 302: "Found", 303: "See Other",
            307: "Temporary Redirect", 308: "Permanent Redirect", 404: "Not Found",
            429: "Too Many Requests", 502: "Bad Gateway"}

# A stored deflate block that is not the last and holds nothing: BFINAL 0,
# BTYPE 00, then LEN 0 and NLEN 0xffff. A stream of them decodes to nothing
# and never ends.
EMPTY_BLOCK = b"\x00\x00\x00\xff\xff"


def _gzip_filled(total: int, tail: bytes = b"") -> bytes:
    """gzip bytes exactly `total` long: a header whose FNAME pads it, empty
    stored blocks, then `tail` (the rest of a raw deflate stream and the gzip
    trailer, or nothing for a stream with no end)."""
    room = total - 10 - len(tail)
    pad = (room - 1) % 5 + 1  # the name's bytes and its NUL
    assert room >= pad
    header = b"\x1f\x8b\x08\x08" + b"\x00" * 4 + b"\x00\xff" + b"n" * (pad - 1) + b"\x00"
    out = header + EMPTY_BLOCK * ((room - pad) // 5) + tail
    assert len(out) == total
    return out


def _gzip_tail(payload: bytes) -> bytes:
    """A final raw deflate stream of `payload` and the gzip trailer."""
    c = zlib.compressobj(6, zlib.DEFLATED, -zlib.MAX_WBITS)
    return c.compress(payload) + c.flush() + struct.pack("<II", zlib.crc32(payload), len(payload) & 0xFFFFFFFF)


def _compress(data: bytes, coding: str) -> bytes:
    if coding == "gzip":
        return gzip.compress(data, 6)
    if coding == "deflate":
        return zlib.compress(data, 6)
    raw = zlib.compressobj(6, zlib.DEFLATED, -zlib.MAX_WBITS)
    return raw.compress(data) + raw.flush()


def _page(n: int) -> bytes:
    """An HTML page exactly n bytes long."""
    head = b"<html><body><main><h1>x</h1>"
    return head + b"a" * (n - len(head))


def _sheet(i: int, n: int) -> bytes:
    """A stylesheet exactly n bytes long that declares --s<i>."""
    head = f":root{{--s{i}:#000}}/*".encode()
    return head + b"a" * (n - len(head) - 2) + b"*/"


def _chunked(data: bytes) -> bytes:
    pieces = [data[i:i + 64 * 1024] for i in range(0, len(data), 64 * 1024)]
    return b"".join(f"{len(p):x}\r\n".encode() + p + b"\r\n" for p in pieces)


def _closed_within(conn: socket.socket, seconds: float) -> bool:
    """True when the client closes the socket within `seconds`."""
    conn.settimeout(seconds)
    try:
        return conn.recv(1) == b""
    except socket.timeout:
        return False
    except OSError:
        return True


class _Route:
    """One response. framing is "length" (Content-Length: `length`, or every
    byte of body and held), "chunked", or "close" (the end of the body is the
    end of the connection). `held` is sent only if the socket is still open
    `hold` seconds (HOLD unless given) after `body`."""

    def __init__(self, body: bytes = b"", held: bytes = b"", status: int = 200,
                 headers: tuple = (), framing: str = "length", length: int | None = None,
                 hold: float = HOLD):
        self.body, self.held, self.status = body, held, status
        self.headers, self.framing, self.length, self.hold = headers, framing, length, hold


class _Server:
    def __init__(self) -> None:
        self.routes: dict[str, _Route] = {}
        self.log: dict[str, dict] = {}
        self._lock = threading.Lock()
        self._sock = socket.socket()
        self._sock.bind(("127.0.0.1", 0))
        self._sock.listen(16)
        self.port = self._sock.getsockname()[1]
        threading.Thread(target=self._accept, daemon=True).start()

    def url(self, path: str) -> str:
        """The URL _fetch reads: through NAME, past the offline URL checks."""
        return f"http://{NAME}:{self.port}{path}"

    def loopback_url(self, path: str) -> str:
        """The URL on 127.0.0.1, for the score engine and the browser probe."""
        return f"http://127.0.0.1:{self.port}{path}"

    def close(self) -> None:
        self._sock.close()

    def held_end(self, path: str) -> bool:
        """Whether the client closed the socket before the held end was sent."""
        deadline = time.monotonic() + HOLD + 5
        while time.monotonic() < deadline:
            with self._lock:
                entry = self.log.get(path, {})
                if "closed_before_end" in entry:
                    return entry["closed_before_end"]
            time.sleep(0.01)
        raise AssertionError(f"{path} recorded no end")

    def _accept(self) -> None:
        while True:
            try:
                conn, _ = self._sock.accept()
            except OSError:
                return
            threading.Thread(target=self._serve, args=(conn,), daemon=True).start()

    def _serve(self, conn: socket.socket) -> None:
        with conn:
            try:
                head = b""
                while b"\r\n\r\n" not in head:
                    data = conn.recv(4096)
                    if not data:
                        return
                    head += data
                head, sent = head.split(b"\r\n\r\n", 1)
                # A POST's body is read too: a socket closed with bytes it
                # has not read is reset, and the client can lose the answer.
                length = re.search(rb"(?im)^content-length: *(\d+)", head)
                while length and len(sent) < int(length.group(1)):
                    data = conn.recv(4096)
                    if not data:
                        return
                    sent += data
                path = head.split(b" ", 2)[1].decode()
                self._record(path, request=head.decode("latin-1"))
                self._respond(conn, path, self.routes.get(path) or _Route(status=404, body=b"not here"))
            except OSError:
                pass

    def _record(self, path: str, **fields) -> None:
        with self._lock:
            self.log.setdefault(path, {}).update(fields)

    def _respond(self, conn: socket.socket, path: str, route: _Route) -> None:
        body, held = route.body, route.held
        lines = [f"HTTP/1.1 {route.status} {_REASONS.get(route.status, 'Status')}"]
        lines += [f"{name}: {value}" for name, value in route.headers]
        if route.framing == "length":
            lines.append(f"Content-Length: {len(body) + len(held) if route.length is None else route.length}")
        elif route.framing == "chunked":
            lines.append("Transfer-Encoding: chunked")
            body = _chunked(body) + (b"" if held else b"0\r\n\r\n")
            held = _chunked(held) + b"0\r\n\r\n" if held else b""
        lines.append("Connection: close")
        try:
            conn.sendall(("\r\n".join(lines) + "\r\n\r\n").encode() + body)
        except OSError:
            if held:
                self._record(path, closed_before_end=True)
            return
        if held:
            closed = _closed_within(conn, route.hold)
            self._record(path, closed_before_end=closed)
            if closed:
                return
            try:
                conn.sendall(held)
            except OSError:
                return
        try:
            conn.shutdown(socket.SHUT_WR)
        except OSError:
            return
        # The client reads to the end before the socket goes.
        _closed_within(conn, HOLD)


@pytest.fixture
def server(monkeypatch):
    monkeypatch.delenv("DESIGNESY_INSECURE_TLS", raising=False)
    monkeypatch.delenv("DESIGNESY_CDP_URL", raising=False)
    for name in ("http_proxy", "https_proxy", "all_proxy", "no_proxy"):
        monkeypatch.delenv(name, raising=False)
        monkeypatch.delenv(name.upper(), raising=False)
    # No proxy for any host, so urllib reads none from the system either.
    monkeypatch.setenv("no_proxy", "*")
    states = (mcp._cache, mcp._FINAL_URL, getattr(mcp, "_DECODED_BYTES", {}), mcp._TLS_UNVERIFIED)
    for state in states:
        state.clear()
    srv = _Server()
    # conftest.py's guard refuses any other lookup, and any connection past
    # 127.0.0.1.
    lookup, connect = socket.getaddrinfo, socket.socket.connect

    def getaddrinfo(host, port=None, *args, **kwargs):
        if host == NAME:
            return [(socket.AF_INET, socket.SOCK_STREAM, socket.IPPROTO_TCP, "", (PUBLIC, int(port or 0)))]
        return lookup(host, port, *args, **kwargs)

    def to_the_server(sock, address):
        return connect(sock, ("127.0.0.1", srv.port) if tuple(address) == (PUBLIC, srv.port) else address)

    monkeypatch.setattr(socket, "getaddrinfo", getaddrinfo)
    monkeypatch.setattr(socket.socket, "connect", to_the_server)
    yield srv
    srv.close()
    for state in states:
        state.clear()


def _text(server: _Server, path: str) -> str:
    return mcp._fetch(server.url(path), as_json=False)


# ── One body ──────────────────────────────────────────────────────────────────


@pytest.mark.parametrize("framing", ["length", "chunked", "close"])
def test_a_body_past_16_mib_fails_naming_the_limit_and_is_read_no_further(server, framing):
    server.routes["/big"] = _Route(body=_page(CAP + 1), held=b"a" * MiB, framing=framing)
    with pytest.raises(ValueError, match=re.escape(PAST_THE_CAP)):
        _text(server, "/big")
    assert server.held_end("/big") is True


@pytest.mark.parametrize("framing", ["length", "chunked", "close"])
def test_control_a_body_of_exactly_16_mib_is_read_whole(server, framing):
    page = _page(CAP)
    server.routes["/exact"] = _Route(body=page, framing=framing)
    assert _text(server, "/exact") == page.decode()


@pytest.mark.parametrize("coding", ["gzip", "deflate", "raw-deflate"])
def test_a_compressed_body_that_decodes_past_16_mib_fails_naming_the_limit(server, coding):
    sent = _compress(_page(CAP + 1), coding)
    assert len(sent) < MiB
    server.routes["/bomb"] = _Route(body=sent, headers=[("Content-Encoding", coding.replace("raw-", ""))])
    with pytest.raises(ValueError, match=re.escape(DECODES_PAST)):
        _text(server, "/bomb")


@pytest.mark.parametrize("coding", ["gzip", "deflate", "raw-deflate"])
def test_control_a_compressed_body_that_decodes_to_exactly_16_mib_is_read(server, coding):
    page = _page(CAP)
    server.routes["/full"] = _Route(body=_compress(page, coding), headers=[("Content-Encoding", coding.replace("raw-", ""))])
    assert _text(server, "/full") == page.decode()


def test_a_compressed_body_past_16_mib_as_sent_fails_naming_the_limit_and_is_read_no_further(server):
    # 16 MiB and one byte of a gzip stream that decodes to nothing, then more
    # of it held back: decoded bytes alone never reach the limit.
    server.routes["/endless.css"] = _Route(
        body=_gzip_filled(CAP + 1), held=EMPTY_BLOCK * (MiB // 5), headers=[("Content-Encoding", "gzip")])
    with pytest.raises(ValueError, match=re.escape(SENT_PAST)):
        _text(server, "/endless.css")
    assert server.held_end("/endless.css") is True


def test_control_a_compressed_body_of_exactly_16_mib_as_sent_is_read(server):
    page = b"<html><body><main><h1>padded</h1></main></body></html>"
    server.routes["/padded"] = _Route(body=_gzip_filled(CAP, _gzip_tail(page)), headers=[("Content-Encoding", "gzip")])
    assert _text(server, "/padded") == page.decode()


@pytest.mark.parametrize("framing, hold", [("length", HOLD), ("close", 20.0)], ids=["more-bytes", "held-open"])
def test_when_a_compressed_stream_ends_nothing_more_is_read(server, framing, hold):
    # more-bytes: a megabyte follows the stream within its Content-Length.
    # held-open: no Content-Length, and the connection stays open with
    # nothing sent for longer than _fetch's 15 s idle timeout.
    page = b"<html><body><main><h1>ends early</h1></main></body></html>"
    server.routes["/gz"] = _Route(body=gzip.compress(page), held=b"\0" * MiB, framing=framing, hold=hold,
                                  headers=[("Content-Encoding", "gzip")])
    assert _text(server, "/gz") == page.decode()
    assert server.held_end("/gz") is True


def test_a_compressed_stream_that_ends_whole_is_read_when_its_content_length_promised_more(server):
    # The whole gzip stream, with a Content-Length 100 bytes longer, and then
    # the server closes. Its end, not the Content-Length, ends the read.
    page = b"<html><body><main><h1>ends early</h1></main></body></html>"
    sent = gzip.compress(page)
    server.routes["/long"] = _Route(body=sent, length=len(sent) + 100, headers=[("Content-Encoding", "gzip")])
    assert _text(server, "/long") == page.decode()


def test_a_coding_this_server_does_not_decode_fails_before_its_body_is_read(server):
    server.routes["/br"] = _Route(body=b"\x0b" * 1024, held=b"\x0b" * MiB, headers=[("Content-Encoding", "br")])
    with pytest.raises(ValueError, match="unsupported Content-Encoding 'br'"):
        _text(server, "/br")
    assert server.held_end("/br") is True


@pytest.mark.parametrize("framing", ["length", "close"])
def test_control_a_compressed_body_cut_short_fails_without_naming_the_limit(server, framing):
    whole = gzip.compress(_page(MiB), 1)
    cut = whole[: len(whole) // 2]
    server.routes["/cut"] = _Route(body=cut, framing=framing, length=len(whole) if framing == "length" else None,
                                   headers=[("Content-Encoding", "gzip")])
    if framing == "length":
        with pytest.raises(http.client.IncompleteRead):
            _text(server, "/cut")
    else:
        with pytest.raises(ValueError, match="the stream is truncated"):
            _text(server, "/cut")


def test_control_a_body_that_ends_before_its_content_length_raises_incomplete_read(server):
    server.routes["/short"] = _Route(body=b"a" * 500, length=1000)
    with pytest.raises(http.client.IncompleteRead):
        _text(server, "/short")


def test_control_an_error_status_fails_at_once_with_its_status(server):
    # Nothing of the body is sent until the socket closes or HOLD seconds pass.
    server.routes["/gone"] = _Route(status=404, held=b"e" * MiB)
    started = time.monotonic()
    with pytest.raises(urllib.error.HTTPError) as err:
        _text(server, "/gone")
    assert err.value.code == 404
    assert time.monotonic() - started < HOLD / 2


_REDIRECTS = [301, 302, 303, 307] + ([308] if hasattr(urllib.request.HTTPRedirectHandler, "http_error_308") else [])


@pytest.mark.parametrize("status", _REDIRECTS)
def test_a_redirects_body_is_closed_unread(server, status):
    page = b"<html><body><main><h1>landed</h1></main></body></html>"
    server.routes["/moved"] = _Route(status=status, headers=[("Location", "/landed")], body=b"r" * 1024, held=b"r" * MiB)
    server.routes["/landed"] = _Route(body=page)
    assert _text(server, "/moved") == page.decode()
    assert mcp._FINAL_URL[server.url("/moved")] == server.url("/landed")
    assert server.held_end("/moved") is True


def test_a_redirect_whose_body_ends_before_its_content_length_is_followed(server):
    # 10 of the 1,000 bytes its Content-Length gives, and then the server
    # closes. Nothing in the body is used, so its end does not matter.
    page = b"<html><body><main><h1>landed</h1></main></body></html>"
    server.routes["/moved"] = _Route(status=302, headers=[("Location", "/landed")], body=b"r" * 10, length=1000)
    server.routes["/landed"] = _Route(body=page)
    assert _text(server, "/moved") == page.decode()


# ── A page's stylesheets ──────────────────────────────────────────────────────


def _page_with_sheets(server: _Server, sizes: list[int]) -> list[str]:
    links = "".join(f'<link rel="stylesheet" href="/s{i}.css">' for i in range(len(sizes)))
    server.routes["/"] = _Route(body=f"<html><head>{links}</head><body><main><h1>sheets</h1></main></body></html>".encode())
    for i, size in enumerate(sizes):
        server.routes[f"/s{i}.css"] = _Route(body=_sheet(i, size))
    _html, _css, read = mcp._fetch_page_parts(server.url("/"))
    return [urlparse(u).path for u in read]


def test_a_pages_plain_stylesheets_read_no_more_than_16_mib_between_them(server):
    # Six sheets of 3 MiB with no content coding: five fit (15 MiB), and the
    # sixth would take them past 16 MiB.
    assert _page_with_sheets(server, [3 * MiB] * 6) == ["/", "/s0.css", "/s1.css", "/s2.css", "/s3.css", "/s4.css"]


def test_a_sheet_past_what_is_left_is_left_out_and_a_later_one_still_fits(server):
    # 10 MiB leaves 6 MiB: the second 10 MiB sheet fails and is charged
    # nothing, so the 5 MiB sheet after it is read.
    assert _page_with_sheets(server, [10 * MiB, 10 * MiB, 5 * MiB]) == ["/", "/s0.css", "/s2.css"]


def test_control_plain_stylesheets_of_exactly_16_mib_between_them_are_all_read(server):
    assert _page_with_sheets(server, [4 * MiB] * 4) == ["/", "/s0.css", "/s1.css", "/s2.css", "/s3.css"]


# ── What a caller sees ────────────────────────────────────────────────────────


def test_an_offline_score_of_a_page_past_16_mib_is_a_tool_error_naming_the_limit(server, monkeypatch):
    # As when the network fails before the request reaches the engine.
    monkeypatch.setattr(mcp, "_score_remote", lambda url, scope=None: None)
    server.routes["/"] = _Route(body=_page(CAP + 1))
    reply = mcp._handle({"jsonrpc": "2.0", "id": 1, "method": "tools/call",
                         "params": {"name": "designesy_score", "arguments": {"url": server.url("/")}}})
    assert reply["result"] == {"content": [{"type": "text", "text": f"Tool execution failed: {PAST_THE_CAP}"}], "isError": True}


def _json_object(n: int) -> bytes:
    """A JSON object exactly n bytes long."""
    return b'{"pad": "' + b"a" * (n - 11) + b'"}'


@pytest.mark.parametrize("tool, contract", [("designesy_tokens_score", "tokens"), ("designesy_motion_score", "motion")])
@pytest.mark.parametrize("size, past", [(CAP + 1, True), (CAP, False)], ids=["past", "control-exactly-16-mib"])
def test_a_file_past_16_mib_fails_the_tool_naming_the_limit(server, tool, contract, size, past):
    # The tool's contract comes from this site; it is put in the cache here.
    contract_url = f"https://www.designesy.org/contracts/{contract}.json"
    fixture = Path(__file__).resolve().parent / "fixtures" / contract / "contract.json"
    mcp._cache[contract_url] = (time.time(), json.loads(fixture.read_text(encoding="utf-8")))
    server.routes["/file.json"] = _Route(body=_json_object(size))
    reply = mcp._handle({"jsonrpc": "2.0", "id": 1, "method": "tools/call",
                         "params": {"name": tool, "arguments": {"url": server.url("/file.json")}}})
    if past:
        assert reply["result"] == {"content": [{"type": "text", "text": f"Tool execution failed: {PAST_THE_CAP}"}], "isError": True}
    else:
        assert reply["result"]["isError"] is False
        assert json.loads(reply["result"]["content"][0]["text"])["url"] == server.url("/file.json")


def test_the_browser_probe_stops_once_its_answer_passes_16_mib(server, monkeypatch):
    # The probe waits 2 s for a quiet socket, so the end is held for less.
    server.routes["/json/version"] = _Route(body=b" " * (CAP + 1), held=b" " * MiB, hold=1.5)
    monkeypatch.setenv("DESIGNESY_CDP_URL", server.loopback_url(""))
    assert mcp._cdp_available() is False
    assert server.held_end("/json/version") is True


def test_control_the_browser_probe_reads_a_devtools_answer(server, monkeypatch):
    server.routes["/json/version"] = _Route(body=b'{"Browser": "Chrome/138.0.0.0"}')
    monkeypatch.setenv("DESIGNESY_CDP_URL", server.loopback_url(""))
    assert mcp._cdp_available() is True


# ── A failed score call's error body ──────────────────────────────────────────


@pytest.fixture
def engine(server, monkeypatch):
    """designesy.org's score engine, played by the server on 127.0.0.1. The
    offline engine must not run: the request reaches the engine."""
    monkeypatch.setattr(mcp, "BASE_URL", server.loopback_url(""))
    monkeypatch.setattr(mcp, "_score_local_impl", lambda *a, **k: pytest.fail("the offline engine ran"))
    return server


def _engine_error(n: int) -> bytes:
    """The engine's JSON error reply, padded to exactly n bytes."""
    head = b'{"ok": false, "error": "Rate limit exceeded.", "pad": "'
    return head + b"a" * (n - len(head) - 2) + b'"}'


@pytest.mark.parametrize("framing", ["length", "chunked", "close"])
def test_a_score_error_body_past_16_mib_is_read_no_further_and_the_error_names_the_limit(engine, framing):
    # Spaces held back after the JSON keep it whole: a read that went on
    # would still find the engine's error text.
    engine.routes["/api/score"] = _Route(status=502, body=_engine_error(CAP + 1), held=b" " * MiB, framing=framing)
    result = mcp._score_impl(url="https://example.com/")
    assert result["success"] is False
    assert f"did not score https://example.com/ (HTTP 502: Bad Gateway; {PAST_THE_CAP})." in result["error"]
    assert engine.held_end("/api/score") is True


@pytest.mark.parametrize("fmt", ["canonical", "review", "google"])
def test_a_score_error_body_past_16_mib_fails_the_same_way_in_the_other_formats(engine, fmt):
    engine.routes["/api/score"] = _Route(status=502, body=_engine_error(CAP + 1), held=b" " * MiB)
    result = mcp._score_impl(url="https://example.com/", format=fmt)
    assert result["success"] is False
    assert result["format"] == fmt
    assert f"and the call failed (HTTP 502: Bad Gateway; {PAST_THE_CAP})." in result["error"]
    assert engine.held_end("/api/score") is True


@pytest.mark.parametrize("framing", ["length", "chunked", "close"])
def test_control_a_score_error_body_of_exactly_16_mib_is_read_whole(engine, framing):
    engine.routes["/api/score"] = _Route(status=502, body=_engine_error(CAP), framing=framing)
    result = mcp._score_impl(url="https://example.com/")
    assert result["success"] is False
    assert "did not score https://example.com/ (HTTP 502: Rate limit exceeded.)." in result["error"]


def test_control_the_score_call_asks_for_identity(engine):
    # So its error body is read as a body with no content coding.
    engine.routes["/api/score"] = _Route(status=429, body=_engine_error(200))
    result = mcp._score_impl(url="https://example.com/")
    assert "(HTTP 429: Rate limit exceeded.)" in result["error"]
    assert re.search(r"(?im)^accept-encoding: identity\r?$", engine.log["/api/score"]["request"])


def test_a_score_error_response_is_closed_once_read():
    # The error is still held here, so only _score_api_failure can close it.
    fp = io.BytesIO(_engine_error(200))
    exc = urllib.error.HTTPError("https://www.designesy.org/api/score", 429, "Too Many Requests", {}, fp)
    assert mcp._score_api_failure(exc) == "HTTP 429: Rate limit exceeded."
    assert fp.closed


class _UnwrappedHTTPError(urllib.error.HTTPError):
    """An HTTPError with no response, built as CPython 3.10.0 to 3.10.9 and
    3.11.0 to 3.11.1 build one: its file wrapper is never set up, so its
    read() and close() raise KeyError('file'). Later releases give it an
    empty body instead."""

    def __init__(self, url, code, msg, hdrs, fp):
        self.code, self.msg, self.hdrs, self.fp, self.filename = code, msg, hdrs, fp, url


def test_control_a_score_error_with_no_response_gives_its_status():
    # The handlers urlopen installs by default pass the response to every
    # HTTPError they raise; one with fp None comes from other handlers, such
    # as urllib's digest auth handler. Both forms give the status, on every
    # Python the package supports.
    url = "https://www.designesy.org/api/score"
    for exc in (_UnwrappedHTTPError(url, 401, "digest auth failed", {}, None),
                urllib.error.HTTPError(url, 401, "digest auth failed", {}, None)):
        assert mcp._score_api_failure(exc) == "HTTP 401: digest auth failed"
