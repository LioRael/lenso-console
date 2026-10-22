import "@lenso/tokens/styles.css";
import "@lenso/console-react/styles.css";
import { Button } from "@lenso/ui/button";
import { Tooltip } from "@lenso/ui/tooltip";
import { useState } from "react";
import { createRoot } from "react-dom/client";

import { createAuditClient } from "../../../packages/console-audit/src/client";
import { auditConsole } from "../../../packages/console-audit/src/react";
import { createTaskClient } from "../../../packages/console-tasks/src/client";
import { ComposedConsole } from "../composition";
import {
  createSampleAuth,
  createSampleDashboard,
  createSampleOrders,
  sampleCatalog,
} from "../sample-clients";

async function invoke(
  service: string,
  method: string,
  input: unknown,
  signal: AbortSignal
) {
  const response = await fetch("/fixture-api", {
    method: "POST",
    body: JSON.stringify({ service, method, input }),
    signal,
  });
  if (!response.ok) {
    throw new Error("Fixture operation unavailable");
  }
  return response.json();
}
const tasks = createTaskClient({
  tasks: "unused",
  scheduler: "fixture.schedules",
  scheduleControls: true,
  invoke,
});
tasks.list = async () => ({ items: [], nextCursor: null });
const audit = createAuditClient({ service: "fixture.audit-page", invoke });
const additionalPlugins = [
  auditConsole({ id: "audit.fixture", route: "/audit", client: audit }),
];
const clients = {
  orders: createSampleOrders(),
  workforce: createSampleAuth("workforce"),
  customers: createSampleAuth("customers"),
  dashboard: createSampleDashboard(),
  catalog: sampleCatalog,
};
function Fixture() {
  const [path, setPath] = useState("/tasks");
  return (
    <Tooltip.Provider>
      <nav aria-label="Fixture controls">
        <Button onClick={() => setPath("/tasks")}>Fixture schedules</Button>
        <Button onClick={() => setPath("/audit")}>Fixture audit</Button>
        <Button
          onClick={() => {
            document.documentElement.dataset.theme =
              document.documentElement.dataset.theme === "dark"
                ? "light"
                : "dark";
          }}
        >
          Fixture theme
        </Button>
        {["lose-ack", "revoke", "restore"].map((control) => (
          <Button
            key={control}
            onClick={() =>
              void fetch("/fixture-api", {
                method: "POST",
                body: JSON.stringify({ control }),
              })
            }
          >
            {control}
          </Button>
        ))}
      </nav>
      <ComposedConsole
        {...clients}
        tasks={tasks}
        additionalPlugins={additionalPlugins}
        confirmArchive={async () => false}
        router={{
          pathname: path,
          navigate: setPath,
          match: (pattern, pathname) => (pattern === pathname ? {} : null),
        }}
        session={{ state: "ready", scopeKey: "isolated-operations-fixture" }}
      />
    </Tooltip.Provider>
  );
}
createRoot(document.getElementById("root")!).render(<Fixture />);
