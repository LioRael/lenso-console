import { describe, expect, test } from "vitest";

import {
  sampleLaunchpadDoctorResponse,
  sampleLaunchpadResponse,
} from "../data/available-modules";
import {
  launchpadDoctorSummary,
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

  test("summarizes an empty Launchpad state", () => {
    const summary = launchpadSummary(undefined);

    expect(summary.status).toBe("empty");
    expect(summary.nextCommand).toBe(
      "lenso app create support-desk --blueprint support-desk"
    );
    expect(launchpadDoctorSummary(undefined).nextCommand).toBe(
      "lenso dev doctor --write-state"
    );
    expect(launchpadStatusLabel("needs_attention")).toBe("needs attention");
  });
});
