import { useQuery } from "@tanstack/react-query";
import {
  AlertCircle,
  CheckCircle2,
  Circle,
  PlayCircle,
  Terminal,
  Workflow,
} from "lucide-react";

import { fetchLaunchpad, launchpadQueryKey } from "../data/available-modules";
import { cn } from "../lib/cn";
import { runtimeConsoleDataSource } from "../lib/http-client";
import { launchpadStatusLabel, launchpadSummary } from "./launchpad-model";

export function LaunchpadPage() {
  const query = useQuery({
    queryFn: () => fetchLaunchpad(),
    queryKey: launchpadQueryKey,
  });
  const response = query.data;
  const summary = launchpadSummary(response);
  const tone =
    query.isError || summary.status === "needs_attention"
      ? "error"
      : summary.status === "ready"
        ? "success"
        : "default";

  return (
    <section className="grid h-full min-h-0 min-w-0 grid-rows-[auto_auto_minmax(0,1fr)] overflow-hidden bg-(--bg-canvas) text-(--fg-primary)">
      <header className="border-b border-(--line) bg-(--bg-panel) px-3 py-2">
        <div className="flex min-w-0 items-center gap-2">
          <Workflow className="text-(--accent)" size={14} />
          <h1 className="min-w-0 truncate font-mono text-[13px] font-semibold">
            Launchpad
          </h1>
          <span
            className={cn(
              "rounded border px-1.5 py-0.5 font-mono text-[10px]",
              tone === "success" &&
                "border-(--tone-success-border) bg-(--tone-success-bg) text-(--tone-success-fg)",
              tone === "error" &&
                "border-(--tone-error-border) bg-(--tone-error-bg) text-(--tone-error-fg)",
              tone === "default" &&
                "border-(--line-strong) bg-(--bg-panel-muted) text-(--fg-secondary)"
            )}
          >
            {query.isLoading ? "loading" : launchpadStatusLabel(summary.status)}
          </span>
          <span className="ml-auto min-w-0 truncate font-mono text-[10px] text-(--fg-tertiary)">
            {runtimeConsoleDataSource()}
          </span>
        </div>
        <p className="mt-1 min-w-0 truncate font-mono text-[10px] text-(--fg-tertiary)">
          {summary.projectName} / {summary.blueprint}
        </p>
      </header>

      <div className="grid border-b border-(--line) bg-(--bg-panel) md:grid-cols-4">
        <LaunchpadCounter label="services" value={summary.serviceCount} />
        <LaunchpadCounter label="modules" value={summary.moduleCount} />
        <LaunchpadCounter label="checklist" value={summary.checklist.length} />
        <LaunchpadCounter label="commands" value={summary.commands.length} />
      </div>

      <main className="min-h-0 overflow-auto">
        <section className="grid gap-2 border-b border-(--line) bg-(--bg-panel-muted) px-3 py-2 md:grid-cols-[minmax(260px,1fr)_minmax(320px,1.2fr)]">
          <div className="min-w-0">
            <div className="font-mono text-[12px] font-semibold">
              {summary.summary}
            </div>
            <div className="mt-1 font-mono text-[10px] text-(--fg-tertiary)">
              state file: {response?.launchpadFile ?? ".lenso/launchpad.json"}
            </div>
          </div>
          <div className="min-w-0">
            <div className="mb-1 flex items-center gap-1.5 font-mono text-[10px] uppercase text-(--fg-tertiary)">
              <Terminal size={12} />
              next command
            </div>
            <code className="block min-w-0 overflow-hidden text-ellipsis rounded border border-(--line) bg-(--bg-panel) px-2 py-1.5 font-mono text-[11px] text-(--fg-primary)">
              {query.isError ? errorMessage(query.error) : summary.nextCommand}
            </code>
          </div>
        </section>

        <section className="grid min-w-[920px] lg:grid-cols-[minmax(0,1.4fr)_minmax(320px,0.8fr)]">
          <div className="min-w-0 border-r border-(--line)">
            <div className="grid grid-cols-[minmax(160px,0.8fr)_80px_minmax(180px,1fr)_minmax(220px,1fr)] gap-3 border-b border-(--line) bg-(--bg-panel-muted) px-3 py-1.5 font-mono text-[10px] uppercase text-(--fg-tertiary)">
              <span>service</span>
              <span>lang</span>
              <span>command</span>
              <span>ready</span>
            </div>
            {query.isLoading ? (
              <LaunchpadRowMessage message="Loading Launchpad state..." />
            ) : query.isError ? (
              <LaunchpadRowMessage
                message={errorMessage(query.error)}
                tone="error"
              />
            ) : response?.services.length ? (
              response.services.map((service) => (
                <div
                  className="grid grid-cols-[minmax(160px,0.8fr)_80px_minmax(180px,1fr)_minmax(220px,1fr)] gap-3 border-b border-(--line) px-3 py-2 font-mono text-[11px]"
                  key={service.name}
                >
                  <div className="min-w-0">
                    <div className="truncate font-semibold">{service.name}</div>
                    <div className="mt-0.5 truncate text-[10px] text-(--fg-tertiary)">
                      {service.role ?? service.cwd ?? "service"}
                    </div>
                  </div>
                  <span className="text-(--fg-secondary)">
                    {service.language ?? "service"}
                  </span>
                  <code className="min-w-0 truncate text-(--fg-secondary)">
                    {service.command ?? "start service"}
                  </code>
                  <span className="min-w-0 truncate text-(--fg-tertiary)">
                    {service.readyUrl ?? "not declared"}
                  </span>
                </div>
              ))
            ) : (
              <LaunchpadRowMessage message="No Launchpad services configured." />
            )}

            <div className="grid grid-cols-[minmax(160px,0.8fr)_minmax(180px,1fr)_minmax(220px,1fr)] gap-3 border-b border-(--line) bg-(--bg-panel-muted) px-3 py-1.5 font-mono text-[10px] uppercase text-(--fg-tertiary)">
              <span>module</span>
              <span>owner service</span>
              <span>capability</span>
            </div>
            {response?.modules.length ? (
              response.modules.map((module) => (
                <div
                  className="grid grid-cols-[minmax(160px,0.8fr)_minmax(180px,1fr)_minmax(220px,1fr)] gap-3 border-b border-(--line) px-3 py-2 font-mono text-[11px]"
                  key={module.name}
                >
                  <span className="min-w-0 truncate font-semibold">
                    {module.name}
                  </span>
                  <span className="min-w-0 truncate text-(--fg-secondary)">
                    {module.ownerService ?? "service"}
                  </span>
                  <span className="min-w-0 truncate text-(--fg-tertiary)">
                    {module.capability ?? "module capability"}
                  </span>
                </div>
              ))
            ) : (
              <LaunchpadRowMessage message="No Launchpad modules configured." />
            )}
          </div>

          <aside className="min-w-0 bg-(--bg-panel)">
            <section className="border-b border-(--line) px-3 py-2">
              <div className="mb-2 flex items-center gap-1.5 font-mono text-[10px] uppercase text-(--fg-tertiary)">
                <PlayCircle size={12} />
                checklist
              </div>
              <div className="grid gap-1.5">
                {summary.checklist.length > 0 ? (
                  summary.checklist.map((item) => (
                    <div
                      className="grid grid-cols-[16px_minmax(0,1fr)] gap-2 font-mono text-[11px]"
                      key={item.id}
                    >
                      <ChecklistIcon status={item.status} />
                      <div className="min-w-0">
                        <div className="truncate">{item.label}</div>
                        <div className="truncate text-[10px] text-(--fg-tertiary)">
                          {item.nextCommand ?? item.status}
                        </div>
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="font-mono text-[11px] text-(--fg-tertiary)">
                    No checklist yet.
                  </div>
                )}
              </div>
            </section>

            <section className="px-3 py-2">
              <div className="mb-2 flex items-center gap-1.5 font-mono text-[10px] uppercase text-(--fg-tertiary)">
                <Terminal size={12} />
                agent handoff
              </div>
              <div className="grid gap-1.5">
                {summary.commands.map((command) => (
                  <code
                    className="min-w-0 overflow-hidden text-ellipsis border border-(--line) bg-(--bg-canvas) px-2 py-1 font-mono text-[10px] text-(--fg-secondary)"
                    key={command}
                  >
                    {command}
                  </code>
                ))}
              </div>
            </section>
          </aside>
        </section>
      </main>
    </section>
  );
}

function LaunchpadCounter({ label, value }: { label: string; value: number }) {
  return (
    <div className="border-r border-(--line) px-3 py-2 font-mono">
      <div className="text-[10px] uppercase text-(--fg-tertiary)">{label}</div>
      <div className="mt-0.5 text-[16px] font-semibold">{value}</div>
    </div>
  );
}

function LaunchpadRowMessage({
  message,
  tone = "default",
}: {
  message: string;
  tone?: "default" | "error";
}) {
  return (
    <div
      className={cn(
        "border-b border-(--line) px-3 py-3 font-mono text-[11px] text-(--fg-tertiary)",
        tone === "error" && "text-(--tone-error-fg)"
      )}
    >
      {message}
    </div>
  );
}

function ChecklistIcon({ status }: { status: string }) {
  if (status === "done") {
    return (
      <CheckCircle2 className="mt-0.5 text-(--tone-success-fg)" size={13} />
    );
  }
  if (status === "next") {
    return <PlayCircle className="mt-0.5 text-(--accent)" size={13} />;
  }
  if (status === "blocked" || status === "failed") {
    return <AlertCircle className="mt-0.5 text-(--tone-error-fg)" size={13} />;
  }
  return <Circle className="mt-0.5 text-(--fg-tertiary)" size={13} />;
}

function errorMessage(error: unknown) {
  return error instanceof Error
    ? error.message
    : "Launchpad state unavailable.";
}
