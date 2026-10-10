import React, { useLayoutEffect, useState } from "react";
import { createRoot } from "react-dom/client";

import {
  ConsoleActionScope,
  ConsoleShell,
  bindConsole,
  defineConsolePlugin,
} from "../../dist/index.js";
import type {
  ConsoleLocalPageProps,
  ConsolePreferenceSnapshot,
} from "../../src/composition";

import "@lenso/tokens/styles.css";
import "../../../../plugins/console/shell/src/styles.css";
import "../../dist/styles.css";

const activations: ConsoleLocalPageProps["activation"][] = [];
const signals: AbortSignal[] = [];
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
                running: false,
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
  const [version, setVersion] = useState(0);
  Object.assign(window, {
    shellFixture: {
      snapshot: () => ({
        mounts,
        actions,
        aborted: signals.map((signal) => signal.aborted),
        current: activations.map((activation) => activation.isCurrent()),
        stored: snapshot,
      }),
      conflict: (value: boolean) => {
        conflict = value;
      },
      scope: (value: string) => setScopeKey(value),
      allow: (value: boolean) => setAllow(value),
      revise: () => setVersion((value) => value + 1),
      navigate: setPathname,
    },
  });
  const plugins = React.useMemo(
    () => [{ ...binding, definition: { ...definition } }],
    // oxlint-disable-next-line react-hooks/exhaustive-deps -- The test explicitly replaces definition identity without changing its route or stable IDs.
    [version]
  );
  return (
    <ConsoleShell
      plugins={plugins}
      basePath="/console"
      preferences={store}
      session={{ state: "ready", scopeKey, canAccess: () => allow }}
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
      };
      conflict(value: boolean): void;
      scope(value: string): void;
      allow(value: boolean): void;
      revise(): void;
      navigate(value: string): void;
    };
  }
}
