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