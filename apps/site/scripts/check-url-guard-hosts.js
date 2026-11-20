#!/usr/bin/env node
/**
 * url-guard hosts gate: which hosts and resolver answers the URL guard takes
 * as public.
 *
 * WHY THIS EXISTS
 * Every URL the site fetches for a visitor goes through app/lib/url-guard.ts:
 * isValidUrl reads the host as written, resolveAndValidateHost checks every
 * address a lookup of the name answers, and the pinned lookup that safeFetch
 * hands each socket checks the answers again at connect time. The browser
 * audit takes the same checks through app/lib/browser-guard.ts. What the
 * checks do:
 *   - a literal IPv4 host is refused as carrier-grade NAT only inside
 *     100.64.0.0/10 (100.64.0.0 to 100.127.255.255), the range the resolver
 *     check already used; hosts from 100.128.0.0 to 100.255.255.255 are
 *     public;
 *   - the numeric-form refusals apply only to a host that ends in a number:
 *     one whose last label, once every trailing dot is dropped, is a
 *     number. A name with another label that looks octal or hex
 *     (007.example.com, 0x1.example.com) is checked like any other name: by
 *     the private ranges its digits may spell, then by its DNS answers;
 *   - such a host must be typed as four decimal parts, which are read as the
 *     address they name, with or without trailing dots. One typed as a
 *     number in any other form is refused, whatever address it names,
 *     wherever a URL comes in: a route, a redirect, a page's stylesheet
 *     link, the browser audit's check of the URL it is given, and the URL
 *     bar's hint. The URL parser can write such a host as four decimal
 *     parts before a check of its hostname runs, so the host is read as
 *     typed (app/lib/typed-host.ts), and a URL whose host that read cannot
 *     give is refused, a redirect or a link among them unless it names its
 *     page's scheme, host and port;
 *   - that read gives nothing for a host typed with a character outside
 *     ASCII, or a percent-escape of one, whose reading has an empty label
 *     other than one at its end, so such a host is refused too;
 *   - resolveAndValidateHost refuses a hostname that holds a C0 control or
 *     a space, one that read cannot give, one typed as a number in another
 *     form, and four decimal parts that name a private address, with or
 *     without trailing dots, before any lookup;
 *   - a resolver answer in ::/96 (the IPv4-compatible IPv6 addresses) is not
 *     public, however it is written, at the DNS check and at the connection.
 *     ipaddr.js does not name that range, so the guard names it itself.
 *
 * WHAT IT ASSERTS (offline: stubbed DNS, local servers on 127.0.0.1, no other
 * socket)
 *   1. isValidUrl: literal hosts on both sides of each 100.64.0.0/10 edge,
 *      and with other first parts, the private ranges and numeric forms it
 *      refused before, names whose other labels look octal or hex, names of
 *      four labels that begin with digits, refused when the digits spell a
 *      private address, and names whose last label only starts like a number.
 *   2. resolveAndValidateHost and isPublicUrl: ::/96 answers alone and mixed
 *      with a public one, in several spellings, the IPv4-mapped answers it
 *      refused before, with a private or a public IPv4 address inside, the
 *      loopback and unspecified ones, link-local, multicast, broadcast,
 *      reserved, 6to4, Teredo and 64:ff9b::/96 answers, an unspecified IPv4
 *      answer alone and next to a public one, private answers next to public
 *      ones, of the same family or not, three, four and five answers with a
 *      private one among them, public IPv4 and IPv6 answers, a name of four
 *      labels that begin with digits followed by a dot, read by its answers,
 *      a name whose lookup fails with a temporary error, and one whose first
 *      lookup alone fails that way, refused after one lookup, a second check
 *      of a name whose answers are read from the cache or whose lookup
 *      failed, a name read from the cache 59 s after its lookup, and 10 s
 *      after it once 501 other names were checked, a name not public at its
 *      first lookup checked again from the cache, and a name, of one answer
 *      or two, asked about again once its answer is older than the cache
 *      keeps one, whether or not it was read from the cache in between, and
 *      when its new lookup fails or finds no answer.
 *   3. The pinned lookup, through safeFetch: a name that answers public at
 *      the check and not public at the connection is refused at the
 *      connection and never reaches the server, whether its socket asks for
 *      every address or for one, and so is a name whose lookup fails at the
 *      connection; for each mixed answer in its rows, of two to five answers
 *      with one or more private answers first, last or in the middle, the
 *      socket is handed only the public addresses, each with its own family:
 *      every one of them, as the lookup gave them, when it asks for every
 *      address, and one when it asks for one; a public name is read.
 *   4. createUrlVerdict (the browser audit's check) gives the same answers.
 *   5. The host as typed: hosts typed as a number in forms other than four
 *      decimal parts are refused by isValidUrl, by normalizeInputUrl and then
 *      isValidUrl, by resolveAndValidateHost, isPublicUrl and
 *      createUrlVerdict, by safeFetch and at its redirects (301, 302, 303,
 *      307 and 308), in the stylesheet links of a page (each still read as a
 *      link, so a page is read without that stylesheet), and by the URL bar's
 *      hint as it reads a page, a site and an origin, with the host read as
 *      the URL parser reads it. Across those places the rows type such hosts
 *      with percent-escapes, IDNA mapping and the code points it drops,
 *      userinfo, a port, slashes and backslashes, spaces, tabs and newlines,
 *      trailing dots, and inputs of up to about 5,000 characters; each place
 *      is given the ways its rows hold, and not every way is given at every
 *      place. Hosts typed with a character outside ASCII whose reading has an
 *      empty label before its end are refused in the same places. Four
 *      decimal parts typed in those ways are read as the address they name,
 *      and names as names. A redirect or a link to such a host from a page
 *      whose own host is the address it names is refused like any other, and
 *      the Location of a second redirect is read as typed and resolved
 *      against the URL that answered with it, as a Location of only a query
 *      is, and a Location or a link with a space or control character that
 *      the URL parser keeps is read as the URL parser reads it. A redirect to
 *      a name the DNS check refuses is refused, and createUrlVerdict passes a
 *      data: URL. With the read made to give nothing for some inputs,
 *      isValidUrl, normalizeInputUrl then isValidUrl, createUrlVerdict and
 *      the URL bar refuse such an input, and a redirect or a link to one is
 *      refused unless it names its page's scheme, host and port: one to
 *      another host whose name ends with its page's, to a host under its
 *      page's, to its page's parent domain, to its page's host with a dot
 *      after it, to its page's host on another port, from a page on another
 *      port to its host on the default port, or to its page's host on the
 *      other scheme is refused. resolveAndValidateHost refuses a hostname of
 *      up to 269 characters that holds a tab or a newline, at its start,
 *      inside it or at its end, a hostname the read gives nothing for or that
 *      is typed as a number in another form, and four decimal parts of a
 *      private address typed in fullwidth digits, each with no lookup of it,
 *      whatever a lookup would answer.
 *   6. Every route that reads a URL answers such a host with its 400 for an
 *      invalid URL, as it answers a private address, the compare route as
 *      either of its two URLs; the score route does not read a stylesheet
 *      linked that way, and scores a page whose one stylesheet is linked that
 *      way as the page with none, and reads a link the URL parser reads as a
 *      path on its own page; and the MCP token tool does not fetch a URL
 *      typed that way.
 *   7. Nothing left this machine: every DNS lookup or query and every socket
 *      connection or fetch that is not to loopback is refused and counted,
 *      however url-guard.ts makes it, and the count must be 0.
 *
 * HOW IT MEASURES
 * The real url-guard.ts and browser-guard.ts, and the routes, loaded through
 * scripts/lib/route-harness.js. node:dns/promises answers from the table
 * below; a name that reads as a number answers the address it spells, as the
 * system resolver reads one, and a lookup that asks for one family (4 or 6)
 * is given only the answers of that family, as the system resolver gives
 * them. A lookup that does not ask for every answer is given one, as one
 * object, as node:dns/promises gives it. The stub refuses an option it does
 * not model (a hint other than 0, or any option but all, family and hints).
 * It refuses an all option that is not a boolean and a family other than 0, 4
 * or 6, as node:dns/promises does.
 * node:http keeps the guard's request options but sends the socket to a
 * server on 127.0.0.1 that this script runs: the guard's own pinned lookup is
 * called with the host the URL names and the options the socket asks with,
 * and the socket connects only when that lookup answers, in the shape the
 * socket asked for and with each address's own family, to the local server.
 * Each request gets a socket of its own (agent: false), so every request
 * runs the pinned lookup. The URL bar's command-bar.tsx is loaded with its
 * CSS imports left out.
 * The checks of sections 2, 3 and 4 are named by case: 2.n is the nth case of
 * section 2, counted through RESOLVER_ANSWERS, then PUBLIC_URLS, then the
 * names it asks about again; 3.n the nth pinned case the section runs;
 * 4.n the nth row of VERDICTS. The check that counts the lookups of the
 * pinned cases is named by what it does. A check that names a typed input
 * gives a run of more than 16 of one character in it as the character and the
 * run's length in braces, and a space or format character outside ASCII as
 * its escape. A failing check of what the pinned lookup handed names no
 * address.
 *
 * PROVING IT CAN FAIL
 * --app <dir> runs the same cases against another checkout's apps/site.
 * Against the tree before this change, the cases marked new fail (the count
 * is printed) and every other case passes.
 *
 * WHAT A PASSING RUN SHOWS
 * That the cases in its rows hold. Named sets of small edits to the guard
 * were run through this gate, and rows were added for some of the edits in
 * them that let more through and passed. Those sets are not every edit, and
 * other small edits, to the typed-host read, the redirect handling, the DNS
 * check and its cache, the pinned lookup and other parts of the guard, pass
 * every check; independent rounds of edits kept finding new ones. An edit
 * that passes while letting more through is a case to add here.
 *
 * Usage:  node scripts/check-url-guard-hosts.js [--app <dir>]
 * Exits 1 on any failure.
 */

'use strict';

const assert = require('node:assert/strict');
const dns = require('node:dns');
const dnsPromises = require('node:dns/promises');
const fs = require('node:fs');
const http = require('node:http');
const net = require('node:net');
const path = require('node:path');
const { isDeepStrictEqual } = require('node:util');

// ── Offline: nothing past loopback, whatever the guard calls ─────────────────
// Set before any module of the site loads. A DNS lookup or query of a name
// that is not loopback, a socket connection to a host that is not loopback
// or whose own lookup answers an address that is not loopback, and a fetch
// of such a host are refused and counted here. The last check asserts the
// count is 0, so a change that makes url-guard.ts resolve or connect past
// the stubs below fails this gate and reaches nothing.
const refusedOffline = [];
const isLoopback = (host) => {
  const h = String(host ?? 'localhost').replace(/^\[|\]$/g, '').toLowerCase();
  return h === 'localhost' || h === '::1' || (net.isIPv4(h) && h.startsWith('127.'));
};
const refuse = (what) => {
  refusedOffline.push(what);
  const err = new Error(`check-url-guard-hosts: refused ${what}: this gate runs offline`);
  err.code = 'EOFFLINE';
  return err;
};
const loopbackAnswer = (host) => (net.isIP(String(host)) ? { address: String(host), family: net.isIP(String(host)) } : { address: '127.0.0.1', family: 4 });
dns.lookup = (host, options, callback) => {
  const cb = typeof options === 'function' ? options : callback;
  const all = typeof options === 'object' && options !== null && options.all;
  if (!isLoopback(host)) return process.nextTick(cb, refuse(`dns.lookup ${host}`));
  const a = loopbackAnswer(host);
  return all ? process.nextTick(cb, null, [a]) : process.nextTick(cb, null, a.address, a.family);
};
dnsPromises.lookup = async (host, options) => {
  if (!isLoopback(host)) throw refuse(`dns.promises.lookup ${host}`);
  const a = loopbackAnswer(host);
  return options && options.all ? [a] : a;
};
for (const name of Object.keys(dns)) {
  if (!/^(?:resolve|reverse|lookupService)/.test(name)) continue;
  dns[name] = (host, ...rest) => process.nextTick(rest.pop(), refuse(`dns.${name} ${host}`));
  if (typeof dnsPromises[name] === 'function') dnsPromises[name] = async (host) => { throw refuse(`dns.promises.${name} ${host}`); };
  for (const R of [dns.Resolver, dnsPromises.Resolver]) {
    if (R && typeof R.prototype[name] === 'function') {
      R.prototype[name] = R === dns.Resolver
        ? (host, ...rest) => process.nextTick(rest.pop(), refuse(`Resolver.${name} ${host}`))
        : async (host) => { throw refuse(`Resolver.${name} ${host}`); };
    }
  }
}
const socketConnect = net.Socket.prototype.connect;
net.Socket.prototype.connect = function connect(...args) {
  let o = Array.isArray(args[0]) ? args[0][0] : args[0];
  if (o === null || typeof o !== 'object') o = { port: o, host: typeof args[1] === 'string' ? args[1] : undefined };
  if (o.path) return socketConnect.apply(this, args);
  if (!isLoopback(o.host)) {
    const err = refuse(`connect ${o.host}:${o.port}`);
    process.nextTick(() => this.destroy(err));
    return this;
  }
  if (typeof o.lookup === 'function') {
    const inner = o.lookup;
    o.lookup = (host, opts, cb) => inner(host, opts, (err, address, family) => {
      if (err) return cb(err, address, family);
      const list = Array.isArray(address) ? address.map((x) => x.address) : [address];
      return list.every(isLoopback) ? cb(null, address, family) : cb(refuse(`connect ${host} answered ${list.join(', ')}`));
    });
  }
  return socketConnect.apply(this, args);
};
const realFetch = globalThis.fetch;
globalThis.fetch = async (input, init) => {
  const href = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
  const host = new URL(href).hostname;
  if (!isLoopback(host)) throw refuse(`fetch ${host}`);
  return realFetch(input, init);
};

