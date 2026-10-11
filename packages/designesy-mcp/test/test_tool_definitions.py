"""Tool definitions: descriptions, schemas, structured output, errors, protocol.

What a client reads about the tools decides which tool it picks and how it
reads the result, so each part is held to something outside itself:

  - the golden both servers share (test/fixtures/tool-definitions.json,
    generated from the hosted endpoint by apps/site's
    `node scripts/check-mcp-accuracy.js --write-definitions`): instructions,
    descriptions, input and output schemas, and the contract keys;
  - the 2,048 characters Claude Code shows of each description and of the
    server instructions ("Claude Code truncates each tool description and each
    server's instructions at 2,048 characters by default",
    https://code.claude.com/docs/en/mcp);
  - MCP 2025-11-25, server/tools: a tool with an outputSchema MUST return
    conforming structuredContent, and SHOULD also return the serialized JSON
    as text; API failures are tool execution errors (isError), an unknown
    tool a protocol error (-32602); a tool without parameters takes
    {"type": "object", "additionalProperties": false};
  - MCP 2025-11-25, basic/lifecycle, version negotiation: answer with the
    requested revision when supported, else another supported one, the latest.

Network calls are mocked; nothing here reaches the internet.
"""

import io
import json
import re
import socket
import sys
import urllib.error
from pathlib import Path
from unittest.mock import patch

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import designesy_mcp_server as mcp  # noqa: E402

HERE = Path(__file__).resolve().parent
FIXTURES = HERE / "fixtures"
GOLDEN = json.loads((FIXTURES / "tool-definitions.json").read_text(encoding="utf-8"))
REPO = Path(__file__).resolve().parents[3]

DESCRIPTION_LIMIT = 2048
# The instructions keep a margin under that limit, so a later edit has room.
INSTRUCTIONS_BUDGET = 1950
SCORING_TOOLS = [
    "designesy_score", "designesy_tokens_score", "designesy_a11y_score", "designesy_motion_score",
    "designesy_drift_score", "designesy_readiness_score", "designesy_guardrails",
    "designesy_monitor_score", "designesy_compare", "designesy_report",
]
# The descriptions that differ from the hosted endpoint's, and why.
STDIO_DESCRIPTIONS = {
    # The hosted one states the package count, read from the catalog it bundles.
    "designesy_catalog",
    # The hosted one states the size of the contract it bundles.
    "designesy_contract",
    # This package reshapes the default format and falls back to an offline engine.
    "designesy_score",
}


def _call(name: str, arguments: dict) -> dict:
    msg = mcp._handle({"jsonrpc": "2.0", "id": 9, "method": "tools/call", "params": {"name": name, "arguments": arguments}})
    return msg["result"]


def _payload(result: dict):
    text = result["content"][0]["text"]
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        return text


# ── A small JSON Schema validator for the keywords the schemas use ───────────
#
# The package has no dependencies, so the suite carries its own checker for
# the subset of JSON Schema the output schemas are written in. A keyword it
# does not know fails the test, so a schema cannot quietly outgrow it.

_KNOWN = {"type", "description", "properties", "required", "items", "enum", "minimum", "maximum", "additionalProperties"}
_TYPES = {
    "object": lambda v: isinstance(v, dict),
    "array": lambda v: isinstance(v, list),
    "string": lambda v: isinstance(v, str),
    "boolean": lambda v: isinstance(v, bool),
    "null": lambda v: v is None,
    "integer": lambda v: isinstance(v, int) and not isinstance(v, bool),
    "number": lambda v: isinstance(v, (int, float)) and not isinstance(v, bool),
}


