import "@lenso/tokens/styles.css";
import "@lenso/ui/styles.css";
import { ThemeScope } from "@lenso/ui/theme-scope";
import { flushSync } from "react-dom";
import { createRoot } from "react-dom/client";
import { expect, test, vi } from "vitest";
import { page } from "vitest/browser";

import type { PluginWorkbenchData } from "../plugins/use-plugin-workbench";
import { AddMcpConnection } from "./add-mcp-connection";

const mocks = vi.hoisted(() => ({ propose: vi.fn(), publish: vi.fn() }));
vi.mock("../plugins/plugin-control-client", () => ({
  readPluginConfigurationProposal: mocks.propose,
}));
vi.mock("../plugins/use-plugin-workbench", () => ({
  usePluginMutation: () => ({ mutateAsync: mocks.publish }),
}));
test("MCP add validates before publication and preserves the draft on failure", async () => {
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  const added = vi.fn();
  const data = {
    inventory: { streamId: "stream" },
    management: {
      revision: "revision",
      plugins: [{ packageId: "lenso.agent.mcp-client", instances: [] }],
    },
  } as unknown as PluginWorkbenchData;
  mocks.propose.mockResolvedValue({
    status: "rejected",
    application: "blocked",
    diagnostics: [{ detail: "Connection rejected" }],
  });
  try {
    flushSync(() =>
      root.render(
        <ThemeScope>
          <AddMcpConnection agentId="app" data={data} onAdded={added} />
        </ThemeScope>
      )
    );
    await page.getByRole("button", { name: "Add MCP", exact: true }).click();
    await page
      .getByRole("textbox", { name: "Connection name" })
      .fill("example");
    await page
      .getByRole("textbox", { name: "Server URL" })
      .fill("https://example.com/mcp");
    await page
      .getByRole("button", { name: "Add connection", exact: true })
      .click();
    await expect
      .element(page.getByRole("alert"))
      .toHaveTextContent("Connection rejected");
    expect(mocks.publish).not.toHaveBeenCalled();
    await expect
      .element(page.getByRole("textbox", { name: "Connection name" }))
      .toHaveValue("example");
    mocks.propose.mockResolvedValue({
      status: "ready",
      application: "app_generation",
      diagnostics: [],
      proposalDigest: "proposal",
    });
    mocks.publish.mockResolvedValue({});
    await page
      .getByRole("button", { name: "Add connection", exact: true })
      .click();
    await expect.poll(() => added.mock.calls.length).toBe(1);
    expect(mocks.publish).toHaveBeenCalledWith(
      expect.objectContaining({
        instanceKey: "example",
        expectedRevision: "revision",
        expectedStreamId: "stream",
        proposalDigest: "proposal",
        type: "configure",
      })
    );
    await expect
      .element(
        page.getByText("Added example. Enable its capabilities in a Profile.")
      )
      .toBeVisible();
  } finally {
    flushSync(() => root.unmount());
    container.remove();
  }
});
