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
// params.clientInfo is missing (expected object)". A JSON-RPC message is
// rewritten only when all of these hold:
//   1. it is an error: it has a top-level "error" member;
//   2. its code is -32603 or -32602;
//   3. its message is such an issue list, bare or behind "Invalid <method>
//      request: " or "Invalid params for <method>: ";
//   4. every issue in the list sits under params.
// Every other answer passes through byte for byte, and an event stream keeps
// streaming.
//
// WHAT IS READ, AND HOW MUCH
// The unit examined is one payload: a JSON body, or one event-stream line with
// its newline. A payload is parsed only when condition 1 holds for a message in
// it, which holdsError decides by stepping over the text's strings and nested
// values without parsing them, so a payload with no error in it is never
// parsed, whatever it holds. A payload is held and examined only while it is at
// most MAX_FRAME_BYTES (4 MiB). A longer one passes on unchanged, failed check
// or not, and is never held whole: of a JSON body, reading stops at the chunk
// that passes the bound; of a line, what has arrived goes out as soon as it
// passes the bound, and the rest follows as it arrives. A failed check's answer
// grows with its issues, each one a pretty-printed object. With the versions
// above and zod 4.6.5, an initialize whose clientInfo.icons holds 2,000
// numbers fails with 2,000 issues in a 482,977-byte answer, which is
// rewritten; at 17,305 numbers the line is 4,194,076 bytes and still
// rewritten; at 17,306 it is 4,194,319 bytes, over the bound, and that answer
// passes unchanged, still -32603.
//
// NOT REWRITTEN: a tools/call whose arguments fail a tool's input schema. The
// SDK answers it with a tool result, isError: true ("Input validation error:
// Invalid arguments for tool designesy_contract: sections: Invalid input:
// expected array, received number"). The tools pages of 2025-11-25 and
// 2026-07-28 list "Input validation errors (e.g., date in wrong format, value
// out of range)" under tool execution errors, which are reported that way.
//
// scripts/check-mcp-protocol-errors.js drives the real route through the real
// SDK and holds this behaviour: the rewrite and what it leaves alone, each of
// the four conditions on its own, the 2,000-issue answer, and the bound (a
// payload of exactly MAX_FRAME_BYTES is rewritten, one byte more is not).
//
// IMPORT-FREE, so a gate can load it on its own.

type Obj = Record<string, unknown>;
type Methods = () => Map<unknown, string>;

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

/**
 * The most of one payload (a JSON body, or an event-stream line with its
 * newline) that is held and examined, in bytes. A longer payload passes on
 * unchanged, whether it is a result or a failed check, and is never held whole.
 */
const MAX_FRAME_BYTES = 4 * 1024 * 1024;

/** At most this many issues are named; the rest are counted. */
const MAX_ISSUES = 3;

/** An issue's text is cut to this length: a path can carry a key the client chose. */
const MAX_ISSUE_CHARS = 160;

const NEWLINE = 0x0a;
const CARRIAGE_RETURN = 0x0d;
const SPACE = 0x20;
/** "data:", the field name of an event-stream data line. */
const DATA_FIELD = [0x64, 0x61, 0x74, 0x61, 0x3a];

const encoder = new TextEncoder();
const strictUtf8 = new TextDecoder('utf-8', { fatal: true });

function isObj(x: unknown): x is Obj {
  return x !== null && typeof x === 'object' && !Array.isArray(x);
}

/** The parts, in order, as one array (the part itself when there is one). */
function join(parts: Uint8Array[]): Uint8Array {
  if (parts.length === 1) return parts[0];
  let size = 0;
  for (const p of parts) size += p.byteLength;
  const out = new Uint8Array(size);
  let at = 0;
  for (const p of parts) {
    out.set(p, at);
    at += p.byteLength;
  }
  return out;
}

/** The bytes as text, or null when they are not UTF-8. */
function utf8(bytes: Uint8Array): string | null {
  try {
    return strictUtf8.decode(bytes);
  } catch {
    return null;
  }
}

/**
 * Whether a JSON-RPC payload holds an error: a message, alone or in a batch,
 * with a top-level "error" member. One pass over the text that steps over
 * strings and nested values without parsing them.
 */
