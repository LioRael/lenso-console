import "@lenso/tokens/styles.css";
import "@lenso/console-react/styles.css";
import { Tooltip } from "@lenso/ui/tooltip";
import { createRoot } from "react-dom/client";

import { ComposedConsole } from "../../../examples/composed-console/composition";
import {
  createSampleAuth,
  createSampleDashboard,
  createSampleOrders,
  sampleCatalog,
} from "../../../examples/composed-console/sample-clients";
import { createTaskClient } from "../src/client";

const client = createTaskClient({
  tasks: "fixture-tasks",
  retry: true,
  cancel: true,
  async invoke(service, method, input, signal) {
    const response = await fetch("/task-api", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ service, method, input }),
      signal,
    });
    if (!response.ok) {
      throw new Error("Task operation unavailable");
    }
    return response.json();
  },
});
if (new URLSearchParams(location.search).has("dark")) {
  document.documentElement.dataset.theme = "dark";
  document.documentElement.style.colorScheme = "dark";
}
createRoot(document.getElementById("root")!).render(
  <Tooltip.Provider>
    <ComposedConsole
      tasks={client}
      orders={createSampleOrders()}
      confirmArchive={async () => false}
      workforce={createSampleAuth("workforce")}
      customers={createSampleAuth("customers")}
      dashboard={createSampleDashboard()}
      catalog={sampleCatalog}
      router={{
        pathname: "/tasks",
        navigate() {
          /* Single tested route. */
        },
        match: (pattern, pathname) => (pattern === pathname ? {} : null),
      }}
      session={{ state: "ready", scopeKey: "isolated-task-test" }}
    />
  </Tooltip.Provider>
);
