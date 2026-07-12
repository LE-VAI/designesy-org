import Link from 'next/link';

type CheckItem = {
  title: string;
  meta?: string;
  href?: string;
  avoid?: boolean;
};

function pad(n: number) {
  return String(n).padStart(2, '0');
}

/**
 * Tight interactive checklist grid for long uniform lists.
 * Prefer this over .row-stack when items are peer checks/labels (6+).
 * Keep .row-stack for sequential narrative links.
 */
export function CheckGrid({
  items,
  dense = false,
  className = '',
  start = 1,
}: {
  items: CheckItem[];
  dense?: boolean;
  className?: string;
  start?: number;
}) {
  return (
    <div
      className={`check-grid${dense ? ' is-dense' : ''}${className ? ` ${className}` : ''}`}
      role="list"
    >
      {items.map((item, i) => {
        const index = pad(start + i);
        const body = (
          <>
            <span className="check-cell-index" aria-hidden="true">
              {index}
            </span>
            <span className="check-cell-body">
              <span className="check-cell-title">{item.title}</span>
              {item.meta ? (
                <span className="check-cell-meta">{item.meta}</span>
              ) : null}
            </span>
          </>
        );

        if (item.href) {
          return (
            <Link
              key={`${item.href}-${item.title}`}
              href={item.href}
              className={`check-cell${item.avoid ? ' is-avoid' : ''}`}
              role="listitem"
              data-cuelume-hover="whisper"
              data-cuelume-press
              data-cuelume-release
            >
              {body}
            </Link>
          );
        }

        return (
          <div
            key={`${index}-${item.title}`}
            className={`check-cell${item.avoid ? ' is-avoid' : ''}`}
            role="listitem"
            data-cuelume-hover="whisper"
            data-cuelume-press
            data-cuelume-release
          >
            {body}
          </div>
        );
      })}
    </div>
  );
}

export function checkItemsFromStrings(
  values: readonly string[],
  opts?: { avoid?: boolean; hrefs?: Record<string, string> },
): CheckItem[] {
  return values.map((title) => ({
    title,
    avoid: opts?.avoid,
    href: opts?.hrefs?.[title],
  }));
}

export type { CheckItem };
