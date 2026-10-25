"""designesy_tokens_score: SKIP is not scored, a WARN counts half, an alias is a
reference, and both servers return the same result.

The tool scored PASS / all ten checks x 100, so a check that could not apply
counted as a zero: a clean file with no custom types (t07 SKIP) scored 90, not
100, while designesy_motion_score states "SKIP is not scored" and the score
engine leaves MANUAL out. The score is now PASS / scored checks x 100 (WARN
and FAIL still count 0), and the result states the rule in `scoring` and
counts SKIPs in `skip_count`, as the motion tool does.

1.13.8 (tokens contract 0.1.2): a WARN counts half, as in the motion tool, the
score engine and the npm @designesy/tokens validator (it counted zero); a
{group.token} alias on a dimension token is checked by the value it resolves to
(it was read as a literal with no unit, a WARN in t08 and t10); a $root token
is checked like any other (it was skipped); and the 2025.10 dimension form
{value, unit} is read by t08 (it was not). The site's /export/dtcg is held to
DTCG values: no var(), dimensions as {value, unit}, font stacks as arrays.

Tokens contract 0.1.3: a token's type is its own $type, else the type of the
token it references, else the closest group $type above it, a group's $extends
included (only a $type on the token counted, so a conformant file that typed
its groups FAILed t03 and t06); a {$type, $ref} token is counted and a JSON
Pointer $ref is not a deprecated pattern; the whole file is walked (a
top-level group named tokens or $tokens was scored alone); a missing $schema
WARNs as Designesy policy (it FAILed); t08 expects {value, unit} in px or rem
and reports a string such as "16px" as the legacy form; and with no tokens t03
SKIPs, as t06 does.

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
import time
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
    "space": {"md": {"$type": "dimension", "$value": {"value": 16, "unit": "px"}}},
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
        assert "WARN=0.5" in result["scoring"]

    def test_warn_counts_half_and_fail_zero(self):
        """PASS earns 1, WARN 0.5, FAIL 0; the denominator is the checks that ran."""
        doc = {
            "$schema": "https://www.designtokens.org/schemas/2025.10/format.json",
            "color": {"ink": {"$type": "color", "$value": "#ffffff"}},
        }
        result = _score_inline(doc)
        counts = {s: sum(c["status"] == s for c in result["checks"]) for s in ("PASS", "WARN", "FAIL", "SKIP")}
        scored = counts["PASS"] + counts["WARN"] + counts["FAIL"]
        assert counts["FAIL"] >= 1 and counts["WARN"] >= 1 and counts["SKIP"] >= 1
        assert result["score"] == round((counts["PASS"] + counts["WARN"] * 0.5) / scored * 100)
        assert result["skip_count"] == counts["SKIP"]

    def test_one_warn_scores_half_a_check(self):
        """Old verdict: 89 (one WARN in nine scored checks earned nothing: 8/9).

        The schema points somewhere other than designtokens.org, so t01 WARNs;
        the other eight scored checks pass and t07 SKIPs: (8 + 0.5) / 9 = 94.
        """
        doc = dict(NINE_PASS_ONE_SKIP, **{"$schema": "https://example.com/tokens.schema.json"})
        result = _score_inline(doc)
        statuses = {c["id"]: c["status"] for c in result["checks"]}
        assert statuses["t01"] == "WARN" and result["warn_count"] == 1, statuses
        assert result["pass_count"] == 8 and result["skip_count"] == 1, statuses
        assert result["score"] == 94, statuses
        assert result["grade"] == "A"

    def test_the_rule_is_the_motion_tools_rule(self):
        """designesy_motion_score states the same scoring line; the two must not drift."""
        assert mcp.TOKENS_SCORING.startswith("PASS=1, WARN=0.5, FAIL=0; SKIP is not scored.")
        source = Path(mcp.__file__).read_text(encoding="utf-8")
        assert f'"scoring": "{mcp.TOKENS_SCORING}"' in source, "the motion tool states a different scoring rule"

    def test_description_states_the_rule(self):
        desc = mcp.TOOL_MAP["designesy_tokens_score"]["description"]
        assert "SKIP is not scored" in desc
        assert "PASS=1, WARN=0.5, FAIL=0" in desc
        assert "WARN=0," not in desc
        assert "skip_count" in desc and "scoring" in desc

    def test_names_come_from_the_contract_by_id(self):
        result = _score_inline(NINE_PASS_ONE_SKIP)
        for c in result["checks"]:
            assert c["name"] == f"contract name {int(c['id'][1:])}", c


def _check(result: dict, cid: str) -> dict:
    return next(c for c in result["checks"] if c["id"] == cid)


class TestAliases:
    """A {group.token} alias is a reference, not a literal value."""

    def _doc(self, space: dict) -> dict:
        return {"$schema": "https://www.designtokens.org/schemas/2025.10/format.json", "space": space}

    def test_a_dimension_alias_is_checked_by_its_target(self):
        """Old verdict: t08 WARN and t10 WARN ('{space.16}' has no unit)."""
        result = _score_inline(self._doc({
            "16": {"$type": "dimension", "$value": {"value": 16, "unit": "px"}},
            "md": {"$type": "dimension", "$value": "{space.16}"},
        }))
        assert _check(result, "t08")["status"] == "PASS", _check(result, "t08")
        assert _check(result, "t10")["status"] == "PASS", _check(result, "t10")
        assert result["warn_count"] == 0 and result["score"] == 100

    def test_an_alias_chain_resolves(self):
        result = _score_inline(self._doc({
            "base": {"$type": "dimension", "$value": {"value": 4, "unit": "px"}},
            "md": {"$type": "dimension", "$value": "{space.base}"},
            "gutter": {"$type": "dimension", "$value": "{space.md}"},
        }))
        assert _check(result, "t08")["status"] == "PASS", _check(result, "t08")

    def test_an_unresolved_alias_is_named_as_such(self):
        result = _score_inline(self._doc({
            "sm": {"$type": "dimension", "$value": {"value": 8, "unit": "px"}},
            "md": {"$type": "dimension", "$value": "{space.missing}"},
        }))
        t08 = _check(result, "t08")
        assert t08["status"] == "WARN", t08
        assert "space.md='{space.missing} (unresolved alias)'" in t08["detail"], t08
        # An alias is not a deprecated pattern, resolved or not.
        assert _check(result, "t10")["status"] == "PASS", _check(result, "t10")

    def test_an_alias_loop_does_not_resolve(self):
        result = _score_inline(self._doc({
            "a": {"$type": "dimension", "$value": "{space.b}"},
            "b": {"$type": "dimension", "$value": "{space.a}"},
        }))
        t08 = _check(result, "t08")
        assert t08["status"] == "FAIL" and "unresolved alias" in t08["detail"], t08

    def test_the_object_dimension_form_is_checked(self):
        """2025.10's {value, unit} form: a valid unit passes, any other is named."""
        good = _score_inline(self._doc({"md": {"$type": "dimension", "$value": {"value": 16, "unit": "px"}}}))
        assert _check(good, "t08")["status"] == "PASS", _check(good, "t08")
        bad = _score_inline(self._doc({
            "md": {"$type": "dimension", "$value": {"value": 16, "unit": "px"}},
            "odd": {"$type": "dimension", "$value": {"value": 2, "unit": "furlong"}},
        }))
        t08 = _check(bad, "t08")
        assert t08["status"] == "WARN", t08
        assert "space.odd='{value: 2, unit: furlong}'" in t08["detail"], t08

    def test_root_tokens_are_checked(self):
        """Old verdict: a $root token was skipped, so it counted nowhere."""
        result = _score_inline(self._doc({
            "$root": {"$type": "dimension", "$value": "4"},
            "md": {"$type": "dimension", "$value": "16px"},
        }))
        assert result["total_tokens"] == 2, result
        assert "space.$root='4'" in _check(result, "t08")["detail"], _check(result, "t08")

    def test_an_alias_may_name_a_root_token(self):
        result = _score_inline(self._doc({
            "$root": {"$type": "dimension", "$value": {"value": 4, "unit": "px"}},
            "base": {"$type": "dimension", "$value": "{space.$root}"},
        }))
        assert result["total_tokens"] == 2
        assert _check(result, "t08")["status"] == "PASS", _check(result, "t08")


