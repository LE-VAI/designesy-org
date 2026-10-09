"""Test suite for designesy_mcp_server.

Covers tool-list integrity, dispatch routing, token validation (t06-t10
real checks), SSRF protection, JSON-RPC protocol, and version-string
consistency.  Network calls are mocked — no live internet required.
"""

import json
import sys
import os
from unittest.mock import patch, MagicMock
from pathlib import Path

import pytest

# Import the server module from the parent directory.
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

import designesy_mcp_server as mcp


# ── Fixtures ──────────────────────────────────────────────────────────────────


VALID_TOKEN_FILE = json.dumps({
    "$schema": "https://www.designtokens.org/schemas/2025.10/format.json",
    "$tokens": {
        "color": {
            "primary": {
                "$type": "color",
                "$value": {"colorSpace": "srgb", "components": [0.2, 0.4, 0.9]},
            },
            "muted": {
                "$type": "color",
                "$value": {"colorSpace": "srgb", "components": [0.5, 0.5, 0.5]},
            },
        },
        "spacing": {
            "md": {
                "$type": "dimension",
                "$value": "16px",
            },
            "lg": {
                "$type": "dimension",
                "$value": "2rem",
            },
        },
        "font": {
            "family": {
                "$type": "fontFamily",
                "$value": ["Inter", "sans-serif"],
            },
            "weight": {
                "$type": "fontWeight",
                "$value": 600,
            },
        },
    },
})


INVALID_TOKEN_FILE = json.dumps({
    "$schema": "https://wrong-schema.com/schema.json",
    "$tokens": {
        "colors": {
            "primary": {
                "$type": "myCustomGlow",
                "$value": "#3b82f6",
            },
            "secondary": {
                "$value": "#ff0000",
            },
        },
        "spacing": {
            "md": {
                "$type": "dimension",
                "$value": 16,
            },
            "lg": {
                "$type": "dimension",
                "$value": "2parsangs",
            },
        },
    },
})


EMPTY_TOKEN_FILE = json.dumps({"$schema": "https://www.designtokens.org/schemas/2025.10/format.json"})


# ── 1. Tool-list integrity ────────────────────────────────────────────────────


class TestToolList:
    def test_tools_is_list(self):
        assert isinstance(mcp.TOOLS, list)

    def test_tools_count_is_17(self):
        assert len(mcp.TOOLS) == 17, f"Expected 17 tools, got {len(mcp.TOOLS)}"

    def test_all_tools_prefixed_designesy(self):
        for tool in mcp.TOOLS:
            assert tool["name"].startswith("designesy_"), f"Tool '{tool['name']}' lacks designesy_ prefix"

    def test_all_tools_have_required_fields(self):
        for tool in mcp.TOOLS:
            assert "name" in tool, f"Tool missing 'name' field"
            assert "description" in tool, f"Tool '{tool['name']}' missing 'description'"
            assert "inputSchema" in tool, f"Tool '{tool['name']}' missing 'inputSchema'"

    def test_dispatch_handles_all_tools(self):
        """Every tool in TOOLS should have a dispatch branch (not return 'Unknown tool')."""
        # We can't call all without network, but we can verify dispatch doesn't
        # return "Unknown tool" for any registered name by checking the source.
        import inspect
        source = inspect.getsource(mcp._dispatch)
        for tool in mcp.TOOLS:
            assert f'"{tool["name"]}"' in source, f"Tool '{tool['name']}' has no dispatch branch"


# ── 2. Dispatch routing ───────────────────────────────────────────────────────


class TestDispatch:
    def test_unknown_tool_returns_error(self):
        result = mcp._dispatch("nonexistent_tool", {})
        assert result.get("success") is False
        assert "Unknown tool" in result.get("error", "")

    def test_dispatch_designesy_score(self):
        """Verify _score_impl is called when dispatching designesy_score."""
        with patch.object(mcp, "_score_impl", return_value={"score": 50}) as mock:
            mcp._dispatch("designesy_score", {"url": "https://example.com"})
            mock.assert_called_once_with(url="https://example.com", format=None, scope=None)

    def test_dispatch_designesy_score_passes_format_and_scope(self):
        with patch.object(mcp, "_score_impl", return_value={"score": 50}) as mock:
            mcp._dispatch(
                "designesy_score",
                {"url": "https://example.com", "format": "review", "scope": "contract"},
            )
            mock.assert_called_once_with(url="https://example.com", format="review", scope="contract")

    def test_dispatch_designesy_tokens_score_with_url(self):
        with patch.object(mcp, "_tokens_score_impl", return_value={"score": 100}) as mock:
            mcp._dispatch("designesy_tokens_score", {"url": "https://example.com/tokens.json"})
            mock.assert_called_once_with(url="https://example.com/tokens.json", dtcg_file=None)

    def test_dispatch_designesy_tokens_score_with_inline(self):
        with patch.object(mcp, "_tokens_score_impl", return_value={"score": 100}) as mock:
            mcp._dispatch("designesy_tokens_score", {"dtcg_file": "{}"})
            mock.assert_called_once_with(url=None, dtcg_file="{}")


