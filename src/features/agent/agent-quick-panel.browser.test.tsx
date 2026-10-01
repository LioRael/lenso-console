import "@lenso/tokens/styles.css";
import { ThemeScope } from "@lenso/ui";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  createMemoryHistory,
  Outlet,
  createRootRoute,
  createRoute,
  createRouter,
  RouterProvider,
} from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { flushSync } from "react-dom";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { page, userEvent } from "vitest/browser";

import { PluginAgentAction } from "../plugins/plugin-agent-handoff";
import {
  PluginAgentWorkbenchProvider,
  usePluginAgentWorkbench,
} from "../plugins/plugin-agent-workbench-context";
import { AgentIdentityProvider } from "./agent-identity-context";
import { AgentQuickPanel } from "./agent-quick-panel";
import {
  AgentQuickPanelProvider,
  useAgentQuickPanel,
} from "./agent-quick-panel-context";
import { useAgentConversation } from "./use-agent-conversation";
import { useAgentDraft } from "./use-agent-draft";

let root: Root | undefined;
let container: HTMLDivElement | undefined;
let queryClient: QueryClient | undefined;

beforeEach(() => {
  container = document.createElement("div");
  document.body.append(container);
});

afterEach(() => {
  if (root) {
    flushSync(() => root?.unmount());
  }
  root = undefined;
  queryClient?.clear();
  queryClient = undefined;
  container?.remove();
  container = undefined;
  vi.unstubAllGlobals();
});