def _validate(schema: dict, value, at: str = "$") -> list[str]:
    unknown = set(schema) - _KNOWN
    if unknown:
        return [f"{at}: the test validator does not know {sorted(unknown)}"]
    errors: list[str] = []
    if "type" in schema:
        types = schema["type"] if isinstance(schema["type"], list) else [schema["type"]]
        if not any(_TYPES[t](value) for t in types):
            return [f"{at}: {type(value).__name__} is not {types}"]
    if "enum" in schema and value not in schema["enum"]:
        errors.append(f"{at}: {value!r} is not one of {schema['enum']}")
    if isinstance(value, (int, float)) and not isinstance(value, bool):
        if "minimum" in schema and value < schema["minimum"]:
            errors.append(f"{at}: {value} < {schema['minimum']}")
        if "maximum" in schema and value > schema["maximum"]:
            errors.append(f"{at}: {value} > {schema['maximum']}")
    if isinstance(value, dict):
        for k in schema.get("required", []):
            if k not in value:
                errors.append(f"{at}: missing {k}")
        props = schema.get("properties", {})
        for k, v in value.items():
            if k in props:
                errors.extend(_validate(props[k], v, f"{at}.{k}"))
            elif schema.get("additionalProperties") is False:
                errors.append(f"{at}: {k} is not allowed")
    if isinstance(value, list) and "items" in schema:
        for i, v in enumerate(value):
            errors.extend(_validate(schema["items"], v, f"{at}[{i}]"))
    return errors


def _conforms(tool: str, value) -> list[str]:
    return _validate(mcp.TOOL_MAP[tool]["outputSchema"], value)


# ── 1. Both servers state the same definitions ──────────────────────────────


class TestGolden:
    def test_instructions(self):
        assert mcp.SERVER_INSTRUCTIONS == GOLDEN["instructions"]

    def test_no_parameter_input_schema(self):
        assert mcp.NO_PARAMETER_INPUT_SCHEMA == GOLDEN["no_parameter_input_schema"] == {"type": "object", "additionalProperties": False}

    def test_contract_keys(self):
        assert list(mcp.CONTRACT_KEYS) == GOLDEN["contract_keys"]

    def test_output_schemas(self):
        assert mcp.OUTPUT_SCHEMAS == GOLDEN["output_schemas"]
        for name, tool in mcp.TOOL_MAP.items():
            assert tool.get("outputSchema") == GOLDEN["output_schemas"].get(name), name

    def test_input_schemas(self):
        assert [t["name"] for t in mcp.TOOLS] == list(GOLDEN["input_schemas"])
        for tool in mcp.TOOLS:
            assert tool["inputSchema"] == GOLDEN["input_schemas"][tool["name"]], tool["name"]

    def test_descriptions(self):
        for tool in mcp.TOOLS:
            if tool["name"] in STDIO_DESCRIPTIONS:
                assert tool["description"] != GOLDEN["descriptions"][tool["name"]], f"{tool['name']} now matches; drop it from STDIO_DESCRIPTIONS"
            else:
                assert tool["description"] == GOLDEN["descriptions"][tool["name"]], tool["name"]


# ── 2. Descriptions: length, order, neutral text ────────────────────────────


def _descriptions() -> list[tuple[str, str]]:
    return [(t["name"], t["description"]) for t in mcp.TOOLS] + [(f"hosted {n}", d) for n, d in GOLDEN["descriptions"].items()]


