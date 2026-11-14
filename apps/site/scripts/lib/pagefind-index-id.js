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
 * the same build id on every build (getBuildId in next/dist/build/index.js
 * returns a fixed string), and Vercel sets one through
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
 * Content-Security-Policy, say) keeps the id unless SCHEME is raised by
 * hand, and nothing checks that it is.
 */
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');

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
 * '?v=<PLACEHOLDER>'. `scheme` is for the self-test; callers leave it.
 */
function pagefindIndexId(dir, servedWith = null, scheme = SCHEME) {
  const hash = crypto.createHash('sha256');
  hash.update(`scheme ${scheme}\0`);
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

// ---- self-test --------------------------------------------------------------
//
// The search gate computes the id with this same helper, so a helper that
// skipped some bytes would pass both the post-build step and the gate. These
// cases run the helper over a small index built in a temporary directory and
// say which property fails. Each is one a single-edit change to this file was
// shown to pass every other check with: skipping the engine, the scripts or
// the worker, skipping file content or all but its start, dropping SCHEME, a
// stamp that does not round-trip, or skipping gzip-encoded files or style
// sheets, which is why the fixture holds both.

/** The two templates Pagefind writes for the worker and the engine. */
const WORKER_TEMPLATE = '`${basePath}pagefind-worker.js`';
const ENGINE_TEMPLATE = '`${this.basePath}wasm.${language}.pagefind`';

/**
 * Known answers, so the scheme itself is pinned and not only its
 * properties: SHA-256 over `scheme <SCHEME>\0`, then each file in code-unit
 * order of its whole path, each as its path, its length and its bytes.
 *
 * The six names make a walk that does not sort the whole list give another
 * id, for two reasons. NTFS lists a directory in its own order, not in
 * code-unit order (a, ab, a_b, B, sub, sub-d here). On Linux, Node returns
 * each directory already sorted (libuv sorts what it reads, and macOS uses
 * the same code), so there only sub-d tells the two apart: sorted as whole
 * paths it comes before sub/c, since "-" is 0x2D and "/" is 0x2F, while a
 * walk that sorts each directory on its own reaches sub/c first.
 *
 * Both values were computed by this helper and again by a separate
 * implementation. A change to the scheme raises SCHEME and replaces both
 * with what the self-test prints.
 */
const KNOWN_FILES = [['B', 'b'], ['a', 'a'], ['a_b', 'ab'], ['ab', ''], ['sub/c', 'c'], ['sub-d', 'd']];
const KNOWN_FILES_ID = 'pf-1e135fcf7d17617d1b3c';
const KNOWN_FIXTURE_ID = 'pf-5085132950acc582635e';

/**
 * raw as a gzip stream, the encoding Pagefind writes its engines,
 * fragments, index chunks and meta file in. The blocks are stored, not
 * compressed, and laid out here, so the bytes are the same with every zlib
 * build; zlib gives only the last eight bytes, the CRC-32 and length that
 * end any gzip stream of raw.
 */
function gzipStored(raw) {
  const parts = [Buffer.from([0x1f, 0x8b, 8, 0, 0, 0, 0, 0, 0, 255])];
  for (let at = 0; at < raw.length; at += 0xffff) {
    const len = Math.min(0xffff, raw.length - at);
    const head = Buffer.alloc(5);
    head[0] = at + len === raw.length ? 1 : 0;
    head.writeUInt16LE(len, 1);
    head.writeUInt16LE(len ^ 0xffff, 3);
    parts.push(head, raw.subarray(at, at + len));
  }
  parts.push(zlib.gzipSync(raw).subarray(-8));
  return Buffer.concat(parts);
}

/**
 * Writes a small Pagefind-shaped index into dir, its addresses patched with
 * PLACEHOLDER as the post-build step patches them (only the worker's when
 * `engines` is false, as before the engine addresses were patched). The
 * files Pagefind gzip-encodes are gzip-encoded here too, and the one
 * fragment is a page at "/". Returns the relative paths of the files that
 * count toward the id.
 */
function writeFixtureIndex(dir, { engines = true } = {}) {
  const slot = (tpl) => `${tpl.slice(0, -1)}?v=${PLACEHOLDER}\``;
  const engine = engines ? slot(ENGINE_TEMPLATE) : ENGINE_TEMPLATE;
  const files = {
    'pagefind.js': `export const worker = ${slot(WORKER_TEMPLATE)};\nexport const engine = ${engine};\n`,
    'pagefind-worker.js': `const engine = ${engine};\nself.onmessage = () => {};\n`,
    // Larger than the real engine, so hashing only a file's start is caught.
    'wasm.en.pagefind': gzipStored(Buffer.concat([Buffer.from([0, 97, 115, 109, 1, 0, 0, 0]), Buffer.alloc(128 * 1024, 7)])),
    'wasm.unknown.pagefind': gzipStored(Buffer.from([0, 97, 115, 109, 1, 0, 0, 0, 9, 9, 9, 9])),
    'pagefind-entry.json': '{"version":"1.6.0","languages":{"en":{"hash":"en_aaaaaaa","page_count":1}}}',
    'pagefind-ui.js': 'export const ui = 1;\n',
    'pagefind-ui.css': '.pagefind-ui { color: inherit; }\n',
    'fragment/en_bbbbbbb.pf_fragment': gzipStored(Buffer.from('pagefind_dcd{"url":"/","meta":{"title":"Home"}}')),
    'index/en_ccccccc.pf_index': gzipStored(Buffer.from('index body')),
    'pagefind.en_aaaaaaa.pf_meta': gzipStored(Buffer.from('meta body')),
    [VERSION_FILE]: '{"buildId":"not read"}',
  };
  for (const [rel, body] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true });
    fs.writeFileSync(path.join(dir, rel), body);
  }
  return Object.keys(files).filter((rel) => rel !== VERSION_FILE);
}