describe("Agent quick panel", () => {
  test("mobile navigation suspends the panel without losing its unsent draft", async () => {
    await renderPanel(agentFetch());
    await userEvent.click(
      page.getByRole("button", { name: "Assistant", exact: true })
    );
    await userEvent.fill(
      page.elementLocator(requiredComposer()),
      "Retain navigation draft"
    );
    await userEvent.click(
      page.getByRole("button", { name: "Toggle navigation fixture" })
    );
    await expect
      .poll(
        () =>
          document
            .querySelector('[data-agent-action="open"]')
            ?.closest("[hidden]") !== null
      )
      .toBe(true);
    await userEvent.keyboard("{Control>}j{/Control}");
    await expect
      .poll(
        () =>
          document.querySelector('[role="dialog"]')?.getBoundingClientRect()
            .width ?? 0
      )
      .toBe(0);
    await userEvent.click(
      page.getByRole("button", { name: "Toggle navigation fixture" })
    );
    await userEvent.click(
      page.getByRole("button", { name: "Assistant", exact: true })
    );
    await expect
      .poll(() => requiredComposer().textContent)
      .toBe("Retain navigation draft");
  });
  test("command menu remains clickable above the compact composer", async () => {
    await renderPanel(agentFetch());
    await userEvent.click(
      page.getByRole("button", { name: "Assistant", exact: true })
    );
    await userEvent.fill(page.elementLocator(requiredComposer()), "/");
    await expect
      .element(page.getByRole("listbox", { name: "Commands and Skills" }))
      .toBeVisible();
    await expect
      .poll(() => {
        const option = document.querySelector('[role="option"]');
        if (!option) {
          return false;
        }
        const box = option.getBoundingClientRect();
        return option.contains(
          document.elementFromPoint(
            box.x + box.width / 2,
            box.y + box.height / 2
          )
        );
      })
      .toBe(true);
    expect(document.querySelector('button[aria-label="Skills"]')).toBeNull();
  });

  test("keeps the mini dialog open while using portaled composer controls", async () => {
    await renderPanel(agentFetch());
    await userEvent.click(
      page.getByRole("button", { name: "Assistant", exact: true })
    );
    await userEvent.click(
      page.getByRole("button", { name: "Run configuration" })
    );
    await userEvent.hover(
      page.getByRole("menuitem", { name: /^Approval mode/ })
    );
    await expect
      .element(page.getByRole("menuitem", { name: "Full access" }))
      .toBeVisible();
    expect(requiredComposer().closest('[role="dialog"]')).not.toBeNull();
    await userEvent.keyboard("{Escape}{Escape}");
    await userEvent.click(
      page.getByRole("button", { name: "Run configuration" })
    );
    await userEvent.hover(
      page.getByRole("menuitem", { name: /^Approval mode/ })
    );
    await userEvent.click(
      page.getByRole("menuitem", { name: "Full access", exact: true })
    );
    await expect.element(page.getByRole("dialog")).toBeVisible();
  });

  test("keeps the assistant trigger visible on hover", async () => {
    const fetchMock = agentFetch();
    await renderPanel(fetchMock);

    const trigger = page.getByRole("button", {
      name: "Assistant",
      exact: true,
    });
    const triggerElement = document.querySelector<HTMLButtonElement>(
      'button[aria-label="Assistant"]'
    );
    if (!triggerElement) {
      throw new Error("Agent trigger was not rendered");
    }
    await userEvent.hover(trigger);
    await expect.element(trigger).toBeVisible();
    expect(getComputedStyle(triggerElement).color).not.toBe("rgba(0, 0, 0, 0)");
  });

  test("floating entry and shortcut preserve an unsent draft without submitting", async () => {
    const fetchMock = agentFetch();
    await renderPanel(fetchMock);
    const trigger = document.querySelector<HTMLButtonElement>(
      'button[aria-label="Assistant"]'
    )!;
    const box = trigger.getBoundingClientRect();
    expect(window.innerWidth - box.right).toBe(16);
    expect(window.innerHeight - box.bottom).toBe(16);
    trigger.focus();
    await expect.element(page.elementLocator(trigger)).toHaveFocus();
    window.dispatchEvent(
      new KeyboardEvent("keydown", { key: "j", ctrlKey: true, bubbles: true })
    );
    await nextFrame();
    await userEvent.fill(
      page.elementLocator(requiredComposer()),
      "Keep this draft"
    );
    window.dispatchEvent(
      new KeyboardEvent("keydown", { key: "j", ctrlKey: true, bubbles: true })
    );
    await nextFrame();
    await expect.element(page.getByRole("dialog")).not.toBeInTheDocument();
    window.dispatchEvent(
      new KeyboardEvent("keydown", { key: "j", ctrlKey: true, bubbles: true })
    );
    await nextFrame();
    await expect
      .element(page.elementLocator(requiredComposer()))
      .toHaveTextContent("Keep this draft");
    expect(turnRequests(fetchMock)).toHaveLength(0);
  });

  test("unrelated background activity cannot adopt a blank assistant session", async () => {
    const fetchMock = agentFetch();
    const original = fetchMock.getMockImplementation()!;
    fetchMock.mockImplementation(async (input, init) =>
      String(input).endsWith("/activity")
        ? Response.json({
            requestId: "plugin-background",
            sessionId: "unrelated-session",
            running: true,
            detail: null,
            terminalOutcome: null,
          })
        : original(input, init)
    );
    const onOpenFullPage = vi.fn();
    await renderPanel(fetchMock, onOpenFullPage);
    await userEvent.click(
      page.getByRole("button", { name: "Assistant", exact: true })
    );
    await expect
      .poll(() =>
        fetchMock.mock.calls.some(([input]) =>
          String(input).endsWith("/activity")
        )
      )
      .toBe(true);
    await userEvent.fill(
      page.elementLocator(requiredComposer()),
      "My own draft"
    );
    await userEvent.click(page.getByRole("button", { name: "Open full page" }));
    expect(onOpenFullPage).toHaveBeenCalledWith("console", undefined);
    expect(
      fetchMock.mock.calls.some(([input]) =>
        String(input).includes("/sessions/unrelated-session")
      )
    ).toBe(false);
    expect(turnRequests(fetchMock)).toHaveLength(0);
  });

  test("history reopens the durable session and retains its input after closing", async () => {
    const fetchMock = agentFetch();
    const original = fetchMock.getMockImplementation()!;
    fetchMock.mockImplementation(async (input, init) => {
      const url = String(input);
      if (url.endsWith("/sessions")) {
        return Response.json({
          sessions: [
            {
              sessionId: "history-slice",
              title: "Saved conversation",
              revision: "1",
              updatedAt: new Date().toISOString(),
            },
          ],
        });
      }
      if (url.endsWith("/sessions/history-slice")) {
        return Response.json({
          session_id: "history-slice",
          revision: "1",
          events: [
            {
              event_id: "event-1",
              kind: "turn_started",
              occurred_at: new Date().toISOString(),
              payload_json: JSON.stringify({ input: "Saved prompt" }),
              revision: "1",
              turn_id: "turn-history",
            },
          ],
        });
      }
      if (url.endsWith("/sessions/history-slice/trajectory")) {
        return Response.json({
          schema: "lenso.agent.trajectory@1",
          sessionId: "history-slice",
          revision: 1,
          records: [],
          summary: {
            status: "completed",
            turns: 1,
            modelCalls: 0,
            toolCalls: 0,
            failedOperations: 0,
            inputTokens: 0,
            outputTokens: 0,
          },
        });
      }
      return original(input, init);
    });
    await renderPanel(fetchMock);
    await userEvent.click(
      page.getByRole("button", { name: "Assistant history" })
    );
    await userEvent.click(
      page.getByRole("menuitem", { name: /Saved conversation/ })
    );
    await expect
      .element(
        page
          .getByLabelText("Agent conversation")
          .getByText("Saved prompt", { exact: true })
      )
      .toBeVisible();
    await userEvent.fill(
      page.elementLocator(requiredComposer()),
      "Saved session draft"
    );
    await userEvent.click(
      page.getByRole("button", { name: "Close chat", exact: true })
    );
    await userEvent.click(
      page.getByRole("button", { name: "Assistant history" })
    );
    await userEvent.click(
      page.getByRole("menuitem", { name: /Saved conversation/ })
    );
    await expect
      .element(page.elementLocator(requiredComposer()))
      .toHaveTextContent("Saved session draft");
    expect(turnRequests(fetchMock)).toHaveLength(0);
  });

  test("switches retained chats in one drawer and removes closed tray items", async () => {
    await renderPanel(agentFetch("## Answer\n\n**Shared markdown**"));
    await userEvent.click(
      page.getByRole("button", { name: "Assistant", exact: true })
    );
    await userEvent.fill(page.elementLocator(requiredComposer()), "First chat");
    await userEvent.keyboard("{Enter}");
    await expect
      .element(page.getByRole("heading", { name: "Answer" }))
      .toBeVisible();
    await userEvent.fill(
      page.elementLocator(requiredComposer()),
      "Retained draft"
    );
    await userEvent.click(page.getByRole("button", { name: "Minimize chat" }));
    await userEvent.click(
      page.getByRole("button", { name: "Assistant", exact: true })
    );
    await userEvent.fill(
      page.elementLocator(requiredComposer()),
      "Second chat"
    );
    await userEvent.keyboard("{Enter}");
    const first = page.getByRole("button", { name: "First chat", exact: true });
    const second = page.getByRole("button", {
      name: "Second chat",
      exact: true,
    });
    await expect.element(second).toBeVisible();
    await userEvent.click(first);
    await expect
      .element(page.elementLocator(requiredComposer()))
      .toHaveTextContent("Retained draft");
    expect(document.querySelectorAll('[role="dialog"]')).toHaveLength(1);
    await userEvent.click(second);
    await expect
      .element(page.elementLocator(requiredComposer()))
      .not.toHaveTextContent("Retained draft");
    expect(document.querySelectorAll('[role="dialog"]')).toHaveLength(1);
    await userEvent.click(
      page.getByRole("button", { name: "Close chat", exact: true })
    );
    await expect.element(second).not.toBeInTheDocument();
    await expect.element(first).toBeVisible();
    await userEvent.hover(first);
    const close = page.getByRole("button", {
      name: "Close First chat",
      exact: true,
    });
    await expect.element(close).toBeVisible();
    await userEvent.click(close);
    await expect.element(first).not.toBeInTheDocument();
  });

  test("closing an inactive chip keeps the current window open", async () => {
    await renderPanel(agentFetch("Done"));
    await userEvent.click(
      page.getByRole("button", { name: "Assistant", exact: true })
    );
    await userEvent.fill(page.elementLocator(requiredComposer()), "First chat");
    await userEvent.keyboard("{Enter}");
    await expect.element(page.getByText("Done", { exact: true })).toBeVisible();
    await userEvent.click(page.getByRole("button", { name: "Minimize chat" }));
    await userEvent.click(
      page.getByRole("button", { name: "Assistant", exact: true })
    );
    await userEvent.fill(
      page.elementLocator(requiredComposer()),
      "Active draft"
    );
    await userEvent.hover(
      page.getByRole("button", { name: "First chat", exact: true })
    );
    await userEvent.click(
      page.getByRole("button", { name: "Close First chat", exact: true })
    );
    await expect
      .element(page.elementLocator(requiredComposer()))
      .toHaveTextContent("Active draft");
    expect(document.querySelectorAll('[role="dialog"]')).toHaveLength(1);
  });

  test("removes a running chat from the tray without aborting its stream", async () => {
    const { fetchMock, finishFirstTurn } = queuedAgentFetch();
    await renderPanel(fetchMock);
    await userEvent.click(
      page.getByRole("button", { name: "Assistant", exact: true })
    );
    await userEvent.fill(
      page.elementLocator(requiredComposer()),
      "Running chat"
    );
    await userEvent.keyboard("{Enter}");
    await expect.poll(() => turnRequests(fetchMock).length).toBe(1);
    const signal = turnRequests(fetchMock)[0]?.[1]?.signal;
    await userEvent.click(
      page.getByRole("button", { name: "Close chat", exact: true })
    );
    await expect
      .element(page.getByRole("button", { name: "Running chat", exact: true }))
      .not.toBeInTheDocument();
    expect(signal?.aborted).toBe(false);
    finishFirstTurn();
  });

  test("uses the explicit dark theme inside the portal and renders full markdown", async () => {
    await renderPanel(
      agentFetch("## Answer\n\n**Shared markdown**"),
      undefined,
      false,
      "dark"
    );
    await userEvent.click(
      page.getByRole("button", { name: "Assistant", exact: true })
    );
    await userEvent.fill(page.elementLocator(requiredComposer()), "Theme test");
    await userEvent.keyboard("{Enter}");
    await expect
      .element(page.getByRole("heading", { name: "Answer" }))
      .toBeVisible();
    const body = document.querySelector<HTMLElement>("[data-conversation]");
    if (!body) {
      throw new Error("Missing conversation");
    }
    const probe = document.createElement("div");
    probe.style.backgroundColor = "var(--background)";
    body.append(probe);
    await expect
      .poll(() => getComputedStyle(body).backgroundColor)
      .toBe(getComputedStyle(probe).backgroundColor);
    expect(getComputedStyle(body).backgroundColor).not.toBe(
      "rgb(255, 255, 255)"
    );
    expect(getComputedStyle(body).backgroundColor).not.toBe("rgba(0, 0, 0, 0)");
    probe.remove();
    const strong = document.querySelector("strong");
    expect(strong?.textContent).toBe("Shared markdown");
  });
  test("pastes a text attachment and sends an attachment-only message", async () => {
    const fetchMock = agentFetch("Done");
    await renderPanel(fetchMock);
    await userEvent.click(
      page.getByRole("button", { name: "Assistant", exact: true })
    );
    const data = new DataTransfer();
    data.items.add(
      new File(["attachment contents"], "notes.md", { type: "text/plain" })
    );
    requiredComposer().dispatchEvent(
      new ClipboardEvent("paste", {
        bubbles: true,
        cancelable: true,
        clipboardData: data,
      })
    );
    await expect
      .element(page.getByRole("button", { name: "Remove notes.md" }))
      .toBeVisible();
    await userEvent.click(page.getByRole("button", { name: "Submit comment" }));
    await expect.poll(() => turnRequests(fetchMock).length).toBe(1);
    const body = JSON.parse(String(turnRequests(fetchMock)[0]?.[1]?.body));
    expect(body.attachments).toEqual([
      {
        name: "notes.md",
        media_type: "text/plain",
        data_base64: btoa("attachment contents"),
      },
    ]);
    expect(body.input).toBe("");
    await expect.element(page.getByText("Done", { exact: true })).toBeVisible();
    await expect
      .element(page.getByRole("button", { name: "Remove notes.md" }))
      .not.toBeInTheDocument();
  });

  test("focuses the composer and keeps Shift+Enter as a newline", async () => {
    const fetchMock = agentFetch();
    await renderPanel(fetchMock);

    await userEvent.click(
      page.getByRole("button", { name: "Assistant", exact: true })
    );
    await nextFrame();
    const composerElement = requiredComposer();
    const composer = page.elementLocator(composerElement);

    await userEvent.click(composer);
    await expect.element(composer).toHaveFocus();
    await userEvent.fill(composer, "First line");
    await userEvent.keyboard("{Shift>}{Enter}{/Shift}Second line");
    await nextFrame();

    expect(composerElement.textContent).toBe("First lineSecond line");
    expect(composerElement.querySelector("br")).not.toBeNull();
    expect(turnRequests(fetchMock)).toHaveLength(0);
  });

  test("does not submit Enter while IME composition is active", async () => {
    const fetchMock = agentFetch();
    await renderPanel(fetchMock);

    await userEvent.click(
      page.getByRole("button", { name: "Assistant", exact: true })
    );
    await nextFrame();
    const composerElement = requiredComposer();
    const composer = page.elementLocator(composerElement);
    await userEvent.fill(composer, "输入中");

    composerElement.dispatchEvent(
      new KeyboardEvent("keydown", {
        bubbles: true,
        cancelable: true,
        isComposing: true,
        key: "Enter",
      })
    );
    await nextFrame();

    await expect.element(composer).toHaveTextContent("输入中");
    expect(turnRequests(fetchMock)).toHaveLength(0);
  });

  test("renders an exact long streamed answer after Enter submission", async () => {
    const answer = "batched ".repeat(200).trimEnd();
    const fetchMock = agentFetch(answer);
    await renderPanel(fetchMock);

    await userEvent.click(
      page.getByRole("button", { name: "Assistant", exact: true })
    );
    await nextFrame();
    const composer = page.elementLocator(requiredComposer());
    await userEvent.fill(composer, "Stream a long answer");
    await userEvent.keyboard("{Enter}");

    await expect
      .poll(() => document.body.textContent?.includes(answer))
      .toBe(true);
    expect(turnRequests(fetchMock)).toHaveLength(1);
  });

  test("renders a validated Plugin proposal as a review receipt", async () => {
    const fetchMock = agentFetch("", false, pluginProposalMessages());
    await renderPanel(fetchMock);

    await userEvent.click(
      page.getByRole("button", { name: "Assistant", exact: true })
    );
    const composer = page.elementLocator(requiredComposer());
    await userEvent.fill(composer, "Prepare a Plugin proposal");
    await userEvent.keyboard("{Enter}");

    await page.getByText("Work completed", { exact: true }).click();
    await expect
      .element(page.getByText("Plugin change ready for review"))
      .toBeVisible();
    await expect.element(page.getByText("Remote service · app")).toBeVisible();
    await expect
      .element(page.getByRole("button", { name: "Review in Plugins" }))
      .toBeVisible();
  });

  test("opens an inspected Plugin in the exact Agent workbench context", async () => {
    const fetchMock = agentFetch("", false, pluginInspectionMessages());
    await renderPanel(fetchMock);

    await userEvent.click(
      page.getByRole("button", { name: "Assistant", exact: true })
    );
    const composer = page.elementLocator(requiredComposer());
    await userEvent.fill(composer, "Inspect the Agent loop Plugin");
    await userEvent.keyboard("{Enter}");

    await page.getByText("Work completed", { exact: true }).click();
    await expect.element(page.getByText("Plugin inspected")).toBeVisible();
    await expect
      .element(page.getByTitle("lenso.agent.loop@linked"))
      .toBeVisible();
    await expect
      .element(page.getByText(/1 Instance, 1 enabled, and 1 Host difference/))
      .toBeVisible();
    await userEvent.click(page.getByRole("button", { name: "View Plugin" }));

    await expect
      .element(page.getByText("Plugin request · lenso.agent.loop/agent"))
      .toBeVisible();
  });

  test("opens the full App Agent identity discovered from the catalog", async () => {
    const fetchMock = agentFetch("", true);
    const onOpenFullPage = vi.fn();
    await renderPanel(fetchMock, onOpenFullPage);

    await userEvent.click(
      page.getByRole("button", { name: "Assistant", exact: true })
    );
    await expect
      .poll(() =>
        fetchMock.mock.calls.some(([input]) =>
          String(input instanceof Request ? input.url : input).endsWith(
            "/api/console/v1/agents/app/bootstrap"
          )
        )
      )
      .toBe(true);
    await userEvent.click(page.getByRole("button", { name: "Open full page" }));

    expect(onOpenFullPage).toHaveBeenCalledWith("app", undefined);
  });

  test("project switches keep separate drawer targets and full-page destinations", async () => {
    const projectA = "00000000-0000-4000-8000-000000000001";
    const projectB = "00000000-0000-4000-8000-000000000002";
    const fetchMock = agentFetch("Done", true);
    const original = fetchMock.getMockImplementation()!;
    fetchMock.mockImplementation(async (input, init) => {
      const url = String(input);
      if (url.includes("/projects/") && url.endsWith("/bootstrap")) {
        return original("/api/console/v1/agents/app/bootstrap", init);
      }
      return original(input, init);
    });
    const onOpenFullPage = vi.fn();
    const router = await renderPanel(
      fetchMock,
      onOpenFullPage,
      false,
      "light",
      false,
      `/?project=${projectA}`
    );
    await userEvent.click(
      page.getByRole("button", { name: "Assistant", exact: true })
    );
    await expect.element(page.getByText(`Project: ${projectA}`)).toBeVisible();
    await userEvent.fill(
      page.elementLocator(requiredComposer()),
      "Project A draft"
    );
    await userEvent.click(page.getByRole("button", { name: "Open full page" }));
    expect(onOpenFullPage).toHaveBeenLastCalledWith("app", undefined, projectA);
    router.history.push(`/?project=${projectB}`);
    await nextFrame();
    await userEvent.click(
      page.getByRole("button", { name: "Assistant", exact: true })
    );
    await expect.element(page.getByText(`Project: ${projectB}`)).toBeVisible();
    await expect
      .element(page.elementLocator(requiredComposer()))
      .not.toHaveTextContent("Project A draft");
    await userEvent.click(page.getByRole("button", { name: "Open full page" }));
    expect(onOpenFullPage).toHaveBeenLastCalledWith("app", undefined, projectB);
    expect(
      fetchMock.mock.calls.some(([input]) =>
        String(input).includes(`/projects/${projectB}/bootstrap`)
      )
    ).toBe(true);
  });

  test("new mini chats inherit the current workspace reference without submitting", async () => {
    const fetchMock = agentFetch();
    await renderPanel(fetchMock, () => undefined, false, "light", true);
    await userEvent.click(
      page.getByRole("button", { name: "Assistant", exact: true })
    );
    await expect
      .element(page.elementLocator(requiredComposer()))
      .toHaveTextContent("issue-1");
    expect(turnRequests(fetchMock)).toHaveLength(0);
  });

  test("opens an exact Plugin context as a draft without submitting it", async () => {
    const fetchMock = agentFetch();
    await renderPanel(fetchMock, () => undefined, true);

    await userEvent.click(
      page.getByRole("button", {
        name: "Ask Agent about lenso.agent.loop/agent",
      })
    );
    await nextFrame();
    const composer = page.elementLocator(requiredComposer());

    await expect.element(composer).toBeVisible();
    await expect.element(composer).toHaveFocus();
    await expect.element(composer).toHaveTextContent("lenso.agent.loop");
    expect(turnRequests(fetchMock)).toHaveLength(0);
  });
});

