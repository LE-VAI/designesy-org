"""designesy_motion_score: each check's verdict sits under its own name.

The tool used to compute ten checks of its own (required fields, version,
frame rate, dimensions, layers, in/out points, markers, deprecated layers, a
section 16 placeholder, schema) and then name them with the motion contract's
checks by array position. The contract's m01-m10 are different checks, so on
{"v":"5.7.4","fr":30,"ip":0,"op":60,"w":100,"h":100,"nm":"dot","layers":[]}
"meta object present" FAILed with the detail "layers: 0", "markers array
present" PASSed with "w: 100, h: 100", and m09 listed the ten standards as
", , , , , , , , , ." (it read fields the contract does not have).

Each check now computes its own verdict under its own id and the contract's
name for that id. The fixtures in fixtures/motion/ are small hand-written
Lottie files; contract.json is the motion contract the site serves
(apps/site/app/lib/motion-contract.ts). expected.json is the golden output for
them. apps/site/scripts/check-mcp-tool-parity.js runs the hosted endpoint's
implementation (apps/site/app/lib/motion-score.ts) on the same fixtures and
checks it against the same golden, and checks contract.json against the
contract module. Regenerate the golden after an intended change with:

    python test/test_motion_score.py --write-golden

Network calls are mocked; nothing here reaches the network.
"""

from __future__ import annotations

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
FIXTURES = HERE / "fixtures" / "motion"
GOLDEN = FIXTURES / "expected.json"
CONTRACT = json.loads((FIXTURES / "contract.json").read_text(encoding="utf-8"))
LOTTIES = sorted(p.name for p in FIXTURES.glob("*.json") if p.name not in ("contract.json", "expected.json"))
INLINE = "(inline lottie_file)"

# What each check is about. Every detail names its own subject.
SUBJECTS = {
    "m01": r"schema",
    "m02": r"required fields",
    "m03": r"bodymovin version",
    "m04": r"markers",
    "m05": r"meta",
    "m06": r"reduced[- ]motion",
    "m07": r"easing",
    "m08": r"duration",
    "m09": r"layout",
    "m10": r"keyboard",
}


def _lottie(name: str) -> str:
    return (FIXTURES / name).read_text(encoding="utf-8")


def _score(name: str) -> dict:
    return mcp._motion_score(json.loads(_lottie(name)), CONTRACT, INLINE)


def _by_id(result: dict) -> dict:
    return {c["id"]: c for c in result["checks"]}


def _compute_golden() -> dict:
    return {name: _score(name) for name in LOTTIES}


def _call(args: dict) -> dict:
    """tools/call through the server's own JSON-RPC handler, the contract fetch mocked."""
    with patch.object(mcp, "_fetch", lambda url, as_json=True: CONTRACT):
        msg = mcp._handle({"jsonrpc": "2.0", "id": 1, "method": "tools/call",
                           "params": {"name": "designesy_motion_score", "arguments": args}})
    return msg["result"]


class TestGolden:
    def test_fixtures_exist(self):
        assert len(LOTTIES) >= 5 and "dot-no-markers.json" in LOTTIES

    @pytest.mark.parametrize("name", LOTTIES)
    def test_output_matches_the_golden(self, name):
        golden = json.loads(GOLDEN.read_text(encoding="utf-8"))
        assert _score(name) == golden[name]

    def test_golden_covers_exactly_the_fixtures(self):
        assert sorted(json.loads(GOLDEN.read_text(encoding="utf-8"))) == LOTTIES

    def test_the_tool_returns_the_scorer_output(self):
        res = _call({"lottie_file": _lottie("dot-no-markers.json")})
        assert res["isError"] is False
        assert json.loads(res["content"][0]["text"]) == _score("dot-no-markers.json")


