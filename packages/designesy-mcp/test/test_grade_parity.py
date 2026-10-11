"""The offline engine grades the way the live engine does.

The offline score is an unweighted pass rate over a subset of the checks and
says so, so its number is not the live engine's. Its letter is read from that
number, though, and the rules that turn a number into a letter are the live
engine's own: the same grade bands, and no A while any check FAILs.

Both rules are read from the TypeScript source here, not restated, so a change
on either side fails this file until the other follows.
"""

from __future__ import annotations

import re
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
REPO = HERE.parent.parent.parent
sys.path.insert(0, str(HERE.parent))

import designesy_mcp_server as mcp  # noqa: E402

ENGINE_TS = REPO / "packages" / "score" / "src" / "engine.ts"
ROUTE_TS = REPO / "apps" / "site" / "app" / "api" / "score" / "route.ts"


def _any_fail_cap(path: Path) -> float:
    src = path.read_text(encoding="utf-8")
    m = re.search(r"const ANY_FAIL_CAP = (\d+(?:\.\d+)?);", src)
    assert m, f"ANY_FAIL_CAP not found in {path}"
    return float(m.group(1))


class TestNoAWhileAnyCheckFails:
    def test_the_cap_is_the_live_engines(self):
        for path in (ENGINE_TS, ROUTE_TS):
            assert round(mcp._ANY_FAIL_CAP * 100, 1) == _any_fail_cap(path), path.name

    def _page(self, fail_css: str = "") -> dict:
        # Every ported check that can PASS on a small page, then one mutation.
        css = (
            ":root{--paper:#ffffff;--ink:#111111;--muted:#595959;--muted-dim:#6b6b6b;--signal:#0133cb;"
            "--duration:600ms;--duration-quick:120ms;--duration-fast:180ms;--duration-medium:280ms;--duration-slow:420ms;"
            "-webkit-font-smoothing:antialiased;-moz-osx-font-smoothing:grayscale;font-synthesis:none;"
            "text-underline-position:from-font;text-decoration-skip-ink:auto}"
            "body{line-height:1.55;font-size:1rem}h1{line-height:1.08;text-wrap:balance;font-size:2rem}p{text-wrap:pretty}"
            + "".join(f".n{i}{{font-variant-numeric:tabular-nums}}" for i in range(8))
            + "::selection{background:var(--signal)}a:focus-visible{outline:2px solid}input{font-size:1rem}"
            + fail_css
        )
        html = (
            '<!doctype html><html lang="en"><head><title>Fixture</title>'
            '<meta name="description" content="Grade fixture."></head><body><main><h1>Fixture</h1>'
            '<label for="e">Email</label><input id="e" type="email"></main></body></html>'
        )
        return mcp._offline_result("https://fixture.local/", html, css, "universal")

    def test_a_fail_caps_an_a_at_89_9_and_the_note_says_why(self):
        clean = self._page()
        assert clean["summary"]["fail"] == 0
        assert clean["summary"]["grade"] == "A", clean["summary"]
        capped = self._page(".x{transition:all 1s}")
        s = capped["summary"]
        assert s["fail"] == 1
        raw = (s["pass"] + 0.5 * s["warn"]) / (s["total"] - s["skip"] - s["manual"])
        assert raw > 0.899, "the fixture must score above the cap before it applies"
        assert s["score"] == 0.899
        assert s["score_percent"] == 89.9
        assert s["grade"] == "B"
        assert "A FAIL caps the grade at B: v11 fails" in capped["note"]

    def test_a_score_under_the_cap_is_left_as_it_is(self):
        r = mcp._offline_result("https://fixture.local/", "<html></html>", "a:focus{outline:none}", "contract")
        s = r["summary"]
        assert s["fail"] > 0
        raw = (s["pass"] + 0.5 * s["warn"]) / (s["total"] - s["skip"] - s["manual"])
        assert raw < 0.899
        assert s["score"] == round(raw, 4)
        assert "caps the grade" not in r["note"]


def _bands(path: Path) -> list[tuple[float, str]]:
    """computeGrade's thresholds, read from a TypeScript engine copy."""
    src = path.read_text(encoding="utf-8")
    start = src.index("function computeGrade(")
    body = src[start : src.index("\n}", start)]
    bands = [(float(t), g) for t, g in re.findall(r"if \(score >= (\d+(?:\.\d+)?)\) return '([A-F])';", body)]
    assert re.search(r"return 'F';", body), f"computeGrade in {path.name} has no F fallthrough"
    return bands


class TestGradeBands:
    def test_both_typescript_copies_use_90_80_70_60(self):
        expected = [(90.0, "A"), (80.0, "B"), (70.0, "C"), (60.0, "D")]
        for path in (ENGINE_TS, ROUTE_TS):
            assert _bands(path) == expected, path.name

    def test_the_offline_engine_grades_on_the_same_bands(self):
        bands = _bands(ENGINE_TS)
        for threshold, grade in bands:
            assert mcp._score_grade(threshold / 100) == grade, threshold
            below = round(threshold - 0.1, 1)
            expected_below = next((g for t, g in bands if below >= t), "F")
            assert mcp._score_grade(below / 100) == expected_below, below
        assert mcp._score_grade(0.0) == "F"
        assert mcp._score_grade(1.0) == "A"

    def test_the_audit_counter_examples(self):
        # The 2026-10-11 core-logic audit: 0.92 read B and 0.72 read D here,
        # A and C in every TypeScript engine.
        assert mcp._score_grade(0.92) == "A"
        assert mcp._score_grade(0.72) == "C"
        assert mcp._score_grade(0.88) == "B"

    def test_the_letter_matches_the_percentage_shown(self):
        # 0.8996 is shown as 90.0%; the letter must be the one 90.0 earns.
        assert round(0.8996 * 100, 1) == 90.0
        assert mcp._score_grade(0.8996) == "A"
        assert mcp._score_grade(mcp._ANY_FAIL_CAP) == "B"
