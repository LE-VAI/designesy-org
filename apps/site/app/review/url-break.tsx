import type { ReactNode } from 'react';

const URL_PATTERN = /(https?:\/\/[^\s]+)/;

/**
 * A URL inside a line of copy, set as code that breaks only at its own
 * slashes: a <wbr> after "//" and after every "/". On a phone a re-run step
 * read "Open" alone on one line, the whole URL on the next and the rest on a
 * third, because the URL was one unbreakable word; now "Open
 * https://www.designesy.org/" fills the first line and the path carries on.
 * The text content (the row's accessible name, and anything copied) is
 * unchanged: <wbr> adds a break opportunity, never a character.
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
  const out: ReactNode[] = [scheme, <wbr key="scheme" />];
  url
    .slice(scheme.length)
    .split('/')
    .forEach((segment, i, all) => {
      out.push(segment);
      if (i < all.length - 1) out.push('/', <wbr key={i} />);
    });
  return out;
}
