<script lang="ts">
  import { ui } from "$lib/stores/ui.svelte";
  import { theme, type ThemePref } from "$lib/stores/theme.svelte";
  import { revealItemInDir } from "@tauri-apps/plugin-opener";
  import { appDataDir, join } from "@tauri-apps/api/path";

  let revealError = $state<string | null>(null);
  let revealing = $state(false);

  function close() {
    ui.settingsOpen = false;
  }

  function onKey(e: KeyboardEvent) {
    if (e.key === "Escape") {
      e.preventDefault();
      close();
    }
  }

  async function pickTheme(pref: ThemePref) {
    await theme.setPref(pref);
  }

  async function reveal() {
    if (revealing) return;
    revealing = true;
    revealError = null;
    try {
      const dir = await appDataDir();
      const path = await join(dir, "settings.json");
      await revealItemInDir(path);
    } catch (e) {
      revealError = e instanceof Error ? e.message : String(e);
    } finally {
      revealing = false;
    }
  }

  const themes: { value: ThemePref; label: string }[] = [
    { value: "system", label: "Use system" },
    { value: "light", label: "Light" },
    { value: "dark", label: "Dark" },
  ];
</script>

{#if ui.settingsOpen}
  <!-- svelte-ignore a11y_click_events_have_key_events -->
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div
    class="fixed inset-0 z-[55] flex items-center justify-center bg-backdrop backdrop-blur-sm"
    onclick={(e) => {
      if (e.target === e.currentTarget) close();
    }}
  >
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div
      class="w-[32rem] max-w-[90vw] rounded-lg border border-border bg-surface-1 shadow-2xl"
      onkeydown={onKey}
    >
      <div class="flex items-center justify-between px-6 py-4 border-b border-border">
        <h2 class="text-lg font-semibold text-fg">Settings</h2>
        <button
          type="button"
          onclick={close}
          aria-label="Close settings"
          class="text-fg-muted hover:text-fg"
        >
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            class="w-5 h-5"
          >
            <path d="M6 6 L18 18 M18 6 L6 18" stroke-linecap="round" />
          </svg>
        </button>
      </div>

      <div class="px-6 py-5 space-y-6">
        <section>
          <h3 class="text-xs uppercase tracking-wide text-fg-subtle mb-2">Appearance</h3>
          <div class="space-y-1">
            {#each themes as opt (opt.value)}
              <label
                class="flex items-center gap-3 px-2 py-1.5 rounded hover:bg-surface-2/60 cursor-pointer"
              >
                <input
                  type="radio"
                  name="theme"
                  value={opt.value}
                  checked={theme.pref === opt.value}
                  onchange={() => pickTheme(opt.value)}
                  class="accent-accent"
                />
                <span class="text-sm text-fg">{opt.label}</span>
              </label>
            {/each}
          </div>
        </section>

        <section>
          <h3 class="text-xs uppercase tracking-wide text-fg-subtle mb-2">Settings file</h3>
          <p class="text-sm text-fg-muted leading-relaxed">
            Settings are stored as JSON in the app data directory. You can hand-edit the file if you
            want — Silex will pick up the changes the next time it loads.
          </p>
          <button
            type="button"
            onclick={reveal}
            disabled={revealing}
            class="mt-3 px-3 py-1.5 rounded text-sm bg-surface-2 text-fg hover:bg-surface-3 disabled:opacity-50"
          >
            {revealing ? "Opening…" : "Reveal in Finder"}
          </button>
          {#if revealError}
            <p class="mt-2 text-xs text-red-400 break-words">{revealError}</p>
          {/if}
        </section>
      </div>
    </div>
  </div>
{/if}
