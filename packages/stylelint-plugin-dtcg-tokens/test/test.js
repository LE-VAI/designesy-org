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