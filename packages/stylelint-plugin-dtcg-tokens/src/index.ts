/**
 * @designesy/stylelint-plugin-dtcg-tokens
 *
 * stylelint plugin that enforces DTCG 2025.10 design token usage in CSS.
 *
 * Three rules (auto-fixable except no-undeclared-var):
 *   - designesy/no-bare-hex       — flag hex colors that should use var(--token)
 *                                   FIX: replaces bare hex with var(--color-token)
 *                                   when the hex maps to exactly 1 color token
 *   - designesy/no-magic-number   — flag bare px/rem/ms on token-enforced properties
 *                                   FIX: replaces bare value with var(--token)
 *                                   when the value maps to exactly 1 token after
 *                                   property-semantic disambiguation
 *   - designesy/no-undeclared-var — flag var() references to custom properties
 *                                    not declared in the DTCG token file
 *                                    (NOT auto-fixable — can't infer intent)
 *
 * Configuration (.stylelintrc.json):
 *   {
 *     "plugins": ["@designesy/stylelint-plugin-dtcg-tokens"],
 *     "rules": {
 *       "designesy/no-bare-hex": [true, { "tokensFile": "./tokens.json" }],
 *       "designesy/no-magic-number": [true, { "tokensFile": "./tokens.json" }],
 *       "designesy/no-undeclared-var": [true, { "tokensFile": "./tokens.json" }]
 *     }
 *   }
 *
 * Auto-fix: run `stylelint --fix` to auto-replace unambiguous bare hex and
 * magic numbers with var(--token) references. Ambiguous matches (multiple
 * candidate tokens) are warned but not fixed.
 *
 * The tokensFile option is a path to a DTCG 2025.10 token JSON file.
 * It's resolved relative to process.cwd().
 */

import stylelint from 'stylelint';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import type { Root, Declaration } from 'postcss';
import type { PostcssResult } from 'stylelint';

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

const { createPlugin, utils: { report, ruleMessages } } = stylelint;

// Cache loaded token files so they're only read once per lint run.
const tokenFileCache = new Map<string, Map<string, FlattenedToken>>();
const reverseMapCache = new Map<string, Map<string, FlattenedToken[]>>();

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

/** Get or build the reverse value→token map for a token file. */
async function getReverseMap(tokensFile: string): Promise<Map<string, FlattenedToken[]>> {
  const resolved = resolve(process.cwd(), tokensFile);
  if (reverseMapCache.has(resolved)) {
    return reverseMapCache.get(resolved)!;
  }
  const tokens = await loadTokens(tokensFile);
  const reverseMap = buildReverseMap(tokens);
  reverseMapCache.set(resolved, reverseMap);
  return reverseMap;
}

// ── Rule 1: no-bare-hex ─────────────────────────────────────────────────────

const noBareHexRuleName = 'designesy/no-bare-hex';
const noBareHexMessages = ruleMessages(noBareHexRuleName, {
  bareHex: (hex: string) =>
    `Use a design token (var(--token)) instead of bare hex color "${hex}"`,
  ambiguousHex: (hex: string, names: string) =>
    `Bare hex color "${hex}" is ambiguous — matches tokens: ${names}. Specify which token to use.`,
});

const noBareHexRule: stylelint.Rule<boolean, { tokensFile?: string }> = (primary, secondaryOptions = {}) => {
  return async (root: Root, result: PostcssResult) => {
    if (!primary) return;

    const tokensFile = secondaryOptions.tokensFile;
    let reverseMap: Map<string, FlattenedToken[]> | null = null;

    if (tokensFile) {
      try {
        reverseMap = await getReverseMap(tokensFile);
      } catch {
        // Token file load error — fall back to warn-only mode
      }
    }

    root.walkDecls((decl: Declaration) => {
      if (decl.prop.startsWith('--')) return;
      if (!isBareHex(decl.value)) return;

      const hexes = extractHexValues(decl.value);
      for (const hex of hexes) {
        if (reverseMap) {
          const res = resolveToken(hex, decl.prop, reverseMap, true);
          if (res.token) {
            report({
              result,
              ruleName: noBareHexRuleName,
              message: noBareHexMessages.bareHex(hex),
              node: decl,
              word: hex,
              fix: {
                apply: () => {
                  decl.value = decl.value.replace(hex, `var(${res.token!.name})`);
                },
                node: decl,
              },
            });
            continue;
          }
          if (res.ambiguous) {
            report({
              result,
              ruleName: noBareHexRuleName,
              message: noBareHexMessages.ambiguousHex(hex, res.ambiguous.map((t) => t.name).join(', ')),
              node: decl,
              word: hex,
            });
            continue;
          }
        }
        report({
          result,
          ruleName: noBareHexRuleName,
          message: noBareHexMessages.bareHex(hex),
          node: decl,
          word: hex,
        });
      }
    });
  };
};
noBareHexRule.ruleName = noBareHexRuleName;
noBareHexRule.messages = noBareHexMessages;
noBareHexRule.meta = { url: 'https://www.designesy.org/contracts/tokens', fixable: true };