const { createHarness } = require('./lib/route-harness');

const argv = process.argv.slice(2);
const appAt = argv.indexOf('--app');
const APP = path.resolve(appAt >= 0 ? argv[appAt + 1] : path.join(__dirname, '..'));

// ── Stubbed DNS: what each name resolves to. Nothing reaches a resolver. ─────
const PUBLIC_V4 = '93.184.215.14'; // a public unicast address
const PUBLIC_V6 = '2606:4700:4700::1111'; // a public unicast address
const PUBLIC_V4_B = '93.184.215.15'; // another public unicast address
const PUBLIC_V6_B = '2606:4700:4700::1001'; // another public unicast address
const v4 = (address) => ({ address, family: 4 });
const v6 = (address) => ({ address, family: 6 });
const DNS = {
  'public.example': [v4(PUBLIC_V4)],
  'a..verdict.example': [v4(PUBLIC_V4)],
  '007.public.example': [v4(PUBLIC_V4)],
  '0x1.public.example': [v4(PUBLIC_V4)],
  'v6-public.example': [v6(PUBLIC_V6)],
  'v4compat-loopback.example': [v6('::7f00:1')],
  'v4compat-link-local.example': [v6('::a9fe:1')],
  'v4compat-private.example': [v6('::a00:1')],
  'v4compat-public.example': [v6('::808:808')],
  'v4compat-mixed.example': [v4(PUBLIC_V4), v6('::7f00:1')],
  'v4compat-mixed-two.example': [v6('::2'), v4(PUBLIC_V4)],
  'v4compat-after-public.example': [v4(PUBLIC_V4), v6('::2')],
  'v4compat-three.example': [v6('::a00:0')],
  'v4compat-loopback-dotted.example': [v6('::127.0.0.1')],
  'v4compat-link-local-dotted.example': [v6('::169.254.0.1')],
  'v4compat-public-dotted.example': [v6('::8.8.8.8')],
  'v4compat-two.example': [v6('::2')],
  'v4compat-ffff.example': [v6('::ffff')],
  'mapped-loopback.example': [v6('::ffff:127.0.0.1')],
  'mapped-public.example': [v6('::ffff:8.8.8.8')],
  'v6-loopback.example': [v6('::1')],
  'v6-unspecified.example': [v6('::')],
  'cgnat-answer.example': [v4('100.64.0.1')],
  'above-cgnat-answer.example': [v4('100.128.0.1')],
  'mixed-private.example': [v6(PUBLIC_V6), v4('10.0.0.1')],
  'mixed-private-two.example': [v4('10.0.0.1'), v6(PUBLIC_V6)],
  'mixed-private-three.example': [v4(PUBLIC_V4), v4('10.0.0.1')],
  'mixed-private-four.example': [v4('127.0.0.1'), v4(PUBLIC_V4)],
  'mixed-private-five.example': [v6(PUBLIC_V6), v6('fd12:3456::1')],
  'mixed-private-six.example': [v6('fe80::1'), v6(PUBLIC_V6)],
  'mixed-private-seven.example': [v4(PUBLIC_V4), v6(PUBLIC_V6), v4('10.0.0.1')],
  'mixed-private-eight.example': [v6(PUBLIC_V6), v6('fd12:3456::1'), v4(PUBLIC_V4)],
  // Answers in other ranges that are not public.
  'link-local-answer.example': [v4('169.254.0.1')],
  'reserved-answer.example': [v4('198.18.0.1')],
  'unspecified-answer.example': [v4('0.0.0.0')],
  'mixed-unspecified.example': [v4(PUBLIC_V4), v4('0.0.0.0')],
  'v6-link-local.example': [v6('fe80::1')],
  'v6-multicast.example': [v6('ff02::1')],
  'nat64-loopback.example': [v6('64:ff9b::7f00:1')],
  'nat64-public.example': [v6('64:ff9b::808:808')],
  'v4-multicast.example': [v4('224.0.0.1')],
  'v4-broadcast.example': [v4('255.255.255.255')],
  'v6-6to4.example': [v6('2002:7f00:1::1')],
  'v6-teredo.example': [v6('2001::1')],
  // Five answers, one of them not public.
  'five-answers.example': [v4(PUBLIC_V4), v4(PUBLIC_V4_B), v6(PUBLIC_V6), v6(PUBLIC_V6_B), v4('10.0.0.1')],
  // Four and five answers, one of them not public, at another place.
  'five-answers-two.example': [v4(PUBLIC_V4), v4(PUBLIC_V4_B), v6(PUBLIC_V6), v4('10.0.0.1'), v6(PUBLIC_V6_B)],
  'four-answers.example': [v6(PUBLIC_V6), v6(PUBLIC_V6_B), v4(PUBLIC_V4), v6('fd12:3456::1')],
  // ::/96 answers: one next to a public IPv6 answer, and another alone.
  'v4compat-v6-public.example': [v6(PUBLIC_V6), v6('::2')],
  'v4compat-inner.example': [v6('::1234')],
  // A page with stylesheet links, and a host whose answer is a redirect.
  'sheets.example': [v4(PUBLIC_V4)],
  'redirect.example': [v4(PUBLIC_V4)],
  // Another host, whose name ends with that one's.
  'xredirect.example': [v4(PUBLIC_V4)],
  // Hosts under that one's name, and the page's own host under a
  // subdomain.
  'sub.redirect.example': [v4(PUBLIC_V4)],
  'www.redirect.example': [v4(PUBLIC_V4)],
  // The page's own host with a dot after it.
  'redirect.example.': [v4(PUBLIC_V4)],
  // Hosts typed as a number with trailing dots, answered as names are.
  '0x08080808..': [v4(PUBLIC_V4)],
  '134744072..': [v4(PUBLIC_V4)],
  '8.8.8.8..': [v4(PUBLIC_V4)],
  '127.0.0.1.': [v4(PUBLIC_V4)],
  '127.0.0.1..': [v4(PUBLIC_V4)],
  // Hostnames that end in a number and spell no address, answered as names
  // are.
  '8.8.8.256': [v4(PUBLIC_V4)],
  '1.2.3.4.5': [v4(PUBLIC_V4)],
  '8.8.8.1000': [v4(PUBLIC_V4)],
  // A name of four labels that begin with digits, followed by a dot.
  '10.1.2.3x.': [v4(PUBLIC_V4)],
  // A name with an empty label.
  'a..public.example': [v4(PUBLIC_V4)],
  // Hostnames typed with characters outside ASCII, answered as names are.
  '８.８.８.８..': [v4(PUBLIC_V4)],
  '０ｘ０８０８０８０８': [v4(PUBLIC_V4)],
  // Hostnames that hold a control character, answered as names are.
  '0x08080808\tx': [v4(PUBLIC_V4)],
  '134744072\nx': [v4(PUBLIC_V4)],
  '8.8.8.8\rfoo.example': [v4(PUBLIC_V4)],
  '\tpublic.example': [v4(PUBLIC_V4)],
  'public.example\n': [v4(PUBLIC_V4)],
  [`${'a'.repeat(70)}.example\n`]: [v4(PUBLIC_V4)],
  [`${'a'.repeat(260)}.example\n`]: [v4(PUBLIC_V4)],
  // Hostnames the typed-host read gives nothing for, and private addresses
  // typed in fullwidth digits, answered as names are.
  '8.8.8.8@public.example': [v4(PUBLIC_V4)],
  'public.example/x': [v4(PUBLIC_V4)],
  'public.example:80': [v4(PUBLIC_V4)],
  'pub^lic.example': [v4(PUBLIC_V4)],
  '１２７.0.0.1': [v4(PUBLIC_V4)],
  '１０.0.0.1.': [v4(PUBLIC_V4)],
  '8.8.8.8\n': [v4(PUBLIC_V4)],
  '\t8.8.8.8': [v4(PUBLIC_V4)],
  'q.x/y': [v4(PUBLIC_V4)],
  'a.x\\y': [v4(PUBLIC_V4)],
  'a.x?y': [v4(PUBLIC_V4)],
  'a.x#y': [v4(PUBLIC_V4)],
};
// Names whose answer changes after the first lookup: [first, every later one].
const CHANGING = {
  'pin-public.example': [[v4(PUBLIC_V4)], [v4(PUBLIC_V4)]],
  'pin-v4compat.example': [[v4(PUBLIC_V4)], [v6('::7f00:1')]],
  'pin-v4compat-link-local.example': [[v4(PUBLIC_V4)], [v6('::a9fe:1')]],
  'pin-mapped.example': [[v4(PUBLIC_V4)], [v6('::ffff:127.0.0.1')]],
  'pin-mixed.example': [[v4(PUBLIC_V4)], [v4(PUBLIC_V4), v6('::7f00:1')]],
  'pin-v4compat-two.example': [[v4(PUBLIC_V4)], [v6('::2')]],
  'pin-v4compat-ffff.example': [[v4(PUBLIC_V4)], [v6('::ffff')]],
  'pin-v4compat-dotted.example': [[v4(PUBLIC_V4)], [v6('::127.0.0.1')]],
  'pin-v4compat-public-dotted.example': [[v4(PUBLIC_V4)], [v6('::8.8.8.8')]],
  'pin-mixed-two.example': [[v4(PUBLIC_V4)], [v4(PUBLIC_V4), v6('::2')]],
  // Private answers outside ::/96, alone and next to a public one.
  'pin-private.example': [[v4(PUBLIC_V4)], [v4('10.0.0.1')]],
  'pin-loopback.example': [[v4(PUBLIC_V4)], [v4('127.0.0.1')]],
  'pin-v6-loopback.example': [[v4(PUBLIC_V4)], [v6('::1')]],
  'pin-link-local.example': [[v4(PUBLIC_V4)], [v6('fe80::1')]],
  'pin-mixed-private.example': [[v4(PUBLIC_V4)], [v6(PUBLIC_V6), v4('10.0.0.1')]],
  'pin-mixed-three.example': [[v4(PUBLIC_V4)], [v4(PUBLIC_V4), v4('10.0.0.1')]],
  'pin-mixed-four.example': [[v4(PUBLIC_V4)], [v4('10.0.0.1'), v6(PUBLIC_V6)]],
  'pin-mixed-five.example': [[v4(PUBLIC_V4)], [v4(PUBLIC_V4), v4('10.0.0.1'), v6(PUBLIC_V6)]],
  // Answers that are not public at the connection only, alone and next to
  // a public one.
  'pin-unspecified.example': [[v4(PUBLIC_V4)], [v4('0.0.0.0')]],
  'pin-reserved.example': [[v4(PUBLIC_V4)], [v4('198.18.0.1')]],
  'pin-mixed-reserved.example': [[v4(PUBLIC_V4)], [v6(PUBLIC_V6), v4('198.18.0.1')]],
  // No public answer at the connection, to a socket that asks for one
  // address (ONE_ADDRESS, below).
  'pin-one-address-private.example': [[v4(PUBLIC_V4)], [v4('10.0.0.1')]],
  // A name read from the cache before its answer ages out, and asked about
  // again after.
  'sliding-answer.example': [[v4(PUBLIC_V4)], [v4('10.0.0.1')]],
  // Two public answers and no other.
  'pin-public-two.example': [[v4(PUBLIC_V4)], [v6(PUBLIC_V6), v4(PUBLIC_V4)]],
  // A name the DNS check is asked about again after its answer has aged
  // out.
  'aged-answer.example': [[v4(PUBLIC_V4)], [v4('10.0.0.1')]],
  // Public answers of both families next to a private one.
  'pin-both-families.example': [[v4(PUBLIC_V4)], [v4(PUBLIC_V4), v6(PUBLIC_V6), v6('fd12:3456::1')]],
  // Mixed answers, to a socket that asks for one address (ONE_ADDRESS,
  // below).
  'pin-one-address.example': [[v4(PUBLIC_V4)], [v6('::127.0.0.1'), v4(PUBLIC_V4)]],
  'pin-one-address-two.example': [[v4(PUBLIC_V4)], [v6('::2'), v4(PUBLIC_V4)]],
  'pin-one-address-three.example': [[v4(PUBLIC_V4)], [v6('fd12:3456::1'), v6(PUBLIC_V6)]],
  'pin-one-address-four.example': [[v4(PUBLIC_V4)], [v6(PUBLIC_V6), v4(PUBLIC_V4)]],
  // Two answers that are not public with a public one, to a socket that
  // asks for every address and to one that asks for one (ONE_ADDRESS,
  // below).
  'pin-two-private.example': [[v4(PUBLIC_V4)], [v4(PUBLIC_V4), v4('10.0.0.1'), v4('127.0.0.1')]],
  'pin-one-address-five.example': [[v4(PUBLIC_V4)], [v4('10.0.0.1'), v6('::1'), v4(PUBLIC_V4)]],
  // Five answers, four of them public, to a socket that asks for every
  // address, and three to one that asks for one (ONE_ADDRESS, below).
  'pin-five-answers.example': [[v4(PUBLIC_V4)], [v4(PUBLIC_V4), v4(PUBLIC_V4_B), v6(PUBLIC_V6), v6(PUBLIC_V6_B), v4('10.0.0.1')]],
  'pin-one-address-six.example': [[v4(PUBLIC_V4)], [v4('10.0.0.1'), v6(PUBLIC_V6), v4(PUBLIC_V4)]],
  // Four and five answers, one of them not public, at another place, and
  // an ::/96 answer next to a public IPv6 answer, to a socket that asks
  // for every address.
  'pin-four-answers.example': [[v4(PUBLIC_V4)], [v4(PUBLIC_V4), v4(PUBLIC_V4_B), v6(PUBLIC_V6), v4('10.0.0.1')]],
  'pin-five-answers-two.example': [[v4(PUBLIC_V4)], [v4(PUBLIC_V4), v6(PUBLIC_V6), v4(PUBLIC_V4_B), v6('fd12:3456::1'), v6(PUBLIC_V6_B)]],
  'pin-v4compat-v6-public.example': [[v4(PUBLIC_V4)], [v6(PUBLIC_V6), v6('::2')]],
};
/**
 * A name whose second lookup, the one the pinned lookup makes at the
 * connection, fails, and whose later lookups answer an address that is not
 * public.
 */
