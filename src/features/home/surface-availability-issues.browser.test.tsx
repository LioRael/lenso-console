import { act, type AnchorHTMLAttributes } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeAll, describe, expect, test, vi } from "vitest";

import type { ConsoleSurfaceAvailability } from "../../app/console-surface-availability";
import { SurfaceAvailabilityIssues } from "./surface-availability-issues";

vi.mock("@tanstack/react-router", async (importOriginal) => ({
  ...(await importOriginal()),
  Link: ({
    children,
    to,
    ...props
  }: Omit<AnchorHTMLAttributes<HTMLAnchorElement>, "href"> & {
    to: string;
  }) => (
    <a {...props} href={to}>
      {children}
    </a>
  ),
}));

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

describe("Surface availability issues", () => {
  test("renders direct object reasons without presenting unavailable routes as navigation", async () => {
    const availability: ConsoleSurfaceAvailability[] = [
      {
        label: "Stories",
        moduleId: "lenso/platform-story",
        path: "/stories",
        reason: "Module workload is incompatible with the System topology",
        serviceId: null,
        status: "incompatible",
        surfaceId: "runtime-stories",
      },
      {
        label: "Support Tickets",
        moduleId: "support/tickets",
        path: "/support/tickets",
        reason:
          "Current operator lacks the required Surface Entry Capability: support_ticket.tickets.read",
        serviceId: "support-ticket",
        status: "unavailable",
        surfaceId: "support-tickets",
      },
    ];
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    roots.push(root);

    await act(async () => {
      root.render(<SurfaceAvailabilityIssues availability={availability} />);
    });

    expect(container.textContent).toContain("Module Surface availability");
    expect(container.textContent).toContain("Stories · Incompatible");
    expect(container.textContent).toContain(
      "Module workload is incompatible with the System topology"
    );
    expect(container.textContent).toContain("Support Tickets · Unavailable");
    expect(container.textContent).toContain(
      "Current operator lacks the required Surface Entry Capability: support_ticket.tickets.read"
    );
    expect(
      container.querySelector('[data-surface-availability-path="/stories"]')
    ).not.toBeNull();
    expect(container.querySelector("nav")).toBeNull();
  });
});
