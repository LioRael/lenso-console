import { bindConsole, ConsolePageScope } from "@lenso/console-react";
import type {
  ConsoleLocalPageProps,
  ConsolePluginDefinition,
} from "@lenso/console-react";
import type { ConsoleClient } from "@lenso/console-sdk/protocol";
import { Button } from "@lenso/ui/button";
import { Link } from "@lenso/ui/link";
import { Table } from "@lenso/ui/table";
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

export function findCatalogPlugin(
  snapshot: Snapshot,
  targetId: string | undefined,
  pluginId: string | undefined
) {
  const target = snapshot.targets.find((entry) => entry.id === targetId);
  const plugin = snapshot.plugins.find(
    (entry) => entry.targetId === targetId && entry.id === pluginId
  );
  if (!target || !plugin) {
    return undefined;
  }
  return {
    target,
    plugin,
    operations: snapshot.operations.filter(
      (operation) =>
        operation.targetId === targetId && operation.pluginId === pluginId
    ),
  };
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
    params,
    navigation,
    detail = false,
  }: ConsoleLocalPageProps<ConsoleClient> & { detail?: boolean }) {
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

    const retryLoad = () => {
      if (!signal.aborted && activation.isCurrent()) {
        setAttempt((value) => value + 1);
      }
    };
    const selected = snapshot
      ? findCatalogPlugin(snapshot, params.targetId, params.pluginId)
      : undefined;
    return (
      <>
        <ConsolePageScope
          scopeKey={activation.key}
          value={{
            context: detail
              ? {
                  kind: "object",
                  label: "Plugin",
                  ...(params.pluginId ? { id: params.pluginId } : {}),
                  return: {
                    label: "Return to plugin list",
                    onInvoke: () => {
                      if (!signal.aborted && activation.isCurrent()) {
                        navigation.go("index");
                      }
                    },
                  },
                }
              : { kind: "object", label: "Plugins" },
          }}
        />
        <section aria-label="Plugin manager" {...stylex.props(styles.page)}>
          {loading && <output>Loading catalog…</output>}
          {loadError && (
            <section role="alert" {...stylex.props(styles.notice)}>
              <p>Unable to load the Console catalog.</p>
              <Button type="button" xstyle={styles.button} onClick={retryLoad}>
                Retry
              </Button>
            </section>
          )}
          {detail &&
            !loading &&
            !loadError &&
            snapshot &&
            (selected ? (
              <>
                <header {...stylex.props(styles.heading)}>
                  <h1 {...stylex.props(styles.pluginTitle)}>
                    {selected.plugin.id}
                  </h1>
                  <p {...stylex.props(styles.subtle)}>
                    Target {selected.target.label} ({selected.target.id})
                  </p>
                </header>
                <PluginDetails
                  plugin={selected.plugin}
                  operations={selected.operations}
                />
                <p {...stylex.props(styles.catalogNote)}>
                  Read-only catalog. Configuration resolution is not runtime
                  health. Values and secrets are never shown.
                </p>
              </>
            ) : (
              <p {...stylex.props(styles.notice)}>
                This plugin is not listed for this target in the visible
                catalog.
              </p>
            ))}
          {!detail &&
            !loading &&
            !loadError &&
            snapshot &&
            snapshot.targets.length === 0 && (
              <p {...stylex.props(styles.notice)}>
                No targets are visible to this client.
              </p>
            )}
          {!detail &&
            !loading &&
            !loadError &&
            snapshot?.targets.map((target) => {
              const plugins = snapshot.plugins.filter(
                (plugin) => plugin.targetId === target.id
              );
              return (
                <section key={target.id} {...stylex.props(styles.target)}>
                  <header {...stylex.props(styles.heading)}>
                    <h2 {...stylex.props(styles.targetTitle)}>
                      {target.label}
                    </h2>
                    <p {...stylex.props(styles.subtle)}>Target {target.id}</p>
                  </header>
                  {plugins.length === 0 ? (
                    <p>No plugins are listed for this target.</p>
                  ) : (
                    <Table.Root variant="secondary">
                      <Table.ScrollContainer>
                        <Table.Content
                          aria-label={`Plugins in ${target.label}`}
                          xstyle={styles.table}
                        >
                          <Table.Header>
                            <Table.Column
                              columnKey="plugin"
                              xstyle={styles.cell}
                            >
                              Plugin
                            </Table.Column>
                            <Table.Column
                              columnKey="configuration"
                              xstyle={styles.cell}
                            >
                              Configuration
                            </Table.Column>
                            <Table.Column
                              columnKey="operations"
                              xstyle={styles.cell}
                            >
                              Operations
                            </Table.Column>
                          </Table.Header>
                          <Table.Body>
                            {plugins.map((plugin) => {
                              const operations = snapshot.operations.filter(
                                (operation) =>
                                  operation.targetId === target.id &&
                                  operation.pluginId === plugin.id
                              );
                              return (
                                <Table.Row key={plugin.id} itemKey={plugin.id}>
                                  <Table.Cell
                                    columnKey="plugin"
                                    xstyle={styles.cell}
                                  >
                                    <Link
                                      href={navigation.href("detail", {
                                        targetId: target.id,
                                        pluginId: plugin.id,
                                      })}
                                      xstyle={styles.pluginId}
                                      onClick={(event) => {
                                        if (
                                          event.defaultPrevented ||
                                          event.button !== 0 ||
                                          event.metaKey ||
                                          event.ctrlKey ||
                                          event.shiftKey ||
                                          event.altKey
                                        ) {
                                          return;
                                        }
                                        event.preventDefault();
                                        if (
                                          !signal.aborted &&
                                          activation.isCurrent()
                                        ) {
                                          navigation.go("detail", {
                                            targetId: target.id,
                                            pluginId: plugin.id,
                                          });
                                        }
                                      }}
                                    >
                                      {plugin.id}
                                    </Link>
                                  </Table.Cell>
                                  <Table.Cell
                                    columnKey="configuration"
                                    xstyle={styles.cell}
                                  >
                                    {plugin.configuration.state}
                                  </Table.Cell>
                                  <Table.Cell
                                    columnKey="operations"
                                    xstyle={styles.cell}
                                  >
                                    {operations.length}
                                  </Table.Cell>
                                </Table.Row>
                              );
                            })}
                          </Table.Body>
                        </Table.Content>
                      </Table.ScrollContainer>
                    </Table.Root>
                  )}
                </section>
              );
            })}
          {!detail &&
            !loading &&
            !loadError &&
            snapshot &&
            snapshot.targets.length > 0 && (
              <p {...stylex.props(styles.catalogNote)}>
                Read-only catalog. Configuration resolution is not runtime
                health. Values and secrets are never shown.
              </p>
            )}
        </section>
      </>
    );
  }

  const definition: ConsolePluginDefinition<ConsoleClient> = {
    id,
    pages: {
      index: { title: "Plugin manager", component: PluginManagerPage },
      detail: {
        title: "Plugin",
        component: (props) => <PluginManagerPage {...props} detail />,
      },
    },
    navigation: [{ id: "plugins", label: "Plugins", page: "index" }],
  };
  return bindConsole(definition, {
    id,
    routes: {
      index: path,
      detail: `${path.replace(/\/+$/, "")}/:targetId/:pluginId`,
    },
    services: catalog,
  });
}

