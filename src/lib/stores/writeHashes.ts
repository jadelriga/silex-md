// Tracks hash of bytes most recently written per path, so the watcher can tell own writes from external edits.
class WriteHashStore {
  private hashes = new Map<string, string>();

  set(path: string, hash: string): void {
    this.hashes.set(path, hash);
  }

  get(path: string): string | undefined {
    return this.hashes.get(path);
  }

  matches(path: string, hash: string): boolean {
    return this.hashes.get(path) === hash;
  }

  delete(path: string): void {
    this.hashes.delete(path);
  }

  clear(): void {
    this.hashes.clear();
  }
}

export const writeHashes = new WriteHashStore();
