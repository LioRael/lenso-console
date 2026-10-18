import * as stylex from "@stylexjs/stylex";

import { ConsoleAdmittedNavigation } from "../../app/console-admission";

const styles = stylex.create({
  layout: {
    width: "100%",
    height: "100dvh",
    backgroundColor: "var(--background)",
    color: "var(--foreground)",
  },
});

export function HomePage() {
  return (
    <ConsoleAdmittedNavigation>
      <main {...stylex.props(styles.layout)} aria-label="Home" />
    </ConsoleAdmittedNavigation>
  );
}
