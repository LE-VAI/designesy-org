"""designesy-mcp, next release: the offline engine follows a 308 on every
Python, and each page and stylesheet read it makes ends at a deadline.

Each case runs the real _fetch, _fetch_page_parts or designesy_score's
offline fallback against a server on 127.0.0.1 that answers each request
with a script: bytes to send, and pauses. During a pause the server watches
the socket, and when the client closes it the server records when and sends
nothing more. _fetch reads the server as NAME, which resolves here to
PUBLIC, a public address, and a connection to PUBLIC is made to 127.0.0.1
on the same port: every hop passes the offline URL checks as a public
site's does, and nothing else is looked up or connected to. slow.test, a
name whose lookup a case makes slow, resolves to PUBLIC too, and INSIDE to
127.0.0.1, which the checks refuse. Three cases instead run a real TLS
handshake, or a proxy's CONNECT, to a listener that never answers it.

Most deadline cases set the deadline to 2 s (DEADLINE), so the suite runs
in seconds; one case keeps the real 8 s. Every pause in a script is shorter
than the socket's own 15 s timeout, so without a deadline each read ends
when its script does.

A case whose read runs past its deadline also checks that the read's
thread ends, and most check that the server saw the connection end at the
deadline. Run against the server before this change (with the address
checks and the read cap), the deadline cases whose names do not start with
"test_control" fail on every Python, except the case of a read caching its
page as the deadline comes, which passes there since nothing cuts that
read. The 308 cases that load the server with Python 3.10's redirect
handling fail on every Python. The other 308 cases fail on Python 3.10,
whose urllib follows no 308, and pass from 3.11, whose urllib follows it.
The 302 cases beside them are controls.
"""

from __future__ import annotations

import gc
import importlib.util
import json
import re
import socket
import ssl
import sys
import threading
import time
import urllib.error
import urllib.request
import warnings
from pathlib import Path
from urllib.parse import urlparse

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import designesy_mcp_server as mcp  # noqa: E402

DEADLINE = 2
# How far past the deadline a cut read may end, for a slow machine.
LATE = 1.5
READ_THREAD = "designesy-mcp read"

_REASONS = {200: "OK", 302: "Found", 308: "Permanent Redirect", 404: "Not Found"}

PAGE = b"<html><head><style>:root{--paper:#fff}</style></head><body><main><h1>x</h1></main></body></html>"

# The name _fetch reads the server by, and the public address it resolves to.
NAME = "site.example.test"
PUBLIC = "93.184.215.14"
# A name that resolves here to 127.0.0.1, which the address checks refuse.
INSIDE = "inside.example.test"


def _past_deadline(seconds: int) -> str:
    return (f"the read did not finish within {seconds} seconds, the most this "
            "server waits for one read of a page or a stylesheet")


def _head(status: int, headers: tuple = (), length: int | None = None) -> bytes:
    lines = [f"HTTP/1.1 {status} {_REASONS.get(status, 'Status')}"]
    lines += [f"{name}: {value}" for name, value in headers]
    if length is not None:
        lines.append(f"Content-Length: {length}")
    lines.append("Connection: close")
    return ("\r\n".join(lines) + "\r\n\r\n").encode()


def _ok(body: bytes, headers: tuple = ()) -> bytes:
    return _head(200, headers, len(body)) + body


def _redirect(status: int, location: str) -> bytes:
    return _head(status, [("Location", location)], 0)


def _drip(data: bytes, gap: float) -> list:
    """data one byte at a time, `gap` seconds apart."""
    steps: list = []
    for i in range(len(data)):
        steps += [gap, data[i:i + 1]]
    return steps


