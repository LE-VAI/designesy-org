// app/lib/typed-host.ts
//
// The host of a URL as it was typed, read the way the URL parser reads it up
// to the point where the parser can rewrite a host typed as a number. The
// URL parser can read such a host as an IPv4 address and write it as four
// decimal parts, so a check of new URL(x).hostname cannot tell how it was
// typed. The URL guard (url-guard.ts, and the browser audit's check in
// browser-guard.ts) and the URL bar's hint (engine/command-bar.tsx) read the
// host here, so they refuse the same hosts: a host typed as a number in any
// form other than four decimal parts, and a host that cannot be read here.
//
// No Node import: the URL bar runs this in the browser.

/** An IPv4 address as the URL Standard writes one: four decimal parts, no leading zeros. */
export const FOUR_DECIMAL_PARTS = /^(?:(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)\.){3}(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)$/;

/** `host` without the dots at its end. */
export function withoutTrailingDots(host: string): string {
  let end = host.length;
  while (end > 0 && host[end - 1] === '.') end--;
  return host.slice(0, end);
}

/**
 * Whether `host` ends in a number: its last label, once every trailing dot
 * is dropped, is decimal digits, or 0x followed by hex digits. Only the last
 * label counts.
 */
export function endsInANumber(host: string): boolean {
  const labels = withoutTrailingDots(host).split('.');
  return /^(?:\d+|0x[0-9a-f]*)$/i.test(labels[labels.length - 1]);
}

/**
 * True when `host` ends in a number and is not written as four decimal
 * parts: one number, a hex or octal part, a leading zero, or fewer or more
 * than four parts. Every trailing dot is dropped first, so four decimal
 * parts and dots are four decimal parts.
 */
export function isOtherNumericForm(host: string): boolean {
  return endsInANumber(host) && !FOUR_DECIMAL_PARTS.test(withoutTrailingDots(host));
}

/** Schemes the URL Standard calls special that name a network host. */
const NETWORK_SCHEMES = new Set(['ftp', 'http', 'https', 'ws', 'wss']);

/** The scheme of `url` (no colon), or null when it does not parse. */
function schemeOf(url: string): string | null {
  try {
    return new URL(url).protocol.slice(0, -1);
  } catch {
    return null;
  }
}

/** `s` without the C0 controls and spaces at its start and end, as the URL parser drops them. */
function trimControlsAndSpaces(s: string): string {
  let from = 0;
  let to = s.length;
  while (from < to && s.charCodeAt(from) <= 0x20) from++;
  while (to > from && s.charCodeAt(to - 1) <= 0x20) to--;
  return s.slice(from, to);
}

/**
 * The host `input` names, read as the URL parser reads it. `base`, when
 * given, is the URL `input` is resolved against: a redirect's Location
 * against the URL that answered, a link against its page.
 *
 * The steps are the URL Standard's. The C0 controls and spaces at the start
 * and end are dropped, and every tab and newline is removed. The authority
 * starts after the scheme's colon and any run of slashes and backslashes;
 * with no scheme, or against a base of the same scheme, only when two of
 * them come first. It ends at the next slash, backslash, question mark or
 * number sign. The host is what follows its last @ (the userinfo), up to
 * the first colon outside brackets (the port). The host is then read by
 * readHost.
 *
 * Null when `input` names no host of its own (a scheme other than ftp,
 * http, https, ws or wss, or a path, query or fragment resolved against
 * `base`), or when readHost cannot read its host. An IPv6 address is
 * given as typed, in its brackets.
 */
export function typedHost(input: string, base?: string): string | null {
  const s = trimControlsAndSpaces(input).replace(/[\t\n\r]/g, '');
  const scheme = /^([a-z][a-z\d+\-.]*):/i.exec(s);
  let rest = s;
  if (scheme) {
    const name = scheme[1].toLowerCase();
    if (!NETWORK_SCHEMES.has(name)) return null;
    rest = s.slice(scheme[0].length);
    if (base !== undefined && schemeOf(base) === name && !/^[/\\]{2}/.test(rest)) return null;
  } else if (base === undefined || !NETWORK_SCHEMES.has(schemeOf(base) ?? '') || !/^[/\\]{2}/.test(rest)) {
    return null;
  }
  const authority = rest.replace(/^[/\\]+/, '').split(/[/\\?#]/, 1)[0];
  const host = authority.slice(authority.lastIndexOf('@') + 1);
  let end = host.length;
  let inBrackets = false;
  for (let i = 0; i < host.length; i++) {
    if (host[i] === '[') inBrackets = true;
    else if (host[i] === ']') inBrackets = false;
    else if (host[i] === ':' && !inBrackets) {
      end = i;
      break;
    }
  }
  const typed = host.slice(0, end);
  if (typed.startsWith('[')) return typed.toLowerCase();
  return readHost(typed);
}

/** A character outside ASCII, or a percent-escape of a byte outside it. */
const OUTSIDE_ASCII = /[\u0080-\uffff]|%[89a-f][0-9a-f]/i;

/** Whether `host` has an empty label other than one at its end. */
function hasEmptyLabel(host: string): boolean {
  const labels = host.split('.');
  if (labels[labels.length - 1] === '') labels.pop();
  return labels.includes('');
}

/**
 * `raw`, a host as typed, read as the URL parser reads a host before it
 * decides whether the host is an IPv4 address: percent-escapes decoded, IDNA
 * mapping applied (fullwidth digits and letters to ASCII, ideographic full
 * stops to dots), and lowercased. The URL parser does the reading itself: a
 * last label that is not a number (x) is put after the host, so the parser
 * reads the whole as a name, and that label is taken off again. Null when
 * the parser refuses the host, or when `raw` holds a character that would
 * end a host (/ \ ? # @ :) or a bracket. Null too when `raw` holds a
 * character outside ASCII, or a percent-escape of one, and the host it reads
 * has an empty label other than one at its end: the URL parser reads such a
 * host, and a strict IDNA reading, which refuses an empty label, does not.
 */
export function readHost(raw: string): string | null {
  if (/[/\\?#@:[\]]/.test(raw)) return null;
  if (raw === '') return '';
  let read: string;
  try {
    read = new URL(`http://${raw}.x/`).hostname;
  } catch {
    return null;
  }
  if (!read.endsWith('.x')) return null;
  read = read.slice(0, -2);
  return OUTSIDE_ASCII.test(raw) && hasEmptyLabel(read) ? null : read;
}
