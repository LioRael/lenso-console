// PROTOTYPE — THROW AWAY.
// Three variants of the complete Module lifecycle experience, switchable with
// `?prototype=lifecycle&variant=A|B|C` on the existing `/modules` route.

import {
  ArrowLeft,
  ArrowRight,
  Boxes,
  Check,
  ChevronRight,
  CircleAlert,
  CircleCheck,
  Clock3,
  Code2,
  Database,
  GitCompareArrows,
  KeyRound,
  Network,
  Play,
  RefreshCw,
  RotateCcw,
  Server,
  ShieldCheck,
  Sparkles,
  SquareTerminal,
  Trash2,
  TriangleAlert,
  Wrench,
} from "lucide-react";
import { type ReactNode, useEffect, useMemo, useState } from "react";

import { Badge } from "../components/ui/badge";
import { Button } from "../components/ui/button";
import { cn } from "../lib/cn";

type Variant = "A" | "B" | "C";
type LifecycleStage =
  | "catalog"
  | "needs_input"
  | "review"
  | "applying"
  | "repair_required"
  | "restart_required"
  | "active"
  | "uninstall_review"
  | "inactive";

type LifecycleState = {
  approved: boolean;
  configReady: boolean;
  cursor: number;
  endpointReady: boolean;
  failAtMigration: boolean;
  lockGeneration: number;
  observedProvider: "unavailable" | "verified";
  operationId: string | null;
  receiptCount: number;
  serviceRevision: number;
  stage: LifecycleStage;
};

type PlanStep = {
  detail: string;
  key: string;
  label: string;
  owner: "Host" | "Service" | "Console";
  risk?: "destructive" | "warning";
};

const variantLabels: Record<Variant, string> = {
  A: "Guided workspace",
  B: "Operations cockpit",
  C: "Relationship canvas",
};
const variantKeys: readonly Variant[] = ["A", "B", "C"];

const planSteps: PlanStep[] = [
  {
    detail: "Resolve support-ticket plus linked auth dependency",
    key: "graph",
    label: "Resolve exact Module graph",
    owner: "Host",
  },
  {
    detail: "Create Service Installation for support-suite",
    key: "service",
    label: "Install owning Service",
    owner: "Service",
  },
  {
    detail: "Activate cfg:sha256:6a22 with two Secret References",
    key: "config",
    label: "Activate Config Revision",
    owner: "Service",
  },
  {
    detail: "Apply support_ticket/0004_add_sla_policy",
    key: "migration",
    label: "Apply Host migration",
    owner: "Host",
    risk: "warning",
  },
  {
    detail: "Rebuild generated Linked composition for lenso/auth",
    key: "build",
    label: "Build linked dependency",
    owner: "Host",
  },
  {
    detail: "Match Service Release, export and Provider Protocol digests",
    key: "provider",
    label: "Verify Provider identity",
    owner: "Service",
  },
  {
    detail: "Publish Application Module Lock generation 42",
    key: "lock",
    label: "Publish target lock",
    owner: "Console",
  },
  {
    detail: "API and worker adopt the same lock generation",
    key: "restart",
    label: "Restart and prove adoption",
    owner: "Host",
  },
];

const initialState: LifecycleState = {
  approved: false,
  configReady: false,
  cursor: 0,
  endpointReady: false,
  failAtMigration: true,
  lockGeneration: 41,
  observedProvider: "unavailable",
  operationId: null,
  receiptCount: 0,
  serviceRevision: 7,
  stage: "catalog",
};

const catalogModules = [
  {
    delivery: "service / provider",
    id: "acme/support-ticket",
    note: "2 required inputs",
    status: "installable",
    version: "2.0.0",
  },
  {
    delivery: "linked",
    id: "lenso/auth",
    note: "update 1.3.2 → 1.4.0",
    status: "active",
    version: "1.4.0",
  },
  {
    delivery: "service / autonomous",
    id: "acme/billing",
    note: "endpoint observation stale",
    status: "degraded",
    version: "3.1.0",
  },
];

export function isModuleLifecyclePrototype(search: string): boolean {
  return new URLSearchParams(search).get("prototype") === "lifecycle";
}

