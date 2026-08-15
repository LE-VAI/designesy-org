import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  flattenTokens,
  extractVarRefs,
  isBareHex,
  extractHexValues,
  isMagicNumber,
  extractMagicNumbers,
  TOKEN_ENFORCED_PROPERTIES,
  normalizeHex,
  buildReverseMap,
  resolveToken,
  PROPERTY_TOKEN_PREFIX,
} from '../dist/tokens.js';

import dtcgTokenCheck from '../dist/postcss-plugin.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURES = join(__dirname, 'fixtures');

// ── Token flattener tests ───────────────────────────────────────────────────

describe('flattenTokens', () => {
  test('flattens a DTCG token file into CSS custom property names', async () => {
    const raw = await readFile(join(FIXTURES, 'tokens.json'), 'utf8');
    const json = JSON.parse(raw);
    const flat = flattenTokens(json);

    assert.ok(flat.has('--color-primary'), 'should have --color-primary');
    assert.ok(flat.has('--color-secondary'), 'should have --color-secondary');
    assert.ok(flat.has('--space-md'), 'should have --space-md');
    assert.ok(flat.has('--font-size-lg'), 'should have --font-size-lg');
    assert.ok(flat.has('--duration-fast'), 'should have --duration-fast');

    const primary = flat.get('--color-primary');
    assert.equal(primary?.value, '#3b82f6');
    assert.equal(primary?.type, 'color');
    assert.equal(primary?.description, 'Brand primary blue');
  });

  test('handles $ref aliases as var() references', () => {
    const json = {
      color: {
        base: {
          blue: { $type: 'color', $value: '#3b82f6' },
        },
        brand: {
          $ref: 'color.base.blue',
        },
      },
    };
    const flat = flattenTokens(json);
    assert.ok(flat.has('--color-base-blue'));
    assert.ok(flat.has('--color-brand'));
    assert.equal(flat.get('--color-brand')?.value, 'var(--color-base-blue)');
  });

  test('handles $ref JSON Pointer syntax (DTCG 2025.10)', () => {
    const json = {
      color: {
        base: {
          red: { $type: 'color', $value: '#ff0000' },
        },
        brand: {
          $ref: '#/color/base/red/$value',
        },
      },
    };
    const flat = flattenTokens(json);
    assert.ok(flat.has('--color-base-red'));
    assert.ok(flat.has('--color-brand'));
    assert.equal(flat.get('--color-brand')?.value, 'var(--color-base-red)');
  });

  test('handles $value: "{ref}" alias form', () => {
    const json = {
      color: {
        base: {
          red: { $type: 'color', $value: '#ef4444' },
        },
        danger: {
          $type: 'color',
          $value: '{color.base.red}',
        },
      },
    };
    const flat = flattenTokens(json);
    assert.equal(flat.get('--color-danger')?.value, 'var(--color-base-red)');
  });

  test('skips $-prefixed root keys', () => {
    const json = {
      $schema: 'https://designtokens.org/schema.json',
      $version: '1.0',
      color: {
        primary: { $type: 'color', $value: '#ff0000' },
      },
    };
    const flat = flattenTokens(json);
    assert.ok(!flat.has('--$schema'));
    assert.ok(!flat.has('--$version'));
    assert.ok(flat.has('--color-primary'));
  });

  test('handles nested groups (3+ levels)', () => {
    const json = {
      font: {
        family: {
          sans: { $type: 'fontFamily', $value: 'Inter, sans-serif' },
          mono: { $type: 'fontFamily', $value: 'Menlo, monospace' },
        },
      },
    };
    const flat = flattenTokens(json);
    assert.ok(flat.has('--font-family-sans'));
    assert.ok(flat.has('--font-family-mono'));
  });
});

// ── extractVarRefs tests ────────────────────────────────────────────────────

describe('extractVarRefs', () => {
  test('extracts single var() reference', () => {
    assert.deepEqual(extractVarRefs('var(--color-primary)'), ['--color-primary']);
  });

  test('extracts multiple var() references', () => {
    const refs = extractVarRefs('var(--space-md) var(--space-lg)');
    assert.deepEqual(refs, ['--space-md', '--space-lg']);
  });

  test('extracts var() with fallback', () => {
    const refs = extractVarRefs('var(--color-primary, #000)');
    assert.deepEqual(refs, ['--color-primary']);
  });

  test('extracts var() from calc() expression', () => {
    const refs = extractVarRefs('calc(var(--space-md) + 8px)');
    assert.deepEqual(refs, ['--space-md']);
  });

  test('returns empty for non-var values', () => {
    assert.deepEqual(extractVarRefs('#ff0000'), []);
    assert.deepEqual(extractVarRefs('16px'), []);
  });
});

