import {
  bindConsole,
  ConsoleLayout,
  ConsoleIconButton,
} from "@lenso/console-react";
import type {
  ConsoleLocalPageProps,
  ConsolePluginDefinition,
} from "@lenso/console-react";
import type { ConsoleClient } from "@lenso/console-sdk/protocol";
import { Button } from "@lenso/ui/button";
import * as stylex from "@stylexjs/stylex";
import { useEffect, useState } from "react";

type Target = Awaited<ReturnType<ConsoleClient["targets"]>>["targets"][number];
type Plugin = Awaited<ReturnType<ConsoleClient["plugins"]>>["plugins"][number];
type Operation = Awaited<
  ReturnType<ConsoleClient["catalog"]>
>["operations"][number];

export interface PluginManagerConsoleOptions {
  id: string;
  path: string;
  catalog: ConsoleClient;
}

type Snapshot = {
  targets: Target[];
  plugins: Plugin[];
  operations: Operation[];
};

export function projectCatalog(
  targets: readonly Target[],
  plugins: readonly Plugin[],
  operations: readonly Operation[]
): Snapshot {
  return {
    targets: [...targets],
    plugins: [...plugins],
    operations: [...operations],
  };
}

export function isCurrentCatalogRequest(
  current: boolean,
  activation: { isCurrent(): boolean },
  signal: AbortSignal
): boolean {
  return current && !signal.aborted && activation.isCurrent();
}

