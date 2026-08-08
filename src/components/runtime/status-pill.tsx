import * as stylex from "@stylexjs/stylex";

import type { RuntimeStatus } from "../../data/mock-runtime";

type StatusPillProps = {
  status: RuntimeStatus;
};

const styles = stylex.create({
  dot: (color: string) => ({
    backgroundColor: color,
    borderRadius: "9999px",
    height: 6,
    width: 6,
  }),
  root: (props: StatusTone) => ({
    alignItems: "center",
    backgroundColor: props.backgroundColor,
    borderColor: props.borderColor,
    borderRadius: "9999px",
    borderStyle: "solid",
    borderWidth: 1,
    color: props.color,
    display: "inline-flex",
    fontSize: 11,
    fontWeight: 500,
    gap: 6,
    minHeight: 23,
    paddingInline: 10,
    width: "fit-content",
  }),
});

export function StatusPill({ status }: StatusPillProps) {
  const tone = statusTone[status];
  return (
    <span {...stylex.props(styles.root(tone))}>
      <span {...stylex.props(styles.dot(tone.dotColor))} />
      {status}
    </span>
  );
}

type StatusTone = {
  backgroundColor: string;
  borderColor: string;
  color: string;
  dotColor: string;
};

const statusTone: Record<RuntimeStatus, StatusTone> = {
  pending: {
    backgroundColor: "var(--tone-muted-bg)",
    borderColor: "var(--tone-muted-border)",
    color: "var(--tone-muted-fg)",
    dotColor: "var(--tone-muted-fg)",
  },
  processing: {
    backgroundColor: "var(--tone-info-bg)",
    borderColor: "var(--tone-info-border)",
    color: "var(--tone-info-fg)",
    dotColor: "var(--tone-info-fg)",
  },
  running: {
    backgroundColor: "var(--tone-info-bg)",
    borderColor: "var(--tone-info-border)",
    color: "var(--tone-info-fg)",
    dotColor: "var(--tone-info-fg)",
  },
  published: {
    backgroundColor: "var(--tone-success-bg)",
    borderColor: "var(--tone-success-border)",
    color: "var(--tone-success-fg)",
    dotColor: "var(--tone-success-fg)",
  },
  completed: {
    backgroundColor: "var(--tone-success-bg)",
    borderColor: "var(--tone-success-border)",
    color: "var(--tone-success-fg)",
    dotColor: "var(--tone-success-fg)",
  },
  failed: {
    backgroundColor: "var(--tone-warning-bg)",
    borderColor: "var(--tone-warning-border)",
    color: "var(--tone-warning-fg)",
    dotColor: "var(--tone-warning-fg)",
  },
  dead: {
    backgroundColor: "var(--tone-error-bg)",
    borderColor: "var(--tone-error-border)",
    color: "var(--tone-error-fg)",
    dotColor: "var(--tone-error-fg)",
  },
};
