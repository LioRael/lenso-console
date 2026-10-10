import {
  authConsole,
  authWidgets,
  type AuthConsoleClient,
} from "@lenso/auth-console/react";
import type { DashboardStore } from "@lenso/console-dashboard";
import {
  bindDashboard,
  defineDashboardWidget,
} from "@lenso/console-dashboard/react";
import { pluginManagerConsole } from "@lenso/console-plugin-manager/react";
import {
  ConsoleActionScope,
  ConsoleLayout,
  ConsoleIconButton,
  ConsoleShell,
  bindConsole,
  defineConsolePlugin,
  type ConsoleLocalPageProps,
  type ConsolePreferenceStore,
  type ConsoleRouterAdapter,
  type ConsoleSessionAdapter,
} from "@lenso/console-react";
import { useEffect, useMemo, useRef, useState } from "react";

export interface OrdersClient {
  list(options: {
    signal: AbortSignal;
  }): Promise<readonly { id: string; status: string }[]>;
  archive(
    input: { ids: readonly string[] },
    options: { signal: AbortSignal }
  ): Promise<void>;
}

interface OrdersServices extends OrdersClient {
  confirmArchive(ids: readonly string[]): Promise<boolean>;
}

function OrdersPage(props: ConsoleLocalPageProps<OrdersServices>) {
  const [rows, setRows] = useState<Awaited<ReturnType<OrdersClient["list"]>>>();
  const [selected, setSelected] = useState<string[]>([]);
  const [filter, setFilter] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string>();
  const locked = useRef(false);
  useEffect(() => {
    void (async () => {
      try {
        const value = await props.services.list({ signal: props.signal });
        if (props.activation.isCurrent()) {
          setRows(value);
        }
      } catch {
        if (props.activation.isCurrent()) {
          setError("Orders could not be loaded.");
        }
      }
    })();
  }, [props.services, props.signal, props.activation]);
  async function archive() {
    if (locked.current || !props.activation.isCurrent()) {
      return;
    }
    locked.current = true;
    const ids = [...selected];
    try {
      if (
        !(await props.services.confirmArchive(ids)) ||
        !props.activation.isCurrent()
      ) {
        return;
      }
      setPending(true);
      setError(undefined);
      await props.services.archive({ ids }, { signal: props.signal });
      if (props.activation.isCurrent()) {
        setSelected([]);
      }
    } catch {
      if (props.activation.isCurrent()) {
        setError("Archiving failed. The selection is retained.");
      }
    } finally {
      locked.current = false;
      if (props.activation.isCurrent()) {
        setPending(false);
      }
    }
  }
  return (
    <section aria-label="Orders">
      <ConsoleLayout.Corner area="topRight">
        <ConsoleIconButton
          label="Clear order filter"
          onClick={() => setFilter("")}
        >
          <span aria-hidden="true">×</span>
        </ConsoleIconButton>
      </ConsoleLayout.Corner>
      <ConsoleActionScope
        scopeKey={props.activation.key}
        value={
          selected.length
            ? {
                count: selected.length,
                scopeLabel: "Orders on this page",
                running: pending,
                actions: [
                  {
                    id: "archive",
                    label: "Archive selected orders",
                    icon: <span aria-hidden="true">✓</span>,
                    onInvoke: () => void archive(),
                  },
                ],
                onExit: () => {
                  if (!locked.current) {
                    setSelected([]);
                  }
                },
              }
            : null
        }
      />
      <h1>Orders</h1>
      <label>
        Filter order IDs{" "}
        <input
          value={filter}
          onChange={(event) => setFilter(event.target.value)}
        />
      </label>
      {error && <p role="alert">{error}</p>}
      {!rows && !error && <output>Loading orders…</output>}
      {rows?.length === 0 && <p>No orders were returned by this service.</p>}
      <ul>
        {rows
          ?.filter((row) => row.id.includes(filter))
          .map((row) => (
            <li key={row.id}>
              <label>
                <input
                  type="checkbox"
                  disabled={pending}
                  checked={selected.includes(row.id)}
                  onChange={(event) =>
                    setSelected((value) =>
                      event.target.checked
                        ? [...value, row.id]
                        : value.filter((id) => id !== row.id)
                    )
                  }
                />
                {row.id}
              </label>{" "}
              {row.status}{" "}
              <a href={props.navigation.href("detail", { id: row.id })}>
                Details
              </a>
            </li>
          ))}
      </ul>
    </section>
  );
}