export function pluginManagerConsole({
  id,
  path,
  catalog,
}: PluginManagerConsoleOptions) {
  function PluginManagerPage({
    signal,
    activation,
    services,
  }: ConsoleLocalPageProps<ConsoleClient>) {
    const [snapshot, setSnapshot] = useState<Snapshot>();
    const [loadError, setLoadError] = useState<Error>();
    const [loading, setLoading] = useState(true);
    const [attempt, setAttempt] = useState(0);

    useEffect(() => {
      const controller = new AbortController();
      const abort = () => controller.abort();
      if (signal.aborted || !activation.isCurrent()) {
        controller.abort();
      } else {
        signal.addEventListener("abort", abort, { once: true });
      }
      let current = true;
      setLoading(true);
      setLoadError(undefined);
      void (async () => {
        try {
          const { targets } = await services.targets(undefined, {
            signal: controller.signal,
          });
          const pluginResponses = await Promise.all(
            targets.map((target) =>
              services.plugins(
                { targetId: target.id },
                { signal: controller.signal }
              )
            )
          );
          const plugins = pluginResponses.flatMap(
            (response) => response.plugins
          );
          const operationResponses = await Promise.all(
            targets.map((target) =>
              services.catalog(
                { targetId: target.id },
                { signal: controller.signal }
              )
            )
          );
          if (
            !isCurrentCatalogRequest(current, activation, controller.signal)
          ) {
            return;
          }
          setSnapshot(
            projectCatalog(
              targets,
              plugins,
              operationResponses.flatMap((response) => response.operations)
            )
          );
        } catch (error) {
          if (isCurrentCatalogRequest(current, activation, controller.signal)) {
            setLoadError(
              error instanceof Error
                ? error
                : new Error("Catalog request failed")
            );
          }
        } finally {
          if (isCurrentCatalogRequest(current, activation, controller.signal)) {
            setLoading(false);
          }
        }
      })();
      return () => {
        current = false;
        signal.removeEventListener("abort", abort);
        controller.abort();
      };
    }, [attempt, services, signal, activation]);

    const retryLoad = () => setAttempt((value) => value + 1);
    return (
      <>
        <ConsoleLayout.Corner area="topRight">
          <ConsoleIconButton
            label="Refresh catalog"
            xstyle={styles.refresh}
            onClick={retryLoad}
          >
            <span aria-hidden="true">↻</span>
          </ConsoleIconButton>
        </ConsoleLayout.Corner>
        <section aria-label="Plugin manager" {...stylex.props(styles.page)}>
          <header {...stylex.props(styles.heading)}>
            <div>
              <p {...stylex.props(styles.kicker)}>Plugin inventory</p>
              <h1 {...stylex.props(styles.title)}>Plugin manager</h1>
              <p {...stylex.props(styles.description)}>
                Read-only view of admitted targets, installed plugins,
                configuration provenance, and visible operations.
              </p>
            </div>
          </header>
          {loading && <output>Loading catalog…</output>}
          {loadError && (
            <section role="alert" {...stylex.props(styles.notice)}>
              <p>Unable to load the Console catalog.</p>
              <Button type="button" onClick={retryLoad}>
                Retry
              </Button>
            </section>
          )}
          {!loading &&
            !loadError &&
            snapshot &&
            snapshot.targets.length === 0 && (
              <p {...stylex.props(styles.notice)}>
                No targets are visible to this client.
              </p>
            )}
          {!loading &&
            !loadError &&
            snapshot?.targets.map((target) => {
              const plugins = snapshot.plugins.filter(
                (plugin) => plugin.targetId === target.id
              );
              return (
                <section key={target.id} {...stylex.props(styles.target)}>
                  <h2>{target.label}</h2>
                  <p {...stylex.props(styles.subtle)}>Target {target.id}</p>
                  {plugins.length === 0 ? (
                    <p>No plugins are listed for this target.</p>
                  ) : (
                    plugins.map((plugin) => {
                      const operations = snapshot.operations.filter(
                        (operation) =>
                          operation.targetId === target.id &&
                          operation.pluginId === plugin.id
                      );
                      return (
                        <article
                          key={plugin.id}
                          {...stylex.props(styles.plugin)}
                        >
                          <h3>{plugin.id}</h3>
                          <p>
                            Declaration: present in the target plugin catalog.
                          </p>
                          <p>
                            Configuration resolution:{" "}
                            {plugin.configuration.state}. This describes
                            configuration assembly only, not runtime health.
                            Metadata is read-only; values and secrets are not
                            exposed.
                          </p>
                          <ul {...stylex.props(styles.sources)}>
                            {plugin.configuration.fields.map((field, index) => (
                              <li key={`${field.path.join(".")}-${index}`}>
                                {field.path.join(".") || "root"}:{" "}
                                {field.sensitive
                                  ? "sensitive field (value hidden)"
                                  : "field present"}
                                {field.sourceIds.length > 0 &&
                                  `; sources ${field.sourceIds.join(", ")}`}
                              </li>
                            ))}
                            {plugin.configuration.sources.map((source) => (
                              <li key={source.id}>
                                Source {source.id} ({source.kind})
                              </li>
                            ))}
                          </ul>
                          <h4>Visible operations</h4>
                          {operations.length === 0 ? (
                            <p>No operations are admitted.</p>
                          ) : (
                            <ul>
                              {operations.map((operation) => (
                                <li key={operation.key}>
                                  <strong>{operation.method}</strong> ·{" "}
                                  {operation.description} · {operation.effect}
                                  {operation.confirmation &&
                                    " · confirmation required"}
                                  {operation.approval && " · approval required"}
                                  {!operation.available &&
                                    ` · Unavailable: ${operation.unavailableReason ?? "not admitted"}`}
                                </li>
                              ))}
                            </ul>
                          )}
                          <p {...stylex.props(styles.unknown)}>
                            Live health: unknown. No owner health reader is
                            bound.
                          </p>
                        </article>
                      );
                    })
                  )}
                </section>
              );
            })}
        </section>
      </>
    );
  }

  const definition: ConsolePluginDefinition<ConsoleClient> = {
    id,
    pages: { index: { title: "Plugin manager", component: PluginManagerPage } },
    navigation: [{ id: "plugins", label: "Plugins", page: "index" }],
  };
  return bindConsole(definition, {
    id,
    routes: { index: path },
    services: catalog,
  });
}

const styles = stylex.create({
  page: {
    color: "inherit",
    maxWidth: 1120,
    marginInline: "auto",
    padding: "24px 20px 64px",
  },
  heading: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 16,
    borderBottomWidth: 1,
    borderBottomStyle: "solid",
    borderBottomColor: "var(--border)",
    paddingBottom: 20,
  },
  kicker: { margin: 0, fontSize: 13, color: "var(--foreground)" },
  refresh: { minWidth: 44, minHeight: 44 },
  title: { margin: "8px 0", fontSize: 28, lineHeight: 1.2 },
  description: { maxWidth: 680, margin: 0, lineHeight: 1.5 },
  notice: { paddingBlock: 16 },
  target: {
    paddingBlock: 20,
    borderBottomWidth: 1,
    borderBottomStyle: "solid",
    borderBottomColor: "var(--border)",
  },
  subtle: { color: "var(--foreground)", fontSize: 13 },
  plugin: {
    marginBlock: 16,
    padding: 16,
    borderWidth: 1,
    borderStyle: "solid",
    borderColor: "var(--border)",
    borderRadius: 8,
  },
  sources: { overflowWrap: "anywhere" },
  unknown: { marginTop: 18, fontWeight: 600 },
});
