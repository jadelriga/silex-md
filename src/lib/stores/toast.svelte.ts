/**
 * Tiny singleton toast store. Show a one-shot message that auto-dismisses.
 * Mounted via <Toast /> in +layout.svelte.
 */
class ToastStore {
  message = $state<string | null>(null);
  private nonce = 0;

  show(msg: string, durationMs = 2000) {
    this.message = msg;
    const id = ++this.nonce;
    setTimeout(() => {
      // Only clear if no newer toast has replaced ours.
      if (this.nonce === id) this.message = null;
    }, durationMs);
  }
}

export const toast = new ToastStore();
