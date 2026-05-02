import {
  isPermissionGranted,
  requestPermission,
  sendNotification,
} from "@tauri-apps/plugin-notification";
import { tasks } from "$lib/stores/tasks.svelte";
import { reminders } from "$lib/stores/reminders.svelte";
import { vaultApi, type VaultEntry } from "$lib/api/vault";
import { vault } from "$lib/stores/vault.svelte";
import { buildTaskContent } from "$lib/utils/yaml";

const NOTIFY_INTERVAL_MS = 60 * 1000;

const fired = new Set<string>();
let intervalId: ReturnType<typeof setInterval> | null = null;

export function entryReminderTime(entry: VaultEntry): Date | null {
  const fm = (entry.frontmatter ?? {}) as Record<string, unknown>;
  const r = fm.reminder;
  if (typeof r !== "string" || !r) return null;
  const d = new Date(r);
  if (isNaN(d.getTime())) return null;
  return d;
}

export function remindersDueAtOrBefore(
  entries: Iterable<VaultEntry>,
  now: Date,
  alreadyFired: Set<string>,
): VaultEntry[] {
  const out: VaultEntry[] = [];
  for (const entry of entries) {
    if (alreadyFired.has(entry.path)) continue;
    const at = entryReminderTime(entry);
    if (!at) continue;
    if (at.getTime() <= now.getTime()) out.push(entry);
  }
  return out;
}

async function ensurePermission(): Promise<boolean> {
  const granted = await isPermissionGranted();
  if (granted) return true;
  const res = await requestPermission();
  return res === "granted";
}

function entryTitle(entry: VaultEntry): string {
  const fm = (entry.frontmatter ?? {}) as Record<string, unknown>;
  const fileName = entry.path.split("/").pop()?.replace(/\.md$/, "") ?? "";
  return (fm.title as string) ?? fileName;
}

async function clearTaskReminder(entry: VaultEntry): Promise<void> {
  if (!vault.path) return;
  try {
    const body = await vaultApi.readTaskBody(entry.path);
    const fm = { ...((entry.frontmatter ?? {}) as Record<string, unknown>) };
    delete fm.reminder;
    fm.updated = new Date().toISOString().slice(0, 10);
    const content = buildTaskContent(fm, body);
    await tasks.save(entry.path, content);
  } catch (e) {
    console.error("clearTaskReminder failed", entry.path, e);
  }
}

async function moveReminderToPast(entry: VaultEntry): Promise<void> {
  if (!vault.path) return;
  try {
    const filename = entry.path.split("/").pop();
    if (!filename) return;
    const newPath = `${vault.path}/reminders/past/${filename}`;
    await vaultApi.movePath(entry.path, newPath, true);
  } catch (e) {
    console.error("moveReminderToPast failed", entry.path, e);
  }
}

function isPastReminder(entry: VaultEntry): boolean {
  if (!vault.path) return false;
  return entry.path.startsWith(`${vault.path}/reminders/past/`);
}

function collectAllRemindable(): VaultEntry[] {
  const out: VaultEntry[] = [];
  for (const t of tasks.entries.values()) out.push(t);
  for (const r of reminders.entries.values()) {
    if (!isPastReminder(r)) out.push(r);
  }
  return out;
}

async function checkAndNotify() {
  const due = remindersDueAtOrBefore(collectAllRemindable(), new Date(), fired);
  if (due.length === 0) return;

  const hasPerm = await ensurePermission();
  if (!hasPerm) return;

  for (const entry of due) {
    const title = entryTitle(entry);
    const fm = (entry.frontmatter ?? {}) as Record<string, unknown>;
    const priority = fm.priority as string | undefined;
    sendNotification({
      title,
      body: priority ? `Priority: ${priority}` : "",
    });
    fired.add(entry.path);
    if (entry.kind === "task") void clearTaskReminder(entry);
    else if (entry.kind === "reminder") void moveReminderToPast(entry);
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
  fired.clear();
  stopScheduler();
}
