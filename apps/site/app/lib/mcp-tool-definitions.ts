// What both MCP servers state alike about their tools: the server
// instructions, the input schema of a tool that takes no parameters, and the
// output schema of each scoring tool.
//
// WHY THIS MODULE EXISTS
// The hosted endpoint (app/api/mcp/route.ts) and the PyPI stdio server
// (packages/designesy-mcp/designesy_mcp_server.py) serve the same tools, and a
// client reads these definitions to learn what a tool returns. A schema
// written twice by hand drifts, and on the hosted endpoint a result that does
// not match its outputSchema is refused by the SDK, so the call fails. Both
// copies are compared with one golden,
// packages/designesy-mcp/test/fixtures/tool-definitions.json:
// scripts/check-mcp-tool-parity.js checks this module and validates captured
// results against the schemas, and the PyPI suite (test/test_tool_definitions.py)
// does the same for the Python copy.
//
// OUTPUT SCHEMAS (MCP 2025-11-25, server/tools): a tool that declares an
// outputSchema MUST return structuredContent that conforms to it. So each
// schema documents only what the code returns on a success path, marks as
// required only the fields every success carries, and allows additional
// properties, so a field an engine adds later does not fail the call. An error
// result carries isError and no structuredContent.
//
// PURE AND IMPORT-FREE: the parity gate loads this file with Node's type
// stripping.

/** The server instructions (initialize result), 2,048 characters at most. */
export const MCP_SERVER_INSTRUCTIONS = [
  'Designesy (designesy.org) publishes a design-system contract and rule-based engines that check web pages and design files against it. The tools fall into seven groups.',
  'Score a page: designesy_score, the full contract audit (0-100 and A-F).',
  'Check a design file: designesy_tokens_score (a DTCG token file) and designesy_motion_score (a Lottie file). designesy_a11y_score returns the WCAG 2.2 AA checks with a Playwright and axe-core script to run locally; it scans nothing itself.',
  'Check a site\'s own system: designesy_drift_score (drift in its tokens), designesy_readiness_score (machine-readable files for AI tools) and designesy_guardrails (a token file, lint config, agent rules and DESIGN.md generated from its tokens).',
  'Watch over time: designesy_monitor_score (drift against earlier snapshots passed as history; can send an alert email when given an address).',
  'Compare two sites: designesy_compare (their tokens diffed).',
  'Combine: designesy_report (score, drift and readiness in one composite grade).',
  'Reference: designesy_contract (the contract JSON), designesy_catalog (the published packages) and designesy_design_review (a critique rubric); designesy_llms_txt, designesy_llms_full_txt, designesy_agent_json and designesy_skill_md return published documents. Rubric and documents come back as reference data, leaving out any part written as instructions for an AI agent.',
  'Scores come from fixed rules applied to the page or file: no language model takes part, so the same input gives the same verdict. The page engines behind score, drift, readiness, guardrails, monitor, compare and report cache each result for about 24 hours. Tools that read a URL refuse non-http(s) URLs, localhost and private IP addresses. An error from a page, file or engine that cannot be reached or read says whether one retry can help.',
].join('\n');

/** The input schema of a tool that takes no parameters (the spec's recommended form). */
export const NO_PARAMETER_INPUT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
};

