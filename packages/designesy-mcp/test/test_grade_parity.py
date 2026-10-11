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
