"""The offline engine checks each host it connects to, on every hop.

WHY THIS EXISTS
The hosted fetch (apps/site/app/lib/url-guard.ts, safeFetch) checks the URL
it is given and every redirect it follows: the host as the URL Standard's
parser reads it, and then every address the name resolves to, and it
connects only to an address it checked. Until designesy-mcp's next release
the offline engine checked the host of the URL it was given as written,
against six names and the IP literals ipaddress classes as private,
loopback, link-local or reserved. It looked no name up and left each
redirect to urllib, unchecked.

CASES
- A host refused as written, before any lookup (_validate_url), among them
  credentials, a port that is not a number and a character no host name
  holds, which a URL parser other than urllib's can read as another host.
- A host whose name resolves to an address in a range the hosted guard
  refuses, for the page, a stylesheet, a token file and a Lottie file.
- Each blocked range, from its first address to its last.
- Each redirect hop, the limit of five redirects and the refusal of a
  scheme other than http and https, through each redirect status urllib
  follows.
- Direct HTTPS: the address check, and the TLS context the opener is given.
- The checked socket: its timeout, the arguments its one lookup asks with,
  the source address it binds, and a socket whose connection fails is
  closed.
- A request through a proxy, plain and tunnelled, and a URL or redirect
  whose host a proxy can read otherwise.
- The reads of designesy.org's own documents, which go through the same
  checks: through a proxy on a machine that cannot resolve the name, and
  with a NAT64 answer.
- Controls: public names and addresses read as before, and refusals the
  old check gave too, in the same words.

THE NETWORK HERE
Every test runs inside `net` (autouse). socket.getaddrinfo and
socket.gethostbyname answer from a table, and socket.socket.connect
connects only to the test server on 127.0.0.1. The table honours the
address family, socket type, protocol and AI_NUMERICHOST flag a lookup
asks with, as glibc does, and records the arguments of each lookup. A
connection to PUBLIC, a public address that stands in for a public site,
is made to the test server instead. Any other connection is refused before
it is made, and recorded. So nothing is sent past 127.0.0.1 and no name is
looked up outside the table, with the code before this change as with the
code after it. Under `net`, conftest.py's `no_network` refuses any lookup
or connection that gets past it. The test server starts without the
reverse lookup of its own address that http.server makes
(_NoReverseLookupServer).

WHAT THIS DOES NOT MEASURE
TLS: the test server speaks plain HTTP, so an https URL here is refused
before its handshake, goes through a proxy that refuses the tunnel, or
meets a test context that records the name it would verify and fails
before anything is sent. No real handshake or certificate is exercised.
The system resolver: the table stands in for it, and reads a numeric host
the way glibc's inet_aton does. The browser that DESIGNESY_CDP_URL names,
which loads a page itself.
"""

from __future__ import annotations

import errno
import http.server
import ipaddress
import json
import os
import socket
import socketserver
import ssl
import sys
import threading
import time
import urllib.error
import urllib.request
from pathlib import Path
from urllib.parse import urlsplit
from unittest.mock import patch

import pytest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

import designesy_mcp_server as mcp  # noqa: E402

FIXTURES = Path(__file__).resolve().parent / "fixtures"

# A public address. The test network makes a connection to it on the test
# server's port to the test server; nothing is sent to it.
PUBLIC = "93.184.215.14"
# A public IPv6 address. The test network refuses a connection to it, so a
# test can see that the engine tried one.
PUBLIC6 = "2606:2800:21f:cb07:6820:80da:af6b:8b2c"
# The link-local address among the six names of _BLOCKED_HOSTS, read from
# the server's list.
LINK_LOCAL = next(name for name in sorted(mcp._BLOCKED_HOSTS) if name.startswith("169.254."))

_PROXY_VARS = ("http_proxy", "https_proxy", "all_proxy", "no_proxy")


class _NoReverseLookupServer(http.server.ThreadingHTTPServer):
    """ThreadingHTTPServer, except that it does not look its own address
    up: HTTPServer.server_bind asks socket.getfqdn for the name of the
    address it is bound to, a reverse lookup, to fill server_name, which
    nothing here reads."""

    def server_bind(self) -> None:
        socketserver.TCPServer.server_bind(self)
        self.server_name, self.server_port = self.server_address[:2]


class _Server:
    """An HTTP server on 127.0.0.1 that answers from `routes` and records
    each request (method, path) in `seen`. A CONNECT gets 403."""

    def __init__(self) -> None:
        self.routes: dict[str, tuple[int, dict[str, str], bytes]] = {}
        self.seen: list[tuple[str, str]] = []
        server = self

        class Handler(http.server.BaseHTTPRequestHandler):
            def do_GET(self) -> None:
                server.seen.append((self.command, self.path))
                status, headers, body = server.routes.get(self.path, (404, {}, b"not here"))
                self.send_response(status)
                for name, value in headers.items():
                    self.send_header(name, value)
                self.send_header("Content-Length", str(len(body)))
                self.end_headers()
                self.wfile.write(body)

            def do_CONNECT(self) -> None:
                server.seen.append((self.command, self.path))
                self.send_response(403)
                self.send_header("Content-Length", "0")
                self.end_headers()

            def log_message(self, *args: object) -> None:
                pass

        self._httpd = _NoReverseLookupServer(("127.0.0.1", 0), Handler)
        self._httpd.daemon_threads = True
        self.port = self._httpd.server_address[1]
        threading.Thread(target=self._httpd.serve_forever, kwargs={"poll_interval": 0.02}, daemon=True).start()

    def paths(self) -> list[str]:
        return [path for _method, path in self.seen]

    def redirect(self, path: str, location: str, status: int = 302) -> None:
        # send_header writes Latin-1, so a Location holding other characters
        # is sent as its UTF-8 bytes, as a server sends it.
        self.routes[path] = (status, {"Location": location.encode("utf-8").decode("latin-1")}, b"")

    def close(self) -> None:
        self._httpd.shutdown()
        self._httpd.server_close()


def _last_part_escaped(address: str) -> str:
    """`address` with the digits of its last part written as percent-escapes."""
    head, _dot, last = address.rpartition(".")
    return head + "." + "".join(f"%{ord(digit):02x}" for digit in last)


def _inet_aton(name: str) -> str | None:
    """`name` as glibc's inet_aton reads a numeric host (1 to 4 parts, each
    decimal, 0x hex or 0-led octal), as a dotted quad, or None."""
    parts = name.split(".")
    if not 1 <= len(parts) <= 4:
        return None
    values = []
    for part in parts:
        try:
            if part[:2] in ("0x", "0X"):
                values.append(int(part[2:] or "0", 16))
            elif len(part) > 1 and part[0] == "0":
                values.append(int(part, 8))
            else:
                values.append(int(part, 10))
        except ValueError:
            return None
    last_bits = 32 - 8 * (len(values) - 1)
    if any(v > 255 for v in values[:-1]) or values[-1] >= 1 << last_bits:
        return None
    number = values[-1]
    for i, v in enumerate(values[:-1]):
        number |= v << (24 - 8 * i)
    return ".".join(str((number >> s) & 255) for s in (24, 16, 8, 0))


