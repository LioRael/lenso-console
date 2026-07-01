import { describe, expect, test } from "vitest";

import { sampleLaunchpadResponse } from "../data/available-modules";
import { launchpadStatusLabel, launchpadSummary } from "./launchpad-model";

describe("launchpad model", () => {
  test("summarizes Launchpad response for the first-run page", () => {
    expect(launchpadSummary(sampleLaunchpadResponse)).toEqual(
      expect.objectContaining({
        blueprint: "support-desk",
        moduleCount: 2,
        nextCommand: "lenso dev up",
        projectName: "support-desk",
        serviceCount: 2,
        status: "ready",
      })
    );
  });

  test("summarizes an empty Launchpad state", () => {
    const summary = launchpadSummary(undefined);

    expect(summary.status).toBe("empty");
    expect(summary.nextCommand).toBe(
      "lenso app create support-desk --blueprint support-desk"
    );
    expect(launchpadStatusLabel("needs_attention")).toBe("needs attention");
  });
});
