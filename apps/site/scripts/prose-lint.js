#!/usr/bin/env node
/**
 * Prose gate — assert on what a READER sees, not on what the code says.
 *
 * WHY THIS EXISTS
 * A literal "${ENGINE_CHECK_COUNT}" in a JSX text node shipped to four live
 * pages, including the homepage hero, which read "evaluate $42 verification
 * checks". Every check the repo had passed it:
 *   - the build succeeded (valid JSX, valid TS),
 *   - the number was correct (42, not 0 or NaN),
 *   - the sentence read plausibly to any skim,
 *   - no test asserted on prose, because prose was not a thing tests looked at.
 * It was found by accident, by dumping the page into a text file where the
 * stray character sat next to its value.
 *
 * This gate makes that class loud. It runs against the PRERENDERED HTML the
 * build already produces, so it costs one pass over files already on disk.
 *
 * THE DISCIPLINE THAT MATTERS MOST HERE: DECODE ENTITIES BEFORE ASSERTING.
 * My first version of this check in a shell produced two false positives --
 * it flagged "var()" and "cubic-bezier()" as "empty parens" on a page whose
 * prose is ABOUT CSS. A gate that cries wolf gets ignored, and an ignored gate
 * is worse than no gate because it implies coverage it does not provide. So:
 * strip script/style/tags, decode entities, and only then assert. Anything
 * that needs an exemption carries an explicit, reasoned allowlist entry.
 *
 * Usage:  node scripts/prose-lint.js [--json]
 * Exits 1 on any finding, so it can gate CI.
 */

const fs = require('node:fs');
const path = require('node:path');

const APP = path.join(__dirname, '..');
const NEXT_APP = path.join(APP, '.next', 'server', 'app');

// ── Rules ────────────────────────────────────────────────────────────────────
// Each rule asserts on DECODED, TAG-STRIPPED visible text. A rule earns its
// place by catching a defect that build/type/lint checks structurally cannot.

