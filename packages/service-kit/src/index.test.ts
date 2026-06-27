import { describe, expect, it } from "vitest";
import {
  assertServiceContract,
  defineServiceContract,
  serviceContractSchema,
  serviceEnv,
  serviceHealth,
  validateServiceContract,
} from "./index";

describe("defineServiceContract", () => {
  it("builds a provider service manifest with modules", () => {
    const manifest = defineServiceContract({
      name: "support-suite-provider",
      version: "0.2.0",
      provider: {
        name: "support-suite-provider",
        vendor: "Lenso",
        summary: "Support workflow provider",
      },
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
    });

    expect(manifest).toMatchObject({
      name: "support-suite-provider",
      provider: { vendor: "Lenso" },
      env: [{ name: "PORT", required: true, example: "4110" }],
      health: {
        readyUrl: "http://127.0.0.1:4110/lenso/service/v1/ready",
      },
      modules: [{ name: "support-ticket" }],
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
      name: "support-suite-provider",
      localProcess,
      modules: [{ name: "support-ticket" }],
    });

    expect(manifest.config).toEqual([]);
    expect(manifest.env).toEqual([]);
    expect(manifest.localProcess).toBe(localProcess);
  });

  it("exports the packaged service contract schema", () => {
    expect(serviceContractSchema.title).toBe("LensoServiceContract");
    expect(serviceContractSchema.required).toEqual(["name", "modules"]);
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
