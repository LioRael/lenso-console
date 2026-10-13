import assert from "node:assert/strict";

import { chromium } from "playwright";

// Unit store/draft tests do not exercise request retirement across a real keyed
// child remount while the host activation remains live, including StrictMode replay.
const origin = process.env.COMPOSED_PREVIEW_URL ?? "http://127.0.0.1:5177";
const browser = await chromium.launch({ headless: true });
const diagnostics = [];

try {
  const page = await browser.newPage({
    viewport: { height: 900, width: 1280 },
  });
  page.on("pageerror", (error) => diagnostics.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "warning" || message.type() === "error") {
      diagnostics.push(`${message.type()}: ${message.text()}`);
    }
  });
  // Cold source graphs can exceed the default 250-entry timing buffer before
  // the fixture locates the already-loaded host modules.
  await page.addInitScript(() => performance.setResourceTimingBufferSize(5000));
  await page.goto(origin);
  await page.waitForFunction(() =>
    performance
      .getEntriesByType("resource")
      .some((entry) =>
        new URL(entry.name).pathname.endsWith(
          "/console-dashboard/src/react.tsx"
        )
      )
  );

  await page.evaluate(async () => {
    // Reuse the host's module URLs, including Vite's dependency hashes. Never
    // import a second React or depend on a developer's absolute checkout path.
    const resources = performance
      .getEntriesByType("resource")
      .map((entry) => entry.name);
    const moduleURL = (pattern) => {
      const url = resources.find((resource) =>
        pattern.test(new URL(resource).pathname)
      );
      if (!url) {
        throw new Error(`Host module not loaded: ${pattern}`);
      }
      return url;
    };
    const [reactModule, clientModule, shellModule, dashboardModule] =
      await Promise.all([
        import(moduleURL(/\/deps\/react\.js$/u)),
        import(moduleURL(/\/deps\/react-dom_client\.js$/u)),
        import(
          moduleURL(
            /\/(?:console-react\/dist\/index|deps\/@lenso_console-react)\.js$/u
          )
        ),
        import(moduleURL(/\/console-dashboard\/src\/react\.tsx$/u)),
      ]);
    const React = reactModule.default;
    const { createRoot } = clientModule.default ?? clientModule;
    const { ConsoleShell } = shellModule;
    const { bindDashboard } = dashboardModule;
    const defaults = {
      instances: [
        {
          config: {},
          configVersion: 1,
          definition: { bindingId: "gone", widgetId: "gone" },
          id: "missing",
        },
      ],
      placements: [
        { column: 0, height: 1, instanceId: "missing", row: 0, width: 1 },
      ],
      schemaVersion: 1,
    };
    const empty = { instances: [], placements: [], schemaVersion: 1 };
    const reads = [];
    const saves = [];
    const binding = bindDashboard({
      id: "lifetime-regression",
      route: "/lifetime-regression",
      services: {
        defaults,
        permissionKey: "first",
        store: {
          read: ({ signal }) =>
            // oxlint-disable-next-line promise/avoid-new -- Hold actual page requests across remounts.
            new Promise((resolve) => {
              reads.push({
                permissionKey: binding.services.permissionKey,
                resolve,
                signal,
              });
            }),
          save: (input, { signal }) =>
            // oxlint-disable-next-line promise/avoid-new -- The pending write exposes its real child signal.
            new Promise((resolve) => {
              saves.push({ input: structuredClone(input), resolve, signal });
            }),
        },
        widgets: [],
      },
    });
    // Observe the public page props without replacing DashboardPage or its child.
    const actualPage = binding.definition.pages.dashboard.component;
    let host;
    binding.definition = {
      ...binding.definition,
      pages: {
        ...binding.definition.pages,
        dashboard: {
          ...binding.definition.pages.dashboard,
          component: (props) => {
            host = { activation: props.activation, signal: props.signal };
            return React.createElement(actualPage, props);
          },
        },
      },
    };
    const plugins = [binding];
    const router = {
      match: (pattern, pathname) => (pattern === pathname ? {} : null),
      navigate() {
        throw new Error("The lifetime regression must not navigate");
      },
      pathname: "/lifetime-regression",
    };
    const session = { scopeKey: "lifetime-regression", state: "ready" };
    const preview = document.querySelector("#root");
    const previousHidden = preview.hidden;
    const previousInert = preview.inert;
    preview.hidden = true;
    preview.inert = true;
    const node = document.createElement("div");
    document.body.append(node);
    const root = createRoot(node);
    const render = () =>
      root.render(
        React.createElement(
          React.StrictMode,
          null,
          React.createElement(ConsoleShell, {
            plugins,
            router,
            session,
          })
        )
      );
    let originalHost;
    window.dashboardLifetime = {
      defaults,
      get hostIsLive() {
        return (
          host.activation === originalHost.activation &&
          host.signal === originalHost.signal &&
          host.activation.isCurrent() &&
          !originalHost.signal.aborted
        );
      },
      reads,
      remount(permissionKey) {
        originalHost ??= host;
        binding.services.permissionKey = permissionKey;
        render();
      },
      resolveReads() {
        for (const read of reads) {
          read.resolve({
            document: read.signal.aborted ? defaults : empty,
            revision: "0",
          });
        }
      },
      resolveSave() {
        for (const save of saves) {
          save.resolve({ document: save.input.document, revision: "1" });
        }
      },
      saves,
      unmount() {
        root.unmount();
        node.remove();
        preview.hidden = previousHidden;
        preview.inert = previousInert;
      },
    };
    render();
  });
  await page.waitForFunction(() =>
    window.dashboardLifetime.reads.some((read) => !read.signal.aborted)
  );
  assert.ok(
    await page.evaluate(() => {
      const { reads } = window.dashboardLifetime;
      return reads.length > 1 && reads.some((read) => read.signal.aborted);
    }),
    "StrictMode replays the read without permanently aborting the child"
  );
  await page.evaluate(() => window.dashboardLifetime.remount("second"));
  await page.waitForFunction(() =>
    window.dashboardLifetime.reads.some(
      (read) => read.permissionKey === "second" && !read.signal.aborted
    )
  );
  assert.ok(
    await page.evaluate(() => {
      const harness = window.dashboardLifetime;
      return (
        harness.hostIsLive &&
        harness.reads
          .filter((read) => read.permissionKey === "first")
          .every((read) => read.signal.aborted)
      );
    }),
    "Permission remount aborts old pending reads while the same host stays live"
  );
  await page.evaluate(() => window.dashboardLifetime.resolveReads());
  const emptyState = page.getByText(
    "No widgets yet. Edit the dashboard to add an available widget.",
    { exact: true }
  );
  await emptyState.waitFor();
  const button = (name) => page.getByRole("button", { exact: true, name });
  await button("Edit dashboard").click();
  await button("Dashboard layout options").click();
  await button("Restore defaults").click();
  const restoreConfirmation = page.getByRole("dialog", {
    exact: true,
    name: "Restore default dashboard?",
  });
  await restoreConfirmation
    .getByRole("button", { exact: true, name: "Restore defaults" })
    .click();
  await restoreConfirmation.waitFor({ state: "hidden" });
  await button("Done editing dashboard").click();
  await page.waitForFunction(() => window.dashboardLifetime.saves.length === 1);
  assert.ok(
    await page.evaluate(
      () => !window.dashboardLifetime.saves[0].signal.aborted
    ),
    "The replacement child's save signal is live"
  );
  // Read cleanup already has its own controller. Retiring this pending save
  // proves the child lifetime guard itself, not just that read effect cleanup ran.
  await page.evaluate(() => window.dashboardLifetime.remount("third"));
  await page.waitForFunction(() =>
    window.dashboardLifetime.reads.some(
      (read) => read.permissionKey === "third" && !read.signal.aborted
    )
  );
  assert.ok(
    await page.evaluate(
      () =>
        window.dashboardLifetime.hostIsLive &&
        window.dashboardLifetime.saves[0].signal.aborted
    ),
    "Permission retirement aborts the pending write, not the parent lease"
  );
  await page.evaluate(() => {
    window.dashboardLifetime.resolveReads();
    window.dashboardLifetime.resolveSave();
  });
  await emptyState.waitFor();
  await button("Edit dashboard").click();
  await button("Done editing dashboard").waitFor();
  const result = await page.evaluate(() => ({
    defaults: window.dashboardLifetime.defaults,
    saves: window.dashboardLifetime.saves.map((save) => save.input),
  }));
  await page.evaluate(() => window.dashboardLifetime.unmount());
  assert.ok(
    await page.evaluate(() => {
      const { reads, saves } = window.dashboardLifetime;
      return [...reads, ...saves].every((request) => request.signal.aborted);
    }),
    "Unmount aborts all remaining read and save signals"
  );
  assert.equal(result.saves.length, 1, "Only the replacement child saves");
  assert.equal(result.saves[0].expectedRevision, "0");
  assert.deepEqual(result.saves[0].document, result.defaults);
  assert.deepEqual(diagnostics, [], "No browser errors or warnings");
  console.log(
    "Dashboard lifetime PASS: retired reads and pending save abort with parent live; fresh StrictMode child saves 1; unmount aborts remaining requests; no browser diagnostics."
  );
} finally {
  await browser.close();
}
