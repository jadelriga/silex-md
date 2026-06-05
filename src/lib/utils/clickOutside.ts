export interface ClickOutsideOptions {
  callback: () => void;
  ignore?: string;
}

export function clickOutside(node: HTMLElement, options: ClickOutsideOptions) {
  let opts = options;
  let pressedInside = false;

  // Track where the gesture *started*. Selecting text that begins inside the
  // node often ends with the mouse released outside it; the browser then
  // dispatches the click on the common ancestor (outside the node), which
  // would close the panel mid-selection. Capture phase so handlers that
  // stopPropagation can't hide the press from us.
  const onPointerDown = (e: Event) => {
    const target = e.target as Element | null;
    pressedInside = !!target && node.contains(target);
  };

  const handler = (e: MouseEvent) => {
    const startedInside = pressedInside;
    pressedInside = false;
    if (startedInside) return;
    const target = e.target as Element | null;
    if (!target) return;
    if (node.contains(target)) return;
    if (opts.ignore && target.closest(opts.ignore)) return;
    opts.callback();
  };

  document.addEventListener("pointerdown", onPointerDown, true);
  document.addEventListener("click", handler);
  return {
    update(next: ClickOutsideOptions) {
      opts = next;
    },
    destroy() {
      document.removeEventListener("pointerdown", onPointerDown, true);
      document.removeEventListener("click", handler);
    },
  };
}
