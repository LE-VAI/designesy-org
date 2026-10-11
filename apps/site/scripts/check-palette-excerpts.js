#!/usr/bin/env node
/**
 * Palette excerpt gate: a "Mentioned on" row reads as a clean line of text.
 *
 * WHY THIS EXISTS
 * The command palette shows a Pagefind excerpt under each full-text match.
 * Pagefind cuts its window by word count and the palette cut it again at 110
 * characters, so for the query "mo" two rows read:
 *
 *     Methodology  here", "learn more", "here")Parses anchor el...
 *     Compile      format. 04 Inclusion. Observation. Dark def...
 *
 * A stray closing quote and bracket, two text nodes glued without a space
 * (the methodology check list puts its label and its description in sibling
 * spans), a line that opens on the end of someone else's sentence and one that
 * stops mid-word. The build, the types and every visual gate passed them.
 *
 * WHAT IT ASSERTS
 *   1. tidyExcerpt (app/lib/excerpt.ts) on the two real excerpts and on edge
 *      cases: match at the start and at the end, very short text, nested
 *      quotes and brackets, entities, markup, text with no spaces (CJK).
 *      Every result keeps each kept match whole, cuts only between words,
 *      has no unbalanced bracket and no stray punctuation at either edge, and
 *      carries an ellipsis exactly where it begins or ends mid-sentence.
 *   2. Wiring: command-palette.tsx builds each mention's meta with tidyExcerpt
 *      and no longer slices the raw excerpt.
 *   3. Source: the methodology check list separates its label and its
 *      description with a space, so Pagefind indexes "here") Parses", not
 *      "here")Parses".
 *   4. Index: no word glued to a word. Pagefind read the text of two
 *      elements as one run wherever React wrote no space between them, so
 *      the index held "againVisit", "designDesign Systemsscored", "08Scroll"
 *      and 5,610 in all on 93 pages. separateWords (scripts/lib/word-boundaries.js)
 *      adds the space in the copy Pagefind indexes. Asserted on markup, on
 *      the wiring, and on the built index: wherever a served page has a
 *      letter or digit meeting a letter or digit across element tags, the
 *      index holds the two words apart. That covers a lowercase letter
 *      before a capital or a digit ("againVisit", "Tokens90") and the run-ons
 *      that rule alone misses ("Systemsscored", "08Scroll"). Unit cases pin
 *      what is left whole: words split by inline formatting
 *      (<em>un</em>believable, x<sup>2</sup>, de<mark>sign</mark>), text in
 *      sup, sub and abbr, two CJK characters, punctuation boundaries, React's
 *      text-join comments, and JOINED_NAMES (JavaScript, TypeScript), each
 *      with its reason. That every added space renders apart is measured in
 *      a browser by check-word-boundaries-render.js (CI, Visual gates part 3).
 *
 * Usage:  node scripts/check-palette-excerpts.js
 * Exits 1 on any failure. Needs Node 22.18+ (type stripping for excerpt.ts).
 */

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const zlib = require('node:zlib');
const { separateWords, gluedBoundaries, JOINED_NAMES } = require('./lib/word-boundaries');

const APP = path.join(__dirname, '..');

// excerpt.ts carries ESM syntax in a package with no "type" field, so Node
// reparses it as a module and says so on stderr. That note is expected here.
const emitWarning = process.emitWarning;
process.emitWarning = (warning, ...rest) =>
  String(warning).includes('Module type of') ? undefined : emitWarning.call(process, warning, ...rest);

const failures = [];
function check(name, fn) {
  try {
    fn();
    console.log(`  ok    ${name}`);
  } catch (err) {
    failures.push(name);
    console.log(`  FAIL  ${name}\n        ${String(err.message).split('\n').join('\n        ')}`);
  }
}

const ELLIPSIS = '\u2026';
const plain = (html) => html.replace(/<\/?mark>/g, '').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
const marks = (html) => [...html.matchAll(/<mark>(.*?)<\/mark>/g)].map((m) => m[1]);

