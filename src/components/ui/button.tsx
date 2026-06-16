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
        "inline-flex min-h-7 items-center justify-center gap-1.5 rounded-[var(--radius-control)] border px-2.5 text-xs font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--accent) disabled:opacity-45",
        variant === "default" &&
          "border-(--line) bg-(--bg-control) text-(--fg-primary) shadow-(--elevation-control) hover:bg-(--bg-control-hover) active:bg-(--bg-control-active)",
        variant === "ghost" &&
          "border-transparent bg-transparent text-(--fg-secondary) hover:bg-(--bg-row-hover) hover:text-(--fg-primary) active:bg-(--bg-control-active)",
        variant === "danger" &&
          "border-[var(--tone-error-border)] bg-[var(--tone-error-bg)] text-(--tone-error-fg) hover:bg-[var(--tone-error-bg)] active:bg-[var(--tone-error-bg)]",
        className
      )}
      type={type}
      {...props}
    >
      {children}
    </button>
  );
}
