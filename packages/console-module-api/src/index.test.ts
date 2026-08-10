import { describe, expect, test } from "vitest";

import {
  CONSOLE_MODULE_API_VERSION,
  CONSOLE_MODULE_API_PROTOCOL,
  ConsoleHostError,
  defineConsoleManifest,
  isConsoleSha256Digest,
} from "./index";

describe("console module API contract", () => {
  test("validates a manifest without requiring React or HTTP", () => {
    const manifest = defineConsoleManifest({
      consoleUi: "^1.0.0",
      hostApi: "^2.0.0",
      moduleId: "acme/billing",
      protocol: CONSOLE_MODULE_API_PROTOCOL,
      surfaces: [
        {
          area: "data",
          id: "invoices",
          label: "Invoices",
          path: "/billing/invoices",
        },
      ],
    });

    expect(manifest.moduleId).toBe("acme/billing");
  });

  test("rejects duplicate surface paths", () => {
    expect(() =>
      defineConsoleManifest({
        consoleUi: "^1.0.0",
        hostApi: "^2.0.0",
        moduleId: "acme/billing",
        protocol: CONSOLE_MODULE_API_PROTOCOL,
        surfaces: [
          { area: "data", id: "a", label: "A", path: "/billing" },
          { area: "data", id: "b", label: "B", path: "/billing" },
        ],
      })
    ).toThrow("invalid or duplicated");
  });

  test("publishes the major contract after retiring generic administration", () => {
    expect(CONSOLE_MODULE_API_VERSION).toBe("2.0.0");
  });

  test("exposes stable host errors", () => {
    const error = new ConsoleHostError("conflict", "Invoice changed", {
      retryable: false,
      status: 409,
    });

    expect(error).toMatchObject({
      code: "conflict",
      retryable: false,
      status: 409,
    });
  });

  test("validates content digests at the artifact boundary", () => {
    expect(isConsoleSha256Digest(`sha256:${"a".repeat(64)}`)).toBe(true);
    expect(isConsoleSha256Digest("sha256:short")).toBe(false);
  });
});