const ordersUI = defineConsolePlugin<OrdersServices>({
  id: "orders",
  pages: {
    overview: { title: "Orders overview", component: OrdersPage },
    manage: { title: "Manage orders", component: OrdersPage },
    analytics: { title: "Orders by status", component: OrdersPage },
    detail: {
      title: "Order detail",
      component: ({ params }) => <h1>Order {params.id}</h1>,
    },
  },
  pageGroups: {
    orders: {
      label: "Orders",
      defaultPage: "overview",
      tabs: [
        { page: "overview", label: "Overview" },
        { page: "manage", label: "Manage" },
        { page: "analytics", label: "By status" },
      ],
      relatedPages: { detail: { activeTab: "manage" } },
    },
  },
  navigation: [
    {
      id: "orders",
      group: "orders",
      label: "Orders",
      defaultPlacement: "primary",
    },
  ],
});

export interface ComposedConsoleProps {
  router: ConsoleRouterAdapter;
  session: ConsoleSessionAdapter;
  preferences?: ConsolePreferenceStore;
  orders: OrdersClient;
  confirmArchive(ids: readonly string[]): Promise<boolean>;
  workforce: AuthConsoleClient;
  customers: AuthConsoleClient;
  dashboard: DashboardStore;
  catalog: Parameters<typeof pluginManagerConsole>[0]["catalog"];
}

/** Frontend-only composition. These values are clients, never server Plugin objects. */
export function ComposedConsole(props: ComposedConsoleProps) {
  const plugins = useMemo(() => {
    const orders = bindConsole(ordersUI, {
      id: "orders.primary",
      services: {
        list: (options) => props.orders.list(options),
        archive: (input, options) => props.orders.archive(input, options),
        confirmArchive: props.confirmArchive,
      },
      routes: {
        overview: "/orders",
        manage: "/orders/manage",
        analytics: "/orders/status",
        detail: "/orders/detail/:id",
      },
    });
    const workforce = authConsole({
      id: "auth.workforce",
      label: "Workforce",
      client: props.workforce,
      routes: {
        info: "/workforce",
        sessions: "/workforce/sessions",
        session: "/workforce/sessions/:id",
        subjects: "/workforce/subjects",
      },
    });
    const customers = authConsole({
      id: "auth.customers",
      label: "Customers",
      client: props.customers,
      routes: {
        info: "/customers",
        sessions: "/customers/sessions",
        session: "/customers/sessions/:id",
        subjects: "/customers/subjects",
      },
    });
    const widgets = authWidgets({ binding: workforce }).map(
      defineDashboardWidget
    );
    const dashboard = bindDashboard({
      id: "dashboard.personal",
      route: "/",
      services: {
        store: props.dashboard,
        widgets,
        defaults: { schemaVersion: 1, instances: [], placements: [] },
        permissionKey: props.session.scopeKey,
      },
    });
    const pluginManager = pluginManagerConsole({
      id: "plugins",
      path: "/plugins",
      catalog: props.catalog,
    });
    return [orders, workforce, customers, dashboard, pluginManager];
  }, [
    props.orders,
    props.confirmArchive,
    props.workforce,
    props.customers,
    props.dashboard,
    props.catalog,
    props.session.scopeKey,
  ]);
  return (
    <ConsoleShell
      plugins={plugins}
      router={props.router}
      session={props.session}
      {...(props.preferences ? { preferences: props.preferences } : {})}
      navigationDefaults={{ mode: "dock", position: "bottom" }}
    />
  );
}