# ── 3. Token validation — t06-t10 real checks ────────────────────────────────


class TestTokenValidation:
    """Verify that t06-t10 are real checks, not hardcoded PASS."""

    @patch("designesy_mcp_server._fetch")
    def test_valid_token_file_passes_t06_t10(self, mock_fetch):
        """A well-formed DTCG file should PASS t06-t10."""
        mock_fetch.return_value = {
            "id": "test",
            "version": "1.0",
            "status": "active",
            "checks": [{"item": f"check {i}"} for i in range(10)],
        }
        result = mcp._tokens_score_impl(dtcg_file=VALID_TOKEN_FILE)
        checks = {c["id"]: c for c in result["checks"]}

        assert checks["t06"]["status"] == "PASS", f"t06 should PASS for valid file: {checks['t06']['detail']}"
        assert checks["t07"]["status"] == "SKIP", f"t07 should SKIP (no custom types): {checks['t07']['detail']}"
        assert checks["t08"]["status"] == "PASS", f"t08 should PASS for valid dimensions: {checks['t08']['detail']}"
        assert checks["t09"]["status"] == "PASS", f"t09 should PASS for valid hierarchy: {checks['t09']['detail']}"
        assert checks["t10"]["status"] == "PASS", f"t10 should PASS for no deprecated patterns: {checks['t10']['detail']}"

    @patch("designesy_mcp_server._fetch")
    def test_invalid_token_file_warns_on_t06_t10(self, mock_fetch):
        """A malformed DTCG file should WARN/FAIL on t06-t10, not PASS."""
        mock_fetch.return_value = {
            "id": "test",
            "version": "1.0",
            "status": "active",
            "checks": [{"item": f"check {i}"} for i in range(10)],
        }
        result = mcp._tokens_score_impl(dtcg_file=INVALID_TOKEN_FILE)
        checks = {c["id"]: c for c in result["checks"]}

        # t06: "myCustomGlow" is non-standard → WARN
        assert checks["t06"]["status"] == "WARN", f"t06 should WARN for non-standard type: {checks['t06']['detail']}"

        # t07: "myCustomGlow" has no dot-namespacing → WARN
        assert checks["t07"]["status"] == "WARN", f"t07 should WARN for unnamespaced custom type: {checks['t07']['detail']}"

        # t08: bare number "16" and "2parsangs" → at least WARN
        assert checks["t08"]["status"] in ("WARN", "FAIL"), f"t08 should not PASS for bad dimension units: {checks['t08']['detail']}"

        # t10: bare hex, bare number dimension → WARN
        assert checks["t10"]["status"] == "WARN", f"t10 should WARN for deprecated patterns: {checks['t10']['detail']}"

    @patch("designesy_mcp_server._fetch")
    def test_empty_token_file_handled_gracefully(self, mock_fetch):
        mock_fetch.return_value = {
            "id": "test",
            "version": "1.0",
            "status": "active",
            "checks": [{"item": f"check {i}"} for i in range(10)],
        }
        result = mcp._tokens_score_impl(dtcg_file=EMPTY_TOKEN_FILE)
        checks = {c["id"]: c for c in result["checks"]}

        # t06-t08 should SKIP (no tokens to check)
        assert checks["t06"]["status"] == "SKIP"
        assert checks["t07"]["status"] == "SKIP"
        assert checks["t08"]["status"] == "SKIP"

    @patch("designesy_mcp_server._fetch")
    def test_t10_detects_bare_hex_and_ref(self, mock_fetch):
        """t10 should flag deprecated patterns: bare hex colors, $ref syntax."""
        mock_fetch.return_value = {
            "id": "test", "version": "1.0", "status": "active",
            "checks": [{"item": f"check {i}"} for i in range(10)],
        }
        token_file = json.dumps({
            "$schema": "https://www.designtokens.org/schemas/2025.10/format.json",
            "$tokens": {
                "color": {
                    "primary": {
                        "$type": "color",
                        "$value": "#ff0000",
                        "$ref": "#/color/primary",
                    },
                },
            },
        })
        result = mcp._tokens_score_impl(dtcg_file=token_file)
        t10 = {c["id"]: c for c in result["checks"]}["t10"]
        assert t10["status"] == "WARN"
        assert "bare hex" in t10["detail"].lower() or "$ref" in t10["detail"].lower()


