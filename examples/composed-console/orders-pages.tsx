import {
  ConsoleActionScope,
  ConsolePageScope,
  ConsoleTableContext,
  ConsoleTableSearch,
  evaluateConsoleFilter,
  type ConsoleFilterGroup,
  type ConsoleFilterCondition,
  type ConsoleLocalPageProps,
} from "@lenso/console-react";
import { Link } from "@lenso/ui/link";
import { Table } from "@lenso/ui/table";
import * as stylex from "@stylexjs/stylex";
import { Archive } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import type { OrdersClient, OrdersServices } from "./composition";
import { styles } from "./orders-pages.styles";

type Props = ConsoleLocalPageProps<OrdersServices>;
type Rows = Awaited<ReturnType<OrdersClient["list"]>>;
type Result =
  | { state: "loading" }
  | { state: "error" }
  | { state: "ready"; rows: Rows };

function useOrders(props: Props) {
  const [result, setResult] = useState<Result>({ state: "loading" });
  useEffect(() => {
    const controller = new AbortController();
    const signal = AbortSignal.any([controller.signal, props.signal]);
    setResult({ state: "loading" });
    void (async () => {
      try {
        const rows = await props.services.list({ signal });
        if (!signal.aborted && props.activation.isCurrent()) {
          setResult({ state: "ready", rows });
        }
      } catch {
        if (!signal.aborted && props.activation.isCurrent()) {
          setResult({ state: "error" });
        }
      }
    })();
    return () => controller.abort();
  }, [props.services, props.signal, props.activation]);
  return [result, setResult] as const;
}

function LoadState({ result }: { result: Result }) {
  if (result.state === "loading") {
    return <output {...stylex.props(styles.message)}>Loading orders…</output>;
  }
  if (result.state === "error") {
    return (
      <p role="alert" {...stylex.props(styles.message, styles.error)}>
        Orders could not be loaded. Reload this page to try again.
      </p>
    );
  }
  if (!result.rows.length) {
    return (
      <p {...stylex.props(styles.message)}>
        No orders were returned by this service.
      </p>
    );
  }
  return null;
}

function OrderLink({
  props,
  id,
  disabled = false,
}: {
  props: Props;
  id: string;
  disabled?: boolean;
}) {
  return (
    <Link
      href={props.navigation.href("detail", { id })}
      disabled={disabled}
      xstyle={styles.link}
      onClick={(event) => {
        if (
          event.button === 0 &&
          !event.metaKey &&
          !event.ctrlKey &&
          !event.altKey &&
          !event.shiftKey
        ) {
          event.preventDefault();
          if (
            !disabled &&
            !props.signal.aborted &&
            props.activation.isCurrent()
          ) {
            props.navigation.go("detail", { id });
          }
        }
      }}
    >
      {id}
    </Link>
  );
}

function counts(rows: Rows) {
  const statuses = new Map<string, number>();
  for (const row of rows) {
    statuses.set(row.status, (statuses.get(row.status) ?? 0) + 1);
  }
  return [...statuses].sort(([a], [b]) => a.localeCompare(b));
}

function matchesOrder(
  row: { id?: string; status: string },
  condition: ConsoleFilterCondition
) {
  const value =
    condition.field === "id"
      ? row.id
      : condition.field === "status"
        ? row.status
        : undefined;
  return (
    value !== undefined &&
    typeof condition.value === "string" &&
    (condition.operator === "contains"
      ? value.toLowerCase().includes(condition.value.toLowerCase())
      : condition.operator === "equals" && value === condition.value)
  );
}

export function OrdersOverview(props: Props) {
  const [result] = useOrders(props);
  return (
    <section aria-label="Orders overview" {...stylex.props(styles.page)}>
      <LoadState result={result} />
      {result.state === "ready" && result.rows.length > 0 && (
        <>
          <p {...stylex.props(styles.intro)}>
            <strong>{result.rows.length} orders</strong> in the current list.{" "}
            {counts(result.rows).length} stored statuses.
          </p>
          <dl {...stylex.props(styles.summary)}>
            {counts(result.rows).map(([status, count]) => (
              <div key={status} {...stylex.props(styles.summaryRow)}>
                <dt>{status}</dt>
                <dd {...stylex.props(styles.value)}>{count} orders</dd>
              </div>
            ))}
          </dl>
          <h2 {...stylex.props(styles.heading)}>Orders in this list</h2>
          <p {...stylex.props(styles.message)}>
            Open an order to inspect its stored identity and status. Use Manage
            to select and archive orders.
          </p>
          <OrderTable props={props} rows={result.rows} />
        </>
      )}
    </section>
  );
}