test("resolved session input is shared across surfaces and isolated between projects", async () => {
  if (!container) {
    throw new Error("Missing browser container");
  }
  root = createRoot(container);
  flushSync(() =>
    root?.render(
      <>
        <DraftInput label="Drawer input" projectId="project-a" />
        <DraftInput label="Full page input" projectId="project-a" />
        <DraftInput label="Other project input" projectId="project-b" />
      </>
    )
  );
  await userEvent.fill(
    page.getByRole("textbox", { name: "Drawer input" }),
    "Shared session input"
  );
  await expect
    .element(page.getByRole("textbox", { name: "Full page input" }))
    .toHaveValue("Shared session input");
  await expect
    .element(page.getByRole("textbox", { name: "Other project input" }))
    .toHaveValue("");
  await userEvent.fill(
    page.getByRole("textbox", { name: "Full page input" }),
    "Updated from full page"
  );
  await expect
    .element(page.getByRole("textbox", { name: "Drawer input" }))
    .toHaveValue("Updated from full page");
});

describe("Agent prompt queue", () => {
  test("runs a queued follow-up after the active Turn completes", async () => {
    const { fetchMock, finishFirstTurn } = queuedAgentFetch();
    vi.stubGlobal("fetch", fetchMock);
    await renderQueueHarness();

    const composer = page.getByRole("textbox", { name: "Queue prompt" });
    await userEvent.fill(composer, "First prompt");
    await userEvent.click(page.getByRole("button", { name: "Submit prompt" }));
    await expect.poll(() => turnRequests(fetchMock).length).toBe(1);

    await userEvent.fill(composer, "Follow-up prompt");
    await userEvent.click(page.getByRole("button", { name: "Submit prompt" }));
    await expect.element(page.getByText("Follow-up prompt")).toBeVisible();

    finishFirstTurn();
    await expect.poll(() => turnRequests(fetchMock).length).toBe(2);
  });
});