const FAILS_AT_CONNECTION = 'pin-lookup-fails.example';
/** A name whose every lookup fails with a temporary error. */
const TEMPORARY_FAILURE = 'temporary-failure.example';
/**
 * A name that answers public at its first lookup, and whose later lookups
 * fail with a temporary error.
 */
const FAILS_LATER = 'fails-later.example';
/** A name public at its first lookup and not public at every later one. */
const KEPT_ANSWER = 'kept-answer.example';
/** A name like KEPT_ANSWER, checked again after 501 other names. */
const KEPT_PAST_PRUNE = 'kept-past-prune.example';
/** A name not public at its first lookup and public at every later one. */
const TURNS_PUBLIC = 'turns-public.example';
/** A name whose first lookup fails with a temporary error and whose later lookups answer public. */
const FAILS_FIRST = 'fails-first.example';
/** A name public at its first lookup, with no answer at every later one. */
const GONE_LATER = 'gone-later.example';
/** A name with two public answers at its first lookup and not public at every later one. */
const KEPT_TWO = 'kept-two.example';
/**
 * A name as the system resolver reads a number (inet_aton): one to four
 * parts, each decimal, octal after a 0, or hex after 0x, the last filling
 * the bytes left. Null for a name that does not read as one.
 */
function spelledAddress(name) {
  const parts = name.split('.');
  if (parts.length > 4) return null;
  const nums = [];
  for (const p of parts) {
    if (/^0x[0-9a-f]*$/i.test(p)) nums.push(p.length === 2 ? 0 : parseInt(p.slice(2), 16));
    else if (/^0[0-7]*$/.test(p)) nums.push(parseInt(p, 8));
    else if (/^[1-9]\d*$/.test(p)) nums.push(parseInt(p, 10));
    else return null;
  }
  const last = nums.pop();
  const room = 2 ** (8 * (4 - nums.length));
  if (nums.some((n) => n > 255) || last >= room) return null;
  const value = nums.reduce((v, n) => v * 256 + n, 0) * room + last;
  return [value >>> 24, (value >>> 16) & 255, (value >>> 8) & 255, value & 255].join('.');
}

const asked = new Map();
/**
 * The answers of the family `options` asks for (4 or 6), as getaddrinfo
 * gives them, and every answer when it asks for none (0).
 */
function ofFamily(hostname, list, options) {
  const family = options && options.family;
  if (family !== 4 && family !== 6) return list;
  const kept = list.filter((a) => a.family === family);
  if (kept.length) return kept;
  const err = new Error(`getaddrinfo ENOTFOUND ${hostname}`);
  err.code = 'ENOTFOUND';
  throw err;
}
/** The lookup options the stub models. */
const MODELLED = new Set(['all', 'family']);
/**
 * node:dns/promises lookup() as the guard calls it. An option the stub does
 * not model is refused, so a guard that passes one fails the gate rather
 * than being answered as if it had not.
 */
async function lookup(hostname, options) {
  const o = typeof options === 'number' ? { family: options } : options ?? {};
  const other = Object.keys(o).filter((k) => !MODELLED.has(k) && !(k === 'hints' && !o.hints));
  if (other.length) throw new TypeError(`the stubbed lookup does not model ${other.join(', ')}`);
  if (o.all != null && typeof o.all !== 'boolean') {
    const err = new TypeError(`The "options.all" property must be of type boolean. Received ${JSON.stringify(o.all)}`);
    err.code = 'ERR_INVALID_ARG_TYPE';
    throw err;
  }
  if (o.family != null && ![0, 4, 6].includes(o.family)) {
    const err = new TypeError(`The property 'options.family' must be one of: 0, 4, 6. Received ${JSON.stringify(o.family)}`);
    err.code = 'ERR_INVALID_ARG_VALUE';
    throw err;
  }
  const list = ofFamily(hostname, await lookupAll(hostname), o);
  // A lookup that does not ask for every answer gets one, as one object.
  return o.all ? list : list[0];
}
async function lookupAll(hostname) {
  asked.set(hostname, (asked.get(hostname) || 0) + 1);
  const family = net.isIP(hostname);
  if (family) return [{ address: hostname, family }];
  const spelled = spelledAddress(hostname);
  if (spelled) return [{ address: spelled, family: 4 }];
  if (hostname === FAILS_AT_CONNECTION) {
    if (asked.get(hostname) === 2) {
      const err = new Error(`getaddrinfo EAI_AGAIN ${hostname}`);
      err.code = 'EAI_AGAIN';
      throw err;
    }
    return asked.get(hostname) === 1 ? [v4(PUBLIC_V4)] : [v4('10.0.0.1')];
  }
  if (hostname === TEMPORARY_FAILURE || (hostname === FAILS_LATER && asked.get(hostname) > 1)) {
    const err = new Error(`getaddrinfo EAI_AGAIN ${hostname}`);
    err.code = 'EAI_AGAIN';
    throw err;
  }
  if (hostname === FAILS_LATER) return [v4(PUBLIC_V4)];
  if (hostname === KEPT_ANSWER || hostname === KEPT_PAST_PRUNE) return asked.get(hostname) === 1 ? [v4(PUBLIC_V4)] : [v4('10.0.0.1')];
  if (hostname === TURNS_PUBLIC) return asked.get(hostname) === 1 ? [v4('10.0.0.1')] : [v4(PUBLIC_V4)];
  if (hostname === FAILS_FIRST && asked.get(hostname) === 1) {
    const err = new Error(`getaddrinfo EAI_AGAIN ${hostname}`);
    err.code = 'EAI_AGAIN';
    throw err;
  }
  if (hostname === FAILS_FIRST) return [v4(PUBLIC_V4)];
  if (hostname === GONE_LATER && asked.get(hostname) > 1) {
    const err = new Error(`getaddrinfo ENOTFOUND ${hostname}`);
    err.code = 'ENOTFOUND';
    throw err;
  }
  if (hostname === GONE_LATER) return [v4(PUBLIC_V4)];
  if (hostname === KEPT_TWO) return asked.get(hostname) === 1 ? [v4(PUBLIC_V4), v4(PUBLIC_V4_B)] : [v4('10.0.0.1')];
  if (/^n\d+\.fill\.example$/.test(hostname)) return [v4(PUBLIC_V4)];
  if (Object.prototype.hasOwnProperty.call(CHANGING, hostname)) {
    const [first, later] = CHANGING[hostname];
    return asked.get(hostname) === 1 ? first : later;
  }
  if (Object.prototype.hasOwnProperty.call(DNS, hostname)) return DNS[hostname];
  const err = new Error(`getaddrinfo ENOTFOUND ${hostname}`);
  err.code = 'ENOTFOUND';
  throw err;
}

// ── The local server and the connection stub (sections 3, 5 and 6) ───────────
/** Hosts whose request reached the local server. */
const reached = [];
/** Each request that reached the local server: its host and its path. */
const requests = [];
/** What the local server sends for a host and path; anything else reads "reached <host>". */
const SHEETS_PAGE = '<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Sheets</title>'
  + '<link rel="stylesheet" href="http://0x08080808/typed.css"><link rel="stylesheet" href="/kept.css">'
  + '</head><body><main><h1>Sheets</h1><p>A page that links two stylesheets.</p></main></body></html>';
/** A page that links one stylesheet at `href`, or none when `href` is ''. */
const onePage = (href) => '<!doctype html><html lang="en"><head><meta charset="utf-8"><title>One sheet</title>'
  + (href ? `<link rel="stylesheet" href="${href.replace(/&/g, '&amp;').replace(/"/g, '&quot;')}">` : '')
  + '</head><body><main><h1>One sheet</h1><p>A page that links at most one stylesheet.</p></main></body></html>';
function answer(host, url, res) {
  // <host>/r<status>?to=<Location, percent-encoded> answers a 301, 303,
  // 307 or 308 to that Location.
  const status = /^\/r(30[1378])\?to=/.exec(url);
  if (status) {
    res.writeHead(Number(status[1]), { Location: decodeURIComponent(url.slice(9)) });
    return res.end();
  }
  // <host>/r?to=<Location, percent-encoded> answers a 302 to that Location.
  if (url.startsWith('/r?to=')) {
    res.writeHead(302, { Location: decodeURIComponent(url.slice(6)) });
    return res.end();
  }
  if (host === 'sheets.example' && url === '/') {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    return res.end(SHEETS_PAGE);
  }
  // sheets.example/one/<href, percent-encoded> links one stylesheet, at that
  // href; sheets.example/none links none.
  if (host === 'sheets.example' && (url.startsWith('/one/') || url === '/none')) {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    return res.end(onePage(url === '/none' ? '' : decodeURIComponent(url.slice(5))));
  }
  if (url.endsWith('.css')) {
    res.writeHead(200, { 'Content-Type': 'text/css' });
    return res.end(':root{--paper:#fbfaf7;--ink:#14110f}body{color:var(--ink);background:var(--paper)}');
  }
  res.writeHead(200, { 'Content-Type': 'text/plain' });
  return res.end(`reached ${host}`);
}
/** host -> what the guard's pinned lookup answered for it (addresses, or the error). */
const pinnedAnswers = new Map();
/** Whether the pinned lookup handed `host` exactly `addresses`, as a check reads it. */
const handed = (host, addresses) => isDeepStrictEqual(pinnedAnswers.get(host), { addresses });
/**
 * Hosts whose socket asks the guard's pinned lookup for one address, as
 * node:http does with network family autoselection off: it names no all
 * option. Every other socket asks for every address, as node:http does by
 * default.
 */
const ONE_ADDRESS = new Set(['pin-one-address.example', 'pin-one-address-two.example', 'pin-one-address-three.example', 'pin-one-address-four.example', 'pin-one-address-private.example', 'pin-one-address-five.example', 'pin-one-address-six.example']);
let PORT = 0;

