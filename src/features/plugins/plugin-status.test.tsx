import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { PluginStatus } from "./plugin-status";

describe("PluginStatus", () => {
  it("renders truthful runtime labels and accessible detail", () => {
    const output = renderToStaticMarkup(
      <PluginStatus
        state={{
          description: "Desired state is not active yet.",
          label: "Preparing",
          tone: "info",
        }}
      />
    );

    expect(output).toContain('data-status="info"');
    expect(output).toContain("Preparing");
    expect(output).toContain("Desired state is not active yet.");
    expect(output).not.toContain("Enabled");
  });
});
