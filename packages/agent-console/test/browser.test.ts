import { expect, test } from "bun:test";
import { mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";

import react from "@vitejs/plugin-react";
import { chromium, type Page } from "playwright";
import { createServer } from "vite";

import {
  agentReplayPlugin,
  createAgentReplay,
} from "../../../examples/composed-console/agent-replay";
import { consoleStylex } from "../../../plugins/console/shell/config/console-stylex";

async function fixture(
  options: {
    narrow?: boolean;
    reduced?: boolean;
    state?: string;
    dark?: boolean;
  } = {}
) {
  const replay = createAgentReplay();
  const server = await createServer({
    configFile: false,
    root: fileURLToPath(new URL("..", import.meta.url)),
    plugins: [react(), consoleStylex(), agentReplayPlugin(replay)],
    optimizeDeps: { include: ["@lenso/ui", "@lenso/ui/**"] },
    server: { host: "127.0.0.1", port: 0 },
  });
  await server.listen();
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({
    viewport: options.narrow
      ? { width: 390, height: 844 }
      : { width: 1280, height: 900 },
    hasTouch: options.narrow,
    reducedMotion: options.reduced ? "reduce" : "no-preference",
  });
  page.setDefaultTimeout(8000);
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  try {
    await page.goto(
      `${server.resolvedUrls!.local[0]}test/index.html?state=${options.state ?? "ready"}&theme=${options.dark ? "dark" : "light"}`
    );
    await page
      .getByRole("heading", {
        name: "Agent Console protocol fixture",
        exact: true,
      })
      .waitFor();
  } catch (error) {
    await browser.close();
    await server.close();
    replay.close();
    throw error;
  }
  return {
    page,
    replay,
    errors,
    async close() {
      await browser.close();
      await server.close();
      replay.close();
    },
  };
}
const composer = (page: Page) =>
  page.getByRole("textbox", { name: "Message Agent", exact: true });
async function open(page: Page) {
  await page.getByRole("button", { name: "Agent", exact: true }).click();
  await page.waitForFunction(
    () => document.activeElement?.getAttribute("aria-label") === "Message Agent"
  );
}
async function settled(page: Page) {
  await page.waitForFunction(
    () =>
      document.querySelector<HTMLElement>("[data-dashboard-dock]")?.dataset
        .geometryReady === "true"
  );
}
async function screenshot(page: Page, name: string) {
  const directory = process.env.LENSO_AGENT_EVIDENCE_DIR;
  if (directory) {
    await mkdir(directory, { recursive: true });
    await page.screenshot({ path: `${directory}/${name}.png` });
  }
}
function runs(replay: ReturnType<typeof createAgentReplay>) {
  return replay.requests.filter(
    (item) => item.path.endsWith("/runs") && item.method === "POST"
  );
}

test("Agent morphs the existing Dock, guards IME/duplicate submission, and restores navigation and drafts", async () => {
  const f = await fixture();
  const { page, replay } = f;
  try {
    await page
      .getByRole("textbox", { name: "Page draft", exact: true })
      .fill("Keep the workspace draft");
    const initial = await page
      .getByRole("textbox", { name: "Page draft", exact: true })
      .boundingBox();
    await screenshot(page, "dock-with-agent");
    await page.evaluate(() => {
      const surface = document.querySelector("[data-dashboard-dock-surface]")!;
      const sizes = new Set<string>();
      const sample = { surface, sizes, frame: 0 };
      (
        globalThis as unknown as { agentGeometry: typeof sample }
      ).agentGeometry = sample;
      const tick = () => {
        const rect = surface.getBoundingClientRect();
        sizes.add(`${Math.round(rect.width)},${Math.round(rect.height)}`);
        sample.frame = requestAnimationFrame(tick);
      };
      tick();
    });
    await open(page);
    await settled(page);
    const geometry = await page.evaluate(() => {
      const sample = (
        globalThis as unknown as {
          agentGeometry: {
            surface: Element;
            sizes: Set<string>;
            frame: number;
          };
        }
      ).agentGeometry;
      cancelAnimationFrame(sample.frame);
      return {
        sameSurface:
          sample.surface ===
          document.querySelector("[data-dashboard-dock-surface]"),
        sizes: sample.sizes.size,
      };
    });
    expect(geometry.sameSurface).toBe(true);
    expect(geometry.sizes).toBeGreaterThan(2);
    await screenshot(page, "composer-desktop-verified");
    await composer(page).fill("中文消息");
    await composer(page).dispatchEvent("compositionstart", { data: "中文" });
    await composer(page).press("Enter");
    expect(runs(replay)).toHaveLength(0);
    await composer(page).press("Escape");
    expect(await composer(page).isVisible()).toBe(true);
    await composer(page).dispatchEvent("compositionend", { data: "中文" });
    await composer(page).evaluate((node) => {
      for (let index = 0; index < 2; index += 1) {
        node.dispatchEvent(
          new KeyboardEvent("keydown", {
            key: "Enter",
            bubbles: true,
            cancelable: true,
          })
        );
      }
    });
    await page.getByText("Run completed.", { exact: true }).waitFor();
    expect(runs(replay)).toHaveLength(1);
    await page
      .getByRole("log", { name: "Conversation messages" })
      .getByText("中文消息", { exact: true })
      .waitFor();
    expect(
      await page
        .getByText(
          "Protocol replay only. No provider or business tool was contacted.",
          { exact: true }
        )
        .isVisible()
    ).toBe(true);
    await settled(page);
    await screenshot(page, "conversation-desktop-verified");
    const after = await page
      .getByRole("textbox", { name: "Page draft", exact: true })
      .boundingBox();
    expect(Math.abs(after!.y - initial!.y)).toBeLessThan(2);
    expect(
      await page
        .getByRole("textbox", { name: "Page draft", exact: true })
        .inputValue()
    ).toBe("Keep the workspace draft");
    await composer(page).fill("文".repeat(24_000));
    await composer(page).press("Enter");
    await page
      .getByRole("alert")
      .getByText("The Agent request could not be completed.", { exact: true })
      .waitFor();
    expect(await composer(page).isEditable()).toBe(true);
    expect(runs(replay)).toHaveLength(1);
    expect(
      await page
        .getByRole("button", { name: "Retry same message", exact: true })
        .count()
    ).toBe(0);
    await composer(page).fill("Keep the Agent draft");
    await composer(page).press("Escape");
    await page
      .getByRole("region", { name: "Agent conversation", exact: true })
      .waitFor({ state: "hidden" });
    await composer(page).press("Escape");
    await page.getByRole("button", { name: "Agent", exact: true }).waitFor();
    await page.waitForFunction(
      () => document.activeElement?.getAttribute("aria-label") === "Agent"
    );
    await open(page);
    expect(await composer(page).inputValue()).toBe("Keep the Agent draft");
    expect(runs(replay)).toHaveLength(1);
    await page
      .getByRole("button", { name: "Back to navigation", exact: true })
      .click();
    await page.getByRole("button", { name: "History", exact: true }).click();
    await page
      .getByRole("heading", { name: "History fixture", exact: true })
      .waitFor();
    expect(f.errors).toEqual([]);
    expect(await page.locator("vite-error-overlay").count()).toBe(0);
  } finally {
    await f.close();
  }
}, 30_000);

test("closing only detaches; reopening follows the same run and Stop waits for terminal cancellation", async () => {
  const f = await fixture();
  f.replay.setScenario("slow");
  try {
    await open(f.page);
    await composer(f.page).fill("Run until explicitly stopped");
    await composer(f.page).press("Enter");
    await f.page
      .getByRole("button", { name: "Stop Agent", exact: true })
      .waitFor();
    await f.page
      .getByRole("button", { name: "Back to navigation", exact: true })
      .click();
    expect(
      f.replay.requests.some((request) => request.path.endsWith("/cancel"))
    ).toBe(false);
    expect(f.replay.snapshot?.runs[0]?.status).toBe("running");
    await open(f.page);
    await f.page
      .getByRole("button", { name: "Stop Agent", exact: true })
      .click();
    await f.page.getByText("Run cancelled.", { exact: true }).waitFor();
    expect(runs(f.replay)).toHaveLength(1);
    expect(
      f.replay.requests.filter((request) => request.path.endsWith("/cancel"))
    ).toHaveLength(1);
    expect(f.errors).toEqual([]);
  } finally {
    await f.close();
  }
}, 20_000);

test("unknown submissions retain idempotency, completed actions need no live SSE, and interrupted watches resnapshot", async () => {
  const f = await fixture();
  const { page, replay } = f;
  replay.setScenario("lost-submit");
  try {
    await open(page);
    await composer(page).fill("Uncertain submission");
    await composer(page).press("Enter");
    await page
      .getByRole("button", { name: "Retry same message", exact: true })
      .click();
    await page.getByText("Run completed.", { exact: true }).waitFor();
    expect(replay.snapshot?.runs).toHaveLength(1);
    expect(runs(replay)[0]?.key).toBe(runs(replay)[1]?.key);
    expect(runs(replay)[0]?.body).toEqual(runs(replay)[1]?.body);
    replay.setScenario("pending-action");
    await composer(page).fill("Review the tool action");
    await composer(page).press("Enter");
    const review = page.getByRole("region", {
      name: "Tool action Preview invoice",
      exact: true,
    });
    await review.waitFor();
    await review
      .getByRole("button", { name: "Review exact input", exact: true })
      .click();
    await review
      .getByText('"invoice": "sample-42"', { exact: false })
      .waitFor();
    expect(
      await review
        .getByText("protocol-fixture / isolated / invoices / preview", {
          exact: true,
        })
        .isVisible()
    ).toBe(true);
    await review
      .getByRole("button", { name: "Approve this action", exact: true })
      .click();
    await page.getByText("Approval processed.", { exact: false }).waitFor();
    expect(replay.snapshot?.actions[0]?.status).toBe("completed");
    expect(replay.snapshot?.runs).toHaveLength(2);
    await screenshot(page, "tool-review");
    replay.setScenario("resnapshot");
    await composer(page).fill("Recover live updates");
    await composer(page).press("Enter");
    await page
      .getByRole("button", { name: "Reconnect to run", exact: true })
      .click();
    replay.finish();
    await page.getByText("Run completed.", { exact: true }).waitFor();
    expect(
      replay.requests.filter((request) =>
        request.path.endsWith("/replay-run-3/watch")
      ).length
    ).toBeGreaterThanOrEqual(2);
    replay.setScenario("unknown-action");
    await composer(page).fill("Show an ambiguous tool outcome");
    await composer(page).press("Enter");
    await page.getByText("The outcome is unknown.", { exact: false }).waitFor();
    expect(
      await page
        .getByRole("button", { name: "Approve this action", exact: true })
        .count()
    ).toBe(0);
    replay.setScenario("error");
    await composer(page).fill("Fail the synthetic run");
    await composer(page).press("Enter");
    await page.getByText("Run failed.", { exact: true }).waitFor();
    const count = runs(replay).length;
    await page.waitForTimeout(150);
    expect(runs(replay)).toHaveLength(count);
    expect(await composer(page).isEditable()).toBe(true);
    expect(f.errors).toEqual([]);
  } finally {
    await f.close();
  }
}, 30_000);

test("connection gates expose one next step, preserve drafts on return, and never claim a free or tested provider", async () => {
  const f = await fixture({ state: "model-required" });
  try {
    await open(f.page);
    await composer(f.page).fill("Keep this while choosing a model");
    await f.page
      .getByRole("button", { name: "Agent connection setup", exact: true })
      .click();
    await f.page
      .getByRole("heading", { name: "Select a model", exact: true })
      .waitFor();
    await f.page
      .getByRole("button", { name: "Connection details", exact: true })
      .click();
    await f.page.getByText("Not provider-tested.", { exact: false }).waitFor();
    await f.page
      .getByText("Price and quota: unknown.", { exact: true })
      .waitFor();
    await composer(f.page).press("Enter");
    expect(f.replay.requests).toHaveLength(0);
    await screenshot(f.page, "connection-required");
    await f.page
      .getByRole("button", { name: "Choose model", exact: true })
      .click();
    await f.page
      .getByRole("heading", {
        name: "Host connection configuration",
        exact: true,
      })
      .waitFor();
    await f.page
      .getByRole("button", { name: "Return to workspace", exact: true })
      .click();
    await open(f.page);
    expect(await composer(f.page).inputValue()).toBe(
      "Keep this while choosing a model"
    );
    expect(f.replay.requests).toHaveLength(0);
    await composer(f.page).press("Enter");
    await f.page.getByText("Run completed.", { exact: true }).waitFor();
    expect(runs(f.replay)).toHaveLength(1);
    expect(runs(f.replay)[0]?.body).toEqual({
      text: "Keep this while choosing a model",
    });
    expect(f.errors).toEqual([]);
  } finally {
    await f.close();
  }
}, 20_000);

test("narrow dark reduced-motion Dock keeps controls and focused page content accessible", async () => {
  const f = await fixture({ narrow: true, reduced: true, dark: true });
  try {
    await open(f.page);
    await composer(f.page).fill("Narrow replay");
    await composer(f.page).press("Enter");
    await f.page.getByText("Run completed.", { exact: true }).waitFor();
    await settled(f.page);
    const bounds = await f.page
      .getByRole("region", { name: "Agent conversation", exact: true })
      .boundingBox();
    expect(bounds!.x).toBeGreaterThanOrEqual(0);
    expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(390);
    expect(
      await f.page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth
      )
    ).toBe(true);
    const back = f.page.getByRole("button", {
      name: "Back to navigation",
      exact: true,
    });
    expect((await back.boundingBox())!.height).toBeGreaterThanOrEqual(44);
    const last = f.page.getByRole("textbox", {
      name: "Last content control",
      exact: true,
    });
    await last.focus();
    await f.page.waitForFunction(() => {
      const field = document
        .querySelector('[aria-label="Last content control"]')
        ?.getBoundingClientRect();
      const tray = document
        .querySelector('[aria-label="Agent conversation"]')
        ?.getBoundingClientRect();
      return !!field && !!tray && field.bottom < tray.top;
    });
    await screenshot(f.page, "conversation-narrow-dark");
    await back.click();
    await f.page.getByRole("button", { name: "Agent", exact: true }).waitFor();
    expect(f.errors).toEqual([]);
  } finally {
    await f.close();
  }
}, 25_000);