// ── isBareHex tests ─────────────────────────────────────────────────────────

describe('isBareHex', () => {
  test('detects bare hex values', () => {
    assert.ok(isBareHex('#ff0000'));
    assert.ok(isBareHex('#fff'));
    assert.ok(isBareHex('#1a2b3c4d'));
  });

  test('does not flag var() references', () => {
    assert.ok(!isBareHex('var(--color-primary)'));
  });

  test('detects hex in compound values', () => {
    assert.ok(isBareHex('1px solid #ff0000'));
  });
});

describe('extractHexValues', () => {
  test('extracts hex from compound value', () => {
    assert.deepEqual(extractHexValues('1px solid #ff0000'), ['#ff0000']);
  });

  test('extracts multiple hex values', () => {
    assert.deepEqual(
      extractHexValues('#fff 0%, #000 100%'),
      ['#fff', '#000'],
    );
  });
});

// ── isMagicNumber tests ─────────────────────────────────────────────────────

describe('isMagicNumber', () => {
  test('detects bare px on enforced properties', () => {
    assert.ok(isMagicNumber('padding', '12px'));
    assert.ok(isMagicNumber('margin-top', '20px'));
    assert.ok(isMagicNumber('border-radius', '6px'));
    assert.ok(isMagicNumber('font-size', '18px'));
    assert.ok(isMagicNumber('gap', '10px'));
  });

  test('does not flag var() values', () => {
    assert.ok(!isMagicNumber('padding', 'var(--space-md)'));
  });

  test('does not flag keyword values', () => {
    assert.ok(!isMagicNumber('color', 'inherit'));
    assert.ok(!isMagicNumber('width', 'auto'));
    assert.ok(!isMagicNumber('color', 'transparent'));
  });

  test('does not flag calc() expressions', () => {
    assert.ok(!isMagicNumber('width', 'calc(100% - 32px)'));
  });

  test('does not flag non-enforced properties', () => {
    assert.ok(!isMagicNumber('opacity', '0.5'));
    assert.ok(!isMagicNumber('transform', 'scale(1.5)'));
  });

  test('detects rem values too', () => {
    assert.ok(isMagicNumber('font-size', '1.125rem'));
    assert.ok(isMagicNumber('padding', '0.75rem'));
  });
});

describe('extractMagicNumbers', () => {
  test('extracts magic number from compound value', () => {
    assert.deepEqual(extractMagicNumbers('margin', '12px 20px'), ['12px', '20px']);
  });
});

// ── PostCSS plugin integration tests ────────────────────────────────────────

