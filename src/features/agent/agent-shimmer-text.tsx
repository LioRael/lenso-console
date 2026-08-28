export function AgentShimmerText({
  active,
  children,
  className,
}: {
  active: boolean;
  children: string;
  className?: string | undefined;
}) {
  const classes = [className, active ? "t-shimmer" : undefined]
    .filter(Boolean)
    .join(" ");

  return (
    <span
      className={classes || undefined}
      {...(active ? { "data-text": children } : {})}
    >
      {children}
    </span>
  );
}
