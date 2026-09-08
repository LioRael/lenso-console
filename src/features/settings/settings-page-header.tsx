import * as stylex from "@stylexjs/stylex";
import type { ReactNode } from "react";

import { settingsPageStyles as styles } from "./settings-page.stylex";

export function SettingsPageHeader({
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
      <div {...stylex.props(styles.headerCopy)}>
        <h1 {...stylex.props(styles.pageTitle)}>{title}</h1>
        {description ? (
          <div {...stylex.props(styles.description)}>{description}</div>
        ) : null}
      </div>
      {actions ? (
        <div {...stylex.props(styles.headerActions)}>{actions}</div>
      ) : null}
    </header>
  );
}