class TestNamesAndVerdicts:
    @pytest.mark.parametrize("name", LOTTIES)
    def test_ten_checks_in_order_named_by_the_contract_id(self, name):
        items = {c["id"]: c["item"] for c in CONTRACT["verification"]["checks"]}
        checks = _score(name)["checks"]
        assert [c["id"] for c in checks] == [f"m{i:02d}" for i in range(1, 11)]
        for c in checks:
            assert c["name"] == items[c["id"]], c["id"]

    @pytest.mark.parametrize("name", LOTTIES)
    def test_every_detail_names_its_own_subject(self, name):
        for c in _score(name)["checks"]:
            assert re.search(SUBJECTS[c["id"]], c["detail"], re.IGNORECASE), (c["id"], c["detail"])

    def test_no_markers_fails_the_markers_check(self):
        for name in ("dot-no-markers.json", "broken.json", "slot-hold-no-version.json"):
            c = _by_id(_score(name))["m04"]
            assert c["name"].startswith("markers array present")
            assert c["status"] in ("FAIL", "WARN")
            assert "markers" in c["detail"]

    def test_zero_layers_is_flagged_by_the_check_that_covers_layers(self):
        res = _score("dot-no-markers.json")
        c = _by_id(res)["m02"]
        assert "layers" in c["name"] and c["status"] == "WARN"
        assert "layers is empty" in c["detail"]
        assert res["layer_count"] == 0
        assert _by_id(res)["m07"]["status"] == "SKIP" and "0 layers" in _by_id(res)["m07"]["detail"]

    def test_meta_present_passes_the_meta_check(self):
        for name in ("conformant.json", "rejected-curves.json", "slot-hold-no-version.json"):
            c = _by_id(_score(name))["m05"]
            assert c["name"].startswith("meta object present") and c["status"] == "PASS"
        assert _by_id(_score("dot-no-markers.json"))["m05"]["status"] == "WARN"

    def test_the_reported_dot_now_reads_right(self):
        # The file from the report: each verdict under its own check.
        got = {cid: c["status"] for cid, c in _by_id(_score("dot-no-markers.json")).items()}
        assert got == {
            "m01": "SKIP", "m02": "WARN", "m03": "PASS", "m04": "FAIL", "m05": "WARN",
            "m06": "FAIL", "m07": "SKIP", "m08": "WARN", "m09": "SKIP", "m10": "SKIP",
        }

    def test_a_conformant_file_passes_everything_it_can_show(self):
        res = _score("conformant.json")
        assert res["fail_count"] == 0 and res["warn_count"] == 0
        assert res["score"] == 100 and res["grade"] == "A"
        assert {c["id"] for c in res["checks"] if c["status"] == "SKIP"} == {"m01", "m09", "m10"}

    def test_easing_counts_linear_ease_and_ease_in(self):
        c = _by_id(_score("rejected-curves.json"))["m07"]
        assert c["status"] == "FAIL"
        assert "3 of 4 eased keyframes use" in c["detail"]
        assert "(1 linear, 1 ease, 1 ease-in)" in c["detail"]
        # A hold keyframe is not eased; a second dimension on the diagonal is linear.
        c = _by_id(_score("slot-hold-no-version.json"))["m07"]
        assert c["status"] == "FAIL" and "1 of 1 eased keyframe uses" in c["detail"] and "1 linear" in c["detail"]

    def test_schema_violations_are_named(self):
        c = _by_id(_score("broken.json"))["m01"]
        assert c["status"] == "FAIL"
        for part in ("ip is missing", "w must be an integer", "fr must be a number above 0",
                     "1 layer is not an object", "markers must be an array", "slots must be an object"):
            assert part in c["detail"], part
        assert mcp.LOTTIE_SCHEMA_URL in c["detail"]

    def test_a_clean_top_level_is_not_reported_as_a_full_schema_pass(self):
        for name in ("dot-no-markers.json", "conformant.json"):
            c = _by_id(_score(name))["m01"]
            assert c["status"] == "SKIP" and "not a full schema pass" in c["detail"]

    def test_reduced_motion_paths(self):
        assert _by_id(_score("conformant.json"))["m06"]["status"] == "PASS"  # marker "reduced"
        assert _by_id(_score("slot-hold-no-version.json"))["m06"]["status"] == "PASS"  # slot
        assert _by_id(_score("rejected-curves.json"))["m06"]["status"] == "WARN"  # meta notes a wrapper
        assert _by_id(_score("dot-no-markers.json"))["m06"]["status"] == "FAIL"

    def test_deprecated_version_and_missing_version(self):
        assert _by_id(_score("broken.json"))["m03"]["status"] == "FAIL"
        c = _by_id(_score("slot-hold-no-version.json"))["m03"]
        assert c["status"] == "SKIP" and "no v field" in c["detail"]

    def test_duration_bound(self):
        assert "300 ms (18 frames at 60 fps)" in _by_id(_score("conformant.json"))["m08"]["detail"]
        assert _by_id(_score("conformant.json"))["m08"]["status"] == "PASS"
        assert _by_id(_score("dot-no-markers.json"))["m08"]["status"] == "WARN"
        assert _by_id(_score("broken.json"))["m08"]["status"] == "SKIP"

    def test_standards_are_read_from_the_contract_fields(self):
        by_num = {s["num"]: s["rule"] for s in CONTRACT["conformance"]["ten_non_negotiable"]}
        checks = _by_id(_score("dot-no-markers.json"))
        assert f"§16.5 ({by_num[5]})" in checks["m09"]["detail"]
        assert f"§16.4 ({by_num[4]})" in checks["m10"]["detail"]
        assert f"§16.7 ({by_num[7]})" in checks["m08"]["detail"]
        for c in checks.values():
            assert ", , " not in c["detail"]

    def test_score_follows_the_contract_weights(self):
        res = _score("rejected-curves.json")  # 4 PASS, 2 WARN, 1 FAIL, 3 SKIP
        assert (res["pass_count"], res["warn_count"], res["fail_count"], res["skip_count"]) == (4, 2, 1, 3)
        assert res["score"] == 71  # (4 + 2 x 0.5) / 7 = 71.4
        assert res["grade"] == "C"


class TestToolEdges:
    def test_not_an_object(self):
        res = _call({"lottie_file": "[1, 2]"})
        assert res["isError"] is True
        assert json.loads(res["content"][0]["text"])["error"] == "Lottie file is not a JSON object"

    @pytest.mark.parametrize("bad", ["{", '{"fr": NaN}'])
    def test_invalid_json(self, bad):
        res = _call({"lottie_file": bad})
        assert res["isError"] is True
        assert "Invalid JSON" in json.loads(res["content"][0]["text"])["error"]

    def test_no_input(self):
        res = _call({})
        assert res["isError"] is True

    def test_validator_note_points_at_a_schema_that_exists(self):
        res = _score("conformant.json")
        assert "lottie.github.io/lottie-spec/1.0.1/lottie.schema.json" in res["validator_note"]
        assert "specs/schema/lottie.schema.json" not in json.dumps(res)  # the old URL is a 404

    def test_description_matches_the_output(self):
        d = next(t for t in mcp.TOOLS if t["name"] == "designesy_motion_score")["description"]
        out = _score("conformant.json")
        for key in out:
            assert key in d, key
        assert "SKIP is not scored" in d and "WARN=0.5" in d
        assert "$version" not in d  # the file has no $version; that is the schema's
        assert "the only validator" not in d


if __name__ == "__main__":
    if "--write-golden" in sys.argv:
        GOLDEN.write_text(json.dumps(_compute_golden(), indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
        print(f"wrote {GOLDEN}")
