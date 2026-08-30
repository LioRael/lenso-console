import { ThemeScope } from "@lenso/ui/theme-scope";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { flushSync } from "react-dom";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { page, userEvent } from "vitest/browser";

import { AgentQuickPanel } from "./agent-quick-panel";
import { AgentTargetProvider } from "./agent-target-context";

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
  test("focuses the composer and keeps Shift+Enter as a newline", async () => {
    const fetchMock = agentFetch();
    await renderPanel(fetchMock);

    await userEvent.click(page.getByRole("button", { name: "Agent" }));
    await nextFrame();
    const composerElement = requiredComposer();
    const composer = page.elementLocator(composerElement);

    await userEvent.click(composer);
    await expect.element(composer).toHaveFocus();
    await userEvent.fill(composer, "First line");
    await userEvent.keyboard("{Shift>}{Enter}{/Shift}Second line");
    await nextFrame();

    await expect.element(composer).toHaveValue("First line\nSecond line");
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
});

async function renderPanel(fetchMock: ReturnType<typeof agentFetch>) {
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
        <AgentTargetProvider>
          <ThemeScope>
            <AgentQuickPanel onOpenFullPage={() => undefined} />
          </ThemeScope>
        </AgentTargetProvider>
      </QueryClientProvider>
    );
  });
  await nextFrame();
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

function agentFetch(answer = "") {
  return vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
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
