"""Tool titles and MCP annotation hints.

MCP clients and directories show a tool's title and its behaviour hints
(readOnlyHint, destructiveHint, idempotentHint, openWorldHint) to the person
deciding whether to let a call run. Directories reject a tool without a title
or without a readOnlyHint/destructiveHint, and an absent hint falls back to the
spec default, which is the least safe reading. These tests hold:

- every tool the server lists carries a title, in Tool.title and in
  annotations.title, and all four hints as booleans;
- titles follow the house copy rules;
- the hints match what the code does, shown by calling the implementations;
- the table equals the hosted endpoint's MCP_TOOL_ANNOTATIONS, so the PyPI
  server and https://www.designesy.org/api/mcp describe each tool the same way;
- the package metadata no longer calls the whole server read-only.

Network calls are mocked; no live internet is needed.
"""

import json
import os
import re
import sys
from pathlib import Path
from unittest.mock import patch

import pytest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

import designesy_mcp_server as mcp  # noqa: E402

HINTS = ("readOnlyHint", "destructiveHint", "idempotentHint", "openWorldHint")
TITLE_MAX_WORDS = 5
PACKAGE = Path(__file__).resolve().parents[1]
REGISTRY = PACKAGE.parents[1] / "apps" / "site" / "app" / "lib" / "mcp-tool-registry.ts"
TOOL_NAMES = [t["name"] for t in mcp.TOOLS]


def _served_tools() -> dict[str, dict]:
    """tools/list as a client receives it: through _handle and a JSON round trip."""
    response = mcp._handle({"jsonrpc": "2.0", "id": 1, "method": "tools/list"})
    tools = json.loads(json.dumps(response["result"]["tools"]))
    return {t["name"]: t for t in tools}


# ── Every served tool is titled and fully annotated ──────────────────────────


class TestServedToolsCarryTitlesAndHints:
    def test_table_covers_exactly_the_served_tools(self):
        assert set(mcp.TOOL_ANNOTATIONS) == set(_served_tools())
        assert len(mcp.TOOL_ANNOTATIONS) == 17

    @pytest.mark.parametrize("name", TOOL_NAMES)
    def test_tool_has_a_title_in_both_places(self, name):
        tool = _served_tools()[name]
        title = tool.get("title")
        assert isinstance(title, str) and title.strip(), f"{name} has no title"
        assert tool.get("annotations", {}).get("title") == title, (
            f"{name}: annotations.title must equal title; display precedence is "
            "title, then annotations.title, then name"
        )

    @pytest.mark.parametrize("name", TOOL_NAMES)
    def test_tool_sets_all_four_hints_as_booleans(self, name):
        annotations = _served_tools()[name].get("annotations")
        assert isinstance(annotations, dict), f"{name} has no annotations"
        for hint in HINTS:
            assert hint in annotations, f"{name} leaves {hint} to the spec default"
            assert isinstance(annotations[hint], bool), f"{name}.{hint} is {annotations[hint]!r}"

    def test_a_read_only_tool_is_never_destructive(self):
        for name, tool in _served_tools().items():
            a = tool["annotations"]
            if a["readOnlyHint"]:
                assert a["destructiveHint"] is False, name

    def test_title_follows_name_in_the_listing(self):
        for tool in _served_tools().values():
            assert list(tool)[:2] == ["name", "title"]


class TestTitleCopy:
    @pytest.mark.parametrize("name", TOOL_NAMES)
    def test_short_plain_title(self, name):
        title = mcp.TOOL_ANNOTATIONS[name]["title"]
        words = title.split()
        assert len(words) <= TITLE_MAX_WORDS, f"{title!r} has {len(words)} words"
        assert "\u2014" not in title, f"{title!r} contains an em dash"
        assert not [w for w in words if w.lower() in ("a", "an", "the")], f"{title!r} uses an article"

    def test_titles_are_unique(self):
        titles = [a["title"] for a in mcp.TOOL_ANNOTATIONS.values()]
        assert len(set(titles)) == len(titles)


# ── The hints match what the code does ───────────────────────────────────────


