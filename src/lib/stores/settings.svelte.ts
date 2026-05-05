import { load, type Store } from "@tauri-apps/plugin-store";

const STORE_FILE = "settings.json";
const KEY_TERMINAL_HEIGHT = "terminalHeight";
const KEY_TASK_PANEL_WIDTH = "taskPanelWidth";

let storePromise: Promise<Store> | null = null;
function getStore() {
  if (!storePromise) storePromise = load(STORE_FILE);
  return storePromise;
}

class SettingsStore {
  terminalHeight = $state(240);
  taskPanelWidth = $state(640);

  async load() {
    try {
      const store = await getStore();
      const h = await store.get<number>(KEY_TERMINAL_HEIGHT);
      if (typeof h === "number" && h >= 80 && h <= 4000) {
        this.terminalHeight = h;
      }
      const w = await store.get<number>(KEY_TASK_PANEL_WIDTH);
      if (typeof w === "number" && w >= 320 && w <= 4000) {
        this.taskPanelWidth = w;
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

  async setTaskPanelWidth(value: number) {
    this.taskPanelWidth = value;
    try {
      const store = await getStore();
      await store.set(KEY_TASK_PANEL_WIDTH, value);
      await store.save();
    } catch (e) {
      console.error("settings.setTaskPanelWidth failed", e);
    }
  }
}

export const settings = new SettingsStore();
