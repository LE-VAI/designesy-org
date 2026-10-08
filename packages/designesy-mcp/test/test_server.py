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
            mock.assert_called_once_with(url="https://example.com")

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