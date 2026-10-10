import * as stylex from "@stylexjs/stylex";

import { ConsoleLayout } from "../../components/console/console-layout";

const styles = stylex.create({
  layout: {
    width: "100%",
    height: "100dvh",
    backgroundColor: "var(--background)",
    color: "var(--foreground)",
  },
  content: { height: "100%" },
});

export function HomePage() {
  return (
    <ConsoleLayout xstyle={styles.layout}>
      <main {...stylex.props(styles.content)} aria-label="Home" />
    </ConsoleLayout>
  );
}
