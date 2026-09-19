import { createElement, use } from "react";
import { flushSync } from "react-dom";
import { createRoot } from "react-dom/client";
import { expect, test, vi } from "vitest";
import { page } from "vitest/browser";

import { createPageRouter } from "../../../packages/console-convention/router";
import type { PageProps } from "../../../packages/console-sdk/src/index";

test("directory boundaries compose layouts, suspend, recover errors and reset on navigation", async () => {
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  const errorLog = vi.spyOn(console, "error").mockImplementation(() => {});
  let shouldThrow = true;
  let finish!: (value: string) => void;
  const pending = new Promise<string>((resolve) => {
    finish = resolve;
  });
  const Page = createPageRouter(
    [
      {
        segments: [],
        Page: () => {
          if (shouldThrow) {
            throw new Error("Broken order");
          }
          return <p>Recovered order</p>;
        },
        layers: [
          {
            Layout: ({ children }) => (
              <section aria-label="Orders layout">{children}</section>
            ),
            Error: ({ error, reset }) => (
              <button
                type="button"
                onClick={() => {
                  shouldThrow = false;
                  reset();
                }}
              >
                {error.message}
              </button>
            ),
          },
        ],
      },
      {
        segments: ["pending"],
        Page: () => <p>{use(pending)}</p>,
        layers: [{ Loading: () => <output>Loading order</output> }],
      },
    ],
    () => <p>Missing order</p>
  );
  const render = (segments: string[]) =>
    flushSync(() =>
      root.render(
        createElement(Page, { location: { segments } } as unknown as PageProps)
      )
    );
  try {
    render([]);
    await expect
      .element(page.getByRole("button", { name: "Broken order" }))
      .toBeVisible();
    await page.getByRole("button", { name: "Broken order" }).click();
    await expect.element(page.getByText("Recovered order")).toBeVisible();
    render(["pending"]);
    await expect
      .element(page.getByRole("status"))
      .toHaveTextContent("Loading order");
    finish("Ready order");
    await expect.element(page.getByText("Ready order")).toBeVisible();
    render(["missing"]);
    await expect.element(page.getByText("Missing order")).toBeVisible();
  } finally {
    root.unmount();
    container.remove();
    errorLog.mockRestore();
  }
});
