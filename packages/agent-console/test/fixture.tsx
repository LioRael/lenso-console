import "@fontsource-variable/inter";
import "@lenso/tokens/styles.css";
import "@lenso/console-react/styles.css";
import "../../../plugins/console/shell/src/styles.css";
import {
  ConsoleShell,
  bindConsole,
  defineConsolePlugin,
  type ConsoleLocalPageProps,
} from "@lenso/console-react";
import { Input } from "@lenso/ui/input";
import { Tooltip } from "@lenso/ui/tooltip";
import { History, LayoutDashboard } from "lucide-react";
import { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";

import { createAgentConsoleClient } from "../src/client";
import { agentConsole, type AgentConsoleServices } from "../src/react";

const params = new URLSearchParams(location.search);
if (location.pathname.startsWith("/test/")) {
  history.replaceState(null, "", `/workspace${location.search}`);
}
document.documentElement.dataset.theme =
  params.get("theme") === "dark" ? "dark" : "light";
document.documentElement.style.colorScheme =
  params.get("theme") === "dark" ? "dark" : "light";
function navigate(href: string) {
  history.pushState(null, "", href);
  window.dispatchEvent(new PopStateEvent("popstate"));
}
function Workspace() {
  const [draft, setDraft] = useState("");
  return (
    <main
      style={{ maxWidth: 900, padding: "96px 28px 120px", margin: "0 auto" }}
    >
      <h1>Agent Console protocol fixture</h1>
      <p>
        Isolated synthetic protocol replay. No real Agent, model provider,
        account, or business tool is used.
      </p>
      <label htmlFor="page-draft">
        Page draft
        <Input
          id="page-draft"
          aria-label="Page draft"
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
        />
      </label>
      {Array.from({ length: 12 }, (_, index) => (
        <p key={index}>
          Workspace content {index + 1}. The Agent Dock must preserve this page
          and its draft.
        </p>
      ))}
      <label htmlFor="last-control">
        Last content control
        <Input id="last-control" aria-label="Last content control" />
      </label>
    </main>
  );
}
const pages = defineConsolePlugin({
  id: "agent-fixture-pages",
  pages: {
    workspace: { component: Workspace },
    history: {
      component: () => (
        <main style={{ padding: 96 }}>
          <h1>History fixture</h1>
        </main>
      ),
    },
    settings: {
      component: ({ navigation }: ConsoleLocalPageProps) => (
        <main style={{ padding: 96 }}>
          <h1>Host connection configuration</h1>
          <p>The host owns provider, account and model selection.</p>
          <button
            onClick={() => {
              selectSyntheticModel();
              navigation.go("workspace");
            }}
          >
            Return to workspace
          </button>
        </main>
      ),
    },
  },
  navigation: [
    {
      id: "workspace",
      label: "Workspace",
      icon: <LayoutDashboard size={18} aria-hidden="true" />,
      page: "workspace",
      defaultPlacement: "primary",
    },
    {
      id: "history",
      label: "History",
      icon: <History size={18} aria-hidden="true" />,
      page: "history",
      defaultPlacement: "primary",
    },
  ],
});
const state = (params.get("state") ?? "ready") as NonNullable<
  AgentConsoleServices["connection"]
>["state"];
let connection: AgentConsoleServices["connection"] = {
  state,
  provider: "Protocol replay",
  account: "Synthetic account",
  ...(state === "model-required" ? {} : { model: "No model invoked" }),
  scope: "Isolated fixture scope",
};
const readinessListeners = new Set<() => void>();
function selectSyntheticModel() {
  connection = { ...connection, state: "ready", model: "No model invoked" };
  for (const listener of readinessListeners) {
    listener();
  }
}
const agent = agentConsole({
  id: "fixture-agent",
  ...(state === "disconnected"
    ? {}
    : {
        client: createAgentConsoleClient({
          basePath: "/agent-replay",
          profile: "protocol-replay",
          fetch: (input, init) => fetch(input, init),
        }),
      }),
  connectionSource: {
    getSnapshot: () => connection,
    subscribe: (listener) => {
      readinessListeners.add(listener);
      return () => {
        readinessListeners.delete(listener);
      };
    },
  },
  configure: {
    label:
      state === "reauthorize"
        ? "Reauthorize account"
        : state === "model-required"
          ? "Choose model"
          : "Review connection",
    open: () => navigate("/connection-settings"),
  },
  notice: "Synthetic protocol replay — not a live provider test.",
});
const plugins = [
  bindConsole(pages, {
    id: "fixture-pages",
    routes: {
      workspace: "/workspace",
      history: "/history",
      settings: "/connection-settings",
    },
    services: {},
  }),
  agent,
];
const dock = { leading: [{ bindingId: "fixture-agent", viewId: "agent" }] };
function App() {
  const [pathname, setPathname] = useState(location.pathname);
  useEffect(() => {
    const update = () => setPathname(location.pathname);
    window.addEventListener("popstate", update);
    return () => window.removeEventListener("popstate", update);
  }, []);
  return (
    <Tooltip.Provider>
      <ConsoleShell
        plugins={plugins}
        dock={dock}
        router={{
          pathname,
          navigate,
          match: (pattern, path) => (pattern === path ? {} : null),
        }}
        session={{ state: "ready", scopeKey: "isolated-agent-fixture" }}
        navigationDefaults={{ mode: "dock", position: "bottom" }}
      />
    </Tooltip.Provider>
  );
}
createRoot(document.getElementById("root")!).render(<App />);
