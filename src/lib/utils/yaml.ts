import { dump as yamlDump } from "js-yaml";

export function buildTaskContent(frontmatter: Record<string, unknown>, body: string): string {
  const yaml = yamlDump(frontmatter, { lineWidth: -1, noRefs: true });
  const cleanBody = body.replace(/^\n+/, "");
  return `---\n${yaml}---\n${cleanBody}`;
}
