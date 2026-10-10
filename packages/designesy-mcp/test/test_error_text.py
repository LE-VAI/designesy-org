"""Error text that leaves the server carries no local file-system detail.

_scrub_local_paths mirrors sanitizeErrorText in the TypeScript engines: npm
@designesy/score 0.7.0 returned Node's "Cannot find package ... imported from
<path>" in a check detail, the full path of the npm cache under the Users
folder of the account that ran it. The same class of text reaches this
server's results through a browser probe's exception, a failed /api/score
call and a JSON-RPC error. The paths below are made up (Jane Doe).
"""

import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

import designesy_mcp_server as mcp  # noqa: E402

SCRUBBED = [
    (
        r"Cannot find package '@google/design.md' imported from C:\Users\Jane Doe\AppData\Local\npm-cache\_npx\1a2b3c4d\node_modules\@acme\cli\dist\engine.js",
        "Cannot find package '@google/design.md' imported from a local path",
    ),
    (
        r"[WinError 2] The system cannot find the file specified: 'C:\Program Files\nodejs\node.exe'",
        "[WinError 2] The system cannot find the file specified: 'a local path'",
    ),
    (
        "[Errno 2] No such file or directory: '/home/runner/work/x/cdp-viewport-check.cjs'",
        "[Errno 2] No such file or directory: 'a local path'",
    ),
    ("spawn node ENOENT at /tmp/abc/run.sh", "spawn node ENOENT at a local path"),
    ("ERR_MODULE_NOT_FOUND at file:///C:/Users/jane/x/engine.js:12:5", "ERR_MODULE_NOT_FOUND at a local file"),
    (r"open \\fileserver\share\jane\report.css failed", "open a local path failed"),
    (r"stale cache at ..\npm-cache\_npx\abc\x.js", "stale cache at the npm cache"),
    ("imported from C:/Users/jane/x.js, then", "imported from a local path, then"),
]

KEPT = [
    "Cannot find package '@google/design.md'",
    "fetched https://example.com/home/page and https://x.org/Users/jane; /DESIGN.md served",
    "no overflow at any breakpoint (390px:ok, 768px:ok)",
]


def test_scrubs_paths_file_urls_and_npm_cache():
    for raw, clean in SCRUBBED:
        assert mcp._scrub_local_paths(raw) == clean, raw


def test_keeps_urls_site_paths_and_check_text():
    for text in KEPT:
        assert mcp._scrub_local_paths(text) == text


def test_matches_the_typescript_engines_on_the_shared_cases():
    # The same inputs and outputs as packages/score/test/error-text.test.mjs.
    assert mcp._scrub_local_paths(
        r"/DESIGN.md fetched but linter unavailable: Cannot find package '@google/design.md' imported from C:\Users\Jane Doe\AppData\Local\npm-cache\_npx\1a2b3c4d\node_modules\@acme\cli\dist\engine.js. The @google/design.md package may not be installed in this runtime; run the full audit to resolve."
    ) == (
        "/DESIGN.md fetched but linter unavailable: Cannot find package '@google/design.md' imported from a local path. The @google/design.md package may not be installed in this runtime; run the full audit to resolve."
    )


def test_offline_check_details_are_scrubbed():
    checks = [{"id": "v02", "status": "MANUAL", "detail": r"CDP viewport check error: [WinError 2] cannot find 'C:\Users\Jane Doe\node.exe'"}]
    out = mcp._scrub_check_details(checks)
    assert out[0]["detail"] == "CDP viewport check error: [WinError 2] cannot find 'a local path'"
    assert checks[0]["detail"].endswith(r"node.exe'"), "the input list is not mutated"


def test_a_failed_score_call_is_scrubbed():
    exc = FileNotFoundError(2, "No such file or directory", "/home/jane/.cache/x.json")
    assert "jane" not in mcp._score_api_failure(exc)
