#!/usr/bin/env node
// @vai/icons — demo server (zero dependencies)
// Mirrors the vai-motion demo: Node built-ins only.
// Path-traversal guarded. Matches the house pattern.
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize, relative, isAbsolute } from 'node:path';
import { fileURLToPath } from 'node:url';

const PORT = Number(process.argv[2] || 4273);
const ROOT = normalize(fileURLToPath(new URL('..', import.meta.url)));

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.json': 'application/json',
};

const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://localhost:${PORT}`);
    let path = decodeURIComponent(url.pathname === '/' ? '/demo/index.html' : url.pathname);
    const resolved = normalize(join(ROOT, path));
    const rel = relative(ROOT, resolved);
    if (isAbsolute(rel) || rel.startsWith('..')) {
      res.writeHead(403); res.end('forbidden'); return;
    }
    const body = await readFile(resolved);
    res.writeHead(200, {
      'content-type': MIME[extname(resolved)] || 'application/octet-stream',
      'cache-control': 'no-store',
    });
    res.end(body);
  } catch {
    res.writeHead(404); res.end('not found');
  }
});

server.listen(PORT, () => {
  console.log(`VAI Icons Lab → http://localhost:${PORT}`);
});
