import type { ButtonHTMLAttributes, PropsWithChildren } from "react";

import { cn } from "../../lib/cn";

type ButtonVariant = "default" | "ghost" | "danger";

type ButtonProps = PropsWithChildren<
  ButtonHTMLAttributes<HTMLButtonElement> & {
    variant?: ButtonVariant;
  }
>;

export function Button({
  children,
  className,
  type = "button",
  variant = "default",
  ...props
}: ButtonProps) {
  return (
    <button
      className={cn(
        "inline-flex min-h-7 items-center justify-center gap-1.5 rounded-md border px-2.5 text-xs font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--accent) disabled:opacity-45",
        variant === "default" &&
          "border-(--border-subtle) bg-(--elevated) text-(--foreground) shadow-[inset_0_1px_0_var(--panel-gloss)] active:bg-(--hover)",
        variant === "ghost" &&
          "border-transparent bg-transparent text-(--secondary) hover:bg-(--hover) hover:text-(--foreground) active:bg-[color-mix(in_srgb,var(--hover)_78%,var(--surface))]",
        variant === "danger" &&
          "border-[color-mix(in_srgb,var(--error)_35%,transparent)] bg-[color-mix(in_srgb,var(--error)_10%,transparent)] text-(--foreground) active:bg-[color-mix(in_srgb,var(--error)_15%,transparent)]",
        className
      )}
      type={type}
      {...props}
    >
      {children}
    </button>
  );
}