class _Server:
    """Answers each request for a path with its script: bytes are sent, and a
    number is a pause of that many seconds. An unknown path gets a 404."""

    def __init__(self) -> None:
        self.routes: dict[str, list] = {}
        self.log: dict[str, dict] = {}
        self._lock = threading.Lock()
        self._sock = socket.socket()
        self._sock.bind(("127.0.0.1", 0))
        self._sock.listen(16)
        self.port = self._sock.getsockname()[1]
        threading.Thread(target=self._accept, daemon=True).start()

    def url(self, path: str, host: str = NAME) -> str:
        """The URL _fetch reads: through NAME, past the offline URL checks."""
        return f"http://{host}:{self.port}{path}"

    def close(self) -> None:
        self._sock.close()

    def entry(self, path: str) -> dict:
        with self._lock:
            return dict(self.log.get(path, {}))

    def ended(self, path: str, within: float = 10.0) -> dict:
        """The path's entry once its script has ended, one way or the other."""
        until = time.monotonic() + within
        while time.monotonic() < until:
            entry = self.entry(path)
            if "ended" in entry:
                return entry
            time.sleep(0.01)
        raise AssertionError(f"{path}: the script did not end")

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
            except OSError:
                return
            path = head.split(b" ", 2)[1].decode()
            asked = time.monotonic()
            with self._lock:
                self.log.setdefault(path, {"requests": 0})["requests"] += 1
                self.log[path]["asked"] = asked
            script = self.routes.get(path, [_ok(b"not here")])
            for step in script:
                if isinstance(step, bytes):
                    try:
                        conn.sendall(step)
                    except OSError:
                        return self._end(path, asked, closed=True)
                elif _closed_within(conn, step):
                    return self._end(path, asked, closed=True)
            self._end(path, asked, closed=False)
            try:
                conn.shutdown(socket.SHUT_WR)
            except OSError:
                return
            _closed_within(conn, 5.0)

    def _end(self, path: str, asked: float, closed: bool) -> None:
        with self._lock:
            self.log[path].update(ended=time.monotonic() - asked, closed_early=closed)


def _closed_within(conn: socket.socket, seconds: float) -> bool:
    """True when the client closes or shuts down the socket within `seconds`."""
    until = time.monotonic() + seconds
    while True:
        left = until - time.monotonic()
        if left <= 0:
            return False
        conn.settimeout(left)
        try:
            if conn.recv(1) == b"":
                return True
        except socket.timeout:
            return False
        except OSError:
            return True


def _read_threads() -> list[threading.Thread]:
    return [t for t in threading.enumerate() if t.name == READ_THREAD]


@pytest.fixture
def server(monkeypatch):
    monkeypatch.delenv("DESIGNESY_INSECURE_TLS", raising=False)
    monkeypatch.delenv("DESIGNESY_CDP_URL", raising=False)
    for name in ("http_proxy", "https_proxy", "all_proxy", "no_proxy"):
        monkeypatch.delenv(name, raising=False)
        monkeypatch.delenv(name.upper(), raising=False)
    # No proxy for any host, so urllib reads none from the system either.
    monkeypatch.setenv("no_proxy", "*")
    states = (mcp._cache, mcp._FINAL_URL, mcp._DECODED_BYTES, mcp._TLS_UNVERIFIED)
    for state in states:
        state.clear()
    srv = _Server()
    # conftest.py's guard refuses any other lookup, and any connection past
    # 127.0.0.1.
    lookup, connect = socket.getaddrinfo, socket.socket.connect

    def getaddrinfo(host, port=None, *args, **kwargs):
        if host in (NAME, INSIDE):
            address = PUBLIC if host == NAME else "127.0.0.1"
            return [(socket.AF_INET, socket.SOCK_STREAM, socket.IPPROTO_TCP, "", (address, int(port or 0)))]
        return lookup(host, port, *args, **kwargs)

    def to_loopback(sock, address):
        return connect(sock, ("127.0.0.1", address[1]) if address[0] == PUBLIC else address)

    monkeypatch.setattr(socket, "getaddrinfo", getaddrinfo)
    monkeypatch.setattr(socket.socket, "connect", to_loopback)
    yield srv
    # Every read a case started has ended by the time its server is gone.
    until = time.monotonic() + 10
    while _read_threads() and time.monotonic() < until:
        time.sleep(0.01)
    left = _read_threads()
    srv.close()
    for state in states:
        state.clear()
    assert not left, f"{len(left)} read thread(s) still running"


@pytest.fixture
def fast(monkeypatch):
    """The read deadline set to DEADLINE seconds. raising=False: the base
    the cases are run against has no deadline to set, and there they fail on
    what the read does, not on a missing name."""
    monkeypatch.setattr(mcp, "_READ_DEADLINE_SECONDS", DEADLINE, raising=False)


