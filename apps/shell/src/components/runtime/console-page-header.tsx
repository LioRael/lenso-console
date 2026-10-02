import * as stylex from "@stylexjs/stylex";
import type { ReactNode } from "react";

const styles = stylex.create({
  header: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    flexWrap: "wrap",
    gap: 16,
  },
  copy: {
    display: "grid",
    gap: 8,
    minWidth: 0,
    flex: "1 1 240px",
    paddingInline: 16,
  },
  title: {
    fontSize: "24px",
    fontWeight: 600,
    letterSpacing: "-0.02em",
    lineHeight: "30px",
    margin: 0,
    overflowWrap: "anywhere",
  },
  description: {
    margin: 0,
    fontSize: 13,
    lineHeight: "20px",
    color: "var(--muted)",
    overflowWrap: "anywhere",
  },
  actions: { display: "flex", alignItems: "center", flexWrap: "wrap", gap: 8 },
});

export function ConsolePageHeader({
  title,
  description,
  actions,
}: {
  title: string;
  description?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <header {...stylex.props(styles.header)}>
      <div {...stylex.props(styles.copy)}>
        <h1 {...stylex.props(styles.title)}>{title}</h1>
        {description ? (
          <div {...stylex.props(styles.description)}>{description}</div>
        ) : null}
      </div>
      {actions ? <div {...stylex.props(styles.actions)}>{actions}</div> : null}
    </header>
  );
}
