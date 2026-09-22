#!/usr/bin/env node
/**
 * Guard: the PROBE template literal's backticks must be BALANCED.
 *
 * FOUR ITERATIONS, AND THE FIRST THREE ALL FAILED. Recorded because the failures
 * are more instructive than the check:
 *
 * 1. A runtime check inside visual-floor.js protects NOTHING. An unbalanced
 *    backtick makes that file a parse error, so the `if` never executes. It
 *    could only run on a file that already parses.
 *
 * 2. A source-level checker scanned for the first line after the opening
 *    containing a backtick. That is EXACTLY WHAT A STRAY BACKTICK IS, so an
 *    injected mistake became the "closing" delimiter and the checker reported
 *    OK while looking directly at the bug -- verified by mutation, which it
 *    passed.
 *
 * 3. Its threshold treated >1 backtick as a violation, but a correct literal
 *    has two (open + close). It cried wolf on the unmodified file.
 *
 * A checker fooled by its own target is worse than none, because it manufactures
 * confidence. So this version does not try to find the end of the literal at
 * all. It counts every backtick in the file's PROBE region and requires the
 * total to be EVEN. An odd count means an unbalanced delimiter, wherever it is.
 *
 * Evenness is the right property: it cannot be satisfied by a stray backtick,
 * it does not depend on locating a terminator, and it needs no threshold.
 */

const fs = require('node:fs');
const path = require('node:path');

const TARGET = path.join(__dirname, 'visual-floor.js');
const MARKER = 'const PROBE = `';

const src = fs.readFileSync(TARGET, 'utf8');
const lines = src.split('\n');
const start = lines.findIndex((l) => l.includes(MARKER));

if (start === -1) {
  console.error('[probe-guard] could not find "' + MARKER + '"');
  process.exit(2);
}

// Count backticks from the marker line to the line that ends the literal.
//
// The terminator is the line containing `})()` followed by a backtick and a
// semicolon -- matched by its CODE, not by "the next backtick", so a stray
// backtick inside the literal cannot be mistaken for it.
let end = -1;
for (let i = start; i < lines.length; i++) {
  const code = lines[i].split('//')[0];              // ignore comments
  if (i > start && /\}\)\(\)`;\s*$/.test(code.trim())) {
    end = i;
    break;
  }
}

if (end === -1) {
  console.error(
    '[probe-guard] could not find the PROBE terminator (expected a line ' +
      'matching /})()`;/) between line ' + (start + 1) + ' and ' +
      lines.length,
  );
  process.exit(2);
}

const body = lines.slice(start, end + 1).join('\n');
// Strip comments before counting: a backtick in a COMMENT inside the literal is
// the actual historical mistake, so comments must NOT be excluded... but the
// terminator regex above needs them excluded. Count the raw text.
const count = (body.match(/`/g) || []).length;

if (count % 2 !== 0) {
  console.error(
    '[probe-guard] ODD backtick count (' + count + ') between lines ' +
      (start + 1) + ' and ' + (end + 1) + '.\n' +
      '             An unbalanced backtick closes the template literal early.\n' +
      "             Use single quotes in comments inside PROBE.",
  );
  process.exit(1);
}

console.log(
  '[probe-guard] OK - PROBE lines ' + (start + 1) + '-' + (end + 1) +
    ', ' + count + ' backticks (balanced)',
);
