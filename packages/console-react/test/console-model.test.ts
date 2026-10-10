import { expect, test } from "bun:test";

import { bindConsole, defineConsolePlugin } from "../src/composition";
import {
  createConsoleModel,
  consoleRouteHref,
  defaultConsolePreferences,
  moveConsolePin,
  orderedConsolePins,
  visibleConsoleNavigation,
} from "../src/console-model";

const definition = defineConsolePlugin({
  id: "records",
  pages: {
    list: { component: () => null },
    history: { component: () => null },
    detail: { component: () => null },
  },
  pageGroups: {
    records: {
      label: "Records",
      defaultPage: "list",
      tabs: [
        { page: "list", label: "Records" },
        { page: "history", label: "History" },
      ],
      relatedPages: { detail: { activeTab: "list" } },
    },
  },
  navigation: [
    {
      id: "records",
      label: "Records",
      group: "records",
      defaultPlacement: "primary",
    },
  ],
});
const binding = bindConsole(definition, {
  id: "first",
  services: {},
  routes: { list: "/records", history: "/history", detail: "/records/:id" },
});

// Existing Dock-only fixtures do not exercise binding assembly or route registration.
test("allows multi-installation without local page or navigation ID collisions and keeps detail pages out of global navigation", () => {
  const second = bindConsole(definition, {
    id: "second",
    services: {},
    routes: {
      list: "/second",
      history: "/second/history",
      detail: "/second/records/:id",
    },
  });
  const model = createConsoleModel([binding, second], "/console/");
  expect(model.routes.map((route) => route.pattern)).toEqual([
    "/console/records",
    "/console/history",
    "/console/records/:id",
    "/console/second",
    "/console/second/history",
    "/console/second/records/:id",
  ]);
  expect(model.navigation).toHaveLength(2);
  expect(model.navigation[0]!.id).not.toBe(model.navigation[1]!.id);
  expect(consoleRouteHref(model.routes[2]!.pattern, { id: "a/b" })).toBe(
    "/console/records/a%2Fb"
  );
});
test("rejects duplicate binding IDs, normalized paths and ambiguous parameter routes before invoking the host matcher", () => {
  expect(() => createConsoleModel([binding, binding])).toThrow(/binding ID/);
  for (const detail of [
    "/records/",
    "//records",
    "/records/:other",
    "/records/new",
  ]) {
    const list =
      detail.includes(":") || detail.endsWith("new")
        ? "/records/:id"
        : "/records";
    const candidate = {
      ...binding,
      routes: { list, history: "/history", detail },
    };
    expect(() => createConsoleModel([candidate])).toThrow(/Conflicting/);
  }
  expect(() =>
    createConsoleModel(
      [{ ...binding, routes: { list: "/%2e%2e/admin" } }],
      "/console"
    )
  ).toThrow(/Invalid Console path/);
  expect(() => consoleRouteHref("/console/records/:id", { id: ".." })).toThrow(
    /Invalid Console route parameter/
  );
});
test("rejects dangling navigation groups and explicit detail active-tab mappings", () => {
  expect(() =>
    createConsoleModel([
      {
        ...binding,
        definition: {
          ...definition,
          navigation: [{ id: "bad", label: "Bad", group: "missing" }],
        },
      },
    ])
  ).toThrow(/Unknown Console group/);
  expect(() =>
    createConsoleModel([
      {
        ...binding,
        definition: {
          ...definition,
          pageGroups: {
            records: {
              ...definition.pageGroups!.records!,
              relatedPages: { detail: { activeTab: "missing" } },
            },
          },
        },
      },
    ])
  ).toThrow(/active tab/);
});
test("preserves explicit empty pins, unavailable references and chosen order rather than promoting the active route", () => {
  const model = createConsoleModel([binding]);
  const defaults = defaultConsolePreferences(model.navigation);
  const unavailable = { bindingId: "removed", navigationId: "still-pinned" };
  expect(
    orderedConsolePins(model.navigation, { ...defaults, pinned: [] })
  ).toEqual([]);
  const preferences = {
    ...defaults,
    pinned: [unavailable, ...defaults.pinned],
  };
  expect(
    orderedConsolePins(model.navigation, preferences).map((item) => item.label)
  ).toEqual(["Records"]);
  expect(preferences.pinned[0]).toEqual(unavailable);
  expect(moveConsolePin(preferences.pinned, 1, 0)).toEqual([
    ...defaults.pinned,
    unavailable,
  ]);
  expect(
    visibleConsoleNavigation(model.navigation, {
      state: "ready",
      scopeKey: "restricted",
      canAccess: () => false,
    })
  ).toEqual([]);
  expect(preferences.pinned).toHaveLength(2);
});