SCHEMA = "https://www.designtokens.org/schemas/2025.10/format.json"
BLUE = {"colorSpace": "srgb", "components": [0, 0.4, 0.8], "alpha": 1}
PX = {"value": 8, "unit": "px"}


def _dim(value) -> dict:
    return {"$type": "dimension", "$value": value}


class TestFormatModuleReading:
    """Tokens contract 0.1.3: the checks read a file as DTCG 2025.10 does."""

    def test_a_group_type_is_inherited(self):
        """Old verdict: t03 FAIL (0/2), t06 FAIL, t05 SKIP; score 71."""
        result = _score_inline({"$schema": SCHEMA, "color": {
            "$type": "color",
            "ink": {"$value": BLUE},
            "deep": {"nested": {"accent": {"$value": BLUE}}},
        }})
        assert _check(result, "t03")["status"] == "PASS", _check(result, "t03")
        assert _check(result, "t03")["detail"] == "2/2 tokens have $type (direct or inherited)"
        assert _check(result, "t06")["status"] == "PASS", _check(result, "t06")
        # t05 runs on inherited colours.
        assert _check(result, "t05")["detail"].startswith("2 structured, 0 bare hex"), _check(result, "t05")
        assert result["score"] == 100

    def test_extends_gives_a_group_the_extended_groups_type(self):
        """Old verdict: t03 FAIL, 0/3 (every type here comes from a group)."""
        result = _score_inline({"$schema": SCHEMA,
                                "base": {"$type": "color", "a": {"$value": BLUE}},
                                "curly": {"$extends": "{base}", "b": {"$value": BLUE}},
                                "pointer": {"$extends": "#/base", "c": {"$value": BLUE}}})
        assert _check(result, "t03")["detail"] == "3/3 tokens have $type (direct or inherited)", _check(result, "t03")

    def test_an_untyped_alias_takes_its_targets_type(self):
        """Old verdict: t03 FAIL; semantic.gutter was not checked by t08."""
        result = _score_inline({"$schema": SCHEMA,
                                "space": {"$type": "dimension", "md": {"$value": PX}},
                                "semantic": {"gutter": {"$value": "{space.md}"}}})
        assert _check(result, "t03")["status"] == "PASS", _check(result, "t03")
        assert _check(result, "t08")["detail"].startswith("All 2 dimension token(s)"), _check(result, "t08")

    def test_a_json_pointer_ref_token_is_a_token(self):
        """Old verdict: total_tokens 1 (each {$type, $ref} token was read as a group)."""
        result = _score_inline({"$schema": SCHEMA,
                                "color": {"$type": "color", "blue": {"$value": BLUE}},
                                "semantic": {
                                    "primary": {"$type": "color", "$ref": "#/color/blue/$value"},
                                    "accent": {"$ref": "#/color/blue/$value"},
                                    "hue": {"$type": "number", "$ref": "#/color/blue/$value/components/0"},
                                }})
        assert result["total_tokens"] == 4, result
        assert _check(result, "t03")["status"] == "PASS", _check(result, "t03")
        assert _check(result, "t04")["detail"] == "4/4 tokens have one $value or $ref"
        # A JSON Pointer $ref is what the format asks tools to support.
        assert _check(result, "t10")["status"] == "PASS", _check(result, "t10")

    def test_the_whole_file_is_walked(self):
        """Old verdict: only the top-level group named tokens was scored (1 token)."""
        result = _score_inline({"$schema": SCHEMA,
                                "tokens": {"ink": {"$type": "color", "$value": BLUE}},
                                "space": {"md": {"$type": "dimension", "$value": 16}}})
        assert result["total_tokens"] == 2, result
        assert _check(result, "t02")["detail"] == "2 token groups found: tokens, space"
        assert _check(result, "t08")["status"] == "FAIL", _check(result, "t08")
        # $tokens is a property, not a group: a file wrapped in it has no tokens.
        wrapped = _score_inline({"$schema": SCHEMA, "$tokens": {"color": {"ink": {"$type": "color", "$value": BLUE}}}})
        assert wrapped["total_tokens"] == 0

    def test_a_missing_schema_warns_as_designesy_policy(self):
        """Old verdict: t01 FAIL, "DTCG 2025.10 requires $schema"."""
        doc = {k: v for k, v in NINE_PASS_ONE_SKIP.items() if k != "$schema"}
        t01 = _check(_score_inline(doc), "t01")
        assert t01["status"] == "WARN", t01
        assert "Designesy policy, not a DTCG requirement" in t01["detail"]
        assert "requires" not in t01["detail"]

    def test_t08_expects_the_object_form_in_px_or_rem(self):
        """Old verdict: "16px" and {value: 2, unit: em} passed t08."""
        result = _score_inline({"$schema": SCHEMA, "space": {
            "sm": _dim(PX),
            "md": _dim("16px"),
            "gutter": _dim("{space.md}"),
            "wide": _dim({"value": 2, "unit": "em"}),
        }})
        t08 = _check(result, "t08")
        assert t08["status"] == "WARN", t08
        assert t08["detail"] == (
            "3/4 dimension token(s) are not { value, unit } in px or rem: "
            "space.md='16px' (legacy string), space.gutter='{space.md} -> 16px' (legacy string), "
            "space.wide='{value: 2, unit: em}'"
        )
        assert "uses the pre-2025.10 string form: '16px'" in _check(result, "t10")["detail"]

    def test_t10_advice_leads_to_a_t08_pass(self):
        """Old verdict: "2em" was told to write { value, unit }, which FAILs t08
        in em, and a bare number to "include unit string", the legacy form
        that t08 and t10 report."""
        result = _score_inline({"$schema": SCHEMA, "space": {"md": _dim("16px"), "em": _dim("2em"), "n": _dim(4)}})
        t10 = _check(result, "t10")["detail"]
        assert "'16px' (write { value, unit })" in t10, t10
        assert "'2em' (a 2025.10 dimension takes px or rem)" in t10, t10
        assert "'space.n' uses bare number (write { value, unit } in px or rem)" in t10, t10

    def test_t08_legacy_strings_alone_warn(self):
        """Old verdict: t08 PASS. A legacy string is a WARN, never a FAIL."""
        result = _score_inline({"$schema": SCHEMA, "space": {"md": _dim("16px")}})
        assert _check(result, "t08")["status"] == "WARN", _check(result, "t08")

    def test_t03_skips_a_file_with_no_tokens(self):
        """Old verdict: t03 FAIL, "0/0 tokens have $type" (an empty group is valid DTCG)."""
        result = _score_inline({"$schema": SCHEMA, "empty": {}})
        assert _check(result, "t03") == {"id": "t03", "name": "contract name 3", "status": "SKIP", "detail": "No tokens found"}

    def test_the_dtcg_fixtures_have_no_type_failure(self):
        """Scored here, not read from the golden, so the scorer is what is tested."""
        for name in ("type-inheritance.json", "json-pointer-ref.json", "empty-group.json"):
            result = mcp._tokens_score(json.loads((FIXTURES / name).read_text(encoding="utf-8")), _contract(), INLINE)
            statuses = {c["id"]: c["status"] for c in result["checks"]}
            assert statuses["t03"] != "FAIL" and statuses["t06"] != "FAIL", (name, statuses)
            if name == "type-inheritance.json":
                assert result["score"] == 100


