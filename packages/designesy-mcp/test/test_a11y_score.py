"""designesy_a11y_score: each check carries the a11y contract's own name.

The tool description promises checks[{id (a01-a11), name, status:
"PENDING_EXECUTION"}]. The hosted endpoint returned {id, status} only: it read
`name` from contract checks that carry their name under `item`, and the
missing value vanished from the JSON. This server read `item` all along, so
these tests pass here before and after the hosted fix; they hold the two to
the same shape. apps/site/scripts/check-mcp-accuracy.js checks the hosted
endpoint against the contract module the site serves.

Network calls are mocked; nothing here reaches the network.
"""

from __future__ import annotations

import json
import os
import sys
from unittest.mock import patch

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

import designesy_mcp_server as mcp  # noqa: E402

# The a11y contract's verification block as the site serves it: the check name
# is under `item`, and the rows carry pass/fail criteria besides.
CONTRACT = {
    "id": "designesy.a11y",
    "version": "0.1.2",
    "status": "provisional",
    "verification": {
        "checks": [
            {"id": "a01", "item": "No WCAG 2.2 AA violations (axe-core rules tagged wcag2a, wcag2aa, wcag21a, wcag21aa or wcag22aa)", "pass": "0 violations", "fail": "Any violation"},
            {"id": "a02", "item": "Color contrast passes AA 4.5:1 (normal), 3:1 (large)", "pass": "All pass", "fail": "Any fail"},
            {"id": "a05", "item": "Form labels and error identification", "pass": "All pass", "fail": "Any fail", "na": "No forms"},
        ]
    },
}


def _call(args: dict) -> dict:
    with patch.object(mcp, "_fetch", lambda url, as_json=True: CONTRACT):
        return mcp._a11y_score_impl(**args)


class TestCheckNames:
    def test_each_check_is_id_name_status(self):
        result = _call({"url": "https://example.com/"})
        assert [sorted(c) for c in result["checks"]] == [["id", "name", "status"]] * 3

    def test_name_is_the_contract_item(self):
        result = _call({"url": "https://example.com/"})
        items = {c["id"]: c["item"] for c in CONTRACT["verification"]["checks"]}
        for c in result["checks"]:
            assert c["name"] == items[c["id"]]
            assert c["status"] == "PENDING_EXECUTION"

    def test_description_promises_the_same_shape(self):
        desc = mcp.TOOL_MAP["designesy_a11y_score"]["description"]
        assert 'checks[{id (a01-a11), name, status: "PENDING_EXECUTION"}]' in desc

    def test_the_tool_call_returns_named_checks(self):
        with patch.object(mcp, "_fetch", lambda url, as_json=True: CONTRACT):
            msg = mcp._handle({"jsonrpc": "2.0", "id": 1, "method": "tools/call",
                               "params": {"name": "designesy_a11y_score", "arguments": {"url": "https://example.com/"}}})
        payload = json.loads(msg["result"]["content"][0]["text"])
        assert [c["name"] for c in payload["checks"]] == [c["item"] for c in CONTRACT["verification"]["checks"]]


class TestTheScanRunsEveryWcagLevel:
    """axe-core tags are not cumulative: wcag22aa alone selected one rule
    (target-size, axe-core 4.13.0), so the "WCAG 2.2 AA scan" ran one rule."""

    def test_the_default_scan_lists_all_five_wcag_tags(self):
        result = _call({"url": "https://example.com/"})
        five = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"]
        assert result["ruleset"] == "wcag22aa"
        assert result["tags"] == five
        assert '.withTags(["wcag2a","wcag2aa","wcag21a","wcag21aa","wcag22aa"])' in result["playwright_script"]
        assert ".withTags(['wcag22aa'])" not in result["playwright_script"]

    def test_a_level_expands_and_any_other_tag_runs_as_given(self):
        assert _call({"url": "https://example.com/", "ruleset": "wcag21aa"})["tags"] == ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]
        assert _call({"url": "https://example.com/", "ruleset": "wcag2aa"})["tags"] == ["wcag2a", "wcag2aa"]
        assert _call({"url": "https://example.com/", "ruleset": "best-practice"})["tags"] == ["best-practice"]

    def test_no_applicable_rule_is_not_scored_rather_than_an_f(self):
        script = _call({"url": "https://example.com/"})["playwright_script"]
        assert "const score = applicable === 0 ? null : Math.round((passCount / applicable) * 100);" in script
        assert "const grade = score === null ? null :" in script
        assert "Math.round((passCount / (passCount + failCount)) * 100)" not in script