def _parts(server: _Server, path: str) -> tuple[str, str, list[str]]:
    html, css, read = mcp._fetch_page_parts(server.url(path))
    return html, css, [urlparse(u).path for u in read]


def _cut(server: _Server, path: str, seconds: int = DEADLINE) -> float:
    """Read the page at `path`, which must fail at the deadline; returns how
    long the read took."""
    return _cut_url(server.url(path), seconds)


def _cut_url(url: str, seconds: int = DEADLINE) -> float:
    started = time.monotonic()
    with pytest.raises(TimeoutError, match=re.escape(_past_deadline(seconds))):
        mcp._fetch_page_parts(url)
    took = time.monotonic() - started
    assert seconds - 0.1 <= took < seconds + LATE, took
    return took


# ── 308 ───────────────────────────────────────────────────────────────────────


def test_a_page_behind_a_308_is_read_and_its_sheets_resolve_where_it_landed(server):
    page = b'<html><head><link rel="stylesheet" href="site.css"></head><body><main><h1>x</h1></main></body></html>'
    server.routes["/moved"] = [_redirect(308, "/new/")]
    server.routes["/new/"] = [_ok(page)]
    server.routes["/new/site.css"] = [_ok(b":root{--paper:#fff}")]
    html, css, read = _parts(server, "/moved")
    assert html == page.decode()
    assert css == ":root{--paper:#fff}"
    assert read == ["/moved", "/new/site.css"]
    assert mcp._FINAL_URL[server.url("/moved")] == server.url("/new/")


def test_a_stylesheet_behind_a_308_is_read(server):
    page = b'<html><head><link rel="stylesheet" href="/old.css"></head><body><main><h1>x</h1></main></body></html>'
    server.routes["/"] = [_ok(page)]
    server.routes["/old.css"] = [_redirect(308, "/new.css")]
    server.routes["/new.css"] = [_ok(b":root{--paper:#fff}")]
    _html, css, read = _parts(server, "/")
    assert css == ":root{--paper:#fff}"
    assert read == ["/", "/old.css"]


_SERVER_FILE = Path(__file__).resolve().parent.parent / "designesy_mcp_server.py"


def _loaded_with_python_3_10_redirects(monkeypatch):
    """A fresh copy of the server module, loaded while urllib's redirect
    handler is as Python 3.10 has it: no http_error_308, and a
    redirect_request that refuses a 308 with HTTPError. The server's own
    handling of a 308 then decides the read, on every Python (CI runs one,
    whose urllib follows a 308 itself)."""
    handler = urllib.request.HTTPRedirectHandler
    monkeypatch.delattr(handler, "http_error_308", raising=False)
    real = handler.redirect_request

    def redirect_request(self, req, fp, code, msg, headers, newurl):
        if code == 308:
            raise urllib.error.HTTPError(req.full_url, code, msg, headers, fp)
        return real(self, req, fp, code, msg, headers, newurl)

    monkeypatch.setattr(handler, "redirect_request", redirect_request)
    spec = importlib.util.spec_from_file_location("designesy_mcp_server_with_3_10_redirects", _SERVER_FILE)
    fresh = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(fresh)
    return fresh


@pytest.mark.parametrize("status", [302, 308], ids=["control-302", "308"])
def test_a_redirect_is_followed_where_urllib_follows_no_308(server, monkeypatch, status):
    fresh = _loaded_with_python_3_10_redirects(monkeypatch)
    server.routes["/moved"] = [_redirect(status, "/new")]
    server.routes["/new"] = [_ok(PAGE)]
    assert fresh._fetch(server.url("/moved"), as_json=False) == PAGE.decode()
    assert server.entry("/new")["requests"] == 1


@pytest.mark.parametrize("status", [302, 308], ids=["control-302", "308"])
@pytest.mark.parametrize("target", ["http://127.0.0.1:{port}/secret", f"http://{INSIDE}:{{port}}/secret"],
                         ids=["address", "name"])
def test_a_redirect_to_an_internal_host_is_refused_where_urllib_follows_no_308(server, monkeypatch, status, target):
    # The address checks run on the 308 as on any redirect: the host as
    # written, then the addresses its name resolves to.
    fresh = _loaded_with_python_3_10_redirects(monkeypatch)
    server.routes["/moved"] = [_redirect(status, target.format(port=server.port))]
    server.routes["/secret"] = [_ok(b"internal")]
    with pytest.raises(ValueError, match="^Blocked: "):
        fresh._fetch(server.url("/moved"), as_json=False)
    assert server.entry("/secret") == {}


