"""designesy_report detail="summary" and designesy_guardrails parts=[...].

Anthropic's Software Directory Policy 5B asks a server to be frugal with tokens
and to give users a way to trim what a tool returns. On www.designesy.org the
report returned about 100,000 characters and the guardrails bundle about
90,000, and a client that caps tool output cut both off. Both tools now take an
optional parameter that returns less; without it they return what they always
did.

The fixtures under fixtures/trim/ are the two results /api/report (plus the
appUrl the tool adds) and /api/guardrails returned for https://www.designesy.org/
on 2026-10-10. expected.json is the golden output. The hosted endpoint's
implementation (apps/site/app/lib/mcp-trim.ts) is checked against the same
golden by apps/site/scripts/check-mcp-tool-parity.js. Regenerate it after an
intended change with:

    python test/test_trim.py --write-golden

Network calls are mocked; nothing here reaches the network.
"""

from __future__ import annotations

import hashlib
import json
import os
import re
import sys
from pathlib import Path
from unittest.mock import patch

import pytest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

import designesy_mcp_server as mcp  # noqa: E402

HERE = Path(__file__).resolve().parent
FIXTURES = HERE / "fixtures" / "trim"
GOLDEN = FIXTURES / "expected.json"
REPO = HERE.parents[2]
ROUTE_TS = REPO / "apps" / "site" / "app" / "api" / "mcp" / "route.ts"
TRIM_TS = REPO / "apps" / "site" / "app" / "lib" / "mcp-trim.ts"

REPORT = "report-designesy-org.json"
GUARDRAILS = "guardrails-designesy-org.json"
PART_CASES = [
    ["designMd"],
    ["tokens", "lintConfig"],
    ["agentRules", "tokens", "agentRules"],
    list(mcp.GUARDRAILS_PARTS),
]
ERROR_CASES = [
    [],
    ["designmd"],
    ["tokens", "nope", "DESIGN.md"],
]


def _fixture(name: str):
    return json.loads((FIXTURES / name).read_text(encoding="utf-8"))


def _sha(value) -> str:
    """sha256 of canonical JSON (sorted keys, no spaces), as the parity gate computes it."""
    text = json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=False)
    return hashlib.sha256(text.encode("utf-8")).hexdigest()


def _pretty(value) -> str:
    """What the tools return as text: JSON.stringify(value, null, 2)."""
    return json.dumps(value, indent=2, ensure_ascii=False)


def _compute_golden() -> dict:
    parts = []
    for asked in PART_CASES:
        names = mcp._guardrails_part_names(asked)
        out = mcp._guardrails_parts(_fixture(GUARDRAILS), names)
        parts.append({"parts": asked, "names": names, "output_sha256": _sha(out), "chars": len(_pretty(out))})
    errors = []
    for asked in ERROR_CASES:
        message, unknown = mcp._guardrails_part_names(asked)
        errors.append({"parts": asked, "error": message, "unknown": unknown})
    return {
        "report_summary": {REPORT: mcp._report_summary(_fixture(REPORT))},
        "guardrails_parts": {GUARDRAILS: parts},
        "guardrails_part_errors": errors,
    }


def _golden() -> dict:
    return json.loads(GOLDEN.read_text(encoding="utf-8"))


def _call(tool: str, args: dict, api_result=None) -> tuple[dict, list]:
    """tools/call through the server's JSON-RPC handler, the API call mocked.

    Returns (result, calls): calls lists the (endpoint, body) the tool posted."""
    calls: list = []

    def fake_post(endpoint, body):
        calls.append((endpoint, body))
        return json.loads(json.dumps(api_result))

    with patch.object(mcp, "_post_api", fake_post):
        msg = mcp._handle({"jsonrpc": "2.0", "id": 1, "method": "tools/call",
                           "params": {"name": tool, "arguments": args}})
    return msg["result"], calls


def _text(result: dict):
    return json.loads(result["content"][0]["text"])


def _desc(name: str) -> str:
    return next(t for t in mcp.TOOLS if t["name"] == name)["description"]


def _report_api_result() -> dict:
    """The fixture is the tool's output; the API's own result has no appUrl."""
    data = _fixture(REPORT)
    data.pop("appUrl")
    return data