// ── Rule 2: no-magic-number ─────────────────────────────────────────────────

const noMagicNumberRuleName = 'designesy/no-magic-number';
const noMagicNumberMessages = ruleMessages(noMagicNumberRuleName, {
  magicNumber: (prop: string, val: string) =>
    `Use a design token instead of magic number "${val}" for "${prop}"`,
  ambiguousNumber: (prop: string, val: string, names: string) =>
    `Magic number "${val}" for "${prop}" is ambiguous — matches tokens: ${names}. Specify which token to use.`,
});

const noMagicNumberRule: stylelint.Rule<boolean, { tokensFile?: string; severity?: string }> = (primary, secondaryOptions = {}) => {
  return async (root: Root, result: PostcssResult) => {
    if (!primary) return;

    const tokensFile = secondaryOptions.tokensFile;
    let reverseMap: Map<string, FlattenedToken[]> | null = null;

    if (tokensFile) {
      try {
        reverseMap = await getReverseMap(tokensFile);
      } catch {
        // Token file load error — fall back to warn-only mode
      }
    }

    root.walkDecls((decl: Declaration) => {
      if (decl.prop.startsWith('--')) return;
      if (!isMagicNumber(decl.prop, decl.value)) return;

      const magics = extractMagicNumbers(decl.prop, decl.value);
      for (const magic of magics) {
        if (reverseMap) {
          const res = resolveToken(magic, decl.prop, reverseMap, false);
          if (res.token) {
            report({
              result,
              ruleName: noMagicNumberRuleName,
              message: noMagicNumberMessages.magicNumber(decl.prop, magic),
              node: decl,
              word: magic,
              fix: {
                apply: () => {
                  decl.value = decl.value.replace(magic, `var(${res.token!.name})`);
                },
                node: decl,
              },
            });
            continue;
          }
          if (res.ambiguous) {
            report({
              result,
              ruleName: noMagicNumberRuleName,
              message: noMagicNumberMessages.ambiguousNumber(decl.prop, magic, res.ambiguous.map((t) => t.name).join(', ')),
              node: decl,
              word: magic,
            });
            continue;
          }
        }
        report({
          result,
          ruleName: noMagicNumberRuleName,
          message: noMagicNumberMessages.magicNumber(decl.prop, magic),
          node: decl,
          word: magic,
        });
      }
    });
  };
};
noMagicNumberRule.ruleName = noMagicNumberRuleName;
noMagicNumberRule.messages = noMagicNumberMessages;
noMagicNumberRule.meta = { url: 'https://www.designesy.org/contracts/tokens', fixable: true };

// ── Rule 3: no-undeclared-var (NOT fixable) ─────────────────────────────────

const noUndeclaredVarRuleName = 'designesy/no-undeclared-var';
const noUndeclaredVarMessages = ruleMessages(noUndeclaredVarRuleName, {
  undeclaredVar: (ref: string) =>
    `var() references custom property "${ref}" which is not declared in the DTCG token file`,
});

const noUndeclaredVarRule: stylelint.Rule<boolean, { tokensFile?: string }> = (primary, secondaryOptions = {}) => {
  return async (root: Root, result: PostcssResult) => {
    if (!primary) return;

    const tokensFile = secondaryOptions.tokensFile;
    if (!tokensFile) return;

    let tokens: Map<string, FlattenedToken>;
    try {
      tokens = await loadTokens(tokensFile);
    } catch {
      return;
    }

    const declaredNames = new Set(tokens.keys());

    // CSS-declared custom properties are also valid var() targets
    root.walkDecls((decl: Declaration) => {
      if (decl.prop.startsWith('--')) {
        declaredNames.add(decl.prop);
      }
    });

    root.walkDecls((decl: Declaration) => {
      const refs = extractVarRefs(decl.value);
      for (const ref of refs) {
        if (!declaredNames.has(ref)) {
          report({
            result,
            ruleName: noUndeclaredVarRuleName,
            message: noUndeclaredVarMessages.undeclaredVar(ref),
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

const plugins = [
  createPlugin(noBareHexRuleName, noBareHexRule),
  createPlugin(noMagicNumberRuleName, noMagicNumberRule),
  createPlugin(noUndeclaredVarRuleName, noUndeclaredVarRule),
];

export default plugins;

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
export {
  normalizeHex,
  buildReverseMap,
  resolveToken,
  PROPERTY_TOKEN_PREFIX,
} from './tokens.js';