import {
  isPermissionGranted,
  requestPermission,
  sendNotification,
} from "@tauri-apps/plugin-notification";
import { tasks } from "$lib/stores/tasks.svelte";
import type { VaultEntry } from "$lib/api/vault";

const NOTIFY_INTERVAL_MS = 15 * 60 * 1000;

const notified = new Set<string>();
let intervalId: ReturnType<typeof setInterval> | null = null;

export function todayIso(now: Date = new Date()): string {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function dueTodayUnnotified(
  entries: Iterable<VaultEntry>,
  today: string,
  alreadyNotified: Set<string>,
): VaultEntry[] {
  const out: VaultEntry[] = [];
  for (const entry of entries) {
    const fm = (entry.frontmatter ?? {}) as Record<string, unknown>;
    const due = fm.due;
    if (typeof due !== "string") continue;
    if (due !== today) continue;
    if (alreadyNotified.has(entry.path)) continue;
    out.push(entry);
  }
  return out;
}

async function ensurePermission(): Promise<boolean> {
  const granted = await isPermissionGranted();
  if (granted) return true;
  const res = await requestPermission();
  return res === "granted";
}

async function checkAndNotify() {
  const due = dueTodayUnnotified(tasks.entries.values(), todayIso(), notified);
  if (due.length === 0) return;

  const hasPerm = await ensurePermission();
  if (!hasPerm) return;

  for (const entry of due) {
    const fm = (entry.frontmatter ?? {}) as Record<string, unknown>;
    const fileName = entry.path.split("/").pop()?.replace(/\.md$/, "") ?? "";
    const title = (fm.title as string) ?? fileName;
    const priority = fm.priority as string | undefined;
    sendNotification({
      title: `Due today: ${title}`,
      body: priority ? `Priority: ${priority}` : "",
    });
    notified.add(entry.path);
  }
}

export async function runCheckNow() {
  await checkAndNotify();
}

export function startScheduler() {
  stopScheduler();
  void ensurePermission();
  intervalId = setInterval(() => void checkAndNotify(), NOTIFY_INTERVAL_MS);
}

export function stopScheduler() {
  if (intervalId !== null) {
    clearInterval(intervalId);
    intervalId = null;
  }
}

export function _resetSchedulerForTest() {
  notified.clear();
  stopScheduler();
}