def _looked_up(monkeypatch) -> list[str]:
    """The names looked up from here on, in order; each lookup still goes
    to the server fixture's stand-in."""
    names: list[str] = []
    lookup = socket.getaddrinfo

    def getaddrinfo(host, port=None, *args, **kwargs):
        names.append(host)
        return lookup(host, port, *args, **kwargs)

    monkeypatch.setattr(socket, "getaddrinfo", getaddrinfo)
    return names


@pytest.mark.parametrize("status", [302, 308], ids=["control-302", "308"])
def test_a_page_redirected_to_an_internal_name_is_refused_on_the_deadline_path_where_urllib_follows_no_308(
        server, monkeypatch, status):
    # _fetch_page_parts reads the page through the deadline's handlers,
    # which wrap the checked ones: the name is looked up and every address
    # it gives is checked before a connection is made.
    fresh = _loaded_with_python_3_10_redirects(monkeypatch)
    names = _looked_up(monkeypatch)
    server.routes["/moved"] = [_redirect(status, f"http://{INSIDE}:{server.port}/secret")]
    server.routes["/secret"] = [_ok(PAGE)]
    with pytest.raises(ValueError, match=f"^Blocked: host '{INSIDE}' resolves to private/reserved IP '127.0.0.1'$"):
        fresh._fetch_page_parts(server.url("/moved"))
    assert INSIDE in names
    assert server.entry("/secret") == {}


@pytest.mark.parametrize("status", [302, 308], ids=["control-302", "308"])
def test_a_sheet_redirected_to_an_internal_name_is_left_out_on_the_deadline_path_where_urllib_follows_no_308(
        server, monkeypatch, status):
    fresh = _loaded_with_python_3_10_redirects(monkeypatch)
    names = _looked_up(monkeypatch)
    page = (b'<html><head><link rel="stylesheet" href="/old.css"><link rel="stylesheet" href="/ok.css">'
            b"</head><body><main><h1>x</h1></main></body></html>")
    server.routes["/"] = [_ok(page)]
    server.routes["/old.css"] = [_redirect(status, f"http://{INSIDE}:{server.port}/secret.css")]
    server.routes["/secret.css"] = [_ok(b":root{--secret:#000}")]
    server.routes["/ok.css"] = [_ok(b":root{--ok:#fff}")]
    _html, css, read = fresh._fetch_page_parts(server.url("/"))
    assert css == ":root{--ok:#fff}"
    assert [urlparse(u).path for u in read] == ["/", "/ok.css"]
    # The redirect was followed as far as the check of the name's address.
    assert INSIDE in names
    assert server.entry("/secret.css") == {}


def _chain(server: _Server, status: int, hops: int) -> str:
    """`hops` redirects of `status`, /r0 to /r1 and on, then the page."""
    for i in range(hops):
        server.routes[f"/r{i}"] = [_redirect(status, f"/r{i + 1}")]
    server.routes[f"/r{hops}"] = [_ok(PAGE)]
    return server.url("/r0")


@pytest.mark.parametrize("status", [302, 308], ids=["control-302", "308"])
def test_five_redirects_are_followed(server, status):
    assert mcp._fetch(_chain(server, status, 5), as_json=False) == PAGE.decode()
    assert server.entry("/r5")["requests"] == 1


@pytest.mark.parametrize("status", [302, 308], ids=["control-302", "308"])
def test_a_sixth_redirect_is_refused(server, status):
    # The hosted fetch's limit, which the offline URL checks hold every
    # read to.
    with pytest.raises(ValueError, match=r"^Blocked: more than 5 redirects$"):
        mcp._fetch(_chain(server, status, 6), as_json=False)
    assert server.entry("/r5")["requests"] == 1
    assert server.entry("/r6") == {}


