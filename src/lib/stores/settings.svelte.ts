import { load, type Store } from "@tauri-apps/plugin-store";

const STORE_FILE = "settings.json";
const KEY_TERMINAL_HEIGHT = "terminalHeight";

let storePromise: Promise<Store> | null = null;
function getStore() {
  if (!storePromise) storePromise = load(STORE_FILE);
  return storePromise;
}

class SettingsStore {
  terminalHeight = $state(240);

  async load() {
    try {
      const store = await getStore();
      const h = await store.get<number>(KEY_TERMINAL_HEIGHT);
      if (typeof h === "number" && h >= 80 && h <= 4000) {
        this.terminalHeight = h;
      }
    } catch (e) {
      console.error("settings.load failed", e);
    }
  }

  async setTerminalHeight(value: number) {
    this.terminalHeight = value;
    try {
      const store = await getStore();
      await store.set(KEY_TERMINAL_HEIGHT, value);
      await store.save();
    } catch (e) {
      console.error("settings.setTerminalHeight failed", e);
    }
  }
}

export const settings = new SettingsStore();