async function renderPanel(
  fetchMock: ReturnType<typeof agentFetch>,
  onOpenFullPage: (agentId: string, sessionId?: string) => void = () =>
    undefined,
  includePluginAction = false,
  theme: "light" | "dark" = "light",
  includeWorkspaceContext = false,
  initialLocation = "/"
) {
  vi.stubGlobal("fetch", fetchMock);
  if (!container) {
    throw new Error("Browser test container is missing");
  }
  root = createRoot(container);
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  queryClient = client;
  const rootRoute = createRootRoute({
    component: () => (
      <QueryClientProvider client={client}>
        <AgentIdentityProvider>
          <PluginAgentWorkbenchProvider>
            <AgentQuickPanelProvider>
              <ThemeScope theme={theme}>
                <Outlet />
              </ThemeScope>
            </AgentQuickPanelProvider>
          </PluginAgentWorkbenchProvider>
        </AgentIdentityProvider>
      </QueryClientProvider>
    ),
  });
  const panelRoute = createRoute({
    component: () => (
      <>
        {includeWorkspaceContext ? <WorkspaceContextFixture /> : null}
        {includePluginAction ? (
          <PluginAgentAction {...pluginAgentContext} />
        ) : null}
        <div style={{ display: "flex", gap: 4 }}>
          <SuspendablePanel onOpenFullPage={onOpenFullPage} />
        </div>
      </>
    ),
    getParentRoute: () => rootRoute,
    path: "/",
  });
  const pluginsRoute = createRoute({
    component: PluginWorkbenchRequestProbe,
    getParentRoute: () => rootRoute,
    path: "/plugins",
  });
  const pluginDetailRoute = createRoute({
    component: PluginWorkbenchRequestProbe,
    getParentRoute: () => rootRoute,
    path: "/plugins/$agentId/$packageId/$instanceKey",
  });
  const router = createRouter({
    history: createMemoryHistory({ initialEntries: [initialLocation] }),
    routeTree: rootRoute.addChildren([
      panelRoute,
      pluginsRoute,
      pluginDetailRoute,
    ]),
  });
  flushSync(() => {
    root?.render(<RouterProvider router={router} />);
  });
  await nextFrame();
  return router;
}

