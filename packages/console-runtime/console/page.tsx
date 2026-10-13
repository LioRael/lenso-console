import {
  runtimeSnapshotSchema,
  type RuntimeSnapshot,
} from "@lenso/console-runtime/client";
import { definePage, type PageProps } from "@lenso/console-sdk";
import { useWorkspaceRead } from "@lenso/console-sdk/react";
import { Button } from "@lenso/ui/button";
import * as stylex from "@stylexjs/stylex";

const styles = stylex.create({
  page: {
    padding: 20,
    paddingTop: 72,
    paddingBottom: 144,
    minWidth: 0,
    color: "var(--foreground)",
    overflowWrap: "anywhere",
  },
  heading: { fontSize: 20, marginTop: 0, marginBottom: 8 },
  section: { marginTop: 28 },
  title: { fontSize: 16, marginBottom: 8 },
  list: { listStyleType: "none", paddingLeft: 0, margin: 0 },
  row: {
    paddingTop: 12,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomStyle: "solid",
    borderBottomColor: "var(--border)",
  },
  metadata: { marginTop: 4, marginBottom: 0, fontSize: 14 },
  refresh: { minHeight: 44, marginTop: 12 },
});

function RuntimePage({ services }: PageProps) {
  const status = useWorkspaceRead({
    key: "runtime.status",
    params: {},
    read: async ({ signal }) =>
      runtimeSnapshotSchema.parse(
        await services.invoke<Record<string, never>, RuntimeSnapshot>(
          "runtime",
          "status",
          {},
          { signal }
        )
      ),
  });
  return (
    <main aria-label="Runtime" {...stylex.props(styles.page)}>
      <h1 {...stylex.props(styles.heading)}>Runtime</h1>
      <p>Read-only diagnostics for this host’s connected Runtime.</p>
      <Button
        xstyle={styles.refresh}
        disabled={status.refreshing}
        onClick={async () => {
          try {
            await status.refetch();
          } catch {
            /* The read's alert reports the failure. */
          }
        }}
      >
        Refresh runtime
      </Button>
      {status.error ? (
        <p role="alert">
          Runtime diagnostics could not be read. Refresh to try again.
          {status.data ? " Showing the last successful snapshot." : ""}
        </p>
      ) : null}
      {!status.data && !status.error ? (
        <output aria-busy="true">Loading runtime diagnostics…</output>
      ) : null}
      {status.refreshing ? (
        <output>Refreshing runtime diagnostics…</output>
      ) : null}
      {status.data ? (
        <>
          <section {...stylex.props(styles.section)} aria-label="Instances">
            <h2 {...stylex.props(styles.title)}>Instances</h2>
            {status.data.services.length ? (
              <ul {...stylex.props(styles.list)}>
                {status.data.services.map((service) => (
                  <li key={service.generation} {...stylex.props(styles.row)}>
                    <strong>
                      {service.namespace}/{service.service}
                    </strong>
                    : {service.instance}
                    <p {...stylex.props(styles.metadata)}>
                      {service.state} · contract{" "}
                      {service.contract_version ?? "not registered"} ·{" "}
                      generation {service.generation} · {service.active_calls}{" "}
                      active / {service.max_concurrency} capacity
                    </p>
                    <p {...stylex.props(styles.metadata)}>
                      Capabilities:{" "}
                      {service.capabilities.length
                        ? service.capabilities
                            .map(
                              (capability) =>
                                `${capability.method} (${capability.mode})`
                            )
                            .join(", ")
                        : "none exported"}
                    </p>
                  </li>
                ))}
              </ul>
            ) : (
              <p>No Runtime instances are connected.</p>
            )}
          </section>
          <section
            {...stylex.props(styles.section)}
            aria-label="Active and waiting calls"
          >
            <h2 {...stylex.props(styles.title)}>Active and waiting calls</h2>
            {status.data.calls.length ? (
              <ul {...stylex.props(styles.list)}>
                {status.data.calls.map((call) => (
                  <li key={call.id} {...stylex.props(styles.row)}>
                    <strong>
                      {call.namespace}/{call.service}.{call.method}
                    </strong>{" "}
                    · {call.state}
                    <p {...stylex.props(styles.metadata)}>
                      Call {call.id} · {Math.round(call.remaining_ms)} ms
                      remaining · trace {call.trace_id ?? "not supplied"}
                    </p>
                  </li>
                ))}
              </ul>
            ) : (
              <p>No active or waiting calls.</p>
            )}
          </section>
          <section
            {...stylex.props(styles.section)}
            aria-label="Recent outcomes"
          >
            <h2 {...stylex.props(styles.title)}>Recent outcomes</h2>
            <p>
              Bounded recent terminal metadata. Request and response payloads
              are not shown.
            </p>
            {status.data.recent.length ? (
              <ul {...stylex.props(styles.list)}>
                {status.data.recent.toReversed().map((call) => (
                  <li key={call.id} {...stylex.props(styles.row)}>
                    <strong>
                      {call.namespace}/{call.service}.{call.method}
                    </strong>{" "}
                    · {call.outcome}
                    {call.code ? ` (${call.code})` : ""}
                    <p {...stylex.props(styles.metadata)}>
                      {Math.round(call.duration_ms)} ms · call {call.id} · trace{" "}
                      {call.trace_id ?? "not supplied"}
                    </p>
                  </li>
                ))}
              </ul>
            ) : (
              <p>No terminal calls have been recorded.</p>
            )}
          </section>
        </>
      ) : null}
    </main>
  );
}

export default definePage(RuntimePage);
