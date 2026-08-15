#!/usr/bin/env node
// @vai/motion — demo server (zero dependencies)
// Serves the demo page + package files so the principles can be exercised
// in a browser. Node built-ins only, matching the designesy-org house
// zero-dependency pattern.
//
// Usage: node demo/serve.mjs [port]   (default 4173)
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize, relative, isAbsolute } from 'node:path';
import { fileURLToPath } from 'node:url';

const PORT = Number(process.argv[2] || 4173);
const ROOT = normalize(fileURLToPath(new URL('..', import.meta.url)));

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
};

const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://localhost:${PORT}`);
    let path = decodeURIComponent(url.pathname === '/' ? '/demo/index.html' : url.pathname);
    // prevent path traversal
    const resolved = normalize(join(ROOT, path));
    const rel = relative(ROOT, resolved);
    if (isAbsolute(rel) || rel.startsWith('..')) {
      res.writeHead(403);
      res.end('forbidden');
      return;
    }
    const body = await readFile(resolved);
    res.writeHead(200, {
      'content-type': MIME[extname(resolved)] || 'application/octet-stream',
      'cache-control': 'no-store',
    });
    res.end(body);
  } catch {
    res.writeHead(404);
    res.end('not found');
  }
});

server.listen(PORT, () => {
  console.log(`VAI Motion Lab → http://localhost:${PORT}`);
});
