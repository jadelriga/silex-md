import { vaultApi, type BoardLayout } from "$lib/api/vault";

class BoardsStore {
  list = $state<BoardLayout[]>([]);
  isLoaded = $state(false);
  error = $state<string | null>(null);

  async load(vaultPath: string) {
    try {
      this.list = await vaultApi.listBoards(vaultPath);
      this.error = null;
    } catch (e) {
      this.error = e instanceof Error ? e.message : String(e);
      this.list = [];
    } finally {
      this.isLoaded = true;
    }
  }
}

export const boards = new BoardsStore();
