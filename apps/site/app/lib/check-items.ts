type CheckItem = {
  title: string;
  meta?: string;
  href?: string;
  avoid?: boolean;
  status?: string;
};

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
