// JSON-RPC -32602 for MCP requests whose params fail the protocol schema.
//
// WHY THIS MODULE EXISTS
// JSON-RPC 2.0 gives invalid method parameters their own code, -32602 Invalid
// params ("Invalid method parameter(s)."), and the MCP schemas of 2025-06-18,
// 2025-11-25 and 2026-07-28 all define INVALID_PARAMS = -32602.
//
// @modelcontextprotocol/server 2.3.1, the SDK under mcp-handler 2.3.0, answers
// most such requests -32603 Internal error instead. For a spec method it checks
// the request against the protocol schema and, when the check fails, throws a
// plain Error whose message is the schema's issue list. That Error has no
// numeric code, so the SDK's request funnel answers -32603, with the issue list,
// pretty-printed JSON, as the message
// (https://github.com/modelcontextprotocol/typescript-sdk/issues/2916, open).
// An initialize without clientInfo got exactly that, and so did tools/list with
// a numeric cursor and resources/read without a uri. tools/call already
// answered -32602, but with the same issue list behind
// "Invalid tools/call request: ".
//
// answerInvalidParams rewrites those answers to code -32602 and one short line
// that names each field, for example "Invalid params for initialize:
// params.clientInfo is missing (expected object)". A message is rewritten only
// when it is such an issue list (bare, or behind "Invalid <method> request: "
// or "Invalid params for <method>: ") and every issue in it sits under params.
// Every result, every other error and every other byte passes through
// unchanged, and an event stream keeps streaming.
//
// NOT REWRITTEN: a tools/call whose arguments fail a tool's input schema. The
// SDK answers it with a tool result, isError: true ("Input validation error:
// Invalid arguments for tool designesy_contract: sections: Invalid input:
// expected array, received number"). The tools pages of 2025-11-25 and
// 2026-07-28 list "Input validation errors (e.g., date in wrong format, value
// out of range)" under tool execution errors, which are reported that way.
//
// scripts/check-mcp-protocol-errors.js drives the real route through the real
// SDK and holds both behaviours.
//
// IMPORT-FREE, so a gate can load it on its own.

type Obj = Record<string, unknown>;

/** One issue of a failed schema check, as the SDK writes it into the message. */
interface Issue {
  code?: unknown;
  expected?: unknown;
  path: unknown[];
  message: string;
}

const INVALID_PARAMS = -32602;
const INTERNAL_ERROR = -32603;

/** The labels the SDK writes before the issue list of a failed request check. */
const REQUEST_LABEL = /^Invalid (?:[\w/.-]+ request|params for [\w/.-]+): $/;

/** A method name taken from the request body is used only when it looks like one. */
const METHOD_NAME = /^[\w/.-]{1,64}$/;

/** An answer longer than this is a result, never a failed check, and is not parsed. */
const MAX_ERROR_CHARS = 64 * 1024;

/** At most this many issues are named; the rest are counted. */
const MAX_ISSUES = 3;

/** An issue's text is cut to this length: a path can carry a key the client chose. */
const MAX_ISSUE_CHARS = 160;

function isObj(x: unknown): x is Obj {
  return x !== null && typeof x === 'object' && !Array.isArray(x);
}

/** The issue list in an error message, or null when the message is anything else. */
function issueList(message: unknown): Issue[] | null {
  if (typeof message !== 'string') return null;
  const start = message.indexOf('[');
  if (start < 0) return null;
  const label = message.slice(0, start);
  if (label !== '' && !REQUEST_LABEL.test(label)) return null;
  let list: unknown;
  try {
    list = JSON.parse(message.slice(start));
  } catch {
    return null;
  }
  if (!Array.isArray(list) || list.length === 0) return null;
  const underParams = list.every((i) => isObj(i) && Array.isArray(i.path) && i.path[0] === 'params' && typeof i.message === 'string');
  return underParams ? (list as Issue[]) : null;
}

/** "params.clientInfo is missing (expected object)": one issue in a few words. */
function issueText(issue: Issue): string {
  let where = '';
  for (const p of issue.path) where += typeof p === 'number' ? `[${p}]` : `${where ? '.' : ''}${String(p)}`;
  // The schema library calls a JSON object with string keys a record.
  const plain = (s: string) => s.replace(/\bexpected record\b/g, 'expected object');
  let text: string;
  if (issue.code === 'invalid_type' && typeof issue.expected === 'string' && /received undefined$/.test(issue.message)) {
    text = `${where} is missing (expected ${issue.expected === 'record' ? 'object' : issue.expected})`;
  } else if (issue.message === 'Invalid input') {
    text = `${where} is invalid`;
  } else {
    text = `${where}: ${plain(issue.message.replace(/^Invalid input: /, ''))}`;
  }
  return text.length > MAX_ISSUE_CHARS ? `${text.slice(0, MAX_ISSUE_CHARS - 1)}…` : text;
}

