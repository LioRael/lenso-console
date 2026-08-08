import type { ConsoleStyle } from "@lenso/console-ui";
import * as stylex from "@stylexjs/stylex";
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  CircleDot,
  Clock3,
  LoaderCircle,
  OctagonX,
} from "lucide-react";

import type { RuntimeStatus } from "../../data/mock-runtime";

type RuntimeStatusBadgeProps = {
  status: RuntimeStatus;
  stylex?: ConsoleStyle;
  variant?: "default" | "compact" | "label" | "table";
};

const styles = stylex.create({
  base: {
    alignItems: "center",
    borderRadius: "9999px",
    borderStyle: "solid",
    borderWidth: 1,
    display: "inline-flex",
    fontSize: 11,
    fontWeight: 500,
    gap: 4,
    lineHeight: 1,
    maxWidth: "100%",
    minHeight: 20,
    paddingInline: 8,
    width: "fit-content",
  },
  compact: { fontSize: 10, minHeight: 18, paddingInline: 6 },
  icon: (size: "compact" | "default") => ({
    flexShrink: 0,
    height: size === "compact" ? 10 : 12,
    width: size === "compact" ? 10 : 12,
  }),
  label: { fontSize: 11, paddingBlock: 2 },
  table: {
    justifyContent: "center",
    minHeight: 18,
    paddingInline: 4,
    width: 72,
  },
  tone: (props: StatusTone) => ({
    backgroundColor: props.backgroundColor,
    borderColor: props.borderColor,
    color: props.color,
  }),
  text: {
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
});

export function RuntimeStatusBadge({
  status,
  stylex: stylexStyle,
  variant = "default",
}: RuntimeStatusBadgeProps) {
  const tone = runtimeStatusTone[status];
  const StatusIcon = tone.icon;
  const showIcon = variant !== "table";

  return (
    <span
      {...stylex.props(
        stylexStyle,
        styles.base,
        styles.tone(tone),
        variant === "compact" && styles.compact,
        variant === "label" && styles.label,
        variant === "table" && styles.table
      )}
      title={tone.label}
    >
      {showIcon ? (
        <StatusIcon
          {...stylex.props(
            styles.icon(variant === "compact" ? "compact" : "default")
          )}
          strokeWidth={2.2}
        />
      ) : null}
      <span {...stylex.props(styles.text)}>{tone.label}</span>
    </span>
  );
}

type StatusTone = {
  backgroundColor: string;
  borderColor: string;
  color: string;
};

const runtimeStatusTone: Record<
  RuntimeStatus,
  StatusTone & { icon: typeof Clock3; label: string }
> = {
  pending: {
    backgroundColor: "var(--tone-muted-bg)",
    borderColor: "var(--tone-muted-border)",
    color: "var(--tone-muted-fg)",
    icon: Clock3,
    label: "pending",
  },
  processing: {
    backgroundColor: "var(--tone-info-bg)",
    borderColor: "var(--tone-info-border)",
    color: "var(--tone-info-fg)",
    icon: LoaderCircle,
    label: "processing",
  },
  running: {
    backgroundColor: "var(--tone-info-bg)",
    borderColor: "var(--tone-info-border)",
    color: "var(--tone-info-fg)",
    icon: Activity,
    label: "running",
  },
  published: {
    backgroundColor: "var(--tone-success-bg)",
    borderColor: "var(--tone-success-border)",
    color: "var(--tone-success-fg)",
    icon: CircleDot,
    label: "published",
  },
  completed: {
    backgroundColor: "var(--tone-success-bg)",
    borderColor: "var(--tone-success-border)",
    color: "var(--tone-success-fg)",
    icon: CheckCircle2,
    label: "completed",
  },
  failed: {
    backgroundColor: "var(--tone-warning-bg)",
    borderColor: "var(--tone-warning-border)",
    color: "var(--tone-warning-fg)",
    icon: AlertTriangle,
    label: "failed",
  },
  dead: {
    backgroundColor: "var(--tone-error-bg)",
    borderColor: "var(--tone-error-border)",
    color: "var(--tone-error-fg)",
    icon: OctagonX,
    label: "dead",
  },
};
