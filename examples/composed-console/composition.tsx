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
  ConsoleShell,
  bindConsole,
  defineConsolePlugin,
  type ConsoleLocalPageProps,
  type ConsolePreferenceStore,
  type ConsoleRouterAdapter,
  type ConsoleSessionAdapter,
} from "@lenso/console-react";
import { ContactRound, KeyRound, ShoppingBag, UsersRound } from "lucide-react";
import { useMemo, type ComponentProps } from "react";

import { lazyPage } from "./lazy-page";

export interface OrdersClient {
  list(options: {
    signal: AbortSignal;
  }): Promise<readonly { id: string; status: string }[]>;
  archive(
    input: { ids: readonly string[] },
    options: { signal: AbortSignal }
  ): Promise<void>;
}

export interface OrdersServices extends OrdersClient {
  confirmArchive(ids: readonly string[]): Promise<boolean>;
}

type OrdersPageProps = ConsoleLocalPageProps<OrdersServices>;
const OrderDetail = lazyPage<OrdersPageProps>(async () => {
  const pages = await import("./orders-pages");
  return { default: pages.OrderDetail };
});
const OrdersManage = lazyPage<OrdersPageProps>(async () => {
  const pages = await import("./orders-pages");
  return { default: pages.OrdersManage };
});
const OrdersOverview = lazyPage<OrdersPageProps>(async () => {
  const pages = await import("./orders-pages");
  return { default: pages.OrdersOverview };
});
const OrdersStatus = lazyPage<OrdersPageProps>(async () => {
  const pages = await import("./orders-pages");
  return { default: pages.OrdersStatus };
});

const ordersUI = defineConsolePlugin<OrdersServices>({
  id: "orders",
  pages: {
    overview: { title: "Orders overview", component: OrdersOverview },
    manage: { title: "Manage orders", component: OrdersManage },
    analytics: { title: "Orders by status", component: OrdersStatus },
    detail: {
      title: "Order detail",
      component: OrderDetail,
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
      icon: <ShoppingBag size={20} aria-hidden="true" />,
      defaultPlacement: "primary",
    },
  ],
});

export interface ComposedConsoleProps {
  router: ConsoleRouterAdapter;
  session: ConsoleSessionAdapter;
  preferences?: ConsolePreferenceStore;
  children?: React.ReactNode;
  additionalPlugins?: ComponentProps<typeof ConsoleShell>["plugins"];
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
      navigation: {
        info: {
          label: "Workforce",
          tooltip: "Inspect workforce authentication information",
          icon: <UsersRound size={20} aria-hidden="true" />,
        },
        sessions: {
          label: "Workforce sessions",
          tooltip: "Review and revoke workforce sign-in sessions",
          icon: <KeyRound size={20} aria-hidden="true" />,
        },
        subjects: {
          label: "Workforce subjects",
          tooltip: "Browse workforce authentication subjects",
          icon: <ContactRound size={20} aria-hidden="true" />,
        },
      },
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
      navigation: {
        info: {
          label: "Customers",
          tooltip: "Inspect customer authentication information",
          icon: <UsersRound size={20} aria-hidden="true" />,
        },
        sessions: {
          label: "Customer sessions",
          tooltip: "Review and revoke customer sign-in sessions",
          icon: <KeyRound size={20} aria-hidden="true" />,
        },
        subjects: {
          label: "Customer subjects",
          tooltip: "Browse customer authentication subjects",
          icon: <ContactRound size={20} aria-hidden="true" />,
        },
      },
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
    return [
      orders,
      workforce,
      customers,
      dashboard,
      pluginManager,
      ...(props.additionalPlugins ?? []),
    ];
  }, [
    props.orders,
    props.confirmArchive,
    props.workforce,
    props.customers,
    props.dashboard,
    props.catalog,
    props.session.scopeKey,
    props.additionalPlugins,
  ]);
  return (
    <ConsoleShell
      plugins={plugins}
      router={props.router}
      session={props.session}
      {...(props.preferences ? { preferences: props.preferences } : {})}
      navigationDefaults={{ mode: "dock", position: "bottom" }}
    >
      {props.children}
    </ConsoleShell>
  );
}
