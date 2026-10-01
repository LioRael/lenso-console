import * as stylex from "@stylexjs/stylex";
import type { ComponentPropsWithRef } from "react";

type RowProps = ComponentPropsWithRef<"div"> & {
  disabled?: boolean;
  xstyle?: stylex.StyleXStyles;
};
const styles = stylex.create({
  root: { alignItems: "center", display: "flex", gap: 16, padding: 16 },
  copy: { flex: 1, minWidth: 0 },
  title: { color: "var(--foreground)", fontSize: 14, fontWeight: 500 },
  description: { color: "var(--muted)", fontSize: 13 },
  control: { flexShrink: 0 },
});

function Root({ disabled, xstyle, ...props }: RowProps) {
  return (
    <div
      {...props}
      aria-disabled={disabled || undefined}
      data-slot="settings-row"
      {...stylex.props(styles.root, xstyle)}
    />
  );
}
function Copy({ xstyle, ...props }: RowProps) {
  return <div {...props} {...stylex.props(styles.copy, xstyle)} />;
}
function Control({ xstyle, ...props }: RowProps) {
  return <div {...props} {...stylex.props(styles.control, xstyle)} />;
}
function Title({
  xstyle,
  ...props
}: ComponentPropsWithRef<"span"> & { xstyle?: stylex.StyleXStyles }) {
  return <span {...props} {...stylex.props(styles.title, xstyle)} />;
}
function Description({
  xstyle,
  ...props
}: ComponentPropsWithRef<"p"> & { xstyle?: stylex.StyleXStyles }) {
  return <p {...props} {...stylex.props(styles.description, xstyle)} />;
}
export const SettingsRow = { Root, Copy, Control, Title, Description };