def _numeric(host: str) -> bool:
    """Whether glibc reads `host` as an address under AI_NUMERICHOST."""
    if ":" in host:
        try:
            ipaddress.IPv6Address(host.split("%", 1)[0])
        except ValueError:
            return False
        return True
    return _inet_aton(host) is not None


# The socket types glibc's resolver gives an address as, each with its
# protocol.
_SOCKET_KINDS = [
    (socket.SOCK_STREAM, socket.IPPROTO_TCP),
    (socket.SOCK_DGRAM, socket.IPPROTO_UDP),
    (socket.SOCK_RAW, 0),
]


class _Net:
    """The test network: a name table, and connections to the test server only."""

    def __init__(self, server: _Server) -> None:
        self.server = server
        self.names: dict[str, list[str]] = {}
        # A name whose answers change: each lookup takes the next, and the
        # last is repeated.
        self.sequence: dict[str, list[list[str]]] = {}
        self.lookups: list[str] = []
        # The arguments of each lookup: host, port, family, type, proto, flags.
        self.asked: list[tuple[object, ...]] = []
        self.connected: list[tuple[str, int]] = []
        self.refused: list[tuple[str, int]] = []

    def addresses(self, host: str) -> list[str]:
        name = host if host.isascii() else host.encode("idna").decode("ascii")
        name = name.lower().rstrip(".")
        if name in self.sequence:
            answers = self.sequence[name]
            return answers.pop(0) if len(answers) > 1 else answers[0]
        if name in self.names:
            return self.names[name]
        if ":" in name:
            return [name]
        numeric = _inet_aton(name)
        if numeric is not None:
            return [numeric]
        raise socket.gaierror(socket.EAI_NONAME, f"test network: no such name {host!r}")

    def getaddrinfo(self, host, port, family=0, type=0, proto=0, flags=0):
        if isinstance(host, bytes):
            host = host.decode("ascii")
        self.lookups.append(host)
        self.asked.append((host, port, family, type, proto, flags))
        number = int(port or 0)
        # Under AI_NUMERICHOST, a host that is not an address is not looked up.
        if flags & socket.AI_NUMERICHOST and not _numeric(host):
            raise socket.gaierror(socket.EAI_NONAME, f"test network: {host!r} is not a numeric host")
        # Asked for no one type, glibc's resolver gives each address three
        # times: as a stream socket, a datagram socket and a raw one. A type
        # or a protocol asked for keeps the entries that match it, and a
        # type and a protocol that do not go together give none.
        kinds = [(kind, protocol) for kind, protocol in _SOCKET_KINDS
                 if type in (0, kind) and proto in (0, protocol)]
        if not kinds:
            raise socket.gaierror(socket.EAI_SOCKTYPE, f"test network: socket type {type} with protocol {proto}")
        found = self.addresses(host)
        # A family asked for keeps the addresses of that family alone.
        if family == socket.AF_INET:
            addresses = [address for address in found if ":" not in address]
        elif family == socket.AF_INET6:
            addresses = [address for address in found if ":" in address]
        else:
            addresses = found
        if found and not addresses:
            raise socket.gaierror(socket.EAI_NONAME, f"test network: no address of family {family} for {host!r}")
        out = []
        for address in addresses:
            for kind, protocol in kinds:
                if ":" in address:
                    out.append((socket.AF_INET6, kind, protocol, "", (address, number, 0, 0)))
                else:
                    out.append((socket.AF_INET, kind, protocol, "", (address, number)))
        return out

    def gethostbyname(self, host):
        for address in self.addresses(host):
            if ":" not in address:
                return address
        raise socket.gaierror(socket.EAI_NONAME, f"test network: no IPv4 address for {host!r}")


@pytest.fixture(autouse=True)
def net(no_network, monkeypatch):
    server = _Server()
    network = _Net(server)
    real_connect = socket.socket.connect

    def connect(sock, address):
        host, port = address[0], address[1]
        if port == server.port and host in (PUBLIC, "127.0.0.1"):
            network.connected.append((host, port))
            return real_connect(sock, ("127.0.0.1", port))
        network.refused.append((host, port))
        raise ConnectionRefusedError(errno.ECONNREFUSED, f"test network: no route to {host} port {port}")

    monkeypatch.setattr(socket, "getaddrinfo", network.getaddrinfo)
    monkeypatch.setattr(socket, "gethostbyname", network.gethostbyname)
    monkeypatch.setattr(socket.socket, "connect", connect)
    for name in _PROXY_VARS:
        monkeypatch.delenv(name, raising=False)
        monkeypatch.delenv(name.upper(), raising=False)
    # No proxy for any host, so urllib reads no proxy from the system either.
    monkeypatch.setenv("no_proxy", "*")
    monkeypatch.delenv("DESIGNESY_INSECURE_TLS", raising=False)
    monkeypatch.delenv("DESIGNESY_CDP_URL", raising=False)
    network.names["site.example.test"] = [PUBLIC]
    network.names["inside.example.test"] = ["127.0.0.1"]
    _clear()
    try:
        yield network
    finally:
        _clear()
        server.close()


def _clear() -> None:
    mcp._cache.clear()
    mcp._FINAL_URL.clear()
    mcp._DECODED_BYTES.clear()
    mcp._TLS_UNVERIFIED.clear()


def _site(net: _Net, path: str = "/") -> str:
    return f"http://site.example.test:{net.server.port}{path}"


def _inside(net: _Net, path: str = "/secret") -> str:
    return f"http://inside.example.test:{net.server.port}{path}"


def _serve_secret(net: _Net) -> None:
    net.server.routes["/secret"] = (200, {}, b"internal")


# ── Hosts refused as written, before any lookup ─────────────────────────────

