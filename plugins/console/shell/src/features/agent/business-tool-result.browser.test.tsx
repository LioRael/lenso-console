import { flushSync } from "react-dom";
import { createRoot } from "react-dom/client";
import { expect, test } from "vitest";
import { page } from "vitest/browser";

import { BusinessToolResult } from "./business-tool-result";

test("business results expose safe issue links and returned revision", async () => {
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  try {
    flushSync(() =>
      root.render(
        <BusinessToolResult
          content={JSON.stringify({
            revision: "3",
            workflow_state_id: "done",
            _links: [
              {
                title: "My issue",
                url: "https://app.example/projects?issue=one",
              },
              {
                title: "unsafe",
                // Deliberately unsafe input exercises the URL filter.
                // eslint-disable-next-line no-script-url
                url: "javascript:alert(1)",
              },
            ],
          })}
        />
      )
    );
    await expect
      .element(page.getByRole("link", { name: "My issue ↗" }))
      .toHaveAttribute("href", "https://app.example/projects?issue=one");
    await expect.element(page.getByText("Revision: 3")).toBeVisible();
    expect(container.textContent).not.toContain("unsafe");
  } finally {
    flushSync(() => root.unmount());
    container.remove();
  }
});
