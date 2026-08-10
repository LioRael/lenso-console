import { describe, expect, test } from "vitest";

import {
  CONSOLE_MODULE_PROTOCOL,
  CONSOLE_UI_ESM_FORMAT,
  validateConsoleUiEsmArtifact,
  validateFrameworkModuleRelease,
  isSemverRangeCompatible,
} from "./contracts";
import type {
  FrameworkConsoleUiEsmArtifact,
  FrameworkModuleRelease,
} from "./contracts";

const digest = `sha256:${"a".repeat(64)}` as const;

const artifact: FrameworkConsoleUiEsmArtifact = {
  artifact: { digest, locator: "oci://registry.example/support-ui" },
  entries: [
    { name: "support", path: "assets/support.js" },
    { name: "styles", path: "assets/support.css" },
  ],
  entry: "assets/support.js",
  format: CONSOLE_UI_ESM_FORMAT,
  manifest: {
    consoleUi: "^2.0.0",
    hostApi: "^2.0.0",
    moduleId: "acme/support-console",
    protocol: CONSOLE_MODULE_PROTOCOL,
    surfaces: [
      {
        area: "data",
        id: "support",
        label: "Support",
        path: "/support",
      },
    ],
  },
  protocolMajor: 1,
  styleAssets: [{ order: 0, path: "assets/support.css" }],
};

describe("published framework Console contracts", () => {
  test("accepts the exact ESM artifact shape and independent ranges", () => {
    expect(() => validateConsoleUiEsmArtifact(artifact)).not.toThrow();
    expect(isSemverRangeCompatible("^1.0.0", "1.0.0")).toBe(true);
    expect(isSemverRangeCompatible("^2.0.0", "2.0.0")).toBe(true);
    expect(isSemverRangeCompatible("^2.0.0", "1.9.0")).toBe(false);
  });

  test("rejects local navigation metadata from the framework artifact", () => {
    expect(() =>
      validateConsoleUiEsmArtifact({
        ...artifact,
        manifest: {
          ...artifact.manifest,
          surfaces: [
            {
              ...artifact.manifest.surfaces[0],
              navigation: {
                workspace: {
                  id: "system",
                  label: "System",
                  localizedLabels: { "zh-CN": "系统" },
                },
              },
            },
          ],
        },
      } as unknown as FrameworkConsoleUiEsmArtifact)
    ).toThrow("unsupported field");
  });

  test("rejects a release that carries the retired bridge presentation", () => {
    const release = {
      console_ui_artifact: artifact,
      delivery: { kind: "linked" },
      manifest: {
        console: [
          {
            presentation: {
              bridge_protocol: "lenso.console-bridge.v1",
              kind: "isolated",
            },
          },
        ],
      },
      manifest_digest: digest,
      module_id: "acme/support-console",
      protocol: "lenso.module-release.v1",
      version: "1.2.3",
    } satisfies FrameworkModuleRelease;

    expect(() => validateFrameworkModuleRelease(release)).toThrow("Bridge");
  });
});
