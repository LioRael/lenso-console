import { CONSOLE_MODULE_API_PROTOCOL } from "@lenso/console-module-api";
import type { ConsoleSystemConnection } from "@lenso/console-ui";
import { describe, expect, test } from "vitest";

import type { ConsoleArtifactReceipt } from "./console-artifact-query";
import { navigationFromConsoleModuleMetadata } from "./console-module-metadata";
import { consoleSurfaceAvailability } from "./console-surface-availability";

const artifactDigest = `sha256:${"a".repeat(64)}` as const;
const releaseDigest = `sha256:${"b".repeat(64)}` as const;
const topologyDigest = `sha256:${"c".repeat(64)}` as const;

const storyArtifact: ConsoleArtifactReceipt = {
  artifactDigest,
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
  moduleReleaseDigest: releaseDigest,
};

describe("Module Surface availability", () => {
  test("explains an exact incompatible Stories Surface", () => {
    const connection = connectionWithStoryStatus("incompatible");
    const [availability] = consoleSurfaceAvailability({
      artifacts: [storyArtifact],
      availableCapabilities: ["*"],
      connection,
      managedServiceCapabilities: {},
    });

    expect(availability).toEqual({
      label: "Stories",
      moduleId: "lenso/platform-story",
      path: "/stories",
      reason: "Module workload is incompatible with the System topology",
      serviceId: null,
      status: "incompatible",
      surfaceId: "runtime-stories",
    });
    expect(
      navigationFromConsoleModuleMetadata(
        [],
        ["*"],
        [storyArtifact],
        new Set(),
        connection
      )
    ).not.toContainEqual(expect.objectContaining({ path: "/stories" }));
  });

  test("explains missing actor authority without treating it as global", () => {
    const connection = connectionWithStoryStatus("connected");
    const [availability] = consoleSurfaceAvailability({
      artifacts: [storyArtifact],
      availableCapabilities: [],
      connection,
      managedServiceCapabilities: {
        "unrelated-service": ["runtime.stories.read"],
      },
    });

    expect(availability).toMatchObject({
      label: "Stories",
      reason:
        "Current operator lacks the required Surface Entry Capability: runtime.stories.read",
      status: "unavailable",
    });
    expect(
      navigationFromConsoleModuleMetadata(
        [],
        [],
        [storyArtifact],
        new Set(),
        connection,
        { "unrelated-service": ["runtime.stories.read"] }
      )
    ).not.toContainEqual(expect.objectContaining({ path: "/stories" }));
  });

  test("keeps an authority reason discoverable when System read is not authorized", () => {
    const [availability] = consoleSurfaceAvailability({
      artifacts: [storyArtifact],
      availableCapabilities: [],
      connection: undefined,
      managedServiceCapabilities: {},
    });

    expect(availability).toMatchObject({
      label: "Stories",
      reason:
        "Current operator lacks the required Surface Entry Capability: runtime.stories.read",
      status: "unavailable",
    });
  });

  test("defers to the no-System and System-error route states when authority is not the known cause", () => {
    expect(
      consoleSurfaceAvailability({
        artifacts: [storyArtifact],
        availableCapabilities: [],
        connection: null,
        managedServiceCapabilities: {},
      })
    ).toEqual([]);
    expect(
      consoleSurfaceAvailability({
        artifacts: [storyArtifact],
        availableCapabilities: ["*"],
        connection: undefined,
        managedServiceCapabilities: {},
      })
    ).toEqual([]);
  });

  test("keeps authorized connected Stories available", () => {
    const connection = connectionWithStoryStatus("connected");
    const [availability] = consoleSurfaceAvailability({
      artifacts: [storyArtifact],
      availableCapabilities: ["runtime.stories.read"],
      connection,
      managedServiceCapabilities: {},
    });

    expect(availability).toMatchObject({ reason: null, status: "connected" });
    expect(
      navigationFromConsoleModuleMetadata(
        [],
        ["runtime.stories.read"],
        [storyArtifact],
        new Set(),
        connection
      )
    ).toContainEqual(expect.objectContaining({ path: "/stories" }));
  });

  test("explains a selected Story Module whose artifact receipt is missing", () => {
    const connection = connectionWithStoryStatus("connected");
    const [availability] = consoleSurfaceAvailability({
      artifacts: [],
      availableCapabilities: ["runtime.stories.read"],
      connection,
      managedServiceCapabilities: {},
    });

    expect(availability).toMatchObject({
      moduleId: "lenso/platform-story",
      path: "/modules",
      reason:
        "The exact Console UI artifact receipt has not been reconciled for this Module Release",
      status: "incompatible",
      surfaceId: "missing-console-ui-artifact",
    });
  });

  test("explains an Auth release that does not declare a Console UI artifact", () => {
    const connection: ConsoleSystemConnection = {
      ...connectionWithStoryStatus("connected"),
      modules: [
        {
          consoleUiArtifactDigest: null,
          delivery: "linked",
          moduleId: "lenso/auth",
          moduleReleaseDigest: releaseDigest,
          reason: null,
          status: "connected",
        },
      ],
    };
    const [availability] = consoleSurfaceAvailability({
      artifacts: [],
      availableCapabilities: ["auth.users.read"],
      connection,
      managedServiceCapabilities: {},
    });

    expect(availability).toMatchObject({
      moduleId: "lenso/auth",
      reason:
        "The connected Module Release does not declare a Console UI artifact",
      status: "incompatible",
    });
  });
});

function connectionWithStoryStatus(
  status: "connected" | "incompatible"
): ConsoleSystemConnection {
  return {
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
        delivery: "linked",
        moduleId: "lenso/platform-story",
        moduleReleaseDigest: releaseDigest,
        reason:
          status === "incompatible"
            ? "Module workload is incompatible with the System topology"
            : null,
        status,
      },
    ],
    services: [],
    status,
    systemId: "support-desk",
    topologyDigest,
  };
}
