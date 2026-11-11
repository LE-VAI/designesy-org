/**
 * The id Find puts on Pagefind's scripts and engine file.
 *
 * Pagefind writes its index under /_next/static, where a browser may keep a
 * file for a year (Cache-Control: public, max-age=31536000, immutable).
 * pagefind.js, pagefind-worker.js and wasm.<language>.pagefind keep their
 * names from build to build, so the post-build step adds ?v=<id> to every
 * address of them, and the palette reads the id from pagefind-version.json,
 * which it fetches with cache: 'no-store'. The id must change whenever one of
 * those files changes, or a returning browser keeps running the copies it
 * holds against a new index.
 *
 * .next/BUILD_ID cannot be that id. When a deployment id is set, Next writes
 * the same build id on every build (next/dist/build/index.js, getBuildId:
 * "Set a constant but random string"), and Vercel sets one through
 * NEXT_DEPLOYMENT_ID for skew protection. Production served the same id on two
 * builds with different Pagefind files on 2026-11-11.
 *
 * So the id is read from the files themselves: the first 20 hex digits of a
 * SHA-256 over every file Pagefind wrote, by path and content, with
 * pagefind-version.json left out and every address as Pagefind wrote it.
 * It changes when a script, an engine file or the index changes, and only
 * then. The post-build step computes it before it patches any address; the
 * search gate computes it again from the patched files by taking ?v=<id> out
 * of them, and fails when the two differ.
 */
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const VERSION_FILE = 'pagefind-version.json';
const PREFIX = 'pf-';

/** Every file under dir, as a path relative to dir with forward slashes. */
function filesUnder(dir) {
  const out = [];
  const walk = (sub) => {
    for (const entry of fs.readdirSync(path.join(dir, sub), { withFileTypes: true })) {
      const rel = sub ? `${sub}/${entry.name}` : entry.name;
      if (entry.isDirectory()) walk(rel);
      else out.push(rel);
    }
  };
  walk('');
  return out.sort();
}

/**
 * The id of the Pagefind index in dir. With `patchedWith` set to an id, every
 * "?v=<that id>" is taken out of the files first, which gives back the
 * addresses Pagefind wrote, since the post-build step only ever adds that
 * string.
 */
function pagefindIndexId(dir, patchedWith = null) {
  const hash = crypto.createHash('sha256');
  const added = patchedWith ? Buffer.from(`?v=${patchedWith}`) : null;
  for (const rel of filesUnder(dir)) {
    if (rel === VERSION_FILE) continue;
    let bytes = fs.readFileSync(path.join(dir, rel));
    if (added && bytes.includes(added)) {
      const parts = [];
      let from = 0;
      for (let at = bytes.indexOf(added); at !== -1; at = bytes.indexOf(added, from)) {
        parts.push(bytes.subarray(from, at));
        from = at + added.length;
      }
      parts.push(bytes.subarray(from));
      bytes = Buffer.concat(parts);
    }
    hash.update(`${rel}\0${bytes.length}\0`);
    hash.update(bytes);
  }
  return `${PREFIX}${hash.digest('hex').slice(0, 20)}`;
}

module.exports = { pagefindIndexId, VERSION_FILE };