class TestTheGeneratedScriptRuns:
    """The script is executed (apps/site/scripts/lib/run-a11y-script.mjs runs it
    with stand-ins for @playwright/test, @axe-core/playwright and axe-core). With
    a config it used to call axe.configure() on an axe nothing defined, and threw
    on every run."""

    RUNNER = os.path.join(os.path.dirname(__file__), "..", "..", "..", "apps", "site", "scripts", "lib", "run-a11y-script.mjs")
    BRAND = {"branding": {"brand": "designesy", "application": "designesy-a11y"}, "rules": [{"id": "region", "enabled": False}]}

    def _run(self, args: dict) -> dict:
        import shutil
        import subprocess
        import tempfile

        import pytest

        node = shutil.which("node")
        if not node:
            pytest.skip("node is not installed; the generated script cannot be run")
        script = _call({"url": "https://example.com/", **args})["playwright_script"]
        with tempfile.TemporaryDirectory() as d:
            path = os.path.join(d, "a11y-scan.spec.mjs")
            with open(path, "w", encoding="utf-8") as f:
                f.write(script)
            done = subprocess.run([node, self.RUNNER, path, "3", "1"], capture_output=True, text=True, encoding="utf-8", timeout=60)
        assert done.returncode == 0, done.stderr
        return json.loads(done.stdout)

    def test_the_default_script_runs_and_scores(self):
        ran = self._run({})
        assert ran["goto"] == ["https://example.com/"]
        assert ran["tags"] == ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"]
        assert ran["axeSource"] is False
        assert (ran["output"]["score"], ran["output"]["grade"]) == (75, "C")

    def test_a_config_reaches_axe_configure_inside_the_page(self):
        ran = self._run({"config": json.dumps(self.BRAND)})
        assert ran["axeSource"] is True
        assert ran["configured"] == self.BRAND
        assert (ran["output"]["score"], ran["output"]["grade"]) == (75, "C")

    def test_a_config_installs_axe_core_too(self):
        result = _call({"url": "https://example.com/", "config": json.dumps(self.BRAND)})
        assert result["install_command"] == "npm i -D @axe-core/playwright@4.13.0 axe-core@4.13.0"
        assert "import axe from 'axe-core';" in result["playwright_script"]
        plain = _call({"url": "https://example.com/"})
        assert "import axe from" not in plain["playwright_script"]
        assert plain["install_command"] == "npm i -D @axe-core/playwright@4.13.0"


class TestTheUrlIsAStringLiteral:
    """The url argument was spliced between single quotes in page.goto('...'),
    the test title and the printed result, so a quote ended the literal and the
    rest of the url became code the caller's runner executed."""

    HOSTILE = "https://example.com/a'b\"c`d${globalThis.__a11yInjected = 1}');globalThis.__a11yInjected = 2;('"

    def test_the_script_parses_and_navigates_to_exactly_that_url(self):
        import shutil
        import subprocess
        import tempfile

        import pytest

        node = shutil.which("node")
        if not node:
            pytest.skip("node is not installed; the generated script cannot be run")
        script = _call({"url": self.HOSTILE})["playwright_script"]
        assert "page.goto(" + json.dumps(self.HOSTILE, ensure_ascii=False) + ")" in script
        with tempfile.TemporaryDirectory() as d:
            path = os.path.join(d, "a11y-scan.spec.mjs")
            with open(path, "w", encoding="utf-8") as f:
                f.write(script)
            done = subprocess.run([node, TestTheGeneratedScriptRuns.RUNNER, path, "3", "1"], capture_output=True, text=True, encoding="utf-8", timeout=60)
        assert done.returncode == 0, done.stderr
        ran = json.loads(done.stdout)
        assert ran["goto"] == [self.HOSTILE]
        assert ran["output"]["url"] == self.HOSTILE
        assert ran["tests"] == [f"{self.HOSTILE} — WCAG 2.2 AA scan"]