/** The invariants every excerpt holds, whatever its input. */
function assertClean(out, input) {
  const text = plain(out);
  const body = text.replace(new RegExp(`^${ELLIPSIS}|${ELLIPSIS}$`, 'g'), '');
  // Only <mark> survives as markup, and every <mark> closes.
  assert.equal(out.replace(/<\/?mark>/g, '').includes('<'), false, `markup other than <mark>: ${out}`);
  assert.equal((out.match(/<mark>/g) || []).length, (out.match(/<\/mark>/g) || []).length, `unclosed <mark>: ${out}`);
  // No stray punctuation or space at either edge of the text.
  assert.doesNotMatch(body, /^[\s)\]},.;:!?\u201d\u2019-]/u, `stray leading character: ${JSON.stringify(text)}`);
  assert.doesNotMatch(body, /[\s(\[{,;:\u201c\u2018-]$/u, `stray trailing character: ${JSON.stringify(text)}`);
  // Brackets balance, and straight double quotes pair up.
  const pairs = { ')': '(', ']': '[', '}': '{' };
  const stack = [];
  for (const c of body) {
    if ('([{'.includes(c)) stack.push(c);
    else if (pairs[c]) assert.equal(stack.pop(), pairs[c], `unbalanced "${c}": ${JSON.stringify(text)}`);
  }
  assert.equal(stack.length, 0, `unclosed bracket: ${JSON.stringify(text)}`);
  assert.equal((body.match(/"/g) || []).length % 2, 0, `odd quote count: ${JSON.stringify(text)}`);
  // Every kept match is a whole match from the input.
  // (Pagefind wraps punctuation into a mark; the word inside it is the match.)
  const inputMarks = marks(input).map((m) => m.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, ''));
  for (const m of marks(out)) assert.ok(inputMarks.includes(m), `match "${m}" was cut (input marks: ${inputMarks.join(', ')})`);
  // Every word of the excerpt is a whole word of the input (never mid-word).
  const words = plain(input.replace(/<(?!\/?mark>)[^>]+>/g, ' '))
    .replace(/&quot;/g, '"')
    .split(/[\s"()[\]{}]+/)
    .filter(Boolean);
  const inputText = ` ${words.join(' ')} `;
  for (const w of body.split(/[\s"()[\]{}]+/).filter(Boolean)) {
    if (/[\u3040-\u30ff\u3400-\u9fff\uac00-\ud7af]/.test(w)) continue; // no-space scripts break anywhere
    const bare = w.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, '');
    if (!bare) continue;
    assert.ok(new RegExp(`(^|[^\\p{L}\\p{N}])${bare.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}([^\\p{L}\\p{N}]|$)`, 'u').test(inputText), `"${bare}" is not a whole word of the input`);
  }
}

async function main() {
  const { tidyExcerpt } = await import(pathToFileURL(path.join(APP, 'app', 'lib', 'excerpt.ts')).href);

  console.log('palette excerpts');

  // Every excerpt Pagefind returned for "mo" from a production build, as the
  // palette receives it (scripts/fixtures/palette-excerpts.json).
  const FIXTURE = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', 'palette-excerpts.json'), 'utf8'));
  const raw = (page) => {
    const hit = FIXTURE.excerpts.find((e) => e.page === page);
    assert.ok(hit, `fixture has no excerpt for ${page}`);
    return hit.excerpt;
  };
  const METHODOLOGY = raw('/methodology');
  const COMPILE = raw('/work/compile');

  check('methodology: opens on the quoted phrase, not on an orphan quote', () => {
    const out = tidyExcerpt(METHODOLOGY);
    assertClean(out, METHODOLOGY);
    assert.ok(out.startsWith(`${ELLIPSIS}"learn <mark>more</mark>", "here"`), out);
    assert.ok(out.endsWith(ELLIPSIS), out);
  });

  check('methodology: the glued text nodes are separated, the orphan bracket dropped', () => {
    const out = plain(tidyExcerpt(METHODOLOGY));
    assert.doesNotMatch(out, /\)Parses|"\)/, out);
    assert.match(out, /"here" Parses anchor elements/, out);
  });

  check('methodology after the source fix: a window opening on a quote is still mid-sentence', () => {
    // What Pagefind returns once the label and description are separated.
    const input =
      '"learn <mark>more",</mark> "here") Parses anchor elements and checks link text against a blocklist of non-descriptive patterns (click here, here, learn <mark>more,</mark> read <mark>more,</mark>';
    const out = tidyExcerpt(input);
    assertClean(out, input);
    assert.ok(out.startsWith(ELLIPSIS + '"learn <mark>more</mark>", "here" Parses anchor elements'), out);
  });

  check('compile: starts at the sentence that holds the match, ends on a sentence', () => {
    const out = tidyExcerpt(COMPILE);
    assertClean(out, COMPILE);
    assert.equal(out, 'Dark default, <mark>reduced-motion</mark> safe, <mark>mobile</mark> responsive. System font stack.');
  });

  check('every real "mo" excerpt: clean, within budget, its first match kept', () => {
    for (const { page, excerpt } of FIXTURE.excerpts) {
      const out = tidyExcerpt(excerpt);
      try {
        assertClean(out, excerpt);
        assert.ok(plain(out).length <= 88 + 2, `length ${plain(out).length}`);
        assert.ok(out.includes('<mark>'), 'no match kept');
        // The match sits early, so a one-line clamp never hides it.
        assert.ok(plain(out).indexOf(plain(out.slice(out.indexOf('<mark>')).replace(/<\/mark>[\s\S]*/, ''))) <= 50, 'match is not early in the line');
      } catch (err) {
        throw new Error(`${page}: ${err.message}\n  in:  ${excerpt}\n  out: ${out}`);
      }
    }
  });

  check('marks shed the punctuation Pagefind wraps into them', () => {
    assert.equal(tidyExcerpt('Read <mark>more,</mark> then stop.'), 'Read <mark>more</mark>, then stop.');
    assert.equal(tidyExcerpt('A cadence <mark>(daily/weekly).</mark>'), 'A cadence (<mark>daily/weekly</mark>).');
  });

  check('match at the start of a sentence: no leading ellipsis, nothing dropped', () => {
    const input = '<mark>Motion</mark> tokens compile to CSS custom properties and keyframes.';
    const out = tidyExcerpt(input);
    assertClean(out, input);
    assert.equal(out, input);
  });

  check('match at the very end: kept whole, trailing ellipsis when the text runs on', () => {
    const input =
      'every token the contract names is read, compiled to the platform and then checked against the scale it declares before the run scores the <mark>motion</mark>';
    const out = tidyExcerpt(input);
    assertClean(out, input);
    assert.ok(out.includes('<mark>motion</mark>'), out);
    assert.ok(out.startsWith(ELLIPSIS), out);
    assert.ok(out.endsWith(ELLIPSIS), out);
    assert.ok(plain(out).length <= 88 + 2, `length ${plain(out).length}`);
  });

  check('very short text: returned whole', () => {
    assert.equal(tidyExcerpt('<mark>Mo</mark>.'), '<mark>Mo</mark>.');
    assert.equal(tidyExcerpt('Read <mark>more</mark>.'), 'Read <mark>more</mark>.');
    assert.equal(tidyExcerpt(''), '');
    assert.equal(tidyExcerpt('<p> </p>'), '');
  });

  check('lowercase opening without a sentence in reach: leading ellipsis', () => {
    const out = tidyExcerpt('and the <mark>motion</mark> scale holds');
    assert.equal(out, `${ELLIPSIS}and the <mark>motion</mark> scale holds${ELLIPSIS}`);
  });

  check('nested quotes and brackets: balanced pairs kept, orphans at the cuts dropped', () => {
    const input =
      'ends here") then a (nested "quote [with] brackets" and <mark>more</mark>) inside, then text that runs past the budget so the end is cut (open "half';
    const out = tidyExcerpt(input);
    assertClean(out, input);
    // The window opens after "(nested", so its ")" is an orphan; the quote and
    // the bracket inside the window keep their partners.
    assert.match(plain(out), /"quote \[with\] brackets" and more inside/, out);
    const balanced = 'A "quoted (and [bracketed]) phrase" with <mark>more</mark> in it.';
    assert.equal(tidyExcerpt(balanced), balanced);
    const nested = 'It reads (as "a [<mark>more</mark>] b") here.';
    assert.equal(tidyExcerpt(nested), nested);
  });

  check('entities and other tags: decoded for the cut, escaped on the way out', () => {
    const input = 'Tokens &lt;b&gt; &amp; <em>styles</em> load <mark>more</mark> rules.';
    const out = tidyExcerpt(input);
    assert.equal(out, 'Tokens &lt;b&gt; &amp; styles load <mark>more</mark> rules.');
    assert.equal(tidyExcerpt('Read <mark>more</mark>.<img src=x onerror=alert(1)>'), 'Read <mark>more</mark>.');
  });

  check('a long excerpt fits the budget and never cuts a word', () => {
    const input =
      'The engine reads the contract and the <mark>motion</mark> scale it declares, then compares every duration and easing curve it finds in the shipped stylesheet against those tokens and reports';
    const out = tidyExcerpt(input);
    assertClean(out, input);
    assert.ok(plain(out).length <= 88 + 2, `length ${plain(out).length}`);
    assert.ok(out.endsWith(ELLIPSIS), out);
  });

  check('no-space text (CJK): cut between characters, match whole', () => {
    const input =
      '设计系统的动作令牌编译为样式表并在每次构建时由引擎逐项检查时长与缓动曲线是否符合合约中声明的刻度然后再把结果写入报告供审阅者核对<mark>动效</mark>是否一致并且在发布之前再次复核所有数值以及每一条规则的来源和版本记录确保没有遗漏';
    const out = tidyExcerpt(input);
    assertClean(out, input);
    assert.ok(out.includes('<mark>动效</mark>'), out);
    assert.ok(plain(out).length <= 88 + 2, `length ${plain(out).length}`);
    const sentence = '第一句结束。第二句包含<mark>动效</mark>令牌。';
    assert.equal(tidyExcerpt(sentence), sentence);
  });

  check('abbreviations and versions are not sentence ends', () => {
    const out = tidyExcerpt('see e.g. the v1.2 <mark>motion</mark> scale');
    assert.equal(out, `${ELLIPSIS}see e.g. the v1.2 <mark>motion</mark> scale${ELLIPSIS}`);
  });

  check('wiring: the palette builds mention meta with tidyExcerpt', () => {
    const src = fs.readFileSync(path.join(APP, 'app', 'lib', 'command-palette.tsx'), 'utf8');
    assert.ok(/import \{ tidyExcerpt \} from '\.\/excerpt';/.test(src), 'command-palette.tsx does not import tidyExcerpt');
    assert.ok(/const meta = d\.excerpt \? tidyExcerpt\(d\.excerpt\) : '';/.test(src), 'mention meta is not built with tidyExcerpt');
    assert.doesNotMatch(src, /\.slice\(0, 110\)/, 'the raw excerpt is still sliced to 110 characters');
  });

  check('source: the methodology check label and description are separated', () => {
    const src = fs.readFileSync(path.join(APP, 'app', 'methodology', 'page.tsx'), 'utf8');
    assert.match(
      src,
      /<span className="dx-check-item">\{unbroken\(itemOf\(c\.id\)\)\}<\/span>\s*<\/span>\{' '\}\s*<span className="dx-check-how">/,
      'Pagefind joins the two spans without a space: "here")Parses"'
    );
  });

  // ── 4. Index: words glued across element boundaries ────────────────────
  const sep = (html) => separateWords(html).html;

  check('separateWords: the four run-ons the index held are two words each', () => {
    // The markup each came from, as the build serves it.
    assert.equal(
      sep('<p class="eg-path"><span>designesy.org<b>/frameworks/mozaika-design</b></span><span>mozaika.design</span><span>Design Systems</span><span>scored 2026-10-10</span></p>'),
      '<p class="eg-path"><span>designesy.org<b>/frameworks/mozaika-design</b></span><span> mozaika.design</span><span> Design Systems</span><span> scored 2026-10-10</span></p>'
    );
    assert.equal(
      sep('<a class="button primary" href="/score?url=mozaika.design">Score it again</a><a class="button ghost" href="https://mozaika.design">Visit mozaika.design</a>'),
      '<a class="button primary" href="/score?url=mozaika.design">Score it again</a><a class="button ghost" href="https://mozaika.design"> Visit mozaika.design</a>'
    );
    assert.equal(
      sep('<span class="check-cell-index" aria-hidden="true">08</span><span class="check-cell-body"><span class="check-cell-title">Scroll <code>padding-top</code> 4.5rem</span></span>'),
      '<span class="check-cell-index" aria-hidden="true">08</span><span class="check-cell-body"><span class="check-cell-title"> Scroll <code>padding-top</code> 4.5rem</span></span>'
    );
    assert.equal(
      sep('<span class="check-cell-title">Wordmark breath</span><span class="check-cell-meta">Collapses under <code>prefers-reduced-motion</code></span>'),
      '<span class="check-cell-title">Wordmark breath</span><span class="check-cell-meta"> Collapses under <code>prefers-reduced-motion</code></span>'
    );
  });

  check('separateWords: table cells and dt/dd are words apart', () => {
    assert.equal(sep('<tr><th>Check</th><th>What</th></tr>'), '<tr><th>Check</th><th> What</th></tr>');
    assert.equal(sep('<dl><dt>Standard</dt><dd>W3C DTCG</dd></dl>'), '<dl><dt>Standard</dt><dd> W3C DTCG</dd></dl>');
  });

  check('separateWords: URL-like text on either side of a boundary gets one space, not a split URL', () => {
    assert.equal(sep('<span>mozaika-design</span><span>mozaika.design</span>'), '<span>mozaika-design</span><span> mozaika.design</span>');
    assert.equal(sep('<span>designesy.org<b>/frameworks/mozaika-design</b></span>'), '<span>designesy.org<b>/frameworks/mozaika-design</b></span>');
  });

  check('separateWords: punctuation boundaries are left alone', () => {
    for (const html of [
      '<code>--ink</code>, <code>--paper</code>',
      '<code>--ink</code><span>,</span>',
      '<span>/labs/</span><span>poise.json</span>',
      '<span>roles</span><span>→</span>',
      '<span>(</span><span>v01</span><span>)</span>',
    ]) {
      assert.equal(sep(html), html, html);
    }
  });

  check('separateWords: React text-join comments are one run, not a boundary', () => {
    for (const html of ['v<!-- -->0.4.4', 'pt<!-- -->s', '<span>42<!-- -->-check engine</span>']) assert.equal(sep(html), html, html);
  });

  check('separateWords: JOINED_NAMES (JavaScript, TypeScript) stay whole, each with a reason', () => {
    // span tags are not inline formatting, so only the allowlist keeps these whole.
    assert.equal(sep('<span>Java</span><span>Script</span>'), '<span>Java</span><span>Script</span>');
    assert.equal(sep('<span>Type</span><span class="x">Script</span> files'), '<span>Type</span><span class="x">Script</span> files');
    assert.equal(sep('<span>Java</span><span>Ruby</span>'), '<span>Java</span><span> Ruby</span>');
    assert.deepEqual(JOINED_NAMES.map((n) => n.name), ['JavaScript', 'TypeScript']);
    for (const n of JOINED_NAMES) assert.ok(n.reason && n.reason.length > 20, `${n.name} has no reason`);
  });

  check('separateWords: words split by inline formatting stay whole (em, sup, sub, mark, abbr, wbr)', () => {
    for (const html of [
      '<em>un</em>believable',
      'un<em>believ</em>able',
      'x<sup>2</sup>',
      'H<sub>2</sub>O',
      'de<mark>sign</mark>',
      '<mark>de</mark><mark>sign</mark>',
      '<b>bold</b><i>italic</i>',
      '<abbr title="Web Content Accessibility Guidelines">WCAG</abbr>2',
      'design<wbr>verification',
      '<pre><span class="k">const</span><span>x</span></pre>',
    ]) {
      assert.equal(sep(html), html, html);
    }
  });

  check('separateWords: never inside <sup>, <sub> or <abbr>, whatever the tags within', () => {
    for (const html of [
      'x<sup><span>1</span><span>2</span></sup>',
      'CO<sub><span>2</span><span>e</span></sub>',
      '<abbr><span>W</span><span>CAG</span></abbr>',
      '<abbr>WCAG</abbr><span>AA</span>',
    ]) {
      assert.equal(sep(html), html, html);
    }
  });

  check('separateWords: no space between two CJK characters (fixture)', () => {
    for (const html of [
      '<span>设计</span><span>系统</span>',
      '<tr><td>设计</td><td>系统</td></tr>',
      '<span>デザイン</span><span>システム</span>',
      '<span>디자인</span><span>시스템</span>',
    ]) {
      assert.equal(sep(html), html, html);
    }
    // A CJK word next to a Latin one is two words.
    assert.equal(sep('<span>设计</span><span>System</span>'), '<span>设计</span><span> System</span>');
  });

  check('separateWords: entities count as the characters they stand for', () => {
    assert.equal(sep('<b>R&amp;D</b><span>Team</span>'), '<b>R&amp;D</b><span> Team</span>');
    assert.equal(sep('<b>Q&amp;</b><span>A</span>'), '<b>Q&amp;</b><span>A</span>');
  });

  check('wiring: postbuild-pagefind stages every page through separateWords', () => {
    const src = fs.readFileSync(path.join(__dirname, 'postbuild-pagefind.js'), 'utf8');
    assert.ok(/require\('\.\/lib\/word-boundaries'\)/.test(src), 'postbuild-pagefind.js does not load word-boundaries');
    assert.ok(/separateWords\(fs\.readFileSync\(path\.join\(srcDir, rel\), 'utf8'\)\)/.test(src), 'staged pages are not passed through separateWords');
    assert.ok(!/fs\.copyFileSync\(path\.join\(srcDir, rel\), dest\)/.test(src), 'staged pages are still copied verbatim');
  });

  // The built index. This gate runs after `next build` and postbuild-pagefind
  // (its place in the build script and in CI); without a build there is no
  // index to read, and that is a failure, not a pass.
  const NEXT = path.join(APP, '.next');
  const FRAG = path.join(NEXT, 'static', 'chunks', 'app', 'pagefind', 'fragment');
  const SERVED = path.join(NEXT, 'server', 'app');
  check('index: every word meeting a word across element tags is held apart', () => {
    assert.ok(fs.existsSync(FRAG), `no Pagefind index at ${path.relative(APP, FRAG)}: run after next build and postbuild-pagefind`);
    const content = new Map();
    for (const f of fs.readdirSync(FRAG)) {
      const buf = zlib.gunzipSync(fs.readFileSync(path.join(FRAG, f)));
      const j = JSON.parse(buf.subarray('pagefind_dcd'.length).toString('utf8'));
      const rel = j.url.replace(/^\/_next\/static\/chunks\/app\//, '').replace(/^\//, '');
      content.set(rel, ` ${j.content.replace(/\s+/g, ' ')} `);
    }
    let pages = 0;
    let boundaries = 0;
    const glued = [];
    for (const [rel, text] of content) {
      const served = [path.join(SERVED, rel || 'index.html'), path.join(SERVED, rel.replace(/\.html$/, ''), 'index.html')].find((p) => fs.existsSync(p) && fs.statSync(p).isFile());
      if (!served) continue; // a JSON endpoint wrapper: no element boundaries in its text
      pages += 1;
      for (const { tail, head, tags } of gluedBoundaries(fs.readFileSync(served, 'utf8'))) {
        const run = tail + head;
        // Apart: a space, or the full stop Pagefind adds where a block ends.
        const apart = text.includes(`${tail} ${head}`) || text.includes(`${tail}. ${head}`);
        if (!apart && !text.includes(run)) continue; // outside the indexed body
        boundaries += 1;
        if (!apart) glued.push({ page: `/${rel.replace(/\.html$/, '')}`, run, tags });
      }
    }
    assert.ok(pages > 50, `only ${pages} indexed page(s) matched a served page`);
    const lowerThenCapitalOrDigit = glued.filter((g) => /\p{Ll}[\p{Lu}\p{N}]/u.test(g.run)).length;
    const lines = glued.slice(0, 25).map((g) => `${g.page}: "${g.run}" at ${g.tags.slice(0, 60)}`);
    assert.equal(
      glued.length,
      0,
      `${glued.length} of ${boundaries} word boundaries are glued in the index across ${new Set(glued.map((g) => g.page)).size} page(s); ` +
        `${lowerThenCapitalOrDigit} of them a lowercase letter before a capital or a digit:\n  ${lines.join('\n  ')}` +
        (glued.length > lines.length ? `\n  ... ${glued.length - lines.length} more` : '')
    );
    console.log(`        ${boundaries} word boundaries on ${pages} indexed pages, every one held apart`);
  });

  if (failures.length) {
    console.log(`\n${failures.length} check(s) failed`);
    process.exit(1);
  }
  console.log('\nall palette excerpt checks passed');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
