/**
 * @designesy/stylelint-plugin-dtcg-tokens
 *
 * stylelint plugin that enforces DTCG 2025.10 design token usage in CSS.
 *
 * Three rules:
 *   - designesy/no-bare-hex       — flag hex colors that should use var(--token)
 *   - designesy/no-magic-number   — flag bare px/rem on token-enforced properties
 *   - designesy/no-undeclared-var — flag var() references to custom properties
 *                                    not declared in the DTCG token file
 *
 * Configuration (.stylelintrc.json):
 *   {
 *     "plugins": ["@designesy/stylelint-plugin-dtcg-tokens"],
 *     "rules": {
 *       "designesy/no-bare-hex": [true, { "tokensFile": "./tokens.json" }],
 *       "designesy/no-magic-number": [true, {
 *         "tokensFile": "./tokens.json",
 *         "severity": "warning"
 *       }],
 *       "designesy/no-undeclared-var": [true, { "tokensFile": "./tokens.json" }]
 *     }
 *   }
 *
 * The tokensFile option is a path to a DTCG 2025.10 token JSON file.
 * It's resolved relative to process.cwd().
 */

import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import type { Root, Result } from 'postcss';

import {
  flattenTokens,
  extractVarRefs,
  isBareHex,
  extractHexValues,
  isMagicNumber,
  extractMagicNumbers,
  type FlattenedToken,
} from './tokens.js';

// Cache loaded token files so they're only read once per lint run.
const tokenFileCache = new Map<string, Map<string, FlattenedToken>>();

/**
 * Load and flatten a DTCG token file.
 * Cached by resolved path so repeated rule invocations don't re-read the file.
 */
async function loadTokens(tokensFile: string): Promise<Map<string, FlattenedToken>> {
  const resolved = resolve(process.cwd(), tokensFile);
  if (tokenFileCache.has(resolved)) {
    return tokenFileCache.get(resolved)!;
  }
  const raw = await readFile(resolved, 'utf8');
  const json = JSON.parse(raw);
  const flat = flattenTokens(json);
  tokenFileCache.set(resolved, flat);
  return flat;
}

// ── Rule 1: no-bare-hex ─────────────────────────────────────────────────────

const noBareHexRuleName = 'designesy/no-bare-hex';
const noBareHexMessages = {
  bareHex: (hex: string) =>
    `Use a design token (var(--token)) instead of bare hex color "${hex}"`,
};

const noBareHexRule = (primary: boolean, secondaryOptions: { tokensFile?: string } = {}) => {
  return async (root: Root, result: Result) => {
    if (!primary) return;

    const tokensFile = secondaryOptions.tokensFile;
    if (!tokensFile) {
      // If no token file is provided, we can't check against tokens —
      // but we can still flag bare hex values as a warning.
      root.walkDecls((decl) => {
        if (isBareHex(decl.value)) {
          const hexes = extractHexValues(decl.value);
          for (const hex of hexes) {
            result.warn(noBareHexMessages.bareHex(hex), {
              node: decl,
              word: hex,
            });
          }
        }
      });
      return;
    }

    const tokens = await loadTokens(tokensFile);

    // Build a set of known color values from the token file
    const knownColorValues = new Set<string>();
    for (const token of tokens.values()) {
      if (token.type === 'color' || /^#[0-9a-fA-F]{3,8}$/.test(token.value)) {
        knownColorValues.add(token.value.toLowerCase());
      }
    }

    root.walkDecls((decl) => {
      if (isBareHex(decl.value)) {
        const hexes = extractHexValues(decl.value);
        for (const hex of hexes) {
          // If the exact hex value exists as a token value, it's definitely
          // a bare value that should be var(--token-name) instead.
          result.warn(noBareHexMessages.bareHex(hex), {
            node: decl,
            word: hex,
          });
        }
      }
    });
  };
};
noBareHexRule.ruleName = noBareHexRuleName;
noBareHexRule.messages = noBareHexMessages;

// ── Rule 2: no-magic-number ─────────────────────────────────────────────────

const noMagicNumberRuleName = 'designesy/no-magic-number';
const noMagicNumberMessages = {
  magicNumber: (prop: string, val: string) =>
    `Use a design token instead of magic number "${val}" for "${prop}"`,
};

const noMagicNumberRule = (primary: boolean, secondaryOptions: { tokensFile?: string; severity?: string } = {}) => {
  return async (root: Root, result: Result) => {
    if (!primary) return;

    root.walkDecls((decl) => {
      if (isMagicNumber(decl.prop, decl.value)) {
        const magics = extractMagicNumbers(decl.prop, decl.value);
        for (const magic of magics) {
          result.warn(noMagicNumberMessages.magicNumber(decl.prop, magic), {
            node: decl,
            word: magic,
          });
        }
      }
    });
  };
};
noMagicNumberRule.ruleName = noMagicNumberRuleName;
noMagicNumberRule.messages = noMagicNumberMessages;

// ── Rule 3: no-undeclared-var ───────────────────────────────────────────────

const noUndeclaredVarRuleName = 'designesy/no-undeclared-var';
const noUndeclaredVarMessages = {
  undeclaredVar: (ref: string) =>
    `var() references custom property "${ref}" which is not declared in the DTCG token file`,
};

const noUndeclaredVarRule = (primary: boolean, secondaryOptions: { tokensFile?: string } = {}) => {
  return async (root: Root, result: Result) => {
    if (!primary) return;

    const tokensFile = secondaryOptions.tokensFile;
    if (!tokensFile) return;

    const tokens = await loadTokens(tokensFile);
    const declaredNames = new Set(tokens.keys());

    // Also collect custom properties declared in the CSS itself (:root blocks).
    // These are valid even if they're not in the token file (runtime tokens,
    // component-scoped tokens, etc.).
    const cssDeclared = new Set<string>();
    root.walkDecls((decl) => {
      if (decl.prop.startsWith('--')) {
        cssDeclared.add(decl.prop);
      }
    });

    root.walkDecls((decl) => {
      const refs = extractVarRefs(decl.value);
      for (const ref of refs) {
        // Valid if declared in the token file OR declared in CSS
        if (!declaredNames.has(ref) && !cssDeclared.has(ref)) {
          result.warn(noUndeclaredVarMessages.undeclaredVar(ref), {
            node: decl,
            word: ref,
          });
        }
      }
    });
  };
};
noUndeclaredVarRule.ruleName = noUndeclaredVarRuleName;
noUndeclaredVarRule.messages = noUndeclaredVarMessages;

// ── Plugin export ───────────────────────────────────────────────────────────

export {
  noBareHexRule,
  noBareHexRuleName,
  noBareHexMessages,
  noMagicNumberRule,
  noMagicNumberRuleName,
  noMagicNumberMessages,
  noUndeclaredVarRule,
  noUndeclaredVarRuleName,
  noUndeclaredVarMessages,
};

export { flattenTokens, extractVarRefs, isBareHex, isMagicNumber } from './tokens.js';