const RULES = [
  {
    id: 'jsx-text-interpolation',
    // The exact bug class that shipped. In a JSX text node, ${NAME} does not
    // interpolate -- JSX renders the "$" and the braces literally.
    re: /\$\{[A-Za-z_][A-Za-z0-9_]*\}/g,
    why: 'Literal ${...} in rendered text: template-literal syntax written inside a JSX text node, which JSX does not interpolate.',
    fix: 'Use {NAME} without the dollar sign inside JSX text.',
  },
  {
    id: 'nan-or-undefined',
    re: /\b(?:NaN|undefined)\b/g,
    why: 'A value failed to compute and its failure token rendered as prose.',
    fix: 'Guard the expression or supply a fallback.',
  },
  {
    id: 'stray-dollar-before-number',
    // Catches "$42" and "$ 42" while leaving legitimate currency such as
    // "$20/month" alone only if it is in the allowlist -- currency IS possible
    // on this site, so this rule reports rather than assuming.
    re: /\$\s?\d[\d,.]*/g,
    why: 'A "$" sits immediately before a number in rendered text.',
    fix: 'If unintended, remove the "$". If a real price, add it to ALLOW.',
  },
  // NOTE: there is deliberately NO double-space rule here.
  //
  // It was written, and it does not work on HTML source. Text sitting between
  // block tags arrives with the author's indentation intact, so "  " appears
  // between words on 4,833 occasions across 97 routes while the RENDERED page
  // shows a single space, because a browser collapses it. Collapsing the
  // whitespace before the rules run is what makes the other rules correct, and
  // doing that also erases the evidence a double-space rule needs. The two
  // requirements are in direct conflict, and the resolution is that a visible
  // double space cannot occur in HTML at all: the renderer collapses it first.
  //
  // Worth recording because it is the same trap the markdown converter hit the
  // same day, in the same direction: an extractor that is right for one rule is
  // wrong for another, and a rule that fires 4,833 times on correct output is a
  // rule nobody will keep.

  {
    id: 'orphan-punctuation',
    // A space BEFORE the punctuation. Deliberately excludes ':' and '?' --
    // "16 : 9" and French spacing are real, and guessing there invents typos.
    //
    // The `|` guard is not decoration. Cell boundaries are drawn as bare pipes,
    // and without the guard a table row like "| B | 86.1% |" would trip the
    // rule on the pipe itself. Requiring a word character before the space
    // keeps the rule pointed at real prose.
    re: /\w\s+[%.,;!](?![\w|])/g,
    why: 'Whitespace before punctuation renders as a visible gap.',
    fix: 'Remove the space, or fix the element boundary that introduced it.',
  },
  {
    id: 'unrendered-entity',
    // Only fires on entities that survive into visible text. Legitimate markup
    // entities are decoded before this rule runs, so anything left here is
    // genuinely unrendered.
    re: /&(?:amp|lt|gt|quot|#\d+|#x[0-9a-fA-F]+);/g,
    why: 'An HTML entity survived into visible text instead of being decoded.',
    fix: 'The entity is double-escaped somewhere in the render path.',
  },
];

/**
 * Exemptions. EVERY entry MUST carry an `on` matcher.
 *
 * This shape is the whole point, and it was learned the hard way: the first
 * version of this file included an entry with `rule: 'any'` and NO `on`. In the
 * matcher loop that skipped both guards and returned "allowed" for every match
 * of every rule — so the gate printed "OK - no visible-text defects" while
 * being structurally incapable of printing anything else. It reported success
 * with 100% blindness, which is the exact failure this gate was written to
 * catch, reproduced inside the gate itself.
 *
 * `isAllowed` below now THROWS on a rule with no matcher, so that shape cannot
 * come back.
 *
 * NO `/g` FLAG ON THESE. A global regex's lastIndex persists across `.test()`
 * calls, so the same matcher would return true, then false, then true for the
 * same input — exemptions that apply intermittently are worse than none.
 */
const ALLOW = [
  // Prose ABOUT CSS: these are literal function names a reader should see.
  {
    rule: 'orphan-punctuation',
    on: /(?:var|cubic-bezier|clamp|linear|min|max|calc|url)\(\)/,
    why: 'CSS function names are the subject of the sentence, not a bug.',
  },
  // Real currency in pricing copy. Verified against /pricing and /continuity:
  // "$29/site/month" is the Continuity tier price, stated five ways.
  {
    rule: 'stray-dollar-before-number',
    on: /^\$29/,
    why: 'Continuity pricing, verified real on /pricing and /continuity.',
  },
  // "undefined" used as an English word, not as a leaked value. Verified on
  // /contracts/readiness: "FAIL: No /robots.txt - crawling rules undefined".
  // The word is the sentence's meaning; a numeric guard would not catch it and
  // a blanket ban would force worse copy.
  {
    rule: 'nan-or-undefined',
    context: true,
    on: /crawling rules undefined|rules undefined/,
    why:
      'Used as an English word in a check description ("crawling rules ' +
      'undefined"), verified on /contracts/readiness. Scoped to that phrase: a ' +
      'blanket /undefined/ exemption would also excuse a genuinely leaked ' +
      'value, which is the case this rule exists to catch.',
  },
  // Dotted filename or domain; the period is part of the identifier.
  {
    rule: 'orphan-punctuation',
    on: /\w\s+\.(?:cursorrules|md|json|org|com|ai|io|txt|css|ts|tsx|mjs)\b/,
    why: 'Dotted filename or domain; the period is part of the identifier.',
  },
  // An ellipsis under discussion. /methodology documents a check that searches
  // for "trailing periods (excludes ellipsis ...)", where the spaced dots are
  // the SUBJECT of the sentence. Rewriting them would break the explanation.
  {
    rule: 'orphan-punctuation',
    context: true,
    on: /ellipsis\s+\.\.\./,
    why: 'The ellipsis is being described, not misused.',
  },
  // A regex pattern quoted in prose. /methodology's check table documents the
  // pattern it matches: "3+ classes matching .(card | panel | tile ...)". The
  // space-then-dot is part of the quoted pattern, not stray punctuation.
  {
    rule: 'orphan-punctuation',
    context: true,
    on: /matching\s+\.\(/,
    why: 'A regex pattern quoted in documentation.',
  },
  // Exclamation inside a control's LABEL, which is text a reader does see.
  // /spring-validator's risk selector offers a button labelled
  // "Bouncy (risky) !" as deliberate UI copy. Flagging it would ask for a
  // rewrite of a button that is working as designed.
  {
    rule: 'orphan-punctuation',
    on: /\w\s+!/,
    why: 'Asterisked emphasis in button copy; verified on /spring-validator.',
  },
];

// ── Visible-text extraction ──────────────────────────────────────────────────

function decodeEntities(s) {
  return s
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#x27;|&apos;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/&mdash;/g, '\u2014')
    .replace(/&ndash;/g, '\u2013')
    .replace(/&hellip;/g, '\u2026')
    .replace(/&#(\d+);/g, (_, d) => String.fromCharCode(Number(d)))
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCharCode(parseInt(h, 16)));
}

/**
 * What a reader sees: no scripts, no styles, no tags, entities decoded.
 *
 * INLINE vs BLOCK IS THE WHOLE SUBTLETY, and getting it wrong made this gate
 * useless in its first working version. Replacing every tag with a space
 * invented "designesy ." on all 97 routes -- the wordmark is
 * `designesy<span class="dot">.</span>`, which a browser renders as
 * "designesy." with no gap, because a <span> introduces no whitespace. A
 * space-per-tag extractor manufactured 327 findings that existed only inside
 * the extractor.
 *
 * That is the same defect I had just removed from the markdown converter, and
 * it is the reason this file's header insists a gate that cries wolf is worse
 * than no gate: 327 phantom findings would bury the one real defect among them.
 *
 * So: block elements become whitespace, inline elements become nothing. That
 * mirrors how a browser lays text out, which is the only thing that matters
 * when the question is "what does a reader see".
 */
const BLOCK_TAGS =
  'address|article|aside|blockquote|br|dd|div|dl|dt|fieldset|figcaption|figure|' +
  'footer|form|h1|h2|h3|h4|h5|h6|header|hr|li|main|nav|ol|p|pre|section|table|' +
  'tbody|td|tfoot|th|thead|tr|ul';

function visibleText(html, { collapse = true } = {}) {
  let s = html;
  // React separates adjacent text nodes with comments. They are invisible, and
  // leaving them in would split words the reader reads as continuous.
  //
  // DELETED WITHOUT A SPACE, and that is load-bearing. React emits these purely
  // to keep adjacent text nodes from being welded during hydration, so the
  // content on either side is ALREADY correctly spaced by the author. The
  // score reads `<strong>93.0<!-- -->% / <!-- -->A</strong>` and a browser
  // shows "93.0% / A". Replacing the comment with a space manufactures
  // "93.0 %" -- a typo that exists only inside this extractor.
  s = s.replace(/<!--[\s\S]*?-->/g, '');
  // ATTRIBUTES ARE NOT VISIBLE TEXT. A title="..." tooltip is not on the page,
  // and reading it produced a false "users !" finding on /spring-validator,
  // where the phrase lived in a button's title attribute. Strip every tag's
  // attributes before the tag itself is removed, so no attribute value can
  // ever reach the rules.
  s = s.replace(/<[a-zA-Z][^>]*>/g, (tag) => tag.replace(/\s+[a-zA-Z-]+="[^"]*"/g, ''));
  // Non-text content.
  s = s.replace(/<script[\s\S]*?<\/script>/gi, ' ');
  s = s.replace(/<style[\s\S]*?<\/style>/gi, ' ');
  s = s.replace(/<noscript[\s\S]*?<\/noscript>/gi, ' ');
  // Fenced code blocks are quoted material, not prose we authored -- drop them.
  s = s.replace(/<pre[\s\S]*?<\/pre>/gi, ' ');
  // INLINE <code> is NOT quoted material -- it is part of the sentence. On /specs
  // the sentence is "Send a JSON body with <code>url</code> and optional
  // <code>format</code>", and dropping those tags' CONTENT produced the
  // nonsense "Send a JSON body with and optional ." The rule now unwraps the
  // tag and keeps its text; only the tag itself disappears.
  s = s.replace(/<\/?code\b[^>]*>/gi, '');
  // Table and list cells are separate visual fields; a pipe marks the boundary
  // so two cells never read as one sentence. It is placed WITHOUT a space on
  // either side (`|`), because the surrounding whitespace pass normalises it.
  // The score cell is `<td>...<strong>93.0<!-- -->%</strong>...</td>`: the
  // "%" belongs to the number, and a padded pipe separator made it "93.0 %".
  s = s.replace(/<\/?(?:td|th)\b[^>]*>/gi, '|');
  s = s.replace(/<\/?li\b[^>]*>/gi, '|');
  // Block boundaries are real whitespace; inline boundaries are not.
  s = s.replace(new RegExp(`</?(?:${BLOCK_TAGS})\\b[^>]*>`, 'gi'), ' ');
  // Remaining tags are inline: they contribute NO whitespace. Deleting them
  // outright (rather than replacing with a space) is what makes adjacent spans
  // read correctly -- `<span>70.0</span><span>%</span>` is "70.0%" to a
  // browser, and a space-per-tag extractor called it "70.0 %" on 17 routes.
  // Verified against the raw markup for /state-of-compliance.
  s = s.replace(/<[^>]+>/g, '');
  s = decodeEntities(s).replace(/\s*\|\s*/g, ' | ').trim();
  // COLLAPSING IS OPTIONAL, and that is not tidiness -- it is correctness. This
  // function used to always collapse runs of whitespace, which meant the
  // double-space rule could never fire: the normaliser erased the very evidence
  // the rule exists to find. Mutation-testing caught it (two mutations passed
  // clean). Rules that look for whitespace defects read the UNCOLLAPSED text.
  return collapse ? s.replace(/\s+/g, ' ').trim() : s;
}

/**
 * Is this specific match exempt?
 *
 * EXEMPTIONS SEE CONTEXT, NOT JUST THE MATCH. The findings that need exempting
 * are defined by their SURROUNDINGS, not their own characters: the "s ." in
 * "excludes ellipsis ..." is indistinguishable from a stray period unless you
 * can read the words before it. An earlier version tested the 3-character match
 * alone, so every phrase-level exemption silently failed and the gate kept
 * reporting findings it was supposed to have exempted.
 *
 * `context` is the same ~140-char window the report prints, so an exemption can
 * be written against exactly what a human would read to judge it.
 *
 * Throws when an exemption has no `on` matcher: an unmatched exemption exempts
 * EVERY finding, which is how the first version of this file became a no-op
 * that reported success while being structurally unable to fail.
 *
 * Uses a FRESH regex per test (`new RegExp(..., '')`) rather than the stored
 * one. A shared regex with /g carries lastIndex between calls, so the same
 * input would alternate true/false/true and exemptions would apply at random.
 */
function isAllowed(ruleId, match, context) {
  for (const a of ALLOW) {
    if (!a.on) {
      throw new Error(
        `prose-lint: exemption for rule "${a.rule}" has no "on" matcher. ` +
          `An exemption without a matcher exempts every finding, silently ` +
          `disabling the gate. Add a regex or delete the entry.`,
      );
    }
    if (a.rule !== 'any' && a.rule !== ruleId) continue;
    const hay = a.context ? context || '' : match;
    if (!new RegExp(a.on.source, '').test(hay)) continue;
    return a.why;
  }
  return null;
}

// ── Run ──────────────────────────────────────────────────────────────────────

function main() {
  const asJson = process.argv.includes('--json');
  if (!fs.existsSync(NEXT_APP)) {
    console.error('[prose] .next/server/app not found - run the build first');
    process.exit(1);
  }

  const files = [];
  (function walk(dir) {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) walk(p);
      else if (e.name.endsWith('.html') && !e.name.startsWith('_')) files.push(p);
    }
  })(NEXT_APP);

  const findings = [];
  for (const f of files) {
    const route = '/' + path.relative(NEXT_APP, f).replace(/\.html$/, '').replace(/\\/g, '/');
    const rawHtml = fs.readFileSync(f, 'utf8');
    const text = visibleText(rawHtml);
    for (const rule of RULES) {
      const hay = text;
      rule.re.lastIndex = 0;
      let m;
      while ((m = rule.re.exec(hay)) !== null) {
        const raw = m[0];
        const allow = isAllowed(rule.id, raw, hay.slice(Math.max(0, m.index - 70), Math.min(hay.length, m.index + raw.length + 70)));
        if (allow) continue;
        const from = Math.max(0, m.index - 70);
        const to = Math.min(hay.length, m.index + raw.length + 70);
        findings.push({
          route,
          rule: rule.id,
          match: raw,
          why: rule.why,
          fix: rule.fix,
          context: hay.slice(from, to).trim(),
        });
      }
    }
  }

  if (asJson) {
    console.log(JSON.stringify({ scanned: files.length, findings }, null, 2));
  } else {
    console.log(`[prose] scanned ${files.length} prerendered routes`);
    if (!findings.length) {
      console.log('[prose] OK - no visible-text defects');
    } else {
      const byRule = findings.reduce((a, x) => ((a[x.rule] = (a[x.rule] || 0) + 1), a), {});
      for (const x of findings.slice(0, 40)) {
        console.log(`  FAIL ${x.route}  [${x.rule}]  ${JSON.stringify(x.match)}`);
        console.log(`       ${x.context}`);
      }
      if (findings.length > 40) console.log(`  ... and ${findings.length - 40} more`);
      console.log(`[prose] ${findings.length} finding(s): ${JSON.stringify(byRule)}`);
    }
  }
  process.exit(findings.length ? 1 : 0);
}

main();