function SuspendablePanel({
  onOpenFullPage,
}: Parameters<typeof AgentQuickPanel>[0]) {
  const [suspended, setSuspended] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setSuspended((value) => !value)}>
        Toggle navigation fixture
      </button>
      <AgentQuickPanel onOpenFullPage={onOpenFullPage} suspended={suspended} />
    </>
  );
}

function PluginWorkbenchRequestProbe() {
  const { request } = usePluginAgentWorkbench();
  return (
    <output>
      Plugin request · {request?.packageId ?? "none"}/
      {request?.instanceKey ?? "any"}
    </output>
  );
}

const pluginAgentContext = {
  instanceKey: "agent",
  managementRevision: "sha256:management-revision",
  packageId: "lenso.agent.loop",
  rootConfigurationToml: 'max_steps = 8\nmodel = "gpt-5.6-luna"\n',
  sourceDigest: "sha256:plugin-source",
  targetAgentId: "app",
} as const;

async function renderQueueHarness() {
  if (!container) {
    throw new Error("Browser test container is missing");
  }
  root = createRoot(container);
  flushSync(() => {
    root?.render(
      <ThemeScope>
        <QueueHarness />
      </ThemeScope>
    );
  });
  await nextFrame();
}

function QueueHarness() {
  const { draft, queuedPrompts, setDraft, submit } = useAgentConversation();
  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        submit();
      }}
    >
      <textarea
        aria-label="Queue prompt"
        onChange={(event) => setDraft(event.target.value)}
        value={draft}
      />
      <button type="submit">Submit prompt</button>
      {queuedPrompts.map((prompt) => (
        <span key={prompt.id}>{prompt.prompt}</span>
      ))}
    </form>
  );
}

