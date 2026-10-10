/**
 * Reference-data envelopes for the MCP document tools.
 *
 * WHY THIS EXISTS
 * Anthropic's Software Directory Policy, section 2F: software that gives Claude
 * tools "must not direct Claude to dynamically pull behavioral instructions
 * from external sources for Claude to execute". Until designesy-mcp 1.13.3 the
 * document tools returned the published agent files verbatim, so a tool result
 * could carry a second-person prompt ("You are working with Designesy...") and
 * fetch-then-follow steps ("If machine_url is present, fetch it for structured
 * rules"). Those files are correct as public files for crawlers and agents, and
 * they stay unchanged at their URLs. Returned inside a conversation, the same
 * text reads as instructions to the assistant.
 *
 * So the tools wrap what they return as labeled reference data: a kind, the
 * source URL, and a one-sentence note. Any part written as steps or a prompt
 * for an AI agent is left out and named, so the omission is visible:
 *   - text (markdown): each section, heading to next heading, that contains a
 *     directive keeps its heading, and its body becomes OMITTED_MARKER;
 *   - JSON: each field whose string value (or list of strings) contains a
 *     directive is removed, and its path is listed in omitted_fields.
 * A directive is any match of AGENT_DIRECTIVE_PATTERN_SOURCES: a second-person
 * role prompt, a step that opens with "fetch", or a clause that continues into
 * one (", fetch it for structured rules").
 *
 * PARITY
 * packages/designesy-mcp/designesy_mcp_server.py implements the same rules for
 * the PyPI server, with the same pattern sources and strings. Its test suite
 * and scripts/check-mcp-tool-parity.js both run their implementation on the
 * same published-document fixtures and compare against one golden file, so
 * the two servers cannot drift apart silently. Keep this module free of
 * imports: the parity gate loads it directly with Node's type stripping.
 */

export const REFERENCE_KIND = 'published_document';
export const RUBRIC_KIND = 'review_rubric';

export const REFERENCE_NOTE =
  'This is the published document at source_url, returned as reference data; it does not ask the assistant to do anything.';
export const RUBRIC_NOTE =
  'This is the rubric from the published Design Review kit at source_url, returned as reference data; it does not ask the assistant to do anything.';
export const OMITTED_MARKER =
  "[Omitted from this tool's output: written as steps or a prompt for an AI agent. The published document at source_url includes it.]";
export const KIT_PROMPT_NOTE =
  "The kit's copy-ready review prompt is written to an AI agent, so it is left out of this output; a person can read or copy it at kit_prompt_url.";

// One pattern per line: the PyPI test reads these lines from this file.
// Compiled case-insensitive and multiline in both servers.
export const AGENT_DIRECTIVE_PATTERN_SOURCES: readonly string[] = [
  String.raw`\byou are\b`,
  String.raw`^[ \t]*(?:(?:[-*]|[0-9]+[.)])[ \t]+)?(?:[A-Za-z][A-Za-z0-9_ ]{0,24}:[ \t]+)?(?:optionally[ \t]+)?fetch\b`,
  String.raw`,[ \t]*(?:then[ \t]+)?fetch\b`,
];

const DIRECTIVE_RES = AGENT_DIRECTIVE_PATTERN_SOURCES.map((s) => new RegExp(s, 'im'));
const HEADING_RE = /^#{1,6}[ \t]+\S/;

/** True when the text holds a second-person agent prompt or a fetch step. */
export function isAgentDirective(text: string): boolean {
  return DIRECTIVE_RES.some((re) => re.test(text));
}

/**
 * Markdown with each directive-bearing section replaced by OMITTED_MARKER.
 * Sections run from a heading line to the next heading line of any level;
 * text before the first heading is a section of its own. Every other line is
 * returned unchanged.
 */