# ── 3b. t06 type list: the 13 types DTCG 2025.10 defines ─────────────────────
#
# Before 2026-10-08 the list lacked cubicBezier and carried seven names the
# format does not define, so t06 WARNed on a conformant easing token and passed
# "spacing" or "string" as standard. Each test below exercised the old wrong
# verdict.

DTCG_2025_10_TYPES = {
    # Types section
    "color", "dimension", "fontFamily", "fontWeight", "duration", "cubicBezier", "number",
    # Composite types section
    "strokeStyle", "border", "transition", "shadow", "gradient", "typography",
}

NOT_DTCG_TYPES = ["string", "boolean", "link", "borderStyle", "borderWeight", "radius", "spacing"]

_CONTRACT_STUB = {
    "id": "test", "version": "1.0", "status": "active",
    "checks": [{"item": f"check {i}"} for i in range(10)],
}


def _one_token_file(type_name, value):
    return json.dumps({
        "$schema": "https://www.designtokens.org/schemas/2025.10/format.json",
        "$tokens": {"group": {"token": {"$type": type_name, "$value": value}}},
    })


class TestDtcgTypeList:
    def test_list_is_exactly_the_13_spec_types(self):
        assert set(mcp.DTCG_STANDARD_TYPES) == DTCG_2025_10_TYPES
        assert len(mcp.DTCG_STANDARD_TYPES) == 13

    def test_cubic_bezier_token_is_standard(self):
        """Old verdict: t06 WARN and t07 WARN (cubicBezier missing from the list)."""
        with patch.object(mcp, "_fetch", return_value=_CONTRACT_STUB):
            result = mcp._tokens_score_impl(dtcg_file=_one_token_file("cubicBezier", [0.23, 1, 0.32, 1]))
        checks = {c["id"]: c for c in result["checks"]}
        assert checks["t06"]["status"] == "PASS", checks["t06"]["detail"]
        assert checks["t07"]["status"] == "SKIP", checks["t07"]["detail"]

    @pytest.mark.parametrize("type_name", NOT_DTCG_TYPES)
    def test_names_outside_the_spec_are_non_standard(self, type_name):
        """Old verdict: t06 PASS (each name sat in the list as if standard)."""
        with patch.object(mcp, "_fetch", return_value=_CONTRACT_STUB):
            result = mcp._tokens_score_impl(dtcg_file=_one_token_file(type_name, "x"))
        t06 = {c["id"]: c for c in result["checks"]}["t06"]
        assert t06["status"] == "WARN", t06["detail"]
        assert type_name in t06["detail"]

    def test_site_mcp_route_carries_the_same_list(self):
        """The hosted MCP endpoint (apps/site) validates with its own copy."""
        import re

        route = Path(__file__).resolve().parents[3] / "apps" / "site" / "app" / "api" / "mcp" / "route.ts"
        if not route.exists():
            pytest.skip("apps/site is not present (sdist build); the repo checkout runs this test")
        src = route.read_text(encoding="utf-8")
        m = re.search(r"const DTCG_STANDARD_TYPES = new Set\(\[(.*?)\]\)", src, re.S)
        assert m, "DTCG_STANDARD_TYPES not found in apps/site/app/api/mcp/route.ts"
        assert set(re.findall(r"'([A-Za-z]+)'", m.group(1))) == DTCG_2025_10_TYPES


# ── 4. SSRF protection ────────────────────────────────────────────────────────


