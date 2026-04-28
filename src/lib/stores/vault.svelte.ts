import { load, type Store } from "@tauri-apps/plugin-store";

const STORE_FILE = "settings.json";
const KEY_VAULT_PATH = "vaultPath";

let storePromise: Promise<Store> | null = null;
function getStore() {
  if (!storePromise) storePromise = load(STORE_FILE);
  return storePromise;
}

class VaultStore {
  path = $state<string | null>(null);
  isLoaded = $state(false);

  async load() {
    try {
      const store = await getStore();
      const path = await store.get<string>(KEY_VAULT_PATH);
      this.path = path ?? null;
    } catch (e) {
      console.error("vault.load failed", e);
      this.path = null;
    } finally {
      this.isLoaded = true;
    }
  }

  async set(path: string) {
    const store = await getStore();
    await store.set(KEY_VAULT_PATH, path);
    await store.save();
    this.path = path;
  }

  async clear() {
    const store = await getStore();
    await store.delete(KEY_VAULT_PATH);
    await store.save();
    this.path = null;
  }
}

export const vault = new VaultStore();
