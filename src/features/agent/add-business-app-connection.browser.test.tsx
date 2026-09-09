import "@lenso/tokens/styles.css";
import "@lenso/ui/styles.css";
import { ThemeScope } from "@lenso/ui/theme-scope";
import { flushSync } from "react-dom";
import { createRoot } from "react-dom/client";
import { expect, test, vi } from "vitest";
import { page } from "vitest/browser";

import type { PluginWorkbenchData } from "../plugins/use-plugin-workbench";
import { AddBusinessAppConnection } from "./add-business-app-connection";

const mocks = vi.hoisted(() => ({ propose: vi.fn(), publish: vi.fn() }));
vi.mock("../plugins/plugin-control-client", () => ({
  readPluginConfigurationProposal: mocks.propose,
}));
vi.mock("../plugins/use-plugin-workbench", () => ({
  usePluginMutation: () => ({ mutateAsync: mocks.publish }),
}));
test("business App setup validates the proposal before publishing and preserves failed drafts", async () => {
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  const added = vi.fn();
  const data = {
    inventory: { streamId: "stream" },
    management: {
      revision: "revision",
      plugins: [
        { packageId: "lenso.agent.business-connection", instances: [] },
      ],
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
          <AddBusinessAppConnection agentId="app" data={data} onAdded={added} />
        </ThemeScope>
      )
    );
    await page
      .getByRole("button", { name: "Add Projects App", exact: true })
      .click();
    await page.getByRole("textbox", { name: "App name" }).fill("example");
    await page
      .getByRole("textbox", { name: "App URL" })
      .fill("https://example.com");
    await page
      .getByRole("button", { name: "Add connection", exact: true })
      .click();
    await expect
      .element(page.getByRole("alert"))
      .toHaveTextContent("Connection rejected");
    expect(mocks.publish).not.toHaveBeenCalled();
    await expect
      .element(page.getByRole("textbox", { name: "App name" }))
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
        instanceKey: expect.stringMatching(/^business_[a-f0-9]{12}$/u),
        expectedRevision: "revision",
        expectedStreamId: "stream",
        proposalDigest: "proposal",
        type: "configure",
      })
    );
    expect(mocks.publish.mock.calls[0]?.[0].toml).toContain(
      'origin = "https://example.com"'
    );
    expect(mocks.publish.mock.calls[0]?.[0].toml).not.toMatch(
      /credential|token|allow_tool/u
    );
  } finally {
    flushSync(() => root.unmount());
    container.remove();
  }
});
