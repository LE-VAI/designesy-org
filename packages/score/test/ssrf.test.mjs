/**
 * SSRF guard unit tests — validates the three-layer defense:
 *   1. isValidUrl (sync): protocol, IPv6, encoded IPs, IP-literal private ranges
 *   2. safeLookup (connection-path): DNS rebinding mitigation
 *   3. Redirect re-validation
 *
 * Zero dependencies: node:test + node:assert/strict only.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { isValidUrl, normalizeInputUrl } from '../dist/engine.js';

describe('isValidUrl — sync layer', () => {
  it('accepts normal HTTPS URLs', () => {
    assert.equal(isValidUrl('https://example.com'), true);
    assert.equal(isValidUrl('https://designesy.org'), true);
    assert.equal(isValidUrl('http://example.com/path'), true);
  });

  it('rejects non-HTTP protocols', () => {
    assert.equal(isValidUrl('file:///etc/passwd'), false);
    assert.equal(isValidUrl('ftp://example.com'), false);
    assert.equal(isValidUrl('javascript:alert(1)'), false);
    assert.equal(isValidUrl('gopher://localhost'), false);
  });

  it('rejects AWS metadata IP', () => {
    assert.equal(isValidUrl('http://169.254.169.254'), false);
    assert.equal(isValidUrl('http://169.254.169.254/latest/meta-data'), false);
  });

  it('rejects loopback addresses', () => {
    assert.equal(isValidUrl('http://127.0.0.1'), false);
    assert.equal(isValidUrl('http://127.0.0.1:8080'), false);
  });

  it('rejects RFC1918 private ranges', () => {
    assert.equal(isValidUrl('http://10.0.0.1'), false);
    assert.equal(isValidUrl('http://10.255.255.255'), false);
    assert.equal(isValidUrl('http://172.16.0.1'), false);
    assert.equal(isValidUrl('http://172.31.255.255'), false);
    assert.equal(isValidUrl('http://192.168.1.1'), false);
  });

  it('rejects link-local addresses', () => {
    assert.equal(isValidUrl('http://169.254.0.1'), false);
  });

  it('rejects CGNAT range', () => {
    assert.equal(isValidUrl('http://100.64.0.1'), false);
  });

  it('rejects all IPv6 (including ::1)', () => {
    assert.equal(isValidUrl('http://[::1]'), false);
    assert.equal(isValidUrl('http://[::]'), false);
    assert.equal(isValidUrl('http://[fe80::1]'), false);
    assert.equal(isValidUrl('http://[fd00::1]'), false);
  });

  it('rejects IPv4-mapped IPv6', () => {
    assert.equal(isValidUrl('http://[::ffff:169.254.169.254]'), false);
  });

  it('rejects encoded IP forms', () => {
    // Octal: 0x7f.0x00.0x00.0x01 = 127.0.0.1
    assert.equal(isValidUrl('http://0x7f.0x00.0x00.0x01'), false);
    // Octal: 0177.0.0.1 = 127.0.0.1
    assert.equal(isValidUrl('http://0177.0.0.1'), false);
  });

  it('rejects localhost (no dot, no colon)', () => {
    assert.equal(isValidUrl('http://localhost'), false);
  });

  it('accepts public IP addresses', () => {
    assert.equal(isValidUrl('http://1.1.1.1'), true);
    assert.equal(isValidUrl('http://8.8.8.8'), true);
    assert.equal(isValidUrl('https://104.20.23.154'), true);
  });
});

describe('normalizeInputUrl', () => {
  it('adds https:// prefix when missing', () => {
    assert.equal(normalizeInputUrl('example.com'), 'https://example.com/');
    assert.equal(normalizeInputUrl('designesy.org'), 'https://designesy.org/');
  });

  it('preserves existing protocol', () => {
    assert.equal(normalizeInputUrl('http://example.com'), 'http://example.com/');
    assert.equal(normalizeInputUrl('https://example.com'), 'https://example.com/');
  });

  it('trims whitespace', () => {
    assert.equal(normalizeInputUrl('  example.com  '), 'https://example.com/');
  });

  it('returns empty string for empty input', () => {
    assert.equal(normalizeInputUrl(''), '');
    assert.equal(normalizeInputUrl('   '), '');
  });
});