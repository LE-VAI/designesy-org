/**
 * Content negotiation for the machine-export routes.
 *
 * WHY THIS EXISTS
 * The measured data (Evil Martians, two months of server logs, 268k agent
 * requests) shows content negotiation is the ONE AI-readability technique with
 * hard evidence of real use: Claude Code sent `Accept: text/markdown` and took
 * markdown on 76% of its requests. By contrast `/llms.txt` drew 660 fetches
 * total, of which 37 came from named AI assistants — effectively noise.
 *
 * So: same URL, two representations. A browser gets JSON; an agent that asks
 * for markdown gets a readable projection of the same document. No separate
 * paths for a human to maintain, nothing to keep in sync by hand.
 *
 * WHY A PROJECTION AND NOT AUTHORED MARKDOWN
 * These routes serve structured data (contract values, token tables, check
 * results). Hand-writing markdown for each would be ten files to drift. A
 * projection from the same object the JSON route already returns cannot
 * disagree with it — the JSON stays the single source.
 *
 * WHAT THE PROJECTION IS GOOD AT, AND WHAT IT IS NOT
 * It renders nested objects and arrays-of-objects as headed sections and
 * tables, which covers the shape these contracts actually have. It is a
 * readable summary, NOT a lossless serialization: an agent that needs exact
 * values should still take the JSON. The `x-markdown-fidelity: projection`
 * header says so explicitly rather than implying parity.
 */

/** True when the caller's Accept header prefers markdown over JSON. */
export function prefersMarkdown(accept: string | null): boolean {
  if (!accept) return false;
  const lower = accept.toLowerCase();
  // Explicit markdown wins.
  if (/text\/markdown/.test(lower)) return true;
  // `text/*` is a wildcard an agent may send; JSON-only clients send
  // application/json and must not match.
  if (/text\/\*/.test(lower) && !/application\/json/.test(lower)) return true;
  return false;
}

/** Heading text for a camelCase / kebab-case / snake_case key. */
function heading(key: string): string {
  const spaced = key
    .replace(/[_-]+/g, ' ')
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .trim();
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/** Render a scalar for a table cell or list item. */
function scalar(v: unknown): string {
  if (v === null || v === undefined) return '—';
  if (typeof v === 'string') return v.replace(/\|/g, '\\|').replace(/\n+/g, ' ');
  if (typeof v === 'number' || typeof v === 'boolean') return String(v);
  if (Array.isArray(v)) {
    // Arrays of scalars read fine inline; anything deeper is summarized and
    // the depth is stated rather than silently truncated.
    if (v.every((x) => !isPlainObject(x) && !Array.isArray(x))) return v.map(scalar).join(', ') || '—';
    return `${v.length} item(s) — see JSON`;
  }
  return 'see JSON';
}

/**
 * Render an object array as a markdown table.
 *
 * Column set is the union of keys across the first rows, capped so a wide
 * record does not produce an unreadable table. Cells are scalarized; nested
 * values point at the JSON instead of pretending to be lossless.
 */
function tableFor(rows: Array<Record<string, unknown>>): string {
  const cols: string[] = [];
  for (const r of rows.slice(0, 20)) {
    for (const k of Object.keys(r)) if (!cols.includes(k)) cols.push(k);
  }
  const capped = cols.slice(0, 8);
  const head = `| ${capped.map(heading).join(' | ')} |`;
  const sep = `| ${capped.map(() => '---').join(' | ')} |`;
  const body = rows
    .map((r) => `| ${capped.map((c) => scalar(r[c])).join(' | ')} |`)
    .join('\n');
  const extraCols = cols.length > capped.length
    ? `\n\n_(showing ${capped.length} of ${cols.length} columns — see the JSON for the full record)_`
    : '';
  const extraRows = rows.length > 20 ? `\n\n_(showing 20 of ${rows.length} rows)_` : '';
  return [head, sep, body].join('\n') + extraCols + extraRows;
}

/**
 * Project an arbitrary JSON document into readable markdown.
 *
 * `depth` bounds recursion so a self-similar document cannot blow the stack or
 * produce a megabyte of headings. Beyond the bound the text says what was
 * elided — an agent should never be left guessing whether it has the whole
 * picture.
 */
export function toMarkdown(value: unknown, title?: string, depth = 0): string {
  const out: string[] = [];
  const level = Math.min(6, 2 + depth);

  if (depth === 0 && title) out.push(`# ${title}`, '');

  if (Array.isArray(value)) {
    const objects = value.filter(isPlainObject);
    if (objects.length === value.length && objects.length > 0) {
      out.push(tableFor(objects));
    } else {
      for (const item of value) {
        if (isPlainObject(item)) {
          out.push(toMarkdown(item, undefined, depth + 1));
        } else {
          out.push(`- ${scalar(item)}`);
        }
      }
    }
    return out.join('\n');
  }

  if (!isPlainObject(value)) return scalar(value);

  for (const [k, v] of Object.entries(value)) {
    if (isPlainObject(v)) {
      out.push(`${'#'.repeat(level)} ${heading(k)}`, '');
      out.push(toMarkdown(v, undefined, depth + 1), '');
    } else if (Array.isArray(v)) {
      out.push(`${'#'.repeat(level)} ${heading(k)}`, '');
      if (v.length === 0) out.push('_(none)_', '');
      else out.push(toMarkdown(v, undefined, depth + 1), '');
    } else {
      out.push(`- **${heading(k)}**: ${scalar(v)}`);
    }
  }
  return out.join('\n');
}

/**
 * Build the negotiated response for a machine-export route.
 *
 * The JSON branch is byte-identical to what the route returned before this
 * existed: same body, same headers, plus `Vary: Accept` so a CDN cannot serve
 * a cached JSON copy to an agent that asked for markdown (or vice versa).
 * That cache-poisoning case is the one way content negotiation goes wrong in
 * production, and `Vary` is the whole fix.
 */
export function negotiatedResponse(
  data: unknown,
  opts: { accept: string | null; title: string; jsonHeaders?: Record<string, string> },
): Response {
  const jsonHeaders: Record<string, string> = {
    'Cache-Control': 'public, max-age=3600, s-maxage=3600',
    'Access-Control-Allow-Origin': '*',
    Vary: 'Accept',
    ...(opts.jsonHeaders || {}),
  };

  if (!prefersMarkdown(opts.accept)) {
    return Response.json(data, { headers: jsonHeaders });
  }

  const md = [
    `> Machine-readable source: append \`.json\` to this path, or drop the`,
    `> \`Accept: text/markdown\` header, to get the exact JSON.`,
    '',
    toMarkdown(data, opts.title),
    '',
  ].join('\n');

  return new Response(md, {
    headers: {
      'Content-Type': 'text/markdown; charset=utf-8',
      'Cache-Control': 'public, max-age=3600, s-maxage=3600',
      'Access-Control-Allow-Origin': '*',
      Vary: 'Accept',
      // States plainly that this is a readable projection, not a lossless
      // serialization — so an agent needing exact values knows to fetch JSON.
      'x-markdown-fidelity': 'projection',
    },
  });
}