@pytest.mark.parametrize("status", [302, 308], ids=["control-302", "308"])
def test_a_sixth_redirect_is_refused_where_urllib_follows_no_308(server, monkeypatch, status):
    fresh = _loaded_with_python_3_10_redirects(monkeypatch)
    with pytest.raises(ValueError, match=r"^Blocked: more than 5 redirects$"):
        fresh._fetch(_chain(server, status, 6), as_json=False)
    assert server.entry("/r5")["requests"] == 1
    assert server.entry("/r6") == {}


@pytest.mark.parametrize("status", [302, 308], ids=["control-302", "308"])
def test_a_redirect_back_to_itself_fails_as_a_loop(server, status):
    # urllib follows a redirect to one URL at most 4 times (max_repeats), so
    # /loop is asked for 5 times: once, and once for each redirect followed.
    server.routes["/loop"] = [_redirect(status, "/loop")]
    with pytest.raises(urllib.error.HTTPError) as err:
        mcp._fetch(server.url("/loop"), as_json=False)
    assert err.value.code == status
    assert str(err.value.reason).startswith("The HTTP server returned a redirect error that would lead to an infinite loop.")
    assert server.entry("/loop")["requests"] == 5


@pytest.mark.parametrize("status", [302, 308], ids=["control-302", "308"])
def test_a_redirect_to_a_scheme_urllib_refuses_fails(server, status):
    server.routes["/moved"] = [_redirect(status, "file:///etc/hosts")]
    with pytest.raises(urllib.error.HTTPError) as err:
        mcp._fetch(server.url("/moved"), as_json=False)
    assert err.value.code == status
    assert "Redirection to url 'file:///etc/hosts' is not allowed" in str(err.value.reason)


# ── The read deadline ─────────────────────────────────────────────────────────


def test_a_page_whose_server_never_answers_fails_at_the_deadline(server, fast):
    server.routes["/"] = [DEADLINE + 2.0, _ok(PAGE)]
    _cut(server, "/")
    entry = server.ended("/")
    assert entry["closed_early"] is True
    assert entry["ended"] < DEADLINE + LATE


def test_a_body_sent_a_byte_at_a_time_fails_at_the_deadline(server, fast):
    # 40 bytes, one each 0.1 s: never quiet for long, done after 4 s.
    body = PAGE[:40]
    server.routes["/"] = [_head(200, length=len(body))] + _drip(body, 0.1)
    _cut(server, "/")
    entry = server.ended("/")
    assert entry["closed_early"] is True
    assert entry["ended"] < DEADLINE + LATE


def test_headers_sent_a_byte_at_a_time_fail_at_the_deadline(server, fast):
    head = _head(200, [("X-Pad", "a" * 40)], len(PAGE))
    server.routes["/"] = [head[:17]] + _drip(head[17:], 0.07) + [PAGE]
    _cut(server, "/")
    assert server.ended("/")["closed_early"] is True


def test_the_deadline_runs_across_redirects(server, fast):
    # Three hops of 0.6 s, 0.6 s and 1.5 s: each inside the deadline, 2.7 s
    # in all. The third is asked for at about 1.2 s, well before the cut at
    # 2 s, and its answer would come after it.
    server.routes["/a"] = [0.6, _redirect(302, "/b")]
    server.routes["/b"] = [0.6, _redirect(302, "/c")]
    server.routes["/c"] = [1.5, _ok(PAGE)]
    _cut(server, "/a")
    assert server.ended("/c")["closed_early"] is True


def test_control_a_page_read_within_the_deadline_is_read(server, fast):
    # A redirect after 0.5 s, then a body over 0.6 s: about 1.1 s in all.
    server.routes["/a"] = [0.5, _redirect(302, "/b")]
    server.routes["/b"] = [_head(200, length=len(PAGE)), PAGE[:20]] + _drip(PAGE[20:26], 0.1) + [PAGE[26:]]
    started = time.monotonic()
    html, _css, read = _parts(server, "/a")
    assert html == PAGE.decode()
    assert read == ["/a"]
    assert time.monotonic() - started < DEADLINE