export function ModuleLifecyclePrototype() {
  const [variant, setVariant] = useState<Variant>(() => initialVariant());
  const [state, setState] = useState<LifecycleState>(initialState);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const target = event.target;
      if (
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        (target instanceof HTMLElement && target.isContentEditable)
      ) {
        return;
      }
      if (event.key === "ArrowLeft") {
        cycleVariant(variant, -1, setVariant);
      }
      if (event.key === "ArrowRight") {
        cycleVariant(variant, 1, setVariant);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [variant]);

  const actions = useMemo(() => lifecycleActions(state, setState), [state]);

  return (
    <section className="relative h-full min-h-0 overflow-hidden bg-(--background) text-(--foreground)">
      {variant === "A" ? <VariantA actions={actions} state={state} /> : null}
      {variant === "B" ? <VariantB actions={actions} state={state} /> : null}
      {variant === "C" ? <VariantC actions={actions} state={state} /> : null}
      {import.meta.env.PROD ? null : (
        <PrototypeSwitcher
          current={variant}
          onChange={setVariant}
          onReset={() => setState(initialState)}
        />
      )}
    </section>
  );
}

function VariantA({
  actions,
  state,
}: {
  actions: ReturnType<typeof lifecycleActions>;
  state: LifecycleState;
}) {
  return (
    <div className="grid h-full min-h-0 grid-rows-[auto_minmax(0,1fr)] overflow-hidden">
      <PrototypeHeader
        eyebrow="A — guided workspace"
        summary="One guided path from discovery to durable evidence"
      />
      <div className="grid min-h-0 overflow-hidden lg:grid-cols-[248px_minmax(0,1fr)_300px]">
        <aside className="min-h-0 overflow-auto border-r border-(--border-subtle) bg-(--sidebar) p-3">
          <SectionLabel>Catalog snapshot · sha256:9f12</SectionLabel>
          <div className="mt-3 space-y-1.5">
            {catalogModules.map((module) => (
              <button
                className={cn(
                  "w-full rounded-[var(--radius-control)] border px-3 py-2.5 text-left",
                  module.id === "acme/support-ticket"
                    ? "border-(--line-strong) bg-(--bg-row-hover)"
                    : "border-transparent hover:bg-(--bg-row-hover)"
                )}
                key={module.id}
                type="button"
              >
                <span className="block text-xs font-semibold">{module.id}</span>
                <span className="mt-1 block text-[11px] text-(--fg-secondary)">
                  {module.version} · {module.delivery}
                </span>
                <span className="mt-1 block text-[10px] text-(--fg-tertiary)">
                  {module.note}
                </span>
              </button>
            ))}
          </div>
        </aside>

        <main className="min-h-0 overflow-auto p-5 pb-28">
          <div className="flex flex-wrap items-start gap-3 border-b border-(--border-subtle) pb-5">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-lg font-semibold">acme/support-ticket</h2>
                <ToneBadge tone="info">service / provider</ToneBadge>
                <ToneBadge tone={stageTone(state.stage)}>
                  {stageLabel(state.stage)}
                </ToneBadge>
              </div>
              <p className="mt-2 max-w-2xl text-sm text-(--fg-secondary)">
                Ticket lifecycle, escalation and SLA policy. This Module is
                exported by support-suite@4.2.0 and requires linked lenso/auth.
              </p>
            </div>
            <div className="ml-auto flex gap-2">
              <Button onClick={actions.primary.onClick}>
                {actions.primary.icon}
                {actions.primary.label}
              </Button>
              <Button onClick={actions.reset} variant="ghost">
                <RotateCcw size={13} /> Reset
              </Button>
            </div>
          </div>

          <div className="mt-5 grid gap-4 xl:grid-cols-[minmax(0,1fr)_260px]">
            <section>
              <div className="mb-3 flex items-center justify-between">
                <SectionLabel>Lifecycle plan</SectionLabel>
                <span className="text-[11px] text-(--fg-tertiary)">
                  operation {state.operationId ?? "not created"}
                </span>
              </div>
              <div className="overflow-hidden rounded-[var(--radius-panel)] border border-(--border-subtle)">
                {planSteps.map((step, index) => (
                  <PlanStepRow
                    index={index}
                    key={step.key}
                    state={state}
                    step={step}
                  />
                ))}
              </div>
            </section>

            <section className="space-y-3">
              <GateCard
                action={actions.toggleConfig}
                complete={state.configReady}
                detail="DATABASE_URL and SUPPORT_API_KEY remain Secret References."
                icon={<KeyRound size={14} />}
                label="Configuration"
              />
              <GateCard
                action={actions.toggleEndpoint}
                complete={state.endpointReady}
                detail="Static local Endpoint Binding; Provider identity still unverified."
                icon={<Network size={14} />}
                label="Service endpoint"
              />
              <GateCard
                complete={state.approved}
                detail="Ordinary install requires one module.manage approval."
                icon={<ShieldCheck size={14} />}
                label="Approval"
              />
            </section>
          </div>
        </main>

        <aside className="min-h-0 overflow-auto border-l border-(--border-subtle) bg-(--bg-panel-muted) p-4 pb-28">
          <SectionLabel>What will change</SectionLabel>
          <DiffList />
          <StateInspector state={state} />
        </aside>
      </div>
    </div>
  );
}