class TestRefTargets:
    """t04: a token has one value, a $value or a $ref, and a JSON Pointer $ref
    names a location in the file (7.5.1) without looping (7.2.3).

    Old verdict (contract 0.1.3 as first written): every case below that
    FAILs t04 passed it, and t10 too. Main read a $ref-only token as a group,
    so it was not counted at all.
    """

    def _doc(self, group: dict) -> dict:
        return {"$schema": SCHEMA, "c": {"$type": "color", "blue": {"$value": BLUE}, **group}}

    def _t04(self, group: dict) -> dict:
        return _check(_score_inline(self._doc(group)), "t04")

    def test_a_pointer_that_names_nothing_fails(self):
        t04 = self._t04({"x": {"$ref": "#/does/not/exist"}})
        assert t04["status"] == "FAIL", t04
        assert t04["detail"] == ("1/2 tokens have one $value or $ref: Token 'c.x' has a $ref "
                                 "that names no location in the file: '#/does/not/exist'")

    def test_a_pointer_to_itself_loops(self):
        for ref in ("#/c/x", "#/c/x/$value"):
            t04 = self._t04({"x": {"$ref": ref}})
            assert t04["status"] == "FAIL" and f"Token 'c.x' has a $ref that loops: '{ref}'" in t04["detail"], t04

    def test_a_pointer_loop_through_two_tokens(self):
        t04 = self._t04({"x": {"$ref": "#/c/y/$value"}, "y": {"$ref": "#/c/x/$value"}})
        assert t04["detail"].startswith("1/3 tokens have one $value or $ref: "), t04

    def test_a_pointer_reads_arrays_escapes_and_ref_tokens(self):
        """Array items by index; ~1 is / and ~0 is ~ (RFC 6901); a pointer
        through a $ref token's $value follows that $ref (7.2.2)."""
        t04 = self._t04({
            "a/b": {"$value": BLUE},
            "m~n": {"$value": BLUE},
            "hue": {"$type": "number", "$ref": "#/c/blue/$value/components/2"},
            "slash": {"$ref": "#/c/a~1b/$value"},
            "tilde": {"$ref": "#/c/m~0n/$value"},
            "chained": {"$ref": "#/c/slash/$value"},
            "chained-part": {"$type": "number", "$ref": "#/c/chained/$value/components/0"},
        })
        assert t04["status"] == "PASS", t04
        for ref in ("#/c/blue/$value/components/3", "#/c/blue/$value/components/01", "#/c/blue/$value/"):
            t04 = self._t04({"x": {"$type": "number", "$ref": ref}})
            assert t04["status"] == "FAIL", (ref, t04)

    def test_a_ref_that_is_not_a_pointer_is_reported_once_in_t10(self):
        result = _score_inline(self._doc({"x": {"$ref": "c.blue"}}))
        assert _check(result, "t04")["status"] == "PASS", _check(result, "t04")
        assert "has a $ref that is not a JSON Pointer: 'c.blue'" in _check(result, "t10")["detail"]


