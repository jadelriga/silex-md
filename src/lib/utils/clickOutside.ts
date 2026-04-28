export interface ClickOutsideOptions {
  callback: () => void;
  ignore?: string;
}

export function clickOutside(node: HTMLElement, options: ClickOutsideOptions) {
  let opts = options;

  const handler = (e: MouseEvent) => {
    const target = e.target as Element | null;
    if (!target) return;
    if (node.contains(target)) return;
    if (opts.ignore && target.closest(opts.ignore)) return;
    opts.callback();
  };

  document.addEventListener("click", handler);
  return {
    update(next: ClickOutsideOptions) {
      opts = next;
    },
    destroy() {
      document.removeEventListener("click", handler);
    },
  };
}