class TestGolden:
    def test_report_summary_matches_the_golden(self):
        assert mcp._report_summary(_fixture(REPORT)) == _golden()["report_summary"][REPORT]

    def test_guardrails_parts_match_the_golden(self):
        assert _compute_golden()["guardrails_parts"] == _golden()["guardrails_parts"]

    def test_guardrails_errors_match_the_golden(self):
        assert _compute_golden()["guardrails_part_errors"] == _golden()["guardrails_part_errors"]


class TestReportSummary:
    def test_default_and_full_return_the_whole_report(self):
        full = _fixture(REPORT)
        for args in ({"url": "https://www.designesy.org/"}, {"url": "https://www.designesy.org/", "detail": "full"}):
            res, calls = _call("designesy_report", args, _report_api_result())
            assert res["isError"] is False and _text(res) == full
            assert calls == [("report", {"url": "https://www.designesy.org/"})]

    def test_summary_through_the_tool(self):
        res, _ = _call("designesy_report", {"url": "https://www.designesy.org/", "detail": "summary"}, _report_api_result())
        assert res["isError"] is False
        assert _text(res) == _golden()["report_summary"][REPORT]

    def test_summary_keeps_the_keys_and_drops_the_rows(self):
        full = _fixture(REPORT)
        s = mcp._report_summary(full)
        assert set(s) == set(full) | {"detail", "omitted"}
        assert s["detail"] == "summary"
        for k in ("compositeScore", "compositeGrade", "totalChecks", "totalPass", "totalWarn",
                  "totalFail", "totalSkip", "totalManual", "appUrl", "ok", "url"):
            assert s[k] == full[k], k
        for engine in ("score", "drift", "readiness"):
            assert all(not isinstance(v, (dict, list)) for v in s[engine].values()), engine
            assert s[engine]["score"] == full[engine]["score"] and s[engine]["grade"] == full[engine]["grade"]
            assert "checks" not in s[engine]
        assert all(c["status"] != "PASS" for c in s["checks"] + s["synthesis"])
        assert s["checks"] == [c for c in full["checks"] if c["status"] != "PASS"]
        assert s["omitted"]["pass_checks"] + len(s["checks"]) == len(full["checks"])
        assert s["omitted"]["pass_synthesis"] + len(s["synthesis"]) == len(full["synthesis"])

    def test_sizes_hold_the_description_bands(self):
        full = _fixture(REPORT)
        assert 70_000 <= len(_pretty(full)) <= 110_000
        assert len(_pretty(mcp._report_summary(full))) < 31_000
        d = _desc("designesy_report")
        assert "about 75 to 100 KB" in d and "about 4 to 31 KB" in d

    def test_bad_detail_is_refused_before_the_engine_runs(self):
        res, calls = _call("designesy_report", {"url": "https://www.designesy.org/", "detail": "short"}, {})
        assert res["isError"] is True and calls == []
        assert "summary" in _text(res)["error"] and "full" in _text(res)["error"]

    def test_an_error_result_passes_through(self):
        err = {"ok": False, "error": "Could not fetch the target URL."}
        assert mcp._report_summary(err) == err