function VariantB({
  actions,
  state,
}: {
  actions: ReturnType<typeof lifecycleActions>;
  state: LifecycleState;
}) {
  return (
    <div className="grid h-full min-h-0 grid-rows-[auto_auto_minmax(0,1fr)] overflow-hidden">
      <PrototypeHeader
        eyebrow="B — operations cockpit"
        summary="Fleet state first; lifecycle work opens as an operation"
      />
      <div className="grid grid-cols-2 border-b border-(--border-subtle) sm:grid-cols-4">
        <Metric label="Selected" value="12" />
        <Metric label="Active" tone="success" value="9" />
        <Metric label="Needs attention" tone="warning" value="2" />
        <Metric label="Blocked" tone="error" value="1" />
      </div>
      <div className="grid min-h-0 overflow-hidden xl:grid-cols-[minmax(0,1fr)_360px]">
        <main className="min-h-0 overflow-auto pb-28">
          <div className="border-b border-(--border-subtle) px-4 py-3">
            <div className="flex flex-wrap items-center gap-2">
              <SectionLabel>Module fleet</SectionLabel>
              <Badge>environment · local</Badge>
              <Badge>lock · generation 41</Badge>
              <Button className="ml-auto" onClick={actions.primary.onClick}>
                {actions.primary.icon}
                {actions.primary.label}
              </Button>
            </div>
          </div>
          <div className="min-w-[760px]">
            <div className="grid grid-cols-[minmax(190px,1.3fr)_150px_120px_140px_130px] border-b border-(--border-subtle) bg-(--bg-panel-header) px-4 py-2 text-[10px] font-semibold uppercase tracking-wide text-(--fg-tertiary)">
              <span>Module</span>
              <span>Delivery</span>
              <span>Desired</span>
              <span>Observed</span>
              <span>Next action</span>
            </div>
            <FleetRow
              delivery="service / provider"
              desired="2.0.0 selected"
              module="acme/support-ticket"
              observed={stageLabel(state.stage)}
              selected
              tone={stageTone(state.stage)}
            />
            <FleetRow
              delivery="linked"
              desired="1.4.0 target"
              module="lenso/auth"
              observed="build required"
              tone="warning"
            />
            <FleetRow
              delivery="service / autonomous"
              desired="3.1.0 active"
              module="acme/billing"
              observed="endpoint stale"
              tone="warning"
            />
            <FleetRow
              delivery="linked"
              desired="1.1.0 active"
              module="lenso/audit-log"
              observed="active"
              tone="success"
            />
          </div>

          <section className="border-t border-(--border-subtle) p-4">
            <div className="mb-3 flex items-center gap-2">
              <SquareTerminal size={14} />
              <SectionLabel>Operation timeline</SectionLabel>
              <span className="ml-auto text-[11px] text-(--fg-tertiary)">
                receipts {state.receiptCount}
              </span>
            </div>
            <div className="grid gap-2 md:grid-cols-2 2xl:grid-cols-4">
              {planSteps.map((step, index) => (
                <CompactStep
                  index={index}
                  key={step.key}
                  state={state}
                  step={step}
                />
              ))}
            </div>
          </section>
        </main>

        <aside className="min-h-0 overflow-auto border-l border-(--border-subtle) bg-(--bg-panel-muted) p-4 pb-28">
          <div className="flex items-center gap-2">
            <Boxes size={15} />
            <h2 className="font-semibold">acme/support-ticket</h2>
          </div>
          <p className="mt-2 text-xs text-(--fg-secondary)">
            The selected row opens a durable operation inspector. It never hides
            a Service prerequisite behind a generic install spinner.
          </p>
          <div className="mt-4 grid grid-cols-2 gap-2">
            <GateToggle
              active={state.configReady}
              label="Config"
              onClick={actions.toggleConfig}
            />
            <GateToggle
              active={state.endpointReady}
              label="Endpoint"
              onClick={actions.toggleEndpoint}
            />
          </div>
          <div className="mt-4">
            <DiffList />
          </div>
          <StateInspector state={state} />
        </aside>
      </div>
    </div>
  );
}