export function OrdersStatus(props: Props) {
  const [result] = useOrders(props);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<ConsoleFilterGroup>({
    id: "statuses",
    operator: "and",
    children: [],
  });
  const distribution = result.state === "ready" ? counts(result.rows) : [];
  const visible = distribution.filter(
    ([status]) =>
      status.toLowerCase().includes(query.trim().toLowerCase()) &&
      evaluateConsoleFilter(filter, (condition) =>
        matchesOrder({ status }, condition)
      )
  );
  const current = () => !props.signal.aborted && props.activation.isCurrent();
  return (
    <ConsoleTableContext
      scopeKey={props.activation.key}
      label="Order status distribution"
      filters={{
        label: "Filter order statuses",
        value: filter,
        onValueChange: (value) => {
          if (current()) {
            setFilter(value);
          }
        },
        fields: [
          {
            id: "status",
            label: "Status",
            kind: "text",
            operators: ["equals", "contains"],
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
              label="Search order statuses"
              value={query}
              onValueChange={(value) => {
                if (current()) {
                  setQuery(value);
                }
              }}
            />
          ),
        },
      ]}
    >
      <section aria-label="Orders by status" {...stylex.props(styles.page)}>
        <LoadState result={result} />
        {result.state === "ready" && result.rows.length > 0 && (
          <>
            <p {...stylex.props(styles.intro)}>
              Distribution of the {result.rows.length} orders returned by the
              list service. This is a current snapshot, not a historical trend.
            </p>
            {visible.length === 0 ? (
              <p {...stylex.props(styles.message)}>
                No statuses match these search and filter conditions.
              </p>
            ) : (
              <Table.Root variant="secondary">
                <Table.ScrollContainer>
                  <Table.Content
                    aria-label="Order status distribution"
                    xstyle={styles.table}
                  >
                    <Table.Header>
                      <Table.Column columnKey="status" width="2fr">
                        Stored status
                      </Table.Column>
                      <Table.Column columnKey="count" width="1fr">
                        Orders
                      </Table.Column>
                      <Table.Column columnKey="share" width="1fr">
                        Share of list
                      </Table.Column>
                    </Table.Header>
                    <Table.Body>
                      {visible.map(([status, count]) => (
                        <Table.Row
                          key={status}
                          itemKey={status}
                          textValue={status}
                        >
                          <Table.Cell columnKey="status" xstyle={styles.cell}>
                            {status}
                          </Table.Cell>
                          <Table.Cell columnKey="count">{count}</Table.Cell>
                          <Table.Cell columnKey="share">
                            {Math.round((count / result.rows.length) * 100)}%
                          </Table.Cell>
                        </Table.Row>
                      ))}
                    </Table.Body>
                  </Table.Content>
                </Table.ScrollContainer>
                <Table.Footer>
                  {visible.length} of {distribution.length} statuses
                </Table.Footer>
              </Table.Root>
            )}
          </>
        )}
      </section>
    </ConsoleTableContext>
  );
}

export function OrdersManage(props: Props) {
  return <Manage key={props.activation.key} {...props} />;
}