function requiredComposer() {
  const composer = document.querySelector<HTMLDivElement>(
    '[contenteditable="true"][aria-label="Send a message to Lenso Agent"]'
  );
  if (!composer) {
    throw new Error("Agent composer was not rendered");
  }
  return composer;
}

function nextFrame() {
  return new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
}

function agentFetch(
  answer = "",
  includeAppAgent = false,
  toolMessages: readonly Record<string, unknown>[] = []
) {
  const sessionPrefix = crypto.randomUUID();
  let sessionSequence = 0;
  return vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input instanceof Request ? input.url : input);
    if (url.endsWith("/api/console/v1/agents")) {
      return Response.json({
        agents: [
          {
            capabilities: ["lenso.agent.plugin-configuration@1"],
            id: "console",
            label: "Console Agent",
            role: "console",
          },
          ...(includeAppAgent
            ? [
                {
                  capabilities: [],
                  id: "app",
                  label: "Lenso Agent",
                  role: "app",
                },
              ]
            : []),
        ],
      });
    }
    const bootstrapPath = includeAppAgent
      ? "/api/console/v1/agents/app/bootstrap"
      : "/api/console/v1/agent/bootstrap";
    if (url.endsWith(bootstrapPath)) {
      return Response.json({
        capabilities: {
          cancel: true,
          edit: true,
          sessionList: true,
          sessionRead: true,
          userInteraction: false,
        },
        mode: "console",
        profile: "default",
        tools: { allowed: [], available: [] },
        trajectory: "lenso.agent.trajectory@1",
      });
    }
    if (
      url.endsWith("/api/console/v1/agent/turns") &&
      init?.method === "POST"
    ) {
      sessionSequence += 1;
      const request = JSON.parse(String(init.body));
      const sessionId =
        request.session_id ?? `${sessionPrefix}-${sessionSequence}`;
      return new Response(
        streamBody(answer, toolMessages).replaceAll(
          "session-browser",
          sessionId
        ),
        {
          headers: { "content-type": "text/event-stream" },
        }
      );
    }
    return Response.json(
      { detail: "canonical refresh unavailable in test" },
      {
        status: 503,
      }
    );
  });
}