class TestSSRFProtection:
    def test_localhost_blocked(self):
        with pytest.raises(ValueError, match="internal host"):
            mcp._validate_url("http://localhost/admin")

    def test_127_0_0_1_blocked(self):
        with pytest.raises(ValueError, match="internal host"):
            mcp._validate_url("http://127.0.0.1:8080/")

    def test_cloud_metadata_blocked(self):
        with pytest.raises(ValueError, match="internal host"):
            mcp._validate_url("http://169.254.169.254/latest/meta-data/")

    def test_private_ip_blocked(self):
        with pytest.raises(ValueError, match="private/reserved"):
            mcp._validate_url("http://10.0.0.1/")

    def test_192_168_blocked(self):
        with pytest.raises(ValueError, match="private/reserved"):
            mcp._validate_url("http://192.168.1.1/")

    def test_file_scheme_blocked(self):
        with pytest.raises(ValueError, match="non-http"):
            mcp._validate_url("file:///etc/passwd")

    def test_gopher_scheme_blocked(self):
        with pytest.raises(ValueError, match="non-http"):
            mcp._validate_url("gopher://internal/")

    def test_ipv6_loopback_blocked(self):
        with pytest.raises(ValueError, match="internal host"):
            mcp._validate_url("http://[::1]/")

    def test_valid_public_url_allowed(self):
        # Should not raise
        mcp._validate_url("https://www.designesy.org/")

    def test_fetch_calls_validate_url(self):
        """_fetch should reject blocked URLs before making any network call."""
        with pytest.raises(ValueError, match="internal host"):
            mcp._fetch("http://localhost/secret")


# ── 5. JSON-RPC protocol ──────────────────────────────────────────────────────


class TestJsonRpcProtocol:
    def test_error_response_structure(self):
        err = mcp._error(1, -32601, "Method not found")
        assert err["jsonrpc"] == "2.0"
        assert err["id"] == 1
        assert err["error"]["code"] == -32601
        assert err["error"]["message"] == "Method not found"

    def test_result_response_structure(self):
        res = mcp._result(1, {"tools": []})
        assert res["jsonrpc"] == "2.0"
        assert res["id"] == 1
        assert res["result"] == {"tools": []}


# ── 6. Version-string consistency ─────────────────────────────────────────────


class TestVersionConsistency:
    def test_server_version_is_string(self):
        assert isinstance(mcp.SERVER_VERSION, str)

    def test_server_version_matches_pyproject(self):
        """SERVER_VERSION should match pyproject.toml version."""
        pyproject_path = Path(__file__).parent.parent / "pyproject.toml"
        pyproject_text = pyproject_path.read_text()

        # Extract version from pyproject.toml
        for line in pyproject_text.splitlines():
            if line.strip().startswith("version") and "=" in line:
                pyproject_version = line.split("=")[1].strip().strip('"').strip("'")
                assert mcp.SERVER_VERSION == pyproject_version, (
                    f"SERVER_VERSION ({mcp.SERVER_VERSION}) != pyproject.toml version ({pyproject_version})"
                )
                return
        pytest.fail("Could not find version in pyproject.toml")

    def test_server_version_format(self):
        """Version should be a semantic version string (x.y.z)."""
        parts = mcp.SERVER_VERSION.split(".")
        assert len(parts) == 3, f"Expected semver x.y.z, got {mcp.SERVER_VERSION}"
        for part in parts:
            assert part.isdigit(), f"Version part '{part}' is not numeric"


# ── 7. Every published surface reports the pyproject version ──────────────────
#
# PyPI and the MCP registry publish from pyproject.toml, but the HTTP server,
# its server card, server.json and the Action restated the version as literals
# and sat at 1.12.0 while 1.12.2 shipped (found 2026-10-06). publish-mcp-
# registry.yml rewrites server.json from the tag at publish time, so the
# registry was right and nothing noticed the repo copy was stale.

REPO = Path(__file__).resolve().parents[3]


def _pyproject_version() -> str:
    for line in (REPO / "packages/designesy-mcp/pyproject.toml").read_text(encoding="utf-8").splitlines():
        if line.strip().startswith("version") and "=" in line:
            return line.split("=")[1].strip().strip('"').strip("'")
    pytest.fail("Could not find version in pyproject.toml")