/** Runs the helper's cases in a temporary directory; returns how many cases
 *  it checked and what failed. */
function selfTest() {
  const os = require('node:os');
  const bad = [];
  let cases = 0;
  const failIf = (broken, what) => { cases++; if (broken) bad.push(what); };
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'pagefind-index-id-'));
  try {
    const dir = path.join(root, 'index');
    const counted = writeFixtureIndex(dir);
    const base = pagefindIndexId(dir);
    failIf(!ID_FORMAT.test(base) || base === PLACEHOLDER, `the id ${base} is not pf- and 20 hex digits`);
    failIf(pagefindIndexId(dir) !== base, 'the same files gave two ids');
    failIf(pagefindIndexId(dir, null, SCHEME + 1) === base, 'a new SCHEME kept the id');

    const known = path.join(root, 'known');
    for (const [rel, body] of KNOWN_FILES) {
      fs.mkdirSync(path.dirname(path.join(known, rel)), { recursive: true });
      fs.writeFileSync(path.join(known, rel), body);
    }
    const knownId = pagefindIndexId(known);
    failIf(knownId !== KNOWN_FILES_ID, `six small files gave ${knownId}, not ${KNOWN_FILES_ID}: the hash, the order of the files or how each is framed changed (see KNOWN_FILES)`);
    failIf(base !== KNOWN_FIXTURE_ID, `the fixture index gave ${base}, not ${KNOWN_FIXTURE_ID} (see KNOWN_FILES)`);
    for (const id of [`pf-${'a'.repeat(19)}`, `pf-${'a'.repeat(21)}`, `pf-${'A'.repeat(20)}`, `pf-${'g'.repeat(20)}`, 'build-TfctsWXpff2fKS', ` ${base}`, `${base}\n`]) {
      failIf(ID_FORMAT.test(id), `ID_FORMAT accepts ${JSON.stringify(id)}`);
    }

    for (const rel of counted) {
      const file = path.join(dir, rel);
      const orig = fs.readFileSync(file);
      const flip = (at) => { const b = Buffer.from(orig); b[at] ^= 1; return b; };
      for (const [how, bytes] of [
        ['a changed middle byte', flip(orig.length >> 1)],
        ['a changed last byte', flip(orig.length - 1)],
        ['an added last byte', Buffer.concat([orig, Buffer.from([1])])],
      ]) {
        fs.writeFileSync(file, bytes);
        failIf(pagefindIndexId(dir) === base, `${how} in ${rel} kept the id`);
      }
      fs.writeFileSync(file, orig);
    }
    const extra = path.join(dir, 'fragment', 'en_ddddddd.pf_fragment');
    fs.writeFileSync(extra, 'another page');
    failIf(pagefindIndexId(dir) === base, 'an added fragment kept the id');
    fs.rmSync(extra);
    fs.writeFileSync(path.join(dir, VERSION_FILE), '{"buildId":"something else"}');
    failIf(pagefindIndexId(dir) !== base, `${VERSION_FILE} changed the id`);

    const stamped = stampIndexId(dir, base);
    failIf(stamped !== 2, `the id went into ${stamped} file(s), not pagefind.js and pagefind-worker.js`);
    failIf(pagefindIndexId(dir, base) !== base, 'the stamped files, read as served, gave another id');
    failIf(pagefindIndexId(dir) === base, 'the stamped files gave the same id when the stamp was not read');

    const before = path.join(root, 'worker-only');
    writeFixtureIndex(before, { engines: false });
    failIf(pagefindIndexId(before) === base, 'patching the worker address alone gave the id of patching all three');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
  return { cases, bad };
}

module.exports = {
  pagefindIndexId, stampIndexId, selfTest, writeFixtureIndex,
  PLACEHOLDER, ID_FORMAT, SCHEME, VERSION_FILE, WORKER_TEMPLATE, ENGINE_TEMPLATE,
};

if (require.main === module) {
  const { cases, bad } = selfTest();
  for (const b of bad) console.error(`  [self-test] FAIL ${b}`);
  console.log(`[pagefind-index-id] self-test: ${bad.length ? `${bad.length} failure(s) in ${cases} cases` : `every case holds (${cases} cases)`}`);
  process.exit(bad.length ? 1 : 0);
}
