// Format detection (engine spec section 4.1), one function for the page's
// "Read as" line and the server's `format: auto`, so the two cannot disagree.
//
// Import-free: the page imports it in a client component.

export type DetectedFormat = 'design.md' | 'dtcg';

export interface Detection {
  format: DetectedFormat | null;
  /** DTCG only: the format version named by $schema ("2025.10"), when it names one. */
  formatVersion: string | null;
}

/** Strip a UTF-8 byte order mark. */
export function stripBom(text: string): string {
  return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
}

/**
 * 1. A file whose first non-space character is `{` is DTCG. (The spec's step
 *    is "try JSON.parse; success means DTCG". A brace-first file that does not
 *    parse is still read as DTCG, so its caller gets JSON_INVALID with a line
 *    and column instead of FORMAT_UNKNOWN: a broken token file is a token file.)
 * 2. Else a file that starts with `---` or holds a fenced yaml block is DESIGN.md.
 * 3. Else a Markdown document (an ATX heading line, `# Title`) is DESIGN.md too:
 *    one with no YAML is a DESIGN.md without tokens, and NO_TOKENS_FOUND tells
 *    its author where tokens go (fixture DM-3d), where FORMAT_UNKNOWN would not.
 * 4. Else unknown: FORMAT_UNKNOWN, and the page asks the user to choose.
 */
export function detectFormat(input: string): Detection {
  // Line endings as readContract normalises them (CRLF and lone CR to LF).
  const text = stripBom(input.includes('\r') ? input.replace(/\r\n?/g, '\n') : input);
  const lead = text.trimStart();
  if (lead.startsWith('{')) {
    let formatVersion: string | null = null;
    try {
      const parsed = JSON.parse(text) as { $schema?: unknown };
      formatVersion = dtcgVersionOf(parsed?.$schema);
    } catch {
      formatVersion = null;
    }
    return { format: 'dtcg', formatVersion };
  }
  if (lead.startsWith('---') || hasFencedYaml(text) || hasMarkdownHeading(text)) return { format: 'design.md', formatVersion: null };
  return { format: null, formatVersion: null };
}

/** "2025.10" when a $schema URL names that version of the DTCG format. */
export function dtcgVersionOf(schema: unknown): string | null {
  if (typeof schema !== 'string') return null;
  const m = /(\d{4}\.\d{2})/.exec(schema);
  return m ? m[1] : null;
}

/** A line that opens a fenced yaml block (```yaml or ```yml), anywhere in the file. */
export function hasFencedYaml(text: string): boolean {
  for (const line of text.split('\n')) {
    const t = line.trim().toLowerCase();
    if (t === '```yaml' || t === '```yml') return true;
  }
  return false;
}

/** A Markdown ATX heading line (`#` to `######`, then a space), anywhere in the file. */
export function hasMarkdownHeading(text: string): boolean {
  for (const line of text.split('\n')) {
    const t = line.trimStart();
    if (t.startsWith('#')) {
      let i = 0;
      while (i < t.length && i < 7 && t[i] === '#') i++;
      if (i <= 6 && (t[i] === ' ' || t[i] === '\t')) return true;
    }
  }
  return false;
}

/** The page's "Read as" words for a detection. */
export function readAsLabel(d: Detection): string | null {
  if (d.format === 'design.md') return 'Read as DESIGN.md (alpha)';
  if (d.format === 'dtcg') return d.formatVersion ? `Read as DTCG tokens (${d.formatVersion})` : 'DTCG tokens (format version not stated)';
  return null;
}
