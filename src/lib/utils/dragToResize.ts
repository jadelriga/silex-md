/**
 * Shared mouse-drag resize bookkeeping for the panel/terminal resize handles.
 * Captures the common window mousemove/mouseup wiring, the `userSelect`/`cursor`
 * body side-effects, and `preventDefault`, so the call sites only describe what
 * differs: the axis, how to clamp the value, how to apply it live during the
 * drag, and how to persist it on release.
 */
export interface ResizeDragOptions {
  /** "x" → horizontal drag (ew-resize), "y" → vertical drag (ns-resize). */
  axis: "x" | "y";
  /** Value (px) at the moment the drag starts. */
  start: number;
  /** Clamp a candidate value to the allowed range. */
  clamp: (value: number) => number;
  /** Apply the value live on each mousemove (reactive update). */
  apply: (value: number) => void;
  /** Persist the final value once on mouseup. */
  commit: (value: number) => void;
}

export function startResizeDrag(e: MouseEvent, opts: ResizeDragOptions): void {
  e.preventDefault();
  const origin = opts.axis === "x" ? e.clientX : e.clientY;
  let last = opts.start;
  const onMove = (ev: MouseEvent) => {
    const current = opts.axis === "x" ? ev.clientX : ev.clientY;
    // Dragging the left/top edge toward the panel's start grows it, matching
    // the original `start - current` delta for both handles.
    last = opts.clamp(opts.start + (origin - current));
    opts.apply(last);
  };
  const onUp = () => {
    window.removeEventListener("mousemove", onMove);
    window.removeEventListener("mouseup", onUp);
    document.body.style.userSelect = "";
    document.body.style.cursor = "";
    opts.commit(last);
  };
  document.body.style.userSelect = "none";
  document.body.style.cursor = opts.axis === "x" ? "ew-resize" : "ns-resize";
  window.addEventListener("mousemove", onMove);
  window.addEventListener("mouseup", onUp);
}