function VariantC({
  actions,
  state,
}: {
  actions: ReturnType<typeof lifecycleActions>;
  state: LifecycleState;
}) {
  return (
    <div className="grid h-full min-h-0 grid-rows-[auto_minmax(0,1fr)] overflow-hidden">
      <PrototypeHeader
        eyebrow="C — relationship canvas"
        summary="See authority and dependency boundaries before acting"
      />
      <main className="relative min-h-0 overflow-auto bg-[radial-gradient(circle_at_center,color-mix(in_srgb,var(--line)_35%,transparent)_1px,transparent_1px)] bg-size-[22px_22px] p-5 pb-32">
        <div className="mx-auto grid max-w-5xl gap-5 lg:grid-cols-[1fr_80px_1fr] lg:grid-rows-[auto_auto]">
          <CanvasNode
            detail="Module 2.0.0 · Manifest sha256:b917"
            icon={<Boxes size={18} />}
            label="acme/support-ticket"
            meta="Selected business capability"
            tone="info"
          />
          <CanvasArrow label="delivered by" />
          <CanvasNode
            detail="Service Release 4.2.0 · export support"
            icon={<Server size={18} />}
            label="support-suite"
            meta={state.endpointReady ? "Endpoint bound" : "Endpoint required"}
            tone={state.endpointReady ? "success" : "warning"}
          />

          <CanvasNode
            detail="Module 1.4.0 · linked trusted Rust"
            icon={<Code2 size={18} />}
            label="lenso/auth"
            meta="Required capability: auth.users.read"
            tone="warning"
          />
          <CanvasArrow label="required by" reverse />
          <CanvasNode
            detail="Generation 41 → 42 · one coherent adoption"
            icon={<GitCompareArrows size={18} />}
            label="Application Module Lock"
            meta={stageLabel(state.stage)}
            tone={stageTone(state.stage)}
          />
        </div>

        <section className="mx-auto mt-7 max-w-5xl rounded-[var(--radius-panel)] border border-(--border-subtle) bg-(--background)">
          <div className="flex flex-wrap items-center gap-2 border-b border-(--border-subtle) px-4 py-3">
            <SectionLabel>Lifecycle rail</SectionLabel>
            <ToneBadge tone={stageTone(state.stage)}>
              {stageLabel(state.stage)}
            </ToneBadge>
            <Button className="ml-auto" onClick={actions.primary.onClick}>
              {actions.primary.icon}
              {actions.primary.label}
            </Button>
          </div>
          <div className="grid gap-px bg-(--border-subtle) md:grid-cols-4">
            <CanvasPhase
              detail="Catalog, trust, capability graph"
              label="Discover"
              state="complete"
            />
            <CanvasPhase
              detail="Service + Config + migration + build"
              label="Prepare"
              state={state.stage === "catalog" ? "pending" : "current"}
            />
            <CanvasPhase
              detail="Approval and durable operation"
              label="Apply"
              state={state.approved ? "complete" : "pending"}
            />
            <CanvasPhase
              detail="Exact lock generation adopted"
              label="Activate"
              state={state.stage === "active" ? "complete" : "pending"}
            />
          </div>
        </section>

        <div className="mx-auto mt-5 grid max-w-5xl gap-4 lg:grid-cols-[1fr_1fr]">
          <section className="rounded-[var(--radius-panel)] border border-(--border-subtle) bg-(--background) p-4">
            <SectionLabel>Resolve missing gates</SectionLabel>
            <div className="mt-3 flex flex-wrap gap-2">
              <GateToggle
                active={state.configReady}
                label="Config Revision"
                onClick={actions.toggleConfig}
              />
              <GateToggle
                active={state.endpointReady}
                label="Endpoint Binding"
                onClick={actions.toggleEndpoint}
              />
              <GateToggle
                active={!state.failAtMigration}
                label="Migration succeeds"
                onClick={actions.toggleFailure}
              />
            </div>
            <p className="mt-3 text-xs text-(--fg-tertiary)">
              The canvas makes it clear that Service readiness and Module
              activation are related evidence, not the same state.
            </p>
          </section>
          <StateInspector state={state} standalone />
        </div>
      </main>
    </div>
  );
}