# Each URL, and the reason it is refused for.
REFUSED_AS_WRITTEN = [
    # Numeric hosts not written as four decimal parts. The resolver reads
    # each as an address: 127.0.0.1, 10.0.0.1 or 1.1.1.1.
    ("http://2130706433/", "numeric host '2130706433' not written as four decimal parts"),
    ("http://0x7f000001/", "numeric host '0x7f000001' not written as four decimal parts"),
    ("http://0x7f.1/", "numeric host '0x7f.1' not written as four decimal parts"),
    ("http://127.1/", "numeric host '127.1' not written as four decimal parts"),
    ("http://0177.0.0.1/", "numeric host '0177.0.0.1' not written as four decimal parts"),
    ("http://127.000.000.001/", "numeric host '127.000.000.001' not written as four decimal parts"),
    ("http://10.1/", "numeric host '10.1' not written as four decimal parts"),
    ("http://16843009/", "numeric host '16843009' not written as four decimal parts"),
    # A label that is 0x alone counts as numeric too.
    ("http://0x.0.0.1/", "numeric host '0x.0.0.1' not written as four decimal parts"),
    # Five numeric parts, or a part above 255: these name no address, and
    # are refused for the same reason.
    ("http://1.2.3.4.5/", "numeric host '1.2.3.4.5' not written as four decimal parts"),
    ("http://1.2.3.256/", "numeric host '1.2.3.256' not written as four decimal parts"),
    # Percent-escapes, which urllib's Request decodes before it connects.
    ("http://%31%32%37.0.0.1/", "internal host '127.0.0.1'"),
    ("http://%6c%6f%63%61%6c%68%6f%73%74/", "internal host 'localhost'"),
    (f"http://{_last_part_escaped(LINK_LOCAL)}/", f"internal host '{LINK_LOCAL}'"),
    # Characters the idna codec maps to ASCII before the lookup.
    ("http://１２７.０.０.１/", "internal host '１２７.０.０.１'"),
    ("http://127。0。0。1/", "internal host '127。0。0。1'"),
    ("http://ｌｏｃａｌｈｏｓｔ/", "internal host 'ｌｏｃａｌｈｏｓｔ'"),
    # IPv6 address hosts: the hosted guard fetches none.
    ("http://[2002:7f00:1::]/", "IPv6 address host '2002:7f00:1::'"),
    ("http://[2606:4700:4700::1111]/", "IPv6 address host '2606:4700:4700::1111'"),
    # A colon left in the host once the port is split off.
    ("http://a:b:80/", "IPv6 address host 'a:b'"),
    # One label, or one more dot.
    ("http://intranet/", "single-label host 'intranet'"),
    ("http://localhost./", "internal host 'localhost.'"),
    ("http://metadata.google.internal./", "internal host 'metadata.google.internal.'"),
    ("http://localhost../", "internal host 'localhost..'"),
    # Capitals: the lookup ignores case.
    ("http://LOCALHOST./", "internal host 'LOCALHOST.'"),
    ("http://METADATA.GOOGLE.INTERNAL/", "internal host 'METADATA.GOOGLE.INTERNAL'"),
    ("http://0X7F.1/", "numeric host '0X7F.1' not written as four decimal parts"),
    # Ranges the hosted guard refuses that the old check let through.
    ("http://100.127.255.254/", "private/reserved IP '100.127.255.254'"),
    ("http://100.64.0.1/", "private/reserved IP '100.64.0.1'"),
    ("http://224.0.0.1/", "private/reserved IP '224.0.0.1'"),
    ("http://192.52.193.1/", "private/reserved IP '192.52.193.1'"),
    # Credentials before the host. urllib's Request keeps them as part of the
    # host where the URL Standard, and a proxy, read the host after the '@'.
    ("http://user@127.0.0.1/", "credentials in URL"),
    (f"http://user@{LINK_LOCAL}/", "credentials in URL"),
    ("http://a:b@93.184.215.14/", "credentials in URL"),
    ("http://site.example.test:x@127.0.0.1/", "credentials in URL"),
    ("http://site.example.test%3Ax%40127.0.0.1/", "credentials in URL"),
    # A port http.client cannot read as a number.
    ("http://site.example.test:x/", "port 'x' is not a number"),
    ("http://site.example.test:80%2F127.0.0.1/", "port '80/127.0.0.1' is not a number"),
    # A character no host name holds, written or after the idna mapping.
    ("http://127.0.0.1\\q.example.com/", "host '127.0.0.1\\q.example.com' is not a valid name"),
    ("http://１２７.０.０.１＼q.example.com/", "host '１２７.０.０.１＼q.example.com' is not a valid name"),
    ("http://a%2Fb.example.com/", "host 'a/b.example.com' is not a valid name"),
    ("http://a%25b.example.com/", "host 'a%b.example.com' is not a valid name"),
    ("http://a%00b.example.com/", "host 'a\x00b.example.com' is not a valid name"),
    ("http://a%20b.example.com/", "host 'a b.example.com' is not a valid name"),
    ("http://a%09b.example.com/", "host 'a\tb.example.com' is not a valid name"),
    ("http://a%23b.example.com/", "host 'a#b.example.com' is not a valid name"),
    ("http://a%3Cb.example.com/", "host 'a<b.example.com' is not a valid name"),
    ("http://a%3Eb.example.com/", "host 'a>b.example.com' is not a valid name"),
    ("http://a%3Fb.example.com/", "host 'a?b.example.com' is not a valid name"),
    ("http://a%5Bb.example.com/", "host 'a[b.example.com' is not a valid name"),
    ("http://a%5Db.example.com/", "host 'a]b.example.com' is not a valid name"),
    ("http://a%5Eb.example.com/", "host 'a^b.example.com' is not a valid name"),
    ("http://a%7Cb.example.com/", "host 'a|b.example.com' is not a valid name"),
    ("http://a%7Fb.example.com/", "host 'a\x7fb.example.com' is not a valid name"),
    # Brackets written as percent-escapes. Around a whole host, urllib and
    # http.client drop them, and the name inside is checked. One bracket
    # alone stays in the host.
    ("http://%5Blocalhost%5D/", "internal host 'localhost'"),
    ("http://%5Bx.example.com/", "host '[x.example.com' is not a valid name"),
    ("http://x.example.com%5D/", "host 'x.example.com]' is not a valid name"),
    # A label the idna codec cannot map: longer than 63 characters.
    ("http://" + "ü" * 64 + ".example/", f"host '{'ü' * 64}.example' is not a valid name"),
]
_REFUSED_IDS = [url for url, _reason in REFUSED_AS_WRITTEN]


@pytest.mark.parametrize("url, reason", REFUSED_AS_WRITTEN, ids=_REFUSED_IDS)
def test_a_host_refused_as_written(url, reason):
    with pytest.raises(ValueError) as caught:
        mcp._validate_url(url)
    assert str(caught.value) == f"Blocked: {reason}"


@pytest.mark.parametrize("url, reason", REFUSED_AS_WRITTEN, ids=_REFUSED_IDS)
def test_fetch_refuses_it_before_a_lookup(url, reason, net):
    with pytest.raises(ValueError) as caught:
        mcp._fetch(url, as_json=False)
    assert str(caught.value) == f"Blocked: {reason}"
    assert net.lookups == []
    assert net.connected == net.refused == []


def test_no_control_character_and_no_space_passes_in_a_host():
    # Each of the 33 code points below 0x21, written as a percent-escape,
    # which urllib's Request decodes.
    passed = []
    for code in range(0x21):
        try:
            mcp._validate_url(f"http://a%{code:02X}b.example.com/")
        except ValueError as refusal:
            if str(refusal) == f"Blocked: host 'a{chr(code)}b.example.com' is not a valid name":
                continue
        passed.append(f"%{code:02X}")
    assert passed == []


