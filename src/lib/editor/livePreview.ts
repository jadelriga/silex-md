import {
  Decoration,
  type DecorationSet,
  EditorView,
  ViewPlugin,
  type ViewUpdate,
  WidgetType,
} from "@codemirror/view";
import { syntaxTree } from "@codemirror/language";
import { type Extension, type Range } from "@codemirror/state";
import { convertFileSrc } from "@tauri-apps/api/core";

/**
 * Obsidian-style live-preview decorations on top of CodeMirror 6 + Lezer
 * markdown grammar. Decorations are display-only — `state.doc` keeps the
 * raw markdown intact, so saves are byte-perfect by construction.
 *
 * Iter 1 scope: bold, italic, inline code, ATX headings, links, images.
 * Iter 2 scope: GFM task checkboxes (interactive widget), bullet/ordered
 * lists, blockquotes, fenced code blocks (monospace + background, no
 * per-language syntax highlighting yet — that's Phase 7).
 *
 * Cursor proximity is line-based (Obsidian feel): syntax markers reveal
 * for every node that overlaps a line containing any selection range.
 * Checkboxes are an exception — they always render as widgets so the
 * user can click to toggle without first revealing the brackets.
 */

class CheckboxWidget extends WidgetType {
  constructor(
    readonly checked: boolean,
    readonly from: number,
    readonly to: number,
  ) {
    super();
  }

  eq(other: CheckboxWidget): boolean {
    return (
      other.checked === this.checked &&
      other.from === this.from &&
      other.to === this.to
    );
  }

  toDOM(view: EditorView): HTMLElement {
    const input = document.createElement("input");
    input.type = "checkbox";
    input.checked = this.checked;
    input.className = "cm-md-task-checkbox";
    // Prevent the browser's default checked-toggle so we drive the change via
    // a CM6 transaction; that keeps the document and atlas in sync and the
    // edit shows up in the undo history. Also stop propagation: dispatching
    // detaches this element from the DOM (CM6 rebuilds widgets), and the
    // panel's clickOutside handler sees a detached target → "outside" →
    // closes the panel. Stopping propagation is the canonical fix.
    input.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      const next = this.checked ? "[ ]" : "[x]";
      view.dispatch({
        changes: { from: this.from, to: this.to, insert: next },
      });
    });
    return input;
  }

  ignoreEvent(): boolean {
    return false;
  }
}

class ImageWidget extends WidgetType {
  constructor(
    readonly src: string,
    readonly alt: string,
  ) {
    super();
  }

  eq(other: ImageWidget): boolean {
    return other.src === this.src && other.alt === this.alt;
  }

  toDOM(): HTMLElement {
    const img = document.createElement("img");
    img.src = resolveImgSrc(this.src);
    img.alt = this.alt;
    img.className = "cm-md-image";
    return img;
  }

  ignoreEvent(): boolean {
    return false;
  }
}