class TestDescriptions:
    @pytest.mark.parametrize("name, text", _descriptions())
    def test_fits_in_2048_characters(self, name, text):
        assert len(text) <= DESCRIPTION_LIMIT, f"{name}: {len(text)} characters"

    def test_instructions_fit_in_2048_characters_with_a_margin(self):
        assert 0 < len(mcp.SERVER_INSTRUCTIONS) <= INSTRUCTIONS_BUDGET < DESCRIPTION_LIMIT

    def test_instructions_name_the_typical_uses_second(self):
        # Claude Code loads only tool names and the instructions at session
        # start, so the typical uses come right after what the server is.
        first_line = mcp.SERVER_INSTRUCTIONS.splitlines()[0]
        assert first_line.split(". ")[1].startswith("Typical uses: ")
        for term in ("design quality", "AI-generated", "slop"):
            assert term in first_line, term

    @pytest.mark.parametrize("name, text", _descriptions())
    def test_order_purpose_then_use_this_when_then_siblings(self, name, text):
        first = text.index(". ")
        assert text.startswith("Use this when ", first + 2), name
        assert re.search(r"When not to use: [^.]*designesy_\w+", text), name

    @pytest.mark.parametrize("name, text", _descriptions() + [("instructions", GOLDEN["instructions"])])
    def test_neutral_reference_text(self, name, text):
        assert not mcp._is_agent_directive(text), name
        assert not re.search(r"\byou must\b|\balways call\b|\bignore\b", text, re.IGNORECASE), name
        assert "RESEND_API_KEY" not in text, name  # "a configured Resend key"
        assert chr(0x2014) not in text, name  # no em dash

    def test_scoring_descriptions_point_at_the_output_schema(self):
        for name in SCORING_TOOLS:
            assert "output schema" in mcp.TOOL_MAP[name]["description"], name

    def test_score_names_the_slop_deduction(self):
        assert "slop" in GOLDEN["descriptions"]["designesy_score"]
        assert "slop" in mcp.OUTPUT_SCHEMAS["designesy_score"]["properties"]
        assert "slop deduction" in mcp.TOOL_MAP["designesy_score"]["description"]

    def test_stdio_score_states_its_own_shape_and_fallback(self):
        d = mcp.TOOL_MAP["designesy_score"]["description"]
        ported = len(mcp.OFFLINE_CHECK_IDS)
        assert f"{ported} of the {ported + len(mcp._OFFLINE_NOT_IMPLEMENTED)} checks" in d
        assert "contract_version" in d and "score_percent" in d and "127.0.0.1:9222" in d

    def test_stdio_catalog_states_no_count(self):
        assert not re.search(r"\b\d+ packages\b", mcp.TOOL_MAP["designesy_catalog"]["description"])

    @pytest.mark.parametrize("name", ["designesy_tokens_score", "designesy_motion_score"])
    def test_inline_file_wins_when_both_are_given(self, name):
        # The description says so, and the code does it: url is not read.
        inline = "dtcg_file" if name == "designesy_tokens_score" else "lottie_file"
        assert f"if both are given, {inline} is used" in mcp.TOOL_MAP[name]["description"]
        contract = json.loads((FIXTURES / ("tokens" if inline == "dtcg_file" else "motion") / "contract.json").read_text(encoding="utf-8"))
        fetched = []

        def fake(url, as_json=True):
            fetched.append(url)
            return contract

        with patch.object(mcp, "_fetch", fake):
            _call(name, {"url": "https://example.com/file.json", inline: "{}"})
        assert "https://example.com/file.json" not in fetched


# ── 3. Parameters ───────────────────────────────────────────────────────────


class TestParameters:
    @pytest.mark.parametrize("tool", mcp.TOOLS, ids=[t["name"] for t in mcp.TOOLS])
    def test_every_parameter_has_an_example(self, tool):
        props = tool["inputSchema"].get("properties", {})
        if not props:
            assert tool["inputSchema"] == mcp.NO_PARAMETER_INPUT_SCHEMA, tool["name"]
        for name, schema in props.items():
            assert "for example" in schema.get("description", ""), f"{tool['name']}.{name}"

    def test_constrained_inputs_are_enums(self):
        props = lambda n: mcp.TOOL_MAP[n]["inputSchema"]["properties"]
        assert props("designesy_contract")["sections"]["items"]["enum"] == list(mcp.CONTRACT_KEYS)
        assert props("designesy_contract")["section"]["enum"] == list(mcp.CONTRACT_KEYS)
        assert props("designesy_guardrails")["parts"]["items"]["enum"] == list(mcp.GUARDRAILS_PARTS)
        assert props("designesy_report")["detail"]["enum"] == list(mcp.REPORT_DETAILS)
        assert props("designesy_score")["format"]["enum"] == list(mcp.SCORE_FORMATS)
        assert props("designesy_score")["scope"]["enum"] == list(mcp.SCORE_SCOPES)
        assert props("designesy_a11y_score")["ruleset"]["enum"] == ["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa", "best-practice"]

    def test_an_unknown_contract_key_still_gets_the_helpful_error(self):
        # A client that does not validate against the enum still learns the valid keys.
        contract = json.loads((FIXTURES / "published-docs" / "design-system.json").read_text(encoding="utf-8"))
        with patch.object(mcp, "_fetch", lambda url, as_json=True: contract):
            res = _call("designesy_contract", {"sections": ["motion", "colour"]})
        out = _payload(res)
        assert res["isError"] is True and "structuredContent" not in res
        assert out["unknown_sections"] == ["colour"] and out["retryable"] is False
        assert "Retryable: no." in out["error"]


