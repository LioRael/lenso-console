import { Card } from "@lenso/ui/card";
import * as stylex from "@stylexjs/stylex";
import { ChevronRight, Settings } from "lucide-react";
import { createContext, useContext, useId } from "react";

import {
  bindConsole,
  defineConsolePlugin,
  type ConsoleLocalPageProps,
  type ConsoleRouterAdapter,
  type ConsoleSettingsDefinition,
} from "./composition";
import { consoleRouteHref, type ConsoleSettingsItem } from "./console-model";

export const consoleSettingsBindingId = "console.settings";
export const ConsoleSettingsContext = createContext<{
  items: readonly ConsoleSettingsItem[];
  label: string;
  router: ConsoleRouterAdapter;
} | null>(null);
const styles = stylex.create({
  page: {
    color: "var(--foreground)",
    width: "100%",
    maxWidth: 800,
    marginInline: "auto",
    paddingBlock: 72,
    paddingInline: 28,
    "@media (max-width: 600px)": { paddingInline: 20, paddingBlock: 64 },
  },
  title: {
    margin: 0,
    fontSize: 26,
    fontWeight: 600,
    lineHeight: 1.3,
    letterSpacing: "-0.025em",
  },
  description: {
    marginBlockStart: 8,
    marginBlockEnd: 26,
    color: "var(--muted)",
    fontSize: 13,
    lineHeight: 1.6,
  },
  section: { marginBlockEnd: 26 },
  heading: {
    fontSize: 13,
    fontWeight: 550,
    marginBlock: 0,
    marginBlockEnd: 10,
    marginInline: 14,
    color: "var(--muted)",
  },
  group: {
    borderRadius: 20,
    padding: 0,
    gap: 0,
    overflow: "hidden",
    border: "1px solid var(--border)",
    backgroundColor: "var(--surface)",
    boxShadow: "0 2px 7px rgb(0 0 0 / 0.025)",
  },
  list: { listStyle: "none", padding: 0, margin: 0 },
  item: {
    margin: 0,
    borderTop: "1px solid var(--border)",
    ":first-child": { borderTopWidth: 0 },
  },
  row: {
    display: "flex",
    alignItems: "center",
    gap: 14,
    paddingBlock: 14,
    paddingInline: 18,
    minHeight: 66,
    color: "var(--foreground)",
    textDecoration: "none",
    ":hover": { backgroundColor: "var(--surface-secondary)" },
    ":focus-visible": { outline: "2px solid var(--focus)", outlineOffset: -3 },
    "@media (max-width: 600px)": { paddingInline: 14, gap: 10 },
  },
  copy: { flex: 1, minWidth: 0 },
  label: {
    display: "block",
    fontSize: 14,
    fontWeight: 500,
    lineHeight: 1.5,
    overflowWrap: "anywhere",
  },
  detail: {
    display: "block",
    marginBlockStart: 3,
    fontSize: 12,
    color: "var(--muted)",
    lineHeight: 1.5,
    overflowWrap: "anywhere",
  },
  state: {
    maxWidth: "30%",
    fontSize: 12,
    color: "var(--muted)",
    textAlign: "end",
    overflowWrap: "anywhere",
    lineHeight: 1.5,
  },
  arrow: { flexShrink: 0, color: "var(--muted)" },
});

export type ConsoleSettingsLink = Omit<ConsoleSettingsDefinition, "page"> & {
  href: string;
};

function ConsoleSettingsPage({ activation }: ConsoleLocalPageProps) {
  const data = useContext(ConsoleSettingsContext);
  if (!data) {
    return null;
  }
  return (
    <ConsoleSettingsDirectory
      entries={data.items.map((item) => ({
        ...item,
        href: consoleRouteHref(item.route.pattern),
      }))}
      label={data.label}
      navigate={data.router.navigate}
      isCurrent={activation.isCurrent}
    />
  );
}

const currentByDefault = () => true;

/** Shared navigation-only presentation for local and already-admitted SDK hosts. */
export function ConsoleSettingsDirectory({
  entries,
  label = "Settings",
  navigate,
  isCurrent = currentByDefault,
}: {
  entries: readonly ConsoleSettingsLink[];
  label?: string;
  navigate(href: string): void;
  isCurrent?(): boolean;
}) {
  const prefix = useId();
  const groups = new Map<
    string,
    { label: string; items: ConsoleSettingsLink[] }
  >();
  for (const item of entries) {
    const definition = item.group ?? { id: "plugins", label: "Plugins" };
    const group = groups.get(definition.id) ?? {
      label: definition.label,
      items: [],
    };
    group.items.push(item);
    groups.set(definition.id, group);
  }
  return (
    <section {...stylex.props(styles.page)} aria-label={label}>
      <h1 {...stylex.props(styles.title)}>{label}</h1>
      <p {...stylex.props(styles.description)}>
        Choose a setting to open its configuration page.
      </p>
      {groups.size === 0 && (
        <p {...stylex.props(styles.description)}>No settings are available.</p>
      )}
      {[...groups].map(([id, group], index) => (
        <section
          key={id}
          aria-labelledby={`${prefix}-${index}`}
          {...stylex.props(styles.section)}
        >
          <h2 id={`${prefix}-${index}`} {...stylex.props(styles.heading)}>
            {group.label}
          </h2>
          <Card variant="secondary" xstyle={styles.group}>
            <ul {...stylex.props(styles.list)}>
              {group.items.map((item) => {
                const { href } = item;
                return (
                  <li key={item.id} {...stylex.props(styles.item)}>
                    <a
                      href={href}
                      {...stylex.props(styles.row)}
                      onClick={(event) => {
                        if (
                          event.button === 0 &&
                          !event.metaKey &&
                          !event.ctrlKey &&
                          !event.altKey &&
                          !event.shiftKey
                        ) {
                          event.preventDefault();
                          if (isCurrent()) {
                            navigate(href);
                          }
                        }
                      }}
                    >
                      <span {...stylex.props(styles.copy)}>
                        <span {...stylex.props(styles.label)}>
                          {item.label}
                        </span>
                        {item.description && (
                          <span {...stylex.props(styles.detail)}>
                            {item.description}
                          </span>
                        )}
                      </span>
                      {item.status && (
                        <span {...stylex.props(styles.state)}>
                          {item.status}
                        </span>
                      )}
                      <ChevronRight
                        size={16}
                        aria-hidden="true"
                        {...stylex.props(styles.arrow)}
                      />
                    </a>
                  </li>
                );
              })}
            </ul>
          </Card>
        </section>
      ))}
    </section>
  );
}

export function createConsoleSettingsBinding(path: string, label: string) {
  if (!label.trim()) {
    throw new Error("A Console settings label is required");
  }
  return bindConsole(
    defineConsolePlugin({
      id: "console-settings",
      pages: { index: { title: label, component: ConsoleSettingsPage } },
      navigation: [
        {
          id: "settings",
          label,
          icon: <Settings size={18} aria-hidden="true" />,
          page: "index",
          defaultPlacement: "more",
        },
      ],
    }),
    { id: consoleSettingsBindingId, routes: { index: path }, services: {} }
  );
}
