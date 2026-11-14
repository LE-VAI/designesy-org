"""No test reaches the network.

Every test runs inside `no_network` (autouse). A name lookup, a reverse
lookup of an address (a loopback address too), or a connection to an
address that is not loopback, is refused before it is made, and the test
fails when it is over, naming each one. A test that needs a name to
resolve stands its own table in for socket.getaddrinfo, as `net` in
test_offline_url_checks.py does.

So when a change opens a URL by a path the tests do not stand in for, the
tests fail here, and nothing is sent past 127.0.0.1.
"""

from __future__ import annotations

import ipaddress
import socket

import pytest


def _is_address(host: object) -> bool:
    """True for no host or an IP address: a lookup of either sends nothing."""
    if host is None:
        return True
    if isinstance(host, bytes):
        host = host.decode("ascii", "replace")
    try:
        ipaddress.ip_address(str(host).split("%", 1)[0])
    except ValueError:
        return False
    return True


def _is_loopback(address: object) -> bool:
    host = address[0] if isinstance(address, tuple) else address
    try:
        return ipaddress.ip_address(str(host).split("%", 1)[0]).is_loopback
    except ValueError:
        return False


@pytest.fixture(autouse=True)
def no_network(monkeypatch):
    attempts: list[tuple[str, object]] = []
    getaddrinfo = socket.getaddrinfo
    by_name = {name: getattr(socket, name) for name in ("gethostbyname", "gethostbyname_ex")}
    reverse = ("gethostbyaddr", "getnameinfo")
    connect = socket.socket.connect
    connect_ex = socket.socket.connect_ex

    def refuse(kind: str, target: object) -> None:
        attempts.append((kind, target))
        raise OSError(f"test network guard: {kind} of {target!r} refused")

    def guarded_getaddrinfo(host, *args, **kwargs):
        if not _is_address(host):
            attempts.append(("lookup", host))
            raise socket.gaierror(socket.EAI_NONAME, f"test network guard: lookup of {host!r} refused")
        return getaddrinfo(host, *args, **kwargs)

    def guarded(name):
        def guarded_by_name(host, *args, **kwargs):
            if not _is_address(host):
                attempts.append(("lookup", host))
                raise socket.gaierror(socket.EAI_NONAME, f"test network guard: lookup of {host!r} refused")
            return by_name[name](host, *args, **kwargs)
        return guarded_by_name

    def guarded_reverse(target, *args, **kwargs):
        attempts.append(("reverse lookup", target))
        raise socket.herror(1, f"test network guard: reverse lookup of {target!r} refused")

    def guarded_connect(sock, address):
        if sock.family in (socket.AF_INET, socket.AF_INET6) and not _is_loopback(address):
            refuse("connection", address)
        return connect(sock, address)

    def guarded_connect_ex(sock, address):
        if sock.family in (socket.AF_INET, socket.AF_INET6) and not _is_loopback(address):
            refuse("connection", address)
        return connect_ex(sock, address)

    monkeypatch.setattr(socket, "getaddrinfo", guarded_getaddrinfo)
    for name in by_name:
        monkeypatch.setattr(socket, name, guarded(name))
    for name in reverse:
        monkeypatch.setattr(socket, name, guarded_reverse)
    monkeypatch.setattr(socket.socket, "connect", guarded_connect)
    monkeypatch.setattr(socket.socket, "connect_ex", guarded_connect_ex)
    yield
    if attempts:
        pytest.fail(f"the test tried to reach the network: {attempts}", pytrace=False)
