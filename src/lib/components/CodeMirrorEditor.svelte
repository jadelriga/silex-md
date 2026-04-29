<script lang="ts">
  import { onMount, onDestroy } from "svelte";
  import { EditorState } from "@codemirror/state";
  import { EditorView, drawSelection, highlightActiveLine, keymap } from "@codemirror/view";
  import { defaultKeymap, history, historyKeymap } from "@codemirror/commands";
  import { syntaxHighlighting, defaultHighlightStyle } from "@codemirror/language";
  import { markdown } from "@codemirror/lang-markdown";
  import { oneDark } from "@codemirror/theme-one-dark";
  import { theme } from "$lib/stores/theme.svelte";

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
      syntaxHighlighting(defaultHighlightStyle),
      keymap.of([...defaultKeymap, ...historyKeymap]),
      markdown(),
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
