import {
  ConsolePageScope,
  type ConsoleLocalPageProps,
} from "@lenso/console-react";
import { Link } from "@lenso/ui/link";
import * as stylex from "@stylexjs/stylex";

import type { ReviewServices } from "./review-pages";
import { sampleOperator } from "./review-samples";

export const reviewAuthStates = [
  ["unauthenticated", "Password login"],
  ["expired", "Expired session"],
  ["forbidden", "Access denied"],
  ["unavailable", "Service unavailable"],
  ["loading", "Connecting"],
  ["error", "Login error"],
] as const;

interface DirectorySection {
  label: string;
  description: string;
  groups: readonly {
    label: string;
    pages: readonly (readonly [label: string, href: string])[];
  }[];
}

const sections: readonly DirectorySection[] = [
  {
    label: "Workspace",
    description: "Everyday pages and content.",
    groups: [
      { label: "Dashboard", pages: [["Widgets & layout", "/"]] },
      {
        label: "Plugins",
        pages: [
          ["Plugin list", "/plugins"],
          ["Plugin detail", "/plugins/sample-local/sample-auth"],
        ],
      },
      {
        label: "Orders",
        pages: [
          ["Overview", "/orders"],
          ["Manage orders", "/orders/manage"],
          ["By status", "/orders/status"],
          ["Order detail", "/orders/detail/sample-order-1"],
        ],
      },
    ],
  },
  {
    label: "Administration",
    description: "People, access and services.",
    groups: [
      {
        label: "Identity",
        pages: [
          ["Directory", "/identity"],
          ["User & sessions", `/identity/users/${sampleOperator}`],
        ],
      },
      {
        label: "Access",
        pages: [
          ["Members & permissions", "/access"],
          ["Roles", "/access/roles"],
        ],
      },
      {
        label: "Agent connections",
        pages: [
          ["Personal tokens", "/agent-connections"],
          ["Management events", "/agent-connections/events"],
        ],
      },
      {
        label: "Inspection",
        pages: [
          ["Authorization", "/authorization"],
          ["Runtime", "/runtime"],
        ],
      },
    ],
  },
  {
    label: "Authentication",
    description: "Sessions, consent and sign-in.",
    groups: [
      ...["workforce", "customers"].map(
        (realm): DirectorySection["groups"][number] => ({
          label: realm === "workforce" ? "Workforce" : "Customers",
          pages: [
            ["Information", `/${realm}`],
            ["Subjects", `/${realm}/subjects`],
            ["Sessions", `/${realm}/sessions`],
            ["Session detail", `/${realm}/sessions/sample-${realm}-1`],
          ],
        })
      ),
      {
        label: "OAuth",
        pages: [
          ["Connected applications", "/connected-applications"],
          ["Application consent", "/oauth/consent/sample-request"],
        ],
      },
      {
        label: "Sign-in states",
        pages: reviewAuthStates.map(([state, label]) => [
          label,
          `/review/auth/${state}`,
        ]),
      },
    ],
  },
];

export function ReviewDirectory(props: ConsoleLocalPageProps<ReviewServices>) {
  return (
    <section aria-label="All Console pages" {...stylex.props(styles.page)}>
      <ConsolePageScope
        scopeKey={props.activation.key}
        value={{ context: { kind: "object", label: "All pages" } }}
      />
      <p {...stylex.props(styles.note)}>
        Sample data only. No live Auth, MCP or Runtime connections. Changes
        reset on reload; never enter real credentials.
      </p>
      <div {...stylex.props(styles.sections)}>
        {sections.map((section) => (
          <section
            key={section.label}
            aria-label={section.label}
            {...stylex.props(styles.section)}
          >
            <header>
              <h2 {...stylex.props(styles.title)}>{section.label}</h2>
              <p {...stylex.props(styles.description)}>{section.description}</p>
            </header>
            <div {...stylex.props(styles.groups)}>
              {section.groups.map((group) => (
                <nav key={group.label} aria-label={`${group.label} pages`}>
                  <h3 {...stylex.props(styles.groupTitle)}>{group.label}</h3>
                  {/* oxlint-disable-next-line jsx-a11y/no-redundant-roles -- Safari drops list semantics when list-style is none. */}
                  <ul role="list" {...stylex.props(styles.links)}>
                    {group.pages.map(([label, href]) => (
                      <li key={href}>
                        <Link href={href} xstyle={styles.link}>
                          {label}
                        </Link>
                      </li>
                    ))}
                  </ul>
                </nav>
              ))}
            </div>
          </section>
        ))}
      </div>
    </section>
  );
}

const styles = stylex.create({
  page: {
    boxSizing: "border-box",
    width: "100%",
    maxWidth: 1136,
    marginInline: "auto",
    paddingInline: 24,
    paddingBlockEnd: 112,
    containerType: "inline-size",
    color: "var(--foreground)",
  },
  note: {
    marginBlockStart: 0,
    marginBlockEnd: 32,
    maxWidth: "76ch",
    fontSize: 13,
    lineHeight: 1.6,
    color: "color-mix(in oklab, var(--muted) 90%, var(--foreground) 10%)",
  },
  sections: { display: "grid", gap: 40 },
  section: {
    display: "grid",
    gridTemplateColumns: {
      default: "144px minmax(0, 1fr)",
      "@container (max-width: 800px)": "minmax(0, 1fr)",
    },
    gap: { default: 32, "@container (max-width: 800px)": 16 },
    alignItems: "start",
  },
  title: { margin: 0, fontSize: 18, fontWeight: 600, lineHeight: 1.4 },
  description: {
    marginBlockStart: 6,
    marginBlockEnd: 0,
    fontSize: 12,
    lineHeight: 1.6,
    color: "color-mix(in oklab, var(--muted) 90%, var(--foreground) 10%)",
  },
  groups: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fill, minmax(min(100%, 192px), 1fr))",
    gap: 24,
    minWidth: 0,
    alignItems: "start",
  },
  groupTitle: {
    marginBlockStart: 0,
    marginBlockEnd: 6,
    paddingInline: 8,
    fontSize: 13,
    fontWeight: 600,
    lineHeight: 1.5,
  },
  links: {
    listStyleType: "none",
    margin: 0,
    padding: 0,
    display: "grid",
    gap: 2,
  },
  link: {
    "--link": {
      default: "color-mix(in oklab, var(--muted) 90%, var(--foreground) 10%)",
      ":focus-visible": "var(--accent-soft-foreground)",
      "@media (hover: hover)": {
        ":hover": "var(--accent-soft-foreground)",
      },
    },
    display: "flex",
    alignItems: "center",
    minHeight: { default: 32, "@media (pointer: coarse)": 44 },
    paddingBlock: 4,
    paddingInline: 8,
    borderRadius: 6,
    fontSize: 14,
    lineHeight: 1.5,
    overflowWrap: "anywhere",
    textAlign: "start",
    color: "var(--link)",
    textDecorationLine: "none",
  },
});
