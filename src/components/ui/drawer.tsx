import { Dialog as BaseDialog } from "@base-ui/react/dialog";
import { stylexClassName } from "@lenso/console-ui";
import type { HTMLAttributes, PropsWithChildren } from "react";

import { cn } from "../../lib/cn";

function DrawerRoot({
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

function DrawerContent({
  children,
  className,
  ...props
}: PropsWithChildren<HTMLAttributes<HTMLDivElement> & { className?: string }>) {
  return (
    <BaseDialog.Portal>
      <BaseDialog.Backdrop
        className={stylexClassName("fixed inset-0 z-30 bg-(--bg-scrim)")}
      />
      <BaseDialog.Popup
        className={cn(
          "fixed right-2 top-2 z-40 h-[calc(100vh-16px)] w-[min(540px,calc(100vw-16px))] overflow-auto rounded-[var(--radius-overlay)] border border-(--line) bg-(--bg-overlay) shadow-(--elevation-overlay) transition duration-200 data-[starting-style]:translate-x-2 data-[starting-style]:opacity-0",
          className
        )}
        {...props}
      >
        {children}
      </BaseDialog.Popup>
    </BaseDialog.Portal>
  );
}

export const Drawer = Object.assign(DrawerRoot, {
  Content: DrawerContent,
  Title: BaseDialog.Title,
  Close: BaseDialog.Close,
});
