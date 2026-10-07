import * as stylex from "@stylexjs/stylex";

import { agentShimmerTextStyles as styles } from "./agent-shimmer-text.stylex";

export function AgentShimmerText({
  active,
  children,
  className,
}: {
  active: boolean;
  children: string;
  className?: string | undefined;
}) {
  const classes = [
    className,
    active ? stylex.props(styles.active).className : undefined,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <span className={classes || undefined}>
      {children}
      {active ? (
        <span aria-hidden="true" {...stylex.props(styles.highlight)}>
          {children}
        </span>
      ) : null}
    </span>
  );
}