def _long_chain(kind: str, n: int) -> dict:
    """A file whose n tokens (or n groups) each reference the one before."""
    if kind == "extends":
        doc = {"$schema": SCHEMA, "g0": {"$type": "color", "t": {"$value": BLUE}}}
        for i in range(1, n):
            doc[f"g{i}"] = {"$extends": "{g%d}" % (i - 1), "t": {"$value": BLUE}}
        return doc
    if kind == "dimension":
        group = {"$type": "dimension", "t0": {"$value": PX}}
        for i in range(1, n):
            group[f"t{i}"] = {"$value": "{g.t%d}" % (i - 1)}
        return {"$schema": SCHEMA, "g": group}
    group = {"$type": "color", "t0": {"$value": BLUE}}
    for i in range(1, n):
        group[f"t{i}"] = {"$value": "{g.t%d}" % (i - 1)} if kind == "alias" else {"$ref": "#/g/t%d/$value" % (i - 1)}
    return {"$schema": SCHEMA, "g": group}


class TestLongChains:
    """A chain of references is followed once, in a loop.

    Old verdict (contract 0.1.3 as first written): the type of each token was
    found by following its chain again, by recursion, so 1,200 chained aliases
    raised RecursionError here (the tool call failed), and a 5,000-token chain
    took about 10 to 20 seconds in the hosted port or ran out of stack.
    Chained references are valid DTCG (7.2.2).
    """

    N = 5000
    BUDGET_MS = 1000.0

    @pytest.mark.parametrize("kind", ["alias", "pointer", "dimension", "extends"])
    def test_a_long_chain_scores_in_one_pass(self, kind):
        doc = _long_chain(kind, self.N)
        best = float("inf")
        for _ in range(3):
            t0 = time.perf_counter()
            result = mcp._tokens_score(doc, CONTRACT_STUB, INLINE)
            best = min(best, (time.perf_counter() - t0) * 1000)
        assert result["total_tokens"] == self.N, result
        assert result["score"] == 100, result["checks"]
        assert best < self.BUDGET_MS, f"{kind}: {best:.0f} ms for {self.N} chained references"

    def test_a_reference_loop_gives_its_tokens_their_groups_type(self):
        """The value of every token on a loop is unknown (7.2.3), so no type
        comes round it: a.x, in an untyped group, stays untyped."""
        result = _score_inline({"$schema": SCHEMA,
                                "a": {"x": {"$value": "{b.y}"}},
                                "b": {"$type": "color", "y": {"$value": "{a.x}"}}})
        assert _check(result, "t03")["detail"] == "1/2 tokens have $type (direct or inherited)", _check(result, "t03")

    def test_an_extends_loop_ends(self):
        result = _score_inline({"$schema": SCHEMA,
                                "a": {"$extends": "{b}", "x": {"$value": BLUE}},
                                "b": {"$extends": "{a}", "y": {"$value": BLUE}}})
        assert _check(result, "t03")["status"] == "FAIL", _check(result, "t03")