describe('PostCSS plugin integration', () => {
  test('flags bare hex in bad.css', async () => {
    const postcss = (await import('postcss')).default;
    const css = await readFile(join(FIXTURES, 'bad.css'), 'utf8');
    const result = await postcss([
      dtcgTokenCheck({ tokensFile: join(FIXTURES, 'tokens.json') }),
    ]).process(css, { from: 'bad.css' });

    const warnings = result.warnings();
    const hexWarnings = warnings.filter((w) => w.text.includes('bare hex'));
    assert.ok(hexWarnings.length >= 3, `expected ≥3 bare-hex warnings, got ${hexWarnings.length}`);
  });

  test('flags magic numbers in bad.css', async () => {
    const postcss = (await import('postcss')).default;
    const css = await readFile(join(FIXTURES, 'bad.css'), 'utf8');
    const result = await postcss([
      dtcgTokenCheck({ tokensFile: join(FIXTURES, 'tokens.json') }),
    ]).process(css, { from: 'bad.css' });

    const warnings = result.warnings();
    const magicWarnings = warnings.filter((w) => w.text.includes('magic number'));
    assert.ok(magicWarnings.length >= 5, `expected ≥5 magic-number warnings, got ${magicWarnings.length}`);
  });

  test('flags undeclared var() refs in bad.css', async () => {
    const postcss = (await import('postcss')).default;
    const css = await readFile(join(FIXTURES, 'bad.css'), 'utf8');
    const result = await postcss([
      dtcgTokenCheck({ tokensFile: join(FIXTURES, 'tokens.json') }),
    ]).process(css, { from: 'bad.css' });

    const warnings = result.warnings();
    const varWarnings = warnings.filter((w) => w.text.includes('not declared'));
    assert.ok(varWarnings.length >= 3, `expected ≥3 undeclared-var warnings, got ${varWarnings.length}`);
  });

  test('produces no warnings for good.css', async () => {
    const postcss = (await import('postcss')).default;
    const css = await readFile(join(FIXTURES, 'good.css'), 'utf8');
    const result = await postcss([
      dtcgTokenCheck({ tokensFile: join(FIXTURES, 'tokens.json') }),
    ]).process(css, { from: 'good.css' });

    const warnings = result.warnings();
    // good.css uses var() for everything and declares all custom properties
    // The only acceptable warning would be for the rgba() in box-shadow
    const tokenWarnings = warnings.filter(
      (w) => w.text.includes('bare hex') || w.text.includes('magic number') || w.text.includes('undeclared'),
    );
    assert.equal(tokenWarnings.length, 0, `expected 0 token warnings, got: ${tokenWarnings.map((w) => w.text).join('; ')}`);
  });

  test('allows CSS-declared custom properties not in token file', async () => {
    const postcss = (await import('postcss')).default;
    const css = ':root { --local-var: 100px; } .x { width: var(--local-var); }';
    const result = await postcss([
      dtcgTokenCheck({ tokensFile: join(FIXTURES, 'tokens.json') }),
    ]).process(css, { from: 'test.css' });

    const varWarnings = result.warnings().filter((w) => w.text.includes('undeclared'));
    assert.equal(varWarnings.length, 0);
  });

  test('warns on missing token file but does not crash', async () => {
    const postcss = (await import('postcss')).default;
    const css = '.x { color: red; }';
    const result = await postcss([
      dtcgTokenCheck({ tokensFile: './nonexistent.json' }),
    ]).process(css, { from: 'test.css' });

    const warnings = result.warnings();
    assert.ok(warnings.some((w) => w.text.includes('could not load tokens file')));
  });

  test('individual rule toggles work', async () => {
    const postcss = (await import('postcss')).default;
    const css = '.x { color: #ff0000; padding: 12px; }';
    const result = await postcss([
      dtcgTokenCheck({
        tokensFile: join(FIXTURES, 'tokens.json'),
        rules: { bareHex: true, magicNumber: false, undeclaredVar: false },
      }),
    ]).process(css, { from: 'test.css' });

    const warnings = result.warnings();
    assert.ok(warnings.some((w) => w.text.includes('bare hex')));
    assert.ok(!warnings.some((w) => w.text.includes('magic number')));
  });
});

// ── normalizeHex tests ─────────────────────────────────────────────────────────

describe('normalizeHex', () => {
  test('expands 3-digit hex to 6-digit', () => {
    assert.equal(normalizeHex('#fff'), '#ffffff');
    assert.equal(normalizeHex('#abc'), '#aabbcc');
  });

  test('expands 4-digit hex to 8-digit', () => {
    assert.equal(normalizeHex('#fffa'), '#ffffffaa');
  });

  test('passes through 6-digit hex lowercased', () => {
    assert.equal(normalizeHex('#3B82F6'), '#3b82f6');
    assert.equal(normalizeHex('#3b82f6'), '#3b82f6');
  });

  test('passes through 8-digit hex lowercased', () => {
    assert.equal(normalizeHex('#3B82F6AA'), '#3b82f6aa');
  });
});

// ── buildReverseMap tests ──────────────────────────────────────────────────────

