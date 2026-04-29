import { SvelteMap } from "svelte/reactivity";
import { vaultApi } from "$lib/api/vault";

class BodiesStore {
  cache = new SvelteMap<string, string>();
  isLoaded = $state(false);
  isLoading = $state(false);
  error = $state<string | null>(null);

  async ensureLoaded(vaultPath: string) {
    if (this.isLoaded || this.isLoading) return;
    this.isLoading = true;
    this.error = null;
    try {
      const all = await vaultApi.readBodies(vaultPath);
      this.cache.clear();
      for (const [path, body] of Object.entries(all)) {
        this.cache.set(path, body);
      }
      this.isLoaded = true;
    } catch (e) {
      this.error = e instanceof Error ? e.message : String(e);
    } finally {
      this.isLoading = false;
    }
  }

  invalidate(path: string) {
    this.cache.delete(path);
  }

  async refresh(path: string) {
    try {
      const body = await vaultApi.readTaskBody(path);
      this.cache.set(path, body);
    } catch (e) {
      console.error("bodies.refresh failed", path, e);
    }
  }

  reset() {
    this.cache.clear();
    this.isLoaded = false;
    this.isLoading = false;
    this.error = null;
  }
}

export const bodies = new BodiesStore();
