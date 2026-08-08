import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, test, vi } from "vitest";

import { ConsoleCompositionErrorBoundary } from "./console-composition-boundary";

const roots: HTMLElement[] = [];

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

afterEach(() => {
  for (const element of roots.splice(0)) {
    element.remove();
  }
});

describe("Console Composition error boundary", () => {
  test("isolates a composition render failure and reports it", async () => {
    const host = document.createElement("div");
    document.body.append(host);
    roots.push(host);
    const root = createRoot(host);
    const error = new Error("composition render failed");
    const onError = vi.fn();
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);

    function BrokenComposition(): never {
      throw error;
    }

    await act(async () => {
      root.render(
        <ConsoleCompositionErrorBoundary
          fallback={<p data-testid="official-default">Official default</p>}
          onError={onError}
        >
          <BrokenComposition />
        </ConsoleCompositionErrorBoundary>
      );
    });

    expect(
      host.querySelector("[data-testid='official-default']")?.textContent
    ).toBe("Official default");
    expect(onError).toHaveBeenCalledWith(error);
    consoleError.mockRestore();
  });
});