const toLocal = (real) => ({
  ...real,
  request(opts, cb) {
    const name = opts.hostname;
    const pinned = opts.lookup;
    if (typeof pinned !== 'function') throw new Error(`the guard sent ${name} without a lookup of its own`);
    const o = {
      ...opts,
      hostname: 'localhost',
      port: PORT,
      agent: false,
      headers: { ...(opts.headers || {}), 'x-guard-host': name },
      // The guard's own lookup decides; the socket goes to the local server.
      lookup(_host, lookupOpts, done) {
        const pinOpts = { ...lookupOpts };
        if (ONE_ADDRESS.has(name)) delete pinOpts.all;
        pinned(name, pinOpts, (err, address, family) => {
          // The answer must come in the shape the socket asked for: a list
          // when it asks for every address, one address otherwise. Each
          // address must come with the family it is of.
          if (!err && Array.isArray(address) !== Boolean(pinOpts.all)) err = new Error(`the pinned lookup answered ${name} in a shape the socket did not ask for`);
          if (!err && (Array.isArray(address) ? address.some((a) => net.isIP(a.address) !== a.family) : net.isIP(String(address)) !== family)) err = new Error(`the pinned lookup answered ${name} with an address of another family`);
          pinnedAnswers.set(name, err ? { error: err.message } : { addresses: Array.isArray(address) ? address.map((a) => a.address) : [address] });
          if (err) return done(err, address, family);
          // Answered in the shape node:http asked for.
          return lookupOpts && lookupOpts.all ? done(null, [{ address: '127.0.0.1', family: 4 }]) : done(null, '127.0.0.1', 4);
        });
      },
    };
    return http.request(o, cb);
  },
});

// ── Cases ────────────────────────────────────────────────────────────────────
// [input, expected, new]: `new` marks a case whose answer this change moved.
const LITERAL_HOSTS = [
  // 100.64.0.0/10, both edges.
  ['http://100.63.255.255/', true, false],
  ['http://100.64.0.0/', false, false],
  ['http://100.64.0.1/', false, false],
  ['http://100.100.100.100/', false, false],
  ['http://100.127.255.255/', false, false],
  ['http://100.128.0.0/', true, true],
  ['http://100.128.0.1/', true, true],
  ['http://100.200.1.1/', true, true],
  ['http://100.255.255.255/', true, true],
  // The same second parts after another first part: public, allowed.
  ['http://99.127.0.1/', true, false],
  ['http://101.64.0.1/', true, false],
  // Private and reserved literal hosts, refused as before.
  ['http://127.0.0.1/', false, false],
  ['http://10.0.0.1/', false, false],
  ['http://169.254.0.1/', false, false],
  ['http://172.16.0.1/', false, false],
  ['http://192.168.0.1/', false, false],
  ['http://0.0.0.0/', false, false],
  ['http://224.0.0.1/', false, false],
  // Numeric forms the URL parser reads as a private address, refused as before.
  ['http://2130706433/', false, false],
  ['http://0x7f.0.0.1/', false, false],
  ['http://0177.0.0.1/', false, false],
  ['http://127.1/', false, false],
  ['http://0x64400001/', false, false],
  // IPv6 literals and local names, refused as before.
  ['http://[::7f00:1]/', false, false],
  ['http://[::ffff:7f00:1]/', false, false],
  ['http://[2606:4700:4700::1111]/', false, false],
  ['http://localhost/', false, false],
  ['http://intranet/', false, false],
  // Public hosts, allowed.
  ['http://8.8.8.8/', true, false],
  ['https://example.com/', true, false],
  ['https://www.example.org/path?q=1', true, false],
  // Names whose other labels look octal or hex: a name, read by its DNS answers.
  ['http://007.example.com/', true, true],
  ['http://007.example.com./', true, true],
  ['http://00.example.com/', true, true],
  ['http://01.example.com/', true, true],
  ['http://0x1.example.com/', true, true],
  ['http://cdn.0777.example.org/', true, true],
  ['http://0xdead.0xbeef.example/', true, true],
  // A name of four labels that begin with digits is read by those digits:
  // 100.200.1.2a spells 100.200.1.2, outside 100.64.0.0/10, so it is a name;
  // 100.100.1.2a and 10.1.2.3x spell private addresses, refused as before.
  ['http://100.200.1.2a/', true, true],
  ['http://100.100.1.2a/', false, false],
  ['http://10.1.2.3x/', false, false],
  // A host whose last label is a number and that is not an address does not parse.
  ['http://example.007/', false, false],
  ['http://example.0x1/', false, false],
  // A last label that only starts like a number is a name, allowed.
  ['http://example.0x1g/', true, false],
  ['http://example.1a/', true, false],
];

const RESOLVER_ANSWERS = [
  ['public.example', true, false],
  ['v6-public.example', true, false],
  ['above-cgnat-answer.example', true, false],
  ['cgnat-answer.example', false, false],
  ['mixed-private.example', false, false],
  ['mixed-private-two.example', false, false],
  ['mixed-private-three.example', false, false],
  ['mixed-private-four.example', false, false],
  ['mixed-private-five.example', false, false],
  ['mixed-private-six.example', false, false],
  ['mixed-private-seven.example', false, false],
  ['mixed-private-eight.example', false, false],
  ['link-local-answer.example', false, false],
  ['reserved-answer.example', false, false],
  ['v6-link-local.example', false, false],
  ['v6-multicast.example', false, false],
  ['nat64-loopback.example', false, false],
  ['nat64-public.example', false, false],
  ['mapped-loopback.example', false, false],
  ['mapped-public.example', false, false],
  ['v6-loopback.example', false, false],
  ['v6-unspecified.example', false, false],
  ['unspecified-answer.example', false, false],
  ['mixed-unspecified.example', false, false],
  ['nxdomain.example', false, false],
  ['v4compat-loopback.example', false, true],
  ['v4compat-link-local.example', false, true],
  ['v4compat-private.example', false, true],
  ['v4compat-public.example', false, true],
  ['v4compat-mixed.example', false, true],
  ['v4compat-loopback-dotted.example', false, false],
  ['v4compat-link-local-dotted.example', false, false],
  ['v4compat-public-dotted.example', false, false],
  ['v4compat-two.example', false, true],
  ['v4compat-ffff.example', false, true],
  ['v4compat-mixed-two.example', false, true],
  ['v4compat-after-public.example', false, true],
  ['v4compat-three.example', false, true],
  // Answers in other ranges that are not public, and a lookup that fails
  // with a temporary error.
  ['v4-multicast.example', false, false],
  ['v4-broadcast.example', false, false],
  ['v6-6to4.example', false, false],
  ['v6-teredo.example', false, false],
  [TEMPORARY_FAILURE, false, false],
  ['five-answers.example', false, false],
  ['five-answers-two.example', false, false],
  ['four-answers.example', false, false],
  ['v4compat-v6-public.example', false, true],
  ['v4compat-inner.example', false, true],
];

const PUBLIC_URLS = [
  ['https://public.example/', true, false],
  ['http://100.127.255.255/', false, false],
  ['http://100.128.0.1/', true, true],
  ['https://007.public.example/', true, true],
  ['https://0x1.public.example/', true, true],
  ['https://v4compat-loopback.example/', false, true],
  ['https://v4compat-mixed.example/', false, true],
  ['https://v4compat-two.example/', false, true],
  ['https://v4compat-mixed-two.example/', false, true],
  ['https://v4compat-after-public.example/', false, true],
  // Names checked a second time, their answers read from the cache.
  ['https://cgnat-answer.example/', false, false],
  ['https://mixed-private.example/', false, false],
  ['https://v6-loopback.example/', false, false],
  // A name whose lookup failed, checked a second time.
  ['https://nxdomain.example/', false, false],
  // A name of four labels that begin with digits, followed by a dot: a name,
  // read by its answers.
  ['http://10.1.2.3x./', true, false],
  // A name whose lookup fails with a temporary error.
  [`https://${TEMPORARY_FAILURE}/`, false, false],
];

const VERDICTS = [
  ['https://public.example/app.css', true, false],
  ['http://100.127.255.255/', false, false],
  ['http://100.128.0.1/', true, true],
  ['https://007.public.example/app.css', true, true],
  ['wss://0x1.public.example/socket', true, true],
  ['https://v4compat-loopback.example/', false, true],
  ['ws://v4compat-mixed.example/socket', false, true],
  ['https://v4compat-ffff.example/', false, true],
  [`https://${TEMPORARY_FAILURE}/`, false, false],
];

// Section 5. A host typed as a number in any form other than four decimal
// parts is refused, whatever address it names; the host is read as the URL
// parser reads it. Four decimal parts typed in any of these ways are read as
// the address they name, and names as names, except a host typed with a
// character outside ASCII whose reading has an empty label before its end.
const TYPED_URLS = [
  ['http://0x08080808/', false, true],
  [`http:${'/'.repeat(70)}0x08080808/`, false, true],
  [`http://${'/'.repeat(5000)}0x08080808/`, false, true],
  [`http://${'u'.repeat(5000)}@0x08080808/`, false, true],
  [`http://${'/'.repeat(5000)}8.8.8.8/`, true, false],
  ['http://u v@0x08080808/', false, true],
  [`http://0x${'0'.repeat(70)}8080808/`, false, true],
  [`http://0x${'0'.repeat(300)}8080808/`, false, true],
  ['http://\u{1D41A}..public.example/', false, true],
  ['http://134744072/', false, true],
  ['http://8.8.2056/', false, true],
  ['http://8.526344/', false, true],
  ['http://0x8.0x8.0x8.0x8/', false, true],
  ['http://010.010.010.010/', false, true],
  ['http://8.8.8.010/', false, true],
  ['http://8.8.8.0x/', false, true],
  ['http://8.8.8/', false, true],
  ['http://1.1/', false, true],
  ['http://010.8.8.8/', false, true],
  ['http://0x8.8.8.8/', false, true],
  ['HTTP://0X08080808/', false, true],
  ['http://0x08080808./', false, true],
  ['http://%30x08080808/', false, true],
  ['http://０ｘ０８０８０８０８/', false, true],
  ['http://８。８。２０５６/', false, true],
  ['http://user@0x08080808:8080/path', false, true],
  ['https://a@b@0x08080808/', false, true],
  ['http:0x08080808', false, true],
  ['http:\\\\0x08080808\\path', false, true],
  ['http:///0x08080808/', false, true],
  ['http://0x0808\t0808/', false, true],
  ['http:/\t/0x08080808/', false, true],
  [' http://0x08080808/ ', false, true],
  ['http://0x08080808?@8.8.8.8', false, true],
  ['http://0x08080808#@8.8.8.8', false, true],
  ['http://8.8.8.01/', false, true],
  ['http://01.8.8.8/', false, true],
  ['http:/\n/0x08080808/', false, true],
  ['http:/\r/0x08080808/', false, true],
  ['http://0x0808\u00ad0808/', false, true],
  ['http://134744072../', false, true],
  ['http://８.８.２０５６。。/', false, true],
  ['http://127.0.0.1../', false, true],
  ['http://134744072..../', false, true],
  ['http:////0x08080808/', false, true],
  ['http://８.８.８.８../', false, true],
  ['http://8.8.8.8。。/', false, true],
  ['http://%EF%BC%98.8.8.8../', false, true],
  ['http://example.com。。/', false, true],
  ['http://exämple.com../', false, true],
  ['http://exämple..com/', false, true],
  ['http://。example.com/', false, true],
  ['http://ex%C3%A4mple..com/', false, true],
  ['http://01002004010/', false, true],
  ['http://0x0000000008080808/', false, true],
  ['http://8.8.8.256../', false, true],
  ['http://1.2.3.4.5../', false, true],
  ['http://0x08080808../', false, false],
  ['http://0x7f000001.../', false, false],
  ['http://0x7f000001/', false, false],
  ['http://8.8.8.8./', true, false],
  ['http://８.８.８.８/', true, false],
  ['http://８。８。８。８/', true, false],
  ['http://%38.8.8.8/', true, false],
  ['http://user@8.8.8.8:8080/', true, false],
  ['https://a@b@8.8.8.8/', true, false],
  ['http://8.8.8.8\\path', true, false],
  ['ht\ttp://8.8.8.8/', true, false],
  [' http://8.8.8.8/ ', true, false],
  ['\x01http://8.8.8.8/', true, false],
  ['HTTPS://8.8.8.8/', true, false],
  ['http://8.8.8.8#top', true, false],
  ['https://example.com?q=1', true, false],
  ['http://0x08080808@example.com/', true, false],
  ['http://example.com:8080/', true, false],
  ['http:/\n/8.8.8.8/', true, false],
  ['http://8.8.\u00ad8.8/', true, false],
  ['http://8.8.8.8../', true, false],
  ['http://example.com../', true, false],
  ['http://%38.8.8.8../', true, false],
  ['http://８.８.８.８。/', true, false],
  ['http://example.com。/', true, false],
  ['http://exämple.com./', true, false],
  ['http://10.1.2.3x./', true, false],
  ['http://10.1.2.3x../', true, false],
  ['http://0x1.example.com../', true, true],
  ['http:\t/\t/0x08080808/', false, true],
  ['ht\ntp:\r/\t/134744072/', false, true],
  ['http:\t/\t/8.8.8.8/', true, false],
  ['http://8..8.8../', false, true],
  ['http://256.8.8.8../', false, true],
  ['http://8.8.8.8.../', true, false],
  ['http://a..public.example\u00ad/', false, true],
  ['http://8.8.8.8.\uff61/', false, true],
  [`http:${'/'.repeat(70)}\t/0x08080808/`, false, true],
  [`http://${'a'.repeat(70)}.\uff41..b.example/`, false, true],
  ['http://\uff41..b.example:8080/', false, true],
  ['http://8.8.8.8\u0000', true, false],
  ['http://0x08080808;x.example/', true, false],
];