def test_each_stylesheet_has_a_deadline_of_its_own_and_one_past_it_is_left_out(server, fast):
    links = "".join(f'<link rel="stylesheet" href="/s{i}.css">' for i in range(3))
    server.routes["/"] = [_ok(f"<html><head>{links}</head><body><main><h1>x</h1></main></body></html>".encode())]
    server.routes["/s0.css"] = [DEADLINE + 2.0, _ok(b":root{--s0:#000}")]
    server.routes["/s1.css"] = [_ok(b":root{--s1:#000}")]
    # Read over about 1.6 s: inside its own deadline, past what a deadline
    # shared with /s0.css would leave.
    sheet = b":root{--s2:#000}"
    server.routes["/s2.css"] = [_head(200, length=len(sheet))] + _drip(sheet, 0.1)
    started = time.monotonic()
    _html, css, read = _parts(server, "/")
    took = time.monotonic() - started
    assert read == ["/", "/s1.css", "/s2.css"]
    assert css == ":root{--s1:#000}\n:root{--s2:#000}"
    assert DEADLINE + 1.5 <= took < DEADLINE + 1.5 + LATE, took
    assert server.ended("/s0.css")["closed_early"] is True


def _reads_end() -> None:
    until = time.monotonic() + 10
    while _read_threads() and time.monotonic() < until:
        time.sleep(0.01)
    assert not _read_threads()


def _nothing_cached(url: str) -> None:
    assert url not in mcp._cache
    assert url not in mcp._FINAL_URL
    assert url not in mcp._DECODED_BYTES


def test_a_read_cut_at_the_deadline_caches_nothing(server, fast):
    # No Content-Length: the body ends when the connection does. On Linux a
    # socket shut down for reading reads as ended, so the read returns what
    # it has so far; on Windows its next read fails instead.
    server.routes["/"] = [_head(200), PAGE[:10]] + _drip(PAGE[10:50], 0.1)
    _cut(server, "/")
    server.ended("/")
    _reads_end()
    _nothing_cached(server.url("/"))


def test_a_read_that_ends_after_its_deadline_caches_nothing(server, fast, monkeypatch):
    # The whole page arrives at once, and the read of it returns only after
    # the deadline: what it returns is dropped, on every platform.
    real = mcp._read_body

    def late(*args, **kwargs):
        body = real(*args, **kwargs)
        time.sleep(DEADLINE + 0.5)
        return body

    monkeypatch.setattr(mcp, "_read_body", late)
    server.routes["/"] = [_ok(PAGE)]
    _cut(server, "/")
    _reads_end()
    _nothing_cached(server.url("/"))


class _SlowToStore(dict):
    """A cache whose stores each take DEADLINE + 0.5 s, so a read is still
    storing its page when its deadline comes."""

    def __setitem__(self, key, value):
        time.sleep(DEADLINE + 0.5)
        super().__setitem__(key, value)


def test_a_read_caching_its_page_as_the_deadline_comes_returns_it(server, fast, monkeypatch):
    # The read has the whole page and is caching it when the deadline
    # comes. It is not cut: the call returns the page it cached, so the
    # cache never holds a page whose call failed at the deadline.
    monkeypatch.setattr(mcp, "_cache", _SlowToStore())
    server.routes["/"] = [_ok(PAGE)]
    started = time.monotonic()
    html, _css, read = _parts(server, "/")
    took = time.monotonic() - started
    assert html == PAGE.decode()
    assert read == ["/"]
    assert mcp._cache[server.url("/")][1] == PAGE.decode()
    assert DEADLINE <= took < DEADLINE + LATE, took


def test_the_deadline_covers_a_slow_lookup(server, fast, monkeypatch):
    # A socket opened after the deadline is shut down as it opens, so no
    # request reaches the server.
    real = socket.getaddrinfo

    def slow(host, *args, **kwargs):
        if host == "slow.test":
            time.sleep(DEADLINE + 1.0)
            host = NAME
        return real(host, *args, **kwargs)

    monkeypatch.setattr(socket, "getaddrinfo", slow)
    server.routes["/"] = [_ok(PAGE)]
    started = time.monotonic()
    with pytest.raises(TimeoutError, match=re.escape(_past_deadline(DEADLINE))):
        mcp._fetch_page_parts(server.url("/", host="slow.test"))
    assert DEADLINE - 0.1 <= time.monotonic() - started < DEADLINE + LATE
    _reads_end()
    assert server.entry("/") == {}


