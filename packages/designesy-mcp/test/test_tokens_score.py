"""designesy_tokens_score: SKIP is not scored, and both servers return the same result.

The tool scored PASS / all ten checks x 100, so a check that could not apply
counted as a zero: a clean file with no custom types (t07 SKIP) scored 90, not
100, while designesy_motion_score states "SKIP is not scored" and the score
engine leaves MANUAL out. The score is now PASS / scored checks x 100 (WARN
and FAIL still count 0), and the result states the rule in `scoring` and
counts SKIPs in `skip_count`, as the motion tool does.

The ten checks now live in one module on each server: apps/site/app/lib/
tokens-score.ts (the hosted endpoint) and _tokens_score here, a line-for-line
port. Both run on the token files in fixtures/tokens/ and must produce
expected.json there; contract.json is the tokens contract the site serves
(apps/site/app/lib/tokens-contract.ts). This suite checks the Python output,
apps/site/scripts/check-mcp-tool-parity.js checks the TypeScript output and
that contract.json is the served contract. Regenerate the golden after an
intended change with:

    python test/test_tokens_score.py --write-golden

Network calls are mocked; nothing here reaches the network.
"""

from __future__ import annotations

import json
import os
import sys
from pathlib import Path
from unittest.mock import patch

import pytest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

import designesy_mcp_server as mcp  # noqa: E402

HERE = Path(__file__).resolve().parent
FIXTURES = HERE / "fixtures" / "tokens"
GOLDEN = FIXTURES / "expected.json"
INLINE = "(inline dtcg_file)"


def _token_files() -> list[str]:
    return sorted(p.name for p in FIXTURES.glob("*.json") if p.name not in ("contract.json", "expected.json"))


def _contract() -> dict:
    return json.loads((FIXTURES / "contract.json").read_text(encoding="utf-8"))


# A clean DTCG 2025.10 file with no custom types: t07 has nothing to check.
NINE_PASS_ONE_SKIP = {
    "$schema": "https://www.designtokens.org/schemas/2025.10/format.json",
    "color": {"ink": {"$type": "color", "$value": {"colorSpace": "srgb", "components": [0.96, 0.96, 0.97], "alpha": 1}}},
    "space": {"md": {"$type": "dimension", "$value": "16px"}},
}

# The tokens contract as the site serves it, cut to what the tool reads.
CONTRACT_STUB = {
    "id": "designesy.tokens",
    "version": "0.1.1",
    "status": "provisional",
    "verification": {"checks": [{"id": f"t{i:02d}", "item": f"contract name {i}"} for i in range(1, 11)]},
}


def _score_inline(doc: dict, contract: dict = CONTRACT_STUB) -> dict:
    with patch.object(mcp, "_fetch", return_value=contract):
        return mcp._tokens_score_impl(dtcg_file=json.dumps(doc))


class TestScoring:
    def test_skip_is_not_scored(self):
        """Old verdict: 90 (the SKIP counted as a zero in a /10 denominator)."""
        result = _score_inline(NINE_PASS_ONE_SKIP)
        statuses = {c["id"]: c["status"] for c in result["checks"]}
        assert statuses["t07"] == "SKIP"
        assert sum(s == "PASS" for s in statuses.values()) == 9
        assert result["score"] == 100, statuses
        assert result["grade"] == "A"

    def test_skip_count_and_scoring_rule_are_reported(self):
        result = _score_inline(NINE_PASS_ONE_SKIP)
        assert result["skip_count"] == 1
        assert "SKIP is not scored" in result["scoring"]
        assert "WARN=0" in result["scoring"]

    def test_warn_and_fail_still_count_zero(self):
        """Only PASS earns a point; the denominator is the checks that ran."""
        doc = {
            "$schema": "https://www.designtokens.org/schemas/2025.10/format.json",
            "color": {"ink": {"$type": "color", "$value": "#ffffff"}},
        }
        result = _score_inline(doc)
        counts = {s: sum(c["status"] == s for c in result["checks"]) for s in ("PASS", "WARN", "FAIL", "SKIP")}
        scored = counts["PASS"] + counts["WARN"] + counts["FAIL"]
        assert counts["FAIL"] >= 1 and counts["SKIP"] >= 1
        assert result["score"] == round(counts["PASS"] / scored * 100)
        assert result["skip_count"] == counts["SKIP"]

    def test_description_states_the_rule(self):
        desc = mcp.TOOL_MAP["designesy_tokens_score"]["description"]
        assert "SKIP is not scored" in desc
        assert "skip_count" in desc and "scoring" in desc

    def test_names_come_from_the_contract_by_id(self):
        result = _score_inline(NINE_PASS_ONE_SKIP)
        for c in result["checks"]:
            assert c["name"] == f"contract name {int(c['id'][1:])}", c


class TestGolden:
    def test_fixtures_exist(self):
        names = _token_files()
        assert len(names) >= 6 and "guardrails-emitted.json" in names and "site-export.json" in names

    def test_golden_covers_exactly_the_fixtures(self):
        assert sorted(json.loads(GOLDEN.read_text(encoding="utf-8"))) == _token_files()

    @pytest.mark.parametrize("name", sorted(p.name for p in FIXTURES.glob("*.json") if p.name not in ("contract.json", "expected.json")))
    def test_output_matches_the_golden(self, name):
        golden = json.loads(GOLDEN.read_text(encoding="utf-8"))
        doc = json.loads((FIXTURES / name).read_text(encoding="utf-8"))
        assert mcp._tokens_score(doc, _contract(), INLINE) == golden[name]

    def test_the_guardrails_file_has_no_fail(self):
        """The DTCG file designesy_guardrails emits passes this validator."""
        golden = json.loads(GOLDEN.read_text(encoding="utf-8"))["guardrails-emitted.json"]
        assert golden["fail_count"] == 0, [c for c in golden["checks"] if c["status"] == "FAIL"]

    def test_the_tool_returns_the_scorer_output(self):
        doc = json.loads((FIXTURES / "valid.json").read_text(encoding="utf-8"))
        with patch.object(mcp, "_fetch", lambda url, as_json=True: _contract()):
            msg = mcp._handle({"jsonrpc": "2.0", "id": 1, "method": "tools/call",
                               "params": {"name": "designesy_tokens_score", "arguments": {"dtcg_file": json.dumps(doc)}}})
        res = msg["result"]
        assert res["isError"] is False
        assert json.loads(res["content"][0]["text"]) == mcp._tokens_score(doc, _contract(), INLINE)

    def test_names_are_the_contract_items(self):
        items = {c["id"]: c["item"] for c in _contract()["verification"]["checks"]}
        doc = json.loads((FIXTURES / "valid.json").read_text(encoding="utf-8"))
        for c in mcp._tokens_score(doc, _contract(), INLINE)["checks"]:
            assert c["name"] == items[c["id"]]


def _write_golden() -> None:
    contract = _contract()
    golden = {
        name: mcp._tokens_score(json.loads((FIXTURES / name).read_text(encoding="utf-8")), contract, INLINE)
        for name in _token_files()
    }
    GOLDEN.write_text(json.dumps(golden, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print(f"wrote {GOLDEN} ({len(golden)} file(s))")


if __name__ == "__main__":
    if "--write-golden" in sys.argv:
        _write_golden()
    else:
        sys.exit(pytest.main([__file__, "-q"]))
