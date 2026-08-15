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

  return {
    postcssPlugin: 'postcss-dtcg-token-check',
    prepare(result: Result) {
      // Load the token file synchronously if provided.
      // PostCSS's prepare() is called once per file — sync loading is fast
      // and avoids the async-await race that caused warnings to be missed.
      const declaredNames = new Set<string>();
      if (opts.tokensFile) {
        try {
          const resolved = resolve(process.cwd(), opts.tokensFile);
          const raw = readFileSync(resolved, 'utf8');
          const json = JSON.parse(raw);
          const tokens = flattenTokens(json);
          for (const name of tokens.keys()) {
            declaredNames.add(name);
          }
        } catch (e) {
          // Don't crash the build — warn and continue without token validation
          result.warn(`DTCG token check: could not load tokens file "${opts.tokensFile}": ${(e as Error).message}`);
        }
      }

      return {
        Declaration(node: Declaration) {
          // Collect CSS-declared custom properties (also valid var() targets)
          if (node.prop.startsWith('--')) {
            declaredNames.add(node.prop);
            // Custom property definitions are token declarations, not usages.
            // Don't flag hex/magic-number inside the :root token block itself.
            return;
          }

          // Rule 1: bare hex colors
          if (rules.bareHex && isBareHex(node.value)) {
            const hexes = extractHexValues(node.value);
            for (const hex of hexes) {
              node.warn(result, `Use a design token (var(--token)) instead of bare hex color "${hex}"`);
            }
          }

          // Rule 2: magic numbers on token-enforced properties
          if (rules.magicNumber && isMagicNumber(node.prop, node.value)) {
            const magics = extractMagicNumbers(node.prop, node.value);
            for (const magic of magics) {
              node.warn(result, `Use a design token instead of magic number "${magic}" for "${node.prop}"`);
            }
          }

          // Rule 3: var() references to undeclared custom properties
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