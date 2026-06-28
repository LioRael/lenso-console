/* eslint-disable sort-keys */
import { describe, expect, it } from "vitest";

import {
  assertServicePackage,
  assertServiceContract,
  defineServicePackage,
  defineServiceContract,
  serviceContractSchema,
  serviceEnv,
  serviceHealth,
  servicePackageSchema,
  validateServiceContract,
  validateServicePackage,
} from "./index";

describe("defineServiceContract", () => {
  it("builds a provider service manifest with modules", () => {
    const manifest = defineServiceContract({
      compatibility: {
        remoteProtocolVersion: "1",
        requiredHostFeatures: ["service.status"],
        sdkLanguage: "ts",
        sdkVersion: "0.1.0",
      },
      env: [serviceEnv("PORT", { example: "4110", required: true })],
      health: serviceHealth({
        readyUrl: "http://127.0.0.1:4110/lenso/service/v1/ready",
        statusUrl: "http://127.0.0.1:4110/lenso/service/v1/status",
      }),
      modules: [
        {
          name: "support-ticket",
          version: "0.1.0",
          capabilities: ["support_ticket.tickets.read"],
        },
      ],
      name: "support-suite-provider",
      provider: {
        name: "support-suite-provider",
        summary: "Support workflow provider",
        vendor: "Lenso",
      },
      version: "0.2.0",
    });

    expect(manifest).toMatchObject({
      env: [{ name: "PORT", required: true, example: "4110" }],
      health: {
        readyUrl: "http://127.0.0.1:4110/lenso/service/v1/ready",
      },
      modules: [{ name: "support-ticket" }],
      name: "support-suite-provider",
      provider: { vendor: "Lenso" },
    });
    expect(validateServiceContract(manifest)).toEqual([]);
    expect(() => assertServiceContract(manifest)).not.toThrow();
  });

  it("defaults omitted config and env without replacing provided fields", () => {
    const localProcess = {
      command: "pnpm start",
      env: { PORT: "4110" },
    };

    const manifest = defineServiceContract({
      localProcess,
      modules: [{ name: "support-ticket" }],
      name: "support-suite-provider",
    });

    expect(manifest.config).toEqual([]);
    expect(manifest.env).toEqual([]);
    expect(manifest.localProcess).toBe(localProcess);
  });

  it("exports the packaged service contract schema", () => {
    expect(serviceContractSchema.title).toBe("LensoServiceContract");
    expect(serviceContractSchema.required).toEqual(["name", "modules"]);
  });

  it("defines and validates a service package manifest", () => {
    const servicePackage = defineServicePackage({
      modules: ["support-ticket", "support-inbox"],
      name: "support-suite-provider",
      version: "0.2.0",
    });

    expect(servicePackage).toEqual({
      modules: ["support-ticket", "support-inbox"],
      name: "support-suite-provider",
      protocol: "lenso.service-package.v1",
      serviceManifest: "lenso.service.json",
      version: "0.2.0",
    });
    expect(servicePackageSchema.title).toBe("LensoServicePackage");
    expect(validateServicePackage(servicePackage)).toEqual([]);
    expect(() => assertServicePackage(servicePackage)).not.toThrow();
  });

  it("reports validation paths for malformed service packages", () => {
    const issues = validateServicePackage({
      modules: ["support-ticket", "support-ticket", ""],
      name: "support-suite-provider",
      protocol: "remote-module",
      serviceManifest: "lenso.service.json",
      version: "0.2.0",
    });

    expect(issues.map((issue) => issue.path)).toEqual([
      "$.protocol",
      "$.modules[1]",
      "$.modules[2]",
    ]);
  });

  it("reports validation paths for malformed contracts", () => {
    const issues = validateServiceContract({
      install: {
        services: [{ name: "support-suite-provider" }],
      },
      modules: [
        {
          capabilities: ["support_ticket.read", 42],
          name: "support-ticket",
        },
        {
          name: "support-ticket",
        },
      ],
      name: "",
    });

    expect(issues.map((issue) => issue.path)).toEqual(
      expect.arrayContaining([
        "$.name",
        "$.install.services[0].command",
        "$.modules[0].capabilities[1]",
        "$.modules[1].name",
      ])
    );
  });
});