function Manage(props: Props) {
  const [result, setResult] = useOrders(props);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [filter, setFilter] = useState("");
  const [conditions, setConditions] = useState<ConsoleFilterGroup>({
    id: "orders",
    operator: "and",
    children: [],
  });
  const [pending, setPending] = useState(false);
  const [feedback, setFeedback] = useState<string>();
  const [error, setError] = useState<string>();
  const locked = useRef(false);
  const rows = result.state === "ready" ? result.rows : [];
  const visible = rows.filter(
    (row) =>
      row.id.toLocaleLowerCase().includes(filter.trim().toLocaleLowerCase()) &&
      evaluateConsoleFilter(conditions, (condition) =>
        matchesOrder(row, condition)
      )
  );

  function changeFilter(value: string) {
    if (
      locked.current ||
      props.signal.aborted ||
      !props.activation.isCurrent()
    ) {
      return;
    }
    setFilter(value);
    setSelected(new Set());
  }

  function changeConditions(value: ConsoleFilterGroup) {
    if (
      locked.current ||
      props.signal.aborted ||
      !props.activation.isCurrent()
    ) {
      return;
    }
    setConditions(value);
    setSelected(new Set());
  }

  async function archive() {
    if (
      locked.current ||
      !selected.size ||
      props.signal.aborted ||
      !props.activation.isCurrent()
    ) {
      return;
    }
    const ids = [...selected].filter((id) =>
      visible.some((row) => row.id === id)
    );
    if (!ids.length) {
      return;
    }
    locked.current = true;
    setPending(true);
    setError(undefined);
    setFeedback(undefined);
    let archived = false;
    try {
      if (
        !(await props.services.confirmArchive([...ids])) ||
        props.signal.aborted ||
        !props.activation.isCurrent()
      ) {
        return;
      }
      await props.services.archive({ ids }, { signal: props.signal });
      archived = true;
      if (props.signal.aborted || !props.activation.isCurrent()) {
        return;
      }
      const updated = await props.services.list({ signal: props.signal });
      if (!props.signal.aborted && props.activation.isCurrent()) {
        setResult({ state: "ready", rows: updated });
        setSelected(new Set());
        setFeedback(
          `Archived ${ids.length} ${ids.length === 1 ? "order" : "orders"}.`
        );
      }
    } catch {
      if (!props.signal.aborted && props.activation.isCurrent()) {
        if (archived) {
          setSelected(new Set());
          setResult({ state: "error" });
          setError(
            "Orders were archived, but the updated list could not be loaded. Reload before taking another action."
          );
        } else {
          setError("Archiving failed. The selection is retained.");
        }
      }
    } finally {
      locked.current = false;
      if (!props.signal.aborted && props.activation.isCurrent()) {
        setPending(false);
      }
    }
  }

  return (
    <section aria-label="Manage orders" {...stylex.props(styles.page)}>
      <ConsolePageScope
        scopeKey={props.activation.key}
        value={{
          commands: [
            {
              id: "clear-filter",
              label: "Clear order filter",
              disabled: !filter || pending,
              onInvoke: () => changeFilter(""),
            },
          ],
        }}
      />
      <ConsoleActionScope
        scopeKey={props.activation.key}
        value={
          selected.size
            ? {
                count: selected.size,
                scopeLabel: "Orders on this page",
                running: pending,
                actions: [
                  {
                    id: "archive",
                    label: "Archive selected orders",
                    icon: <Archive size={18} aria-hidden="true" />,
                    onInvoke: () => void archive(),
                  },
                ],
                onExit: () => {
                  if (!locked.current) {
                    setSelected(new Set());
                  }
                },
              }
            : null
        }
      />
      <ConsoleTableContext
        scopeKey={props.activation.key}
        label="Orders"
        locked={pending}
        filters={{
          label: "Filter orders",
          disabled: pending,
          value: conditions,
          onValueChange: changeConditions,
          fields: [
            {
              id: "id",
              label: "Order ID",
              kind: "text",
              operators: ["contains", "equals"],
            },
            {
              id: "status",
              label: "Status",
              kind: "text",
              operators: ["equals", "contains"],
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
                label="Filter order IDs"
                value={filter}
                disabled={pending}
                onValueChange={changeFilter}
              />
            ),
          },
        ]}
      >
        <p {...stylex.props(styles.message)}>
          Select orders to archive using the selection Dock. Changing the filter
          clears selection.
        </p>
        <LoadState result={result} />
        {error && (
          <p role="alert" {...stylex.props(styles.message, styles.error)}>
            {error}
          </p>
        )}
        {feedback && (
          <output {...stylex.props(styles.message)}>{feedback}</output>
        )}
        {result.state === "ready" &&
          rows.length > 0 &&
          (visible.length ? (
            <OrderTable
              props={props}
              rows={visible}
              total={rows.length}
              selected={selected}
              pending={pending}
              onSelectionChange={(keys) => {
                if (
                  !locked.current &&
                  !props.signal.aborted &&
                  props.activation.isCurrent()
                ) {
                  setSelected(
                    new Set(
                      [...keys]
                        .map(String)
                        .filter((id) => visible.some((row) => row.id === id))
                    )
                  );
                }
              }}
            />
          ) : (
            <p {...stylex.props(styles.message)}>
              No orders match this filter.
            </p>
          ))}
      </ConsoleTableContext>
    </section>
  );
}