function lifecycleActions(
  state: LifecycleState,
  setState: (
    next: LifecycleState | ((current: LifecycleState) => LifecycleState)
  ) => void
) {
  const reset = () => setState(initialState);
  const toggleConfig = () =>
    setState((current) => ({
      ...current,
      configReady: !current.configReady,
    }));
  const toggleEndpoint = () =>
    setState((current) => ({
      ...current,
      endpointReady: !current.endpointReady,
    }));
  const toggleFailure = () =>
    setState((current) => ({
      ...current,
      failAtMigration: !current.failAtMigration,
    }));

  const advance = () => {
    setState((current) => {
      if (current.stage === "catalog") {
        return {
          ...current,
          operationId: "mop_01J9Y6W2",
          stage: "needs_input",
        };
      }
      if (current.stage === "needs_input") {
        if (!(current.configReady && current.endpointReady)) {
          return current;
        }
        return { ...current, stage: "review" };
      }
      if (current.stage === "review") {
        return { ...current, approved: true, stage: "applying" };
      }
      if (current.stage === "applying") {
        const nextCursor = Math.min(current.cursor + 1, planSteps.length);
        if (nextCursor === 4 && current.failAtMigration) {
          return {
            ...current,
            cursor: nextCursor,
            receiptCount: current.receiptCount + 1,
            stage: "repair_required",
          };
        }
        if (nextCursor >= planSteps.length) {
          return {
            ...current,
            cursor: nextCursor,
            lockGeneration: 42,
            observedProvider: "verified",
            receiptCount: current.receiptCount + 1,
            serviceRevision: 8,
            stage: "restart_required",
          };
        }
        return {
          ...current,
          cursor: nextCursor,
          observedProvider:
            nextCursor >= 6 ? "verified" : current.observedProvider,
          receiptCount: current.receiptCount + 1,
        };
      }
      if (current.stage === "repair_required") {
        return {
          ...current,
          failAtMigration: false,
          receiptCount: current.receiptCount + 1,
          stage: "applying",
        };
      }
      if (current.stage === "restart_required") {
        return {
          ...current,
          receiptCount: current.receiptCount + 1,
          stage: "active",
        };
      }
      if (current.stage === "active") {
        return { ...current, approved: false, stage: "uninstall_review" };
      }
      if (current.stage === "uninstall_review") {
        return {
          ...current,
          approved: true,
          receiptCount: current.receiptCount + 1,
          stage: "inactive",
        };
      }
      return current;
    });
  };

  return {
    primary: primaryAction(state, state.stage === "inactive" ? reset : advance),
    reset,
    toggleConfig,
    toggleEndpoint,
    toggleFailure,
  };
}

function primaryAction(state: LifecycleState, onClick: () => void) {
  if (state.stage === "catalog") {
    return {
      icon: <Sparkles size={13} />,
      label: "Create install plan",
      onClick,
    };
  }
  if (state.stage === "needs_input") {
    return {
      icon: <ChevronRight size={13} />,
      label:
        state.configReady && state.endpointReady
          ? "Continue to review"
          : "Resolve required inputs",
      onClick,
    };
  }
  if (state.stage === "review") {
    return {
      icon: <ShieldCheck size={13} />,
      label: "Approve & apply",
      onClick,
    };
  }
  if (state.stage === "applying") {
    return { icon: <Play size={13} />, label: "Advance operation", onClick };
  }
  if (state.stage === "repair_required") {
    return { icon: <Wrench size={13} />, label: "Apply repair plan", onClick };
  }
  if (state.stage === "restart_required") {
    return {
      icon: <RefreshCw size={13} />,
      label: "Prove runtime adoption",
      onClick,
    };
  }
  if (state.stage === "active") {
    return { icon: <Trash2 size={13} />, label: "Plan uninstall", onClick };
  }
  if (state.stage === "uninstall_review") {
    return {
      icon: <ShieldCheck size={13} />,
      label: "Approve uninstall",
      onClick,
    };
  }
  return { icon: <RotateCcw size={13} />, label: "Reset walkthrough", onClick };
}

function PrototypeHeader({
  eyebrow,
  summary,
}: {
  eyebrow: string;
  summary: string;
}) {
  return (
    <header className="flex min-h-14 flex-wrap items-center gap-3 border-b border-(--border-subtle) bg-(--surface) px-4 py-2">
      <div className="flex items-center gap-2">
        <Boxes className="text-(--accent)" size={16} />
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-sm font-semibold">Modules</h1>
            <ToneBadge tone="warning">PROTOTYPE</ToneBadge>
          </div>
          <p className="text-[10px] uppercase tracking-[0.12em] text-(--fg-tertiary)">
            {eyebrow}
          </p>
        </div>
      </div>
      <p className="ml-auto text-xs text-(--fg-secondary)">{summary}</p>
    </header>
  );
}