ALLOWED_AS_WRITTEN = [
    "https://www.designesy.org/",
    "http://1.1.1.1/",
    "http://8.8.8.255/",
    "http://8.8.8.255./",
    "http://151.101.250.1/",
    "http://203.0.114.199/",
    "https://example.com:8443/a?b#c",
    "https://example.com:/",
    "https://example.com:%34%34%33/",
    "https://under_score.example.com/",
    "https://EXAMPLE.com/",
    "https://example.com./",
    # A name with a numeric label is a name: its last label is not numeric.
    "https://007.example.com/",
    "https://0x10.example.com/",
    # Labels that start with a digit and hold a letter are not numeric.
    "http://1a.2b/",
    "https://bücher.example/",
    "https://xn--bcher-kva.example/",
]


@pytest.mark.parametrize("url", ALLOWED_AS_WRITTEN)
def test_control_a_public_host_passes_as_written(url):
    mcp._validate_url(url)


# Refusals the old check gave too. Each reads the same now: a URL with no
# host, and the bracketed loopback address with a port after it.
REFUSED_AS_BEFORE = [
    ("http:///path", "no hostname in URL"),
    ("http://[::1]:80/", "internal host '::1'"),
]


@pytest.mark.parametrize("url, reason", REFUSED_AS_BEFORE, ids=[url for url, _reason in REFUSED_AS_BEFORE])
def test_control_a_refusal_the_old_check_gave_reads_the_same(url, reason, net):
    for refuse in (mcp._validate_url, lambda u: mcp._fetch(u, as_json=False)):
        with pytest.raises(ValueError) as caught:
            refuse(url)
        assert str(caught.value) == f"Blocked: {reason}"
    assert net.lookups == []
    assert net.connected == net.refused == []


def test_a_non_http_scheme_is_still_refused():
    for url in ("file:///etc/passwd", "ftp://example.com/", "gopher://example.com/"):
        with pytest.raises(ValueError, match="non-http"):
            mcp._validate_url(url)


# ── Addresses a name resolves to ────────────────────────────────────────────

INTERNAL_ADDRESSES = [
    "127.0.0.1", "127.8.9.10", "0.0.0.0", "10.0.0.1", "100.64.0.1",
    "100.127.255.254", LINK_LOCAL, "172.16.0.1", "192.168.1.1",
    "192.0.0.8", "192.0.2.1", "192.31.196.1", "192.52.193.1", "192.88.99.1",
    "192.175.48.1", "198.18.0.1", "198.51.100.1", "203.0.113.1", "224.0.0.1",
    "239.255.255.250", "240.0.0.1", "255.255.255.255",
    "::", "::1", "::ffff:127.0.0.1", "::ffff:10.0.0.1", "::ffff:8.8.8.8",
    "::127.0.0.1", "::ffff:0:a00:1", "64:ff9b::a00:1", "64:ff9b:1::1",
    "100::1", "2001::1", "2001:2::1", "2001:3::1", "2001:4:112::1",
    "2001:5::1", "2001:db8::1", "2001:10::1", "2001:20::1", "2001:30::1",
    "2001:100::1", "2001:1ff:ffff::1", "2002:a00:1::1", "2620:4f:8000::1",
    "3fff::1", "5f00::1", "fc00::1", "fd00::1", "fe80::1", "fec0::1",
    "ff02::1",
]


@pytest.mark.parametrize("address", INTERNAL_ADDRESSES)
def test_a_name_that_resolves_to_an_internal_address_is_refused(address, net):
    _serve_secret(net)
    net.names["inside.example.test"] = [address]
    with pytest.raises(ValueError, match=f"^Blocked: host 'inside.example.test' resolves to private/reserved IP '{address}'"):
        mcp._fetch(_inside(net), as_json=False)
    assert net.connected == net.refused == []
    assert net.server.seen == []


# Every range ipaddr.js 2.5.0 names in its IPv4 and IPv6 SpecialRanges, which
# the hosted guard refuses, and the IPv4-compatible form ::/96, which
# ipaddr.js does not name.
BLOCKED_RANGES = [
    "0.0.0.0/8", "10.0.0.0/8", "100.64.0.0/10", "127.0.0.0/8", "169.254.0.0/16",
    "172.16.0.0/12", "192.0.0.0/24", "192.0.2.0/24", "192.31.196.0/24",
    "192.52.193.0/24", "192.88.99.0/24", "192.168.0.0/16", "192.175.48.0/24",
    "198.18.0.0/15", "198.51.100.0/24", "203.0.113.0/24", "224.0.0.0/4",
    "240.0.0.0/4", "255.255.255.255/32",
    "::/128", "::1/128", "::/96", "::ffff:0:0/96", "::ffff:0:0:0/96",
    "64:ff9b::/96", "64:ff9b:1::/48", "100::/64", "2001::/23", "2001::/32",
    "2001:2::/48", "2001:3::/32", "2001:4:112::/48", "2001:10::/28",
    "2001:20::/28", "2001:30::/28", "2001:db8::/32", "2002::/16",
    "2620:4f:8000::/48", "3fff::/20", "5f00::/16", "fc00::/7", "fe80::/10",
    "fec0::/10", "ff00::/8",
]


@pytest.mark.parametrize("blocked", BLOCKED_RANGES)
def test_a_blocked_range_is_refused_from_its_first_address_to_its_last(blocked, net):
    _serve_secret(net)
    network = ipaddress.ip_network(blocked)
    for address in (str(network[0]), str(network[-1])):
        net.names["inside.example.test"] = [address]
        with pytest.raises(ValueError) as caught:
            mcp._fetch(_inside(net), as_json=False)
        assert str(caught.value) == f"Blocked: host 'inside.example.test' resolves to private/reserved IP '{address}'"
    assert net.connected == net.refused == []
    assert net.server.seen == []


def test_the_server_lists_each_blocked_range():
    listed = set(mcp._BLOCKED_NETWORKS)
    assert [blocked for blocked in BLOCKED_RANGES if ipaddress.ip_network(blocked) not in listed] == []


def test_an_address_that_does_not_parse_is_refused(net):
    net.names["odd.example.test"] = ["999.1.1.1"]
    with pytest.raises(ValueError, match="resolves to private/reserved IP '999.1.1.1'"):
        mcp._fetch(f"http://odd.example.test:{net.server.port}/", as_json=False)
    assert net.connected == net.refused == []


def test_one_internal_address_among_public_ones_refuses_the_host(net):
    _serve_secret(net)
    net.names["inside.example.test"] = [PUBLIC, "127.0.0.1"]
    with pytest.raises(ValueError, match="resolves to private/reserved IP '127.0.0.1'"):
        mcp._fetch(_inside(net), as_json=False)
    assert net.connected == net.refused == []


def test_a_leading_dot_is_kept_and_the_host_is_refused_for_its_address(net):
    # Only trailing dots are dropped. A host with a leading dot is not one of
    # the six names, so it is looked up as written and its addresses are
    # checked, as any name's are.
    _serve_secret(net)
    net.names[".localhost"] = ["127.0.0.1"]
    with pytest.raises(ValueError) as caught:
        mcp._fetch(f"http://.localhost:{net.server.port}/secret", as_json=False)
    assert str(caught.value) == "Blocked: host '.localhost' resolves to private/reserved IP '127.0.0.1'"
    assert net.lookups == [".localhost"]
    assert net.connected == net.refused == []