describe('buildReverseMap', () => {
  test('builds reverse map from token file', async () => {
    const raw = await readFile(join(FIXTURES, 'tokens.json'), 'utf8');
    const json = JSON.parse(raw);
    const flat = flattenTokens(json);
    const reverseMap = buildReverseMap(flat);

    // #3b82f6 → --color-primary (unique)
    const blue = reverseMap.get('#3b82f6');
    assert.ok(blue && blue.length === 1);
    assert.equal(blue[0].name, '--color-primary');

    // 16px → --space-md, --radius-lg, --font-size-md (collision)
    const sixteenPx = reverseMap.get('16px');
    assert.ok(sixteenPx && sixteenPx.length === 3);
    const names16 = sixteenPx.map((t) => t.name);
    assert.ok(names16.includes('--space-md'));
    assert.ok(names16.includes('--radius-lg'));
    assert.ok(names16.includes('--font-size-md'));
  });

  test('excludes alias tokens (var() values)', () => {
    const json = {
      color: {
        base: { red: { $type: 'color', $value: '#ff0000' } },
        brand: { $type: 'color', $value: '{color.base.red}' },
      },
    };
    const flat = flattenTokens(json);
    const reverseMap = buildReverseMap(flat);

    // #ff0000 should map to --color-base-red only, not --color-brand
    // (brand is an alias with value var(--color-base-red))
    const red = reverseMap.get('#ff0000');
    assert.ok(red && red.length === 1);
    assert.equal(red[0].name, '--color-base-red');
  });

  test('includes normalized hex keys', async () => {
    const raw = await readFile(join(FIXTURES, 'tokens.json'), 'utf8');
    const json = JSON.parse(raw);
    const flat = flattenTokens(json);
    const reverseMap = buildReverseMap(flat);

    // #ffffff is stored as #ffffff in tokens — lookup with #fff should also work
    // because normalizeHex expands #fff → #ffffff
    const white = reverseMap.get(normalizeHex('#fff'));
    assert.ok(white);
    assert.equal(white[0].name, '--color-surface');
  });
});

// ── resolveToken tests ─────────────────────────────────────────────────────────

describe('resolveToken', () => {
  let reverseMap;

  test.before(async () => {
    const raw = await readFile(join(FIXTURES, 'tokens.json'), 'utf8');
    const json = JSON.parse(raw);
    const flat = flattenTokens(json);
    reverseMap = buildReverseMap(flat);
  });

  test('resolves unique hex to a single token', () => {
    const res = resolveToken('#3b82f6', 'color', reverseMap, true);
    assert.ok(res.token);
    assert.equal(res.token.name, '--color-primary');
    assert.ok(!res.ambiguous);
  });

  test('resolves 3-digit hex via normalization', () => {
    const res = resolveToken('#fff', 'background-color', reverseMap, true);
    assert.ok(res.token);
    assert.equal(res.token.name, '--color-surface');
  });

  test('returns empty for unknown hex', () => {
    const res = resolveToken('#abcdef', 'color', reverseMap, true);
    assert.ok(!res.token);
    assert.ok(!res.ambiguous);
  });

  test('disambiguates 16px on padding → --space-md', () => {
    const res = resolveToken('16px', 'padding', reverseMap, false);
    assert.ok(res.token);
    assert.equal(res.token.name, '--space-md');
  });

  test('disambiguates 16px on border-radius → --radius-lg', () => {
    const res = resolveToken('16px', 'border-radius', reverseMap, false);
    assert.ok(res.token);
    assert.equal(res.token.name, '--radius-lg');
  });

  test('disambiguates 16px on font-size → --font-size-md', () => {
    const res = resolveToken('16px', 'font-size', reverseMap, false);
    assert.ok(res.token);
    assert.equal(res.token.name, '--font-size-md');
  });

  test('returns ambiguous when no property affinity exists', () => {
    // 'border' is in TOKEN_ENFORCED_PROPERTIES but not in PROPERTY_TOKEN_PREFIX
    // 4px maps to --space-xs AND --radius-sm — can't disambiguate
    const res = resolveToken('4px', 'border', reverseMap, false);
    assert.ok(!res.token);
    assert.ok(res.ambiguous);
    assert.ok(res.ambiguous.length >= 2);
  });

  test('returns empty for unknown dimension value', () => {
    const res = resolveToken('99px', 'padding', reverseMap, false);
    assert.ok(!res.token);
    assert.ok(!res.ambiguous);
  });
});

// ── PostCSS fix mode tests ─────────────────────────────────────────────────────

