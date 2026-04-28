export async function sha256Hex(content: string): Promise<string> {
  const bytes = new TextEncoder().encode(content);
  const buf = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}
