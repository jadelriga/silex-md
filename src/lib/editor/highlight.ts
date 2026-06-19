import { HighlightStyle } from "@codemirror/language";
import { tags as t } from "@lezer/highlight";

/**
 * Custom syntax highlight palettes for the editor. Replaces oneDark's
 * built-in highlight style so we can pick higher-contrast colours.
 *
 * Palette intent (dark): saturated, mid-bright tones similar to Tokyo
 * Night — keywords purple, strings green, numbers/atoms orange,
 * functions blue, types cyan, comments dim italic.
 * Light: same hues, deeper variants tuned for white backgrounds.
 */

export const darkHighlight = HighlightStyle.define([
  // Keywords + control flow
  { tag: [t.keyword, t.controlKeyword, t.operatorKeyword, t.modifier], color: "#bb9af7" },
  { tag: t.definitionKeyword, color: "#bb9af7" },

  // Strings + regex
  { tag: [t.string, t.special(t.string), t.regexp], color: "#9ece6a" },
  { tag: t.escape, color: "#7aa2f7" },

  // Numbers, booleans, null, atoms (Elixir :ok), special values
  { tag: [t.number, t.bool, t.null, t.atom], color: "#ff9e64" },

  // Function names
  { tag: [t.function(t.variableName), t.function(t.propertyName)], color: "#7aa2f7" },
  { tag: t.definition(t.function(t.variableName)), color: "#7aa2f7", fontWeight: "600" },

  // Variables and properties
  { tag: t.variableName, color: "#c0caf5" },
  { tag: t.propertyName, color: "#7dcfff" },
  { tag: t.attributeName, color: "#bb9af7" },
  { tag: t.attributeValue, color: "#9ece6a" },

  // Types, classes, namespaces
  { tag: [t.typeName, t.className, t.namespace], color: "#2ac3de" },

  // HTML/XML tags
  { tag: t.tagName, color: "#f7768e" },

  // Comments
  {
    tag: [t.comment, t.lineComment, t.blockComment, t.docComment],
    color: "#7d8aa6",
    fontStyle: "italic",
  },

  // Operators and punctuation — readable, not loud
  {
    tag: [
      t.operator,
      t.derefOperator,
      t.compareOperator,
      t.arithmeticOperator,
      t.logicOperator,
      t.bitwiseOperator,
      t.updateOperator,
    ],
    color: "#89ddff",
  },
  {
    tag: [t.punctuation, t.bracket, t.angleBracket, t.brace, t.paren, t.squareBracket],
    color: "#a9b1d6",
  },
  { tag: t.separator, color: "#c0caf5" },

  // Markdown-ish (only relevant if md is parsed inside fenced ```md)
  { tag: [t.heading, t.strong], color: "#bb9af7", fontWeight: "700" },
  { tag: t.emphasis, color: "#bb9af7", fontStyle: "italic" },
  { tag: [t.link, t.url], color: "#7aa2f7", textDecoration: "underline" },

  // Errors
  { tag: t.invalid, color: "#f7768e" },
]);

export const lightHighlight = HighlightStyle.define([
  { tag: [t.keyword, t.controlKeyword, t.operatorKeyword, t.modifier], color: "#8839ef" },
  { tag: t.definitionKeyword, color: "#8839ef" },

  { tag: [t.string, t.special(t.string), t.regexp], color: "#40a02b" },
  { tag: t.escape, color: "#1e66f5" },

  { tag: [t.number, t.bool, t.null, t.atom], color: "#fe640b" },

  { tag: [t.function(t.variableName), t.function(t.propertyName)], color: "#1e66f5" },
  { tag: t.definition(t.function(t.variableName)), color: "#1e66f5", fontWeight: "600" },

  { tag: t.variableName, color: "#4c4f69" },
  { tag: t.propertyName, color: "#04a5e5" },
  { tag: t.attributeName, color: "#8839ef" },
  { tag: t.attributeValue, color: "#40a02b" },

  { tag: [t.typeName, t.className, t.namespace], color: "#179299" },
  { tag: t.tagName, color: "#d20f39" },

  {
    tag: [t.comment, t.lineComment, t.blockComment, t.docComment],
    color: "#8c8fa1",
    fontStyle: "italic",
  },

  {
    tag: [
      t.operator,
      t.derefOperator,
      t.compareOperator,
      t.arithmeticOperator,
      t.logicOperator,
      t.bitwiseOperator,
      t.updateOperator,
    ],
    color: "#04a5e5",
  },
  {
    tag: [t.punctuation, t.bracket, t.angleBracket, t.brace, t.paren, t.squareBracket],
    color: "#6c6f85",
  },
  { tag: t.separator, color: "#4c4f69" },

  { tag: [t.heading, t.strong], color: "#8839ef", fontWeight: "700" },
  { tag: t.emphasis, color: "#8839ef", fontStyle: "italic" },
  { tag: [t.link, t.url], color: "#1e66f5", textDecoration: "underline" },

  { tag: t.invalid, color: "#d20f39" },
]);