def test_control_a_name_that_resolves_to_a_public_address_is_read(net):
    net.server.routes["/page"] = (200, {}, b"public page")
    assert mcp._fetch(_site(net, "/page"), as_json=False) == "public page"
    assert net.connected == [(PUBLIC, net.server.port)]


def test_control_a_public_ipv6_address_is_connected_to(net):
    try:
        socket.socket(socket.AF_INET6, socket.SOCK_STREAM).close()
    except OSError:
        pytest.skip("this machine cannot open an IPv6 socket")
    net.names["six.example.test"] = [PUBLIC6]
    with pytest.raises(urllib.error.URLError, match="no route"):
        mcp._fetch(f"http://six.example.test:{net.server.port}/", as_json=False)
    assert net.refused == [(PUBLIC6, net.server.port)]


def test_control_a_name_that_does_not_resolve_fails_as_before(net):
    with pytest.raises(urllib.error.URLError, match="no such name"):
        mcp._fetch("http://nowhere.example.test/", as_json=False)
    assert net.connected == net.refused == []


def test_the_name_is_looked_up_once_and_the_checked_address_is_the_one_connected_to(net):
    # A second lookup would get 127.0.0.1.
    net.server.routes["/page"] = (200, {}, b"public page")
    net.sequence["rebind.example.test"] = [[PUBLIC], ["127.0.0.1"]]
    url = f"http://rebind.example.test:{net.server.port}/page"
    assert mcp._fetch(url, as_json=False) == "public page"
    assert net.lookups == ["rebind.example.test"]
    assert net.connected == [(PUBLIC, net.server.port)]


def test_control_the_lookup_asks_as_socket_create_connection_asks(net):
    # Any address family, a stream socket, any protocol and no flags. The
    # table honours each of them, as a real resolver does: a lookup that
    # narrowed one would get other addresses, or none.
    net.server.routes["/page"] = (200, {}, b"public page")
    assert mcp._fetch(_site(net, "/page"), as_json=False) == "public page"
    assert net.asked == [("site.example.test", net.server.port, 0, socket.SOCK_STREAM, 0, 0)]


def test_a_nat64_address_refuses_the_host_whatever_ipv4_it_holds(net):
    # A resolver on an IPv6-only network can answer with a 64:ff9b::/96
    # address made from the site's IPv4 address. The hosted guard refuses
    # that range whole, and so does this check, so such a site is not read.
    net.server.routes["/page"] = (200, {}, b"public page")
    net.names["v4only.example.test"] = ["64:ff9b::5db8:d70e", PUBLIC]
    with pytest.raises(ValueError, match="resolves to private/reserved IP '64:ff9b::5db8:d70e'"):
        mcp._fetch(f"http://v4only.example.test:{net.server.port}/page", as_json=False)
    assert net.connected == net.refused == []


def test_the_checked_socket_gets_the_request_timeout(net):
    sock = mcp._checked_connection(("site.example.test", net.server.port), 0.25)
    try:
        assert sock.gettimeout() == 0.25
        assert sock.getpeername()[1] == net.server.port
    finally:
        sock.close()


def test_the_checked_socket_binds_the_source_address_it_is_given(net, monkeypatch):
    # http.client hands its source_address on, as it does to
    # socket.create_connection. urllib sets none, and then nothing is bound
    # and, with no timeout given either, the socket keeps the default one.
    bound = []
    bind = socket.socket.bind

    def recording_bind(sock, address):
        bound.append(address)
        return bind(sock, address)

    monkeypatch.setattr(socket.socket, "bind", recording_bind)
    sock = mcp._checked_connection(("site.example.test", net.server.port))
    try:
        assert bound == []
        assert sock.gettimeout() == socket.getdefaulttimeout()
    finally:
        sock.close()
    sock = mcp._checked_connection(("site.example.test", net.server.port), 5, ("127.0.0.1", 0))
    try:
        assert bound == [("127.0.0.1", 0)]
        assert sock.getpeername()[1] == net.server.port
    finally:
        sock.close()


def test_a_fetch_hands_its_read_timeout_down_to_the_socket(net, monkeypatch):
    # _fetch reads with a 15 second timeout. The opener must pass it on to
    # the socket it connects, or a server that never answers stalls the read.
    net.server.routes["/page"] = (200, {}, b"public page")
    timeouts = []
    connect = socket.socket.connect

    def recording_connect(sock, address):
        timeouts.append(sock.gettimeout())
        return connect(sock, address)

    monkeypatch.setattr(socket.socket, "connect", recording_connect)
    assert mcp._fetch(_site(net, "/page"), as_json=False) == "public page"
    assert timeouts == [15]


def test_a_socket_whose_connection_fails_is_closed_before_the_next_address(net, monkeypatch):
    # The first address refuses the connection; the second is the test server.
    # Each address is tried once, as a stream socket: a lookup that asked for
    # no one type would bring a datagram entry and a raw one for each too.
    other = "93.184.215.15"
    net.names["two.example.test"] = [other, PUBLIC]
    opened = []
    connect = socket.socket.connect

    def recording_connect(sock, address):
        opened.append((address[0], sock))
        return connect(sock, address)

    monkeypatch.setattr(socket.socket, "connect", recording_connect)
    sock = mcp._checked_connection(("two.example.test", net.server.port), 5)
    try:
        assert [address for address, _sock in opened] == [other, PUBLIC]
        assert opened[0][1].fileno() == -1
        assert opened[1][1] is sock and sock.fileno() != -1
    finally:
        sock.close()


# ── Redirect hops ───────────────────────────────────────────────────────────

INTERNAL_TARGETS = [
    "http://inside.example.test:{port}/secret",
    "https://inside.example.test:{port}/secret",
    "http://site.example.test:x@127.0.0.1:{port}/secret",
    "http://127.0.0.1:{port}/secret",
    "http://2130706433:{port}/secret",
    "http://0x7f.1:{port}/secret",
    "http://%31%32%37.0.0.1:{port}/secret",
    "http://１２７.０.０.１:{port}/secret",
    "ftp://127.0.0.1:1/secret",
]


@pytest.mark.parametrize("target", INTERNAL_TARGETS)
def test_a_redirect_to_an_internal_host_is_refused_before_it_is_followed(target, net):
    _serve_secret(net)
    net.server.redirect("/hop", target.format(port=net.server.port))
    with pytest.raises(ValueError, match="^Blocked: "):
        mcp._fetch(_site(net, "/hop"), as_json=False)
    assert net.server.paths() == ["/hop"]
    assert net.refused == []


# The redirect statuses urllib follows: 301, 302, 303 and 307, and 308 from
# Python 3.11.
REDIRECT_STATUSES = [301, 302, 303, 307, 308]


def _follows(status: int) -> bool:
    return status != 308 or sys.version_info >= (3, 11)


def _not_followed(error: BaseException, status: int) -> None:
    """A redirect urllib does not follow, a 308 before Python 3.11, is an
    HTTPError of that status."""
    assert isinstance(error, urllib.error.HTTPError) and error.code == status
    error.close()


