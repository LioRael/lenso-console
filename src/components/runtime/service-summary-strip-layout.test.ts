import { describe, expect, test } from "vitest";

import { getServiceSummaryPanelLayout } from "./service-summary-strip-layout";

describe("service summary strip layout", () => {
  test("uses the requested height when the panel is expanded", () => {
    const layout = getServiceSummaryPanelLayout({
      expanded: true,
      height: 176,
    });

    expect(layout.panelHeight).toBe(176);
    expect(layout.contentHeight).toBe(146);
  });

  test("collapses the panel to its header height", () => {
    const layout = getServiceSummaryPanelLayout({
      expanded: false,
      height: 176,
    });

    expect(layout.panelHeight).toBe(30);
    expect(layout.contentHeight).toBe(0);
  });
});
