/** Board name from a `/boards/<name>[/...]` pathname, else null. */
export function activeBoardFromPathname(pathname: string): string | null {
  if (!pathname.startsWith("/boards/")) return null;
  return decodeURIComponent(pathname.slice("/boards/".length).split("/")[0]);
}

export function basename(p: string): string {
  return p.split("/").filter(Boolean).pop() ?? p;
}