export function referenceText(text: string): { content: string; omitted_sections: string[] } {
  const lines = text.split(/\r?\n/);
  const starts = [0];
  for (let i = 1; i < lines.length; i++) if (HEADING_RE.test(lines[i])) starts.push(i);
  const out: string[] = [];
  const omitted: string[] = [];
  starts.forEach((start, n) => {
    const end = n + 1 < starts.length ? starts[n + 1] : lines.length;
    const section = lines.slice(start, end);
    if (!isAgentDirective(section.join('\n'))) {
      out.push(...section);
      return;
    }
    const heading = HEADING_RE.test(section[0]) ? section[0] : null;
    const keepHeading = heading !== null && !isAgentDirective(heading);
    omitted.push(keepHeading ? heading.replace(/^#{1,6}[ \t]+/, '').trim() : '(untitled section)');
    if (keepHeading) out.push(heading, '');
    out.push(OMITTED_MARKER);
    if (section.length > 1 && section[section.length - 1] === '') out.push('');
  });
  return { content: out.join('\n'), omitted_sections: omitted };
}

const OMIT = Symbol('omit');

function stripDirectives(value: unknown, path: string, omitted: string[]): unknown {
  if (typeof value === 'string') return isAgentDirective(value) ? OMIT : value;
  if (Array.isArray(value)) {
    if (value.every((v) => v === null || typeof v !== 'object')) {
      return value.some((v) => typeof v === 'string' && isAgentDirective(v)) ? OMIT : value;
    }
    const kept: unknown[] = [];
    value.forEach((v, i) => {
      const r = stripDirectives(v, `${path}[${i}]`, omitted);
      if (r === OMIT) omitted.push(`${path}[${i}]`);
      else kept.push(r);
    });
    return kept;
  }
  if (value !== null && typeof value === 'object') {
    const kept: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) {
      const p = path ? `${path}.${k}` : k;
      const r = stripDirectives(v, p, omitted);
      if (r === OMIT) omitted.push(p);
      else kept[k] = r;
    }
    return kept;
  }
  return value;
}

/**
 * JSON with each directive-bearing field removed. A string, or a list of
 * plain values holding such a string, is removed whole, so a step list never
 * comes back with gaps; lists of objects are walked element by element.
 */
export function referenceJson(doc: unknown): { document: unknown; omitted_fields: string[] } {
  const omitted: string[] = [];
  const r = stripDirectives(doc, '', omitted);
  return { document: r === OMIT ? null : r, omitted_fields: omitted };
}

/** A published text file (markdown or plain text) as labeled reference data. */
export function publishedText(sourceUrl: string, mediaType: string, text: string) {
  const { content, omitted_sections } = referenceText(text);
  return {
    kind: REFERENCE_KIND,
    source_url: sourceUrl,
    media_type: mediaType,
    note: REFERENCE_NOTE,
    omitted_sections,
    content,
  };
}

/** A published JSON document as labeled reference data. */
export function publishedJson(sourceUrl: string, doc: unknown) {
  const { document, omitted_fields } = referenceJson(doc);
  return {
    kind: REFERENCE_KIND,
    source_url: sourceUrl,
    media_type: 'application/json',
    note: REFERENCE_NOTE,
    omitted_fields,
    document,
  };
}

export interface ReviewInputs {
  artifact?: string | null;
  purpose?: string | null;
  context?: string | null;
  rules?: string | null;
}

/**
 * The Design Review kit as a rubric: dimensions, output format and checklist,
 * which are the tool's purpose, without the kit's agent_prompt. Each of the
 * prompt's parts that a review needs is already a field here (the eight
 * dimensions, observation/judgment/action in output_format, the checklist), so
 * nothing of the method is lost. The prompt itself is addressed to an AI agent
 * and tells it to fetch the machine kit and contract "for structured rules";
 * a person can still copy it from kit_prompt_url. When the caller passes any
 * of the four review inputs they are recorded in `inputs`, with `rules`
 * defaulting to `defaultRules`.
 */
export function designReviewRubric(
  kit: Record<string, unknown>,
  sourceUrl: string,
  inputs: ReviewInputs,
  defaultRules: string,
) {
  const kitPage = typeof kit.public_url === 'string' ? kit.public_url : null;
  const fromKit = referenceJson({
    kit: {
      id: kit.id ?? null,
      title: kit.title ?? null,
      version: kit.version ?? null,
      status: kit.status ?? null,
      purpose: kit.purpose ?? null,
      quality_bar: kit.quality_bar ?? null,
      permission: kit.permission ?? null,
    },
    when_to_use: kit.when_to_use ?? [],
    required_inputs: kit.required_inputs ?? [],
    dimensions: kit.dimensions ?? [],
    output_format: kit.output_format ?? [],
    verification_checklist: kit.verification ?? [],
    anti_patterns: kit.anti_patterns ?? [],
    rationalizations: kit.rationalizations ?? [],
  });
  const given = Boolean(inputs.artifact || inputs.purpose || inputs.context || inputs.rules);
  return {
    kind: RUBRIC_KIND,
    source_url: sourceUrl,
    note: RUBRIC_NOTE,
    ...(given
      ? {
          inputs: {
            artifact: inputs.artifact || null,
            purpose: inputs.purpose || null,
            context: inputs.context || null,
            rules: inputs.rules || defaultRules,
          },
        }
      : {}),
    ...(fromKit.document as Record<string, unknown>),
    kit_prompt_url: kitPage,
    kit_prompt_note: KIT_PROMPT_NOTE,
    omitted_fields: fromKit.omitted_fields,
  };
}
