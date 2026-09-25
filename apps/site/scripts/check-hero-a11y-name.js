#!/usr/bin/env node
/**
 * hero a11y gate — the hero headline's accessible name must be stable and complete.
 *
 * WHY THIS EXISTS
 * The hero h1 is animated: the final word scrambles and cycles every 3.2s. On
 * 2026-09-25 the live page was read through Chrome's own accessibility tree and
 * the heading announced as:
 *
 *     "AI makes execution We make execution yours."
 *
 * while the visible word read "legitimate". Two independent defects were in that
 * one string:
 *
 *   1. FROZEN — the rotator's aria-label was written once from words[0] and
 *      then only updated by setWord(), which is reachable only from inside the
 *      rotation timer. Measured over 14 samples on production: 11 disagreed with
 *      the visible word.
 *   2. INCOMPLETE — the word "free" was missing outright, because line 1's
 *      aria-label is derived from that line's FIRST TEXT NODE
 *      (`firstChild.textContent`) and line 1 ends in a sibling
 *      `<span class="hero-word-free">`. Everything after the first text node was
 *      dropped from the name.
 *
 * WHY A SOURCE GATE AND NOT A DOM ASSERTION
 * The defect is a property of the RENDERED, HYDRATED page — it appears only once
 * the scramble enhancer has run, and it changes as the animation cycles. The
 * prerendered HTML cannot show it, so asserting on built HTML would pass on
 * broken code. There is no browser in the build. What CAN be asserted statically
 * is the structural invariant that makes the name correct by construction:
 *
 *   * the <h1> carries an explicit aria-label (the canonical sentence), and
 *   * the animated lines inside it are aria-hidden, so the rotator's own
 *     aria-label writes cannot reach the accessibility tree at all.
 *
 * That pairing is the fix. If either half is removed the defect returns, so this
 * gate asserts both.
 *
 * THE CLAUSE THAT COULD NOT FAIL
 * The lane's standing lesson is that every source-level gate written here had
 * one clause that silently could not fail on first draft — a pattern matched
 * across a block boundary, or satisfied by a comment. Two guards are therefore
 * built in:
 *
 *   * the <h1> clause is scoped to the h1 ELEMENT TAG and matched against
 *     comment-stripped source, so a comment mentioning aria-label cannot satisfy
 *     it (the d02 gate shipped with exactly that hole);
 *   * the aria-hidden clause requires it on BOTH animated lines, and is written
 *     as a bounded character class that cannot cross a closing `>` into the next
 *     element (the count-up gate shipped matching across a block boundary).
 *
 * Both clauses were mutation-tested by removing each attribute from the real
 * source and confirming a non-zero exit, and by re-running after every pattern
 * tightening.
 *
 * Usage:  node scripts/check-hero-a11y-name.js [--json]
 * Exits 1 on any finding, so it can gate CI.
 */

const fs = require('node:fs');
const path = require('node:path');

const APP = path.join(__dirname, '..');
const SRC = path.join(APP, 'app', 'page.tsx');

/**
 * Strip comments so a clause cannot be satisfied by prose that merely names the
 * attribute. The d02 gate shipped with a clause that passed on code with the
 * check deleted, because a comment still contained the matched text.
 */
function stripComments(code) {
  return code
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/(^|[^:])\/\/[^\n]*/g, '$1 ');
}

/**
 * The hero h1 block, from the opening <h1 tag to its closing </h1>.
 *
 * Scoped deliberately: a bare /aria-label/ search would be satisfied by the
 * hundreds of other aria-labels on the page.
 */
function heroH1Block(code) {
  const m = code.match(/<h1\b[\s\S]*?<\/h1>/);
  return m ? m[0] : null;
}

