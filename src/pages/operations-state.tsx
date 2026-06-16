import { cn } from "../lib/cn";

export function OperationsLoadingRows() {
  return (
    <>
      <div className="h-14 animate-pulse border-b border-(--line) bg-(--bg-panel-muted)" />
      <div className="h-14 animate-pulse border-b border-(--line) bg-(--bg-panel-muted)" />
      <div className="h-14 animate-pulse border-b border-(--line) bg-(--bg-panel-muted)" />
    </>
  );
}

export function OperationsMessageRow({
  message,
  tone = "muted",
}: {
  message: string;
  tone?: "error" | "muted";
}) {
  return (
    <div
      className={cn(
        "border-b border-(--line) px-3 py-3 text-[12px]",
        tone === "error" ? "text-(--tone-error-fg)" : "text-(--fg-tertiary)"
      )}
    >
      {message}
    </div>
  );
}