function holdsError(text: string): boolean {
  let i = 0;
  while (i < text.length && (text[i] === ' ' || text[i] === '\t' || text[i] === '\n' || text[i] === '\r')) i++;
  // A message's members sit one level in, or two in a batch.
  const memberDepth = text[i] === '[' ? 2 : 1;
  let depth = 0;
  let atKey = false;
  for (; i < text.length; i++) {
    const c = text.charCodeAt(i);
    if (c === 0x22 /* " */) {
      const from = i + 1;
      for (i = from; i < text.length && text.charCodeAt(i) !== 0x22; i++) {
        if (text.charCodeAt(i) === 0x5c /* \ */) i++;
      }
      if (atKey && depth === memberDepth) {
        const name = text.slice(from, i);
        // JSON.stringify never escapes a letter, so a name with an escape is
        // parsed to be sure rather than read here.
        if (name === 'error' || name.includes('\\')) return true;
      }
    } else if (c === 0x7b /* { */ || c === 0x5b /* [ */) {
      depth++;
      if (depth === memberDepth) atKey = c === 0x7b;
    } else if (c === 0x7d /* } */ || c === 0x5d /* ] */) {
      depth--;
    } else if (depth === memberDepth) {
      if (c === 0x3a /* : */) atKey = false;
      else if (c === 0x2c /* , */) atKey = true;
    }
  }
  return false;
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
function rewriteMessage(message: unknown, methods: Methods): Obj | null {
  if (!isObj(message) || !isObj(message.error)) return null;
  const error = message.error;
  if (error.code !== INTERNAL_ERROR && error.code !== INVALID_PARAMS) return null;
  const issues = issueList(error.message);
  if (!issues) return null;
  return { ...message, error: { ...error, code: INVALID_PARAMS, message: invalidParamsMessage(methods().get(message.id), issues) } };
}

/** One JSON-RPC payload (a message or a batch) rewritten, or null when nothing in it changes. */
function rewritePayload(text: string, methods: Methods): string | null {
  if (!holdsError(text)) return null;
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

/** A body's bytes, or null once they pass `max`: reading stops at the chunk that passes it. */
async function readAtMost(body: ReadableStream<Uint8Array>, max: number): Promise<Uint8Array | null> {
  const reader = body.getReader();
  const parts: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) return join(parts);
    size += value.byteLength;
    if (size > max) {
      // Not awaited: one branch of a tee (a clone) settles its cancel only
      // once the other branch is cancelled too.
      reader.cancel().catch(() => {});
      return null;
    }
    parts.push(value);
  }
}

/**
 * One whole event-stream line (its parts as they arrived, newline included)
 * with its failed check answered -32602, or null when it is anything else.
 */
function rewriteLine(parts: Uint8Array[], size: number, methods: Methods): Uint8Array | null {
  if (size > MAX_FRAME_BYTES) return null;
  const line = join(parts);
  if (line.length < DATA_FIELD.length || DATA_FIELD.some((b, i) => line[i] !== b)) return null;
  const start = DATA_FIELD.length + (line[DATA_FIELD.length] === SPACE ? 1 : 0);
  let end = line.length;
  if (end > start && line[end - 1] === NEWLINE) end--;
  if (end > start && line[end - 1] === CARRIAGE_RETURN) end--;
  const text = utf8(line.subarray(start, end));
  const next = text === null ? null : rewritePayload(text, methods);
  if (next === null) return null;
  const data = encoder.encode(next);
  const out = new Uint8Array(start + data.length + line.length - end);
  out.set(line.subarray(0, start));
  out.set(data, start);
  out.set(line.subarray(end), start + data.length);
  return out;
}

/**
 * An event stream with each data line that holds a failed check rewritten. It
 * works on bytes, so every other byte goes out as it came. A line goes out as
 * soon as its newline arrives, and a chunk with nothing to change goes out as
 * it is. A line still without its newline after MAX_FRAME_BYTES goes out
 * unchanged from there on, as it arrives.
 */
function eventStreamRewrite(methods: Methods): TransformStream<Uint8Array, Uint8Array> {
  let held: Uint8Array[] = []; // the start of a line whose newline has not arrived
  let heldBytes = 0;
  let passing = false; // the current line passed MAX_FRAME_BYTES: the rest of it goes out as it comes
  return new TransformStream<Uint8Array, Uint8Array>({
    transform(chunk, controller) {
      const out: Uint8Array[] = [];
      // The chunk goes out as it came unless a line in it changes, part of it
      // is held, or a held line from earlier chunks goes out with it.
      let asItCame = held.length === 0;
      let at = 0;
      while (at < chunk.length) {
        const nl = chunk.indexOf(NEWLINE, at);
        const end = nl < 0 ? chunk.length : nl + 1;
        const piece = chunk.subarray(at, end);
        at = end;
        if (passing) {
          out.push(piece);
          passing = nl < 0;
          continue;
        }
        held.push(piece);
        heldBytes += piece.byteLength;
        if (nl < 0 && heldBytes <= MAX_FRAME_BYTES) {
          asItCame = false;
          continue;
        }
        // A whole line, or the start of one that passed the bound.
        const next = nl < 0 ? null : rewriteLine(held, heldBytes, methods);
        if (next) {
          out.push(next);
          asItCame = false;
        } else {
          for (const p of held) out.push(p);
        }
        passing = nl < 0;
        held = [];
        heldBytes = 0;
      }
      if (asItCame) controller.enqueue(chunk);
      else if (out.length) controller.enqueue(join(out));
    },
    flush(controller) {
      if (held.length) controller.enqueue(rewriteLine(held, heldBytes, methods) ?? join(held));
    },
  });
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

  // A JSON answer is complete when it arrives. A copy of it is read, up to the
  // bound; when nothing in it changes, the answer itself is handed back.
  if (type.startsWith('application/json')) {
    const copy = response.clone().body;
    const bytes = copy && (await readAtMost(copy, MAX_FRAME_BYTES));
    const text = bytes ? utf8(bytes) : null;
    const next = text === null ? null : rewritePayload(text, methods);
    return next === null ? response : rebody(response, next);
  }

  if (type.startsWith('text/event-stream')) {
    return rebody(response, response.body.pipeThrough(eventStreamRewrite(methods)));
  }

  return response;
}
