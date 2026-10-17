import "@lenso/tokens/styles.css";
import "@lenso/console-react/styles.css";
import { Button } from "@lenso/ui/button";
import { Tooltip } from "@lenso/ui/tooltip";
import { useState } from "react";
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
function Fixture() {
  const [signedIn, setSignedIn] = useState(true);
  return (
    <Tooltip.Provider>
      <Button onClick={() => setSignedIn(!signedIn)}>
        {signedIn ? "Fixture sign out" : "Fixture sign in"}
      </Button>
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
        session={{
          state: signedIn ? "ready" : "authentication-required",
          scopeKey: "isolated-task-test",
        }}
      />
    </Tooltip.Provider>
  );
}
createRoot(document.getElementById("root")!).render(<Fixture />);