@pytest.mark.parametrize("status", REDIRECT_STATUSES)
def test_a_redirect_to_ftp_on_a_public_host_is_refused_for_its_scheme(status, net):
    # This redirect's host passes the host check, so the scheme check alone
    # refuses it. urllib follows a redirect to ftp and connects.
    net.server.redirect("/hop", "ftp://site.example.test:1/secret", status)
    with pytest.raises((ValueError, urllib.error.HTTPError)) as caught:
        mcp._fetch(_site(net, "/hop"), as_json=False)
    if _follows(status):
        assert str(caught.value) == "Blocked: non-http(s) scheme 'ftp'"
    else:
        _not_followed(caught.value, status)
    assert net.server.paths() == ["/hop"]
    assert net.lookups == ["site.example.test"]
    assert net.connected == [(PUBLIC, net.server.port)]
    assert net.refused == []


@pytest.mark.parametrize("status", [301, 302, 303, 307])
def test_each_redirect_status_urllib_follows_is_checked(status, net):
    _serve_secret(net)
    net.server.redirect("/hop", _inside(net), status)
    with pytest.raises(ValueError, match="resolves to private/reserved IP '127.0.0.1'"):
        mcp._fetch(_site(net, "/hop"), as_json=False)
    assert net.server.paths() == ["/hop"]


def test_a_308_to_an_internal_host_is_not_followed(net):
    # urllib follows a 308 from Python 3.11; on 3.10 it raises HTTPError.
    _serve_secret(net)
    net.server.redirect("/hop", _inside(net), 308)
    with pytest.raises((ValueError, urllib.error.HTTPError)) as caught:
        mcp._fetch(_site(net, "/hop"), as_json=False)
    if isinstance(caught.value, urllib.error.HTTPError):
        caught.value.close()
        assert sys.version_info < (3, 11) and caught.value.code == 308
    assert net.server.paths() == ["/hop"]


def test_a_refused_redirect_closes_the_response_it_came_in(net):
    class Response:
        closed = False

        def close(self):
            self.closed = True

    response = Response()
    request = urllib.request.Request(_site(net, "/hop"))
    with pytest.raises(ValueError, match="internal host '127.0.0.1'"):
        mcp._CheckedRedirects().redirect_request(request, response, 302, "Found", {}, f"http://127.0.0.1:{net.server.port}/")
    assert response.closed


def test_a_hop_that_resolves_to_an_internal_address_is_refused(net):
    _serve_secret(net)
    net.names["moved.example.test"] = ["10.1.2.3"]
    net.server.redirect("/hop", f"http://moved.example.test:{net.server.port}/secret")
    with pytest.raises(ValueError, match="host 'moved.example.test' resolves to private/reserved IP '10.1.2.3'"):
        mcp._fetch(_site(net, "/hop"), as_json=False)
    assert net.refused == []


def _chain(net: _Net, length: int, status: int = 302) -> str:
    for n in range(length, 0, -1):
        net.server.redirect(f"/c{n}", f"/c{n - 1}", status)
    net.server.routes["/c0"] = (200, {}, b"end")
    return _site(net, f"/c{length}")


@pytest.mark.parametrize("status", REDIRECT_STATUSES)
def test_control_five_redirects_are_followed(status, net):
    url = _chain(net, 5, status)
    if _follows(status):
        assert mcp._fetch(url, as_json=False) == "end"
        assert mcp._FINAL_URL[url] == _site(net, "/c0")
    else:
        with pytest.raises(urllib.error.HTTPError) as caught:
            mcp._fetch(url, as_json=False)
        _not_followed(caught.value, status)


@pytest.mark.parametrize("status", REDIRECT_STATUSES)
def test_a_sixth_redirect_is_not_followed(status, net):
    url = _chain(net, 6, status)
    with pytest.raises((ValueError, urllib.error.HTTPError)) as caught:
        mcp._fetch(url, as_json=False)
    if _follows(status):
        assert str(caught.value) == "Blocked: more than 5 redirects"
        assert net.server.paths() == ["/c6", "/c5", "/c4", "/c3", "/c2", "/c1"]
    else:
        _not_followed(caught.value, status)
        assert net.server.paths() == ["/c6"]


def test_control_a_redirect_on_the_same_public_host_is_followed(net):
    net.server.redirect("/old", "/new")
    net.server.routes["/new"] = (200, {}, b"moved here")
    assert mcp._fetch(_site(net, "/old"), as_json=False) == "moved here"
    assert mcp._FINAL_URL[_site(net, "/old")] == _site(net, "/new")


def test_the_retry_without_verification_checks_its_hops_too(net, monkeypatch):
    # DESIGNESY_INSECURE_TLS=1: a caller's URL whose certificate fails is
    # opened again unverified, through the same checks.
    monkeypatch.setenv("DESIGNESY_INSECURE_TLS", "1")
    _serve_secret(net)
    net.server.redirect("/hop", _inside(net))
    real = getattr(mcp, "_urlopen", None)
    calls = []

    def urlopen(req, timeout, context=None):
        calls.append(context)
        if len(calls) == 1:
            err = ssl.SSLCertVerificationError(1, "[SSL: CERTIFICATE_VERIFY_FAILED] certificate verify failed")
            raise urllib.error.URLError(err)
        return real(req, timeout, context)

    with patch.object(mcp, "_urlopen", urlopen, create=True):
        with pytest.raises(ValueError, match="resolves to private/reserved IP"):
            mcp._fetch(_site(net, "/hop"), as_json=False)
    assert len(calls) == 2
    assert net.server.paths() == ["/hop"]


def test_the_opener_checks_a_host_by_itself(net):
    # _urlopen refuses on its own, whatever its caller checked first.
    net.names["intranet"] = [PUBLIC]
    with pytest.raises(ValueError, match="single-label host 'intranet'"):
        mcp._urlopen(urllib.request.Request(f"http://intranet:{net.server.port}/"), timeout=5)
    with pytest.raises(ValueError, match="resolves to private/reserved IP '127.0.0.1'"):
        mcp._urlopen(urllib.request.Request(_inside(net)), timeout=5)
    assert net.connected == net.refused == []


# ── HTTPS ───────────────────────────────────────────────────────────────────


def test_a_direct_https_read_of_a_name_that_resolves_internal_is_refused(net):
    _serve_secret(net)
    with pytest.raises(ValueError, match="resolves to private/reserved IP '127.0.0.1'"):
        mcp._fetch(f"https://inside.example.test:{net.server.port}/secret", as_json=False)
    assert net.connected == net.refused == []


class _RecordingContext(ssl.SSLContext):
    """A TLS context that records the name each handshake would check the
    certificate against, then fails as a failed verification does. Nothing
    is sent: the handshake never starts."""

    names: list[str | None] = []

    def wrap_socket(self, sock, *args, server_hostname=None, **kwargs):
        type(self).names.append(server_hostname)
        raise ssl.SSLCertVerificationError(1, "[SSL: CERTIFICATE_VERIFY_FAILED] test context")


