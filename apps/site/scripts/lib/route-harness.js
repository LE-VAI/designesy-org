/**
 * route-harness: load this site's TypeScript modules (route handlers included)
 * under plain Node, offline, so a gate can call a real route's POST or a real
 * MCP tool handler and read what it returns.
 *
 * WHY THIS EXISTS
 * The other gates load app/lib modules with Node's type stripping, which needs
 * a file that imports nothing. A route imports next/server, next/cache and the
 * URL guard, so its output could only be checked by deploying it. This loader
 * transpiles each file with the site's own TypeScript (to CommonJS), resolves
 * relative imports itself, and swaps the transport for stubs: the URL guard's
 * safeFetch serves pages from a fixture table, next/cache's unstable_cache
 * calls straight through, and mcp-handler records each registerTool() instead
 * of serving HTTP. Everything else, the measurement included, is the real code.
 *
 * It takes the app directory as an argument, so the same gate can run against
 * another checkout (a main worktree, say) and show how that code behaves.
 *
 * Nothing here reaches the network: a fetch the fixtures do not answer returns
 * 404, and the global fetch is replaced while a call runs.
 */

'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { createRequire } = require('node:module');

/** A Response for a fixture body (JSON values are serialised). */
function fixtureResponse(body, status = 200) {
  if (body === undefined) return new Response('not found', { status: 404, statusText: 'Not Found' });
  const text = typeof body === 'string' ? body : JSON.stringify(body);
  return new Response(text, { status, statusText: status === 200 ? 'OK' : 'Error' });
}

/**
 * @param {object} opts
 * @param {string} opts.app      apps/site directory whose code is loaded
 * @param {Record<string, unknown>} [opts.pages]  url -> body served by safeFetch and fetch
 * @param {(url: string, init?: object) => unknown} [opts.api]  answers global fetch calls the pages do not (return undefined for 404)
 */
function createHarness({ app, pages = {}, api = () => undefined }) {
  // Packages resolve from the loaded app first, then from this checkout, so a
  // bare source snapshot (git archive of another commit) runs without its own
  // node_modules.
  const fromApp = createRequire(path.join(app, 'package.json'));
  const fromHere = createRequire(__filename);
  const appRequire = (spec) => {
    try {
      return fromApp(spec);
    } catch (e) {
      if (e && e.code === 'MODULE_NOT_FOUND') return fromHere(spec);
      throw e;
    }
  };
  const ts = appRequire('typescript');
  const cache = new Map();
  const tools = new Map();
  const calls = [];

  const serve = async (input, init) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    calls.push({ url, method: (init && init.method) || 'GET' });
    if (Object.prototype.hasOwnProperty.call(pages, url)) return fixtureResponse(pages[url]);
    const answer = await api(url, init);
    return fixtureResponse(answer);
  };

  // Bare-specifier stubs: the transport around the measurement.
  const stubs = {
    'next/server': {
      NextResponse: { json: (body, init) => Response.json(body, init) },
      after: () => {},
    },
    'next/cache': { unstable_cache: (fn) => fn },
    'mcp-handler': {
      createMcpHandler: (register) => {
        register({
          registerTool: (name, config, handler) => tools.set(name, { config, handler }),
          registerResource: () => {},
        });
        return async () => new Response('stub', { status: 501 });
      },
    },
    resend: { Resend: class { constructor() { this.emails = { send: async () => ({ error: { message: 'stubbed' } }) }; } } },
    '@upstash/redis': { Redis: class {} },
    '@upstash/ratelimit': { Ratelimit: class {} },
  };

  // App-relative path stubs, applied after the real module loads.
  const overrides = {
    'app/lib/url-guard.ts': (real) => ({ ...real, safeFetch: serve }),
    'app/lib/usage.ts': (real) => ({ ...real, recordUsage: async () => {}, toolCallNames: () => [] }),
  };

  function resolveLocal(from, spec) {
    const base = path.resolve(path.dirname(from), spec);
    const candidates = [base, `${base}.ts`, `${base}.tsx`, `${base}.js`, `${base}.json`, path.join(base, 'index.ts'), path.join(base, 'index.tsx')];
    for (const c of candidates) {
      if (fs.existsSync(c) && fs.statSync(c).isFile()) return c;
    }
    throw new Error(`route-harness: cannot resolve '${spec}' from ${path.relative(app, from)}`);
  }

  function load(file) {
    const abs = path.resolve(app, file);
    if (cache.has(abs)) return cache.get(abs).exports;
    const mod = { exports: {} };
    cache.set(abs, mod);
    if (abs.endsWith('.json')) {
      mod.exports = JSON.parse(fs.readFileSync(abs, 'utf8'));
      return mod.exports;
    }
    const src = fs.readFileSync(abs, 'utf8');
    const out = ts.transpileModule(src, {
      fileName: abs,
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
        jsx: ts.JsxEmit.ReactJSX,
        esModuleInterop: true,
      },
    }).outputText;
    const localRequire = (spec) => {
      if (spec.startsWith('.')) return load(resolveLocal(abs, spec));
      if (Object.prototype.hasOwnProperty.call(stubs, spec)) return stubs[spec];
      return appRequire(spec);
    };
    // eslint-disable-next-line no-new-func
    new Function('exports', 'require', 'module', '__filename', '__dirname', out)(mod.exports, localRequire, mod, abs, path.dirname(abs));
    const rel = path.relative(app, abs).split(path.sep).join('/');
    if (overrides[rel]) mod.exports = overrides[rel](mod.exports);
    return mod.exports;
  }

  /** Run fn with the global fetch answering from the fixtures. */
  async function offline(fn) {
    const real = globalThis.fetch;
    globalThis.fetch = serve;
    try {
      return await fn();
    } finally {
      globalThis.fetch = real;
    }
  }

  /** POST a JSON body to a route module (path relative to the app) and parse the reply. */
  async function post(routeFile, body) {
    const route = load(routeFile);
    return offline(async () => {
      const res = await route.POST(new Request('https://harness.test/api', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      }));
      return { status: res.status, body: await res.json() };
    });
  }

  /** Call one tool registered by app/api/mcp/route.ts; returns { result, payload }. */
  async function callTool(name, args) {
    load('app/api/mcp/route.ts');
    const tool = tools.get(name);
    if (!tool) throw new Error(`route-harness: the MCP route registers no tool named ${name}`);
    return offline(async () => {
      const result = await tool.handler(args);
      const text = result && result.content && result.content[0] && result.content[0].text;
      let payload = null;
      try {
        payload = JSON.parse(text);
      } catch {
        payload = text;
      }
      return { result, payload, config: tool.config };
    });
  }

  return { load, post, callTool, calls, tools };
}

module.exports = { createHarness };