function resolveImgSrc(src: string): string {
  if (/^https?:\/\//i.test(src) || /^data:/i.test(src)) return src;
  if (src.startsWith("file://")) return convertFileSrc(src.slice("file://".length));
  return convertFileSrc(src);
}

function nodeOverlapsCursorLine(view: EditorView, from: number, to: number): boolean {
  const doc = view.state.doc;
  const fromLine = doc.lineAt(from).number;
  const toLine = doc.lineAt(Math.max(from, to - 1)).number;
  for (const range of view.state.selection.ranges) {
    const headLine = doc.lineAt(range.head).number;
    if (headLine >= fromLine && headLine <= toLine) return true;
    if (range.empty) continue;
    const anchorLine = doc.lineAt(range.anchor).number;
    if (anchorLine >= fromLine && anchorLine <= toLine) return true;
  }
  return false;
}

function buildDecorations(view: EditorView): DecorationSet {
  const decos: Range<Decoration>[] = [];

  for (const { from, to } of view.visibleRanges) {
    syntaxTree(view.state).iterate({
      from,
      to,
      enter: (node) => {
        const cursorNear = nodeOverlapsCursorLine(view, node.from, node.to);

        switch (node.name) {
          case "ATXHeading1":
          case "ATXHeading2":
          case "ATXHeading3":
          case "ATXHeading4":
          case "ATXHeading5":
          case "ATXHeading6": {
            const level = parseInt(node.name.slice("ATXHeading".length), 10);
            decos.push(
              Decoration.mark({ class: `cm-md-heading cm-md-h${level}` }).range(
                node.from,
                node.to,
              ),
            );
            if (!cursorNear) {
              const child = node.node.getChild("HeaderMark");
              if (child) {
                // Also swallow the space after the marker so the rendered text
                // doesn't carry leading whitespace.
                const eatSpace =
                  view.state.doc.sliceString(child.to, child.to + 1) === " " ? 1 : 0;
                decos.push(
                  Decoration.replace({}).range(child.from, child.to + eatSpace),
                );
              }
            }
            break;
          }

          case "StrongEmphasis":
          case "Emphasis": {
            const cls = node.name === "StrongEmphasis" ? "cm-md-bold" : "cm-md-italic";
            decos.push(Decoration.mark({ class: cls }).range(node.from, node.to));
            if (!cursorNear) {
              for (const mark of node.node.getChildren("EmphasisMark")) {
                decos.push(Decoration.replace({}).range(mark.from, mark.to));
              }
            }
            break;
          }

          case "InlineCode": {
            decos.push(
              Decoration.mark({ class: "cm-md-inline-code" }).range(node.from, node.to),
            );
            if (!cursorNear) {
              for (const mark of node.node.getChildren("CodeMark")) {
                decos.push(Decoration.replace({}).range(mark.from, mark.to));
              }
            }
            break;
          }

          case "Link": {
            // Lezer Link: `[` LinkMark, link text, `]` LinkMark, `(` LinkMark, URL, `)` LinkMark.
            const marks = node.node.getChildren("LinkMark");
            const urlNode = node.node.getChild("URL");
            if (cursorNear) {
              // Reveal: dim the URL portion so it's distinguishable but readable.
              if (urlNode) {
                decos.push(
                  Decoration.mark({ class: "cm-md-link-url" }).range(
                    urlNode.from,
                    urlNode.to,
                  ),
                );
              }
            } else if (marks.length >= 4) {
              // Hide: replace `[`, `]`, `(`, URL, `)` with empty; mark text as link.
              decos.push(Decoration.replace({}).range(marks[0].from, marks[0].to));
              decos.push(Decoration.replace({}).range(marks[1].from, marks[1].to));
              const urlSpanStart = marks[2].from;
              const urlSpanEnd = marks[3].to;
              decos.push(Decoration.replace({}).range(urlSpanStart, urlSpanEnd));
              const textFrom = marks[0].to;
              const textTo = marks[1].from;
              if (textFrom < textTo) {
                decos.push(
                  Decoration.mark({ class: "cm-md-link" }).range(textFrom, textTo),
                );
              }
            }
            break;
          }

          case "Image": {
            if (cursorNear) {
              decos.push(
                Decoration.mark({ class: "cm-md-image-source" }).range(node.from, node.to),
              );
            } else {
              const text = view.state.doc.sliceString(node.from, node.to);
              const m = /^!\[([^\]]*)\]\(([^)]+)\)$/.exec(text);
              if (m) {
                decos.push(
                  Decoration.replace({
                    widget: new ImageWidget(m[2], m[1]),
                  }).range(node.from, node.to),
                );
              }
            }
            break;
          }

          case "Task": {
            // Lezer GFM Task wraps a list item with a TaskMarker child for the
            // `[ ]`/`[x]` brackets. Always render as a widget regardless of
            // cursor proximity — toggling is the common operation and the
            // user can still edit list-item content around it normally.
            const marker = node.node.getChild("TaskMarker");
            if (marker) {
              const text = view.state.doc.sliceString(marker.from, marker.to);
              const checked = /\[x\]/i.test(text);
              decos.push(
                Decoration.replace({
                  widget: new CheckboxWidget(checked, marker.from, marker.to),
                }).range(marker.from, marker.to),
              );
            }
            break;
          }

          case "ListMark": {
            // The `-`, `*`, `+`, or `1.` marker. Just dim it; don't replace.
            decos.push(
              Decoration.mark({ class: "cm-md-list-mark" }).range(node.from, node.to),
            );
            break;
          }

          case "Blockquote": {
            // Mark the whole node so we can give it a left border + indent
            // via CSS. The `>` markers stay visible (we style them subtly
            // through the QuoteMark case below).
            decos.push(
              Decoration.mark({ class: "cm-md-blockquote" }).range(node.from, node.to),
            );
            break;
          }

          case "QuoteMark": {
            decos.push(
              Decoration.mark({ class: "cm-md-quote-mark" }).range(node.from, node.to),
            );
            break;
          }

          case "FencedCode": {
            // Per-line decorations so consecutive lines visually merge into a
            // single code-block box (vs Decoration.mark which renders each
            // line as its own inline rectangle). When the cursor is outside
            // the block, also hide the opening/closing fence lines so the
            // ``` markers don't take up space.
            const doc = view.state.doc;
            const startLine = doc.lineAt(node.from).number;
            const endLine = doc.lineAt(node.to - 1).number;

            if (!cursorNear) {
              decos.push(
                Decoration.line({ class: "cm-md-fenced-hide" }).range(
                  doc.line(startLine).from,
                ),
              );
              if (endLine !== startLine) {
                decos.push(
                  Decoration.line({ class: "cm-md-fenced-hide" }).range(
                    doc.line(endLine).from,
                  ),
                );
              }
            }

            const visibleStart = cursorNear ? startLine : startLine + 1;
            const visibleEnd = cursorNear ? endLine : endLine - 1;
            for (let n = visibleStart; n <= visibleEnd; n++) {
              const line = doc.line(n);
              const classes = ["cm-md-fenced-line"];
              if (n === visibleStart) classes.push("cm-md-fenced-first");
              if (n === visibleEnd) classes.push("cm-md-fenced-last");
              decos.push(
                Decoration.line({ class: classes.join(" ") }).range(line.from),
              );
            }
            break;
          }

          case "CodeInfo": {
            // Language tag after the opening ``` (e.g. `python`). oneDark
            // tints this a dark blue that's nearly invisible on our
            // surface-2 code-block background; mark with our own class.
            decos.push(
              Decoration.mark({ class: "cm-md-code-info" }).range(node.from, node.to),
            );
            break;
          }
        }
      },
    });
  }

  return Decoration.set(decos, true);
}

export const livePreview: Extension = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;

    constructor(view: EditorView) {
      this.decorations = buildDecorations(view);
    }

    update(update: ViewUpdate) {
      if (update.docChanged || update.selectionSet || update.viewportChanged) {
        this.decorations = buildDecorations(update.view);
      }
    }
  },
  {
    decorations: (v) => v.decorations,
  },
);