class TestHintsMatchBehaviour:
    def test_monitor_score_is_the_only_tool_that_is_not_read_only(self):
        """designesy_monitor_score can send email, so it cannot be read-only.

        /api/monitor sends a drift-alert email through Resend when the caller
        passes `email`, an alert fires, and the server has RESEND_API_KEY set.
        Mail is additive (destructiveHint False), and a repeated call can send
        another email (idempotentHint False). Adding a second writing tool must
        be a deliberate change to this test.
        """
        writers = [n for n, a in mcp.TOOL_ANNOTATIONS.items() if not a["readOnlyHint"]]
        assert writers == ["designesy_monitor_score"]
        monitor = mcp.TOOL_ANNOTATIONS["designesy_monitor_score"]
        assert monitor["destructiveHint"] is False
        assert monitor["idempotentHint"] is False
        assert monitor["openWorldHint"] is True

    def test_monitor_score_forwards_the_email_that_triggers_the_send(self):
        history = [{"timestamp": "t", "score": 90, "grade": "A", "tokensExtracted": 1, "checks": []}]
        with patch.object(mcp, "_post_api", return_value={"ok": True}) as post:
            mcp._monitor_score_impl(url="https://example.com/", email="owner@example.com", history=history)
        endpoint, body = post.call_args.args
        assert endpoint == "monitor"
        assert body["email"] == "owner@example.com"
        assert body["history"] == history

    def test_a11y_score_never_fetches_the_callers_url(self):
        """Closed world: the url goes into the returned script, never on the wire."""
        stub = {"id": "a11y", "version": "x", "verification": {"checks": []}}
        with patch.object(mcp, "_fetch", return_value=stub) as fetch:
            result = mcp._a11y_score_impl(url="https://example.com/page")
        fetched = [c.args[0] for c in fetch.call_args_list]
        assert fetched == ["https://www.designesy.org/contracts/a11y.json"]
        assert "https://example.com/page" in result["playwright_script"]
        assert mcp.TOOL_ANNOTATIONS["designesy_a11y_score"]["openWorldHint"] is False

    def test_tokens_score_fetches_the_callers_url(self):
        """Open world: given a url, the tool fetches it."""
        stub = {"verification": {"checks": []}}
        with patch.object(mcp, "_fetch", return_value=stub) as fetch:
            mcp._tokens_score_impl(url="https://example.com/tokens.json")
        assert "https://example.com/tokens.json" in [c.args[0] for c in fetch.call_args_list]
        assert mcp.TOOL_ANNOTATIONS["designesy_tokens_score"]["openWorldHint"] is True

    def test_document_tools_fetch_only_designesy_org(self):
        closed = {
            "designesy_catalog": mcp._catalog_impl,
            "designesy_skill_md": mcp._skill_md_impl,
            "designesy_agent_json": mcp._agent_json_impl,
            "designesy_llms_txt": mcp._llms_txt_impl,
            "designesy_llms_full_txt": mcp._llms_full_txt_impl,
        }
        for name, impl in closed.items():
            with patch.object(mcp, "_fetch", return_value={}) as fetch:
                try:
                    impl()
                except Exception:
                    pass  # the shape of the stub does not matter; the URL does
            for call in fetch.call_args_list:
                assert call.args[0].startswith("https://www.designesy.org/"), (name, call.args[0])
            assert mcp.TOOL_ANNOTATIONS[name]["openWorldHint"] is False, name


# ── The PyPI server and the hosted endpoint agree ────────────────────────────


def _hosted_table() -> dict[str, dict]:
    """Parse MCP_TOOL_ANNOTATIONS (one entry per line) from the hosted registry."""
    src = REGISTRY.read_text(encoding="utf-8")
    block = re.search(r"MCP_TOOL_ANNOTATIONS\s*=\s*\{\s*\n(.*?)\n\}\s*as const", src, re.S)
    assert block, "MCP_TOOL_ANNOTATIONS not found in apps/site/app/lib/mcp-tool-registry.ts"
    table = {}
    for line in block.group(1).splitlines():
        m = re.match(r"\s*([a-z0-9_]+)\s*:\s*\{(.*)\}\s*,?\s*$", line)
        assert m, f"unreadable registry line: {line.strip()}"
        title = re.search(r"title\s*:\s*'((?:[^'\\]|\\.)*)'", m.group(2))
        entry = {"title": title.group(1) if title else None}
        for hint in HINTS:
            hm = re.search(rf"\b{hint}\s*:\s*(true|false)\b", m.group(2))
            entry[hint] = None if hm is None else hm.group(1) == "true"
        table[m.group(1)] = entry
    return table


class TestHostedEndpointAgreement:
    @pytest.fixture(scope="class")
    def hosted(self):
        if not REGISTRY.exists():
            pytest.skip("apps/site is not present (sdist build); the repo checkout runs this test")
        return _hosted_table()

    def test_same_tools(self, hosted):
        assert set(hosted) == set(mcp.TOOL_ANNOTATIONS)

    @pytest.mark.parametrize("name", TOOL_NAMES)
    def test_same_title_and_hints(self, hosted, name):
        ours = {k: mcp.TOOL_ANNOTATIONS[name][k] for k in ("title", *HINTS)}
        assert ours == hosted[name], f"{name}: PyPI {ours} vs hosted {hosted[name]}"


# ── Package metadata states the side effect ──────────────────────────────────


class TestReadOnlyClaims:
    def _summary(self) -> str:
        text = (PACKAGE / "pyproject.toml").read_text(encoding="utf-8")
        m = re.search(r'^description\s*=\s*"(.*)"\s*$', text, re.M)
        assert m, "description not found in pyproject.toml"
        return m.group(1)

    def test_summary_names_the_email_exception(self):
        summary = self._summary()
        assert not summary.lower().startswith("read-only"), summary
        assert "email" in summary.lower(), "the summary must say monitor alerts can send email"
        assert "\u2014" not in summary, "PyPI summary is visible copy: no em dashes"

    def test_readme_does_not_claim_the_server_never_writes(self):
        readme = (PACKAGE / "README.md").read_text(encoding="utf-8")
        assert "never writes anywhere" not in readme
        assert "read-only stdio mcp server" not in readme.lower()
        assert "designesy_monitor_score" in readme