function OrderTable({
  props,
  rows,
  selected,
  pending = false,
  onSelectionChange,
  total,
}: {
  props: Props;
  rows: Rows;
  selected?: Set<string>;
  pending?: boolean;
  onSelectionChange?: (keys: Set<string | number | bigint>) => void;
  total?: number;
}) {
  return (
    <Table.Root variant="secondary">
      <Table.ScrollContainer>
        <Table.Content
          aria-label="Orders"
          selectionMode={selected ? "multiple" : "none"}
          {...(selected ? { selectedKeys: selected } : {})}
          {...(onSelectionChange ? { onSelectionChange } : {})}
          {...(pending
            ? { disabledKeys: new Set(rows.map((row) => row.id)) }
            : {})}
          xstyle={styles.table}
        >
          <Table.Header>
            {selected && (
              <Table.Column
                columnKey="selection"
                width={52}
                minWidth={52}
                maxWidth={52}
                xstyle={styles.selectionCell}
              >
                <label
                  htmlFor={`${props.activation.key}-select-all`}
                  {...stylex.props(styles.selectionControl)}
                >
                  <Table.SelectionCheckbox
                    id={`${props.activation.key}-select-all`}
                    aria-label="Select all orders"
                    disabled={pending}
                  />
                </label>
              </Table.Column>
            )}
            <Table.Column columnKey="id" width="2fr">
              Order ID
            </Table.Column>
            <Table.Column columnKey="status" width="1fr">
              Stored status
            </Table.Column>
          </Table.Header>
          <Table.Body>
            {rows.map((row) => (
              <Table.Row
                key={row.id}
                itemKey={row.id}
                textValue={row.id}
                disabled={pending}
              >
                {selected && (
                  <Table.Cell
                    columnKey="selection"
                    xstyle={styles.selectionCell}
                  >
                    {/* A label click also synthesizes an input click; keep the table row from toggling selection a second time. */}
                    {/* oxlint-disable-next-line jsx-a11y/no-noninteractive-element-interactions */}
                    <label
                      htmlFor={`${props.activation.key}-select-${row.id}`}
                      {...stylex.props(styles.selectionControl)}
                      onClick={(event) => event.stopPropagation()}
                      onKeyDown={(event) => {
                        if (event.key === " " || event.key === "Enter") {
                          event.stopPropagation();
                        }
                      }}
                    >
                      <Table.SelectionCheckbox
                        id={`${props.activation.key}-select-${row.id}`}
                        aria-label={`Select order ${row.id}`}
                        disabled={pending}
                      />
                    </label>
                  </Table.Cell>
                )}
                <Table.Cell columnKey="id" xstyle={styles.cell}>
                  <OrderLink props={props} id={row.id} disabled={pending} />
                </Table.Cell>
                <Table.Cell columnKey="status" xstyle={styles.cell}>
                  {row.status}
                </Table.Cell>
              </Table.Row>
            ))}
          </Table.Body>
        </Table.Content>
      </Table.ScrollContainer>
      {total !== undefined && (
        <Table.Footer>
          {rows.length} of {total} orders
        </Table.Footer>
      )}
    </Table.Root>
  );
}

export function OrderDetail(props: Props) {
  const [result] = useOrders(props);
  const row =
    result.state === "ready"
      ? result.rows.find((value) => value.id === props.params.id)
      : undefined;
  return (
    <section
      aria-label="Order details"
      {...stylex.props(styles.page, styles.detail)}
    >
      <ConsolePageScope
        scopeKey={props.activation.key}
        value={{
          context: {
            kind: "object",
            label: "Order",
            ...(props.params.id ? { id: props.params.id } : {}),
            ...(row ? { status: row.status } : {}),
            return: {
              label: "Return to orders",
              onInvoke: () => {
                if (!props.signal.aborted && props.activation.isCurrent()) {
                  props.navigation.go("manage");
                }
              },
            },
          },
        }}
      />
      {result.state !== "ready" && <LoadState result={result} />}
      {result.state === "ready" && !row && (
        <p {...stylex.props(styles.message)}>
          This order is not in the current list.
        </p>
      )}
      {row && (
        <>
          <dl {...stylex.props(styles.metadata)}>
            <dt>Order ID</dt>
            <dd {...stylex.props(styles.value)}>{row.id}</dd>
            <dt>Stored status</dt>
            <dd {...stylex.props(styles.value)}>{row.status}</dd>
          </dl>
          <p {...stylex.props(styles.message)}>
            This service exposes the order identity and status only. Return to
            Manage to select orders for archiving.
          </p>
        </>
      )}
    </section>
  );
}
