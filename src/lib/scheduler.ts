import {
  isPermissionGranted,
  requestPermission,
  sendNotification,
} from "@tauri-apps/plugin-notification";
import { tasks } from "$lib/stores/tasks.svelte";
import { reminders } from "$lib/stores/reminders.svelte";
import { vaultApi, type VaultEntry } from "$lib/api/vault";
import { notifyApi } from "$lib/api/notify";
import { vault } from "$lib/stores/vault.svelte";
import { buildTaskContent } from "$lib/utils/yaml";
import { parseRepeat, repeatLabel, nextOccurrence, type Repeat } from "$lib/utils/recur";

const fired = new Set<string>();
let timeoutId: ReturnType<typeof setTimeout> | null = null;

/** ms until the next wall-clock minute boundary. */
export function msUntilNextMinute(nowMs: number): number {
  return 60_000 - (nowMs % 60_000);
}

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

/** Native path first (proper icon + click-to-open on macOS); plugin
 * fallback covers other platforms and dev mode. */
async function notify(title: string, body: string, targetPath: string) {
  try {
    if (await notifyApi.native(title, body, targetPath)) return;
  } catch (e) {
    console.error("notify_native failed; falling back to plugin", e);
  }
  if (await ensurePermission()) sendNotification({ title, body });
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

/**
 * Rewrites a recurring reminder's `reminder` to the next occurrence after
 * `after`. Used both when an occurrence fires (after = now, so a pile of
 * missed occurrences collapses into one catch-up) and by "Skip next
 * occurrence" (after = the scheduled time, so a future occurrence is
 * skipped). Releases the in-session fired guard on success so the next
 * occurrence can fire without a restart.
 */
export async function advanceRecurring(
  entry: VaultEntry,
  repeat: Repeat,
  after: Date,
): Promise<void> {
  try {
    const fm = { ...((entry.frontmatter ?? {}) as Record<string, unknown>) };
    const anchor =
      typeof fm.repeatFrom === "string" && fm.repeatFrom
        ? fm.repeatFrom
        : (fm.reminder as string);
    const next = nextOccurrence(repeat, anchor, after);
    if (!next) return;
    fm.reminder = next;
    // Heal hand-created files that set `repeat` without an anchor.
    if (!fm.repeatFrom) fm.repeatFrom = anchor;
    const body = await vaultApi.readTaskBody(entry.path);
    await reminders.save(entry.path, buildTaskContent(fm, body));
    fired.delete(entry.path);
  } catch (e) {
    // Leave the path in `fired`: better to miss the next occurrence than
    // to re-notify every minute against a file that won't advance.
    console.error("advanceRecurring failed", entry.path, e);
  }
}

/** "Skip next occurrence" — advance past the scheduled time, no notification. */
export async function skipNextOccurrence(entry: VaultEntry): Promise<void> {
  const fm = (entry.frontmatter ?? {}) as Record<string, unknown>;
  const repeat = parseRepeat(fm.repeat);
  if (!repeat) return;
  const scheduled = entryReminderTime(entry);
  const now = new Date();
  const after = scheduled && scheduled.getTime() > now.getTime() ? scheduled : now;
  await advanceRecurring(entry, repeat, after);
}

/** Returns the new path on success so notifications can deep-link to it. */
async function moveReminderToPast(entry: VaultEntry): Promise<string | null> {
  if (!vault.path) return null;
  try {
    const filename = entry.path.split("/").pop();
    if (!filename) return null;
    const newPath = `${vault.path}/reminders/past/${filename}`;
    await vaultApi.movePath(entry.path, newPath, true);
    return newPath;
  } catch (e) {
    console.error("moveReminderToPast failed", entry.path, e);
    return null;
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

  for (const entry of due) {
    const title = entryTitle(entry);
    const fm = (entry.frontmatter ?? {}) as Record<string, unknown>;
    const priority = fm.priority as string | undefined;
    const repeat = entry.kind === "reminder" ? parseRepeat(fm.repeat) : null;
    const parts = [
      ...(priority ? [`Priority: ${priority}`] : []),
      ...(repeat ? [`Repeats ${repeatLabel(repeat)}`] : []),
    ];
    const body = parts.join(" · ");
    fired.add(entry.path);
    if (entry.kind === "task") {
      void notify(title, body, entry.path);
      void clearTaskReminder(entry);
    } else if (repeat) {
      // Recurring: the file stays put, so it is its own click target;
      // advancing past `now` collapses missed occurrences into this one
      // catch-up notification.
      void notify(title, body, entry.path);
      void advanceRecurring(entry, repeat, new Date());
    } else if (entry.kind === "reminder") {
      // Move first: the click target has to be the post-move path.
      const newPath = await moveReminderToPast(entry);
      void notify(title, body, newPath ?? entry.path);
    }
  }
}

export async function runCheckNow() {
  await checkAndNotify();
}

function armNextTick() {
  // Chained timeout re-aligned every tick, so checks land just past the
  // wall-clock minute (":00 sharp") instead of at an arbitrary offset, and
  // OS timer throttling can't accumulate drift.
  timeoutId = setTimeout(async () => {
    await checkAndNotify();
    armNextTick();
  }, msUntilNextMinute(Date.now()) + 50);
}

function onVisibilityChange() {
  // Catch up promptly after sleep/wake or un-hiding instead of waiting for
  // the next (possibly throttled) tick.
  if (!document.hidden) void checkAndNotify();
}

export function startScheduler() {
  stopScheduler();
  void ensurePermission();
  armNextTick();
  document.addEventListener("visibilitychange", onVisibilityChange);
}

export function stopScheduler() {
  if (timeoutId !== null) {
    clearTimeout(timeoutId);
    timeoutId = null;
  }
  document.removeEventListener("visibilitychange", onVisibilityChange);
}

export function _resetSchedulerForTest() {
  fired.clear();
  stopScheduler();
}
