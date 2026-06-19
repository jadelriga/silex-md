import type { VaultEntry } from "$lib/api/vault";

export interface SearchHit {
  path: string;
  kind: "task" | "note";
  title: string;
  hint: string;
  snippet: string;
}

export type Priority = "low" | "medium" | "high";
export type ReminderRange = "overdue" | "today" | "this-week" | "none";

export interface SearchFilters {
  board?: string;
  kind?: "task" | "note";
  priorities?: Priority[]; // OR — entry's priority matches any of these
  tags?: string[]; // AND — entry has all of these tags
  reminderRange?: ReminderRange;
}

export function hasActiveFilters(f: SearchFilters | undefined): boolean {
  if (!f) return false;
  return Boolean(
    f.board ||
    f.kind ||
    (f.priorities && f.priorities.length > 0) ||
    (f.tags && f.tags.length > 0) ||
    f.reminderRange,
  );
}

function matchesReminderRange(
  reminder: string | undefined,
  range: ReminderRange,
  now: number = Date.now(),
): boolean {
  if (range === "none") return !reminder;
  if (!reminder) return false;
  const t = new Date(reminder).getTime();
  if (Number.isNaN(t)) return false;
  if (range === "overdue") return t < now;
  const dayStart = new Date(now);
  dayStart.setHours(0, 0, 0, 0);
  const dayEnd = new Date(dayStart);
  dayEnd.setDate(dayEnd.getDate() + 1);
  if (range === "today") {
    return t >= dayStart.getTime() && t < dayEnd.getTime();
  }
  if (range === "this-week") {
    const weekEnd = new Date(dayStart);
    weekEnd.setDate(weekEnd.getDate() + 7);
    return t >= now && t < weekEnd.getTime();
  }
  return false;
}

export function matchesFilters(entry: VaultEntry, f: SearchFilters): boolean {
  if (f.board && entry.board !== f.board) return false;
  if (f.kind && entry.kind !== f.kind) return false;
  const fm = (entry.frontmatter ?? {}) as Record<string, unknown>;
  if (f.priorities && f.priorities.length > 0) {
    const p = fm.priority as string | undefined;
    if (!p || !f.priorities.includes(p as Priority)) return false;
  }
  if (f.tags && f.tags.length > 0) {
    const entryTags = (fm.tags as string[] | undefined) ?? [];
    if (!f.tags.every((t) => entryTags.includes(t))) return false;
  }
  if (f.reminderRange) {
    const reminder = fm.reminder as string | undefined;
    if (!matchesReminderRange(reminder, f.reminderRange)) return false;
  }
  return true;
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

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => {
    switch (c) {
      case "&":
        return "&amp;";
      case "<":
        return "&lt;";
      case ">":
        return "&gt;";
      case '"':
        return "&quot;";
      case "'":
        return "&#39;";
      default:
        return c;
    }
  });
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Wrap each occurrence of any query token in `text` with `<mark class="search-hit">`.
 * Matches are case-insensitive. The returned string is HTML-escaped — render with
 * `{@html ...}` in the consumer.
 */
export function highlightMatches(text: string, tokens: string[]): string {
  const cleaned = tokens.map((t) => t.trim()).filter(Boolean);
  if (cleaned.length === 0) return escapeHtml(text);
  // Sort by length desc so "foobar" wins over "foo" if both are in the query.
  const sorted = [...cleaned].sort((a, b) => b.length - a.length);
  const re = new RegExp(`(${sorted.map(escapeRegExp).join("|")})`, "gi");
  let out = "";
  let lastIndex = 0;
  for (const match of text.matchAll(re)) {
    const start = match.index ?? 0;
    out += escapeHtml(text.slice(lastIndex, start));
    out += `<mark class="search-hit">${escapeHtml(match[0])}</mark>`;
    lastIndex = start + match[0].length;
  }
  out += escapeHtml(text.slice(lastIndex));
  return out;
}

/** Tokens used both for filtering and highlighting — single source of truth. */
export function queryTokens(query: string): string[] {
  return query.trim().toLowerCase().split(/\s+/).filter(Boolean);
}

export function searchEntries(
  entries: VaultEntry[],
  bodies: Map<string, string>,
  query: string,
  filters: SearchFilters = {},
  limit = 50,
): SearchHit[] {
  const q = query.trim();
  const filtersActive = hasActiveFilters(filters);
  if (!q && !filtersActive) return [];

  const tokens = q ? q.toLowerCase().split(/\s+/).filter(Boolean) : [];

  const hits: SearchHit[] = [];
  for (const entry of entries) {
    if (!matchesFilters(entry, filters)) continue;

    const fm = (entry.frontmatter ?? {}) as Record<string, unknown>;
    const fileName = entry.path.split("/").pop()?.replace(/\.md$/, "") ?? "";
    const title = (fm.title as string) ?? fileName;
    const fmText = frontmatterText(fm);
    const body = bodies.get(entry.path) ?? "";

    if (tokens.length > 0) {
      const haystack = `${title}\n${fmText}\n${body}`.toLowerCase();
      if (!tokens.every((t) => haystack.includes(t))) continue;
    }

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