/** As every route reads a URL: normalizeInputUrl, then isValidUrl. */
const TYPED_INPUTS = [
  [`0x08080808/${'p'.repeat(3000)}`, false, true],
  [`8.8.8.8/${'p'.repeat(3000)}`, true, false],
  ['0x08080808', false, true],
  ['134744072', false, true],
  ['８。８。２０５６', false, true],
  ['user@0x08080808:8080/path', false, true],
  ['0x08080808/path?q=1', false, true],
  ['134744072..', false, true],
  ['127.0.0.1..', false, true],
  ['８.８.８.８..', false, true],
  ['8.8.8.8。。', false, true],
  ['01002004010', false, true],
  ['0x0000000008080808', false, true],
  ['0x7f000001', false, false],
  ['8.8.8.8', true, false],
  ['８.８.８.８', true, false],
  ['８.８.８.８。', true, false],
  ['example.com', true, false],
  ['8.8.8.8..', true, false],
  ['%30x08080808', false, true],
  ['0x08080808\\x', false, true],
];

/** resolveAndValidateHost, given a hostname of its own. */
const TYPED_HOSTNAMES = [
  ['0x08080808', false, true],
  ['134744072', false, true],
  ['8.8.2056', false, true],
  ['010.010.010.010', false, true],
  ['8.8.8.010', false, true],
  ['0x08080808..', false, true],
  ['０ｘ０８０８０８０８', false, true],
  ['127.0.0.1.', false, true],
  ['127.0.0.1..', false, true],
  ['８.８.８.８..', false, true],
  ['01002004010', false, true],
  ['0x0000000008080808', false, true],
  ['8.8.8.256', false, true],
  ['1.2.3.4.5', false, true],
  ['0x7f000001', false, false],
  ['8.8.8.8', true, false],
  ['8.8.8.8..', true, false],
];

/**
 * resolveAndValidateHost, given a hostname that holds a tab or a newline,
 * at its start, inside it or at its end: refused with no lookup of it,
 * whatever the lookup would answer.
 */
const CONTROL_HOSTNAMES = [
  ['0x08080808\tx', true],
  ['134744072\nx', true],
  ['8.8.8.8\rfoo.example', true],
  ['\tpublic.example', true],
  ['public.example\n', true],
  ['8.8.8.8\n', true],
  ['\t8.8.8.8', true],
  [`${'a'.repeat(70)}.example\n`, true],
  [`${'a'.repeat(260)}.example\n`, true],
  ['8.8.8.8\t8', true],
  [`${'a'.repeat(30)}\t${'a'.repeat(30)}.example`, true],
];

/**
 * [hostname, what it is, new]: resolveAndValidateHost, given a hostname the
 * typed-host read gives nothing for, or four decimal parts of a private
 * address typed in fullwidth digits: refused with no lookup of it, whatever
 * the lookup would answer.
 */
const UNLOOKED_HOSTNAMES = [
  ['8.8.8.8@public.example', 'the read gives nothing for', true],
  ['public.example/x', 'the read gives nothing for', true],
  ['public.example:80', 'the read gives nothing for', true],
  ['pub^lic.example', 'the read gives nothing for', true],
  ['１２７.0.0.1', 'that spells a private address', true],
  ['１０.0.0.1.', 'that spells a private address', true],
  ['q.x/y', 'the read gives nothing for', true],
  ['a.x\\y', 'the read gives nothing for', true],
  ['a.x?y', 'the read gives nothing for', true],
  ['a.x#y', 'the read gives nothing for', true],
  ['8.8.8.1000', 'typed as a number in another form', true],
];

const TYPED_PUBLIC_URLS = [
  ['http://0x08080808/', false, true],
  ['http://134744072../', false, true],
  ['http://８.８.８.８/', true, false],
  ['http://%30x08080808/', false, true],
];

const TYPED_VERDICTS = [
  ['http://0x08080808/', false, true],
  ['wss://134744072/socket', false, true],
  ['https://８。８。２０５６/app.css', false, true],
  ['http://134744072../', false, true],
  ['http://８.８.８.８../', false, true],
  ['https://8.8.8.8/app.css', true, false],
  ['http://u@0x08080808/', false, true],
  [' http://0x08080808/', false, true],
  ['http://0x08080808:8080/', false, true],
  ['\x01http://0x08080808/', false, true],
  ['data:text/plain,hello', true, false],
  [`http://${'/'.repeat(3000)}0x08080808/`, false, true],
  ['http://%30x08080808/', false, true],
  ['http://0x08080808\\x', false, true],
  ['wss://\uff41..verdict.example/s', false, true],
];

/** [Location, followed, new]: a redirect from redirect.example to this Location. */
const TYPED_LOCATIONS = [
  ['http://0x08080808/', false, true],
  ['//0x08080808/', false, true],
  ['https:0x08080808/', false, true],
  ['\\\\0x08080808/', false, true],
  ['HTTP://0X08080808/', false, true],
  ['http://0x08080808/x?@y', false, true],
  ['//0x08080808/#@x', false, true],
  ['//134744072../', false, true],
  ['http://%EF%BC%98.8.8.8../', false, true],
  ['///0x08080808/', false, true],
  ['\\\\\\0x08080808/', false, true],
  ['//0x08080808./', false, true],
  ['http://0x08080808../', false, false],
  ['http://8.8.8.8/', true, false],
  ['///8.8.8.8/', true, false],
  ['http://8.8.8.8/x?@y', true, false],
  ['/0x08080808', true, false],
  ['0x08080808', true, false],
  ['http:0x08080808', true, false],
  ['HTTP:0x08080808', true, false],
  ['http:/0x08080808', true, false],
  ['https:public.example/x', true, false],
  ['HTTPS://public.example/x', true, false],
  ['//u@0x08080808/', false, true],
  ['https://u:p@134744072/', false, true],
  ['//a..public.example@%EF%BD%81..public.example/', false, true],
  ['http: //0x08080808/', true, false],
  [`//0x08080808/${'p'.repeat(3000)}`, false, true],
  ['\u00a0//0x08080808/', true, false],
  ['\u00a0', true, false],
  ['/\\8.8.8.8/', true, false],
];

/**
 * [href, new]: a page's stylesheet link whose host is typed as a number in
 * another form, as a page may write it. extractCssLinks gives each as a URL
 * of its scheme, so the callers read it as a link, and isValidUrl refuses it.
 */
const TYPED_LINKS = [
  ['http://0x08080808/a.css', true],
  ['//0x08080808/b.css', true],
  ['HTTP://0X08080808/c.css', true],
  ['\\\\0x08080808/d.css', true],
  [' //0x08080808/e.css', true],
  ['//0x08080808/g.css?v=1@2', true],
  ['//0x08080808\x1f', true],
  ['/\n/0x08080808/h.css', true],
  ['//134744072../i.css', true],
  ['//８.８.８.８../k.css', true],
  ['//example.com。。/l.css', true],
  ['///0x08080808/m.css', true],
  ['//0x08080808./n.css', true],
  ['//u@0x08080808/p.css', true],
  ['//%30x08080808/r.css', true],
  ['//0x7f000001/f.css', false],
  ['//0x08080808../j.css', false],
];

/**
 * [href, the URL extractCssLinks gives, new]: a link resolved against its
 * page, https://sheets.example/. A host typed as a number in another form
 * is kept as typed, with its port; any other link is read as new URL reads
 * it.
 */
const LINK_URLS = [
  ['//0x08080808\x1f', 'https://0x08080808/', true],
  ['//0x08080808/g.css?v=1@2', 'https://0x08080808/g.css?v=1@2', true],
  ['//8.8.8.8/g.css?v=1@2', 'https://8.8.8.8/g.css?v=1@2', false],
  ['//example.com/g.css', 'https://example.com/g.css', false],
  ['HTTPS:0x08080808/e.css', 'https://sheets.example/0x08080808/e.css', false],
  ['http:example.com/a.css', 'http://example.com/a.css', false],
  ['https:\\\\example.com/g.css', 'https://example.com/g.css', false],
  ['\\\\example.com/h.css', 'https://example.com/h.css', false],
  ['//example.com ', 'https://example.com/', false],
  ['//0x08080808:81/a.css', 'https://0x08080808:81/a.css', true],
  ['\u00a0//0x08080808/q.css', 'https://sheets.example/%C2%A0//0x08080808/q.css', false],
  ['ht\u000btp://0x08080808/v.css', 'https://sheets.example/ht%0Btp://0x08080808/v.css', false],
  ['\u3000', 'https://sheets.example/%E3%80%80', false],
];

/**
 * Inputs for which the typed-host read is made to give nothing, as a gap in
 * it would: a URL whose host it cannot give is refused unless it names its
 * page's scheme, host and port, and a path stays on its page's host.
 */
const NULL_READ = new Set([
  'http://8.8.8.8/unread.css', '//public.example/unread', '/unread.css', 'https://0x08080808/unread', 'http://0x08080808/unread',
  'https://sheets.example:8443/unread.css', '//xredirect.example/unread', '//sub.redirect.example/unread',
  '//redirect.example/unread-parent', '//redirect.example/unread-port', '//sub.sheets.example/unread.css',
  '//sheets.example/unread-parent.css', '//sheets.example/unread-port.css',
  '//www.redirect.example/unread-www', '//redirect.example./unread-dot',
]);
/**
 * Locations and links for which that read gives nothing only while they
 * are resolved against their page, so that the URL they resolve to is then
 * read as any URL is. Each names its page's host: on its page's scheme, or
 * on the other one.
 */
const NULL_REFERENCES = new Set([
  '//redirect.example/unread-same', 'https://redirect.example/unread-other', 'http://sheets.example/unread-other.css',
]);

/**
 * [href, new]: a page whose one stylesheet is linked this way is read and
 * scored as the same page with no stylesheet.
 */
const SHEET_LINKS = [
  ['//0x08080808/x.css', true],
  ['HTTP://0X08080808/x.css', true],
  [`//0x08080808/${'p'.repeat(600)}.css`, true],
  ['//0x08080808:443/x.css', true],
  ['//u@0x08080808/x.css', true],
  ['//0x7f000001/x.css', false],
];

/** [input, ok, new]: the URL bar's hint (checkUrl) and the guard agree. */
const TYPED_BAR = [
  ['0x08080808', false, true],
  ['http://134744072/', false, true],
  ['８。８。２０５６', false, true],
  ['8.8.8.01', false, true],
  ['134744072..', false, true],
  ['127.0.0.1..', false, true],
  ['８.８.８.８..', false, true],
  ['8.8.8.8。。', false, true],
  ['example.com。。', false, true],
  ['http://u@0x08080808/', false, true],
  ['0x08080808:8080', false, true],
  [`0x${'0'.repeat(300)}8080808`, false, true],
  [`0x${'0'.repeat(70)}8080808`, false, true],
  ['%30x08080808', false, true],
  ['0x08080808\\x', false, true],
  ['HTTP://0X08080808/', false, true],
  ['0x08080808/x', false, true],
  ['8.8.2056..', false, true],
  ['example.com:8080', true, false],
  ['0x7f000001', false, false],
  ['8.8.8.8', true, false],
  ['８.８.８.８', true, false],
  ['８.８.８.８。', true, false],
  ['example.com', true, false],
  ['8.8.8.8..', true, false],
];

// Section 6. Each route that reads a URL from its request body, with the
// body that names the URL: a host typed as a number is answered as a private
// address is, with the route's 400 for an invalid URL.
const ROUTES = [
  ['app/api/score/route.ts', (url) => ({ url, scope: 'universal' })],
  ['app/api/score/rescore/route.ts', (url) => ({ url })],
  ['app/api/score/audit/route.ts', (url) => ({ url })],
  ['app/api/drift/route.ts', (url) => ({ url })],
  ['app/api/readiness/route.ts', (url) => ({ url })],
  ['app/api/guardrails/route.ts', (url) => ({ url })],
  ['app/api/monitor/route.ts', (url) => ({ url })],
  ['app/api/report/route.ts', (url) => ({ url })],
  ['app/api/compare/route.ts', (url) => ({ urlA: url, urlB: 'https://public.example/' })],
];