function queuedAgentFetch() {
  const encoder = new TextEncoder();
  let finishFirstTurn: (() => void) | undefined;
  let turn = 0;
  const fetchMock = vi.fn(
    async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input instanceof Request ? input.url : input);
      if (url.endsWith("/api/console/v1/agent/bootstrap")) {
        return Response.json({
          capabilities: {
            cancel: true,
            edit: true,
            sessionList: true,
            sessionRead: true,
            userInteraction: false,
          },
          mode: "console",
          profile: "default",
          tools: { allowed: [], available: [] },
          trajectory: "lenso.agent.trajectory@1",
        });
      }
      if (
        url.endsWith("/api/console/v1/agent/turns") &&
        init?.method === "POST"
      ) {
        turn += 1;
        if (turn === 1) {
          return new Response(
            new ReadableStream({
              start(controller) {
                finishFirstTurn = () => {
                  controller.enqueue(
                    encoder.encode(
                      'event: turn.completed\ndata: {"type":"turn_completed","session_id":"session-queue"}\n\n'
                    )
                  );
                  controller.close();
                };
              },
            }),
            { headers: { "content-type": "text/event-stream" } }
          );
        }
        return new Response(streamBody("done"), {
          headers: { "content-type": "text/event-stream" },
        });
      }
      return Response.json({ detail: "unavailable" }, { status: 503 });
    }
  );
  return {
    fetchMock,
    finishFirstTurn: () => {
      if (!finishFirstTurn) {
        throw new Error("First Turn has not started");
      }
      finishFirstTurn();
    },
  };
}

