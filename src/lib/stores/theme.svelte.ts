import { load, type Store } from "@tauri-apps/plugin-store";
import { getCurrentWindow } from "@tauri-apps/api/window";

export type ThemePref = "system" | "light" | "dark";
export type ThemeEffective = "light" | "dark";

const STORE_FILE = "settings.json";
const KEY = "themePref";

let storePromise: Promise<Store> | null = null;
function getStore() {
  if (!storePromise) storePromise = load(STORE_FILE);
  return storePromise;
}

function systemDark(): boolean {
  if (typeof window === "undefined") return true;
  return window.matchMedia("(prefers-color-scheme: dark)").matches;
}

class ThemeStore {
  pref = $state<ThemePref>("system");
  systemPrefersDark = $state(true);

  effective = $derived<ThemeEffective>(
    this.pref === "system" ? (this.systemPrefersDark ? "dark" : "light") : this.pref,
  );

  async load() {
    if (typeof window !== "undefined") {
      this.systemPrefersDark = systemDark();
      window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", (e) => {
        this.systemPrefersDark = e.matches;
      });
    }
    try {
      const store = await getStore();
      const saved = await store.get<ThemePref>(KEY);
      if (saved === "system" || saved === "light" || saved === "dark") {
        this.pref = saved;
      }
    } catch (e) {
      console.error("theme.load failed", e);
    }
  }

  async setPref(pref: ThemePref) {
    this.pref = pref;
    try {
      const store = await getStore();
      await store.set(KEY, pref);
      await store.save();
    } catch (e) {
      console.error("theme.setPref failed", e);
    }
  }

  applyToDocument() {
    if (typeof document === "undefined") return;
    const isLight = this.effective === "light";
    document.documentElement.classList.toggle("theme-light", isLight);
    void getCurrentWindow()
      .setTheme(this.effective)
      .catch(() => {});
  }
}

export const theme = new ThemeStore();