describe('PostCSS plugin fix mode', () => {
  test('auto-fixes bare hex to var(--color-*)', async () => {
    const postcss = (await import('postcss')).default;
    const css = '.x { color: #3b82f6; background-color: #10b981; }';
    const result = await postcss([
      dtcgTokenCheck({ tokensFile: join(FIXTURES, 'tokens.json'), fix: true }),
    ]).process(css, { from: 'test.css' });

    assert.ok(result.css.includes('var(--color-primary)'), `expected var(--color-primary) in: ${result.css}`);
    assert.ok(result.css.includes('var(--color-secondary)'), `expected var(--color-secondary) in: ${result.css}`);
    // No warnings for fixed values
    const hexWarnings = result.warnings().filter((w) => w.text.includes('bare hex'));
    assert.equal(hexWarnings.length, 0, `expected 0 bare-hex warnings after fix, got: ${hexWarnings.map((w) => w.text).join('; ')}`);
  });

  test('auto-fixes magic numbers using property-semantic disambiguation', async () => {
    const postcss = (await import('postcss')).default;
    const css = '.x { padding: 16px; border-radius: 16px; font-size: 16px; }';
    const result = await postcss([
      dtcgTokenCheck({ tokensFile: join(FIXTURES, 'tokens.json'), fix: true }),
    ]).process(css, { from: 'test.css' });

    assert.ok(result.css.includes('var(--space-md)'), `expected var(--space-md) for padding in: ${result.css}`);
    assert.ok(result.css.includes('var(--radius-lg)'), `expected var(--radius-lg) for border-radius in: ${result.css}`);
    assert.ok(result.css.includes('var(--font-size-md)'), `expected var(--font-size-md) for font-size in: ${result.css}`);
    const magicWarnings = result.warnings().filter((w) => w.text.includes('magic number'));
    assert.equal(magicWarnings.length, 0, `expected 0 magic-number warnings after fix, got: ${magicWarnings.map((w) => w.text).join('; ')}`);
  });

  test('auto-fixes bad-fixable.css to match expected-fixed.css', async () => {
    const postcss = (await import('postcss')).default;
    const inputCss = await readFile(join(FIXTURES, 'bad-fixable.css'), 'utf8');
    const expectedCss = await readFile(join(FIXTURES, 'expected-fixed.css'), 'utf8');
    const result = await postcss([
      dtcgTokenCheck({ tokensFile: join(FIXTURES, 'tokens.json'), fix: true }),
    ]).process(inputCss, { from: 'bad-fixable.css' });

    // Compare declaration values (ignoring whitespace/formatting differences)
    // by extracting all "prop: value;" pairs from both
    const extractDecls = (css) => {
      const decls = [];
      const re = /([\w-]+):\s*([^;]+);/g;
      let m;
      while ((m = re.exec(css)) !== null) {
        if (!m[1].startsWith('--')) {
          decls.push(`${m[1]}: ${m[2].trim()}`);
        }
      }
      return decls;
    };

    const actualDecls = extractDecls(result.css);
    const expectedDecls = extractDecls(expectedCss);
    assert.deepEqual(actualDecls, expectedDecls,
      `fixed CSS declarations don't match expected.\nActual: ${JSON.stringify(actualDecls, null, 2)}\nExpected: ${JSON.stringify(expectedDecls, null, 2)}`);
  });

  test('does NOT fix ambiguous values — warns with "(ambiguous: ...)" instead', async () => {
    const postcss = (await import('postcss')).default;
    const css = '.x { border: 4px solid #3b82f6; }';
    const result = await postcss([
      dtcgTokenCheck({ tokensFile: join(FIXTURES, 'tokens.json'), fix: true }),
    ]).process(css, { from: 'test.css' });

    // 4px on border is ambiguous (maps to --space-xs AND --radius-sm, no affinity)
    // Should warn but NOT fix the 4px
    assert.ok(result.css.includes('4px'), `expected 4px to remain unfixed in: ${result.css}`);
    const ambigWarnings = result.warnings().filter((w) => w.text.includes('ambiguous'));
    assert.ok(ambigWarnings.length >= 1, `expected ≥1 ambiguous warning, got: ${result.warnings().map((w) => w.text).join('; ')}`);
    // But #3b82f6 IS fixable (unique hex) — should be fixed
    assert.ok(result.css.includes('var(--color-primary)'), `expected #3b82f6 to be fixed to var(--color-primary) in: ${result.css}`);
  });

  test('does NOT fix undeclared var() refs — only warns', async () => {
    const postcss = (await import('postcss')).default;
    const css = '.x { color: var(--unknown-token); padding: 12px; }';
    const result = await postcss([
      dtcgTokenCheck({ tokensFile: join(FIXTURES, 'tokens.json'), fix: true }),
    ]).process(css, { from: 'test.css' });

    // var(--unknown-token) should remain unfixed
    assert.ok(result.css.includes('var(--unknown-token)'), `expected var(--unknown-token) to remain in: ${result.css}`);
    // 12px has no matching token → should remain unfixed
    assert.ok(result.css.includes('12px'), `expected 12px to remain unfixed in: ${result.css}`);
    // But there should be warnings for both
    const warnings = result.warnings();
    assert.ok(warnings.some((w) => w.text.includes('not declared')));
    assert.ok(warnings.some((w) => w.text.includes('magic number')));
  });

  test('fix: false (default) does not modify CSS', async () => {
    const postcss = (await import('postcss')).default;
    const css = '.x { color: #3b82f6; }';
    const result = await postcss([
      dtcgTokenCheck({ tokensFile: join(FIXTURES, 'tokens.json') }),
    ]).process(css, { from: 'test.css' });

    assert.ok(result.css.includes('#3b82f6'), `expected #3b82f6 to remain when fix is not enabled: ${result.css}`);
    const hexWarnings = result.warnings().filter((w) => w.text.includes('bare hex'));
    assert.ok(hexWarnings.length >= 1);
  });

  test('fixes hex in compound values (e.g. "1px solid #ef4444")', async () => {
    const postcss = (await import('postcss')).default;
    const css = '.x { border: 1px solid #ef4444; }';
    const result = await postcss([
      dtcgTokenCheck({ tokensFile: join(FIXTURES, 'tokens.json'), fix: true }),
    ]).process(css, { from: 'test.css' });

    assert.ok(result.css.includes('var(--color-danger)'), `expected var(--color-danger) in: ${result.css}`);
    assert.ok(!result.css.includes('#ef4444'), `expected #ef4444 to be replaced in: ${result.css}`);
  });
});

