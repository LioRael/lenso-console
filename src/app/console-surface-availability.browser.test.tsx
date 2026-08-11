import { CONSOLE_MODULE_API_PROTOCOL } from "@lenso/console-module-api";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeAll, describe, expect, test, vi } from "vitest";

import type { ConsoleArtifactReceipt } from "./console-artifact-query";
import { useConsoleSurfaceAvailability } from "./console-surface-availability";

const queries = vi.hoisted(() => ({
  admin: {
    data: {
      capabilities: [],
      managed_service_capabilities: {},
    },
    isError: false,
    isPending: false,
  },
  artifacts: {
    data: { artifacts: [] as ConsoleArtifactReceipt[] },
    isError: false,
    isPending: false,
  },
  system: {
    data: undefined,
    isError: false,
    isPending: true,
  },
}));

vi.mock("../lib/http-client", () => ({ isApiMode: () => true }));
vi.mock("./console-admin-context", () => ({
  useConsoleAdminContext: () => queries.admin,
}));
vi.mock("./console-artifact-query", () => ({
  useConsoleArtifacts: () => queries.artifacts,
}));
vi.mock("./console-capabilities", () => ({
  useConsoleCapabilities: () => [],
}));
vi.mock("./console-system-connection-api", () => ({
  useConsoleSystemConnection: () => queries.system,
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

describe("useConsoleSurfaceAvailability", () => {
  test("does not project a false unavailable Story while System Connection is pending", async () => {
    queries.artifacts.data.artifacts = [storyArtifact];
    queries.system.data = undefined;
    queries.system.isError = false;
    queries.system.isPending = true;
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    roots.push(root);

    await act(async () => root.render(<AvailabilityProbe />));

    expect(container.textContent).toBe("[]");

    queries.system.isPending = false;
    queries.system.isError = true;
    await act(async () => root.render(<AvailabilityProbe />));

    expect(container.textContent).toContain(
      "Current operator lacks the required Surface Entry Capability: runtime.stories.read"
    );
  });
});

function AvailabilityProbe() {
  return <output>{JSON.stringify(useConsoleSurfaceAvailability())}</output>;
}

const storyArtifact: ConsoleArtifactReceipt = {
  artifactDigest: `sha256:${"a".repeat(64)}`,
  basePath: "/artifacts/platform-story/",
  entry: "index.js",
  entries: [{ name: "module", path: "index.js" }],
  format: "console_ui_esm",
  grantedPermissions: [],
  manifest: {
    consoleUi: "^2.0.0",
    hostApi: "^2.0.0",
    moduleId: "lenso/platform-story",
    protocol: CONSOLE_MODULE_API_PROTOCOL,
    surfaces: [
      {
        area: "runtime",
        id: "runtime-stories",
        label: "Stories",
        path: "/stories",
        requiredCapabilities: ["runtime.stories.read"],
      },
    ],
  },
  moduleId: "lenso/platform-story",
  moduleReleaseDigest: `sha256:${"b".repeat(64)}`,
};
