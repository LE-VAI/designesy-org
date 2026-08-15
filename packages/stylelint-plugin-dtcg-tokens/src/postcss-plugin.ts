/**
 * PostCSS plugin for DTCG 2025.10 design token enforcement.
 *
 * This is the standalone PostCSS 8 plugin — usable without stylelint, in
 * any PostCSS pipeline (Vite, webpack, Next.js, etc.).
 *
 * Usage:
 *   postcss([
 *     dtcgTokenCheck({
 *       tokensFile: './tokens.json',   // path to DTCG token JSON
 *       rules: {
 *         bareHex: true,               // flag bare hex colors
 *         magicNumber: true,           // flag bare px/rem on enforced properties
 *         undeclaredVar: true,         // flag var() to undeclared custom properties
 *       },
 *     }),
 *   ])
 *
 * Warnings are emitted via PostCSS's node.warn() — they appear in the
 * build output and can be collected by downstream tools.
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { Plugin, Declaration, Result } from 'postcss';

import {
  flattenTokens,
  extractVarRefs,
  isBareHex,
  extractHexValues,
  isMagicNumber,
  extractMagicNumbers,
  buildReverseMap,
  resolveToken,
  type FlattenedToken,
} from './tokens.js';

export interface DtcgTokenCheckOptions {
  /** Path to a DTCG 2025.10 token JSON file. */
  tokensFile?: string;
  /** Which rules to enable. All default to true. */
  rules?: {
    bareHex?: boolean;
    magicNumber?: boolean;
    undeclaredVar?: boolean;
  };
  /**
   * When true, auto-fix unambiguous violations in-place:
   *   - bare hex → var(--color-token) when the hex maps to exactly 1 color token
   *   - magic number → var(--token) when the value maps to exactly 1 token
   *     after property-semantic disambiguation
   * Undeclared-var violations are never auto-fixed (can't infer intent).
   * Ambiguous matches (multiple candidate tokens) are warned, not fixed.
   */
  fix?: boolean;
}

const DEFAULT_RULES = {
  bareHex: true,
  magicNumber: true,
  undeclaredVar: true,
};

/**
 * Create the PostCSS plugin.
 *
 * Uses prepare() to load the token file once, then a single-pass Declaration
 * visitor that checks all three rules as each declaration is encountered.
 * The token file is loaded in prepare() before any visitors fire, so token
 * names are available from the first declaration. CSS :root custom property
 * definitions appear first in document order, so cssDeclared is populated
 * before any var() references are checked.
 */
function dtcgTokenCheck(opts: DtcgTokenCheckOptions = {}): Plugin {
  const rules = { ...DEFAULT_RULES, ...opts.rules };
  const fix = opts.fix === true;

  return {
    postcssPlugin: 'postcss-dtcg-token-check',
    prepare(result: Result) {
      const declaredNames = new Set<string>();
      let reverseMap: Map<string, FlattenedToken[]> | null = null;

      if (opts.tokensFile) {
        try {
          const resolved = resolve(process.cwd(), opts.tokensFile);
          const raw = readFileSync(resolved, 'utf8');
          const json = JSON.parse(raw);
          const tokens = flattenTokens(json);
          for (const name of tokens.keys()) {
            declaredNames.add(name);
          }
          if (fix) {
            reverseMap = buildReverseMap(tokens);
          }
        } catch (e) {
          result.warn(`DTCG token check: could not load tokens file "${opts.tokensFile}": ${(e as Error).message}`);
        }
      }

      return {
        Declaration(node: Declaration) {
          if (node.prop.startsWith('--')) {
            declaredNames.add(node.prop);
            return;
          }

          // Rule 2 runs before Rule 1 in fix mode: hex fixes inject var()
          // into the value, which would cause the magic-number check's
          // var() guard to skip the declaration. Checking magic numbers
          // first ensures both rules can fire on the same declaration.

          // Rule 2: magic numbers on token-enforced properties
          if (rules.magicNumber && isMagicNumber(node.prop, node.value)) {
            const magics = extractMagicNumbers(node.prop, node.value);
            for (const magic of magics) {
              if (fix && reverseMap) {
                const res = resolveToken(magic, node.prop, reverseMap, false);
                if (res.token) {
                  node.value = node.value.replace(magic, `var(${res.token.name})`);
                  continue;
                }
                if (res.ambiguous) {
                  node.warn(result, `Use a design token instead of magic number "${magic}" for "${node.prop}" (ambiguous: matches ${res.ambiguous.map((t) => t.name).join(', ')})`);
                  continue;
                }
              }
              node.warn(result, `Use a design token instead of magic number "${magic}" for "${node.prop}"`);
            }
          }

          // Rule 1: bare hex colors
          if (rules.bareHex && isBareHex(node.value)) {
            const hexes = extractHexValues(node.value);
            for (const hex of hexes) {
              if (fix && reverseMap) {
                const res = resolveToken(hex, node.prop, reverseMap, true);
                if (res.token) {
                  node.value = node.value.replace(hex, `var(${res.token.name})`);
                  continue; // fixed — no warning
                }
                if (res.ambiguous) {
                  node.warn(result, `Use a design token instead of bare hex color "${hex}" (ambiguous: matches ${res.ambiguous.map((t) => t.name).join(', ')})`);
                  continue;
                }
              }
              node.warn(result, `Use a design token (var(--token)) instead of bare hex color "${hex}"`);
            }
          }

          // Rule 3: var() references to undeclared custom properties (never auto-fixed)
          if (rules.undeclaredVar && declaredNames.size > 0) {
            const refs = extractVarRefs(node.value);
            for (const ref of refs) {
              if (!declaredNames.has(ref)) {
                node.warn(result, `var() references custom property "${ref}" which is not declared in the DTCG token file or in any :root block`);
              }
            }
          }
        },
      };
    },
  } as Plugin;
}

dtcgTokenCheck.postcss = true;

export default dtcgTokenCheck;