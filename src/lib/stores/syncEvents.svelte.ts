class SyncEventsStore {
  externalChange = $state<{ path: string; ts: number } | null>(null);
}

export const syncEvents = new SyncEventsStore();
