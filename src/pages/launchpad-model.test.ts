import { describe, expect, test } from "vitest";

import {
  sampleLaunchpadChangePlanResponse,
  sampleLaunchpadDoctorResponse,
  sampleLaunchpadProofResponse,
  sampleLaunchpadResponse,
} from "../data/available-modules";
import {
  launchpadChangePlanSummary,
  launchpadDoctorSummary,
  launchpadProofSummary,
  launchpadStatusLabel,
  launchpadSummary,
} from "./launchpad-model";

describe("launchpad model", () => {
  test("summarizes Launchpad response for the first-run page", () => {
    expect(launchpadSummary(sampleLaunchpadResponse)).toEqual(
      expect.objectContaining({
        blueprint: "support-desk",
        addonCount: 1,
        moduleCount: 2,
        nextCommand: "lenso dev up",
        projectName: "support-desk",
        serviceCount: 2,
        status: "ready",
        supportedAddons: ["support-sla", "customer-profile", "notifications"],
      })
    );
  });

  test("summarizes Launchpad doctor response", () => {
    expect(launchpadDoctorSummary(sampleLaunchpadDoctorResponse)).toEqual(
      expect.objectContaining({
        attentionChecks: [
          expect.objectContaining({
            command: "lenso dev up",
            id: "service-ready-support-sla",
          }),
        ],
        checks: 3,
        live: true,
        nextCommand: "lenso dev up",
        status: "needs_attention",
      })
    );
  });

  test("summarizes Launchpad App Proof response", () => {
    expect(launchpadProofSummary(sampleLaunchpadProofResponse)).toEqual(
      expect.objectContaining({
        addons: ["support-sla"],
        blueprint: "support-desk",
        checks: 2,
        driftCount: 0,
        nextCommand: "lenso app verify --write-proof",
        projectName: "support-desk",
        status: "ready",
      })
    );
  });

  test("summarizes Launchpad app change plan response", () => {
    expect(
      launchpadChangePlanSummary(sampleLaunchpadChangePlanResponse)
    ).toEqual(
      expect.objectContaining({
        blueprint: "support-desk",
        nextCommand: "lenso app apply .lenso/app-change-plan.json",
        pendingAddons: ["customer-profile"],
        proofStatus: "drifted",
        requestedAddons: ["support-sla", "customer-profile"],
        safeChangeCount: 1,
        serviceAction: expect.objectContaining({
          command: "lenso service workspace check customer-profile",
        }),
        status: "changes",
      })
    );
  });

  test("summarizes an empty Launchpad state", () => {
    const summary = launchpadSummary(undefined);

    expect(summary.status).toBe("empty");
    expect(summary.nextCommand).toBe(
      "lenso app create support-desk --blueprint support-desk"
    );
    expect(launchpadDoctorSummary(undefined).nextCommand).toBe(
      "lenso dev doctor --write-state"
    );
    expect(launchpadProofSummary(undefined).nextCommand).toBe(
      "lenso app verify --write-proof"
    );
    expect(launchpadChangePlanSummary(undefined).nextCommand).toBe(
      "lenso app plan --write-plan"
    );
    expect(launchpadStatusLabel("needs_attention")).toBe("needs attention");
    expect(launchpadStatusLabel("needs_setup")).toBe("needs setup");
  });
});
