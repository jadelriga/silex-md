import type { VaultEntry } from "$lib/api/vault";

export function compareOrder(a: string | null | undefined, b: string | null | undefined): number {
  if (a == null && b == null) return 0;
  if (a == null) return 1;
  if (b == null) return -1;
  return a < b ? -1 : a > b ? 1 : 0;
}

export function getOrder(entry: VaultEntry): string | null {
  const fm = (entry.frontmatter ?? {}) as Record<string, unknown>;
  const o = fm.order;
  return typeof o === "string" ? o : null;
}

export function sortCards<T extends VaultEntry>(cards: T[]): T[] {
  return [...cards].sort((a, b) => {
    const cmp = compareOrder(getOrder(a), getOrder(b));
    if (cmp !== 0) return cmp;
    return a.path.localeCompare(b.path);
  });
}
