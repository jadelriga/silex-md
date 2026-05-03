<script lang="ts">
  import { onMount, onDestroy } from "svelte";
  import { EditorState } from "@codemirror/state";
  import { EditorView, drawSelection, highlightActiveLine, keymap } from "@codemirror/view";
  import { defaultKeymap, history, historyKeymap, indentWithTab } from "@codemirror/commands";
  import { syntaxHighlighting } from "@codemirror/language";
  import { markdown, markdownLanguage } from "@codemirror/lang-markdown";
  import { oneDark } from "@codemirror/theme-one-dark";
  import { theme } from "$lib/stores/theme.svelte";
  import { livePreview } from "$lib/editor/livePreview";
  import { codeLanguages } from "$lib/editor/codeLanguages";
  import { darkHighlight, lightHighlight } from "$lib/editor/highlight";

  let {
    value,
    onChange,
  }: {
    value: string;
    onChange?: (next: string) => void;
  } = $props();

  let container: HTMLDivElement;
  let view: EditorView | null = null;
  let suppressOnChange = false;

  onMount(() => {
    const extensions = [
      history(),
      drawSelection(),
      highlightActiveLine(),
      keymap.of([...defaultKeymap, ...historyKeymap, indentWithTab]),
      markdown({ base: markdownLanguage, codeLanguages }),
      livePreview,
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
