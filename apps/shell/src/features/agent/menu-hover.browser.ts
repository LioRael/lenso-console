import { expect } from "vitest";
import { page, userEvent } from "vitest/browser";

// Visibility alone does not establish the native mouse-enter and parent
// mouse-move preconditions of a delayed Base UI submenu. Enter from the menu's
// padding after its opening animation, retaining the real hover path.
export async function hoverSubmenu(trigger: Element) {
  const menu = trigger.closest('[role="menu"]');
  if (!(menu instanceof HTMLElement)) {
    throw new Error("Submenu trigger has no rendered parent menu");
  }
  await expect
    .poll(() =>
      menu
        .getAnimations()
        .every((animation) => animation.playState === "finished")
    )
    .toBe(true);
  await userEvent.hover(page.elementLocator(menu), {
    position: { x: 2, y: menu.getBoundingClientRect().height / 2 },
  });
  await expect.poll(() => trigger.matches(":hover")).toBe(false);
  let entered = false;
  const onEnter = (event: Event) => {
    entered = event.isTrusted;
  };
  trigger.addEventListener("mouseenter", onEnter);
  try {
    await userEvent.hover(page.elementLocator(trigger));
    await expect.poll(() => entered && trigger.matches(":hover")).toBe(true);
    await expect
      .element(page.elementLocator(trigger))
      .toHaveAttribute("aria-expanded", "true");
  } finally {
    trigger.removeEventListener("mouseenter", onEnter);
  }
}