/** The output schema of each scoring tool, by tool name. */
export const MCP_OUTPUT_SCHEMAS = {
  designesy_score: {
    type: 'object',
    description: 'One score result. Which fields appear depends on format and on the server: no field is required, and fields not listed here may appear.',
    properties: {
      ok: {
        type: 'boolean',
        description: 'format designesy from the engine: true when the engine ran.',
      },
      score: {
        type: ['number', 'null'],
        description: 'format designesy: weighted score 0-100 after the slop deduction; null when the page could not be read.',
      },
      grade: {
        type: ['string', 'null'],
        description: 'Letter grade A-F; null when the page could not be read.',
      },
      pass: {
        type: 'integer',
        minimum: 0,
      },
      fail: {
        type: 'integer',
        minimum: 0,
      },
      warn: {
        type: 'integer',
        minimum: 0,
      },
      skip: {
        type: 'integer',
        minimum: 0,
      },
      manual: {
        type: 'integer',
        minimum: 0,
      },
      total: {
        type: 'integer',
        minimum: 0,
      },
      scope: {
        type: 'string',
        enum: ['contract', 'universal'],
        description: 'The scoring scope the engine applied.',
      },
      contractVersion: {
        type: 'string',
        description: 'The design contract version scored against (engine JSON).',
      },
      checks: {
        type: 'array',
        description: 'Every check with its verdict; engine JSON also carries remediation and weight.',
        items: {
          type: 'object',
          properties: {
            id: {
              type: 'string',
            },
            item: {
              type: 'string',
              description: 'What the check verifies.',
            },
            category: {
              type: 'string',
            },
            status: {
              type: 'string',
              enum: ['PASS', 'FAIL', 'WARN', 'SKIP', 'MANUAL'],
            },
            detail: {
              type: 'string',
              description: 'What the engine found.',
            },
          },
          required: ['id', 'status'],
        },
      },
      categoryScores: {
        type: 'object',
        description: 'Per category: score, weight and counts.',
      },
      slop: {
        type: 'object',
        description: 'The slop deduction: generic, template-like patterns found on the page (findings with id S1-S12, label, instances, evidence and deduction) and total, the points subtracted from the score (at most 5 per pattern, 20 in all).',
        properties: {
          total: {
            type: 'number',
            minimum: 0,
            maximum: 20,
          },
          findings: {
            type: 'array',
            items: {
              type: 'object',
            },
          },
          convergences: {
            type: ['string', 'null'],
          },
        },
      },
      receipt: {
        type: 'object',
        description: 'Reproducibility receipt: subject, retrieved_at, contract and engine versions, scope, and a digest of the verdict set (null when nothing was measured).',
      },
      unreachable: {
        type: 'boolean',
        description: 'true when the page could not be read; score and grade are then null.',
      },
      unreachableReason: {
        type: 'string',
        description: 'http_error, timeout, network or empty_body.',
      },
      unreachableDetail: {
        type: 'string',
      },
      url: {
        type: 'string',
        description: 'The scored URL (the stdio package\'s designesy format).',
      },
      contract_version: {
        type: 'string',
        description: 'The stdio package\'s designesy format: the contract version scored against.',
      },
      summary: {
        type: 'object',
        description: 'Counts, score and grade: format canonical and google, and the stdio package\'s designesy format (score 0-1, score_percent 0-100).',
      },
      tokens_extracted: {
        type: 'integer',
        minimum: 0,
      },
      tokensExtracted: {
        type: 'integer',
        minimum: 0,
      },
      note: {
        type: 'string',
        description: 'The stdio package\'s designesy format: how the result was produced.',
      },
      engine: {
        type: 'object',
        description: 'Present when the stdio package\'s offline engine produced the result: which checks it ran and did not run.',
      },
      findings: {
        type: 'array',
        description: 'format canonical and google: the checks as findings.',
        items: {
          type: 'object',
        },
      },
      verdict: {
        type: 'string',
        description: 'format canonical: pass, needs-changes, fail or not-scored.',
      },
      format: {
        type: 'string',
        enum: ['review'],
        description: 'Present only for format review.',
      },
      markdown: {
        type: 'string',
        description: 'format review: the engine\'s markdown report, the same text as the content block.',
      },
    },
    additionalProperties: true,
  },
  designesy_tokens_score: {
    type: 'object',
    description: 'The tokens contract\'s ten checks (t01-t10) on one DTCG token file.',
    properties: {
      contract_id: {
        type: ['string', 'null'],
        description: 'The contract the checks come from.',
      },
      contract_version: {
        type: ['string', 'null'],
      },
      contract_status: {
        type: ['string', 'null'],
      },
      url: {
        type: 'string',
        description: 'The token file\'s URL, or (inline dtcg_file).',
      },
      total_tokens: {
        type: 'integer',
        minimum: 0,
      },
      score: {
        type: 'number',
        minimum: 0,
        maximum: 100,
        description: 'PASS=1, WARN=0.5, FAIL=0; SKIP is not scored; points / scored checks x 100.',
      },
      grade: {
        type: 'string',
        enum: ['A', 'B', 'C', 'D', 'F'],
        description: 'Letter grade from the score: A>=90, B>=80, C>=70, D>=60, F below.',
      },
      pass_count: {
        type: 'integer',
        minimum: 0,
      },
      fail_count: {
        type: 'integer',
        minimum: 0,
      },
      warn_count: {
        type: 'integer',
        minimum: 0,
      },
      skip_count: {
        type: 'integer',
        minimum: 0,
      },
      scoring: {
        type: 'string',
      },
      checks: {
        type: 'array',
        description: 'One entry per check (t01-t10), named by the contract.',
        items: {
          type: 'object',
          properties: {
            id: {
              type: 'string',
            },
            name: {
              type: 'string',
            },
            status: {
              type: 'string',
              enum: ['PASS', 'FAIL', 'WARN', 'SKIP'],
            },
            detail: {
              type: 'string',
            },
          },
          required: ['id', 'name', 'status'],
        },
      },
      provenance: {
        type: 'string',
      },
      validator_note: {
        type: 'string',
      },
    },
    required: [
      'url',
      'total_tokens',
      'score',
      'grade',
      'pass_count',
      'fail_count',
      'warn_count',
      'skip_count',
      'checks',
    ],
    additionalProperties: true,
  },
  designesy_a11y_score: {
    type: 'object',
    description: 'The accessibility contract\'s checks and a Playwright + axe-core script to run locally; nothing is scanned by this tool.',
    properties: {
      contract_id: {
        type: ['string', 'null'],
        description: 'The contract the checks come from.',
      },
      contract_version: {
        type: ['string', 'null'],
      },
      contract_status: {
        type: ['string', 'null'],
      },
      url: {
        type: 'string',
        description: 'The URL written into the script.',
      },
      ruleset: {
        type: 'string',
        description: 'The axe-core tag the script filters on.',
      },
      brand_config: {
        type: ['object', 'null'],
        description: 'The parsed config, or null.',
      },
      summary: {
        type: 'string',
      },
      checks: {
        type: 'array',
        description: 'The contract\'s checks (a01-a11), each PENDING_EXECUTION until the script runs.',
        items: {
          type: 'object',
          properties: {
            id: {
              type: 'string',
            },
            name: {
              type: 'string',
            },
            status: {
              type: 'string',
              enum: ['PENDING_EXECUTION'],
            },
          },
          required: ['id', 'name', 'status'],
        },
      },
      playwright_script: {
        type: 'string',
        description: 'A Playwright test that runs axe-core on url and prints a score.',
      },
      install_command: {
        type: 'string',
      },
      run_command: {
        type: 'string',
      },
      provenance: {
        type: 'string',
      },
      priority: {
        type: 'string',
      },
    },
    required: ['url', 'ruleset', 'checks', 'playwright_script', 'install_command', 'run_command'],
    additionalProperties: true,
  },
  designesy_motion_score: {
    type: 'object',
    description: 'The motion contract\'s ten checks (m01-m10) on one Lottie file.',
    properties: {
      contract_id: {
        type: ['string', 'null'],
        description: 'The contract the checks come from.',
      },
      contract_version: {
        type: ['string', 'null'],
      },
      contract_status: {
        type: ['string', 'null'],
      },
      url: {
        type: 'string',
        description: 'The Lottie file\'s URL, or (inline lottie_file).',
      },
      lottie_version: {
        type: ['string', 'null'],
        description: 'The file\'s v field.',
      },
      layer_count: {
        type: 'integer',
        minimum: 0,
      },
      score: {
        type: 'number',
        minimum: 0,
        maximum: 100,
        description: 'PASS=1, WARN=0.5, FAIL=0; SKIP is not scored; points / scored checks x 100.',
      },
      grade: {
        type: 'string',
        enum: ['A', 'B', 'C', 'D', 'F'],
        description: 'Letter grade from the score: A>=90, B>=80, C>=70, D>=60, F below.',
      },
      pass_count: {
        type: 'integer',
        minimum: 0,
      },
      fail_count: {
        type: 'integer',
        minimum: 0,
      },
      warn_count: {
        type: 'integer',
        minimum: 0,
      },
      skip_count: {
        type: 'integer',
        minimum: 0,
      },
      scoring: {
        type: 'string',
      },
      checks: {
        type: 'array',
        description: 'One entry per check (m01-m10), named by the contract.',
        items: {
          type: 'object',
          properties: {
            id: {
              type: 'string',
            },
            name: {
              type: 'string',
            },
            status: {
              type: 'string',
              enum: ['PASS', 'FAIL', 'WARN', 'SKIP'],
            },
            detail: {
              type: 'string',
            },
          },
          required: ['id', 'name', 'status'],
        },
      },
      ten_non_negotiable: {
        type: 'array',
        description: 'The contract\'s ten motion standards.',
      },
      provenance: {
        type: 'string',
      },
      validator_note: {
        type: 'string',
      },
    },
    required: [
      'url',
      'layer_count',
      'score',
      'grade',
      'pass_count',
      'fail_count',
      'warn_count',
      'skip_count',
      'checks',
    ],
    additionalProperties: true,
  },
  designesy_drift_score: {
    type: 'object',
    description: 'The drift engine\'s twelve checks (d01-d12) on one page.',
    properties: {
      ok: {
        type: 'boolean',
      },
      url: {
        type: 'string',
      },
      scope: {
        type: 'string',
        enum: ['contract', 'universal'],
        description: 'universal turns d01 into SKIP when the page declares no custom properties.',
      },
      score: {
        type: 'number',
        minimum: 0,
        maximum: 100,
        description: 'PASS=1, WARN=0.5, FAIL=0 over the checks that are not SKIP.',
      },
      grade: {
        type: 'string',
        enum: ['A', 'B', 'C', 'D', 'F'],
        description: 'Letter grade from the score: A>=90, B>=80, C>=70, D>=60, F below.',
      },
      pass: {
        type: 'integer',
        minimum: 0,
      },
      warn: {
        type: 'integer',
        minimum: 0,
      },
      fail: {
        type: 'integer',
        minimum: 0,
      },
      skip: {
        type: 'integer',
        minimum: 0,
      },
      total: {
        type: 'integer',
        minimum: 0,
      },
      tokensExtracted: {
        type: 'integer',
        minimum: 0,
        description: 'Custom properties declared in :root.',
      },
      checks: {
        type: 'array',
        description: 'd01-d12.',
        items: {
          type: 'object',
          properties: {
            id: {
              type: 'string',
            },
            item: {
              type: 'string',
              description: 'What the check verifies.',
            },
            category: {
              type: 'string',
            },
            status: {
              type: 'string',
              enum: ['PASS', 'FAIL', 'WARN', 'SKIP', 'MANUAL'],
            },
            detail: {
              type: 'string',
              description: 'What the engine found.',
            },
          },
          required: ['id', 'status'],
        },
      },
    },
    required: ['ok', 'url', 'score', 'grade', 'checks'],
    additionalProperties: true,
  },
  designesy_readiness_score: {
    type: 'object',
    description: 'The readiness engine\'s ten probes (r01-r10) of one origin.',
    properties: {
      ok: {
        type: 'boolean',
      },
      url: {
        type: 'string',
      },
      score: {
        type: 'number',
        minimum: 0,
        maximum: 100,
        description: 'PASS=1, WARN=0.5, FAIL=0 over all ten checks.',
      },
      grade: {
        type: 'string',
        enum: ['A', 'B', 'C', 'D', 'F'],
        description: 'Letter grade from the score: A>=90, B>=80, C>=70, D>=60, F below.',
      },
      pass: {
        type: 'integer',
        minimum: 0,
      },
      warn: {
        type: 'integer',
        minimum: 0,
      },
      fail: {
        type: 'integer',
        minimum: 0,
      },
      total: {
        type: 'integer',
        minimum: 0,
      },
      checks: {
        type: 'array',
        description: 'r01-r10.',
        items: {
          type: 'object',
          properties: {
            id: {
              type: 'string',
            },
            item: {
              type: 'string',
              description: 'What the check verifies.',
            },
            category: {
              type: 'string',
            },
            status: {
              type: 'string',
              enum: ['PASS', 'FAIL', 'WARN', 'SKIP', 'MANUAL'],
            },
            detail: {
              type: 'string',
              description: 'What the engine found.',
            },
          },
          required: ['id', 'status'],
        },
      },
    },
    required: ['ok', 'url', 'score', 'grade', 'checks'],
    additionalProperties: true,
  },
  designesy_guardrails: {
    type: 'object',
    description: 'The build-contract bundle generated from one page\'s :root custom properties, with six emission checks (g01-g06).',
    properties: {
      ok: {
        type: 'boolean',
      },
      url: {
        type: 'string',
      },
      score: {
        type: 'number',
        minimum: 0,
        maximum: 100,
        description: 'Emission completeness, not design quality.',
      },
      grade: {
        type: 'string',
        enum: ['A', 'B', 'C', 'D', 'F'],
        description: 'Letter grade from the score: A>=90, B>=80, C>=70, D>=60, F below.',
      },
      pass: {
        type: 'integer',
        minimum: 0,
      },
      warn: {
        type: 'integer',
        minimum: 0,
      },
      fail: {
        type: 'integer',
        minimum: 0,
      },
      total: {
        type: 'integer',
        minimum: 0,
      },
      tokensExtracted: {
        type: 'integer',
        minimum: 0,
        description: 'Custom properties found in :root.',
      },
      parts: {
        type: 'array',
        description: 'Present when parts was passed: the bundle files returned, in the order asked.',
        items: {
          type: 'string',
          enum: ['tokens', 'lintConfig', 'agentRules', 'componentContract', 'antiPatterns', 'designMd'],
        },
      },
      bundle: {
        type: 'object',
        description: 'tokens (DTCG token file), lintConfig (Stylelint config), agentRules (AGENTS.md text), componentContract, antiPatterns and designMd (DESIGN.md text); with parts, only the named files.',
      },
      checks: {
        type: 'array',
        description: 'g01-g06.',
        items: {
          type: 'object',
          properties: {
            id: {
              type: 'string',
            },
            item: {
              type: 'string',
              description: 'What the check verifies.',
            },
            category: {
              type: 'string',
            },
            status: {
              type: 'string',
              enum: ['PASS', 'FAIL', 'WARN', 'SKIP', 'MANUAL'],
            },
            detail: {
              type: 'string',
              description: 'What the engine found.',
            },
          },
          required: ['id', 'status'],
        },
      },
    },
    required: ['ok', 'url', 'score', 'grade', 'bundle', 'checks'],
    additionalProperties: true,
  },
  designesy_monitor_score: {
    type: 'object',
    description: 'One monitor run: the twelve drift checks on the page and ten governance checks (m01-m10) against the history passed in.',
    properties: {
      ok: {
        type: 'boolean',
      },
      url: {
        type: 'string',
      },
      score: {
        type: 'number',
        minimum: 0,
        maximum: 100,
        description: 'Governance health from the monitor checks, not design quality.',
      },
      grade: {
        type: 'string',
        enum: ['A', 'B', 'C', 'D', 'F'],
        description: 'Letter grade from the score: A>=90, B>=80, C>=70, D>=60, F below.',
      },
      pass: {
        type: 'integer',
        minimum: 0,
      },
      warn: {
        type: 'integer',
        minimum: 0,
      },
      fail: {
        type: 'integer',
        minimum: 0,
      },
      total: {
        type: 'integer',
        minimum: 0,
      },
      currentSnapshot: {
        type: 'object',
        description: 'This run as a snapshot (timestamp, score, grade, tokensExtracted, checks); pass it back in history next time.',
      },
      baseline: {
        type: ['object', 'null'],
        description: 'The first snapshot in history, or null.',
      },
      previous: {
        type: ['object', 'null'],
        description: 'The last snapshot in history, or null.',
      },
      driftChecks: {
        type: 'array',
        description: 'd01-d12 for this run.',
        items: {
          type: 'object',
          properties: {
            id: {
              type: 'string',
            },
            item: {
              type: 'string',
              description: 'What the check verifies.',
            },
            category: {
              type: 'string',
            },
            status: {
              type: 'string',
              enum: ['PASS', 'FAIL', 'WARN', 'SKIP', 'MANUAL'],
            },
            detail: {
              type: 'string',
              description: 'What the engine found.',
            },
          },
          required: ['id', 'status'],
        },
      },
      monitorChecks: {
        type: 'array',
        description: 'm01-m10.',
        items: {
          type: 'object',
          properties: {
            id: {
              type: 'string',
            },
            item: {
              type: 'string',
              description: 'What the check verifies.',
            },
            category: {
              type: 'string',
            },
            status: {
              type: 'string',
              enum: ['PASS', 'FAIL', 'WARN', 'SKIP', 'MANUAL'],
            },
            detail: {
              type: 'string',
              description: 'What the engine found.',
            },
          },
          required: ['id', 'status'],
        },
      },
      alerts: {
        type: 'array',
        items: {
          type: 'string',
        },
        description: 'The alert conditions this run raised.',
      },
      emailAlert: {
        type: 'object',
        description: 'Present when an email was given and alerts fired: attempted, delivered, recipient and error.',
      },
    },
    required: ['ok', 'url', 'score', 'grade', 'monitorChecks', 'alerts'],
    additionalProperties: true,
  },
  designesy_compare: {
    type: 'object',
    description: 'The diff of two pages\' :root custom properties, with eight diff checks (c01-c08).',
    properties: {
      ok: {
        type: 'boolean',
      },
      urlA: {
        type: 'string',
      },
      urlB: {
        type: 'string',
      },
      score: {
        type: 'number',
        minimum: 0,
        maximum: 100,
        description: 'Diff completeness, not design quality.',
      },
      grade: {
        type: 'string',
        enum: ['A', 'B', 'C', 'D', 'F'],
        description: 'Letter grade from the score: A>=90, B>=80, C>=70, D>=60, F below.',
      },
      pass: {
        type: 'integer',
        minimum: 0,
      },
      warn: {
        type: 'integer',
        minimum: 0,
      },
      fail: {
        type: 'integer',
        minimum: 0,
      },
      total: {
        type: 'integer',
        minimum: 0,
      },
      tokensA: {
        type: 'integer',
        minimum: 0,
      },
      tokensB: {
        type: 'integer',
        minimum: 0,
      },
      added: {
        type: 'array',
        description: 'Tokens in A and not in B.',
        items: {
          type: 'object',
        },
      },
      removed: {
        type: 'array',
        description: 'Tokens in B and not in A.',
        items: {
          type: 'object',
        },
      },
      renamed: {
        type: 'array',
        description: 'Likely renames (name distance 2 or less): from, to, distance, valueA, valueB.',
        items: {
          type: 'object',
        },
      },
      valueChanged: {
        type: 'array',
        description: 'Same name, different value.',
        items: {
          type: 'object',
        },
      },
      scaleDiff: {
        type: 'object',
        description: 'Spacing, radius and color scale sizes in A and B.',
      },
      structureDelta: {
        type: 'object',
        description: 'Token counts and category distribution in A and B.',
      },
      contrastDrift: {
        type: 'array',
        description: 'Contrast ratio change for shared color tokens.',
        items: {
          type: 'object',
        },
      },
      scoreDelta: {
        type: ['object', 'null'],
        description: 'Both pages\' designesy_score scores and grades and their difference; null when either could not be scored.',
      },
      checks: {
        type: 'array',
        description: 'c01-c08.',
        items: {
          type: 'object',
          properties: {
            id: {
              type: 'string',
            },
            item: {
              type: 'string',
              description: 'What the check verifies.',
            },
            category: {
              type: 'string',
            },
            status: {
              type: 'string',
              enum: ['PASS', 'FAIL', 'WARN', 'SKIP', 'MANUAL'],
            },
            detail: {
              type: 'string',
              description: 'What the engine found.',
            },
          },
          required: ['id', 'status'],
        },
      },
    },
    required: ['ok', 'urlA', 'urlB', 'score', 'grade', 'checks'],
    additionalProperties: true,
  },
  designesy_report: {
    type: 'object',
    description: 'The composite report: the score, drift and readiness engines run on one URL and weighted into one grade.',
    properties: {
      ok: {
        type: 'boolean',
      },
      url: {
        type: 'string',
      },
      compositeScore: {
        type: 'number',
        minimum: 0,
        maximum: 100,
        description: 'score x 0.5 + drift x 0.3 + readiness x 0.2, re-weighted when an engine returned no score.',
      },
      compositeGrade: {
        type: 'string',
        enum: ['A', 'B', 'C', 'D', 'F'],
        description: 'Letter grade from the score: A>=90, B>=80, C>=70, D>=60, F below.',
      },
      score: {
        type: 'object',
        description: 'The score engine\'s result (with detail summary: its single values only).',
      },
      drift: {
        type: 'object',
        description: 'The drift engine\'s result (with detail summary: its single values only).',
      },
      readiness: {
        type: 'object',
        description: 'The readiness engine\'s result (with detail summary: its single values only).',
      },
      totalChecks: {
        type: 'integer',
        minimum: 0,
      },
      totalPass: {
        type: 'integer',
        minimum: 0,
      },
      totalWarn: {
        type: 'integer',
        minimum: 0,
      },
      totalFail: {
        type: 'integer',
        minimum: 0,
      },
      totalSkip: {
        type: 'integer',
        minimum: 0,
      },
      totalManual: {
        type: 'integer',
        minimum: 0,
      },
      checks: {
        type: 'array',
        description: 'Every engine\'s checks, each tagged with engine; with detail summary, only those that did not PASS.',
        items: {
          type: 'object',
          properties: {
            id: {
              type: 'string',
            },
            item: {
              type: 'string',
              description: 'What the check verifies.',
            },
            category: {
              type: 'string',
            },
            status: {
              type: 'string',
              enum: ['PASS', 'FAIL', 'WARN', 'SKIP', 'MANUAL'],
            },
            detail: {
              type: 'string',
              description: 'What the engine found.',
            },
          },
          required: ['id', 'status'],
        },
      },
      synthesis: {
        type: 'array',
        description: 'rp01-rp08: whether each engine ran and the composite holds; with detail summary, only those that did not PASS.',
        items: {
          type: 'object',
          properties: {
            id: {
              type: 'string',
            },
            item: {
              type: 'string',
              description: 'What the check verifies.',
            },
            category: {
              type: 'string',
            },
            status: {
              type: 'string',
              enum: ['PASS', 'FAIL', 'WARN', 'SKIP', 'MANUAL'],
            },
            detail: {
              type: 'string',
              description: 'What the engine found.',
            },
          },
          required: ['id', 'status'],
        },
      },
      appUrl: {
        type: 'string',
        description: 'The interactive dashboard for this URL in a browser.',
      },
      detail: {
        type: 'string',
        enum: ['summary'],
        description: 'Present only with detail summary.',
      },
      omitted: {
        type: 'object',
        description: 'With detail summary: how many PASS rows were left out, and what else.',
      },
    },
    required: ['ok', 'url', 'checks', 'synthesis', 'appUrl'],
    additionalProperties: true,
  },
};

/** The tools that declare an output schema. */
export type McpScoringTool = keyof typeof MCP_OUTPUT_SCHEMAS;
