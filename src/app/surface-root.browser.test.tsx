import { SurfaceRoot } from "@lenso/console-ui";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it } from "vitest";

const roots: HTMLElement[] = [];

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

afterEach(() => {
  for (const element of roots.splice(0)) {
    element.remove();
  }
});

describe("Console Surface Root browser contract", () => {
  it("mounts a stable root for a Module Surface", async () => {
    const host = document.createElement("div");
    document.body.append(host);
    roots.push(host);

    const root = createRoot(host);
    await act(async () => {
      root.render(
        <SurfaceRoot moduleId="acme/crm" surfaceId="contacts">
          <button type="button">Contacts</button>
        </SurfaceRoot>
      );
    });
    const surface = host.querySelector<HTMLElement>(
      "[data-lenso-surface-root='true']"
    );
    expect(surface).not.toBeNull();
    expect(surface?.dataset.moduleId).toBe("acme/crm");
    expect(surface?.dataset.surfaceId).toBe("contacts");
    expect(surface?.querySelector("button")?.textContent).toBe("Contacts");
  });
});
