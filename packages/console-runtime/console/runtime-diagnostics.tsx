import type { RuntimeSnapshot } from "@lenso/console-runtime/client";
import type { ReadSnapshot } from "@lenso/console-sdk";
import { Table } from "@lenso/ui/table";
import * as stylex from "@stylexjs/stylex";

import { styles } from "./page.styles";

type Snapshot = ReadSnapshot<RuntimeSnapshot>;
type Call = Snapshot["calls"][number] | Snapshot["recent"][number];

function CallIdentity({ call }: { call: Call }) {
  return (
    <>
      <strong>
        {call.namespace}/{call.service}.{call.method}
      </strong>
      <p {...stylex.props(styles.metadata)}>Call {call.id}</p>
      <p {...stylex.props(styles.metadata)}>
        trace {call.trace_id ?? "not supplied"}
      </p>
      {call.parent_id ? (
        <p {...stylex.props(styles.metadata)}>Parent {call.parent_id}</p>
      ) : null}
    </>
  );
}

export function RuntimeDiagnostics({ snapshot }: { snapshot: Snapshot }) {
  return (
    <>
      <section aria-label="Instances">
        <h3 {...stylex.props(styles.subtitle)}>Instances</h3>
        {snapshot.services.length ? (
          <Table.Root variant="secondary">
            <Table.Content aria-label="Runtime instances" xstyle={styles.table}>
              <Table.Header>
                <Table.Column
                  columnKey="instance"
                  width="3fr"
                  minWidth={0}
                  xstyle={styles.cell}
                >
                  Instance and registration
                </Table.Column>
                <Table.Column
                  columnKey="state"
                  width="1fr"
                  minWidth={104}
                  maxWidth={200}
                  xstyle={styles.cell}
                >
                  State
                </Table.Column>
              </Table.Header>
              <Table.Body>
                {snapshot.services.map((service) => (
                  <Table.Row
                    key={service.generation}
                    itemKey={service.generation}
                    textValue={`${service.namespace}/${service.service} ${service.instance}`}
                  >
                    <Table.Cell columnKey="instance" xstyle={styles.cell}>
                      <strong>
                        {service.namespace}/{service.service}
                      </strong>
                      <p {...stylex.props(styles.metadata)}>
                        {service.instance}
                      </p>
                      <p {...stylex.props(styles.metadata)}>
                        Contract {service.contract_version ?? "not registered"}{" "}
                        · generation {service.generation}
                      </p>
                      <p {...stylex.props(styles.metadata)}>
                        Registered capabilities:{" "}
                        {service.capabilities.length
                          ? service.capabilities
                              .map(
                                (capability) =>
                                  `${capability.method} (${capability.mode})`
                              )
                              .join(", ")
                          : "none exported"}
                      </p>
                    </Table.Cell>
                    <Table.Cell columnKey="state" xstyle={styles.cell}>
                      {service.state}
                      <p {...stylex.props(styles.metadata)}>
                        {service.active_calls} active
                      </p>
                      <p {...stylex.props(styles.metadata)}>
                        {service.max_concurrency} capacity
                      </p>
                    </Table.Cell>
                  </Table.Row>
                ))}
              </Table.Body>
            </Table.Content>
            <Table.Footer xstyle={styles.footer}>
              {snapshot.services.length}{" "}
              {snapshot.services.length === 1 ? "instance" : "instances"} in
              this snapshot
            </Table.Footer>
          </Table.Root>
        ) : (
          <p {...stylex.props(styles.message)}>
            No Runtime instances are connected.
          </p>
        )}
      </section>

      <section aria-label="Active and waiting calls">
        <h3 {...stylex.props(styles.subtitle)}>Active and waiting calls</h3>
        {snapshot.calls.length ? (
          <Table.Root variant="secondary">
            <Table.Content
              aria-label="Active and waiting Runtime calls"
              xstyle={styles.table}
            >
              <Table.Header>
                <Table.Column
                  columnKey="call"
                  width="3fr"
                  minWidth={0}
                  xstyle={styles.cell}
                >
                  Call
                </Table.Column>
                <Table.Column
                  columnKey="state"
                  width="1fr"
                  minWidth={104}
                  maxWidth={200}
                  xstyle={styles.cell}
                >
                  State
                </Table.Column>
              </Table.Header>
              <Table.Body>
                {snapshot.calls.map((call) => (
                  <Table.Row
                    key={call.id}
                    itemKey={call.id}
                    textValue={`${call.namespace}/${call.service}.${call.method} ${call.id}`}
                  >
                    <Table.Cell columnKey="call" xstyle={styles.cell}>
                      <CallIdentity call={call} />
                    </Table.Cell>
                    <Table.Cell columnKey="state" xstyle={styles.cell}>
                      {call.state}
                      <p {...stylex.props(styles.metadata)}>
                        {Math.round(call.remaining_ms)} ms remaining
                      </p>
                    </Table.Cell>
                  </Table.Row>
                ))}
              </Table.Body>
            </Table.Content>
            <Table.Footer xstyle={styles.footer}>
              {snapshot.calls.length}{" "}
              {snapshot.calls.length === 1 ? "call" : "calls"} in this snapshot
            </Table.Footer>
          </Table.Root>
        ) : (
          <p {...stylex.props(styles.message)}>No active or waiting calls.</p>
        )}
      </section>

      <section aria-label="Recent outcomes">
        <h3 {...stylex.props(styles.subtitle)}>Recent outcomes</h3>
        <p {...stylex.props(styles.description)}>
          Bounded recent terminal metadata, newest first. Request and response
          payloads are not shown. Refresh for a new snapshot.
        </p>
        {snapshot.recent.length ? (
          <Table.Root variant="secondary">
            <Table.Content
              aria-label="Recent Runtime outcomes"
              xstyle={styles.table}
            >
              <Table.Header>
                <Table.Column
                  columnKey="call"
                  width="3fr"
                  minWidth={0}
                  xstyle={styles.cell}
                >
                  Call
                </Table.Column>
                <Table.Column
                  columnKey="outcome"
                  width="1fr"
                  minWidth={104}
                  maxWidth={200}
                  xstyle={styles.cell}
                >
                  Outcome
                </Table.Column>
              </Table.Header>
              <Table.Body>
                {snapshot.recent.toReversed().map((call) => (
                  <Table.Row
                    key={call.id}
                    itemKey={call.id}
                    textValue={`${call.namespace}/${call.service}.${call.method} ${call.id}`}
                  >
                    <Table.Cell columnKey="call" xstyle={styles.cell}>
                      <CallIdentity call={call} />
                    </Table.Cell>
                    <Table.Cell columnKey="outcome" xstyle={styles.cell}>
                      {call.outcome}
                      {call.code ? (
                        <p {...stylex.props(styles.metadata)}>{call.code}</p>
                      ) : null}
                      <p {...stylex.props(styles.metadata)}>
                        {Math.round(call.duration_ms)} ms duration
                      </p>
                    </Table.Cell>
                  </Table.Row>
                ))}
              </Table.Body>
            </Table.Content>
            <Table.Footer xstyle={styles.footer}>
              {snapshot.recent.length} recent{" "}
              {snapshot.recent.length === 1 ? "outcome" : "outcomes"} retained
            </Table.Footer>
          </Table.Root>
        ) : (
          <p {...stylex.props(styles.message)}>
            No terminal calls have been recorded.
          </p>
        )}
      </section>
    </>
  );
}