class _Listener:
    """Accepts one connection on 127.0.0.1, reads what the client sends
    first, then sends nothing and records when the client ends the
    connection, for up to 25 s."""

    def __init__(self) -> None:
        self._sock = socket.socket()
        self._sock.bind(("127.0.0.1", 0))
        self._sock.listen(1)
        self.port = self._sock.getsockname()[1]
        self.first = b""
        self.ended_at: float | None = None
        self._done = threading.Event()
        threading.Thread(target=self._serve, daemon=True).start()

    def _serve(self) -> None:
        try:
            conn, _ = self._sock.accept()
        except OSError:
            self._done.set()
            return
        with conn:
            try:
                self.first = conn.recv(4096)
                conn.settimeout(25)
                while conn.recv(4096):
                    pass
                self.ended_at = time.monotonic()
            except socket.timeout:
                pass
            except OSError:
                self.ended_at = time.monotonic()
        self._done.set()

    def ended(self, within: float = 30.0) -> float | None:
        self._done.wait(within)
        return self.ended_at

    def close(self) -> None:
        self._sock.close()


def test_the_deadline_shuts_down_a_read_in_its_tls_handshake(server, fast):
    # A real handshake, which the listener never answers. ssl's wrap_socket
    # detaches the TCP socket before the handshake starts, so shutting that
    # socket down would reach nothing: the read would wait for the
    # handshake's own 15 s timeout.
    listener = _Listener()
    try:
        started = time.monotonic()
        with pytest.raises(TimeoutError, match=re.escape(_past_deadline(DEADLINE))):
            mcp._fetch_page_parts(f"https://{NAME}:{listener.port}/")
        assert DEADLINE - 0.1 <= time.monotonic() - started < DEADLINE + LATE
        ended = listener.ended()
    finally:
        listener.close()
    assert listener.first[:1] == b"\x16", listener.first[:16]  # a TLS handshake record
    assert ended is not None, "the listener saw no end within 25 s"
    assert ended - started < DEADLINE + LATE, f"the listener saw the end after {ended - started:.2f} s"
    _reads_end()


def test_a_tls_socket_cut_in_its_handshake_is_closed(server, fast):
    # The deadline shuts the socket down and the handshake fails. The TLS
    # socket is closed then, as ssl's own wrap_socket closes one whose
    # handshake fails, and not left open until it is collected.
    listener = _Listener()
    with warnings.catch_warnings(record=True) as caught:
        warnings.simplefilter("always", ResourceWarning)
        try:
            with pytest.raises(TimeoutError, match=re.escape(_past_deadline(DEADLINE))):
                mcp._fetch_page_parts(f"https://{NAME}:{listener.port}/")
            assert listener.ended() is not None, "the listener saw no end within 25 s"
        finally:
            listener.close()
        _reads_end()
        # The read's error holds the socket in a reference cycle.
        gc.collect()
    unclosed = [str(w.message) for w in caught
                if issubclass(w.category, ResourceWarning) and "SSLSocket" in str(w.message)]
    assert unclosed == []


class _HandshakeStandIn:
    """What a context's wrap_socket returns: a handshake that raises
    `error`, and a record of whether the socket was closed."""

    def __init__(self, error: BaseException) -> None:
        self.error = error
        self.closed = False

    def do_handshake(self) -> None:
        raise self.error

    def close(self) -> None:
        self.closed = True


class _ContextStandIn:
    """An SSL context whose wrap_socket gives one _HandshakeStandIn and
    records whether it was asked to run the handshake on connect."""

    def __init__(self, tls: _HandshakeStandIn) -> None:
        self.tls = tls
        self.handshake_on_connect: bool | None = None

    def wrap_socket(self, sock, server_hostname=None, do_handshake_on_connect=True):
        self.handshake_on_connect = do_handshake_on_connect
        return self.tls


@pytest.mark.parametrize(
    "error",
    [ssl.SSLEOFError(8, "cut"), ConnectionResetError(104, "cut"), TimeoutError("cut"), ValueError("cut")],
    ids=["ssl-error", "connection-reset", "timeout", "not-an-oserror"],
)
def test_a_tls_socket_whose_handshake_fails_is_closed_whatever_it_raises(error):
    # What a handshake cut by the deadline raises depends on the platform:
    # on Windows an OSError, and on Linux an SSLError, where the case above
    # cannot tell a close kept for SSLError alone from one kept for any
    # error. Here the handshake raises each kind, and an error that is not
    # an OSError, and the TLS socket is closed whichever it is.
    tls = _HandshakeStandIn(error)
    context = _ContextStandIn(tls)
    with pytest.raises(type(error)):
        mcp._HandshakeWatched(context, mcp._ReadWatch()).wrap_socket(object(), server_hostname=NAME)
    assert context.handshake_on_connect is False
    assert tls.closed is True


