import js from "@eslint/js";
import ts from "typescript-eslint";
import svelte from "eslint-plugin-svelte";
import globals from "globals";

// Flat config (ESLint 10). Conservative baseline: recommended JS + TS + Svelte
// rules, plus a couple of pragmatic relaxations so the first run is signal, not
// noise. Type-aware linting (parserServices) is intentionally NOT enabled — it
// roughly triples lint time and svelte-check already covers type correctness.
export default ts.config(
  js.configs.recommended,
  ...ts.configs.recommended,
  ...svelte.configs.recommended,
  {
    languageOptions: {
      globals: { ...globals.browser, ...globals.node },
    },
  },
  {
    // `<script lang="ts">` and `*.svelte.ts` rune modules need the TS parser.
    files: ["**/*.svelte", "**/*.svelte.ts", "**/*.svelte.js"],
    languageOptions: {
      parserOptions: { parser: ts.parser },
    },
  },
  {
    rules: {
      // Allow intentional throwaways via leading underscore.
      "@typescript-eslint/no-unused-vars": [
        "warn",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_", caughtErrorsIgnorePattern: "^_" },
      ],
      // The app deliberately uses plain string route paths (SPA, no typed
      // resolve() routing); this rule would force churn across every goto()
      // and <a href> for zero benefit here.
      "svelte/no-navigation-without-resolve": "off",
      // Surfaced, not enforced. Converting plain Set/Map to SvelteSet/SvelteMap
      // changes reactivity semantics — a correctness review, not a tooling task.
      "svelte/prefer-svelte-reactivity": "warn",
      // Surfaced, not enforced. Keying these display-only lists risks duplicate-
      // key runtime errors without first auditing each list's data.
      "svelte/require-each-key": "warn",
      // The only {@html} use is SearchOverlay's highlightMatches(), which
      // HTML-escapes its input before wrapping matched tokens in <mark>. Kept
      // visible as a warning so any future {@html} is noticed in review.
      "svelte/no-at-html-tags": "warn",
    },
  },
  {
    ignores: [
      "build/",
      ".svelte-kit/",
      "src-tauri/",
      "static/",
      "src/lib/bindings.ts",
    ],
  },
);
