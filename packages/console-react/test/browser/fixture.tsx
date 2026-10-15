import { Modal } from "@lenso/ui/modal";
import { Popover } from "@lenso/ui/popover";
import React, {
  createContext,
  useContext,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { flushSync } from "react-dom";
import { createRoot } from "react-dom/client";

import {
  ConsoleActionScope,
  ConsoleActionHost,
  ConsolePageScope,
  ConsoleShell,
  ConsoleDockContent,
  ConsoleLayout,
  ConsoleTableContext,
  ConsoleTableSearch,
  type ConsoleFilterCondition,
  type ConsoleFilterGroup,
  evaluateConsoleFilter,
  matchesConsoleFilterDate,
  ConsoleInteractionHost,
  bindConsole,
  defineConsolePlugin,
} from "../../dist/index.js";
import type {
  ConsoleLocalPageProps,
  ConsoleDockViewProps,
  ConsolePreferenceSnapshot,
  ConsolePreferences,
} from "../../src/composition";
import type { ConsolePageContribution } from "../../src/console-action-scope";

import "@fontsource-variable/inter";

import "@lenso/tokens/styles.css";
import "../../../../plugins/console/shell/src/styles.css";
import "../../dist/styles.css";

const activations: ConsoleLocalPageProps["activation"][] = [];
const signals: AbortSignal[] = [];
const dockControllers: ConsoleDockViewProps["dock"][] = [];
const dockSignals: AbortSignal[] = [];
const DockContext = createContext("missing");
const dockFixture = new URLSearchParams(location.search).has("dock");
const manyDockViews = new URLSearchParams(location.search).has("many-dock");
const dockViewCount = manyDockViews
  ? Number(new URLSearchParams(location.search).get("dock-count") ?? 8)
  : 1;
const clearanceFixture = new URLSearchParams(location.search).has("clearance");
let composerMounts = 0;
let resolveExit: ((allow: boolean) => void) | undefined;
let guardExit = false;
let crashDock: (() => void) | undefined;
let sampledDock: Element | null = null;
let geometryFrame = 0;
const geometrySamples = new Set<string>();
function sampleGeometry() {
  if (sampledDock) {
    const rect = sampledDock.getBoundingClientRect();
    geometrySamples.add(`${Math.round(rect.width)},${Math.round(rect.height)}`);
    geometryFrame = requestAnimationFrame(sampleGeometry);
  }
}
let mounts = 0;
let actions = 0;
let blocked = false;
let changeRecordSelection: ((value: boolean) => void) | null = null;
let changeRecordOverlay: ((value: boolean) => void) | null = null;
let changeRecordReturn: ((value: boolean) => void) | null = null;
let revision = 0;
let preferenceSeed = 0;
let conflict = false;
let snapshot: ConsolePreferenceSnapshot = { revision: "initial", value: null };
const store = {
  async read() {
    return snapshot;
  },
  async save(input: {
    expectedRevision: string;
    value: NonNullable<ConsolePreferenceSnapshot["value"]>;
  }) {
    if (conflict || input.expectedRevision !== snapshot.revision) {
      throw new Error("CAS conflict");
    }
    revision += 1;
    snapshot = { revision: `${revision}`, value: input.value };
    return snapshot;
  },
};
function Records({ activation, signal, navigation }: ConsoleLocalPageProps) {
  const [selected, setSelected] = useState<number[]>([]);
  const [running, setRunning] = useState(false);
  const [text, setText] = useState("");
  const [overlayOpen, setOverlayOpen] = useState(false);
  const [returnAvailable, setReturnAvailable] = useState(true);
  const [context, setContext] = useState<
    "fallback" | "hidden" | "object" | "tabs"
  >("fallback");
  useLayoutEffect(() => {
    mounts += 1;
    activations.push(activation);
    signals.push(signal);
    const change = (value: boolean) => {
      if (activation.isCurrent()) {
        setSelected(value ? [1] : []);
      }
    };
    changeRecordSelection = change;
    changeRecordOverlay = setOverlayOpen;
    changeRecordReturn = setReturnAvailable;
    return () => {
      if (changeRecordSelection === change) {
        changeRecordSelection = null;
        changeRecordOverlay = null;
        changeRecordReturn = null;
      }
    };
  }, [activation, signal]);
  return (
    <>
      {clearanceFixture && (
        <input
          aria-label="First page control"
          style={{ display: "block", marginInline: "auto" }}
        />
      )}
      <h1>Records page</h1>
      {dockFixture && (
        <button onClick={() => setRunning((value) => !value)}>
          Toggle selection execution
        </button>
      )}
      <Popover.Root open={overlayOpen} onOpenChange={setOverlayOpen}>
        <Popover.Trigger>Record overlay</Popover.Trigger>
        <Popover.Portal>
          <Popover.Positioner>
            <Popover.Popup aria-label="Record overlay" initialFocus={false}>
              <button>Overlay action</button>
            </Popover.Popup>
          </Popover.Positioner>
        </Popover.Portal>
      </Popover.Root>
      <ConsolePageScope
        scopeKey={activation.key}
        value={{
          commands: [
            {
              id: "clear-draft",
              label: "Clear record draft",
              disabled: !text,
              onInvoke: () => setText(""),
            },
          ],
          ...(context === "fallback"
            ? {}
            : {
                context:
                  context === "hidden"
                    ? { kind: "hidden" as const }
                    : context === "object"
                      ? {
                          kind: "object" as const,
                          label: "Current record",
                          id: "42",
                          status: "Draft",
                          ...(returnAvailable && {
                            return: {
                              label: "Return to record tabs",
                              onInvoke: () => setContext("fallback"),
                            },
                          }),
                        }
                      : {
                          kind: "tabs" as const,
                          label: "Contributed views",
                          activeId: "records",
                          tabs: [
                            {
                              id: "records",
                              label: "Contributed records",
                              href: navigation.href("records"),
                            },
                            {
                              id: "history",
                              label: "Contributed history",
                              href: navigation.href("history"),
                            },
                          ],
                        },
              }),
        }}
      />
      {(["fallback", "hidden", "object", "tabs"] as const).map((mode) => (
        <button key={mode} onClick={() => setContext(mode)}>
          {mode} context
        </button>
      ))}
      <input
        aria-label="Persistent draft"
        value={text}
        onChange={(event) => setText(event.target.value)}
      />
      <button onClick={() => setSelected([1])}>Select record</button>
      {[1, 2, 3].map((id) => (
        <label key={id}>
          <input
            type="checkbox"
            checked={selected.includes(id)}
            onChange={(event) =>
              setSelected((current) =>
                event.target.checked
                  ? [...current, id]
                  : current.filter((item) => item !== id)
              )
            }
          />
          Select record {id}
        </label>
      ))}
      <a
        href={navigation.href("detail", { id: "42" })}
        onClick={(event) => {
          event.preventDefault();
          navigation.go("detail", { id: "42" });
        }}
      >
        Record detail
      </a>
      <ConsoleActionScope
        scopeKey={activation.key}
        value={
          selected.length
            ? {
                count: selected.length,
                scopeLabel: "Records",
                running,
                actions: [
                  {
                    id: "archive",
                    label: "Archive selected record",
                    icon: <span>A</span>,
                    onInvoke: () => {
                      actions += 1;
                    },
                  },
                ],
                onExit: () => setSelected([]),
              }
            : null
        }
      />
      {clearanceFixture && (
        <>
          <div style={{ height: 2000 }} />
          <button
            style={{ display: "block", marginInline: "auto" }}
            onClick={() => setText("End reached")}
          >
            End page action
          </button>
        </>
      )}
    </>
  );
}
function TestComposer({
  inputRef,
  value,
  onChange,
  onFocus,
}: {
  inputRef: React.RefObject<HTMLTextAreaElement | null>;
  value: string;
  onChange(value: string): void;
  onFocus(): void;
}) {
  useLayoutEffect(() => {
    composerMounts += 1;
  }, []);
  return (
    <form onSubmit={(event) => event.preventDefault()}>
      <textarea
        aria-label="Plugin draft"
        ref={inputRef}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        onFocus={onFocus}
      />
    </form>
  );
}
function TestDockView({ dock, signal }: ConsoleDockViewProps) {
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const [draft, setDraft] = useState("");
  const [failed, setFailed] = useState(false);
  useLayoutEffect(() => {
    dockControllers.push(dock);
    dockSignals.push(signal);
  }, [dock, signal]);
  useLayoutEffect(() => {
    crashDock = () => setFailed(true);
    return () => {
      crashDock = undefined;
    };
  }, []);
  if (failed) {
    throw new Error("Test Dock renderer failure");
  }
  return (
    <DockContext.Provider value="Plugin context preserved">
      <ConsoleDockContent
        initialFocus={inputRef}
        beforeExit={() =>
          guardExit
            ? new Promise<boolean>((resolve) => {
                resolveExit = resolve;
              })
            : true
        }
        bar={
          <TestComposer
            inputRef={inputRef}
            value={draft}
            onChange={setDraft}
            onFocus={() => {
              if (dock.state === "bar") {
                dock.expand();
              }
            }}
          />
        }
        tray={{ label: "Plugin conversation", content: <TestConversation /> }}
      />
    </DockContext.Provider>
  );
}
function TestConversation() {
  const [details, setDetails] = useState(false);
  return (
    <>
      <p>{useContext(DockContext)}</p>
      <button onClick={() => setDetails((value) => !value)}>
        Conversation action
      </button>
      {details && <p>Test conversation details</p>}
      {clearanceFixture && (
        <div style={{ height: details ? 280 : 440 }}>Long conversation</div>
      )}
      <Modal.Root>
        <Modal.Trigger render={<button>Open plugin dialog</button>} />
        <Modal.Portal>
          <Modal.Backdrop />
          <Modal.Viewport>
            <Modal.Popup>
              <Modal.Title>Plugin details</Modal.Title>
              <Modal.Close render={<button>Close plugin dialog</button>} />
            </Modal.Popup>
          </Modal.Viewport>
        </Modal.Portal>
      </Modal.Root>
    </>
  );
}
const dockDefinition = defineConsolePlugin({
  id: "test-dock",
  pages: {},
  dockViews: Array.from({ length: dockViewCount }, (_, index) => ({
    id: index ? `compose-${index + 1}` : "compose",
    label: index ? `Test Agent ${index + 1}` : "Test Agent",
    icon: <span aria-hidden="true">A</span>,
    component: TestDockView,
  })),
});
const dockBinding = bindConsole(dockDefinition, {
  id: "test-agent",
  services: {},
  routes: {},
});
const definition = defineConsolePlugin({
  id: "records",
  pages: {
    records: { component: Records },
    history: { component: () => <h1>History page</h1> },
    detail: {
      component: ({ activation, navigation }: ConsoleLocalPageProps) => (
        <>
          <ConsolePageScope
            scopeKey={activation.key}
            value={{
              context: {
                kind: "object",
                label: "Record",
                id: "42",
                status: "Ready",
                return: {
                  label: "Return to records",
                  onInvoke: () => navigation.go("records"),
                },
              },
            }}
          />
          <h1>Detail page</h1>
        </>
      ),
    },
  },
  pageGroups: {
    records: {
      label: "Record views",
      defaultPage: "records",
      tabs: [
        { page: "records", label: "Records tab" },
        { page: "history", label: "History tab" },
      ],
      relatedPages: { detail: { activeTab: "records" } },
    },
  },
  navigation: [
    {
      id: "records",
      label: "Records",
      group: "records",
      defaultPlacement: "primary",
    },
    {
      id: "history",
      label: "History",
      page: "history",
      defaultPlacement: "primary",
    },
  ],
});
const binding = bindConsole(definition, {
  id: "records",
  routes: { records: "/records", history: "/history", detail: "/records/:id" },
  services: {},
});
const capturedPages: ConsolePageContribution[] = [];
let pageInvocations = 0;
let pageProbeActive = false;
function CapturePage({ page }: { page: ConsolePageContribution | null }) {
  useLayoutEffect(() => {
    pageProbeActive = !!page;
    if (page) {
      capturedPages.push(page);
    }
  }, [page]);
  return null;
}
function PageLeaseProbe() {
  const [key, setKey] = useState("first");
  const lifetime = useRef(new AbortController()).current;
  const [mounted, setMounted] = useState(true);
  const [replacement, setReplacement] = useState(false);
  Object.assign(window, {
    pageLeaseProbe: {
      change: setKey,
      abort: () => lifetime.abort(),
      unmount: () => setMounted(false),
      replace: () => setReplacement(true),
      unmountAll: () => {
        setMounted(false);
        setReplacement(false);
      },
      invoke: (index: number) => {
        const page = capturedPages[index]!;
        page.commands?.[0]?.onInvoke();
        if (page.context && page.context.kind !== "hidden") {
          page.context.return?.onInvoke();
        }
      },
      snapshot: () => ({
        count: capturedPages.length,
        invocations: pageInvocations,
        active: pageProbeActive,
      }),
    },
  });
  return (
    <ConsoleActionHost
      signal={lifetime.signal}
      render={(_, page) => <CapturePage page={page} />}
    >
      {mounted && (
        <ConsolePageScope
          scopeKey={key}
          value={{
            commands: [
              {
                id: "probe",
                label: "Probe",
                onInvoke: () => {
                  pageInvocations += 1;
                },
              },
            ],
            context: {
              kind: "object",
              label: "Probe",
              return: {
                label: "Return",
                onInvoke: () => {
                  pageInvocations += 1;
                },
              },
            },
          }}
        />
      )}
      {replacement && (
        <ConsolePageScope
          scopeKey="replacement"
          value={{
            commands: [
              {
                id: "replacement",
                label: "Replacement",
                onInvoke: () => {
                  pageInvocations += 1;
                },
              },
            ],
            context: {
              kind: "object",
              label: "Replacement",
              return: {
                label: "Return",
                onInvoke: () => {
                  pageInvocations += 1;
                },
              },
            },
          }}
        />
      )}
    </ConsoleActionHost>
  );
}

function Fixture() {
  const [pathname, setPathname] = useState("/console/records");
  const [scopeKey, setScopeKey] = useState("first");
  const [allow, setAllow] = useState(true);
  const [allowDock, setAllowDock] = useState(true);
  const [version, setVersion] = useState(0);
  const [tabsPosition, setTabsPosition] = useState<
    ConsolePreferences["position"] | "content"
  >("top");
  Object.assign(window, {
    shellFixture: {
      snapshot: () => ({
        mounts,
        actions,
        aborted: signals.map((signal) => signal.aborted),
        current: activations.map((activation) => activation.isCurrent()),
        stored: snapshot,
        composerMounts,
        dockAborted: dockSignals.map((signal) => signal.aborted),
      }),
      conflict: (value: boolean) => {
        conflict = value;
      },
      seedPreferences: (value: ConsolePreferences) => {
        snapshot = { revision: "seeded", value };
        preferenceSeed += 1;
        setScopeKey(`seeded-preferences-${preferenceSeed}`);
      },
      scope: (value: string) => setScopeKey(value),
      allow: (value: boolean) => setAllow(value),
      revise: () => setVersion((value) => value + 1),
      navigate: setPathname,
      allowDock: setAllowDock,
      guardExit: (value: boolean) => {
        guardExit = value;
      },
      resolveExit: (value: boolean) => resolveExit?.(value),
      staleExpand: () => dockControllers[0]?.expand(),
      tray: (open: boolean) => {
        const controller = dockControllers.at(-1);
        return open ? controller?.expand() : controller?.collapse();
      },
      crashDock: () => crashDock?.(),
      beginGeometrySamples: () => {
        sampledDock = document.querySelector("[data-dashboard-dock-surface]");
        geometrySamples.clear();
        sampleGeometry();
      },
      endGeometrySamples: () => {
        cancelAnimationFrame(geometryFrame);
        const result = {
          sameSurface:
            sampledDock ===
            document.querySelector("[data-dashboard-dock-surface]"),
          distinctSizes: geometrySamples.size,
        };
        sampledDock = null;
        return result;
      },
      tabsPosition: setTabsPosition,
      selection: (value: boolean) => changeRecordSelection?.(value),
      overlay: (value: boolean) => changeRecordOverlay?.(value),
      returnAvailable: (value: boolean) => {
        // Model a discrete UI update at the sampled reversal, not scheduler delay.
        flushSync(() => changeRecordReturn?.(value));
      },
      block: (value: boolean) => {
        blocked = value;
      },
    },
  });
  const plugins = React.useMemo(
    () => [
      { ...binding, definition: { ...definition } },
      ...(dockFixture ? [dockBinding] : []),
    ],
    // oxlint-disable-next-line react-hooks/exhaustive-deps -- The test explicitly replaces definition identity without changing its route or stable IDs.
    [version]
  );
  return (
    <ConsoleShell
      plugins={plugins}
      dock={
        dockFixture
          ? {
              leading: (dockDefinition.dockViews ?? []).map((view) => ({
                bindingId: "test-agent",
                viewId: view.id,
              })),
            }
          : undefined
      }
      basePath="/console"
      tabsPosition={tabsPosition}
      preferences={store}
      session={{
        state: "ready",
        scopeKey,
        canAccess: () => allow,
        canAccessDockView: () => allowDock,
      }}
      router={{
        pathname,
        navigate: (path) => {
          if (!blocked) {
            setPathname(path);
          }
        },
        match: (pattern, path) => {
          const names: string[] = [];
          const regexp = new RegExp(
            `^${pattern.replaceAll(/:([^/]+)/g, (_, name: string) => {
              names.push(name);
              return "([^/]+)";
            })}$`
          );
          const result = regexp.exec(path);
          return result
            ? Object.fromEntries(
                names.map((name, index) => [name, result[index + 1]!])
              )
            : null;
        },
      }}
    />
  );
}
function TableFixture() {
  const treeMode = new URLSearchParams(location.search).has("filter-tree");
  const [filter, setFilter] = useState<ConsoleFilterGroup>({
    id: "records",
    operator: "and",
    children: [],
  });
  const [query, setQuery] = useState("");
  const [conditions, setConditions] = useState<
    readonly ConsoleFilterCondition[]
  >([]);
  const [commits, setCommits] = useState(0);
  const [page, setPage] = useState(1);
  const [pathname, setPathname] = useState("/records");
  return (
    <ConsoleLayout
      tableControls={{
        customization: new URLSearchParams(location.search).has("customize"),
      }}
    >
      <ConsoleInteractionHost
        router={{ pathname, navigate: setPathname }}
        destinations={[
          {
            id: "records",
            label: "Records",
            href: "/records",
            icon: (
              <svg viewBox="0 0 20 20" aria-hidden="true">
                <path
                  d="M3 3h14v14H3zM3 8h14M8 3v14"
                  fill="none"
                  stroke="currentColor"
                />
              </svg>
            ),
          },
        ]}
      >
        <main style={{ padding: "90px 24px 180px" }}>
          {pathname === "/records" ? (
            <ConsoleTableContext
              scopeKey="records"
              label="Records"
              filters={{
                label: "Filter records",
                ...(treeMode
                  ? {
                      value: filter,
                      onValueChange: (value: ConsoleFilterGroup) => {
                        setFilter(value);
                        setCommits((count) => count + 1);
                      },
                    }
                  : {
                      conditions,
                      onConditionsChange: (
                        value: readonly ConsoleFilterCondition[]
                      ) => {
                        setConditions(value);
                        setCommits((count) => count + 1);
                      },
                    }),
                fields: [
                  {
                    id: "name",
                    label: "Name",
                    kind: "text",
                    operators: ["contains", "equals"],
                  },
                  {
                    id: "age",
                    label: "Age",
                    kind: "number",
                    operators: ["gt", "equals", "between"],
                  },
                  {
                    id: "status",
                    label: "Status",
                    kind: "enum",
                    options: [
                      { value: "active", label: "Active" },
                      { value: "disabled", label: "Disabled" },
                    ],
                  },
                  {
                    id: "created",
                    label: "Created date",
                    kind: "date",
                    operators: ["on", "before", "after", "between"],
                  },
                ],
              }}
              groups={[
                {
                  id: "query",
                  kind: "query",
                  label: "Search",
                  children: (
                    <ConsoleTableSearch
                      label="Search records"
                      value={query}
                      onValueChange={setQuery}
                    />
                  ),
                },
                {
                  id: "pagination",
                  kind: "navigation",
                  label: "Pagination",
                  children: (
                    <button
                      onClick={() => setPage((value) => value + 1)}
                      style={{ minHeight: 44 }}
                    >
                      Records page {page}
                    </button>
                  ),
                },
              ]}
            >
              <p>Controlled query: {query || "empty"}</p>
              <output aria-label="Applied conditions">
                {conditions.length}
              </output>
              <output aria-label="Filter commits">{commits}</output>
              {treeMode && (
                <output aria-label="Matching fixture records">
                  {[
                    { name: "Alice", created: "2024-02-29" },
                    { name: "Bob", created: "2024-03-01" },
                    { name: "Carol", created: "2024-03-02" },
                  ]
                    .filter((record) =>
                      evaluateConsoleFilter(filter, (condition) => {
                        if (condition.field === "created") {
                          return matchesConsoleFilterDate(
                            record.created,
                            condition
                          );
                        }
                        return (
                          typeof condition.value === "string" &&
                          (condition.operator === "contains"
                            ? record.name.includes(condition.value)
                            : record.name === condition.value)
                        );
                      })
                    )
                    .map((record) => record.name)
                    .join(", ")}
                </output>
              )}
              <div style={{ height: 950 }}>
                Read the document before its embedded transactions.
              </div>
              <ConsoleTableContext
                scopeKey="records"
                label="Transactions"
                mode="embedded"
                groups={[
                  {
                    id: "query",
                    kind: "query",
                    label: "Search",
                    children: (
                      <input
                        aria-label="Search transactions"
                        style={{ width: 100, minHeight: 44 }}
                      />
                    ),
                  },
                  {
                    id: "pagination",
                    kind: "navigation",
                    label: "Pagination",
                    children: (
                      <button style={{ minHeight: 44 }}>
                        Next transactions
                      </button>
                    ),
                  },
                ]}
              >
                <div style={{ height: 1000 }}>
                  Embedded transactions viewport
                </div>
              </ConsoleTableContext>
              <div style={{ height: 1000 }}>Continue reading the document.</div>
              <button onClick={() => setPathname("/other")}>
                Leave records
              </button>
            </ConsoleTableContext>
          ) : (
            <p>Other page</p>
          )}
        </main>
      </ConsoleInteractionHost>
    </ConsoleLayout>
  );
}
createRoot(document.getElementById("root")!).render(
  new URLSearchParams(location.search).has("tables") ? (
    <TableFixture />
  ) : (
    <>
      <Fixture />
      <PageLeaseProbe />
    </>
  )
);
declare global {
  interface Window {
    pageLeaseProbe: {
      abort(): void;
      change(value: string): void;
      unmount(): void;
      replace(): void;
      unmountAll(): void;
      invoke(index: number): void;
      snapshot(): { count: number; invocations: number; active: boolean };
    };
    shellFixture: {
      seedPreferences(value: ConsolePreferences): void;
      snapshot(): {
        mounts: number;
        actions: number;
        aborted: boolean[];
        current: boolean[];
        stored: ConsolePreferenceSnapshot;
        composerMounts: number;
        dockAborted: boolean[];
      };
      conflict(value: boolean): void;
      scope(value: string): void;
      allow(value: boolean): void;
      revise(): void;
      navigate(value: string): void;
      allowDock(value: boolean): void;
      guardExit(value: boolean): void;
      resolveExit(value: boolean): void;
      staleExpand(): boolean | undefined;
      tray(open: boolean): boolean | undefined;
      crashDock(): void;
      beginGeometrySamples(): void;
      endGeometrySamples(): { sameSurface: boolean; distinctSizes: number };
      tabsPosition(value: ConsolePreferences["position"] | "content"): void;
      selection(value: boolean): void;
      overlay(value: boolean): void;
      returnAvailable(value: boolean): void;
      block(value: boolean): void;
    };
  }
}