def test_the_deadline_shuts_down_an_https_read_waiting_on_its_proxy(server, fast, monkeypatch):
    # Through a proxy, an HTTPS read first asks the proxy for a tunnel
    # (CONNECT) on its TCP socket, before any TLS socket is made. Only that
    # TCP socket, given to the read's watch, lets the deadline end a wait
    # on a proxy that never answers.
    listener = _Listener()
    monkeypatch.delenv("no_proxy")
    monkeypatch.setenv("https_proxy", f"http://127.0.0.1:{listener.port}")
    try:
        started = time.monotonic()
        with pytest.raises(TimeoutError, match=re.escape(_past_deadline(DEADLINE))):
            mcp._fetch_page_parts(f"https://{NAME}:9/")
        assert DEADLINE - 0.1 <= time.monotonic() - started < DEADLINE + LATE
        ended = listener.ended()
    finally:
        listener.close()
    assert listener.first.startswith(f"CONNECT {NAME}:9 ".encode()), listener.first[:40]
    assert ended is not None, "the proxy saw no end within 25 s"
    assert ended - started < DEADLINE + LATE, f"the proxy saw the end after {ended - started:.2f} s"
    _reads_end()


class _PlainTLS(socket.socket):
    """A stand-in for what ssl's wrap_socket returns, with nothing
    encrypted: a new socket object holding the connection, made once the
    socket it was given is detached, as SSLSocket._create does."""

    def do_handshake(self) -> None:
        pass


def _plain_wrap_socket(sock, server_hostname=None, do_handshake_on_connect=True, **_kwargs):
    timeout = sock.gettimeout()
    tls = _PlainTLS(sock.family, sock.type, sock.proto, fileno=sock.detach())
    tls.settimeout(timeout)
    if do_handshake_on_connect:
        tls.do_handshake()
    return tls


def test_the_deadline_shuts_down_an_https_read_after_its_handshake(server, fast, monkeypatch):
    # Once wrapped, only the TLS socket reaches the connection: the body,
    # sent over 4 s, is cut at the deadline only when that socket is shut
    # down.
    monkeypatch.setattr(mcp._SSL_CONTEXT, "wrap_socket", _plain_wrap_socket)
    body = PAGE[:40]
    server.routes["/"] = [_head(200, length=len(body))] + _drip(body, 0.1)
    _cut_url(f"https://{NAME}:{server.port}/")
    entry = server.ended("/")
    assert entry["closed_early"] is True
    assert entry["ended"] < DEADLINE + LATE


def test_an_offline_score_of_a_page_past_8_seconds_is_a_tool_error_naming_the_deadline(server, monkeypatch):
    # The real deadline. As when the network fails before the request
    # reaches the engine.
    monkeypatch.setattr(mcp, "_score_remote", lambda url, scope=None: None)
    server.routes["/"] = [10.0, _ok(PAGE)]
    started = time.monotonic()
    reply = mcp._handle({"jsonrpc": "2.0", "id": 1, "method": "tools/call",
                         "params": {"name": "designesy_score", "arguments": {"url": server.url("/")}}})
    took = time.monotonic() - started
    assert reply["result"] == {"content": [{"type": "text", "text": f"Tool execution failed: {_past_deadline(8)}"}], "isError": True}
    assert 7.9 <= took < 8 + LATE, took
    assert server.ended("/")["closed_early"] is True


def test_control_reads_outside_a_page_have_no_deadline(server, fast):
    # A token file, a Lottie file and designesy.org's documents are read by
    # _fetch alone: a body over 3 s, past DEADLINE, is read whole.
    body = b'{"pad": "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"}'
    server.routes["/file.json"] = [_head(200, length=len(body))] + _drip(body, 0.08)
    started = time.monotonic()
    assert mcp._fetch(server.url("/file.json")) == json.loads(body)
    assert time.monotonic() - started > DEADLINE
