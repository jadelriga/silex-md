import type { VaultEntry } from "$lib/api/vault";

export interface SearchHit {
  path: string;
  kind: "task" | "note";
  title: string;
  hint: string;
  snippet: string;
}

export function frontmatterText(fm: Record<string, unknown> | null): string {
  if (!fm) return "";
  const parts: string[] = [];
  for (const value of Object.values(fm)) {
    if (typeof value === "string") parts.push(value);
    else if (Array.isArray(value)) {
      for (const v of value) if (typeof v === "string") parts.push(v);
    }
  }
  return parts.join(" ");
}

export function buildSnippet(body: string, query: string, span = 120): string {
  if (!query) return body.slice(0, span).replace(/\s+/g, " ").trim();
  const lower = body.toLowerCase();
  const idx = lower.indexOf(query.toLowerCase());
  if (idx === -1) {
    return body.slice(0, span).replace(/\s+/g, " ").trim();
  }
  const half = Math.floor(span / 2);
  const start = Math.max(0, idx - half);
  const end = Math.min(body.length, idx + query.length + half);
  let snippet = body.slice(start, end).replace(/\s+/g, " ").trim();
  if (start > 0) snippet = "…" + snippet;
  if (end < body.length) snippet = snippet + "…";
  return snippet;
}

export function searchEntries(
  entries: VaultEntry[],
  bodies: Map<string, string>,
  query: string,
  limit = 50,
): SearchHit[] {
  const q = query.trim();
  if (!q) return [];
  const tokens = q.toLowerCase().split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return [];

  const hits: SearchHit[] = [];
  for (const entry of entries) {
    const fm = (entry.frontmatter ?? {}) as Record<string, unknown>;
    const fileName = entry.path.split("/").pop()?.replace(/\.md$/, "") ?? "";
    const title = (fm.title as string) ?? fileName;
    const fmText = frontmatterText(fm);
    const body = bodies.get(entry.path) ?? "";

    const haystack = `${title}\n${fmText}\n${body}`.toLowerCase();
    if (!tokens.every((t) => haystack.includes(t))) continue;

    const hint =
      entry.kind === "task"
        ? `${entry.board ?? ""}${entry.column ? ` / ${entry.column}` : ""}`
        : entry.path;
    hits.push({
      path: entry.path,
      kind: entry.kind === "task" ? "task" : "note",
      title,
      hint,
      snippet: buildSnippet(body || fmText, q),
    });
    if (hits.length >= limit) break;
  }
  return hits;
}