// ── Runner ───────────────────────────────────────────────────────────────────
const failures = [];
const newFailures = [];
let total = 0;
let marked = 0;
async function check(name, fn, isNew = false) {
  total++;
  if (isNew) marked++;
  try {
    await fn();
    console.log(`  ok    ${name}`);
  } catch (err) {
    failures.push(name);
    if (isNew) newFailures.push(name);
    console.log(`  FAIL  ${name}${isNew ? ' [new]' : ''}\n        ${String(err && err.message).split('\n').join('\n        ')}`);
  }
}
const word = (ok) => (ok ? 'allows' : 'refuses');
/**
 * A typed input as a check names it: as JSON, with a space or format
 * character outside ASCII given as its escape, and a run of more than 16 of
 * one character given as the character and the run's length in braces.
 */
const show = (input) => JSON.stringify(input)
  .replace(/[\u0080-\u00a0\u1680\u2000-\u200f\u2028-\u202f\u205f\u3000\ufeff]/g, (c) => `\\u${c.charCodeAt(0).toString(16).padStart(4, '0')}`)
  .replace(/(.)\1{16,}/gu, (run, c) => `${c}{${[...run].length}}`);

async function literalSection(guard) {
  console.log('1. isValidUrl: the host as written');
  for (const [url, expected, isNew] of LITERAL_HOSTS) {
    await check(`${word(expected)} ${url}`, async () => assert.equal(guard.isValidUrl(url), expected), isNew);
  }
}

async function resolverSection(guard) {
  console.log('2. resolveAndValidateHost and isPublicUrl: every address a name resolves to');
  let n = 0;
  for (const [host, expected, isNew] of RESOLVER_ANSWERS) {
    await check(`resolveAndValidateHost ${word(expected)} the name of case 2.${++n}`, async () => assert.equal(await guard.resolveAndValidateHost(host), expected), isNew);
  }
  for (const [url, expected, isNew] of PUBLIC_URLS) {
    await check(`isPublicUrl ${word(expected)} the URL of case 2.${++n}`, async () => assert.equal(await guard.isPublicUrl(url), expected), isNew);
  }
  await check(`asks about the name of case 2.${++n} again 100 s after its first lookup, though it was read from the cache at 50 s, and refuses it then`, async () => {
    const now = Date.now;
    const t0 = now();
    try {
      Date.now = () => t0;
      assert.equal(await guard.resolveAndValidateHost('sliding-answer.example'), true);
      Date.now = () => t0 + 50_000;
      assert.equal(await guard.resolveAndValidateHost('sliding-answer.example'), true);
      Date.now = () => t0 + 100_000;
      assert.equal(await guard.resolveAndValidateHost('sliding-answer.example'), false);
    } finally {
      Date.now = now;
    }
  });
  await check(`asks about the name of case 2.${++n} again once its answer is 61 s old, and refuses it then`, async () => {
    assert.equal(await guard.resolveAndValidateHost('aged-answer.example'), true);
    const now = Date.now;
    Date.now = () => now() + 61_000;
    try {
      assert.equal(await guard.resolveAndValidateHost('aged-answer.example'), false);
    } finally {
      Date.now = now;
    }
  });
  await check(`asks about the name of case 2.${++n} again once its answer is 61 s old, and refuses it then, when its new lookup fails`, async () => {
    assert.equal(await guard.resolveAndValidateHost(FAILS_LATER), true);
    const now = Date.now;
    Date.now = () => now() + 61_000;
    try {
      assert.equal(await guard.resolveAndValidateHost(FAILS_LATER), false);
    } finally {
      Date.now = now;
    }
  });
  await check(`asks about the name of case 2.${++n} again once its answer is 61 s old, and refuses it then, when its new lookup finds no answer`, async () => {
    assert.equal(await guard.resolveAndValidateHost(GONE_LATER), true);
    const now = Date.now;
    Date.now = () => now() + 61_000;
    try {
      assert.equal(await guard.resolveAndValidateHost(GONE_LATER), false);
    } finally {
      Date.now = now;
    }
  });
  await check(`asks about the name of case 2.${++n}, which had two answers, again once its answer is 61 s old, and refuses it then`, async () => {
    assert.equal(await guard.resolveAndValidateHost(KEPT_TWO), true);
    const now = Date.now;
    Date.now = () => now() + 61_000;
    try {
      assert.equal(await guard.resolveAndValidateHost(KEPT_TWO), false);
    } finally {
      Date.now = now;
    }
  });
  await check(`reads the name of case 2.${++n} from the cache 59 s after its first lookup`, async () => {
    const now = Date.now;
    const t0 = now();
    try {
      Date.now = () => t0;
      assert.equal(await guard.resolveAndValidateHost(KEPT_ANSWER), true);
      Date.now = () => t0 + 59_000;
      assert.equal(await guard.resolveAndValidateHost(KEPT_ANSWER), true);
    } finally {
      Date.now = now;
    }
  });
  await check(`reads the name of case 2.${++n} from the cache 10 s after its first lookup, after 501 other names were checked`, async () => {
    const now = Date.now;
    const t0 = now();
    try {
      Date.now = () => t0;
      assert.equal(await guard.resolveAndValidateHost(KEPT_PAST_PRUNE), true);
      for (let i = 0; i < 501; i++) assert.equal(await guard.resolveAndValidateHost(`n${i}.fill.example`), true);
      Date.now = () => t0 + 10_000;
      assert.equal(await guard.resolveAndValidateHost(KEPT_PAST_PRUNE), true);
    } finally {
      Date.now = now;
    }
  });
  await check(`refuses the name of case 2.${++n} again 10 s after its first lookup, its answer read from the cache`, async () => {
    const now = Date.now;
    const t0 = now();
    try {
      Date.now = () => t0;
      assert.equal(await guard.resolveAndValidateHost(TURNS_PUBLIC), false);
      Date.now = () => t0 + 10_000;
      assert.equal(await guard.resolveAndValidateHost(TURNS_PUBLIC), false);
    } finally {
      Date.now = now;
    }
  });
  await check(`refuses the name of case 2.${++n} when its lookup fails with a temporary error, once`, async () => {
    assert.equal(await guard.resolveAndValidateHost(FAILS_FIRST), false);
    assert.equal(asked.get(FAILS_FIRST), 1, `${asked.get(FAILS_FIRST)} lookups`);
  });
}

