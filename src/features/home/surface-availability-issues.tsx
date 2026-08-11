import { InlineStatus } from "@lenso/console-ui";
import * as stylex from "@stylexjs/stylex";
import { Link } from "@tanstack/react-router";

import type { ConsoleSurfaceAvailability } from "../../app/console-surface-availability";

const styles = stylex.create({
  container: {
    borderBottomColor: "var(--line-subtle)",
    borderBottomStyle: "solid",
    borderBottomWidth: 1,
    paddingBlock: 14,
  },
  heading: {
    fontSize: 13,
    fontWeight: 500,
    lineHeight: "18px",
    marginBottom: 8,
  },
  issue: {
    alignItems: "center",
    color: "inherit",
    display: "grid",
    gap: 12,
    gridTemplateColumns: "minmax(0, 1fr) auto",
    paddingBlock: 7,
    textDecoration: "none",
  },
  label: {
    fontSize: 12,
    fontWeight: 500,
    lineHeight: "16px",
  },
  reason: {
    color: "var(--fg-secondary)",
    fontSize: 11,
    lineHeight: "16px",
    marginTop: 2,
  },
});

export function SurfaceAvailabilityIssues({
  availability,
}: {
  availability: readonly ConsoleSurfaceAvailability[];
}) {
  const issues = availability.filter(
    (surface) => surface.status !== "connected"
  );
  if (issues.length === 0) {
    return null;
  }
  return (
    <section
      {...stylex.props(styles.container)}
      aria-label="Module Surface availability"
      data-page-slot="home-page__surface-availability"
    >
      <h2 {...stylex.props(styles.heading)}>Module Surface availability</h2>
      {issues.map((surface) => {
        const status = statusLabel(surface.status);
        return (
          <Link
            {...stylex.props(styles.issue)}
            data-surface-availability-path={surface.path}
            key={`${surface.moduleId}:${surface.surfaceId}`}
            to={surface.path}
          >
            <div>
              <div {...stylex.props(styles.label)}>
                {surface.label} · {status}
              </div>
              <p {...stylex.props(styles.reason)}>
                {surface.reason ??
                  "This Module Surface is not available to the current operator."}
              </p>
            </div>
            <InlineStatus tone={statusTone(surface.status)}>
              {status}
            </InlineStatus>
          </Link>
        );
      })}
    </section>
  );
}

function statusLabel(status: ConsoleSurfaceAvailability["status"]) {
  return status.charAt(0).toUpperCase() + status.slice(1);
}

function statusTone(
  status: ConsoleSurfaceAvailability["status"]
): "danger" | "neutral" | "warning" {
  if (status === "incompatible") {
    return "danger";
  }
  if (status === "unavailable") {
    return "warning";
  }
  return "neutral";
}