/** The -32602 message for a request whose params failed the schema. */
function invalidParamsMessage(method: string | undefined, issues: Issue[]): string {
  const named = issues.slice(0, MAX_ISSUES).map(issueText);
  const rest = issues.length - named.length;
  return `Invalid params${method ? ` for ${method}` : ''}: ${named.join('; ')}${rest > 0 ? `; and ${rest} more` : ''}`;
}

/** id -> method for each request in a JSON-RPC body: one message or a batch. */
function methodsById(requestBody: string): Map<unknown, string> {
  const methods = new Map<unknown, string>();
  let body: unknown;
  try {
    body = JSON.parse(requestBody);
  } catch {
    return methods;
  }
  for (const m of Array.isArray(body) ? body : [body]) {
    if (!isObj(m) || typeof m.method !== 'string' || !METHOD_NAME.test(m.method)) continue;
    if (typeof m.id === 'string' || typeof m.id === 'number') methods.set(m.id, m.method);
  }
  return methods;
}

/** The message with its failed check answered -32602, or null when it is anything else. */
function rewriteMessage(message: unknown, methods: () => Map<unknown, string>): Obj | null {
  if (!isObj(message) || !isObj(message.error)) return null;
  const error = message.error;
  if (error.code !== INTERNAL_ERROR && error.code !== INVALID_PARAMS) return null;
  const issues = issueList(error.message);
  if (!issues) return null;
  return { ...message, error: { ...error, code: INVALID_PARAMS, message: invalidParamsMessage(methods().get(message.id), issues) } };
}

/** One JSON-RPC payload (a message or a batch) rewritten, or null when nothing in it changes. */
function rewritePayload(text: string, methods: () => Map<unknown, string>): string | null {
  if (text.length > MAX_ERROR_CHARS || !text.includes('"error"')) return null;
  let payload: unknown;
  try {
    payload = JSON.parse(text);
  } catch {
    return null;
  }
  if (!Array.isArray(payload)) {
    const one = rewriteMessage(payload, methods);
    return one ? JSON.stringify(one) : null;
  }
  let changed = false;
  const all = payload.map((m) => {
    const one = rewriteMessage(m, methods);
    if (one) changed = true;
    return one ?? m;
  });
  return changed ? JSON.stringify(all) : null;
}

/** The same status and headers around a new body (whose length is not the old one's). */
function rebody(response: Response, body: BodyInit): Response {
  const headers = new Headers(response.headers);
  headers.delete('content-length');
  return new Response(body, { status: response.status, statusText: response.statusText, headers });
}

/**
 * The route's answer with each failed params check answered -32602.
 * `requestBody` is the POST body the answer is for; it names each request's method.
 */
export async function answerInvalidParams(response: Response, requestBody: string): Promise<Response> {
  if (!response.body) return response;
  let known: Map<unknown, string> | undefined;
  const methods = () => {
    if (!known) known = methodsById(requestBody);
    return known;
  };
  const type = (response.headers.get('content-type') ?? '').toLowerCase();

  // A JSON answer is complete when it arrives, so it is read whole.
  if (type.startsWith('application/json')) {
    const next = rewritePayload(await response.clone().text(), methods);
    return next === null ? response : rebody(response, next);
  }

  // An event stream is rewritten line by line as it passes, never buffered: a
  // line goes out as soon as its newline arrives, and only a data line holding
  // a failed check changes.
  if (type.startsWith('text/event-stream')) {
    const decoder = new TextDecoder();
    const encoder = new TextEncoder();
    let partial = '';
    const lines = (text: string) =>
      text
        .split('\n')
        .map((line) => {
          const prefix = /^data: ?/.exec(line)?.[0];
          const next = prefix === undefined ? null : rewritePayload(line.slice(prefix.length), methods);
          return next === null ? line : `${prefix}${next}`;
        })
        .join('\n');
    const body = response.body.pipeThrough(
      new TransformStream<Uint8Array, Uint8Array>({
        transform(chunk, controller) {
          partial += decoder.decode(chunk, { stream: true });
          const end = partial.lastIndexOf('\n') + 1;
          if (end === 0) return;
          controller.enqueue(encoder.encode(lines(partial.slice(0, end))));
          partial = partial.slice(end);
        },
        flush(controller) {
          partial += decoder.decode();
          if (partial) controller.enqueue(encoder.encode(lines(partial)));
        },
      }),
    );
    return rebody(response, body);
  }

  return response;
}