// ── stylelint plugin tests ─────────────────────────────────────────────────────

describe('stylelint plugin', () => {
  const STYLELINT_CONFIG = {
    plugins: [join(__dirname, '..', 'dist', 'index.js')],
    rules: {
      'designesy/no-bare-hex': [true, { tokensFile: join(FIXTURES, 'tokens.json') }],
      'designesy/no-magic-number': [true, { tokensFile: join(FIXTURES, 'tokens.json') }],
      'designesy/no-undeclared-var': [true, { tokensFile: join(FIXTURES, 'tokens.json') }],
    },
  };

  test('detects bare hex via stylelint', async () => {
    const stylelint = (await import('stylelint')).default;
    const results = await stylelint.lint({
      code: '.x { color: #3b82f6; background: #10b981; }',
      config: STYLELINT_CONFIG,
    });
    assert.ok(results.errored, 'expected stylelint to error on bare hex');
  });

  test('detects magic numbers via stylelint', async () => {
    const stylelint = (await import('stylelint')).default;
    const results = await stylelint.lint({
      code: '.x { padding: 16px; margin: 24px; }',
      config: STYLELINT_CONFIG,
    });
    assert.ok(results.errored, 'expected stylelint to error on magic numbers');
  });

  test('detects undeclared var() refs via stylelint', async () => {
    const stylelint = (await import('stylelint')).default;
    const results = await stylelint.lint({
      code: '.x { color: var(--nonexistent-token); }',
      config: STYLELINT_CONFIG,
    });
    assert.ok(results.errored, 'expected stylelint to error on undeclared var()');
  });

  test('produces no errors for good CSS', async () => {
    const stylelint = (await import('stylelint')).default;
    const goodCss = await readFile(join(FIXTURES, 'good.css'), 'utf8');
    const results = await stylelint.lint({
      code: goodCss,
      codeFilename: 'good.css',
      config: STYLELINT_CONFIG,
    });
    assert.ok(!results.errored, `expected no errors for good.css, got: ${results.output}`);
  });

  test('stylelint --fix auto-replaces bare hex with var(--token)', async () => {
    const stylelint = (await import('stylelint')).default;
    const results = await stylelint.lint({
      code: '.x { color: #3b82f6; background-color: #10b981; }',
      fix: true,
      config: STYLELINT_CONFIG,
    });
    assert.ok(!results.errored, 'expected no errors after fix');
    const fixedCode = results.code;
    assert.ok(fixedCode.includes('var(--color-primary)'), `expected var(--color-primary) in fixed code: ${fixedCode}`);
    assert.ok(fixedCode.includes('var(--color-secondary)'), `expected var(--color-secondary) in fixed code: ${fixedCode}`);
    assert.ok(!fixedCode.includes('#3b82f6'), `expected #3b82f6 to be removed: ${fixedCode}`);
  });

  test('stylelint --fix auto-replaces magic numbers with var(--token)', async () => {
    const stylelint = (await import('stylelint')).default;
    const results = await stylelint.lint({
      code: '.x { padding: 16px; border-radius: 16px; font-size: 16px; }',
      fix: true,
      config: STYLELINT_CONFIG,
    });
    assert.ok(!results.errored, 'expected no errors after fix');
    const fixedCode = results.code;
    assert.ok(fixedCode.includes('var(--space-md)'), `expected var(--space-md) for padding: ${fixedCode}`);
    assert.ok(fixedCode.includes('var(--radius-lg)'), `expected var(--radius-lg) for border-radius: ${fixedCode}`);
    assert.ok(fixedCode.includes('var(--font-size-md)'), `expected var(--font-size-md) for font-size: ${fixedCode}`);
  });

  test('stylelint --fix does NOT fix undeclared var() refs', async () => {
    const stylelint = (await import('stylelint')).default;
    const results = await stylelint.lint({
      code: '.x { color: var(--nonexistent-token); }',
      fix: true,
      config: STYLELINT_CONFIG,
    });
    assert.ok(results.errored, 'expected undeclared-var to still error after fix attempt');
    assert.ok(results.code.includes('var(--nonexistent-token)'), `expected var(--nonexistent-token) to remain: ${results.code}`);
  });

  test('stylelint --fix does NOT fix ambiguous values', async () => {
    const stylelint = (await import('stylelint')).default;
    const results = await stylelint.lint({
      code: '.x { border: 4px solid #3b82f6; }',
      fix: true,
      config: STYLELINT_CONFIG,
    });
    const fixedCode = results.code;
    // 4px on border is ambiguous (maps to --space-xs AND --radius-sm, no affinity)
    assert.ok(fixedCode.includes('4px'), `expected 4px to remain unfixed: ${fixedCode}`);
    // But #3b82f6 IS fixable — should be fixed
    assert.ok(fixedCode.includes('var(--color-primary)'), `expected #3b82f6 to be fixed: ${fixedCode}`);
  });

  test('stylelint --fix fixes duration values', async () => {
    const stylelint = (await import('stylelint')).default;
    const results = await stylelint.lint({
      code: '.x { transition-duration: 150ms; }',
      fix: true,
      config: STYLELINT_CONFIG,
    });
    assert.ok(!results.errored, 'expected no errors after fixing duration');
    assert.ok(results.code.includes('var(--duration-fast)'), `expected var(--duration-fast): ${results.code}`);
  });

  test('stylelint --fix on the full bad-fixable fixture matches expected-fixed', async () => {
    const stylelint = (await import('stylelint')).default;
    const inputCss = await readFile(join(FIXTURES, 'bad-fixable.css'), 'utf8');
    const expectedCss = await readFile(join(FIXTURES, 'expected-fixed.css'), 'utf8');
    const results = await stylelint.lint({
      code: inputCss,
      codeFilename: 'bad-fixable.css',
      fix: true,
      config: STYLELINT_CONFIG,
    });

    // Extract declarations for comparison
    const extractDecls = (css) => {
      const decls = [];
      const re = /([\w-]+):\s*([^;]+);/g;
      let m;
      while ((m = re.exec(css)) !== null) {
        if (!m[1].startsWith('--')) {
          decls.push(`${m[1]}: ${m[2].trim()}`);
        }
      }
      return decls;
    };

    const actualDecls = extractDecls(results.code);
    const expectedDecls = extractDecls(expectedCss);
    // Note: border has "2px" which is ambiguous and stays — so border line
    // will differ (expected has "2px solid var(--color-danger)" and actual
    // should also have that since 2px doesn't match any token)
    assert.deepEqual(actualDecls, expectedDecls,
      `stylelint fixed CSS doesn't match expected.\nActual: ${JSON.stringify(actualDecls, null, 2)}\nExpected: ${JSON.stringify(expectedDecls, null, 2)}`);
  });
});