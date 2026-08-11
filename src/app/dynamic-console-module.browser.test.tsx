import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeAll, describe, expect, test, vi } from "vitest";

import { DynamicConsoleModulePage } from "./dynamic-console-module";

const runtime = vi.hoisted(() => ({
  adminState: "authorized" as "authorized" | "error" | "pending",
  loadConsoleUiModule: vi.fn(),
}));

vi.mock("@tanstack/react-router", async (importOriginal) => ({
  ...(await importOriginal()),
  useNavigate: () => vi.fn(),
  useRouterState: ({ select }: { select: (state: unknown) => unknown }) =>
    select({ location: { pathname: "/stories" } }),
}));
vi.mock("../lib/http-client", async (importOriginal) => ({
  ...(await importOriginal()),
  isApiMode: () => true,
}));
vi.mock("./console-admin-context", async (importOriginal) => ({
  ...(await importOriginal()),
  useConsoleAdminContext: () =>
    runtime.adminState === "authorized"
      ? {
          data: {
            actor: { kind: "user", user_id: "usr_limited" },
            capabilities: ["console.system.read"],
            managed_service_capabilities: {},
            scopes: [],
          },
          isError: false,
          isPending: false,
        }
      : {
          data: undefined,
          isError: runtime.adminState === "error",
          isPending: runtime.adminState === "pending",
        },
}));
vi.mock("./console-artifact-query", async (importOriginal) => ({
  ...(await importOriginal()),
  useConsoleArtifacts: () => ({
    data: { artifacts: [storyArtifact] },
    isError: false,
    isPending: false,
  }),
}));
vi.mock("./console-capabilities", async (importOriginal) => ({
  ...(await importOriginal()),
  useConsoleCapabilities: () => ["console.system.read"],
}));
vi.mock("./console-module-runtime", async (importOriginal) => ({
  ...(await importOriginal()),
  loadConsoleUiModule: runtime.loadConsoleUiModule,
}));
vi.mock("./console-system-connection-api", async (importOriginal) => ({
  ...(await importOriginal()),
  useConsoleSystemConnection: () => ({
    data: systemConnection,
    isError: false,
    isPending: false,
  }),
}));
vi.mock("./console-system-registry-api", async (importOriginal) => ({
  ...(await importOriginal()),
  useConsoleManagedServices: () => ({ data: [] }),
}));
vi.mock("./managed-service-selection", async (importOriginal) => ({
  ...(await importOriginal()),
  useSelectedManagedServiceId: () => null,
}));

const roots: ReturnType<typeof createRoot>[] = [];
const queryClients: QueryClient[] = [];

beforeAll(() => {
  (
    globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
  ).IS_REACT_ACT_ENVIRONMENT = true;
});

afterEach(async () => {
  runtime.adminState = "authorized";
  runtime.loadConsoleUiModule.mockReset();
  for (const root of roots.splice(0)) {
    await act(async () => root.unmount());
  }
  for (const queryClient of queryClients.splice(0)) {
    queryClient.clear();
  }
  document.body.replaceChildren();
});

describe("Dynamic Console Module route boundary", () => {
  test("does not import a connected Story Surface before checking actor entry authority", async () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    queryClients.push(queryClient);
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    roots.push(root);

    await act(async () => {
      root.render(
        <QueryClientProvider client={queryClient}>
          <DynamicConsoleModulePage />
        </QueryClientProvider>
      );
    });

    expect(container.textContent).toContain("Stories Unavailable");
    expect(container.textContent).toContain(
      "Current operator lacks the required Surface Entry Capability: runtime.stories.read"
    );
    expect(runtime.loadConsoleUiModule).not.toHaveBeenCalled();
  });

  test.each([
    ["pending", "Loading Console Access"],
    ["error", "Console Access is unavailable"],
  ] as const)(
    "fails closed when Console Access is %s",
    async (adminState, expectedState) => {
      runtime.adminState = adminState;
      const queryClient = new QueryClient({
        defaultOptions: { queries: { retry: false } },
      });
      queryClients.push(queryClient);
      const container = document.createElement("div");
      document.body.append(container);
      const root = createRoot(container);
      roots.push(root);

      await act(async () => {
        root.render(
          <QueryClientProvider client={queryClient}>
            <DynamicConsoleModulePage />
          </QueryClientProvider>
        );
      });

      expect(container.textContent).toContain(expectedState);
      expect(runtime.loadConsoleUiModule).not.toHaveBeenCalled();
    }
  );
});

const artifactDigest = `sha256:${"a".repeat(64)}` as const;
const moduleReleaseDigest = `sha256:${"b".repeat(64)}` as const;
const topologyDigest = `sha256:${"c".repeat(64)}` as const;
const storyArtifact = {
  artifactDigest,
  basePath: "/artifacts/platform-story/",
  entry: "index.js",
  entries: [{ name: "module", path: "index.js" }],
  format: "console_ui_esm" as const,
  grantedPermissions: [],
  manifest: {
    consoleUi: "^2.0.0",
    hostApi: "^2.0.0",
    moduleId: "lenso/platform-story",
    protocol: "lenso.console-module.v1" as const,
    surfaces: [
      {
        area: "runtime" as const,
        id: "runtime-stories",
        label: "Stories",
        path: "/stories",
        requiredCapabilities: ["runtime.stories.read"],
      },
    ],
  },
  moduleId: "lenso/platform-story",
  moduleReleaseDigest,
};
const systemConnection = {
  adapters: [],
  managementBinding: {
    adapterIds: [],
    permissions: [],
    policy: {
      digest: `sha256:${"d".repeat(64)}`,
      policyId: "support-desk",
      revision: 1,
    },
    serviceIds: [],
    systemId: "support-desk",
    topologyDigest,
  },
  modules: [
    {
      consoleUiArtifactDigest: artifactDigest,
      delivery: "linked" as const,
      moduleId: "lenso/platform-story",
      moduleReleaseDigest,
      reason: null,
      status: "connected" as const,
    },
  ],
  reason: null,
  services: [],
  status: "connected" as const,
  systemId: "support-desk",
  topologyDigest,
};
