const CHECKBOX_RE = /^(\s*[-*]\s\[)([ xX])(\].*)$/;

export function toggleCheckboxAtIndex(body: string, index: number): string {
  const lines = body.split("\n");
  let count = 0;
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(CHECKBOX_RE);
    if (!m) continue;
    if (count === index) {
      const next = m[2].toLowerCase() === "x" ? " " : "x";
      lines[i] = `${m[1]}${next}${m[3]}`;
      return lines.join("\n");
    }
    count++;
  }
  return body;
}
