import { describe, expect, it } from "vitest";
import { defineServiceContract, serviceEnv, serviceHealth } from "./index";

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
  });
});
