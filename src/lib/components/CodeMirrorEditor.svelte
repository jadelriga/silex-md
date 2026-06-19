<script lang="ts">
  import { onMount, onDestroy } from "svelte";
  import { EditorState } from "@codemirror/state";
  import { EditorView, drawSelection, highlightActiveLine, keymap } from "@codemirror/view";
  import { defaultKeymap, history, historyKeymap, indentWithTab } from "@codemirror/commands";
  import { syntaxHighlighting } from "@codemirror/language";
  import { markdown, markdownLanguage } from "@codemirror/lang-markdown";
  import { oneDark } from "@codemirror/theme-one-dark";
  import { theme } from "$lib/stores/theme.svelte";
  import { vault } from "$lib/stores/vault.svelte";
  import { vaultApi } from "$lib/api/vault";
  import { imageContext, livePreview } from "$lib/editor/livePreview";
  import { codeLanguages } from "$lib/editor/codeLanguages";
  import { darkHighlight, lightHighlight } from "$lib/editor/highlight";

  let {
    value,
    onChange,
    path,
  }: {
    value: string;
    onChange?: (next: string) => void;
    path: string;
  } = $props();

  let container: HTMLDivElement;
  let view: EditorView | null = null;
  let suppressOnChange = false;

  function mimeToExt(mime: string): string {
    switch (mime) {
      case "image/png":
        return "png";
      case "image/jpeg":
        return "jpg";
      case "image/gif":
        return "gif";
      case "image/webp":
        return "webp";
      case "image/svg+xml":
        return "svg";
      default:
        return "png";
    }
  }

  async function handlePastedImages(items: DataTransferItem[], view: EditorView) {
    const vaultPath = vault.path;
    if (!vaultPath) return;
    // Sequential on purpose: each insert advances the selection so multiple
    // pasted images land one after another instead of overlapping.
    for (const item of items) {
      const file = item.getAsFile();
      if (!file) continue;
      const name = `pasted-${Date.now()}.${mimeToExt(item.type)}`;
      try {
        const bytes = await file.arrayBuffer();
        const mdPath = await vaultApi.saveAttachment(vaultPath, name, bytes);
        const insert = `![](${mdPath})`;
        const { from, to } = view.state.selection.main;
        view.dispatch({
          changes: { from, to, insert },
          selection: { anchor: from + insert.length },
        });
        // The dispatch fires the updateListener → onChange → the caller's
        // existing debounced autosave persists the markdown.
      } catch (e) {
        console.error("paste image failed", e);
      }
    }
  }

  onMount(() => {
    const extensions = [
      history(),
      drawSelection(),
      highlightActiveLine(),
      keymap.of([...defaultKeymap, ...historyKeymap, indentWithTab]),
      markdown({ base: markdownLanguage, codeLanguages }),
      // Getter closure so image resolution always sees the current file +
      // vault without reconfiguring the editor when props change: a file
      // switch replaces the doc, which rebuilds decorations.
      imageContext.of(() => ({ notePath: path, vaultRoot: vault.path ?? "" })),
      livePreview,
      EditorView.domEventHandlers({
        paste(event, view) {
          const items = event.clipboardData?.items;
          if (!items) return false;
          const images = Array.from(items).filter(
            (it) => it.kind === "file" && it.type.startsWith("image/"),
          );
          if (images.length === 0) return false; // normal text paste proceeds
          event.preventDefault();
          void handlePastedImages(images, view);
          return true;
        },
      }),
      EditorView.lineWrapping,
      EditorView.updateListener.of((u) => {
        if (u.docChanged && !suppressOnChange) {
          onChange?.(u.state.doc.toString());
        }
      }),
    ];
    if (theme.effective === "dark") {
      extensions.push(oneDark);
    }
    // Custom highlight style added LAST so its tag colours win over oneDark's
    // built-in highlight in dark mode and over CM6's default in light mode.
    extensions.push(
      syntaxHighlighting(theme.effective === "dark" ? darkHighlight : lightHighlight),
    );
    view = new EditorView({
      state: EditorState.create({ doc: value, extensions }),
      parent: container,
    });
  });

  onDestroy(() => {
    view?.destroy();
    view = null;
  });

  $effect(() => {
    if (!view) return;
    if (view.state.doc.toString() === value) return;
    suppressOnChange = true;
    view.dispatch({
      changes: { from: 0, to: view.state.doc.length, insert: value },
    });
    suppressOnChange = false;
  });
</script>

<div bind:this={container} class="h-full overflow-auto"></div>

<style>
  div :global(.cm-editor) {
    height: 100%;
  }
  div :global(.cm-scroller) {
    font-family: ui-monospace, "SF Mono", Menlo, monospace;
    font-size: 13px;
  }
</style>