function PluginDetails({
  plugin,
  operations,
}: {
  plugin: Plugin;
  operations: readonly Operation[];
}) {
  return (
    <article
      aria-label={`${plugin.id} inspection`}
      {...stylex.props(styles.details)}
    >
      <section {...stylex.props(styles.detailGroup)}>
        <h3 {...stylex.props(styles.groupTitle)}>Visible operations</h3>
        {operations.length === 0 ? (
          <p {...stylex.props(styles.text)}>No operations are admitted.</p>
        ) : (
          <Table.Root variant="secondary">
            <Table.ScrollContainer>
              <Table.Content
                aria-label="Visible plugin operations"
                xstyle={styles.table}
              >
                <Table.Header>
                  <Table.Column columnKey="operation" xstyle={styles.cell}>
                    Operation
                  </Table.Column>
                  <Table.Column columnKey="admission" xstyle={styles.cell}>
                    Admission
                  </Table.Column>
                </Table.Header>
                <Table.Body>
                  {operations.map((operation) => (
                    <Table.Row key={operation.key} itemKey={operation.key}>
                      <Table.Cell columnKey="operation" xstyle={styles.cell}>
                        <strong>{operation.method}</strong>
                        <p {...stylex.props(styles.text)}>
                          {operation.description}
                        </p>
                        <p {...stylex.props(styles.subtle)}>
                          Effect: {operation.effect}
                        </p>
                      </Table.Cell>
                      <Table.Cell columnKey="admission" xstyle={styles.cell}>
                        {operation.available
                          ? "Available"
                          : `Unavailable: ${operation.unavailableReason ?? "not admitted"}`}
                        <p {...stylex.props(styles.subtle)}>
                          Schema: {operation.schemaAvailability}
                          {operation.confirmation && " · Confirmation required"}
                          {operation.approval && " · Approval required"}
                        </p>
                      </Table.Cell>
                    </Table.Row>
                  ))}
                </Table.Body>
              </Table.Content>
            </Table.ScrollContainer>
          </Table.Root>
        )}
      </section>
      <section {...stylex.props(styles.detailGroup)}>
        <h3 {...stylex.props(styles.groupTitle)}>Configuration provenance</h3>
        <p {...stylex.props(styles.text)}>
          Resolution: {plugin.configuration.state}. Metadata only.
        </p>
        <h4 {...stylex.props(styles.subheading)}>Fields</h4>
        {plugin.configuration.fields.length === 0 ? (
          <p {...stylex.props(styles.subtle)}>No field metadata is exposed.</p>
        ) : (
          <dl {...stylex.props(styles.fields)}>
            {plugin.configuration.fields.map((field, index) => (
              <div
                key={`${field.path.join(".")}-${index}`}
                {...stylex.props(styles.field)}
              >
                <dt>{field.path.join(".") || "root"}</dt>
                <dd {...stylex.props(styles.text)}>
                  {field.sensitive ? "Sensitive, value hidden" : "Value hidden"}
                  <p {...stylex.props(styles.subtle)}>
                    {field.sourceIds.length
                      ? `Sources: ${field.sourceIds.join(", ")}`
                      : "No source metadata is exposed."}
                  </p>
                </dd>
              </div>
            ))}
          </dl>
        )}
        <h4 {...stylex.props(styles.subheading)}>Sources</h4>
        {plugin.configuration.sources.length === 0 ? (
          <p {...stylex.props(styles.subtle)}>No source metadata is exposed.</p>
        ) : (
          <ul {...stylex.props(styles.list)}>
            {plugin.configuration.sources.map((source) => (
              <li key={source.id} {...stylex.props(styles.source)}>
                <span>{source.id}</span>
                <span {...stylex.props(styles.subtle)}>{source.kind}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </article>
  );
}

const styles = stylex.create({
  page: {
    color: "var(--foreground)",
    maxWidth: 1120,
    marginInline: "auto",
    paddingInline: 16,
    paddingTop: 8,
    paddingBottom: 96,
    minWidth: 0,
    overflowWrap: "anywhere",
  },
  heading: {
    display: "grid",
    gap: 4,
    marginBottom: 16,
  },
  targetTitle: { margin: 0, fontSize: 18, fontWeight: 600, lineHeight: 1.5 },
  pluginTitle: { margin: 0, fontSize: 24, fontWeight: 600, lineHeight: 1.5 },
  button: { minWidth: 44, minHeight: 44 },
  notice: { paddingBlock: 16 },
  target: { paddingBlock: 16 },
  subtle: {
    color: "color-mix(in oklab, var(--muted) 90%, var(--foreground))",
    fontSize: 14,
    lineHeight: 1.5,
    margin: 0,
  },
  table: { width: "100%", minWidth: 0 },
  cell: {
    whiteSpace: "normal",
    overflowWrap: "anywhere",
    fontSize: 14,
    lineHeight: 1.5,
  },
  pluginId: {
    fontWeight: 500,
    minWidth: 0,
    minHeight: 44,
    display: "inline-flex",
    alignItems: "center",
  },
  catalogNote: {
    marginTop: 16,
    marginBottom: 0,
    fontSize: 14,
    lineHeight: 1.5,
  },
  details: {
    display: "grid",
    gridTemplateColumns: {
      default: "minmax(0, 1fr) minmax(0, 1fr)",
      "@media (max-width: 680px)": "minmax(0, 1fr)",
    },
    gap: 32,
    paddingBlock: 20,
    paddingInline: 0,
    minWidth: 0,
    whiteSpace: "normal",
    overflowWrap: "anywhere",
  },
  detailGroup: { minWidth: 0 },
  groupTitle: {
    margin: 0,
    marginBottom: 12,
    fontSize: 16,
    fontWeight: 600,
    lineHeight: 1.5,
  },
  subheading: { marginTop: 20, marginBottom: 8, fontSize: 14, fontWeight: 500 },
  text: { margin: 0, fontSize: 14, lineHeight: 1.5 },
  list: { listStyle: "none", padding: 0, margin: 0, display: "grid", gap: 16 },
  fields: { display: "grid", gap: 12, margin: 0 },
  field: {
    display: "grid",
    gridTemplateColumns: {
      default: "minmax(0, 1fr) minmax(0, 1.5fr)",
      "@media (max-width: 420px)": "minmax(0, 1fr)",
    },
    gap: 8,
  },
  source: { display: "grid", gap: 4 },
});
