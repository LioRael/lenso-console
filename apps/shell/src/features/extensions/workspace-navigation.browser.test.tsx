import { createElement } from "react";
import { flushSync } from "react-dom";
import { createRoot } from "react-dom/client";
import { expect, test, vi } from "vitest";
import { page, userEvent } from "vitest/browser";

import type { PageProps } from "../../../../../packages/console-authoring/src/index";
import {
  Link,
  WorkspaceScope,
} from "../../../../../packages/console-authoring/src/navigation";

// SSR cannot verify native anchor activation. Keyboard activation must use the
// current instance; modified clicks/downloads must preserve browser defaults.
test("workspace Link keeps keyboard navigation and native anchor behavior per instance", async () => {
  const go = vi.fn();
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  const render = (instance: string) => {
    const value = {
      navigation: {
        go,
        href: (segments: readonly string[]) =>
          `/${instance}/${segments.join("/")}/`,
      },
    } as unknown as PageProps;
    flushSync(() =>
      root.render(
        createElement(
          WorkspaceScope,
          { value },
          createElement(Link, { to: ["details"] }, "Details"),
          createElement(Link, { to: ["details"], download: "" }, "Download")
        )
      )
    );
  };
  try {
    render("one");
    const anchor = container.querySelector("a");
    if (!anchor) {
      throw new Error("Expected Details link");
    }
    expect(anchor.getAttribute("href")).toBe("/one/details/");
    anchor.focus();
    await userEvent.keyboard("{Enter}");
    expect(go).toHaveBeenLastCalledWith(["details"]);
    expect(go).toHaveBeenCalledTimes(1);
    for (const modifier of [
      "ctrlKey",
      "metaKey",
      "shiftKey",
      "altKey",
    ] as const) {
      const event = new MouseEvent("click", {
        bubbles: true,
        cancelable: true,
        [modifier]: true,
      });
      // Capture after React's handler, then suppress actual browser navigation.
      let prevented: boolean | undefined;
      const suppress = (click: Event) => {
        prevented = click.defaultPrevented;
        click.preventDefault();
      };
      document.addEventListener("click", suppress, { once: true });
      anchor.dispatchEvent(event);
      expect(prevented).toBe(false);
    }
    expect(go).toHaveBeenCalledTimes(1);
    const [, download] = container.querySelectorAll("a");
    if (!download) {
      throw new Error("Expected download link");
    }
    let downloadPrevented: boolean | undefined;
    document.addEventListener(
      "click",
      (event) => {
        downloadPrevented = event.defaultPrevented;
        event.preventDefault();
      },
      { once: true }
    );
    download.dispatchEvent(
      new MouseEvent("click", { bubbles: true, cancelable: true })
    );
    expect(downloadPrevented).toBe(false);
    render("two");
    expect(container.querySelector("a")?.getAttribute("href")).toBe(
      "/two/details/"
    );
    await page.getByRole("link", { name: "Details", exact: true }).click();
    expect(go).toHaveBeenCalledTimes(2);
  } finally {
    root.unmount();
    container.remove();
  }
});