# ── 4. Rate limits stated are the ones the engines enforce ──────────────────

ENGINE_ROUTES = {
    "designesy_score": "score", "designesy_drift_score": "drift", "designesy_readiness_score": "readiness",
    "designesy_guardrails": "guardrails", "designesy_monitor_score": "monitor",
    "designesy_compare": "compare", "designesy_report": "report",
}


@pytest.mark.parametrize("tool, engine", ENGINE_ROUTES.items())
def test_stated_rate_limit_is_the_routes(tool, engine):
    route = REPO / "apps" / "site" / "app" / "api" / engine / "route.ts"
    if not route.exists():
        pytest.skip("the site's engine routes are not in this checkout")
    limit = int(re.search(r"const RATE_LIMIT = (\d+)", route.read_text(encoding="utf-8")).group(1))
    stated = re.search(r"engine allows (\d+) \w+ an hour per address", mcp.TOOL_MAP[tool]["description"])
    assert stated and int(stated.group(1)) == limit, (tool, limit)


# ── 5. Output schemas fit real results ──────────────────────────────────────


class TestOutputSchemas:
    def test_only_the_scoring_tools_declare_one(self):
        assert sorted(n for n, t in mcp.TOOL_MAP.items() if "outputSchema" in t) == sorted(SCORING_TOOLS)

    @pytest.mark.parametrize("name", SCORING_TOOLS)
    def test_open_object_schemas(self, name):
        s = mcp.OUTPUT_SCHEMAS[name]
        assert s["type"] == "object" and s["additionalProperties"] is True
        assert _validate(s, {}) == [] or s.get("required"), name  # the validator itself runs

    def test_captured_results_conform(self):
        motion = json.loads((FIXTURES / "motion" / "expected.json").read_text(encoding="utf-8"))
        tokens = json.loads((FIXTURES / "tokens" / "expected.json").read_text(encoding="utf-8"))
        report = json.loads((FIXTURES / "trim" / "report-designesy-org.json").read_text(encoding="utf-8"))
        guard = json.loads((FIXTURES / "trim" / "guardrails-designesy-org.json").read_text(encoding="utf-8"))
        cases = [("designesy_motion_score", v) for v in motion.values()]
        cases += [("designesy_tokens_score", v) for v in tokens.values()]
        cases += [
            ("designesy_report", report), ("designesy_report", mcp._report_summary(report)),
            ("designesy_score", report["score"]), ("designesy_drift_score", report["drift"]),
            ("designesy_readiness_score", report["readiness"]),
            ("designesy_guardrails", guard), ("designesy_guardrails", mcp._guardrails_parts(guard, ["designMd"])),
        ]
        for tool, value in cases:
            assert _conforms(tool, value) == [], tool

    def test_the_offline_engine_result_conforms(self):
        result = mcp._offline_result("https://example.com/", "<html><body><main>x</main></body></html>", ":root{--paper:#fff}")
        assert _conforms("designesy_score", result) == []

    def test_a_wrong_type_is_refused(self):
        report = json.loads((FIXTURES / "trim" / "report-designesy-org.json").read_text(encoding="utf-8"))
        assert _conforms("designesy_drift_score", {**report["drift"], "score": "high"})
        assert _conforms("designesy_tokens_score", {"url": "u"})  # required fields missing

    def test_the_schemas_agree_with_a_full_validator_when_one_is_installed(self):
        jsonschema = pytest.importorskip("jsonschema")
        report = json.loads((FIXTURES / "trim" / "report-designesy-org.json").read_text(encoding="utf-8"))
        for name, schema in mcp.OUTPUT_SCHEMAS.items():
            jsonschema.Draft202012Validator.check_schema(schema)
        jsonschema.validate(report, mcp.OUTPUT_SCHEMAS["designesy_report"], cls=jsonschema.Draft202012Validator)
        with pytest.raises(jsonschema.ValidationError):
            jsonschema.validate({**report["drift"], "score": "high"}, mcp.OUTPUT_SCHEMAS["designesy_drift_score"], cls=jsonschema.Draft202012Validator)