class TestPublishedSurfacesMatchPyproject:
    def test_site_constant(self):
        src = (REPO / "apps/site/app/lib/mcp-version.ts").read_text(encoding="utf-8")
        assert f"export const MCP_SERVER_VERSION = '{_pyproject_version()}';" in src

    def test_server_json(self):
        doc = json.loads((REPO / "server.json").read_text(encoding="utf-8"))
        v = _pyproject_version()
        assert doc["version"] == v
        assert [p["version"] for p in doc["packages"]] == [v] * len(doc["packages"])

    def test_action_sarif_driver(self):
        src = (REPO / "action/dist/index.js").read_text(encoding="utf-8")
        assert f"semanticVersion: '{_pyproject_version()}'," in src

    @pytest.mark.parametrize("rel", [
        "apps/site/app/api/mcp/route.ts",
        "apps/site/app/.well-known/mcp/server-card.json/route.ts",
    ])
    def test_site_routes_read_the_constant(self, rel):
        # A literal here is how the drift started, so none may come back: the
        # route must import the constant and state no x.y.z version of its own.
        import re
        src = (REPO / rel).read_text(encoding="utf-8")
        assert "MCP_SERVER_VERSION" in src, f"{rel} does not use MCP_SERVER_VERSION"
        literal = re.search(r"""(?:version:\s*|designesy-mcp/)['"`]?\d+\.\d+\.\d+""", src)
        assert literal is None, f"{rel} restates a version literal: {literal.group(0)!r}"


# ── 8. designesy_score format and scope pass-through ──────────────────────────
#
# The description offered format= while the schema held only url, and the call
# to /api/score sent only url (found 2026-10-08). The remote MCP tool takes
# format and scope; this server now passes both through. The HTTP call is
# mocked at urllib.request.urlopen, so the request each test sends is captured
# and nothing reaches the network.

import urllib.error  # noqa: E402

# A designesy-format engine reply. It carries fields the reshape drops
# (scope, scored, categoryScores, weight, remediation, receipt) and a non-ASCII
# character, so the golden output below pins both the reshape and its encoding.
ENGINE_NATIVE = {
    "ok": True,
    "contractVersion": "v0.4.1",
    "url": "https://example.com/",
    "scope": "universal",
    "score": 87.46,
    "grade": "B",
    "total": 42,
    "scored": 30,
    "pass": 25,
    "fail": 2,
    "warn": 3,
    "skip": 10,
    "manual": 2,
    "tokensExtracted": 14,
    "categoryScores": {"tokens": {"score": 90, "weight": 9, "pass": 3, "fail": 0, "warn": 1, "skip": 0, "manual": 0}},
    "checks": [
        {"id": "v01", "item": "Token values match live site :root foundation", "category": "tokens",
         "status": "PASS", "detail": "--paper resolved to #fafaf7", "weight": 3},
        {"id": "v06", "item": "Contrast remains readable for ink, muted, and accent on paper (WCAG 2.1 + APCA)",
         "category": "accessibility", "status": "WARN", "detail": "ink 15.2:1; --muted below 4.5:1 AA",
         "remediation": "Darken --muted."},
        {"id": "v24", "item": "Touch targets ≥44px on interactive elements (WCAG 2.5.5 Enhanced)",
         "category": "accessibility", "status": "MANUAL", "detail": "needs a live browser"},
    ],
    "receipt": {"retrieved_at": "2026-10-08T00:00:00Z", "requested_url": "https://example.com/"},
}

# The tools/call text a url-only designesy_score call produced for ENGINE_NATIVE
# BEFORE format and scope existed, generated by running the pre-change server
# (git HEAD 38353c59) against this same mocked reply. Byte-identical is the bar.
GOLDEN_URL_ONLY_TEXT = """{
  "url": "https://example.com/",
  "contract_version": "v0.4.1",
  "summary": {
    "total": 42,
    "pass": 25,
    "fail": 2,
    "warn": 3,
    "skip": 10,
    "manual": 2,
    "score": 0.8746,
    "score_percent": 87.5,
    "grade": "B"
  },
  "tokens_extracted": 14,
  "checks": [
    {
      "id": "v01",
      "item": "Token values match live site :root foundation",
      "category": "tokens",
      "status": "PASS",
      "detail": "--paper resolved to #fafaf7"
    },
    {
      "id": "v06",
      "item": "Contrast remains readable for ink, muted, and accent on paper (WCAG 2.1 + APCA)",
      "category": "accessibility",
      "status": "WARN",
      "detail": "ink 15.2:1; --muted below 4.5:1 AA"
    },
    {
      "id": "v24",
      "item": "Touch targets \\u226544px on interactive elements (WCAG 2.5.5 Enhanced)",
      "category": "accessibility",
      "status": "MANUAL",
      "detail": "needs a live browser"
    }
  ],
  "note": "Canonical 42-check engine (v0.4.1). 25 passed, 2 failed, 3 warned, 10 skipped, 2 manual (browser-only). Score 87.5% (B)."
}"""