function streamBody(
  answer: string,
  toolMessages: readonly Record<string, unknown>[] = []
) {
  const frames: unknown[] = [
    ...toolMessages,
    ...[...answer].map((text, index) => ({
      message: {
        kind: "text_delta",
        sequence: String(index + 1),
        session_id: "session-browser",
        text,
      },
      type: "turn_message",
    })),
    {
      session_id: "session-browser",
      type: "turn_completed",
    },
  ];
  return `${frames.map((frame) => `data: ${JSON.stringify(frame)}`).join("\n\n")}\n\n`;
}

function pluginProposalMessages() {
  const argumentsJson = JSON.stringify({
    agent_id: "app",
    configuration_toml: 'model = "gpt-5.6-luna"\nmax_steps = 12\n',
    expected_revision: "sha256:demo-root",
    instance: "agent",
    plugin_id: "lenso.agent.loop",
  });
  return [
    {
      message: {
        arguments_json: argumentsJson,
        kind: "tool_started",
        sequence: "tool-1",
        text: "",
        tool_call_id: "call-plugin-proposal",
        tool_name: "check_plugin_change",
      },
      type: "turn_message",
    },
    {
      message: {
        arguments_json: argumentsJson,
        content: JSON.stringify({
          agentId: "app",
          application: "app_generation",
          authority: {
            kind: "remote_configuration_service",
            reference: "app",
          },
          baseRevision: "sha256:demo-root",
          baseSourceDigest: "sha256:demo-source",
          candidateRevision: "sha256:demo-candidate",
          diagnostics: [],
          instance: "agent",
          pluginId: "lenso.agent.loop",
          proposalDigest: "sha256:demo-proposal",
          schema: "lenso.plugin-configuration-proposal.v1",
          status: "ready",
        }),
        kind: "tool_completed",
        sequence: "tool-2",
        text: "",
        tool_call_id: "call-plugin-proposal",
        tool_name: "check_plugin_change",
      },
      type: "turn_message",
    },
  ];
}

function pluginInspectionMessages() {
  const argumentsJson = JSON.stringify({
    agent_id: "app",
    plugin_id: "lenso.agent.loop",
  });
  return [
    {
      message: {
        arguments_json: argumentsJson,
        kind: "tool_started",
        sequence: "inspect-plugin-1",
        text: "",
        tool_call_id: "call-plugin-inspection",
        tool_name: "inspect_plugin",
      },
      type: "turn_message",
    },
    {
      message: {
        arguments_json: argumentsJson,
        content: JSON.stringify({
          agentId: "app",
          authority: {
            kind: "remote_configuration_service",
            reference: "app",
          },
          instances: [
            {
              disableable: false,
              hasRootDifference: true,
              instanceKey: "agent",
              origin: "host-default",
              rootConfigurationBytes: 48,
              selection: "enabled",
              sourceDigest: `sha256:${"c".repeat(64)}`,
            },
          ],
          packageId: "lenso.agent.loop",
          packageRevision: "linked",
          revision: `sha256:${"a".repeat(64)}`,
          schema: "lenso.agent.console-plugin-inspection.v1",
          source: "host-default",
        }),
        kind: "tool_completed",
        sequence: "inspect-plugin-2",
        text: "",
        tool_call_id: "call-plugin-inspection",
        tool_name: "inspect_plugin",
      },
      type: "turn_message",
    },
  ];
}

function turnRequests(fetchMock: ReturnType<typeof agentFetch>) {
  return fetchMock.mock.calls.filter(([input, init]) => {
    const url = String(input instanceof Request ? input.url : input);
    return (
      url.endsWith("/api/console/v1/agent/turns") && init?.method === "POST"
    );
  });
}

function WorkspaceContextFixture() {
  const { setPageContext } = useAgentQuickPanel();
  useEffect(() => {
    setPageContext({
      label: "PROJ-1",
      text: "organization_id=org-1, issue_id=issue-1",
    });
    return () => setPageContext(null);
  }, [setPageContext]);
  return null;
}

function DraftInput({
  label,
  projectId,
}: {
  label: string;
  projectId: string;
}) {
  const [draft, setDraft] = useAgentDraft(
    { agentId: "app", projectId },
    "shared-draft-test"
  );
  return (
    <textarea
      aria-label={label}
      value={draft}
      onChange={(event) => setDraft(event.target.value)}
    />
  );
}
