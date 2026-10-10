import { Modal } from "@lenso/ui/modal";
import React, {
  createContext,
  useContext,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { createRoot } from "react-dom/client";

import {
  ConsoleActionScope,
  ConsoleDockContent,
  ConsoleShell,
  bindConsole,
  defineConsolePlugin,
} from "../../dist/index.js";
import type {
  ConsoleLocalPageProps,
  ConsoleDockViewProps,
  ConsolePreferenceSnapshot,
} from "../../src/composition";

import "@lenso/tokens/styles.css";
import "../../../../plugins/console/shell/src/styles.css";
import "../../dist/styles.css";

const activations: ConsoleLocalPageProps["activation"][] = [];
const signals: AbortSignal[] = [];
const dockControllers: ConsoleDockViewProps["dock"][] = [];
const dockSignals: AbortSignal[] = [];
const DockContext = createContext("missing");
const dockFixture = new URLSearchParams(location.search).has("dock");
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
let revision = 0;
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
  const [selected, setSelected] = useState(false);
  const [running, setRunning] = useState(false);
  const [text, setText] = useState("");
  useLayoutEffect(() => {
    mounts += 1;
    activations.push(activation);
    signals.push(signal);
  }, [activation, signal]);
  return (
    <>
      <h1>Records page</h1>
      <input
        aria-label="Persistent draft"
        value={text}
        onChange={(event) => setText(event.target.value)}
      />
      <button onClick={() => setSelected(true)}>Select record</button>
      {dockFixture && (
        <>
          <button onClick={() => setRunning((value) => !value)}>
            Toggle selection execution
          </button>
          <select
            size={2}
            aria-label="Inline record options"
            defaultValue="current"
          >
            <option value="current">Current records</option>
            <option value="archived">Archived records</option>
          </select>
        </>
      )}
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
          selected
            ? {
                count: 1,
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
                onExit: () => setSelected(false),
              }
            : null
        }
      />
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
  dockViews: [
    {
      id: "compose",
      label: "Test Agent",
      icon: <span aria-hidden="true">A</span>,
      component: TestDockView,
    },
  ],
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
    detail: { component: () => <h1>Detail page</h1> },
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
function Fixture() {
  const [pathname, setPathname] = useState("/console/records");
  const [scopeKey, setScopeKey] = useState("first");
  const [allow, setAllow] = useState(true);
  const [allowDock, setAllowDock] = useState(true);
  const [version, setVersion] = useState(0);
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
        sampledDock = document.querySelector("[data-dashboard-dock]");
        geometrySamples.clear();
        sampleGeometry();
      },
      endGeometrySamples: () => {
        cancelAnimationFrame(geometryFrame);
        const result = {
          sameSurface:
            sampledDock === document.querySelector("[data-dashboard-dock]"),
          distinctSizes: geometrySamples.size,
        };
        sampledDock = null;
        return result;
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
          ? { leading: [{ bindingId: "test-agent", viewId: "compose" }] }
          : undefined
      }
      basePath="/console"
      preferences={store}
      session={{
        state: "ready",
        scopeKey,
        canAccess: () => allow,
        canAccessDockView: () => allowDock,
      }}
      router={{
        pathname,
        navigate: setPathname,
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
createRoot(document.getElementById("root")!).render(<Fixture />);
declare global {
  interface Window {
    shellFixture: {
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
    };
  }
}
