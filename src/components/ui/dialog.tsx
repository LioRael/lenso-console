import { Dialog as BaseDialog } from "@base-ui/react/dialog";
import type { ConsoleStyle } from "@lenso/console-ui";
import * as stylex from "@stylexjs/stylex";
import type { HTMLAttributes, PropsWithChildren } from "react";

const styles = stylex.create({
  backdrop: {
    backgroundColor: "var(--bg-scrim)",
    inset: 0,
    position: "fixed",
    zIndex: 40,
  },
  popup: {
    backgroundColor: "var(--bg-overlay)",
    borderColor: "var(--line)",
    borderRadius: "var(--radius-overlay)",
    borderStyle: "solid",
    borderWidth: 1,
    boxShadow: "var(--elevation-overlay)",
    left: "50%",
    overflow: "hidden",
    position: "fixed",
    top: "12vh",
    transform: "translateX(-50%)",
    transitionDuration: "150ms",
    transitionProperty:
      "color, background-color, border-color, outline-color, text-decoration-color, fill, stroke, opacity, box-shadow, transform, translate, scale, rotate, filter, -webkit-backdrop-filter, backdrop-filter",
    transitionTimingFunction: "ease",
    width: "min(560px, calc(100vw - 28px))",
    zIndex: 50,
    "[data-starting-style]": {
      opacity: "0%",
      transform: "translate(-50%, -0.25rem)",
    },
  },
});

function DialogRoot({
  children,
  onOpenChange,
  open,
}: PropsWithChildren<{
  open: boolean;
  onOpenChange: (open: boolean) => void;
}>) {
  return (
    <BaseDialog.Root onOpenChange={onOpenChange} open={open}>
      {children}
    </BaseDialog.Root>
  );
}

function DialogPortal({ children }: PropsWithChildren) {
  return <BaseDialog.Portal>{children}</BaseDialog.Portal>;
}

function DialogBackdrop({ stylex: stylexStyle }: { stylex?: ConsoleStyle }) {
  return (
    <BaseDialog.Backdrop {...stylex.props(styles.backdrop, stylexStyle)} />
  );
}

function DialogPopup({
  children,
  stylex: stylexStyle,
  ...props
}: PropsWithChildren<
  Omit<HTMLAttributes<HTMLDivElement>, "className" | "style"> & {
    stylex?: ConsoleStyle;
  }
>) {
  return (
    <BaseDialog.Popup {...stylex.props(styles.popup, stylexStyle)} {...props}>
      {children}
    </BaseDialog.Popup>
  );
}

export const Dialog = Object.assign(DialogRoot, {
  Portal: DialogPortal,
  Backdrop: DialogBackdrop,
  Popup: DialogPopup,
  Title: BaseDialog.Title,
  Description: BaseDialog.Description,
  Close: BaseDialog.Close,
});
