import "@lenso/tokens/styles.css";
import "@lenso/console-react/styles.css";
import { ConsoleShell } from "@lenso/console-react";
import { Tooltip } from "@lenso/ui/tooltip";
import { createRoot } from "react-dom/client";

import type { Job, TaskClient } from "../src/client";
import { tasksConsole } from "../src/react";

const params = new URLSearchParams(location.search);
let failedRead = params.has("read-error");
let failedWrite = params.has("write-error");
const job: Job = {
  jobId: "20f8ed2d-bcec-4f6a-8c40-9a7d3a0a4bbb",
  task: "local.report",
  state: "failed",
  attempt: 1,
  maxAttempts: 3,
  cancelRequested: false,
  failure: "handler-failed",
};
(window as Window & { writes: number }).writes = 0;
const client: TaskClient = {
  async list() {
    await new Promise((resolve) => setTimeout(resolve, 60));
    if (failedRead) {
      failedRead = false;
      throw new Error("local failure");
    }
    return { items: params.has("empty") ? [] : [{ ...job }], nextCursor: null };
  },
  async get() {
    return { ...job };
  },
  async retry() {
    (window as Window & { writes: number }).writes += 1;
    await new Promise((resolve) => setTimeout(resolve, 120));
    if (failedWrite) {
      failedWrite = false;
      throw new Error("local failure");
    }
    job.state = "pending";
    job.failure = null;
  },
  async cancel() {
    (window as Window & { writes: number }).writes += 1;
    job.cancelRequested = true;
    return "requested";
  },
  async schedules() {
    return [
      {
        id: crypto.randomUUID(),
        task: "local.report",
        state: "active",
        revision: 1,
        nextAt: Date.UTC(2026, 10, 1),
      },
    ];
  },
};
if (params.has("dark")) {
  document.documentElement.classList.add("dark");
  document.documentElement.style.colorScheme = "dark";
}
createRoot(document.getElementById("root")!).render(
  <Tooltip.Provider>
    <ConsoleShell
      plugins={[tasksConsole({ id: "local.tasks", route: "/", client })]}
      router={{
        pathname: "/",
        navigate() {
          /* This fixture has a single route. */
        },
        match: () => ({}),
      }}
      session={{ state: "ready", scopeKey: "local-test" }}
    />
  </Tooltip.Provider>
);
