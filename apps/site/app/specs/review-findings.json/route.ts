// /specs/review-findings.json — Designesy Design Review Findings Schema v1.0
//
// The canonical format for design verification findings. One JSON envelope
// that any design verification tool can populate. Agents consuming findings
// from multiple verifiers (designesy, Google design.md, Lighthouse, axe,
// jakubkrehel/skills) need a common schema to aggregate, compare, and act.
//
// This schema is a superset: each tool populates the subset of fields it has.
// Fields that a tool does not produce are omitted (not set to null). The
// `tool` field identifies the producer so consumers can route by source.
//
// designesy_score emits this schema natively via POST /api/score?format=designesy
// (default). The `review` and `google` emission formats are lossy projections
// of this canonical shape — the canonical JSON is the source of truth.
//
// Provenance: synthesized from Google @google/design.md lint() output
// ({findings, summary, designSystem}), Lighthouse LHR top-level structure,
// and jakubkrehel/skills better-interface markdown report format (Scope,
// Findings, Considered-but-Rejected, Verification, Verdict).

export const dynamic = 'force-static';

const SCHEMA = {
  $schema: 'https://www.designesy.org/specs/review-findings.json',
  $id: 'https://www.designesy.org/specs/review-findings.json',
  title: 'Design Review Findings',
  description:
    'Canonical format for design verification findings. A superset schema that accommodates designesy, Google design.md, Lighthouse, and jakubkrehel/skills outputs. Agents consuming findings from multiple verifiers need a common schema.',
  type: 'object',
  required: ['schemaVersion', 'tool', 'subject', 'findings', 'summary', 'verdict'],

  properties: {
    schemaVersion: {
      type: 'string',
      const: '1.0',
      description: 'Schema version. Increment on breaking changes.',
    },

    generatedAt: {
      type: 'string',
      format: 'date-time',
      description: 'ISO 8601 timestamp when the report was generated.',
    },

    tool: {
      type: 'object',
      required: ['name'],
      description: 'The verification tool that produced this report.',
      properties: {
        name: {
          type: 'string',
          description: 'Tool identifier: designesy, design.md-linter, lighthouse, better-interface, axe, etc.',
        },
        version: {
          type: 'string',
          description: 'Tool version. designesy contract version (v0.3.0), Lighthouse version (12.0.0), etc.',
        },
        userAgent: {
          type: 'string',
          description: 'User agent if the tool fetched the subject via HTTP.',
        },
      },
    },

    subject: {
      type: 'object',
      required: ['type', 'requested'],
      description: 'The artifact under review.',
      properties: {
        type: {
          type: 'string',
          enum: ['url', 'file', 'token-spec', 'component-set', 'screen-flow'],
          description: 'The kind of subject: a live URL, a file path, a token spec, etc.',
        },
        requested: {
          type: 'string',
          description: 'The URL or path as supplied to the tool.',
        },
        final: {
          type: 'string',
          description: 'The final URL after redirects (if different from requested).',
        },
      },
    },

    config: {
      type: 'object',
      description: 'Tool configuration (ruleset, thresholds, categories enabled). Opaque.',
    },

    coverage: {
      type: 'array',
      description: 'Scope and coverage table (jakubkrehel pattern). One row per domain reviewed.',
      items: {
        type: 'object',
        properties: {
          domain: {
            type: 'string',
            description: 'Review domain: accessibility, layout, writing, typography, colors, ui, tokens, motion, security, spec.',
          },
          evidenceInspected: {
            type: 'string',
            description: 'What was examined (CSS, HTML, screenshots, code).',
          },
          result: {
            type: 'string',
            description: 'Findings count, "Clear", or "Not reviewed: reason".',
          },
        },
      },
    },

    categories: {
      type: 'array',
      description: 'Category scores (designesy categoryScores, Lighthouse categories). Each category gets a 0-100 score.',
      items: {
        type: 'object',
        properties: {
          id: { type: 'string', description: 'Category identifier (cadence, accessibility, performance, etc.)' },
          title: { type: 'string', description: 'Human-readable category name.' },
          description: { type: 'string' },
          score: {
            type: ['number', 'null'],
            description: 'Category score 0-100 (designesy) or 0-1 (Lighthouse). null if unscored.',
            minimum: 0,
            maximum: 100,
          },
          weight: {
            type: 'number',
            description: 'Category weight in the composite score (designesy).',
          },
          counts: {
            type: 'object',
            properties: {
              pass: { type: 'integer' },
              fail: { type: 'integer' },
              warn: { type: 'integer' },
              skip: { type: 'integer' },
            },
          },
        },
      },
    },

    findings: {
      type: 'array',
      description: 'Individual check findings. Each finding is one check result from the verification engine.',
      items: { $ref: '#/$defs/finding' },
    },

    consideredButRejected: {
      type: 'array',
      description: 'Findings considered during review but rejected (jakubkrehel pattern). Opaque for most tools.',
      items: {
        type: 'object',
        properties: {
          location: { type: 'string' },
          candidate: { type: 'string', description: 'The proposed finding or fix.' },
          rejectedBecause: { type: 'string' },
        },
      },
    },

    verification: {
      type: 'array',
      description: 'Verification steps taken (jakubkrehel pattern). Commands run, interactions tested.',
      items: {
        type: 'object',
        properties: {
          check: { type: 'string' },
          command: { type: 'string' },
          observedResult: { type: 'string' },
          verified: { type: 'boolean' },
        },
      },
    },

    summary: {
      type: 'object',
      required: ['score', 'grade'],
      description: 'Composite score and counts.',
      properties: {
        score: {
          type: 'number',
          minimum: 0,
          maximum: 100,
          description: 'Composite weighted score 0-100.',
        },
        grade: {
          type: 'string',
          enum: ['A', 'B', 'C', 'D', 'F'],
          description: 'Letter grade: A (90+), B (80+), C (70+), D (60+), F (<60).',
        },
        countsByStatus: {
          type: 'object',
          description: 'Count of findings by status (designesy native terminology).',
          properties: {
            pass: { type: 'integer' },
            fail: { type: 'integer' },
            warn: { type: 'integer' },
            skip: { type: 'integer' },
          },
        },
        countsBySeverity: {
          type: 'object',
          description: 'Count of findings by severity (normalized across tools).',
          properties: {
            error: { type: 'integer', description: 'Maps to designesy FAIL, Google error, Lighthouse fail.' },
            warning: { type: 'integer', description: 'Maps to designesy WARN, Google warning.' },
            info: { type: 'integer', description: 'Maps to Google info, Lighthouse informative.' },
            pass: { type: 'integer', description: 'Maps to designesy PASS, Lighthouse pass.' },
            skip: { type: 'integer', description: 'Maps to designesy SKIP, Lighthouse notApplicable/manual.' },
          },
        },
        scored: {
          type: 'integer',
          description: 'Number of findings that contributed to the score (excludes SKIP).',
        },
        total: {
          type: 'integer',
          description: 'Total number of findings.',
        },
        a11yFloorApplied: {
          type: 'boolean',
          description: 'Whether the accessibility floor was applied (designesy-specific).',
        },
        categoryScores: {
          type: 'object',
          additionalProperties: {
            type: ['number', 'null'],
            description: 'Per-category 0-100 score. null if unscored.',
          },
          description: 'Shorthand map of category id to score for quick access.',
        },
      },
    },

    verdict: {
      type: 'string',
      enum: ['pass', 'fail', 'block', 'needs-changes', 'approve', 'not-scored'],
      description: 'Overall verdict. pass = no FAIL/error findings; fail = at least one FAIL/error; block = any HIGH (jakubkrehel); needs-changes = only WARN remaining; approve = no actionable findings; not-scored = all SKIP.',
    },

    runtimeError: {
      type: 'object',
      description: 'Fatal error if the tool could not complete. If present, findings may be incomplete.',
      properties: {
        code: { type: 'string' },
        message: { type: 'string' },
      },
    },

    runWarnings: {
      type: 'array',
      items: { type: 'string' },
      description: 'Non-fatal warnings during the run.',
    },

    raw: {
      type: 'object',
      description: 'Native tool output preserved verbatim for lossless round-trip. Consumers that need the original shape can read this.',
    },
  },

  $defs: {
    finding: {
      type: 'object',
      required: ['id', 'severity', 'message'],
      description: 'One verification finding (one check result).',
      properties: {
        id: {
          type: 'string',
          description: 'Check identifier (designesy v01-v37, Lighthouse audit id, Google rule name).',
        },
        item: {
          type: 'string',
          description: 'Human-readable check name (designesy item field).',
        },
        category: {
          type: 'string',
          description: 'Check category (designesy: cadence, accessibility, motion, tokens, etc.). Maps to Lighthouse categoryId and jakubkrehel domain.',
        },
        severity: {
          type: 'string',
          enum: ['pass', 'fail', 'warn', 'skip', 'error', 'warning', 'info', 'high', 'medium', 'low', 'informative', 'notApplicable', 'manual'],
          description: 'Normalized severity. designesy uses pass/fail/warn/skip. Google uses error/warning/info. jakubkrehel uses high/medium/low. Lighthouse uses informative/notApplicable/manual.',
        },
        severityRaw: {
          type: 'string',
          description: 'The native severity token verbatim (e.g. "PASS", "warning", "HIGH"). Preserved for lossless round-trip.',
        },
        status: {
          type: 'string',
          enum: ['PASS', 'FAIL', 'WARN', 'SKIP'],
          description: 'designesy-native status. Equivalent to severity but using designesy terminology.',
        },
        message: {
          type: 'string',
          description: 'Human-readable finding detail. designesy detail, Google message, Lighthouse explanation.',
        },
        detail: {
          type: 'string',
          description: 'Extended detail string (designesy detail field). May overlap with message.',
        },
        remediation: {
          type: 'string',
          description: 'How to fix this finding (designesy remediation guidance).',
        },
        path: {
          type: 'string',
          description: 'Dotted token path (Google design.md: "components.button-primary").',
        },
        location: {
          type: 'string',
          description: 'Source location (jakubkrehel: "src/Dialog.tsx:42").',
        },
        locations: {
          type: 'array',
          items: { type: 'string' },
          description: 'Multiple locations for a systemic finding (jakubkrehel consolidation).',
        },
        domain: {
          type: 'string',
          description: 'Review domain (jakubkrehel: accessibility, layout, writing, typography, colors, ui).',
        },
        before: {
          type: 'string',
          description: 'Current implementation (jakubkrehel before column).',
        },
        after: {
          type: 'string',
          description: 'Actionable replacement (jakubkrehel after column).',
        },
        why: {
          type: 'string',
          description: 'Violated principle + user impact (jakubkrehel why column).',
        },
        score: {
          type: ['number', 'null'],
          description: 'Numeric score 0-1 (Lighthouse audit score). null if not scored.',
          minimum: 0,
          maximum: 1,
        },
        numericValue: {
          type: 'number',
          description: 'Raw metric value (Lighthouse: ms, bytes, count).',
        },
        displayValue: {
          type: 'string',
          description: 'Display string for the metric (Lighthouse).',
        },
        scoreDisplayMode: {
          type: 'string',
          enum: ['binary', 'numeric', 'error', 'manual', 'notApplicable', 'informative'],
          description: 'How the score is displayed (Lighthouse).',
        },
        weight: {
          type: 'number',
          description: 'Check weight in the category (designesy per-check weight, Lighthouse auditRef weight).',
        },
        group: {
          type: 'string',
          description: 'Display group (Lighthouse categoryGroups).',
        },
      },
    },
  },
};

export function GET() {
  return new Response(JSON.stringify(SCHEMA, null, 2), {
    headers: {
      'Content-Type': 'application/schema+json',
      'Cache-Control': 'public, max-age=86400, s-maxage=86400',
    },
  });
}