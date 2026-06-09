import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { clickOutside } from "./clickOutside";

// jsdom has no PointerEvent constructor; listeners match on the type string,
// so a MouseEvent with type "pointerdown" is equivalent for these tests.
function press(target: Element) {
  target.dispatchEvent(new MouseEvent("pointerdown", { bubbles: true }));
}
function click(target: Element) {
  target.dispatchEvent(new MouseEvent("click", { bubbles: true }));
}

describe("clickOutside", () => {
  let panel: HTMLElement;
  let outside: HTMLElement;
  let callback: ReturnType<typeof vi.fn<() => void>>;
  let action: ReturnType<typeof clickOutside>;

  beforeEach(() => {
    panel = document.createElement("div");
    outside = document.createElement("div");
    outside.className = "elsewhere";
    document.body.append(panel, outside);
    callback = vi.fn<() => void>();
    action = clickOutside(panel, { callback });
  });

  afterEach(() => {
    action.destroy?.();
    panel.remove();
    outside.remove();
  });

  it("fires when a click both starts and ends outside", () => {
    press(outside);
    click(outside);
    expect(callback).toHaveBeenCalledOnce();
  });

  it("does not fire for clicks inside the node", () => {
    press(panel);
    click(panel);
    expect(callback).not.toHaveBeenCalled();
  });

  it("does not fire when a selection drag starts inside and releases outside", () => {
    // Browsers dispatch the click on the common ancestor (body) when
    // mousedown/mouseup targets differ — exactly the text-selection case.
    press(panel);
    click(document.body);
    expect(callback).not.toHaveBeenCalled();
  });

  it("fires again on the next genuine outside click after a selection drag", () => {
    press(panel);
    click(document.body); // selection drag — swallowed
    press(outside);
    click(outside);
    expect(callback).toHaveBeenCalledOnce();
  });

  it("respects the ignore selector", () => {
    action.update?.({ callback, ignore: ".elsewhere" });
    press(outside);
    click(outside);
    expect(callback).not.toHaveBeenCalled();
  });
});