def test_the_handshake_uses_the_context_the_opener_is_given(net):
    _RecordingContext.names = []
    context = _RecordingContext(ssl.PROTOCOL_TLS_CLIENT)
    with pytest.raises(urllib.error.URLError) as caught:
        mcp._urlopen(urllib.request.Request(f"https://site.example.test:{net.server.port}/"), timeout=5, context=context)
    assert isinstance(caught.value.reason, ssl.SSLCertVerificationError)
    assert _RecordingContext.names == ["site.example.test"]
    assert net.connected == [(PUBLIC, net.server.port)]


def test_fetch_verifies_the_certificate_with_its_context(net, monkeypatch):
    _RecordingContext.names = []
    monkeypatch.setattr(mcp, "_SSL_CONTEXT", _RecordingContext(ssl.PROTOCOL_TLS_CLIENT))
    with pytest.raises(urllib.error.URLError, match="test context"):
        mcp._fetch(f"https://site.example.test:{net.server.port}/", as_json=False)
    assert _RecordingContext.names == ["site.example.test"]


# ── Through a proxy ─────────────────────────────────────────────────────────


@pytest.fixture
def proxy(net, monkeypatch):
    monkeypatch.delenv("no_proxy", raising=False)
    monkeypatch.delenv("NO_PROXY", raising=False)
    address = f"http://127.0.0.1:{net.server.port}"
    monkeypatch.setenv("http_proxy", address)
    monkeypatch.setenv("https_proxy", address)
    return net


def test_through_a_proxy_a_host_that_resolves_internal_is_refused_before_the_proxy_is_asked(proxy):
    proxy.server.routes["http://inside.example.test/secret"] = (200, {}, b"internal")
    with pytest.raises(ValueError, match="resolves to private/reserved IP '127.0.0.1'"):
        mcp._fetch("http://inside.example.test/secret", as_json=False)
    assert proxy.server.seen == []


def test_through_a_proxy_a_tunnel_to_a_host_that_resolves_internal_is_not_asked_for(proxy):
    with pytest.raises(ValueError, match="resolves to private/reserved IP '127.0.0.1'"):
        mcp._fetch("https://inside.example.test/secret", as_json=False)
    assert proxy.server.seen == []


def test_through_a_proxy_a_host_this_machine_cannot_resolve_is_not_asked_for(proxy):
    proxy.server.routes["http://nowhere.example.test/x"] = (200, {}, b"from the proxy")
    with pytest.raises(urllib.error.URLError, match="no such name"):
        mcp._fetch("http://nowhere.example.test/x", as_json=False)
    assert proxy.server.seen == []


def test_through_a_proxy_a_lookup_that_gives_no_address_is_not_asked_for(proxy):
    # socket.getaddrinfo raises when a name has no address. Should a lookup
    # ever answer with an empty list, no address was checked, and the proxy
    # is not asked.
    proxy.names["empty.example.test"] = []
    proxy.server.routes["http://empty.example.test/x"] = (200, {}, b"from the proxy")
    with pytest.raises(urllib.error.URLError, match="empty list"):
        mcp._fetch("http://empty.example.test/x", as_json=False)
    assert proxy.server.seen == []


def test_control_through_a_proxy_a_public_host_is_asked_for_through_the_proxy(proxy):
    proxy.names["public.example.test"] = [PUBLIC]
    proxy.server.routes["http://public.example.test/x"] = (200, {}, b"from the proxy")
    assert mcp._fetch("http://public.example.test/x", as_json=False) == "from the proxy"
    assert proxy.server.seen == [("GET", "http://public.example.test/x")]
    assert proxy.connected == [("127.0.0.1", proxy.server.port)]


def test_control_through_a_proxy_a_public_address_is_asked_for_where_no_name_resolves(proxy):
    # A host that is an address needs no lookup answer, so on a machine
    # that resolves no name the proxy is asked for it all the same.
    proxy.names.clear()
    url = f"http://{PUBLIC}/x"
    proxy.server.routes[url] = (200, {}, b"from the proxy")
    assert mcp._fetch(url, as_json=False) == "from the proxy"
    assert proxy.server.seen == [("GET", url)]
    assert proxy.connected == [("127.0.0.1", proxy.server.port)]


def test_control_through_a_proxy_a_public_host_is_tunnelled_to(proxy):
    proxy.names["public.example.test"] = [PUBLIC]
    with pytest.raises(urllib.error.URLError, match="403"):
        mcp._fetch("https://public.example.test/", as_json=False)
    assert proxy.server.seen == [("CONNECT", "public.example.test:443")]


def test_through_a_proxy_the_opener_checks_a_host_by_itself(proxy):
    # _urlopen refuses on its own through a proxy too, whatever its caller
    # checked first: a one-label name is refused even when it resolves to a
    # public address.
    proxy.names["intranet"] = [PUBLIC]
    with pytest.raises(ValueError, match="single-label host 'intranet'"):
        mcp._urlopen(urllib.request.Request("http://intranet/"), timeout=5)
    with pytest.raises(ValueError, match="resolves to private/reserved IP '127.0.0.1'"):
        mcp._urlopen(urllib.request.Request("http://inside.example.test/secret"), timeout=5)
    assert proxy.server.seen == []


def _dialled(net: _Net) -> list[str | None]:
    """The host a proxy that reads each request's target as RFC 3986 does
    (urlsplit) would have connected to, for each request it was sent."""
    return [urlsplit(target).hostname for _method, target in net.server.seen]


# Each URL has a public name before an '@', written as is or as a
# percent-escape, and a proxy can read its host as 127.0.0.1: urlsplit
# does for the first, second and fourth, and a proxy that decodes
# percent-escapes first does for the third.
PROXY_INTERNAL_TARGETS = [
    "http://public.example.test:x@127.0.0.1/secret",
    "http://public.example.test@127.0.0.1/secret",
    "http://public.example.test%3Ax%40127.0.0.1/secret",
    "http://public.example.test:80%2F@127.0.0.1/secret",
]


@pytest.mark.parametrize("url", PROXY_INTERNAL_TARGETS)
def test_through_a_proxy_a_url_whose_host_another_parser_reads_otherwise_is_not_asked_for(url, proxy):
    proxy.names["public.example.test"] = [PUBLIC]
    proxy.server.routes[url] = (200, {}, b"internal")
    with pytest.raises(ValueError, match="^Blocked: "):
        mcp._fetch(url, as_json=False)
    assert proxy.server.seen == []


@pytest.mark.parametrize("target", PROXY_INTERNAL_TARGETS)
def test_through_a_proxy_a_redirect_to_such_a_url_is_not_followed(target, proxy):
    proxy.names["public.example.test"] = [PUBLIC]
    proxy.server.redirect("http://public.example.test/hop", target)
    proxy.server.routes[target] = (200, {}, b"internal")
    with pytest.raises(ValueError, match="^Blocked: "):
        mcp._fetch("http://public.example.test/hop", as_json=False)
    assert proxy.server.seen == [("GET", "http://public.example.test/hop")]
    assert _dialled(proxy) == ["public.example.test"]