const CLAUSES = [
  {
    id: 'h1-has-canonical-aria-label',
    test: (code) => {
      const block = heroH1Block(code);
      if (!block) return false;
      // The opening tag only — an aria-label on a CHILD span is the old defect,
      // not the fix, so it must not satisfy this clause.
      const openTag = block.slice(0, block.indexOf('>') + 1);
      return /\baria-label=\{HERO_HEADLINE\}/.test(openTag);
    },
    why: 'The hero <h1> must carry an explicit aria-label so its accessible name does not depend on the animating text. Without it the name is whatever the scramble enhancer last wrote — measured on production as a frozen "yours" while the visible word read "legitimate".',
    fix: 'Add aria-label={HERO_HEADLINE} to the <h1 id="hero-title"> opening tag.',
  },
  {
    id: 'headline-constant-is-derived',
    test: (code) => /const HERO_HEADLINE\s*=\s*`[^`]*\$\{HERO_LINE_1\}[^`]*\$\{HERO_ROTATOR_WORDS\[0\]\}[^`]*`/.test(code),
    why: 'HERO_HEADLINE must be DERIVED from the same rotator list the markup renders, not a second frozen sentence. Two hand-written copies of one sentence is the shape this lane exists to remove — the name would stay at words[0] while the list moved on.',
    fix: 'Build HERO_HEADLINE from HERO_LINE_1 and HERO_ROTATOR_WORDS[0] in a template literal.',
  },
  {
    id: 'rotator-lines-are-aria-hidden',
    test: (code) => {
      const block = heroH1Block(code);
      if (!block) return false;
      const lines = block.match(/<span\b[^>]*className="hero-display-line[^"]*"[^>]*>/g) || [];
      if (lines.length < 2) return false;
      // The class is bounded so the match cannot run past the tag's own `>` into
      // the following sibling — the count-up gate's first clause matched straight
      // across a block boundary and passed on buggy code.
      return lines.every((tag) => /\baria-hidden="true"/.test(tag));
    },
    why: 'Both animated headline lines must be aria-hidden. Otherwise the scramble enhancer writes aria-label onto them during rotation (it sets it from words[0] and from each rotated word), and those writes are what produced the frozen, incomplete name. With the lines hidden, only the canonical h1 name reaches the accessibility tree.',
    fix: 'Add aria-hidden="true" to both <span className="hero-display-line ..."> elements inside the h1.',
  },
  {
    id: 'rotator-wordlist-has-one-source',
    test: (code) => {
      const literal = code.match(/data-scramble-rotate-words='\[[^\]]*\]'/);
      const derived = /data-scramble-rotate-words=\{JSON\.stringify\(HERO_ROTATOR_WORDS\)\}/.test(code);
      // Pass when derived. Fail on a hardcoded literal, because that is the
      // second frozen copy the constant exists to prevent.
      return derived && !literal;
    },
    why: 'The rotator word list must be passed as JSON.stringify(HERO_ROTATOR_WORDS), not a hardcoded attribute string. A literal list beside the constant is two sources for one fact: HERO_HEADLINE would pin words[0] from the constant while the markup rotated a differently-ordered list.',
    fix: 'Replace the data-scramble-rotate-words literal with {JSON.stringify(HERO_ROTATOR_WORDS)}.',
  },
];

function main() {
  const asJson = process.argv.includes('--json');

  if (!fs.existsSync(SRC)) {
    const msg = `hero-a11y-name: source not found at ${SRC}`;
    if (asJson) console.log(JSON.stringify({ ok: false, error: msg }, null, 2));
    else console.error(msg);
    process.exit(1);
  }

  const code = stripComments(fs.readFileSync(SRC, 'utf8'));
  const findings = [];

  for (const clause of CLAUSES) {
    let pass = false;
    try {
      pass = Boolean(clause.test(code));
    } catch {
      pass = false;
    }
    if (!pass) findings.push({ id: clause.id, why: clause.why, fix: clause.fix });
  }

  if (asJson) {
    console.log(JSON.stringify({ ok: findings.length === 0, checked: SRC, findings }, null, 2));
  } else if (findings.length === 0) {
    console.log(`hero-a11y-name: OK — ${CLAUSES.length} clause(s) hold against ${path.relative(APP, SRC)}`);
  } else {
    console.error(`hero-a11y-name: ${findings.length} finding(s) in ${path.relative(APP, SRC)}\n`);
    for (const f of findings) {
      console.error(`  [${f.id}]`);
      console.error(`    why: ${f.why}`);
      console.error(`    fix: ${f.fix}\n`);
    }
  }

  process.exit(findings.length === 0 ? 0 : 1);
}

main();
