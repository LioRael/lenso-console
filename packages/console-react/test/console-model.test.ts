import { expect, test } from "bun:test";

import { bindConsole, defineConsolePlugin } from "../src/composition";
import {
  createConsoleModel,
  consoleRouteHref,
  defaultConsolePreferences,
  moveConsolePin,
  orderedConsolePins,
  visibleConsoleDockViews,
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

test("Dock-only local bindings preserve explicit order and use independent admission without fake page IDs", () => {
  const composer = defineConsolePlugin({
    id: "composer",
    pages: {},
    dockViews: [
      { id: "draft", label: "Draft", icon: null, component: () => null },
      { id: "history", label: "History", icon: null, component: () => null },
    ],
  });
  const first = bindConsole(composer, {
    id: "first",
    routes: {},
    services: {},
  });
  const second = bindConsole(composer, {
    id: "second",
    routes: {},
    services: {},
  });
  const leading = [
    { bindingId: "second", viewId: "history" },
    { bindingId: "first", viewId: "draft" },
  ];
  const model = createConsoleModel([first, second], "/", leading);
  expect(model.routes).toEqual([]);
  expect(model.navigation).toEqual([]);
  expect(model.dockViews.map((item) => item.reference)).toEqual(leading);
  expect(
    visibleConsoleDockViews(model.dockViews, {
      state: "ready",
      scopeKey: "allowed",
      canAccess: () => {
        throw new Error("Dock admission must not call page admission");
      },
      canAccessDockView: (bindingId, viewId) =>
        bindingId === "first" && viewId === "draft",
    }).map((item) => item.reference)
  ).toEqual([leading[1]!]);
  expect(
    visibleConsoleDockViews(model.dockViews, {
      state: "loading",
      scopeKey: "pending",
    })
  ).toEqual([]);
  expect(createConsoleModel([first]).dockViews).toEqual([]);
});

test("Dock assembly rejects empty or duplicate local IDs and duplicate or dangling app references", () => {
  const view = {
    id: "draft",
    label: "Draft",
    icon: null,
    component: () => null,
  };
  const make = (views: (typeof view)[]) =>
    bindConsole(
      defineConsolePlugin({
        id: "composer",
        pages: {},
        dockViews: views,
      }),
      { id: "local", services: { view }, routes: {} }
    );
  for (const views of [
    [{ ...view, id: "" }],
    [{ ...view, id: " " }],
    [view, view],
  ]) {
    expect(() => createConsoleModel([make(views)])).toThrow(/Dock view ID/);
  }
  const reference = { bindingId: "local", viewId: "draft" };
  expect(() =>
    createConsoleModel([make([view])], "/", [reference, reference])
  ).toThrow(/Duplicate Console Dock reference/);
  for (const invalid of [
    { bindingId: "missing", viewId: "draft" },
    { bindingId: "local", viewId: "missing" },
  ]) {
    expect(() => createConsoleModel([make([view])], "/", [invalid])).toThrow(
      /Unknown Console Dock reference/
    );
  }
});