# ── 6. tools/call: structuredContent on success, none on error ──────────────


class _Reply:
    def __init__(self, body: str):
        self._body = body.encode("utf-8")

    def read(self):
        return self._body

    def __enter__(self):
        return self

    def __exit__(self, *a):
        return False


def _http_error(url: str, code: int, body: dict | str, headers: dict | None = None) -> urllib.error.HTTPError:
    raw = body if isinstance(body, str) else json.dumps(body)
    return urllib.error.HTTPError(url, code, "Error", headers or {}, io.BytesIO(raw.encode("utf-8")))


def _engine(answer):
    """urlopen for /api/<engine>: answer is a dict (200 JSON), a str (200 text) or an exception."""
    def urlopen(req, timeout=None, context=None):
        if isinstance(answer, Exception):
            raise answer
        return _Reply(answer if isinstance(answer, str) else json.dumps(answer))
    return urlopen


REPORT = json.loads((FIXTURES / "trim" / "report-designesy-org.json").read_text(encoding="utf-8"))


class TestStructuredContent:
    @pytest.mark.parametrize("tool, args, reply", [
        ("designesy_drift_score", {"url": "https://example.com/"}, REPORT["drift"]),
        ("designesy_readiness_score", {"url": "https://example.com/"}, REPORT["readiness"]),
        ("designesy_score", {"url": "https://example.com/"}, REPORT["score"]),
        ("designesy_score", {"url": "https://example.com/", "format": "canonical"}, {"schemaVersion": "1.0", "findings": [], "summary": {}, "verdict": "pass"}),
        ("designesy_score", {"url": "https://example.com/", "format": "google"}, {"findings": [], "summary": {"errors": 0}, "designSystem": None}),
    ])
    def test_success_carries_the_same_json(self, tool, args, reply):
        with patch.object(mcp.urllib.request, "urlopen", _engine(reply)):
            res = _call(tool, args)
        assert res["isError"] is False
        assert res["structuredContent"] == json.loads(res["content"][0]["text"])
        assert _conforms(tool, res["structuredContent"]) == []

    def test_review_markdown_is_also_structured(self):
        md = "## Scope and Coverage\n\n| Domain | Evidence inspected | Result |\n"
        with patch.object(mcp.urllib.request, "urlopen", _engine(md)):
            res = _call("designesy_score", {"url": "https://example.com/", "format": "review"})
        assert res["content"] == [{"type": "text", "text": md}]
        assert res["structuredContent"] == {"format": "review", "markdown": md}
        assert _conforms("designesy_score", res["structuredContent"]) == []

    def test_report_through_the_tool(self):
        api = {k: v for k, v in REPORT.items() if k != "appUrl"}
        with patch.object(mcp, "_post_api", lambda endpoint, body: json.loads(json.dumps(api))):
            for detail in (None, "summary"):
                res = _call("designesy_report", {"url": "https://www.designesy.org/", **({"detail": detail} if detail else {})})
                assert res["isError"] is False and _conforms("designesy_report", res["structuredContent"]) == []

    def test_document_tools_carry_no_structured_content(self):
        with patch.object(mcp, "_fetch", lambda url, as_json=True: "# llms.txt\n"):
            res = _call("designesy_llms_txt", {})
        assert res["isError"] is False and "structuredContent" not in res