function PrototypeSwitcher({
  current,
  onChange,
  onReset,
}: {
  current: Variant;
  onChange: (variant: Variant) => void;
  onReset: () => void;
}) {
  const item = { key: current, label: variantLabels[current] };
  return (
    <div className="fixed bottom-5 left-1/2 z-50 flex -translate-x-1/2 items-center gap-1 rounded-full border border-white/25 bg-black px-2 py-1.5 text-white shadow-2xl">
      <button
        aria-label="Previous prototype variant"
        className="rounded-full p-2 hover:bg-white/15"
        onClick={() => cycleVariant(current, -1, onChange)}
        type="button"
      >
        <ArrowLeft size={15} />
      </button>
      <span className="min-w-44 px-2 text-center text-xs font-semibold">
        {item.key} — {item.label}
      </span>
      <button
        aria-label="Next prototype variant"
        className="rounded-full p-2 hover:bg-white/15"
        onClick={() => cycleVariant(current, 1, onChange)}
        type="button"
      >
        <ArrowRight size={15} />
      </button>
      <button
        className="ml-1 rounded-full border border-white/20 px-2 py-1 text-[10px] hover:bg-white/15"
        onClick={onReset}
        type="button"
      >
        reset
      </button>
    </div>
  );
}

function cycleVariant(
  current: Variant,
  direction: -1 | 1,
  onChange: (variant: Variant) => void
) {
  const currentIndex = variantKeys.indexOf(current);
  const nextIndex =
    (currentIndex + direction + variantKeys.length) % variantKeys.length;
  const next = variantKeys[nextIndex] ?? "A";
  const url = new URL(window.location.href);
  url.searchParams.set("prototype", "lifecycle");
  url.searchParams.set("variant", next);
  window.history.replaceState(null, "", url.pathname + url.search);
  onChange(next);
}

function initialVariant(): Variant {
  if (typeof window === "undefined") {
    return "A";
  }
  const value = new URLSearchParams(window.location.search).get("variant");
  return value === "B" || value === "C" ? value : "A";
}

function PlanStepRow({
  index,
  state,
  step,
}: {
  index: number;
  state: LifecycleState;
  step: PlanStep;
}) {
  const status = stepStatus(index, state);
  return (
    <div className="grid grid-cols-[28px_minmax(0,1fr)_auto] items-start gap-2 border-b border-(--border-subtle) px-3 py-3 last:border-b-0">
      <StepIcon status={status} />
      <div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-medium">{step.label}</span>
          <span className="text-[10px] text-(--fg-tertiary)">{step.owner}</span>
          {step.risk ? <ToneBadge tone="warning">{step.risk}</ToneBadge> : null}
        </div>
        <p className="mt-1 text-[11px] text-(--fg-secondary)">{step.detail}</p>
      </div>
      <span className="text-[10px] uppercase text-(--fg-tertiary)">
        {status}
      </span>
    </div>
  );
}

function CompactStep({
  index,
  state,
  step,
}: {
  index: number;
  state: LifecycleState;
  step: PlanStep;
}) {
  const status = stepStatus(index, state);
  return (
    <div className="rounded-[var(--radius-control)] border border-(--border-subtle) p-3">
      <div className="flex items-center gap-2">
        <StepIcon status={status} />
        <span className="text-xs font-medium">{step.label}</span>
      </div>
      <p className="mt-2 text-[10px] text-(--fg-tertiary)">{step.owner}</p>
      <p className="mt-1 text-[11px] text-(--fg-secondary)">{step.detail}</p>
    </div>
  );
}

function StepIcon({ status }: { status: ReturnType<typeof stepStatus> }) {
  if (status === "complete") {
    return <CircleCheck className="text-(--success)" size={16} />;
  }
  if (status === "failed") {
    return <CircleAlert className="text-(--error)" size={16} />;
  }
  if (status === "running") {
    return <RefreshCw className="animate-spin text-(--info)" size={16} />;
  }
  return <Clock3 className="text-(--fg-quaternary)" size={16} />;
}