ENGINE_CANONICAL = {
    "schemaVersion": "1.0",
    "generatedAt": "2026-10-08T00:00:00.000Z",
    "tool": {"name": "designesy", "version": "v0.4.1"},
    "subject": {"type": "url", "requested": "https://example.com/", "scope": "universal"},
    "findings": [{"id": "v06", "status": "WARN", "severity": "warning", "message": "--muted below 4.5:1 AA"}],
    "summary": {"score": 87.46, "grade": "B"},
    "verdict": "needs-changes",
}

ENGINE_GOOGLE = {
    "findings": [{"severity": "warning", "path": "accessibility", "message": "--muted below 4.5:1 AA"}],
    "summary": {"errors": 2, "warnings": 3, "infos": 25, "score": 87.46, "grade": "B"},
    "designSystem": None,
}

# Markdown with a table, pipes, non-ASCII and no trailing newline: any
# re-encoding (JSON quoting, newline escaping, stripping) changes these bytes.
ENGINE_REVIEW = (
    "## Scope and Coverage\n\n"
    "| Domain | Evidence inspected | Result |\n"
    "|---|---|---|\n"
    "| accessibility | CSS, HTML | 1 finding(s): 0 FAIL, 1 WARN |\n\n"
    "## Verdict\n\n"
    "**Needs changes**: only MEDIUM findings (WARN) remain.\n\n"
    "**Score: 87.46% (Grade B)** (touch targets ≥44px)"
)

ENGINE_REPLY = {
    "designesy": json.dumps(ENGINE_NATIVE),
    "canonical": json.dumps(ENGINE_CANONICAL),
    "google": json.dumps(ENGINE_GOOGLE),
    "review": ENGINE_REVIEW,
}


def _reply(body_text: str) -> MagicMock:
    """An object urlopen() can return: a context manager whose read() gives the body."""
    resp = MagicMock()
    resp.read.return_value = body_text.encode("utf-8")
    cm = MagicMock()
    cm.__enter__.return_value = resp
    cm.__exit__.return_value = False
    return cm


class _Engine:
    """Stands in for urlopen: records each Request and answers by its format."""

    def __init__(self, error: Exception | None = None):
        self.requests: list = []
        self.error = error

    def __call__(self, req, timeout=None, context=None):
        self.requests.append(req)
        if self.error is not None:
            raise self.error
        fmt = json.loads(req.data.decode("utf-8")).get("format", "designesy")
        return _reply(ENGINE_REPLY[fmt])

    @property
    def bodies(self) -> list[dict]:
        return [json.loads(r.data.decode("utf-8")) for r in self.requests]


def _call(arguments: dict) -> dict:
    """One tools/call through the JSON-RPC layer; returns the result object."""
    msg = {"jsonrpc": "2.0", "id": 7, "method": "tools/call",
           "params": {"name": "designesy_score", "arguments": arguments}}
    return mcp._handle(msg)["result"]