class TestSiteExport:
    """/export/dtcg holds DTCG values (fixtures/tokens/site-export.json is it)."""

    def _export(self) -> dict:
        return json.loads((FIXTURES / "site-export.json").read_text(encoding="utf-8"))

    def _tokens(self, node: dict, at: tuple = ()) -> list:
        out = []
        for k, v in node.items():
            if not isinstance(v, dict) or (k.startswith("$") and k != "$root"):
                continue
            if "$value" in v:
                out.append((".".join(at + (k,)), v))
            else:
                out.extend(self._tokens(v, at + (k,)))
        return out

    def test_no_value_holds_a_css_variable(self):
        """Old verdict: 7 $values held var(), e.g. interaction.focus_ring = var(--signal-light)."""
        bad = [p for p, t in self._tokens(self._export()) if "var(" in json.dumps(t["$value"])]
        assert bad == [], bad

    def test_dimensions_are_value_unit_objects(self):
        """Old verdict: the 5 radii were strings ("6px") and shadow lengths were "0", "1px"."""
        tokens = self._tokens(self._export())
        dims = [(p, t["$value"]) for p, t in tokens if t["$type"] == "dimension"]
        assert dims, "the export has no dimension tokens"
        bad = [(p, v) for p, v in dims
               if not (isinstance(v, dict) and set(v) == {"value", "unit"} and v["unit"] in ("px", "rem"))]
        assert bad == [], bad
        for p, t in tokens:
            if t["$type"] == "shadow":
                for field in ("offsetX", "offsetY", "blur", "spread"):
                    v = t["$value"][field]
                    assert isinstance(v, dict) and v.get("unit") in ("px", "rem"), (p, field, v)
                assert isinstance(t["$value"]["color"], dict) and "colorSpace" in t["$value"]["color"], p

    def test_font_families_are_names_or_aliases(self):
        for p, t in self._tokens(self._export()):
            if t["$type"] != "fontFamily":
                continue
            v = t["$value"]
            names = isinstance(v, list) and v and all(isinstance(n, str) and "(" not in n for n in v)
            alias = isinstance(v, str) and v.startswith("{") and v.endswith("}")
            assert names or alias, (p, v)

    def test_every_alias_resolves_to_a_token_of_its_type(self):
        tokens = dict(self._tokens(self._export()))
        aliases = [(p, t) for p, t in tokens.items() if isinstance(t["$value"], str) and t["$value"].startswith("{")]
        assert aliases, "the export has no aliases"
        for p, t in aliases:
            target = tokens.get(t["$value"][1:-1])
            assert target is not None, (p, t["$value"])
            assert target["$type"] == t["$type"], (p, t["$value"])

    def test_the_export_has_no_warn_and_no_fail(self):
        result = mcp._tokens_score(self._export(), _contract(), INLINE)
        assert result["fail_count"] == 0 and result["warn_count"] == 0, result["checks"]
        assert result["score"] == 100


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

    def test_the_guardrails_file_has_no_warn_and_no_fail(self):
        """The DTCG file designesy_guardrails emits passes this validator. Its
        dimensions were strings ("4px"), a WARN in t08 and t10; they are now
        { value, unit }. Scored here, not read from the golden."""
        doc = json.loads((FIXTURES / "guardrails-emitted.json").read_text(encoding="utf-8"))
        result = mcp._tokens_score(doc, _contract(), INLINE)
        assert result["fail_count"] == 0 and result["warn_count"] == 0, result["checks"]
        assert result["score"] == 100

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
