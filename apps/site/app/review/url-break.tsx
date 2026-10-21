import type { ReactNode } from 'react';

const URL_PATTERN = /(https?:\/\/[^\s]+)/;

/**
 * A URL inside a line of copy, set as code that breaks only at its own
 * slashes: a <wbr> after "//" and after every "/". On a phone a re-run step
 * read "Open" alone on one line, the whole URL on the next and the rest on a
 * third, because the URL was one unbreakable word; now "Open https://" fills
 * the first line at 390px and the address carries on, broken at a slash.
 *
 * Each <wbr> is aria-hidden. It adds no character to what a reader sees or
 * copies, but Chrome reads it as a space in the accessible name: the row was
 * named "Open https:// www.designesy.org/ labs/ poise" (Chrome 155). Hidden,
 * the name reads the URL as it is shown. CSS cannot break only at the slashes:
 * overflow-wrap: anywhere still leaves "Open" alone at 390px, and
 * word-break: break-all splits the address mid-word ("htt" / "ps://").
 */
export function withUrl(text: string): ReactNode {
  const parts = text.split(URL_PATTERN);
  if (parts.length === 1) return text;
  return parts.map((part, i) =>
    i % 2 === 1 ? (
      <code key={i} className="row-url">
        {breakAtSlashes(part)}
      </code>
    ) : (
      part
    ),
  );
}

function breakAtSlashes(url: string): ReactNode[] {
  const scheme = url.match(/^https?:\/\//)?.[0] ?? '';
  const out: ReactNode[] = [scheme, <wbr key="scheme" aria-hidden="true" />];
  url
    .slice(scheme.length)
    .split('/')
    .forEach((segment, i, all) => {
      out.push(segment);
      if (i < all.length - 1) out.push('/', <wbr key={i} aria-hidden="true" />);
    });
  return out;
}