# ── designesy.org's own documents ───────────────────────────────────────────

# The server reads its own documents from www.designesy.org through _fetch,
# so the checks apply to those reads as to a caller's URL. Each tool here
# reads one before anything else; the three scorers read their contract.
OWN_DOCUMENT_TOOLS = [
    ("designesy_catalog", {}),
    ("designesy_contract", {}),
    ("designesy_design_review", {}),
    ("designesy_skill_md", {}),
    ("designesy_agent_json", {}),
    ("designesy_llms_txt", {}),
    ("designesy_llms_full_txt", {}),
    ("designesy_tokens_score", {"dtcg_file": '{"ink": {"$type": "color", "$value": "#000"}}'}),
    ("designesy_a11y_score", {"url": "https://example.com/"}),
    ("designesy_motion_score", {"lottie_file": '{"v": "5.7.0", "layers": []}'}),
]
OWN_DOCUMENT_RESOURCES = [resource["uri"] for resource in mcp.RESOURCES]


@pytest.mark.parametrize("name, arguments", OWN_DOCUMENT_TOOLS, ids=[name for name, _arguments in OWN_DOCUMENT_TOOLS])
def test_through_a_proxy_a_tool_that_reads_the_sites_documents_needs_the_name_to_resolve_here(name, arguments, proxy):
    # www.designesy.org is not in the table, as on a network where only the
    # proxy resolves names. The read fails before the proxy is asked.
    request = {"jsonrpc": "2.0", "id": 4, "method": "tools/call", "params": {"name": name, "arguments": arguments}}
    reply = mcp._handle(request)
    text = reply["result"]["content"][0]["text"]
    assert reply["result"]["isError"] is True
    assert text.startswith("Failed to fetch URL: ") and "no such name 'www.designesy.org'" in text
    assert proxy.lookups == ["www.designesy.org"]
    assert proxy.server.seen == []


@pytest.mark.parametrize("uri", OWN_DOCUMENT_RESOURCES)
def test_through_a_proxy_a_resource_read_needs_the_name_to_resolve_here(uri, proxy):
    reply = mcp._handle({"jsonrpc": "2.0", "id": 5, "method": "resources/read", "params": {"uri": uri}})
    message = reply["error"]["message"]
    assert reply["error"]["code"] == -32000
    assert message.startswith("Failed to read resource: ") and "no such name 'www.designesy.org'" in message
    assert proxy.lookups == ["www.designesy.org"]
    assert proxy.server.seen == []


def test_a_nat64_answer_for_the_sites_own_name_refuses_its_documents(net):
    net.names["www.designesy.org"] = ["64:ff9b::5db8:d70e", PUBLIC]
    reply = mcp._handle({"jsonrpc": "2.0", "id": 6, "method": "tools/call", "params": {
        "name": "designesy_catalog", "arguments": {}}})
    assert reply["result"] == {"content": [{"type": "text", "text": (
        "Tool execution failed: Blocked: host 'www.designesy.org' resolves to "
        "private/reserved IP '64:ff9b::5db8:d70e'")}], "isError": True}
    assert net.connected == net.refused == []


# ── The page, its stylesheets, a token file and a Lottie file ───────────────


def test_a_stylesheet_on_an_internal_host_is_left_out_and_the_page_still_reads(net):
    port = net.server.port
    links = "".join(f'<link rel="stylesheet" href="{href}">' for href in (
        f"http://inside.example.test:{port}/a.css",
        f"http://0x7f.1:{port}/b.css",
        "/hop.css",
        "/ok.css",
    ))
    net.server.routes["/page"] = (200, {}, f"<html><head>{links}</head><body><main>x</main></body></html>".encode())
    for name in ("a", "b", "c"):
        net.server.routes[f"/{name}.css"] = (200, {}, f":root{{--{name}:#000}}".encode())
    net.server.redirect("/hop.css", f"http://127.0.0.1:{port}/c.css")
    net.server.routes["/ok.css"] = (200, {}, b":root{--ok:#fff}")
    _html, css, read = mcp._fetch_page_parts(_site(net, "/page"))
    assert css == ":root{--ok:#fff}"
    assert read == [_site(net, "/page"), _site(net, "/ok.css")]
    assert net.server.paths() == ["/page", "/hop.css", "/ok.css"]


def test_a_page_that_redirects_to_an_internal_host_is_not_scored(net):
    net.server.routes["/secret"] = (200, {}, b"<html><body><main><h1>internal</h1></main></body></html>")
    net.server.redirect("/hop", _inside(net))
    with pytest.raises(ValueError, match="resolves to private/reserved IP '127.0.0.1'"):
        mcp._score_local_impl(_site(net, "/hop"))
    assert net.server.paths() == ["/hop"]


def _cached(url: str, path: Path) -> None:
    mcp._cache[url] = (time.time(), json.loads(path.read_text(encoding="utf-8")))


def test_a_token_file_behind_a_redirect_to_an_internal_host_is_not_read(net):
    _cached("https://www.designesy.org/contracts/tokens.json", FIXTURES / "tokens" / "contract.json")
    tokens = {"ink": {"$type": "color", "$value": {"colorSpace": "srgb", "components": [0, 0, 0]}}}
    net.server.routes["/tokens.json"] = (200, {}, json.dumps(tokens).encode())
    net.server.redirect("/hop", _inside(net, "/tokens.json"))
    with pytest.raises(ValueError, match="resolves to private/reserved IP '127.0.0.1'"):
        mcp._tokens_score_impl(url=_site(net, "/hop"))
    assert net.server.paths() == ["/hop"]


def test_a_lottie_file_on_a_name_that_resolves_internal_is_not_read(net):
    _cached("https://www.designesy.org/contracts/motion.json", FIXTURES / "motion" / "contract.json")
    net.server.routes["/intro.json"] = (200, {}, (FIXTURES / "motion" / "conformant.json").read_bytes())
    with pytest.raises(ValueError, match="resolves to private/reserved IP '127.0.0.1'"):
        mcp._motion_score_impl(url=_inside(net, "/intro.json"))
    assert net.server.seen == []


def test_the_tool_result_names_the_host_and_the_address(net):
    _cached("https://www.designesy.org/contracts/tokens.json", FIXTURES / "tokens" / "contract.json")
    net.server.routes["/tokens.json"] = (200, {}, b'{"ink": {"$type": "color", "$value": "#000"}}')
    request = {"jsonrpc": "2.0", "id": 3, "method": "tools/call", "params": {
        "name": "designesy_tokens_score", "arguments": {"url": _inside(net, "/tokens.json")}}}
    reply = mcp._handle(request)
    assert reply["result"] == {"content": [{"type": "text", "text": (
        "Tool execution failed: Blocked: host 'inside.example.test' resolves to "
        "private/reserved IP '127.0.0.1'")}], "isError": True}
    assert net.server.seen == []