class TestScoreFormatScope:
    # -- schema --------------------------------------------------------------

    def _tool(self) -> dict:
        return mcp.TOOL_MAP["designesy_score"]

    def test_schema_offers_format_and_scope_with_the_remote_enums(self):
        props = self._tool()["inputSchema"]["properties"]
        assert set(props) == {"url", "format", "scope"}
        assert props["format"]["type"] == "string"
        assert props["format"]["enum"] == ["designesy", "canonical", "review", "google"]
        assert props["format"]["default"] == "designesy"
        assert props["scope"]["type"] == "string"
        assert props["scope"]["enum"] == ["contract", "universal"]
        # scope has no default: omitting it is what lets the engine auto-detect.
        assert "default" not in props["scope"]
        assert "required" not in self._tool()["inputSchema"]

    def test_schema_matches_the_remote_tool_source(self):
        # The remote tool's zod enums, read from its source, are the contract.
        src = (REPO / "apps/site/app/api/mcp/route.ts").read_text(encoding="utf-8")
        start = src.index("'designesy_score'")
        block = src[start:src.index("registerTool(", start)]
        props = self._tool()["inputSchema"]["properties"]
        if "format: z.enum(" not in block:
            pytest.skip("the remote designesy_score in this checkout has no format enum yet")
        fmt_enum = "z.enum([" + ", ".join(f"'{v}'" for v in props["format"]["enum"]) + "])"
        scope_enum = "z.enum([" + ", ".join(f"'{v}'" for v in props["scope"]["enum"]) + "])"
        assert f"format: {fmt_enum}" in block
        assert f"scope: {scope_enum}" in block

    def test_description_names_every_format_and_scope_without_em_dashes(self):
        desc = self._tool()["description"]
        for word in ("designesy", "canonical", "review", "google", "contract", "universal"):
            assert word in desc
        assert chr(0x2014) not in desc and chr(0x2013) not in desc  # em dash, en dash
        # The default shape it documents is the one the reshape returns.
        assert "contract_version" in desc and "score_percent" in desc

    # -- request ----------------------------------------------------------------

    def test_url_only_request_body_and_user_agent(self):
        engine = _Engine()
        with patch.object(mcp.urllib.request, "urlopen", engine):
            mcp._score_impl(url="https://example.com/")
        assert engine.bodies == [{"url": "https://example.com/", "format": "designesy"}]
        req = engine.requests[0]
        assert req.full_url == f"{mcp.BASE_URL}/api/score"
        assert req.get_method() == "POST"
        assert req.get_header("User-agent") == f"designesy-mcp/{mcp.SERVER_VERSION}"
        assert req.get_header("Content-type") == "application/json"

    @pytest.mark.parametrize("fmt", ["designesy", "canonical", "review", "google"])
    def test_each_format_is_sent_in_the_body(self, fmt):
        engine = _Engine()
        with patch.object(mcp.urllib.request, "urlopen", engine):
            mcp._score_impl(url="https://example.com/", format=fmt)
        assert engine.bodies == [{"url": "https://example.com/", "format": fmt}]
        assert engine.requests[0].get_header("User-agent") == f"designesy-mcp/{mcp.SERVER_VERSION}"

    @pytest.mark.parametrize("fmt", ["designesy", "canonical", "review", "google"])
    @pytest.mark.parametrize("scope", ["contract", "universal"])
    def test_scope_is_sent_only_when_given(self, fmt, scope):
        engine = _Engine()
        with patch.object(mcp.urllib.request, "urlopen", engine):
            mcp._score_impl(url="https://example.com/", format=fmt, scope=scope)
        assert engine.bodies == [{"url": "https://example.com/", "format": fmt, "scope": scope}]

    def test_missing_url_scores_the_designesy_home_page(self):
        engine = _Engine()
        with patch.object(mcp.urllib.request, "urlopen", engine):
            mcp._score_impl(format="google")
        assert engine.bodies[0]["url"] == f"{mcp.BASE_URL}/"

    # -- response handling ------------------------------------------------------

    def test_url_only_call_is_byte_identical_to_before(self):
        engine = _Engine()
        with patch.object(mcp.urllib.request, "urlopen", engine):
            result = _call({"url": "https://example.com/"})
        assert result["isError"] is False
        assert result["content"] == [{"type": "text", "text": GOLDEN_URL_ONLY_TEXT}]

    def test_explicit_designesy_format_matches_the_url_only_output(self):
        engine = _Engine()
        with patch.object(mcp.urllib.request, "urlopen", engine):
            result = _call({"url": "https://example.com/", "format": "designesy"})
        assert result["content"][0]["text"] == GOLDEN_URL_ONLY_TEXT

    @pytest.mark.parametrize("fmt, engine_json", [
        ("canonical", ENGINE_CANONICAL),
        ("google", ENGINE_GOOGLE),
    ])
    def test_canonical_and_google_return_the_engine_json_unchanged(self, fmt, engine_json):
        engine = _Engine()
        with patch.object(mcp.urllib.request, "urlopen", engine):
            assert mcp._score_impl(url="https://example.com/", format=fmt) == engine_json
            result = _call({"url": "https://example.com/", "format": fmt})
        assert result["isError"] is False
        assert json.loads(result["content"][0]["text"]) == engine_json

    def test_review_returns_the_engine_markdown_unchanged(self):
        engine = _Engine()
        with patch.object(mcp.urllib.request, "urlopen", engine):
            assert mcp._score_impl(url="https://example.com/", format="review") == ENGINE_REVIEW
            result = _call({"url": "https://example.com/", "format": "review"})
        assert result["isError"] is False
        # Sent as the text itself: no JSON quoting, no escaped newlines.
        assert result["content"] == [{"type": "text", "text": ENGINE_REVIEW}]
        assert engine.requests[0].get_header("Accept") == "text/markdown"

    # -- validation -----------------------------------------------------------

    @pytest.mark.parametrize("args", [
        {"format": "markdown"},
        {"format": "Review"},
        {"format": ""},
        {"scope": "global"},
        {"scope": ""},
    ])
    def test_unknown_format_or_scope_is_an_error_and_sends_nothing(self, args):
        engine = _Engine()
        with patch.object(mcp.urllib.request, "urlopen", engine):
            result = _call({"url": "https://example.com/", **args})
        assert engine.requests == []
        assert result["isError"] is True
        assert "Unknown" in json.loads(result["content"][0]["text"])["error"]

    # -- offline fallback -----------------------------------------------------

    @pytest.mark.parametrize("fmt", ["canonical", "review", "google"])
    def test_non_default_format_without_the_engine_is_a_clear_error(self, fmt):
        engine = _Engine(error=urllib.error.URLError("network unreachable"))
        with patch.object(mcp.urllib.request, "urlopen", engine), \
                patch.object(mcp, "_score_local_impl") as local:
            result = _call({"url": "https://example.com/", "format": fmt})
        local.assert_not_called()
        assert result["isError"] is True
        payload = json.loads(result["content"][0]["text"])
        assert payload["success"] is False
        assert payload["format"] == fmt
        assert f"format={fmt!r} needs the live scoring engine" in payload["error"]
        assert "network unreachable" in payload["error"]
        assert "only the default designesy format" in payload["error"]

    def test_non_default_format_error_carries_the_engine_error_text(self):
        import io
        err = urllib.error.HTTPError(
            f"{mcp.BASE_URL}/api/score", 429, "Too Many Requests", {},
            io.BytesIO(b'{"ok":false,"error":"Rate limit exceeded. Maximum 100 scores per hour."}'),
        )
        with patch.object(mcp.urllib.request, "urlopen", _Engine(error=err)):
            result = mcp._score_impl(url="https://example.com/", format="review")
        assert result["success"] is False
        assert "HTTP 429: Rate limit exceeded. Maximum 100 scores per hour." in result["error"]

    def test_non_default_format_with_an_unparseable_reply_is_an_error(self):
        def urlopen(req, timeout=None, context=None):
            return _reply("<html>gateway error</html>")
        with patch.object(mcp.urllib.request, "urlopen", urlopen):
            result = mcp._score_impl(url="https://example.com/", format="canonical")
        assert result["success"] is False
        assert "needs the live scoring engine" in result["error"]

    def test_default_format_still_falls_back_to_the_local_engine(self):
        local_result = {"url": "https://example.com/", "summary": {"score": 0.5}, "note": "local"}
        engine = _Engine(error=urllib.error.URLError("network unreachable"))
        with patch.object(mcp.urllib.request, "urlopen", engine), \
                patch.object(mcp, "_score_local_impl", return_value=dict(local_result)) as local:
            result = mcp._score_impl(url="https://example.com/")
        local.assert_called_once_with("https://example.com/", None)
        assert result == local_result

    def test_default_format_falls_back_when_the_engine_reply_is_not_ok(self):
        def urlopen(req, timeout=None, context=None):
            return _reply('{"ok": false, "error": "Could not reach https://example.com/"}')
        with patch.object(mcp.urllib.request, "urlopen", urlopen), \
                patch.object(mcp, "_score_local_impl", return_value={"note": "local"}) as local:
            assert mcp._score_impl(url="https://example.com/") == {"note": "local"}
        local.assert_called_once()

    def test_fallback_applies_the_requested_scope(self):
        # The offline engine has scope modes since it mirrors engine 1.1.0, so
        # the requested scope is passed on rather than reported as dropped.
        engine = _Engine(error=urllib.error.URLError("network unreachable"))
        with patch.object(mcp.urllib.request, "urlopen", engine),                 patch.object(mcp, "_score_local_impl", return_value={"note": "local"}) as local:
            result = mcp._score_impl(url="https://example.com/", scope="contract")
        assert engine.bodies == [{"url": "https://example.com/", "format": "designesy", "scope": "contract"}]
        local.assert_called_once_with("https://example.com/", "contract")
        assert result == {"note": "local"}