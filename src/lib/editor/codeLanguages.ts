import { LanguageDescription } from "@codemirror/language";
import { languages as catalog } from "@codemirror/language-data";

/**
 * Curated list of languages we ship for fenced-code syntax highlighting.
 * `@codemirror/language-data`'s catalog covers ~80 languages, but each
 * entry's `load()` does an `import("@codemirror/lang-<name>")` — so a
 * language only works if we've also installed its package. We filter to
 * the ones we actually have, plus a custom entry for Elixir (which isn't
 * in the official catalog).
 *
 * Adding more: install `@codemirror/lang-<name>` (or a community package)
 * and add the identifier to `enabledIds` (or push a new LanguageDescription).
 */
const enabledIds = new Set([
  "javascript",
  "typescript",
  "tsx",
  "jsx",
  "json",
  "python",
  "shell",
  "bash",
  "sh",
  "zsh",
  "html",
  "css",
  "sql",
  "yaml",
  "yml",
  "markdown",
  "md",
]);

const fromCatalog = catalog.filter((l) => {
  const ids = [l.name, ...l.alias].map((s) => s.toLowerCase());
  return ids.some((id) => enabledIds.has(id));
});

const elixir = LanguageDescription.of({
  name: "Elixir",
  alias: ["elixir", "exs", "ex"],
  extensions: ["ex", "exs"],
  load: () => import("codemirror-lang-elixir").then((m) => m.elixir()),
});

export const codeLanguages = [...fromCatalog, elixir];
