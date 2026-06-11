import { describe, it, expect } from "vitest";
import { startEdgeResize } from "./panelResize";

function mouse(type: string, x = 0, y = 0) {
  return new MouseEvent(type, { clientX: x, clientY: y });
}

function start(axis: "x" | "y", at: { x?: number; y?: number }) {
  const sizes: number[] = [];
  let done: number | null = null;
  startEdgeResize(mouse("mousedown", at.x ?? 0, at.y ?? 0), {
    axis,
    startSize: 400,
    min: 320,
    max: 800,
    onResize: (s) => sizes.push(s),
    onDone: (s) => (done = s),
  });
  return { sizes, getDone: () => done };
}

describe("startEdgeResize", () => {
  it("grows as the pointer moves toward the origin (x axis)", () => {
    const { sizes, getDone } = start("x", { x: 500 });
    window.dispatchEvent(mouse("mousemove", 450));
    window.dispatchEvent(mouse("mouseup"));
    expect(sizes).toEqual([450]);
    expect(getDone()).toBe(450);
  });

  it("grows as the pointer moves toward the origin (y axis)", () => {
    const { sizes } = start("y", { y: 600 });
    window.dispatchEvent(mouse("mousemove", 0, 530));
    window.dispatchEvent(mouse("mouseup"));
    expect(sizes).toEqual([470]);
  });

  it("clamps to min and max", () => {
    const { sizes } = start("x", { x: 500 });
    window.dispatchEvent(mouse("mousemove", 10)); // 400 + 490 → clamp 800
    window.dispatchEvent(mouse("mousemove", 990)); // 400 - 490 → clamp 320
    window.dispatchEvent(mouse("mouseup"));
    expect(sizes).toEqual([800, 320]);
  });

  it("reports the start size when no move happened", () => {
    const { getDone } = start("x", { x: 500 });
    window.dispatchEvent(mouse("mouseup"));
    expect(getDone()).toBe(400);
  });

  it("stops tracking and restores body styles after mouseup", () => {
    const { sizes } = start("x", { x: 500 });
    expect(document.body.style.userSelect).toBe("none");
    expect(document.body.style.cursor).toBe("ew-resize");
    window.dispatchEvent(mouse("mouseup"));
    expect(document.body.style.userSelect).toBe("");
    expect(document.body.style.cursor).toBe("");
    window.dispatchEvent(mouse("mousemove", 450));
    expect(sizes).toEqual([]);
  });
});
