import * as stylex from "@stylexjs/stylex";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeAll, describe, expect, test } from "vitest";

import { Dialog } from "../ui/dialog";
import { JsonViewer } from "./json-viewer";

const testStyles = stylex.create({
  popup: {
    height: 200,
    width: 320,
  },
});

const roots: ReturnType<typeof createRoot>[] = [];

beforeAll(() => {
  (
    globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
  ).IS_REACT_ACT_ENVIRONMENT = true;
});

afterEach(async () => {
  for (const root of roots.splice(0)) {
    await act(async () => root.unmount());
  }
  document.body.replaceChildren();
});

describe("runtime overlay layout", () => {
  test("keeps Dialog positioning when a caller adds dimensions", async () => {
    const host = document.createElement("div");
    document.body.append(host);
    const root = createRoot(host);
    roots.push(root);

    await act(async () => {
      root.render(
        <Dialog onOpenChange={() => undefined} open>
          <Dialog.Portal>
            <Dialog.Backdrop />
            <Dialog.Popup aria-label="Test dialog" stylex={testStyles.popup}>
              Dialog content
            </Dialog.Popup>
          </Dialog.Portal>
        </Dialog>
      );
    });

    const popup = document.querySelector<HTMLElement>(
      '[aria-label="Test dialog"]'
    );
    expect(popup).not.toBeNull();
    const computed = getComputedStyle(popup!);
    const bounds = popup!.getBoundingClientRect();

    expect(computed.position).toBe("fixed");
    expect(computed.width).toBe("320px");
    expect(Math.abs(bounds.x + bounds.width / 2 - innerWidth / 2)).toBeLessThan(
      1
    );
  });

  test("lets expanded payload rows grow beyond their header", async () => {
    const host = document.createElement("div");
    document.body.append(host);
    const root = createRoot(host);
    roots.push(root);

    await act(async () => {
      root.render(
        <JsonViewer
          defaultExpanded
          title="metadata"
          value={{ correlation_id: "corr_1", provider_status: 200 }}
          variant="payload-row"
        />
      );
    });

    const section = host.querySelector("section");
    expect(section?.querySelector("pre")?.textContent).toContain("corr_1");
    expect(section?.getBoundingClientRect().height).toBeGreaterThan(52);
  });
});
