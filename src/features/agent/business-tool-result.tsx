import * as stylex from "@stylexjs/stylex";

import { useConsoleTranslation } from "../../app/console-i18n";

/** Provider links contain only resource identity; opening still uses App authorization. */
export function BusinessToolResult({
  content,
  changes,
}: {
  content: string;
  changes?: { label: string; before: string; after: string }[];
}) {
  const t = useConsoleTranslation();
  let body: Record<string, unknown>;
  try {
    body = JSON.parse(content);
  } catch {
    return null;
  }
  if (!body || !Array.isArray(body._links)) {
    return null;
  }
  const links = body._links.flatMap((link: unknown) => {
    if (!link || typeof link !== "object") {
      return [];
    }
    const item = link as Record<string, unknown>;
    if (typeof item.url !== "string" || typeof item.title !== "string") {
      return [];
    }
    try {
      const url = new URL(item.url);
      if (
        url.username ||
        url.password ||
        !(
          url.protocol === "https:" ||
          (url.protocol === "http:" &&
            ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname))
        )
      ) {
        return [];
      }
      return [{ url: url.href, title: item.title }];
    } catch {
      return [];
    }
  });
  if (!links.length) {
    return null;
  }
  return (
    <div {...stylex.props(styles.root)}>
      {links.map((link) => (
        <p key={link.url} {...stylex.props(styles.row)}>
          <a href={link.url} target="_blank" rel="noopener noreferrer">
            {link.title} ↗
          </a>
        </p>
      ))}
      {changes?.map((change) => (
        <p key={change.label} {...stylex.props(styles.row)}>
          {t(change.label)}: {change.before} → {change.after}
        </p>
      ))}
      {typeof body.revision === "string" ? (
        <p {...stylex.props(styles.row)}>
          {t("Revision")}: {body.revision}
        </p>
      ) : null}
    </div>
  );
}

const styles = stylex.create({
  root: { display: "grid", gap: 4, overflowWrap: "anywhere" },
  row: { margin: 0 },
});