function stepStatus(index: number, state: LifecycleState) {
  if (state.stage === "repair_required" && index === 3) {
    return "failed" as const;
  }
  if (index < state.cursor) {
    return "complete" as const;
  }
  if (state.stage === "applying" && index === state.cursor) {
    return "running" as const;
  }
  return "pending" as const;
}

function GateCard({
  action,
  complete,
  detail,
  icon,
  label,
}: {
  action?: () => void;
  complete: boolean;
  detail: string;
  icon: ReactNode;
  label: string;
}) {
  return (
    <div className="rounded-[var(--radius-panel)] border border-(--border-subtle) p-3">
      <div className="flex items-center gap-2">
        {icon}
        <span className="text-xs font-medium">{label}</span>
        {complete ? (
          <Check className="ml-auto text-(--success)" size={14} />
        ) : (
          <TriangleAlert className="ml-auto text-(--warning)" size={14} />
        )}
      </div>
      <p className="mt-2 text-[10px] leading-relaxed text-(--fg-tertiary)">
        {detail}
      </p>
      {action ? (
        <Button className="mt-3 w-full" onClick={action} variant="ghost">
          {complete ? "Mark missing" : "Resolve in prototype"}
        </Button>
      ) : null}
    </div>
  );
}

function GateToggle({
  active,
  label,
  onClick,
}: {
  active: boolean;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      className={cn(
        "flex min-h-9 items-center justify-center gap-2 rounded-[var(--radius-control)] border px-3 text-xs",
        active
          ? "border-[var(--tone-success-border)] bg-[var(--tone-success-bg)] text-[var(--tone-success-fg)]"
          : "border-(--border-subtle) bg-(--background) text-(--fg-secondary)"
      )}
      onClick={onClick}
      type="button"
    >
      {active ? <CircleCheck size={13} /> : <CircleAlert size={13} />}
      {label}
    </button>
  );
}

function DiffList() {
  const changes = [
    ["Module graph", "+ support-ticket@2.0.0, auth 1.3.2 → 1.4.0"],
    ["Service", "+ support-suite@4.2.0 (provider)"],
    ["Database", "+ 1 additive Host migration"],
    ["Workspace", "generated Linked composition + Cargo.lock"],
    ["Console", "+ @acme/support-ticket-console@2.0.0"],
    ["Restart", "API + worker must prove lock generation 42"],
  ];
  return (
    <dl className="mt-3 space-y-2 text-[11px]">
      {changes.map(([label, value]) => (
        <div className="border-b border-(--border-subtle) pb-2" key={label}>
          <dt className="text-(--fg-tertiary)">{label}</dt>
          <dd className="mt-0.5 text-(--fg-secondary)">{value}</dd>
        </div>
      ))}
    </dl>
  );
}

function StateInspector({
  standalone = false,
  state,
}: {
  standalone?: boolean;
  state: LifecycleState;
}) {
  return (
    <section
      className={cn(
        "mt-5 rounded-[var(--radius-panel)] border border-(--border-subtle) bg-(--background) p-3",
        standalone && "mt-0"
      )}
    >
      <div className="flex items-center gap-2">
        <Database size={13} />
        <SectionLabel>Full prototype state</SectionLabel>
      </div>
      <pre className="mt-3 overflow-auto whitespace-pre-wrap font-mono text-[10px] leading-relaxed text-(--fg-secondary)">
        {JSON.stringify(state, null, 2)}
      </pre>
    </section>
  );
}

function Metric({
  label,
  tone = "muted",
  value,
}: {
  label: string;
  tone?: Tone;
  value: string;
}) {
  return (
    <div className="border-r border-(--border-subtle) px-4 py-3 last:border-r-0">
      <p className="text-[10px] uppercase tracking-wide text-(--fg-tertiary)">
        {label}
      </p>
      <p className={cn("mt-1 text-xl font-semibold", toneTextClass(tone))}>
        {value}
      </p>
    </div>
  );
}

function FleetRow({
  delivery,
  desired,
  module,
  observed,
  selected = false,
  tone,
}: {
  delivery: string;
  desired: string;
  module: string;
  observed: string;
  selected?: boolean;
  tone: Tone;
}) {
  return (
    <div
      className={cn(
        "grid grid-cols-[minmax(190px,1.3fr)_150px_120px_140px_130px] items-center border-b border-(--border-subtle) px-4 py-3 text-xs",
        selected && "bg-(--bg-row-hover)"
      )}
    >
      <span className="font-medium">{module}</span>
      <span className="text-(--fg-secondary)">{delivery}</span>
      <span className="text-(--fg-secondary)">{desired}</span>
      <ToneBadge tone={tone}>{observed}</ToneBadge>
      <span className="text-[11px] text-(--fg-tertiary)">
        {selected ? "open operation" : "inspect"}
      </span>
    </div>
  );
}

