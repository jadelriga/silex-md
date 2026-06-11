export interface EdgeResizeOptions {
  axis: "x" | "y";
  startSize: number;
  min: number;
  max: number;
  onResize: (size: number) => void;
  /** Called once on mouseup with the final size, so callers can persist it. */
  onDone: (size: number) => void;
}

/**
 * Drag-resize for a panel anchored to the right ("x") or bottom ("y") edge
 * of the window: the panel grows as the pointer moves toward the origin.
 * Suppresses text selection and forces the resize cursor for the duration
 * of the drag.
 */
export function startEdgeResize(e: MouseEvent, opts: EdgeResizeOptions) {
  e.preventDefault();
  const { axis, startSize, min, max, onResize, onDone } = opts;
  const startPos = axis === "x" ? e.clientX : e.clientY;
  let last = startSize;
  const onMove = (ev: MouseEvent) => {
    const pos = axis === "x" ? ev.clientX : ev.clientY;
    last = Math.max(min, Math.min(max, startSize + (startPos - pos)));
    onResize(last);
  };
  const onUp = () => {
    window.removeEventListener("mousemove", onMove);
    window.removeEventListener("mouseup", onUp);
    document.body.style.userSelect = "";
    document.body.style.cursor = "";
    onDone(last);
  };
  document.body.style.userSelect = "none";
  document.body.style.cursor = axis === "x" ? "ew-resize" : "ns-resize";
  window.addEventListener("mousemove", onMove);
  window.addEventListener("mouseup", onUp);
}
