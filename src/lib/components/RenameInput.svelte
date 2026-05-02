<script lang="ts">
  import { onMount, tick } from "svelte";

  let {
    initialValue,
    placeholder = "",
    selectExt = false,
    onSubmit,
    onCancel,
  }: {
    initialValue: string;
    placeholder?: string;
    selectExt?: boolean;
    onSubmit: (value: string) => void | Promise<void>;
    onCancel: () => void;
  } = $props();

  // svelte-ignore state_referenced_locally
  let value = $state(initialValue);
  let error = $state<string | null>(null);
  let inputEl = $state<HTMLInputElement | undefined>();
  let submitting = $state(false);
  let cancelled = $state(false);

  // svelte-ignore state_referenced_locally
  const initialDot = selectExt ? -1 : initialValue.lastIndexOf(".");

  onMount(() => {
    void tick().then(() => {
      if (!inputEl) return;
      inputEl.focus();
      if (initialDot > 0) inputEl.setSelectionRange(0, initialDot);
      else inputEl.select();
    });
  });

  async function submit() {
    if (cancelled || submitting) return;
    const trimmed = value.trim();
    if (!trimmed) {
      cancelled = true;
      onCancel();
      return;
    }
    if (trimmed === initialValue) {
      cancelled = true;
      onCancel();
      return;
    }
    submitting = true;
    error = null;
    try {
      await onSubmit(trimmed);
    } catch (e) {
      error = e instanceof Error ? e.message : String(e);
      submitting = false;
      tick().then(() => inputEl?.focus());
    }
  }

  function cancel() {
    if (cancelled) return;
    cancelled = true;
    onCancel();
  }

  function onKey(e: KeyboardEvent) {
    if (e.key === "Enter") {
      e.preventDefault();
      submit();
    } else if (e.key === "Escape") {
      e.preventDefault();
      cancel();
    }
  }
</script>

<div class="px-2 py-1">
  <input
    bind:this={inputEl}
    bind:value
    {placeholder}
    onkeydown={onKey}
    onblur={() => {
      if (!error) submit();
    }}
    disabled={submitting}
    autocomplete="off"
    autocorrect="off"
    autocapitalize="off"
    spellcheck="false"
    class="w-full bg-surface-2 border border-border-strong rounded px-2 py-1 text-xs text-fg outline-none placeholder:text-fg-faint disabled:opacity-50"
  />
  {#if error}
    <p class="mt-1 text-xs text-red-400 break-words">{error}</p>
  {/if}
</div>
