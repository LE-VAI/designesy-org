/**
 * The id Find puts on Pagefind's scripts and engine file.
 *
 * Pagefind writes its index under /_next/static, where a browser may keep a
 * file for a year (Cache-Control: public, max-age=31536000, immutable).
 * pagefind.js, pagefind-worker.js and wasm.<language>.pagefind keep their
 * names from build to build, so the post-build step adds ?v=<id> to every
 * address of them, and the palette reads the id from pagefind-version.json,
 * which it fetches with cache: 'no-store'. The id must change whenever a file
 * the site serves from there changes, or a returning browser keeps running
 * the copies it holds against a new index.
 *
 * .next/BUILD_ID cannot be that id. When a deployment id is set, Next writes
 * the same build id on every build (next/dist/build/index.js, getBuildId:
 * "Set a constant but random string"), and Vercel sets one through
 * NEXT_DEPLOYMENT_ID for skew protection. Production served the same id on two
 * builds with different Pagefind files on 2026-11-11.
 *
 * So the id is read from the files as the site serves them: 'pf-' and the
 * first 20 hex digits of a SHA-256 over SCHEME and every file in the
 * directory, by path and content, with pagefind-version.json left out and
 * each '?v=<id>' read as '?v=' + PLACEHOLDER. The post-build step patches the
 * addresses with PLACEHOLDER, hashes, then writes the id in its place, so a
 * change to what Pagefind writes and a change to the patching both give a new
 * id. The search gate hashes the emitted files the same way and fails when
 * the result is not the id in pagefind-version.json.
 *
 * What the hash cannot see: response headers. A deploy that changes only a
 * header the browser keeps with these files (the worker's
 * Content-Security-Policy, say) keeps the id. Such a deploy raises SCHEME.
 */
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const SCHEME = 1;
const VERSION_FILE = 'pagefind-version.json';
const PREFIX = 'pf-';
const PLACEHOLDER = `${PREFIX}${'0'.repeat(20)}`;
const ID_FORMAT = /^pf-[0-9a-f]{20}$/;

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

/** bytes with every occurrence of `from` replaced by `to`. */
function replaceAll(bytes, from, to) {
  if (!bytes.includes(from)) return bytes;
  const parts = [];
  let at = 0;
  for (let i = bytes.indexOf(from); i !== -1; i = bytes.indexOf(from, at)) {
    parts.push(bytes.subarray(at, i), to);
    at = i + from.length;
  }
  parts.push(bytes.subarray(at));
  return Buffer.concat(parts);
}

/**
 * The id of the Pagefind index in dir. `servedWith` is the id the files
 * already carry, if any: each '?v=<servedWith>' is read as
 * '?v=<PLACEHOLDER>'.
 */
function pagefindIndexId(dir, servedWith = null) {
  const hash = crypto.createHash('sha256');
  hash.update(`scheme ${SCHEME}\0`);
  const slot = Buffer.from(`?v=${PLACEHOLDER}`);
  const carried = servedWith && servedWith !== PLACEHOLDER ? Buffer.from(`?v=${servedWith}`) : null;
  for (const rel of filesUnder(dir)) {
    if (rel === VERSION_FILE) continue;
    let bytes = fs.readFileSync(path.join(dir, rel));
    if (carried) bytes = replaceAll(bytes, carried, slot);
    hash.update(`${rel}\0${bytes.length}\0`);
    hash.update(bytes);
  }
  return `${PREFIX}${hash.digest('hex').slice(0, 20)}`;
}

/** Writes id into every file in dir that carries PLACEHOLDER; returns how many. */
function stampIndexId(dir, id) {
  const slot = Buffer.from(`?v=${PLACEHOLDER}`);
  const stamp = Buffer.from(`?v=${id}`);
  let files = 0;
  for (const rel of filesUnder(dir)) {
    const file = path.join(dir, rel);
    const bytes = fs.readFileSync(file);
    if (!bytes.includes(slot)) continue;
    fs.writeFileSync(file, replaceAll(bytes, slot, stamp));
    files++;
  }
  return files;
}

module.exports = { pagefindIndexId, stampIndexId, PLACEHOLDER, ID_FORMAT, SCHEME, VERSION_FILE };