class TestGuardrailsParts:
    def test_default_returns_the_whole_bundle(self):
        full = _fixture(GUARDRAILS)
        res, calls = _call("designesy_guardrails", {"url": "https://www.designesy.org/"}, full)
        assert _text(res) == full and len(calls) == 1

    def test_parts_through_the_tool(self):
        full = _fixture(GUARDRAILS)
        res, _ = _call("designesy_guardrails", {"url": "https://www.designesy.org/", "parts": ["designMd"]}, full)
        out = _text(res)
        assert res["isError"] is False
        assert out["parts"] == ["designMd"] and list(out["bundle"]) == ["designMd"]
        assert out["bundle"]["designMd"] == full["bundle"]["designMd"]
        for k in ("ok", "url", "score", "grade", "pass", "warn", "fail", "total", "tokensExtracted", "checks"):
            assert out[k] == full[k], k
        assert len(_pretty(out)) < len(_pretty(full)) / 4

    def test_duplicates_dropped_and_order_kept(self):
        out = mcp._guardrails_parts(_fixture(GUARDRAILS), mcp._guardrails_part_names(["agentRules", "tokens", "agentRules"]))
        assert out["parts"] == ["agentRules", "tokens"] and list(out["bundle"]) == ["agentRules", "tokens"]

    @pytest.mark.parametrize("parts,unknown", [
        (["designmd"], ["designmd"]),
        (["tokens", "nope"], ["nope"]),
        ([], []),
    ])
    def test_bad_names_are_refused_before_the_engine_runs(self, parts, unknown):
        res, calls = _call("designesy_guardrails", {"parts": parts}, {})
        out = _text(res)
        assert res["isError"] is True and calls == []
        assert out["unknown_parts"] == unknown
        assert out["valid_parts"] == list(mcp.GUARDRAILS_PARTS)
        assert "Valid parts: tokens, lintConfig, agentRules, componentContract, antiPatterns, designMd." in out["error"]

    @pytest.mark.parametrize("parts", ["designMd", [1, 2], {"designMd": True}])
    def test_parts_must_be_a_list_of_strings(self, parts):
        res, calls = _call("designesy_guardrails", {"parts": parts}, {})
        assert res["isError"] is True and calls == []

    def test_parts_are_the_bundle_keys_the_engine_returns(self):
        assert tuple(_fixture(GUARDRAILS)["bundle"]) == mcp.GUARDRAILS_PARTS

    def test_description_names_the_parts_and_the_size(self):
        d = _desc("designesy_guardrails")
        assert "Valid parts: " + ", ".join(mcp.GUARDRAILS_PARTS) + "." in d
        assert "about 10 KB to about 500 KB" in d and "about 90 KB for designesy.org" in d
        size = len(_pretty(_fixture(GUARDRAILS)))
        assert 80_000 <= size <= 100_000


@pytest.fixture(scope="module")
def route() -> str:
    if not ROUTE_TS.exists():
        pytest.skip("route.ts is not in this checkout")
    return ROUTE_TS.read_text(encoding="utf-8")


@pytest.fixture(scope="module")
def trim_ts() -> str:
    if not TRIM_TS.exists():
        pytest.skip("mcp-trim.ts is not in this checkout")
    return TRIM_TS.read_text(encoding="utf-8")


class TestHostedAgreement:
    """The hosted endpoint declares the same parameters, values and descriptions."""

    @staticmethod
    def _ts_tuple(src: str, name: str) -> tuple[str, ...]:
        m = re.search(r"export const " + name + r" = \[([^\]]*)\] as const;", src)
        assert m, name
        return tuple(re.findall(r"'([^']*)'", m.group(1)))

    def test_same_constants(self, trim_ts):
        assert self._ts_tuple(trim_ts, "GUARDRAILS_PARTS") == mcp.GUARDRAILS_PARTS
        assert self._ts_tuple(trim_ts, "REPORT_DETAILS") == mcp.REPORT_DETAILS
        assert self._ts_tuple(trim_ts, "REPORT_ENGINES") == mcp.REPORT_ENGINES

    def test_same_parameters(self, route):
        assert "detail: z.enum(REPORT_DETAILS).optional()" in route
        assert "parts: z.array(z.string()).optional()" in route
        report = next(t for t in mcp.TOOLS if t["name"] == "designesy_report")["inputSchema"]
        guard = next(t for t in mcp.TOOLS if t["name"] == "designesy_guardrails")["inputSchema"]
        assert report["properties"]["detail"]["enum"] == list(mcp.REPORT_DETAILS)
        assert report["required"] == ["url"]
        assert guard["properties"]["parts"] == {**guard["properties"]["parts"], "type": "array", "items": {"type": "string"}}
        assert "required" not in guard

    @pytest.mark.parametrize("tool", ["designesy_report", "designesy_guardrails", "designesy_motion_score", "designesy_drift_score"])
    def test_same_description(self, route, tool):
        pat = re.compile(
            r"'" + tool + r"',\s*\{\s*\.\.\.mcpToolDisplay\('" + tool + r"'\),\s*(?://[^\n]*\n\s*)*description: ([`'])((?:(?!\1)[^\\]|\\.)*)\1"
        )
        m = pat.search(route)
        assert m, tool
        hosted = m.group(2).replace("\\'", "'")
        # Template expressions are filled in at run time; the words around them must agree.
        parts = re.split(r"\$\{[^}]*\}", hosted)
        assert re.fullmatch(".+?".join(re.escape(p) for p in parts), _desc(tool), re.DOTALL), tool


if __name__ == "__main__":
    if "--write-golden" in sys.argv:
        GOLDEN.write_text(json.dumps(_compute_golden(), indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
        print(f"wrote {GOLDEN}")
