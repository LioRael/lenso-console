import { useQuery } from "@tanstack/react-query";
import {
  AlertCircle,
  Activity,
  CheckCircle2,
  Circle,
  ListChecks,
  Plug,
  PlayCircle,
  ShieldCheck,
  Terminal,
  Workflow,
} from "lucide-react";

import {
  fetchLaunchpad,
  fetchLaunchpadChangePlan,
  fetchLaunchpadDoctor,
  fetchLaunchpadProof,
  launchpadChangePlanQueryKey,
  launchpadDoctorQueryKey,
  launchpadProofQueryKey,
  launchpadQueryKey,
} from "../data/available-modules";
import { cn } from "../lib/cn";
import { runtimeConsoleDataSource } from "../lib/http-client";
import {
  type LaunchpadDoctorSummary,
  type LaunchpadProofSummary,
  type LaunchpadSummary,
  type LaunchpadChangePlanSummary,
  launchpadChangePlanSummary,
  launchpadDoctorSummary,
  launchpadProofSummary,
  launchpadStatusLabel,
  launchpadSummary,
} from "./launchpad-model";

export function LaunchpadPage() {
  const {
    data: response,
    error: launchpadError,
    isError: isLaunchpadError,
    isLoading: isLaunchpadLoading,
  } = useQuery({
    queryFn: () => fetchLaunchpad(),
    queryKey: launchpadQueryKey,
  });
  const summary = launchpadSummary(response);
  const {
    data: doctorResponse,
    error: doctorError,
    isError: isDoctorError,
    isLoading: isDoctorLoading,
  } = useQuery({
    queryFn: () => fetchLaunchpadDoctor(),
    queryKey: launchpadDoctorQueryKey,
  });
  const doctor = launchpadDoctorSummary(doctorResponse);
  const {
    data: proofResponse,
    error: proofError,
    isError: isProofError,
    isLoading: isProofLoading,
  } = useQuery({
    queryFn: () => fetchLaunchpadProof(),
    queryKey: launchpadProofQueryKey,
  });
  const proof = launchpadProofSummary(proofResponse);
  const {
    data: changePlanResponse,
    error: changePlanError,
    isError: isChangePlanError,
    isLoading: isChangePlanLoading,
  } = useQuery({
    queryFn: () => fetchLaunchpadChangePlan(),
    queryKey: launchpadChangePlanQueryKey,
  });
  const changePlan = launchpadChangePlanSummary(changePlanResponse);
  const tone =
    isLaunchpadError || summary.status === "needs_attention"
      ? "error"
      : summary.status === "ready"
        ? "success"
        : "default";
  const doctorTone =
    isDoctorError ||
    doctor.status === "failed" ||
    doctor.status === "needs_attention"
      ? "error"
      : doctor.status === "ready"
        ? "success"
        : "default";
  const proofTone =
    isProofError ||
    proof.status === "failed" ||
    proof.status === "needs_attention" ||
    proof.status === "drifted"
      ? "error"
      : proof.status === "ready"
        ? "success"
        : "default";
  const changePlanTone =
    isChangePlanError ||
    changePlan.status === "failed" ||
    changePlan.status === "blocked"
      ? "error"
      : changePlan.status === "ready"
        ? "success"
        : "default";

  return (
    <section className="grid h-full min-h-0 min-w-0 grid-rows-[auto_auto_minmax(0,1fr)] overflow-hidden bg-(--bg-canvas) text-(--fg-primary)">
      <header className="border-b border-(--line) bg-(--bg-panel) px-3 py-2">
        <div className="flex min-w-0 items-center gap-2">
          <Workflow className="text-(--accent)" size={14} />
          <h1 className="min-w-0 truncate text-sm font-semibold">
            App Lifecycle
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
            {isLaunchpadLoading
              ? "loading"
              : launchpadStatusLabel(summary.status)}
          </span>
          <span
            className={cn(
              "rounded border px-1.5 py-0.5 font-mono text-[10px]",
              doctorTone === "success" &&
                "border-(--tone-success-border) bg-(--tone-success-bg) text-(--tone-success-fg)",
              doctorTone === "error" &&
                "border-(--tone-error-border) bg-(--tone-error-bg) text-(--tone-error-fg)",
              doctorTone === "default" &&
                "border-(--line-strong) bg-(--bg-panel-muted) text-(--fg-secondary)"
            )}
          >
            doctor{" "}
            {isDoctorLoading ? "loading" : launchpadStatusLabel(doctor.status)}
          </span>
          <span
            className={cn(
              "rounded border px-1.5 py-0.5 font-mono text-[10px]",
              proofTone === "success" &&
                "border-(--tone-success-border) bg-(--tone-success-bg) text-(--tone-success-fg)",
              proofTone === "error" &&
                "border-(--tone-error-border) bg-(--tone-error-bg) text-(--tone-error-fg)",
              proofTone === "default" &&
                "border-(--line-strong) bg-(--bg-panel-muted) text-(--fg-secondary)"
            )}
          >
            proof{" "}
            {isProofLoading ? "loading" : launchpadStatusLabel(proof.status)}
          </span>
          <span
            className={cn(
              "rounded border px-1.5 py-0.5 font-mono text-[10px]",
              changePlanTone === "success" &&
                "border-(--tone-success-border) bg-(--tone-success-bg) text-(--tone-success-fg)",
              changePlanTone === "error" &&
                "border-(--tone-error-border) bg-(--tone-error-bg) text-(--tone-error-fg)",
              changePlanTone === "default" &&
                "border-(--line-strong) bg-(--bg-panel-muted) text-(--fg-secondary)"
            )}
          >
            plan{" "}
            {isChangePlanLoading
              ? "loading"
              : launchpadStatusLabel(changePlan.status)}
          </span>
          <span className="ml-auto min-w-0 truncate font-mono text-[10px] text-(--fg-tertiary)">
            {runtimeConsoleDataSource()}
          </span>
        </div>
        <p className="mt-1 min-w-0 truncate font-mono text-[10px] text-(--fg-tertiary)">
          {summary.projectName} / {summary.blueprint}
        </p>
      </header>

      <div className="grid border-b border-(--line) bg-(--bg-panel) md:grid-cols-7">
        <LaunchpadCounter label="services" value={summary.serviceCount} />
        <LaunchpadCounter label="modules" value={summary.moduleCount} />
        <LaunchpadCounter label="addons" value={summary.addonCount} />
        <LaunchpadCounter label="checklist" value={summary.checklist.length} />
        <LaunchpadCounter label="doctor" value={doctor.checks} />
        <LaunchpadCounter label="proof" value={proof.driftCount} />
        <LaunchpadCounter label="plan" value={changePlan.changes.length} />
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
              {isLaunchpadError
                ? errorMessage(launchpadError)
                : summary.nextCommand}
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
            {isLaunchpadLoading ? (
              <LaunchpadRowMessage message="Loading Launchpad state..." />
            ) : isLaunchpadError ? (
              <LaunchpadRowMessage
                message={errorMessage(launchpadError)}
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
            <LaunchpadAddonsPanel summary={summary} />
            <LaunchpadChecklistPanel checklist={summary.checklist} />
            <LaunchpadDoctorPanel
              doctor={doctor}
              error={doctorError}
              isError={isDoctorError}
              isLoading={isDoctorLoading}
            />
            <LaunchpadProofPanel
              error={proofError}
              isError={isProofError}
              isLoading={isProofLoading}
              proof={proof}
            />
            <LaunchpadChangePlanPanel
              changePlan={changePlan}
              error={changePlanError}
              isError={isChangePlanError}
              isLoading={isChangePlanLoading}
            />
            <LaunchpadAgentHandoff commands={summary.commands} />
          </aside>
        </section>
      </main>
    </section>
  );
}

function LaunchpadAddonsPanel({ summary }: { summary: LaunchpadSummary }) {
  return (
    <section className="border-b border-(--line) px-3 py-2">
      <div className="mb-2 flex items-center gap-1.5 font-mono text-[10px] uppercase text-(--fg-tertiary)">
        <Plug size={12} />
        addons
      </div>
      <div className="grid gap-1.5">
        {summary.addons.length > 0 ? (
          summary.addons.map((addon) => (
            <div
              className="grid grid-cols-[minmax(0,1fr)_auto] gap-2 font-mono text-[11px]"
              key={addon.name}
            >
              <div className="min-w-0">
                <div className="truncate font-semibold">{addon.label}</div>
                <div className="truncate text-[10px] text-(--fg-tertiary)">
                  {addon.services.join(", ") || addon.name}
                </div>
              </div>
              <span className="rounded border border-(--line-strong) px-1.5 py-0.5 text-[10px] text-(--fg-secondary)">
                {addon.status}
              </span>
            </div>
          ))
        ) : (
          <div className="font-mono text-[11px] text-(--fg-tertiary)">
            No addons configured.
          </div>
        )}
        {summary.supportedAddons.length > 0 && (
          <div className="flex min-w-0 flex-wrap gap-1 pt-1">
            {summary.supportedAddons.map((addon) => (
              <span
                className="max-w-full truncate border border-(--line) bg-(--bg-canvas) px-1.5 py-0.5 font-mono text-[10px] text-(--fg-tertiary)"
                key={addon}
              >
                {addon}
              </span>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

function LaunchpadChecklistPanel({
  checklist,
}: {
  checklist: LaunchpadSummary["checklist"];
}) {
  return (
    <section className="border-b border-(--line) px-3 py-2">
      <div className="mb-2 flex items-center gap-1.5 font-mono text-[10px] uppercase text-(--fg-tertiary)">
        <PlayCircle size={12} />
        checklist
      </div>
      <div className="grid gap-1.5">
        {checklist.length > 0 ? (
          checklist.map((item) => (
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
  );
}

function LaunchpadDoctorPanel({
  doctor,
  error,
  isError,
  isLoading,
}: {
  doctor: LaunchpadDoctorSummary;
  error: unknown;
  isError: boolean;
  isLoading: boolean;
}) {
  return (
    <section className="border-b border-(--line) px-3 py-2">
      <div className="mb-2 flex items-center gap-1.5 font-mono text-[10px] uppercase text-(--fg-tertiary)">
        <Activity size={12} />
        doctor
      </div>
      {isLoading ? (
        <div className="font-mono text-[11px] text-(--fg-tertiary)">
          Loading doctor state...
        </div>
      ) : isError ? (
        <div className="font-mono text-[11px] text-(--tone-error-fg)">
          {errorMessage(error)}
        </div>
      ) : (
        <div className="grid gap-1.5 font-mono text-[11px]">
          <div className="flex min-w-0 items-center gap-2">
            <StatusDot status={doctor.status} />
            <span className="min-w-0 truncate">
              {launchpadStatusLabel(doctor.status)}
            </span>
            <span className="ml-auto text-[10px] text-(--fg-tertiary)">
              {doctor.live ? "live" : "static"}
            </span>
          </div>
          <div className="truncate text-[10px] text-(--fg-tertiary)">
            state file: {doctor.doctorFile}
          </div>
          {doctor.attentionChecks.length > 0 ? (
            doctor.attentionChecks.map((check) => (
              <div
                className="grid grid-cols-[16px_minmax(0,1fr)] gap-2 pt-1"
                key={check.id}
              >
                <StatusDot status={check.status} />
                <div className="min-w-0">
                  <div className="truncate">{check.label}</div>
                  <div className="truncate text-[10px] text-(--fg-tertiary)">
                    {check.message}
                  </div>
                  {check.command && (
                    <code className="mt-1 block min-w-0 overflow-hidden text-ellipsis border border-(--line) bg-(--bg-canvas) px-1.5 py-0.5 text-[10px] text-(--fg-secondary)">
                      {check.command}
                    </code>
                  )}
                </div>
              </div>
            ))
          ) : (
            <div className="text-(--fg-tertiary)">
              No doctor checks need attention.
            </div>
          )}
          <code className="min-w-0 overflow-hidden text-ellipsis border border-(--line) bg-(--bg-canvas) px-2 py-1 text-[10px] text-(--fg-secondary)">
            {doctor.nextCommand}
          </code>
        </div>
      )}
    </section>
  );
}

function LaunchpadProofPanel({
  error,
  isError,
  isLoading,
  proof,
}: {
  error: unknown;
  isError: boolean;
  isLoading: boolean;
  proof: LaunchpadProofSummary;
}) {
  return (
    <section className="border-b border-(--line) px-3 py-2">
      <div className="mb-2 flex items-center gap-1.5 font-mono text-[10px] uppercase text-(--fg-tertiary)">
        <ShieldCheck size={12} />
        app proof
      </div>
      {isLoading ? (
        <div className="font-mono text-[11px] text-(--fg-tertiary)">
          Loading App Proof...
        </div>
      ) : isError ? (
        <div className="font-mono text-[11px] text-(--tone-error-fg)">
          {errorMessage(error)}
        </div>
      ) : (
        <div className="grid gap-1.5 font-mono text-[11px]">
          <div className="flex min-w-0 items-center gap-2">
            <StatusDot status={proof.status} />
            <span className="min-w-0 truncate">
              {launchpadStatusLabel(proof.status)}
            </span>
            <span className="ml-auto text-[10px] text-(--fg-tertiary)">
              {proof.driftCount} drift
            </span>
          </div>
          <div className="truncate text-[10px] text-(--fg-tertiary)">
            state file: {proof.proofFile}
          </div>
          {proof.drifts.length > 0 ? (
            proof.drifts.map((drift) => (
              <div
                className="grid grid-cols-[16px_minmax(0,1fr)] gap-2 pt-1"
                key={`${drift.resource}:${drift.name}`}
              >
                <StatusDot status="drifted" />
                <div className="min-w-0">
                  <div className="truncate">
                    {drift.resource} / {drift.name}
                  </div>
                  <div className="truncate text-[10px] text-(--fg-tertiary)">
                    {drift.message}
                  </div>
                  {drift.command && (
                    <code className="mt-1 block min-w-0 overflow-hidden text-ellipsis border border-(--line) bg-(--bg-canvas) px-1.5 py-0.5 text-[10px] text-(--fg-secondary)">
                      {drift.command}
                    </code>
                  )}
                </div>
              </div>
            ))
          ) : proof.attentionChecks.length > 0 ? (
            proof.attentionChecks.map((check) => (
              <div
                className="grid grid-cols-[16px_minmax(0,1fr)] gap-2 pt-1"
                key={check.id}
              >
                <StatusDot status={check.status} />
                <div className="min-w-0">
                  <div className="truncate">{check.label}</div>
                  <div className="truncate text-[10px] text-(--fg-tertiary)">
                    {check.message}
                  </div>
                  {check.command && (
                    <code className="mt-1 block min-w-0 overflow-hidden text-ellipsis border border-(--line) bg-(--bg-canvas) px-1.5 py-0.5 text-[10px] text-(--fg-secondary)">
                      {check.command}
                    </code>
                  )}
                </div>
              </div>
            ))
          ) : (
            <div className="text-(--fg-tertiary)">
              No generated-state drift found.
            </div>
          )}
          <code className="min-w-0 overflow-hidden text-ellipsis border border-(--line) bg-(--bg-canvas) px-2 py-1 text-[10px] text-(--fg-secondary)">
            {proof.nextCommand}
          </code>
        </div>
      )}
    </section>
  );
}

function LaunchpadChangePlanPanel({
  changePlan,
  error,
  isError,
  isLoading,
}: {
  changePlan: LaunchpadChangePlanSummary;
  error: unknown;
  isError: boolean;
  isLoading: boolean;
}) {
  const visibleItems =
    changePlan.blocked.length > 0 ? changePlan.blocked : changePlan.changes;

  return (
    <section className="border-b border-(--line) px-3 py-2">
      <div className="mb-2 flex items-center gap-1.5 font-mono text-[10px] uppercase text-(--fg-tertiary)">
        <ListChecks size={12} />
        app change plan
      </div>
      {isLoading ? (
        <div className="font-mono text-[11px] text-(--fg-tertiary)">
          Loading app change plan...
        </div>
      ) : isError ? (
        <div className="font-mono text-[11px] text-(--tone-error-fg)">
          {errorMessage(error)}
        </div>
      ) : (
        <div className="grid gap-1.5 font-mono text-[11px]">
          <div className="flex min-w-0 items-center gap-2">
            <StatusDot status={changePlan.status} />
            <span className="min-w-0 truncate">
              {launchpadStatusLabel(changePlan.status)}
            </span>
            <span className="ml-auto text-[10px] text-(--fg-tertiary)">
              {changePlan.safeChangeCount} safe
            </span>
          </div>
          <div className="grid grid-cols-2 gap-1 text-[10px] text-(--fg-tertiary)">
            <span className="min-w-0 truncate">
              plan: {changePlan.planFile}
            </span>
            <span className="min-w-0 truncate">
              proof: {launchpadStatusLabel(changePlan.proofStatus)}
            </span>
          </div>
          {changePlan.requestedAddons.length > 0 && (
            <div className="grid gap-0.5 text-[10px] text-(--fg-tertiary)">
              <div className="truncate">
                requested: {changePlan.requestedAddons.join(", ")}
              </div>
              <div className="truncate">
                pending:{" "}
                {changePlan.pendingAddons.length
                  ? changePlan.pendingAddons.join(", ")
                  : "none"}
              </div>
            </div>
          )}
          {changePlan.requestedPacks.length > 0 && (
            <div className="grid gap-0.5 text-[10px] text-(--fg-tertiary)">
              <div className="truncate">
                packs: {changePlan.requestedPacks.join(", ")}
              </div>
              <div className="truncate">
                pending packs:{" "}
                {changePlan.pendingPacks.length
                  ? changePlan.pendingPacks.join(", ")
                  : "none"}
              </div>
            </div>
          )}
          {changePlan.packFit.length > 0 && (
            <div className="grid gap-0.5 text-[10px] text-(--fg-tertiary)">
              {changePlan.packFit.map((fit) => (
                <div className="truncate" key={`${fit.name}:${fit.status}`}>
                  fit: {fit.name} / {fit.status}
                  {fit.issues.length ? ` / ${fit.issues[0]}` : ""}
                </div>
              ))}
            </div>
          )}
          {changePlan.packAction && (
            <code className="min-w-0 overflow-hidden text-ellipsis border border-(--line) bg-(--bg-canvas) px-2 py-1 text-[10px] text-(--fg-secondary)">
              {changePlan.packAction}
            </code>
          )}
          {changePlan.serviceAction?.command && (
            <code className="min-w-0 overflow-hidden text-ellipsis border border-(--line) bg-(--bg-canvas) px-2 py-1 text-[10px] text-(--fg-secondary)">
              {changePlan.serviceAction.command}
            </code>
          )}
          {changePlan.agentAction?.command && (
            <code className="min-w-0 overflow-hidden text-ellipsis border border-(--line) bg-(--bg-canvas) px-2 py-1 text-[10px] text-(--fg-secondary)">
              {changePlan.agentAction.command}
            </code>
          )}
          {visibleItems.length > 0 ? (
            visibleItems.map((item) => (
              <div
                className="grid grid-cols-[16px_minmax(0,1fr)] gap-2 pt-1"
                key={item.id}
              >
                <StatusDot status={item.safe ? "ready" : "failed"} />
                <div className="min-w-0">
                  <div className="truncate">
                    {item.action} / {item.name}
                  </div>
                  <div className="truncate text-[10px] text-(--fg-tertiary)">
                    {item.message}
                  </div>
                  <div className="truncate text-[10px] text-(--fg-tertiary)">
                    {item.kind}
                  </div>
                  {item.command && (
                    <code className="mt-1 block min-w-0 overflow-hidden text-ellipsis border border-(--line) bg-(--bg-canvas) px-1.5 py-0.5 text-[10px] text-(--fg-secondary)">
                      {item.command}
                    </code>
                  )}
                </div>
              </div>
            ))
          ) : (
            <div className="text-(--fg-tertiary)">
              No generated app changes pending.
            </div>
          )}
          <code className="min-w-0 overflow-hidden text-ellipsis border border-(--line) bg-(--bg-canvas) px-2 py-1 text-[10px] text-(--fg-secondary)">
            {changePlan.nextCommand}
          </code>
        </div>
      )}
    </section>
  );
}

function LaunchpadAgentHandoff({ commands }: { commands: string[] }) {
  return (
    <section className="px-3 py-2">
      <div className="mb-2 flex items-center gap-1.5 font-mono text-[10px] uppercase text-(--fg-tertiary)">
        <Terminal size={12} />
        agent handoff
      </div>
      <div className="grid gap-1.5">
        {commands.map((command) => (
          <code
            className="min-w-0 overflow-hidden text-ellipsis border border-(--line) bg-(--bg-canvas) px-2 py-1 font-mono text-[10px] text-(--fg-secondary)"
            key={command}
          >
            {command}
          </code>
        ))}
      </div>
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
  if (
    status === "blocked" ||
    status === "failed" ||
    status === "needs_attention"
  ) {
    return <AlertCircle className="mt-0.5 text-(--tone-error-fg)" size={13} />;
  }
  return <Circle className="mt-0.5 text-(--fg-tertiary)" size={13} />;
}

function StatusDot({ status }: { status: string }) {
  if (status === "ready" || status === "passed") {
    return (
      <CheckCircle2 className="mt-0.5 text-(--tone-success-fg)" size={13} />
    );
  }
  if (
    status === "failed" ||
    status === "needs_attention" ||
    status === "drifted" ||
    status === "blocked"
  ) {
    return <AlertCircle className="mt-0.5 text-(--tone-error-fg)" size={13} />;
  }
  if (status === "changes" || status === "needs_setup") {
    return <PlayCircle className="mt-0.5 text-(--accent)" size={13} />;
  }
  return <Circle className="mt-0.5 text-(--fg-tertiary)" size={13} />;
}

function errorMessage(error: unknown) {
  return error instanceof Error
    ? error.message
    : "Launchpad state unavailable.";
}
