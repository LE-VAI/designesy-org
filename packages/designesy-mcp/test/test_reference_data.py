"""Reference-data output, contract sections, and description claims.

Anthropic's Software Directory Policy (2F) asks that no tool output direct the
assistant to pull behavioral instructions from external sources. The document
tools now return labeled reference data and leave out any part written as
steps or a prompt for an AI agent (see _reference_text in the server). 5B asks
for token frugality and options to trim: designesy_contract takes `sections`.
2B asks that descriptions match what the tools return.

The fixtures under fixtures/published-docs/ are the published files as served
by https://www.designesy.org on 2026-10-09. expected.json is the golden output
for them. apps/site/scripts/check-mcp-tool-parity.js runs the hosted
endpoint's implementation (apps/site/app/lib/mcp-reference.ts) on the same
fixtures against the same golden, so the two servers agree by construction.
Regenerate the golden after an intended change with:

    python test/test_reference_data.py --write-golden

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
DOCS = HERE / "fixtures" / "published-docs"
GOLDEN = DOCS / "expected.json"
REPO = HERE.parents[2]
REFERENCE_TS = REPO / "apps" / "site" / "app" / "lib" / "mcp-reference.ts"

# The golden's fixed inputs. FIXTURE_RULES stands in for the contract version
# each server supplies at run time.
FIXTURE_RULES = "fixture rules"
REVIEW_CASES = [
    {},
    {"artifact": "https://example.com/", "purpose": "Book a table in two taps."},
    {"rules": "house style v2"},
]

TEXT_DOCS = {
    "llms.txt": f"{mcp.BASE_URL}/llms.txt",
    "llms-full.txt": f"{mcp.BASE_URL}/llms-full.txt",
}


def _text(name: str) -> str:
    return (DOCS / name).read_text(encoding="utf-8")


def _json(name: str):
    return json.loads((DOCS / name).read_text(encoding="utf-8"))


def _sha(value) -> str:
    """sha256 of a string, or of canonical JSON (sorted keys, no spaces)."""
    if not isinstance(value, str):
        value = json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=False)
    return hashlib.sha256(value.encode("utf-8")).hexdigest()


def _compute_golden() -> dict:
    text = {}
    for name, url in TEXT_DOCS.items():
        out = mcp._published_text(url, "text/plain", _text(name))
        text[name] = {"omitted_sections": out["omitted_sections"], "output_sha256": _sha(out)}
    agent = mcp._published_json(f"{mcp.BASE_URL}/.well-known/agent.json", _json("agent.json"))
    review = []
    for inputs in REVIEW_CASES:
        out = mcp._design_review_rubric(
            _json("design-review.json"), f"{mcp.BASE_URL}/kits/design-review.json", inputs, FIXTURE_RULES,
        )
        review.append({"inputs": inputs, "output_sha256": _sha(out)})
    return {
        "_about": (
            "Golden output of the reference-data rules for the fixtures in this folder. "
            "Checked by packages/designesy-mcp/test/test_reference_data.py and "
            "apps/site/scripts/check-mcp-tool-parity.js. Regenerate: "
            "python test/test_reference_data.py --write-golden"
        ),
        "fixture_rules": FIXTURE_RULES,
        "text": text,
        "agent_json": {"omitted_fields": agent["omitted_fields"], "output_sha256": _sha(agent)},
        "design_review": review,
    }


def _call(name: str, arguments: dict) -> dict:
    msg = {"jsonrpc": "2.0", "id": 1, "method": "tools/call", "params": {"name": name, "arguments": arguments}}
    return mcp._handle(msg)["result"]


def _fixture_fetch(url: str, as_json: bool = True):
    table = {
        f"{mcp.BASE_URL}/llms.txt": ("llms.txt", False),
        f"{mcp.BASE_URL}/llms-full.txt": ("llms-full.txt", False),
        f"{mcp.BASE_URL}/.well-known/agent.json": ("agent.json", True),
        f"{mcp.BASE_URL}/kits/design-review.json": ("design-review.json", True),
        f"{mcp.BASE_URL}/contracts/design-system.json": ("design-system.json", True),
    }
    name, is_json = table[url]
    return _json(name) if is_json else _text(name)


@pytest.fixture
def served():
    with patch.object(mcp, "_fetch", side_effect=_fixture_fetch):
        yield


# A directive the 2F rule is about, written the way an instruction reads.
DIRECTIVE_PROBES = [
    "You are working with Designesy open design intelligence.",
    "1. Fetch https://www.designesy.org/open.json as the catalog root",
    "2. Optionally fetch https://www.designesy.org/llms.txt for a short agent brief",
    "4. If machine_url is present, fetch it for structured rules",
    "- Agents: Fetch open.json, then the package machine URL, then run the kit prompt",
    "  6. For Design Review, fetch the kit prompt and run the eight dimensions.",
]

# Descriptive sentences that mention fetching and must survive.
NOT_DIRECTIVES = [
    "contracts, use kits, labs, and field checks that people and agents can fetch, run, cite, and remix.",
    "- Machine catalog (preferred ingest): https://www.designesy.org/open.json",
    "Prefer machine exports over HTML scrape when both exist",
]


# ── 1. The directive detector ────────────────────────────────────────────────


class TestDirectiveDetector:
    @pytest.mark.parametrize("text", DIRECTIVE_PROBES)
    def test_flags_agent_directives(self, text):
        assert mcp._is_agent_directive(text)

    @pytest.mark.parametrize("text", NOT_DIRECTIVES)
    def test_leaves_descriptive_text(self, text):
        assert not mcp._is_agent_directive(text)

    def test_patterns_match_the_hosted_endpoint(self):
        if not REFERENCE_TS.exists():
            pytest.skip("apps/site is not in this checkout")
        src = REFERENCE_TS.read_text(encoding="utf-8")
        block = src[src.index("AGENT_DIRECTIVE_PATTERN_SOURCES"):]
        block = block[:block.index("];")]
        ts_sources = re.findall(r"String\.raw`([^`]*)`", block)
        assert tuple(ts_sources) == mcp.AGENT_DIRECTIVE_PATTERN_SOURCES

    @pytest.mark.parametrize("const, value", [
        ("REFERENCE_NOTE", "_REFERENCE_NOTE"),
        ("RUBRIC_NOTE", "_RUBRIC_NOTE"),
        ("OMITTED_MARKER", "_OMITTED_MARKER"),
        ("KIT_PROMPT_NOTE", "_KIT_PROMPT_NOTE"),
        ("REFERENCE_KIND", "_REFERENCE_KIND"),
        ("RUBRIC_KIND", "_RUBRIC_KIND"),
    ])
    def test_strings_match_the_hosted_endpoint(self, const, value):
        if not REFERENCE_TS.exists():
            pytest.skip("apps/site is not in this checkout")
        src = REFERENCE_TS.read_text(encoding="utf-8")
        m = re.search(rf"export const {const}\s*=\s*(?:\n\s*)?(['\"])((?:(?!\1).)*)\1;", src)
        assert m, f"{const} not found in mcp-reference.ts"
        assert m.group(2) == getattr(mcp, value)


# ── 2. The four 2F tools return reference data, never a directive ────────────


def _no_directive_anywhere(text: str) -> None:
    assert not re.search(r"(?i)\byou are\b", text), "a second-person agent prompt reached tool output"
    assert not mcp._is_agent_directive(text), "an imperative fetch step reached tool output"


class TestReferenceOutputs:
    @pytest.mark.parametrize("tool, args", [
        ("designesy_llms_txt", {}),
        ("designesy_llms_full_txt", {}),
        ("designesy_agent_json", {}),
        ("designesy_design_review", {}),
        ("designesy_design_review", {"artifact": "https://example.com/", "purpose": "Book a table"}),
    ])
    def test_tool_output_carries_no_directive(self, served, tool, args):
        result = _call(tool, args)
        assert result["isError"] is False
        _no_directive_anywhere(result["content"][0]["text"])

    def test_the_fixtures_do_carry_directives(self):
        # Without this the test above could pass on files that never had any.
        for name in ("llms.txt", "llms-full.txt"):
            assert mcp._is_agent_directive(_text(name))
        assert re.search(r"You are", _text("llms-full.txt"))
        assert re.search(r"You are", (DOCS / "design-review.json").read_text(encoding="utf-8"))
        assert "fetch it for structured rules" in (DOCS / "agent.json").read_text(encoding="utf-8")

    def test_llms_txt_envelope(self, served):
        out = json.loads(_call("designesy_llms_txt", {})["content"][0]["text"])
        assert out["kind"] == "published_document"
        assert out["source_url"] == f"{mcp.BASE_URL}/llms.txt"
        assert out["media_type"] == "text/plain"
        assert out["note"] == mcp._REFERENCE_NOTE
        assert out["omitted_sections"] == ["How agents should ingest"]
        assert "## How agents should ingest\n\n" + mcp._OMITTED_MARKER in out["content"]
        # Everything else is the published text, line for line.
        kept = [l for l in _text("llms.txt").split("\n") if l not in out["content"].split("\n")]
        assert all(re.match(r"^\d\. ", l) for l in kept), kept

    def test_llms_full_txt_drops_the_prompt_and_steps_only(self, served):
        out = json.loads(_call("designesy_llms_full_txt", {})["content"][0]["text"])
        assert out["omitted_sections"] == [
            "Ingest protocol (designesy.ingest.v1)", "How to use", "Agent prompt (paste-ready)",
        ]
        for kept in ("## Authority", "## Discovery endpoints", "### Citation", "## Standing rules",
                     "## Anti-patterns", "## Contact", "Package template:"):
            assert kept in out["content"], kept

    def test_agent_json_removes_only_the_steps(self, served):
        out = json.loads(_call("designesy_agent_json", {})["content"][0]["text"])
        assert out["kind"] == "published_document"
        assert out["omitted_fields"] == ["ingest.steps"]
        published = _json("agent.json")
        assert set(out["document"]) == set(published)
        assert "steps" not in out["document"]["ingest"]
        assert out["document"]["ingest"]["protocol"] == published["ingest"]["protocol"]
        assert out["document"]["authority"] == published["authority"]

    def test_design_review_is_a_rubric_without_the_prompt(self, served):
        out = json.loads(_call("designesy_design_review", {})["content"][0]["text"])
        kit = _json("design-review.json")
        assert out["kind"] == "review_rubric"
        assert out["note"] == mcp._RUBRIC_NOTE
        assert "agent_prompt" not in out and "inputs" not in out
        assert out["dimensions"] == kit["dimensions"] and len(out["dimensions"]) == 8
        assert out["output_format"] == kit["output_format"]
        assert out["verification_checklist"] == kit["verification"]
        assert out["kit_prompt_url"] == kit["public_url"]
        assert out["omitted_fields"] == []

    def test_design_review_records_inputs_with_the_contract_version(self, served):
        out = json.loads(_call("designesy_design_review", {"artifact": "https://example.com/"})["content"][0]["text"])
        version = _json("design-system.json")["version"]
        assert out["inputs"] == {
            "artifact": "https://example.com/", "purpose": None, "context": None,
            "rules": f"designesy design system v{version}",
        }

    def test_skill_md_is_wrapped(self):
        with patch.object(mcp, "_fetch", return_value="# SKILL\n\n- Never use transition: all\n"):
            out = mcp._skill_md_impl()
        assert out["kind"] == "published_document" and out["media_type"] == "text/markdown"
        assert out["content"] == "# SKILL\n\n- Never use transition: all\n"
        assert out["omitted_sections"] == []

    def test_untitled_and_heading_directives_are_named_neutrally(self):
        # A heading that is itself a directive is dropped and named neutrally; a
        # heading over a directive body is kept. "## Fetch x" alone is no
        # directive: a heading is not a step.
        content, omitted = mcp._reference_text("You are a bot.\n\n## You are here\n\nok\n\n## Kept\n\n1. Fetch x\n")
        assert omitted == ["(untitled section)", "(untitled section)", "Kept"]
        assert "You are" not in content and "Fetch x" not in content
        assert content.split("\n").count(mcp._OMITTED_MARKER) == 3 and "## Kept" in content
        assert not mcp._is_agent_directive("## Fetch everything")


class TestGolden:
    def test_matches_the_shared_golden(self):
        assert GOLDEN.exists(), "run: python test/test_reference_data.py --write-golden"
        assert _compute_golden() == json.loads(GOLDEN.read_text(encoding="utf-8"))


# ── 3. designesy_contract sections (5B) ──────────────────────────────────────


class TestContractSections:
    def test_full_contract_by_default(self, served):
        out = json.loads(_call("designesy_contract", {})["content"][0]["text"])
        assert out == _json("design-system.json")

    def test_sections_returns_only_those_keys(self, served):
        res = _call("designesy_contract", {"sections": ["motion", "colors"]})
        assert res["isError"] is False
        out = json.loads(res["content"][0]["text"])
        full = _json("design-system.json")
        assert list(out) == ["id", "version", "motion", "colors"]
        assert out["motion"] == full["motion"] and out["colors"] == full["colors"]
        assert len(res["content"][0]["text"]) < len(json.dumps(full, indent=2)) / 4

    def test_duplicates_collapse_and_section_joins(self, served):
        out = json.loads(_call("designesy_contract", {"section": "takt", "sections": ["motion", "takt", "motion"]})["content"][0]["text"])
        assert list(out) == ["id", "version", "takt", "motion"]

    @pytest.mark.parametrize("args, unknown", [
        ({"sections": ["motion", "colour", "nope"]}, ["colour", "nope"]),
        ({"section": "nope"}, ["nope"]),
    ])
    def test_unknown_names_are_a_helpful_error(self, served, args, unknown):
        res = _call("designesy_contract", args)
        assert res["isError"] is True
        out = json.loads(res["content"][0]["text"])
        valid = list(_json("design-system.json"))
        assert out["success"] is False
        assert out["unknown_sections"] == unknown
        assert out["valid_sections"] == valid
        assert all(k in out["error"] for k in unknown + valid)

    @pytest.mark.parametrize("sections", [[], "motion", [1, 2]])
    def test_bad_sections_value_is_an_error(self, served, sections):
        res = _call("designesy_contract", {"sections": sections})
        assert res["isError"] is True
        assert json.loads(res["content"][0]["text"])["valid_sections"]

    def test_legacy_section_and_aliases_still_work(self, served):
        assert json.loads(_call("designesy_contract", {"section": "motion"})["content"][0]["text"])["section"] == "motion"
        assert json.loads(_call("designesy_contract", {"section": "tensions"})["content"][0]["text"])["section"] == "open_tensions"

    def test_schema_offers_sections_as_a_string_array(self):
        props = mcp.TOOL_MAP["designesy_contract"]["inputSchema"]["properties"]
        assert props["sections"] == {**props["sections"], "type": "array", "items": {"type": "string"}}
        assert "section" in props


# ── 4. Descriptions match what the tools return (2B) ────────────────────────


def _desc(name: str) -> str:
    return mcp.TOOL_MAP[name]["description"]


class TestDescriptionClaims:
    def test_old_size_claims_are_gone(self):
        for tool in mcp.TOOLS:
            assert not re.search(r"~\s?\d+\s*tokens|~500|~3000", tool["description"]), tool["name"]

    def test_llms_size_bands_hold_for_the_published_files(self):
        short = mcp._published_text("u", "text/plain", _text("llms.txt"))["content"]
        full = mcp._published_text("u", "text/plain", _text("llms-full.txt"))["content"]
        assert "a few thousand characters" in _desc("designesy_llms_txt")
        assert 1_000 <= len(short) < 10_000
        assert "over ten thousand" in _desc("designesy_llms_full_txt")
        assert len(full) > 10_000

    def test_contract_size_band_holds_for_the_published_contract(self):
        assert "on the order of 100 KB, tens of thousands of tokens" in _desc("designesy_contract")
        size = len(json.dumps(_json("design-system.json"), indent=2, ensure_ascii=False))
        assert 30_000 <= size < 300_000
        assert 10_000 <= size / 4 < 100_000

    def test_contract_description_names_its_cache_and_the_way_to_trim(self):
        d = _desc("designesy_contract")
        assert "24h" not in d and "5 minutes" in d and mcp.CACHE_TTL == 300
        assert "sections" in d and "lists every valid key" in d

    @pytest.mark.parametrize("tool", [
        "designesy_llms_txt", "designesy_llms_full_txt", "designesy_agent_json",
        "designesy_skill_md", "designesy_design_review",
    ])
    def test_reference_tools_document_their_envelope(self, tool):
        d = _desc(tool)
        assert "Returns JSON" in d and "kind:" in d and "source_url" in d and "note" in d
        assert "includes a paste-ready" not in d  # no longer promised as content

    def test_design_review_names_no_agent_prompt_field(self):
        d = _desc("designesy_design_review")
        assert "agent_prompt" not in d and "kit_prompt_url" in d and "dimensions[8]" in d

    @pytest.mark.parametrize("tool", ["designesy_tokens_score", "designesy_motion_score"])
    def test_scoring_shapes_drop_the_missing_valid_field(self, tool):
        d = _desc(tool)
        assert "valid," not in d and "SKIP" in d and "pass_count" in d

    def test_no_em_dashes_in_changed_descriptions(self):
        for tool in ("designesy_contract", "designesy_design_review", "designesy_skill_md",
                     "designesy_agent_json", "designesy_llms_txt", "designesy_llms_full_txt"):
            assert chr(0x2014) not in _desc(tool), tool

    def test_no_description_tells_the_assistant_to_fetch(self):
        for tool in mcp.TOOLS:
            assert not mcp._is_agent_directive(tool["description"]), tool["name"]


if __name__ == "__main__":
    if "--write-golden" in sys.argv:
        GOLDEN.write_text(json.dumps(_compute_golden(), indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
        print(f"wrote {GOLDEN}")
