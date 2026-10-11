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
    "version": "0.1.1",
    "status": "provisional",
    "verification": {
        "checks": [
            {"id": "a01", "item": "No WCAG 2.2 AA violations (axe-core wcag22aa ruleset)", "pass": "0 violations", "fail": "Any violation"},
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
