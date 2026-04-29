<script lang="ts">
  import { Marked } from "marked";
  import { theme } from "$lib/stores/theme.svelte";

  let {
    source,
    onToggleCheckbox,
  }: {
    source: string;
    onToggleCheckbox?: (index: number) => void;
  } = $props();

  let checkboxIndex = 0;

  const renderer = new Marked({
    gfm: true,
    breaks: false,
    renderer: {
      checkbox({ checked }: { checked: boolean }) {
        const idx = checkboxIndex++;
        return `<input type="checkbox" ${checked ? "checked" : ""} data-checkbox-index="${idx}">`;
      },
    },
  });

  function parse(src: string): string {
    checkboxIndex = 0;
    return renderer.parse(src) as string;
  }

  const html = $derived(source ? parse(source) : "");

  function handleClick(e: MouseEvent) {
    const target = e.target as HTMLElement;
    if (
      target.tagName === "INPUT" &&
      (target as HTMLInputElement).type === "checkbox"
    ) {
      const idx = target.getAttribute("data-checkbox-index");
      if (idx !== null && onToggleCheckbox) {
        e.preventDefault();
        e.stopPropagation();
        onToggleCheckbox(parseInt(idx, 10));
      }
    }
  }
</script>

<!-- svelte-ignore a11y_click_events_have_key_events -->
<!-- svelte-ignore a11y_no_static_element_interactions -->
<div
  class="prose prose-sm max-w-none p-4 {theme.effective === 'dark' ? 'prose-invert' : ''}"
  onclick={handleClick}
>
  {@html html}
</div>

<style>
  div :global(input[type="checkbox"]) {
    cursor: pointer;
    margin-right: 0.4em;
    accent-color: var(--color-fg-subtle);
  }
</style>