function CanvasNode({
  detail,
  icon,
  label,
  meta,
  tone,
}: {
  detail: string;
  icon: ReactNode;
  label: string;
  meta: string;
  tone: Tone;
}) {
  return (
    <article className="rounded-[var(--radius-panel)] border border-(--line-strong) bg-(--background) p-4 shadow-(--elevation-raised)">
      <div className="flex items-center gap-3">
        <span className={toneTextClass(tone)}>{icon}</span>
        <div>
          <h2 className="text-sm font-semibold">{label}</h2>
          <p className="text-[10px] uppercase tracking-wide text-(--fg-tertiary)">
            {meta}
          </p>
        </div>
      </div>
      <p className="mt-4 text-xs text-(--fg-secondary)">{detail}</p>
    </article>
  );
}

function CanvasArrow({
  label,
  reverse = false,
}: {
  label: string;
  reverse?: boolean;
}) {
  return (
    <div className="flex items-center justify-center gap-1 text-[10px] text-(--fg-tertiary) lg:flex-col">
      {reverse ? <ArrowLeft size={14} /> : <ArrowRight size={14} />}
      <span className="text-center">{label}</span>
    </div>
  );
}

function CanvasPhase({
  detail,
  label,
  state,
}: {
  detail: string;
  label: string;
  state: "complete" | "current" | "pending";
}) {
  return (
    <div className="bg-(--background) p-4">
      <div className="flex items-center gap-2">
        {state === "complete" ? (
          <CircleCheck className="text-(--success)" size={14} />
        ) : null}
        {state === "current" ? (
          <RefreshCw className="text-(--info)" size={14} />
        ) : null}
        {state === "pending" ? (
          <Clock3 className="text-(--fg-quaternary)" size={14} />
        ) : null}
        <span className="text-xs font-medium">{label}</span>
      </div>
      <p className="mt-2 text-[10px] text-(--fg-tertiary)">{detail}</p>
    </div>
  );
}

type Tone = "error" | "info" | "muted" | "success" | "warning";

function ToneBadge({ children, tone }: { children: ReactNode; tone: Tone }) {
  return (
    <span
      className={cn(
        "inline-flex w-fit items-center rounded-[var(--radius-pill)] border px-2 py-0.5 text-[10px] font-medium",
        tone === "success" &&
          "border-[var(--tone-success-border)] bg-[var(--tone-success-bg)] text-[var(--tone-success-fg)]",
        tone === "warning" &&
          "border-[var(--tone-warning-border)] bg-[var(--tone-warning-bg)] text-[var(--tone-warning-fg)]",
        tone === "error" &&
          "border-[var(--tone-error-border)] bg-[var(--tone-error-bg)] text-[var(--tone-error-fg)]",
        tone === "info" &&
          "border-[var(--tone-info-border)] bg-[var(--tone-info-bg)] text-[var(--tone-info-fg)]",
        tone === "muted" &&
          "border-[var(--tone-muted-border)] bg-[var(--tone-muted-bg)] text-[var(--tone-muted-fg)]"
      )}
    >
      {children}
    </span>
  );
}

function SectionLabel({ children }: { children: ReactNode }) {
  return (
    <span className="text-[10px] font-semibold uppercase tracking-[0.12em] text-(--fg-tertiary)">
      {children}
    </span>
  );
}

function stageTone(stage: LifecycleStage): Tone {
  if (stage === "active") {
    return "success";
  }
  if (stage === "repair_required" || stage === "inactive") {
    return "error";
  }
  if (
    stage === "needs_input" ||
    stage === "restart_required" ||
    stage === "uninstall_review"
  ) {
    return "warning";
  }
  if (stage === "applying" || stage === "review") {
    return "info";
  }
  return "muted";
}

function stageLabel(stage: LifecycleStage): string {
  return stage.replaceAll("_", " ");
}

function toneTextClass(tone: Tone): string {
  if (tone === "success") {
    return "text-(--success)";
  }
  if (tone === "warning") {
    return "text-(--warning)";
  }
  if (tone === "error") {
    return "text-(--error)";
  }
  if (tone === "info") {
    return "text-(--info)";
  }
  return "text-(--fg-secondary)";
}