class TestErrors:
    def _engine_error(self, tool: str, args: dict, exc: Exception) -> dict:
        with patch.object(mcp.urllib.request, "urlopen", _engine(exc)):
            res = _call(tool, args)
        assert res["isError"] is True and "structuredContent" not in res, res
        return _payload(res)

    def test_rate_limit_is_retryable_after_the_wait(self):
        exc = _http_error("https://www.designesy.org/api/drift", 429, {"ok": False, "error": "Rate limit exceeded. Maximum 50 drift scans per hour."}, {"Retry-After": "37"})
        out = self._engine_error("designesy_drift_score", {"url": "https://example.com/"}, exc)
        assert out["retryable"] is True and out["url"] == "https://example.com/"
        assert "HTTP 429: Rate limit exceeded. Maximum 50 drift scans per hour. Retryable: yes, once. Wait 37 seconds first." in out["error"]

    def test_a_refused_url_is_final(self):
        exc = _http_error("https://www.designesy.org/api/drift", 400, {"ok": False, "error": "Invalid URL. Provide a public http(s) URL."})
        out = self._engine_error("designesy_drift_score", {"url": "http://127.0.0.1/"}, exc)
        assert out["retryable"] is False and "Retryable: no. Correct the input" in out["error"]

    def test_an_unreadable_page_is_one_retry_then_the_user(self):
        exc = _http_error("https://www.designesy.org/api/report", 502, {"ok": False, "error": "Could not read https://example.com/: the server returned HTTP 403 for every candidate URL."})
        out = self._engine_error("designesy_report", {"url": "https://example.com/"}, exc)
        assert out["retryable"] is True and "check the URL with the user" in out["error"]

    def test_an_engine_outage_is_retryable(self):
        out = self._engine_error("designesy_compare", {"urlA": "https://a.example/", "urlB": "https://b.example/"}, urllib.error.URLError("timed out"))
        assert out["retryable"] is True and out["urlA"] == "https://a.example/"
        assert "Could not reach the compare engine" in out["error"]

    def test_a_platform_error_page_is_retryable(self):
        exc = _http_error("https://www.designesy.org/api/guardrails", 504, "An error occurred with your deployment")
        out = self._engine_error("designesy_guardrails", {"url": "https://example.com/"}, exc)
        assert out["retryable"] is True and "failed or timed out" in out["error"]

    @pytest.mark.parametrize("exc, retryable, says", [
        (ValueError("Blocked: internal host 'localhost'"), False, "is not a public http(s) URL"),
        (_http_error("https://example.com/t.json", 403, "denied"), False, "pass its contents as dtcg_file"),
        (_http_error("https://example.com/t.json", 404, "missing"), False, "Check the URL with the user"),
        (_http_error("https://example.com/t.json", 503, "busy"), True, "HTTP 503"),
        (urllib.error.URLError(socket.gaierror(11001, "getaddrinfo failed")), False, "did not resolve"),
        (urllib.error.URLError(TimeoutError("timed out")), True, "Could not read"),
        (json.JSONDecodeError("Expecting value", "<html>", 0), False, "did not return JSON"),
    ])
    def test_token_file_failures(self, exc, retryable, says):
        contract = json.loads((FIXTURES / "tokens" / "contract.json").read_text(encoding="utf-8"))

        def fake(url, as_json=True):
            if "designesy.org/contracts" in url:
                return contract
            raise exc

        with patch.object(mcp, "_fetch", fake):
            res = _call("designesy_tokens_score", {"url": "https://example.com/t.json"})
        out = _payload(res)
        assert res["isError"] is True and "structuredContent" not in res
        assert out["retryable"] is retryable and says in out["error"], out["error"]
        assert f"Retryable: {'yes, once' if retryable else 'no'}." in out["error"]

    def test_designesy_org_unreachable_is_retryable(self):
        def fake(url, as_json=True):
            raise urllib.error.URLError("connection reset")

        with patch.object(mcp, "_fetch", fake):
            res = _call("designesy_catalog", {})
        out = _payload(res)
        assert res["isError"] is True and out["retryable"] is True and "open.json" in out["error"]

    def test_offline_fallback_that_cannot_read_the_page(self):
        with patch.object(mcp.urllib.request, "urlopen", _engine(urllib.error.URLError("network unreachable"))):
            res = _call("designesy_score", {"url": "http://localhost/"})
        out = _payload(res)
        assert res["isError"] is True and "structuredContent" not in res
        assert out["retryable"] is False and "offline engine could not read the page" in out["error"]

    def test_input_errors_say_they_are_final(self):
        res = _call("designesy_a11y_score", {"url": "https://example.com/", "config": "{nope"})
        out = _payload(res)
        assert res["isError"] is True and out["retryable"] is False and "Retryable: no." in out["error"]