async function pinnedSection(guard) {
  console.log('3. the pinned lookup: the addresses a socket may connect to');
  const server = http.createServer((req, res) => {
    const host = String(req.headers['x-guard-host'] || '');
    reached.push(host);
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end(`reached ${host}`);
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  PORT = server.address().port;
  try {
    // On Windows (Node 24.15.0), under a preload that wraps socket connects,
    // a run can end with a native abort (exit 0xC0000409, nothing on stderr),
    // in this section or later in the run. It is rare, and its rate has
    // varied from one series of runs to the next. Its cause is not found.
    let n = 0;
    await check(`reads the name of case 3.${++n}, public at the check and at the connection`, async () => {
      const res = await guard.safeFetch('http://pin-public.example/');
      assert.equal(res.status, 200);
      assert.equal(await res.text(), 'reached pin-public.example');
      assert.ok(handed('pin-public.example', [PUBLIC_V4]), 'the pinned lookup did not hand the public answer');
    });
    for (const [host, isNew, publicAddresses] of [
      ['pin-mixed.example', true, [PUBLIC_V4]],
      ['pin-mixed-two.example', true, [PUBLIC_V4]],
      ['pin-both-families.example', false, [PUBLIC_V4, PUBLIC_V6]],
      ['pin-mixed-private.example', false, [PUBLIC_V6]],
      ['pin-mixed-three.example', false, [PUBLIC_V4]],
      ['pin-mixed-four.example', false, [PUBLIC_V6]],
      ['pin-mixed-five.example', false, [PUBLIC_V4, PUBLIC_V6]],
      ['pin-public-two.example', false, [PUBLIC_V6, PUBLIC_V4]],
      ['pin-mixed-reserved.example', false, [PUBLIC_V6]],
      ['pin-two-private.example', false, [PUBLIC_V4]],
      ['pin-five-answers.example', false, [PUBLIC_V4, PUBLIC_V4_B, PUBLIC_V6, PUBLIC_V6_B]],
      ['pin-four-answers.example', false, [PUBLIC_V4, PUBLIC_V4_B, PUBLIC_V6]],
      ['pin-five-answers-two.example', false, [PUBLIC_V4, PUBLIC_V6, PUBLIC_V4_B, PUBLIC_V6_B]],
      ['pin-v4compat-v6-public.example', true, [PUBLIC_V6]],
    ]) {
      await check(`hands a socket that asks for every address only public answers of the name of case 3.${++n}`, async () => {
        const res = await guard.safeFetch(`http://${host}/`);
        assert.equal(res.status, 200);
        await res.text();
        assert.ok(handed(host, publicAddresses), 'the pinned lookup did not hand exactly the public answers');
      }, isNew);
    }
    for (const [host, isNew, publicAddress] of [
      ['pin-one-address.example', false, PUBLIC_V4],
      ['pin-one-address-two.example', true, PUBLIC_V4],
      ['pin-one-address-three.example', false, PUBLIC_V6],
      ['pin-one-address-four.example', false, PUBLIC_V6],
      ['pin-one-address-five.example', false, PUBLIC_V4],
      ['pin-one-address-six.example', false, PUBLIC_V6],
    ]) {
      await check(`hands a socket that asks for one address only a public answer of the name of case 3.${++n}`, async () => {
        const res = await guard.safeFetch(`http://${host}/`);
        assert.equal(res.status, 200);
        await res.text();
        assert.ok(handed(host, [publicAddress]), 'the pinned lookup did not hand the public answer');
      }, isNew);
    }
    for (const [host, isNew] of [
      ['pin-v4compat.example', true],
      ['pin-v4compat-link-local.example', true],
      ['pin-mapped.example', false],
      ['pin-v4compat-two.example', true],
      ['pin-v4compat-ffff.example', true],
      ['pin-v4compat-dotted.example', false],
      ['pin-v4compat-public-dotted.example', false],
      ['pin-private.example', false],
      ['pin-loopback.example', false],
      ['pin-v6-loopback.example', false],
      ['pin-link-local.example', false],
      ['pin-unspecified.example', false],
      ['pin-reserved.example', false],
      ['pin-one-address-private.example', false],
    ]) {
      await check(`refuses the name of case 3.${++n} at the connection, public at the check and not at the connection`, async () => {
        await assert.rejects(guard.safeFetch(`http://${host}/`), /no public address/);
        assert.equal(reached.includes(host), false, `${host} reached the server`);
        assert.ok(pinnedAnswers.get(host) && pinnedAnswers.get(host).error, 'the pinned lookup handed an answer');
      }, isNew);
    }
    await check(`refuses the name of case 3.${++n} at the connection when the pinned lookup's own lookup fails there`, async () => {
      await assert.rejects(guard.safeFetch(`http://${FAILS_AT_CONNECTION}/`), /EAI_AGAIN/);
      assert.equal(reached.includes(FAILS_AT_CONNECTION), false, 'the name reached the server');
      assert.equal(asked.get(FAILS_AT_CONNECTION), 2, `${asked.get(FAILS_AT_CONNECTION)} lookups`);
    });
    await check('each pinned case was looked up twice: once by the check, once by the socket', async () => {
      for (const host of Object.keys(CHANGING)) assert.equal(asked.get(host), 2, `${host}: ${asked.get(host)} lookups`);
    });
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

async function verdictSection(browserGuard) {
  console.log('4. createUrlVerdict: the browser audit takes the same answers');
  const verdict = browserGuard.createUrlVerdict();
  let n = 0;
  for (const [url, expected, isNew] of VERDICTS) {
    await check(`${word(expected)} the URL of case 4.${++n}`, async () => assert.equal(await verdict(url), expected), isNew);
  }
}

/** A package, from the app being checked, or else from this checkout. */
function fromApp(spec) {
  return require(require.resolve(spec, { paths: [APP, path.join(__dirname, '..')] }));
}

/**
 * The URL bar (app/lib/engine/command-bar.tsx), its CSS imports left out.
 * Its own imports load through the harness, as the guard's do.
 */
function loadBar(h) {
  const file = path.join(APP, 'app/lib/engine/command-bar.tsx');
  const ts = fromApp('typescript');
  const src = fs.readFileSync(file, 'utf8').replace(/^import '[^']+\.css';\r?$/gm, '');
  const out = ts.transpileModule(src, {
    fileName: file,
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
  }).outputText;
  const local = (spec) => {
    const at = path.resolve(path.dirname(file), spec);
    const found = [`${at}.ts`, `${at}.tsx`, at].find((c) => fs.existsSync(c) && fs.statSync(c).isFile());
    if (!found) throw new Error(`command-bar.tsx: cannot resolve '${spec}'`);
    return h.load(path.relative(APP, found));
  };
  const mod = { exports: {} };
  // eslint-disable-next-line no-new-func
  new Function('exports', 'require', 'module', '__filename', '__dirname', out)(mod.exports, (spec) => (spec.startsWith('.') ? local(spec) : fromApp(spec)), mod, file, path.dirname(file));
  return mod.exports;
}

/** The requests that reached the local server while `fn` ran. */
async function requestsDuring(fn) {
  const from = requests.length;
  await fn();
  return requests.slice(from);
}
const hostOf = (request) => request.split('/')[0];

async function typedSection(h, guard, browserGuard, makeHarness) {
  console.log('5. the host as typed: a host typed as a number must be four decimal parts');
  for (const [url, expected, isNew] of TYPED_URLS) {
    await check(`isValidUrl ${word(expected)} ${show(url)}`, async () => assert.equal(guard.isValidUrl(url), expected), isNew);
  }
  for (const [raw, expected, isNew] of TYPED_INPUTS) {
    await check(`normalizeInputUrl then isValidUrl ${word(expected)} ${show(raw)}`, async () => {
      const url = guard.normalizeInputUrl(raw);
      assert.equal(guard.isValidUrl(url), expected, `normalizeInputUrl gave ${url}`);
    }, isNew);
  }
  for (const [name, expected, isNew] of TYPED_HOSTNAMES) {
    await check(`resolveAndValidateHost ${word(expected)} ${name}`, async () => assert.equal(await guard.resolveAndValidateHost(name), expected), isNew);
  }
  for (const [name, isNew] of CONTROL_HOSTNAMES) {
    await check(`resolveAndValidateHost refuses ${show(name)}, a hostname that holds a control character, and does not look it up`, async () => {
      assert.equal(await guard.resolveAndValidateHost(name), false);
      assert.equal(asked.has(name), false, `${show(name)} was looked up`);
    }, isNew);
  }
  for (const [name, what, isNew] of UNLOOKED_HOSTNAMES) {
    await check(`resolveAndValidateHost refuses ${show(name)}, a hostname ${what}, and does not look it up`, async () => {
      assert.equal(await guard.resolveAndValidateHost(name), false);
      assert.equal(asked.has(name), false, `${show(name)} was looked up`);
    }, isNew);
  }
  for (const [url, expected, isNew] of TYPED_PUBLIC_URLS) {
    await check(`isPublicUrl ${word(expected)} ${show(url)}`, async () => assert.equal(await guard.isPublicUrl(url), expected), isNew);
  }
  const verdict = browserGuard.createUrlVerdict();
  for (const [url, expected, isNew] of TYPED_VERDICTS) {
    await check(`createUrlVerdict ${word(expected)} ${show(url)}`, async () => assert.equal(await verdict(url), expected), isNew);
  }
  await check('safeFetch refuses http://0x08080808/ and asks the server nothing', async () => {
    const seen = await requestsDuring(() => assert.rejects(guard.safeFetch('http://0x08080808/'), /SSRF guard: blocked URL/));
    assert.deepEqual(seen, []);
  }, true);
  for (const [location, followed, isNew] of TYPED_LOCATIONS) {
    const name = followed ? `safeFetch follows a redirect to ${show(location)}` : `safeFetch refuses a redirect to ${show(location)} and asks its host nothing`;
    await check(name, async () => {
      const from = `http://redirect.example/r?to=${encodeURIComponent(location)}`;
      const seen = await requestsDuring(async () => {
        if (!followed) return assert.rejects(guard.safeFetch(from), /SSRF guard: blocked URL/);
        const res = await guard.safeFetch(from);
        assert.equal(res.status, 200);
        await res.text();
      });
      const hops = seen.filter((r) => r !== `redirect.example/r?to=${encodeURIComponent(location)}`);
      if (followed) assert.equal(hops.length, 1, `hops: ${JSON.stringify(seen)}`);
      else assert.deepEqual(hops, [], `the redirect reached ${JSON.stringify(hops)}`);
    }, isNew);
  }
  for (const status of ['301', '303', '307', '308']) {
    await check(`safeFetch refuses a ${status} redirect to "//0x08080808/" and asks its host nothing`, async () => {
      const from = `http://redirect.example/r${status}?to=${encodeURIComponent('//0x08080808/')}`;
      const seen = await requestsDuring(() => assert.rejects(guard.safeFetch(from), /SSRF guard: blocked URL/));
      assert.deepEqual(seen.filter((r) => hostOf(r) !== 'redirect.example'), [], `the redirect reached ${JSON.stringify(seen)}`);
    }, true);
  }
  await check('safeFetch refuses a redirect from http://8.8.8.8/ to "//0x08080808/x" and asks its host nothing more', async () => {
    const from = `http://8.8.8.8/r?to=${encodeURIComponent('//0x08080808/x')}`;
    const seen = await requestsDuring(() => assert.rejects(guard.safeFetch(from), /SSRF guard: blocked URL/));
    assert.deepEqual(seen, [`8.8.8.8/r?to=${encodeURIComponent('//0x08080808/x')}`]);
  }, true);
  await check('safeFetch refuses a redirect from http://8.8.8.8/ to "HTTP://0X08080808/x" and asks its host nothing more', async () => {
    const from = `http://8.8.8.8/r?to=${encodeURIComponent('HTTP://0X08080808/x')}`;
    const seen = await requestsDuring(() => assert.rejects(guard.safeFetch(from), /SSRF guard: blocked URL/));
    assert.equal(seen.length, 1, JSON.stringify(seen));
  }, true);
  await check('safeFetch resolves the Location of a second redirect, "/final", against the URL that answered with it', async () => {
    const second = `http://public.example/r?to=${encodeURIComponent('/final')}`;
    const seen = await requestsDuring(async () => {
      const res = await guard.safeFetch(`http://redirect.example/r?to=${encodeURIComponent(second)}`);
      assert.equal(res.status, 200);
      await res.text();
    });
    assert.deepEqual(seen.map(hostOf), ['redirect.example', 'public.example', 'public.example'], JSON.stringify(seen));
    assert.equal(seen[2], 'public.example/final');
  });
  await check('safeFetch resolves a Location of only a query, "?to=%2Ffinal", against the URL that answered with it', async () => {
    const first = `redirect.example/r?to=${encodeURIComponent('?to=%2Ffinal')}`;
    const seen = await requestsDuring(async () => {
      const res = await guard.safeFetch(`http://${first}`);
      assert.equal(res.status, 200);
      await res.text();
    });
    assert.deepEqual(seen, [first, 'redirect.example/r?to=%2Ffinal', 'redirect.example/final'], JSON.stringify(seen));
  });
  await check('safeFetch refuses a second redirect to "//0x08080808/x" and asks its host nothing', async () => {
    const second = `http://public.example/r?to=${encodeURIComponent('//0x08080808/x')}`;
    const seen = await requestsDuring(() => assert.rejects(guard.safeFetch(`http://redirect.example/r?to=${encodeURIComponent(second)}`), /SSRF guard: blocked URL/));
    assert.deepEqual(seen.map(hostOf), ['redirect.example', 'public.example'], JSON.stringify(seen));
  }, true);
  await check('safeFetch refuses a redirect to http://mixed-private.example/, a name with an answer that is not public, and asks that host nothing', async () => {
    const from = `http://redirect.example/r?to=${encodeURIComponent('http://mixed-private.example/')}`;
    const seen = await requestsDuring(() => assert.rejects(guard.safeFetch(from), /SSRF guard: blocked DNS resolution/));
    assert.deepEqual(seen.filter((r) => hostOf(r) !== 'redirect.example'), [], `the redirect reached ${JSON.stringify(seen)}`);
  });
  const pageFetch = h.load('app/lib/page-fetch.ts');
  /** The one URL extractCssLinks gives for a page, https://sheets.example/ unless given, that links one stylesheet at `href`. */
  const linkOf = (fetcher, href, page = 'https://sheets.example/') => {
    const links = fetcher.extractCssLinks(`<link rel="stylesheet" href="${href}">`, page);
    assert.equal(links.length, 1, `gave ${JSON.stringify(links)}`);
    return links[0];
  };
  for (const [href, isNew] of TYPED_LINKS) {
    await check(`extractCssLinks gives the link ${show(href)} as an http or https URL that isValidUrl refuses`, async () => {
      const link = linkOf(pageFetch, href);
      assert.match(String(link), /^https?:\/\//, `gave ${link}`);
      assert.equal(guard.isValidUrl(link), false, `gave ${link}`);
    }, isNew);
  }
  await check('extractCssLinks gives the link "//0x08080808/o.css" on the page https://8.8.8.8/ as an http or https URL that isValidUrl refuses', async () => {
    const link = linkOf(pageFetch, '//0x08080808/o.css', 'https://8.8.8.8/');
    assert.match(String(link), /^https?:\/\//, `gave ${link}`);
    assert.equal(guard.isValidUrl(link), false, `gave ${link}`);
  }, true);
  await check('extractCssLinks resolves the link /kept.css against its page', async () => assert.equal(linkOf(pageFetch, '/kept.css'), 'https://sheets.example/kept.css'));
  for (const [href, expected, isNew] of LINK_URLS) {
    await check(`extractCssLinks gives the link ${show(href)} as ${expected}`, async () => assert.equal(linkOf(pageFetch, href), expected), isNew);
  }
  // The same modules, with the typed-host read giving nothing for NULL_READ,
  // and for NULL_REFERENCES while one is resolved against its page.
  const unread = makeHarness({
    'app/lib/typed-host.ts': (real) => ({ ...real, typedHost: (input, base) => (NULL_READ.has(input) || (base !== undefined && NULL_REFERENCES.has(input)) ? null : real.typedHost(input, base)) }),
  });
  const unreadGuard = unread.load('app/lib/url-guard.ts');
  const unreadFetch = unread.load('app/lib/page-fetch.ts');
  await check('isValidUrl refuses http://8.8.8.8/unread.css when the read gives nothing', async () => assert.equal(unreadGuard.isValidUrl('http://8.8.8.8/unread.css'), false), true);
  await check('normalizeInputUrl then isValidUrl refuses "0x08080808/unread" when the read gives nothing', async () => {
    const url = unreadGuard.normalizeInputUrl('0x08080808/unread');
    assert.equal(unreadGuard.isValidUrl(url), false, `normalizeInputUrl gave ${url}`);
  }, true);
  await check('createUrlVerdict refuses http://0x08080808/unread when the read gives nothing', async () => {
    const unreadVerdict = unread.load('app/lib/browser-guard.ts').createUrlVerdict();
    assert.equal(await unreadVerdict('http://0x08080808/unread'), false);
  }, true);
  await check('the URL bar warns on http://8.8.8.8/unread.css when the read gives nothing', async () => {
    const c = loadBar(unread).checkUrl('http://8.8.8.8/unread.css');
    assert.equal(Boolean(c && c.ok), false, `checkUrl said ${c && c.plain}`);
  }, true);
  await check('extractCssLinks gives the link http://8.8.8.8/unread.css, which the read gives nothing for, as an http or https URL that isValidUrl refuses', async () => {
    const link = linkOf(unreadFetch, 'http://8.8.8.8/unread.css');
    assert.match(String(link), /^https?:\/\//, `gave ${link}`);
    assert.equal(guard.isValidUrl(link), false, `gave ${link}`);
  }, true);
  await check('extractCssLinks gives the link https://sheets.example:8443/unread.css, which the read gives nothing for, as an http or https URL that isValidUrl refuses', async () => {
    const link = linkOf(unreadFetch, 'https://sheets.example:8443/unread.css');
    assert.match(String(link), /^https?:\/\//, `gave ${link}`);
    assert.equal(guard.isValidUrl(link), false, `gave ${link}`);
  }, true);
  for (const [href, page, what] of [
    ['//sub.sheets.example/unread.css', 'https://sheets.example/', 'whose host is under its page\'s'],
    ['//sheets.example/unread-parent.css', 'https://www.sheets.example/', 'whose host is its page\'s parent domain'],
    ['//sheets.example/unread-port.css', 'https://sheets.example:8443/', 'which names its page\'s host on another port'],
  ]) {
    await check(`extractCssLinks gives the link ${href} on the page ${page}, which the read gives nothing for and ${what}, as an http or https URL that isValidUrl refuses`, async () => {
      const link = linkOf(unreadFetch, href, page);
      assert.match(String(link), /^https?:\/\//, `gave ${link}`);
      assert.equal(guard.isValidUrl(link), false, `gave ${link}`);
    }, true);
  }
  await check('extractCssLinks resolves the link /unread.css, which the read gives nothing for, against its page', async () => assert.equal(linkOf(unreadFetch, '/unread.css'), 'https://sheets.example/unread.css'));
  await check('safeFetch refuses a redirect to //public.example/unread, which the read gives nothing for, and asks its host nothing', async () => {
    const from = `http://redirect.example/r?to=${encodeURIComponent('//public.example/unread')}`;
    const seen = await requestsDuring(() => assert.rejects(unreadGuard.safeFetch(from), /SSRF guard: blocked URL/));
    assert.deepEqual(seen.filter((r) => hostOf(r) !== 'redirect.example'), [], `the redirect reached ${JSON.stringify(seen)}`);
  }, true);
  await check('safeFetch refuses a redirect to //xredirect.example/unread, which the read gives nothing for and whose host only ends with its page\'s, and asks that host nothing', async () => {
    const from = `http://redirect.example/r?to=${encodeURIComponent('//xredirect.example/unread')}`;
    const seen = await requestsDuring(() => assert.rejects(unreadGuard.safeFetch(from), /SSRF guard: blocked URL/));
    assert.deepEqual(seen.filter((r) => hostOf(r) !== 'redirect.example'), [], `the redirect reached ${JSON.stringify(seen)}`);
  }, true);
  await check('safeFetch refuses a redirect to //sub.redirect.example/unread, which the read gives nothing for and whose host is under its page\'s, and asks that host nothing', async () => {
    const from = `http://redirect.example/r?to=${encodeURIComponent('//sub.redirect.example/unread')}`;
    const seen = await requestsDuring(() => assert.rejects(unreadGuard.safeFetch(from), /SSRF guard: blocked URL/));
    assert.deepEqual(seen.filter((r) => hostOf(r) !== 'redirect.example'), [], `the redirect reached ${JSON.stringify(seen)}`);
  }, true);
  for (const [to, what, host] of [
    ['//www.redirect.example/unread-www', 'whose host is its page\'s under www', 'www.redirect.example'],
    ['//redirect.example./unread-dot', 'whose host is its page\'s with a dot after it', 'redirect.example.'],
  ]) {
    await check(`safeFetch refuses a redirect to ${to}, which the read gives nothing for and ${what}, and asks that host nothing`, async () => {
      const from = `http://redirect.example/r?to=${encodeURIComponent(to)}`;
      const seen = await requestsDuring(() => assert.rejects(unreadGuard.safeFetch(from), /SSRF guard: blocked URL/));
      assert.deepEqual(seen.filter((r) => hostOf(r) === host), [], `the redirect reached ${JSON.stringify(seen)}`);
    }, true);
  }
  await check('safeFetch refuses a redirect from http://www.redirect.example/ to //redirect.example/unread-parent, which the read gives nothing for and whose host is its page\'s parent domain, and asks that host nothing', async () => {
    const from = `http://www.redirect.example/r?to=${encodeURIComponent('//redirect.example/unread-parent')}`;
    const seen = await requestsDuring(() => assert.rejects(unreadGuard.safeFetch(from), /SSRF guard: blocked URL/));
    assert.deepEqual(seen.filter((r) => hostOf(r) !== 'www.redirect.example'), [], `the redirect reached ${JSON.stringify(seen)}`);
  }, true);
  await check('safeFetch refuses a redirect from http://redirect.example:8080/ to //redirect.example/unread-port, which the read gives nothing for and which names its page\'s host on another port, and asks nothing more', async () => {
    const from = `http://redirect.example:8080/r?to=${encodeURIComponent('//redirect.example/unread-port')}`;
    const seen = await requestsDuring(() => assert.rejects(unreadGuard.safeFetch(from), /SSRF guard: blocked URL/));
    assert.equal(seen.length, 1, `the redirect was followed: ${JSON.stringify(seen)}`);
  }, true);
  await check('safeFetch follows a redirect to //redirect.example/unread-same, which the read gives nothing for and which names its page\'s scheme, host and port', async () => {
    const from = `http://redirect.example/r?to=${encodeURIComponent('//redirect.example/unread-same')}`;
    const seen = await requestsDuring(async () => {
      const res = await unreadGuard.safeFetch(from);
      assert.equal(res.status, 200);
      await res.text();
    });
    assert.deepEqual(seen.slice(1), ['redirect.example/unread-same'], JSON.stringify(seen));
  });
  await check('safeFetch refuses a redirect from http://redirect.example/ to https://redirect.example/unread-other, which the read gives nothing for and which names its page\'s host on the other scheme, and asks nothing more', async () => {
    const from = `http://redirect.example/r?to=${encodeURIComponent('https://redirect.example/unread-other')}`;
    const seen = await requestsDuring(() => assert.rejects(unreadGuard.safeFetch(from), /SSRF guard: blocked URL/));
    assert.equal(seen.length, 1, `the redirect was followed: ${JSON.stringify(seen)}`);
  }, true);
  await check('extractCssLinks gives the link http://sheets.example/unread-other.css, which the read gives nothing for and which names its page\'s host on the other scheme, as an http or https URL that isValidUrl refuses', async () => {
    const link = linkOf(unreadFetch, 'http://sheets.example/unread-other.css');
    assert.match(String(link), /^https?:\/\//, `gave ${link}`);
    assert.equal(guard.isValidUrl(link), false, `gave ${link}`);
  }, true);
  for (const [href, isNew] of SHEET_LINKS) {
    await check(`page-fetch reads the page whose one stylesheet is linked as ${show(href)} without that stylesheet`, async () => {
      let page;
      const seen = await requestsDuring(async () => { page = await pageFetch.fetchPageResilient(`https://sheets.example/one/${encodeURIComponent(href)}`); });
      assert.ok(page.html.includes('<h1>One sheet</h1>'), 'no page');
      assert.equal(page.css, '', `css: ${JSON.stringify(page.css)}`);
      assert.deepEqual(seen.filter((s) => hostOf(s) !== 'sheets.example'), [], JSON.stringify(seen));
    }, isNew);
  }
  const bar = loadBar(h);
  // The bar reads a page, a site's home page (the badge) or an origin
  // (readiness): the same hosts are refused whichever it reads.
  for (const [reads, as] of [['page', ''], ['site', ' as a site'], ['origin', ' as an origin']]) {
    for (const [input, ok, isNew] of TYPED_BAR) {
      await check(`the URL bar ${ok ? 'reads' : 'warns on'} ${show(input)}${as}`, async () => {
        const c = bar.checkUrl(input, reads);
        assert.equal(Boolean(c && c.ok), ok, `checkUrl said ${c && c.plain}`);
      }, isNew);
    }
  }
}

async function routeSection(h) {
  console.log('6. every route that reads a URL');
  const forwarded = { 'x-forwarded-for': '203.0.113.9' };
  for (const [file, body] of ROUTES) {
    for (const [url, isNew] of [['0x08080808', true], ['0x7f000001', false]]) {
      await check(`${file} answers ${url} with 400, invalid URL`, async () => {
        let r;
        const seen = await requestsDuring(async () => { r = await h.post(file, body(url), forwarded); });
        assert.equal(r.status, 400, JSON.stringify(r.body).slice(0, 160));
        assert.match(String(r.body && r.body.error), /^Invalid URL/);
        assert.deepEqual(seen.filter((s) => !hostOf(s).endsWith('public.example')), [], 'the route asked the server');
      }, isNew);
    }
  }
  await check('app/api/compare/route.ts answers 0x08080808 as its second URL with 400, invalid URL', async () => {
    let r;
    const seen = await requestsDuring(async () => { r = await h.post('app/api/compare/route.ts', { urlA: 'https://public.example/', urlB: '0x08080808' }, forwarded); });
    assert.equal(r.status, 400, JSON.stringify(r.body).slice(0, 160));
    assert.match(String(r.body && r.body.error), /^Invalid URL/);
    assert.deepEqual(seen.filter((x) => !hostOf(x).endsWith('public.example')), [], 'the route asked the server');
  }, true);
  const badge = h.load('app/lib/badge/live-badge-route.ts');
  await check('the live badge refuses the site 0x08080808', async () => assert.equal(badge.siteOf('0x08080808'), null), true);
  await check('the live badge reads the site 8.8.8.8', async () => assert.equal(badge.siteOf('8.8.8.8'), 'https://8.8.8.8/'));
  let scored = [];
  await check('the score route does not read a stylesheet linked as http://0x08080808/typed.css', async () => {
    let r;
    scored = await requestsDuring(async () => { r = await h.post('app/api/score/route.ts', { url: 'https://sheets.example/', scope: 'universal' }, forwarded); });
    assert.equal(r.status, 200, JSON.stringify(r.body).slice(0, 160));
    assert.deepEqual(scored.filter((s) => hostOf(s) !== 'sheets.example'), [], JSON.stringify(scored));
  }, true);
  await check('the score route reads the page\'s other stylesheet, /kept.css', async () => assert.ok(scored.includes('sheets.example/kept.css'), JSON.stringify(scored)));
  // What the score route found, check by check: its id, status and detail.
  const found = (body) => (body && Array.isArray(body.checks) ? body.checks.map((c) => `${c.id} ${c.status} ${c.detail ?? ''}`) : []);
  let none = [];
  await check('the score route scores sheets.example/none, a page with no stylesheet', async () => {
    const r = await h.post('app/api/score/route.ts', { url: 'https://sheets.example/none', scope: 'universal' }, forwarded);
    assert.equal(r.status, 200, JSON.stringify(r.body).slice(0, 160));
    none = found(r.body);
    assert.ok(none.length > 0, 'no checks');
  });
  for (const [href, isNew] of SHEET_LINKS) {
    await check(`the score route scores the page whose one stylesheet is linked as ${show(href)} as the page with none`, async () => {
      let r;
      const seen = await requestsDuring(async () => { r = await h.post('app/api/score/route.ts', { url: `https://sheets.example/one/${encodeURIComponent(href)}`, scope: 'universal' }, forwarded); });
      assert.equal(r.status, 200, JSON.stringify(r.body).slice(0, 160));
      const got = found(r.body);
      assert.equal(got.length, none.length, 'a different number of checks');
      assert.deepEqual(got.filter((c, i) => c !== none[i]), [], 'the checks differ from the page with none');
      assert.deepEqual(seen.filter((s) => hostOf(s) !== 'sheets.example'), [], JSON.stringify(seen));
    }, isNew);
  }
  await check('the score route reads a stylesheet linked as "\\u00a0//0x08080808/q.css" on its own page, as the URL parser reads that link', async () => {
    let r;
    const seen = await requestsDuring(async () => { r = await h.post('app/api/score/route.ts', { url: `https://sheets.example/one/${encodeURIComponent('\u00a0//0x08080808/q.css')}`, scope: 'universal' }, forwarded); });
    assert.equal(r.status, 200, JSON.stringify(r.body).slice(0, 160));
    assert.ok(seen.includes('sheets.example/one/%C2%A0//0x08080808/q.css'), JSON.stringify(seen));
  });
  await check('the MCP token tool does not fetch http://0x08080808/tokens.json', async () => {
    let out;
    const seen = await requestsDuring(async () => { out = await h.callTool('designesy_tokens_score', { url: 'http://0x08080808/tokens.json' }); });
    assert.deepEqual(seen, []);
    assert.equal(out.result.isError, true);
  }, true);
}

async function main() {
  console.log(`url-guard hosts gate (app: ${path.relative(process.cwd(), APP) || '.'})`);
  // The score route's DESIGN.md check imports an ES module the harness cannot require.
  const { lint } = await import('@google/design.md/linter');
  const makeHarness = (overrides = {}) => createHarness({
    app: APP,
    lookup,
    realSafeFetch: true,
    stubs: {
      'node:http': toLocal(http),
      'node:https': toLocal(require('node:https')),
      '@google/design.md/linter': { lint },
      '@upstash/ratelimit': { Ratelimit: class { static fixedWindow() { return {}; } static slidingWindow() { return {}; } } },
    },
    overrides,
  });
  const h = makeHarness();
  const guard = h.load('app/lib/url-guard.ts');
  const browserGuard = h.load('app/lib/browser-guard.ts');

  await literalSection(guard);
  await resolverSection(guard);
  await pinnedSection(guard);
  await verdictSection(browserGuard);

  // Sections 5 and 6 send their requests to a server of their own.
  const server = http.createServer((req, res) => {
    const host = String(req.headers['x-guard-host'] || '');
    reached.push(host);
    requests.push(`${host}${req.url}`);
    answer(host, req.url, res);
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  PORT = server.address().port;
  try {
    await typedSection(h, guard, browserGuard, makeHarness);
    await routeSection(h);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }

  await check(`nothing left this machine: the stub answered every lookup, and the gate refused ${refusedOffline.length} lookups, queries or connections past loopback`, async () => {
    assert.ok(asked.has('v4compat-loopback.example') && asked.has('pin-public.example'), `asked: ${[...asked.keys()].join(', ')}`);
    assert.deepEqual(refusedOffline, [], `refused: ${refusedOffline.slice(0, 5).join('; ')}`);
  });

  console.log(`\nurl-guard hosts: ${total} checks, ${failures.length} failed (${newFailures.length} of the ${marked} marked new)`);
  if (failures.length) process.exit(1);
  console.log('url-guard hosts: all checks passed');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
