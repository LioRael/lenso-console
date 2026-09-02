import { ThemeScope } from "@lenso/ui/theme-scope";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { flushSync } from "react-dom";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { page, userEvent } from "vitest/browser";

import {
  PluginAgentAction,
  pluginAgentDraft,
} from "../plugins/plugin-agent-handoff";
import { AgentIdentityProvider } from "./agent-identity-context";
import { AgentQuickPanel } from "./agent-quick-panel";
import { AgentQuickPanelProvider } from "./agent-quick-panel-context";
import { useAgentConversation } from "./use-agent-conversation";

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
  test("keeps product hover feedback after the Lenso xstyle boundary", async () => {
    const fetchMock = agentFetch();
    await renderPanel(fetchMock);

    const trigger = page.getByRole("button", { name: "Agent" });
    const triggerElement = document.querySelector<HTMLButtonElement>(
      'button[aria-label="Agent"]'
    );
    if (!triggerElement) {
      throw new Error("Agent trigger was not rendered");
    }
    const restingBackground = getComputedStyle(triggerElement).backgroundColor;
    await userEvent.hover(trigger);

    expect(getComputedStyle(triggerElement).backgroundColor).not.toBe(
      restingBackground
    );
  });

  test("focuses the composer and keeps Shift+Enter as a newline", async () => {
    const fetchMock = agentFetch();
    await renderPanel(fetchMock);

    await userEvent.click(page.getByRole("button", { name: "Agent" }));
    await nextFrame();
    const composerElement = requiredComposer();
    const composer = page.elementLocator(composerElement);

    await userEvent.click(composer);
    await expect.element(composer).toHaveFocus();
    expect(getComputedStyle(composerElement).outlineStyle).toBe("none");
    expect(getComputedStyle(composerElement).outlineWidth).toBe("0px");
    await userEvent.fill(composer, "First line");
    await userEvent.keyboard("{Shift>}{Enter}{/Shift}Second line");
    await nextFrame();

    await expect.element(composer).toHaveValue("First line\nSecond line");
    expect(turnRequests(fetchMock)).toHaveLength(0);
  });

  test("does not submit Enter while IME composition is active", async () => {
    const fetchMock = agentFetch();
    await renderPanel(fetchMock);

    await userEvent.click(page.getByRole("button", { name: "Agent" }));
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

    await expect.element(composer).toHaveValue("输入中");
    expect(turnRequests(fetchMock)).toHaveLength(0);
  });

  test("renders an exact long streamed answer after Enter submission", async () => {
    const answer = "batched ".repeat(200).trimEnd();
    const fetchMock = agentFetch(answer);
    await renderPanel(fetchMock);

    await userEvent.click(page.getByRole("button", { name: "Agent" }));
    await nextFrame();
    const composer = page.elementLocator(requiredComposer());
    await userEvent.fill(composer, "Stream a long answer");
    await userEvent.keyboard("{Enter}");

    await expect
      .poll(() => document.body.textContent?.includes(answer))
      .toBe(true);
    expect(turnRequests(fetchMock)).toHaveLength(1);
  });

  test("opens the full App Agent identity discovered from the catalog", async () => {
    const fetchMock = agentFetch("", true);
    const onOpenFullPage = vi.fn();
    await renderPanel(fetchMock, onOpenFullPage);

    await expect
      .poll(() =>
        fetchMock.mock.calls.some(([input]) =>
          String(input instanceof Request ? input.url : input).endsWith(
            "/api/console/v1/agents/app/bootstrap"
          )
        )
      )
      .toBe(true);
    await userEvent.click(page.getByRole("button", { name: "Agent" }));
    await userEvent.click(page.getByRole("button", { name: "Open full page" }));

    expect(onOpenFullPage).toHaveBeenCalledWith("app", undefined);
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
    await expect
      .element(composer)
      .toHaveValue(pluginAgentDraft(pluginAgentContext));
    expect(turnRequests(fetchMock)).toHaveLength(0);
  });
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
  includePluginAction = false
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
  flushSync(() => {
    root?.render(
      <QueryClientProvider client={client}>
        <AgentIdentityProvider>
          <AgentQuickPanelProvider>
            <ThemeScope>
              {includePluginAction ? (
                <PluginAgentAction {...pluginAgentContext} />
              ) : null}
              <AgentQuickPanel onOpenFullPage={onOpenFullPage} />
            </ThemeScope>
          </AgentQuickPanelProvider>
        </AgentIdentityProvider>
      </QueryClientProvider>
    );
  });
  await nextFrame();
}

const pluginAgentContext = {
  agentId: "console",
  instanceKey: "agent",
  managementRevision: "sha256:management-revision",
  packageId: "lenso.agent.loop",
  rootConfigurationToml: 'max_steps = 8\nmodel = "gpt-5.6-luna"\n',
  sourceDigest: "sha256:plugin-source",
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
  const composer = document.querySelector<HTMLTextAreaElement>(
    'textarea[aria-label="Send a message to Lenso Agent"]'
  );
  if (!composer) {
    throw new Error("Agent composer was not rendered");
  }
  return composer;
}

function nextFrame() {
  return new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
}

function agentFetch(answer = "", includeAppAgent = false) {
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
      return new Response(streamBody(answer), {
        headers: { "content-type": "text/event-stream" },
      });
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

function streamBody(answer: string) {
  const frames: unknown[] = [...answer].map((text, index) => ({
    message: {
      kind: "text_delta",
      sequence: String(index + 1),
      session_id: "session-browser",
      text,
    },
    type: "turn_message",
  }));
  frames.push({
    session_id: "session-browser",
    type: "turn_completed",
  });
  return `${frames.map((frame) => `data: ${JSON.stringify(frame)}`).join("\n\n")}\n\n`;
}

function turnRequests(fetchMock: ReturnType<typeof agentFetch>) {
  return fetchMock.mock.calls.filter(([input, init]) => {
    const url = String(input instanceof Request ? input.url : input);
    return (
      url.endsWith("/api/console/v1/agent/turns") && init?.method === "POST"
    );
  });
}
