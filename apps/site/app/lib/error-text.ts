/**
 * Error text that leaves the server, with the machine's file system taken out.
 *
 * WHY THIS EXISTS
 * A caught error's message carries the file system of the machine that ran
 * the code: a failed fetch, a missing module or a refused file names the path
 * it was working under, often inside the Users folder of the account that ran
 * it. Engine 0.7.1 (@designesy/score) stopped check details from carrying
 * those paths with sanitizeErrorText. The hosted MCP tools (app/api/mcp/
 * route.ts) returned their errors raw: the tokens and motion tools passed a
 * caught fetch error's message straight into the result, and every engine
 * tool passed on the body of a failed engine response. A route file cannot
 * export a helper, so the function lives here and the MCP route imports it.
 *
 * ONE FUNCTION, THREE COPIES
 * The score engine keeps its own copy in app/api/score/route.ts and in
 * packages/score/src/engine.ts, where source-drift holds those two to the
 * same canonical form. This copy is the same function, word for word, and
 * scripts/check-mcp-tool-parity.js asserts that it matches the score route's
 * copy, runs it on fixture errors, and asserts that every error the MCP route
 * returns passes through it. Keep this module free of imports: the parity
 * gate loads it directly with Node's type stripping.
 */

export function sanitizeErrorText(text: string): string {
  const keep = (label: string) => (m: string): string => `${label}${/[.,;:!?)]+$/.exec(m)?.[0] ?? ''}`;
  return text
    .replace(/\bfile:\/\/[^\s'"<>`|]*/gi, keep('a local file'))
    .replace(/\\\\[^\\\s'"<>`|]+\\(?:[^\\\r\n'"<>`|*?]+\\)*[^\\\s'"<>`|*?]*/g, keep('a local path'))
    .replace(/(?<![\w\\/])[A-Za-z]:([\\/])(?:[^\\/\r\n'"<>`|*?]+\1)*[^\\/\s'"<>`|*?]*/g, keep('a local path'))
    .replace(
      /(^|[\s'"`(=,:[])\/(?:home|Users|root|tmp|var|private|opt|usr|srv|mnt|Volumes|Library|app|vercel|workspace|workspaces|github|runner|nix|snap)(?:\/[^/\r\n'"<>`|]+(?=\/))*\/[^/\s'"<>`|]+/g,
      (m: string, lead: string) => `${lead}${keep('a local path')(m.slice(lead.length))}`,
    )
    .replace(/[^\s'"<>`|]*(?:npm-cache|[\\/]_npx[\\/]|[\\/]\.npm[\\/])[^\s'"<>`|]*/gi, keep('the npm cache'));
}