# ── 7. Protocol ─────────────────────────────────────────────────────────────


def _initialize(params: dict | None) -> dict:
    msg = {"jsonrpc": "2.0", "id": 1, "method": "initialize"}
    if params is not None:
        msg["params"] = params
    return mcp._handle(msg)["result"]


class TestProtocol:
    @pytest.mark.parametrize("version", ["2025-11-25", "2025-06-18", "2025-03-26", "2024-11-05"])
    def test_a_supported_revision_is_answered_with_itself(self, version):
        assert _initialize({"protocolVersion": version, "capabilities": {}, "clientInfo": {"name": "t", "version": "1"}})["protocolVersion"] == version

    @pytest.mark.parametrize("params", [
        {"protocolVersion": "2099-01-01"},
        {"protocolVersion": "1.0.0"},
        {"protocolVersion": 20251125},
        {},
        None,
    ])
    def test_otherwise_the_latest_supported_revision(self, params):
        assert _initialize(params)["protocolVersion"] == "2025-11-25" == mcp.SUPPORTED_PROTOCOL_VERSIONS[0]

    def test_supported_revisions_are_newest_first(self):
        assert list(mcp.SUPPORTED_PROTOCOL_VERSIONS) == sorted(mcp.SUPPORTED_PROTOCOL_VERSIONS, reverse=True)

    def test_initialize_returns_the_instructions(self):
        res = _initialize({"protocolVersion": "2025-11-25"})
        assert res["instructions"] == mcp.SERVER_INSTRUCTIONS
        assert res["serverInfo"] == {"name": mcp.SERVER_NAME, "version": mcp.SERVER_VERSION}

    def test_unknown_tool_is_invalid_params(self):
        msg = mcp._handle({"jsonrpc": "2.0", "id": 3, "method": "tools/call", "params": {"name": "invalid_tool_name", "arguments": {}}})
        assert msg["error"] == {"code": -32602, "message": "Unknown tool: invalid_tool_name"}

    def test_tools_list_carries_the_definitions(self):
        tools = mcp._handle({"jsonrpc": "2.0", "id": 2, "method": "tools/list"})["result"]["tools"]
        by_name = {t["name"]: t for t in tools}
        for name in SCORING_TOOLS:
            assert by_name[name]["outputSchema"] == GOLDEN["output_schemas"][name]
        assert by_name["designesy_catalog"]["inputSchema"] == {"type": "object", "additionalProperties": False}
