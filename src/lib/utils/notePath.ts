import type { VaultEntry } from "$lib/api/vault";

export function noteRelativePath(absolutePath: string, vaultPath: string): string {
  const prefix = vaultPath.endsWith("/") ? vaultPath : vaultPath + "/";
  return absolutePath.startsWith(prefix)
    ? absolutePath.slice(prefix.length)
    : absolutePath;
}

export function noteHref(relativePath: string): string {
  const segments = relativePath.split("/").map(encodeURIComponent).join("/");
  return `/notes/${segments}`;
}

export function decodeNoteRouteParam(routeParam: string): string {
  return routeParam.split("/").map(decodeURIComponent).join("/");
}

export type NoteTreeNode =
  | { type: "file"; name: string; relativePath: string; absolutePath: string }
  | { type: "folder"; name: string; relativePath: string; children: NoteTreeNode[] };

export function buildNoteTree(notes: VaultEntry[], vaultPath: string): NoteTreeNode[] {
  const root: NoteTreeNode[] = [];
  for (const note of notes) {
    const rel = noteRelativePath(note.path, vaultPath);
    if (!rel) continue;
    const parts = rel.split("/");
    insertNote(root, parts, note.path, []);
  }
  sortTree(root);
  return root;
}

function insertNote(
  tree: NoteTreeNode[],
  segments: string[],
  absolutePath: string,
  prefix: string[],
): void {
  if (segments.length === 0) return;
  const [head, ...rest] = segments;
  if (rest.length === 0) {
    tree.push({
      type: "file",
      name: head.replace(/\.md$/, ""),
      relativePath: [...prefix, head].join("/"),
      absolutePath,
    });
    return;
  }
  let folder = tree.find((n) => n.type === "folder" && n.name === head);
  if (!folder || folder.type !== "folder") {
    folder = {
      type: "folder",
      name: head,
      relativePath: [...prefix, head].join("/"),
      children: [],
    };
    tree.push(folder);
  }
  insertNote(folder.children, rest, absolutePath, [...prefix, head]);
}

function sortTree(tree: NoteTreeNode[]): void {
  tree.sort((a, b) => {
    if (a.type !== b.type) return a.type === "folder" ? -1 : 1;
    return a.name.localeCompare(b.name);
  });
  for (const node of tree) {
    if (node.type === "folder") sortTree(node.children);
  }
}
