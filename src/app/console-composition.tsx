import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, RefreshCw } from "lucide-react";
import type { PropsWithChildren } from "react";

import { Button } from "../../packages/console-package-api/src/index";
import { httpClient, isApiMode } from "../lib/http-client";

export const consoleCompositionSchema =
  "lenso.console-service-composition.v2" as const;
export const consoleCompositionQueryKey = ["console", "composition"] as const;

export type MandatoryConsoleRole = "identity" | "system_registry";
export type ConsoleCompositionStatus = "ready" | "recovery_required";
export type ConsoleModuleKind = "shell" | "mandatory" | "optional";
export type ConsoleWorkloadMode = "normal" | "restore";

export interface ConsoleCompositionModule {
  moduleId: string;
  kind: ConsoleModuleKind;
  role?: MandatoryConsoleRole;
}

export interface ConsoleCompositionIssue {
  code: string;
  message: string;
  nextAction: string;
  role?: MandatoryConsoleRole;
  moduleIds: string[];
}

export interface ConsoleServiceComposition {
  schema: string;
  serviceId: string;
  status: ConsoleCompositionStatus;
  workloadMode: ConsoleWorkloadMode;
  modules: ConsoleCompositionModule[];
  issues: ConsoleCompositionIssue[];
}

const mandatoryRoles = ["identity", "system_registry"] as const;
const compositionStatuses = ["ready", "recovery_required"] as const;
const moduleKinds = ["shell", "mandatory", "optional"] as const;
const workloadModes = ["normal", "restore"] as const;

export function decodeConsoleServiceComposition(
  value: unknown
): ConsoleServiceComposition {
  const record = requireRecord(value, "composition");
  return {
    issues: requireArray(record.issues, "composition.issues").map(
      (issue, index) => decodeIssue(issue, index)
    ),
    modules: requireArray(record.modules, "composition.modules").map(
      (module, index) => decodeModule(module, index)
    ),
    schema: requireString(record.schema, "composition.schema"),
    serviceId: requireString(record.serviceId, "composition.serviceId"),
    status: requireEnum(
      record.status,
      compositionStatuses,
      "composition.status"
    ),
    workloadMode: requireEnum(
      record.workloadMode,
      workloadModes,
      "composition.workloadMode"
    ),
  };
}

function decodeModule(value: unknown, index: number): ConsoleCompositionModule {
  const path = `composition.modules[${index}]`;
  const record = requireRecord(value, path);
  const role =
    record.role === undefined
      ? undefined
      : requireEnum(record.role, mandatoryRoles, `${path}.role`);
  return {
    kind: requireEnum(record.kind, moduleKinds, `${path}.kind`),
    moduleId: requireString(record.moduleId, `${path}.moduleId`),
    ...(role ? { role } : {}),
  };
}

function decodeIssue(value: unknown, index: number): ConsoleCompositionIssue {
  const path = `composition.issues[${index}]`;
  const record = requireRecord(value, path);
  const role =
    record.role === undefined
      ? undefined
      : requireEnum(record.role, mandatoryRoles, `${path}.role`);
  return {
    code: requireString(record.code, `${path}.code`),
    message: requireString(record.message, `${path}.message`),
    moduleIds: requireArray(record.moduleIds, `${path}.moduleIds`).map(
      (moduleId, moduleIndex) =>
        requireString(moduleId, `${path}.moduleIds[${moduleIndex}]`)
    ),
    nextAction: requireString(record.nextAction, `${path}.nextAction`),
    ...(role ? { role } : {}),
  };
}

function requireRecord(value: unknown, path: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new TypeError(`${path} must be an object`);
  }
  return value as Record<string, unknown>;
}

function requireArray(value: unknown, path: string): unknown[] {
  if (!Array.isArray(value)) {
    throw new TypeError(`${path} must be an array`);
  }
  return value;
}

function requireString(value: unknown, path: string): string {
  if (typeof value !== "string" || value.length === 0) {
    throw new TypeError(`${path} must be a non-empty string`);
  }
  return value;
}

function requireEnum<const T extends readonly string[]>(
  value: unknown,
  allowed: T,
  path: string
): T[number] {
  if (typeof value !== "string" || !allowed.includes(value)) {
    throw new TypeError(`${path} is not supported`);
  }
  return value;
}

export function compositionRecoveryIssues(
  composition: ConsoleServiceComposition
): ConsoleCompositionIssue[] {
  const issues = [...composition.issues];

  if (composition.workloadMode === "restore") {
    issues.push({
      code: "restore_workload_active",
      message:
        "The Console Service is running the fenced restore workload without background processing.",
      moduleIds: [],
      nextAction:
        "Run `lenso console recovery reconcile`, review its evidence, and use the separately approved activation command before resuming management.",
    });
  }

  if (composition.schema !== consoleCompositionSchema) {
    issues.push({
      code: "composition_schema_incompatible",
      message: `Unsupported Console composition schema: ${composition.schema}`,
      moduleIds: [],
      nextAction:
        "Apply a Console Service Release compatible with this Console Shell.",
      role: "identity",
    });
  }

  if (composition.serviceId !== "lenso-console") {
    issues.push({
      code: "composition_service_identity_mismatch",
      message: `Unexpected Console Service identity: ${composition.serviceId}`,
      moduleIds: [],
      nextAction:
        "Restore the Console Service configuration bound to service identity lenso-console.",
      role: "identity",
    });
  }

  for (const role of mandatoryRoles) {
    const bindings = composition.modules.filter(
      (module) => module.kind === "mandatory" && module.role === role
    );
    if (bindings.length === 1) {
      continue;
    }
    issues.push({
      code:
        bindings.length === 0
          ? "mandatory_console_role_missing"
          : "mandatory_console_role_ambiguous",
      message:
        bindings.length === 0
          ? "Mandatory Console Role has no Module binding"
          : "Mandatory Console Role has more than one Module binding",
      moduleIds: bindings.map((binding) => binding.moduleId),
      nextAction:
        "Apply a reviewed Console Composition Change that binds exactly one compatible Module.",
      role,
    });
  }

  return deduplicateIssues(issues);
}

function deduplicateIssues(
  issues: ConsoleCompositionIssue[]
): ConsoleCompositionIssue[] {
  const seen = new Set<string>();
  return issues.filter((issue) => {
    const key = `${issue.code}:${issue.role ?? "workload"}:${issue.moduleIds.join(",")}`;
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

export function ConsoleCompositionGate({ children }: PropsWithChildren) {
  const apiMode = isApiMode();
  const query = useQuery({
    enabled: apiMode,
    queryKey: consoleCompositionQueryKey,
    queryFn: async () =>
      decodeConsoleServiceComposition(
        await httpClient.get("api/console/v1/composition").json<unknown>()
      ),
    retry: false,
  });

  if (!apiMode) {
    return children;
  }
  if (query.isPending) {
    return <CompositionStatus message="Inspecting Console composition…" />;
  }
  if (query.isError) {
    return (
      <ConsoleRecoveryMode
        issues={[
          {
            code: "composition_diagnostics_unavailable",
            message: query.error.message,
            moduleIds: [],
            nextAction:
              "Run Console installation diagnostics and restore access to the composition endpoint.",
            role: "identity",
          },
        ]}
        onRetry={() => void query.refetch()}
      />
    );
  }

  const issues = compositionRecoveryIssues(query.data);
  if (query.data.status !== "ready" || issues.length > 0) {
    return (
      <ConsoleRecoveryMode
        issues={issues}
        onRetry={() => void query.refetch()}
      />
    );
  }
  return children;
}

function CompositionStatus({ message }: { message: string }) {
  return (
    <main className="grid min-h-screen place-items-center bg-(--background) p-6 text-(--foreground)">
      <p className="text-sm text-(--muted)">{message}</p>
    </main>
  );
}

function ConsoleRecoveryMode({
  issues,
  onRetry,
}: {
  issues: ConsoleCompositionIssue[];
  onRetry: () => void;
}) {
  const restoreWorkloadActive = issues.some(
    (issue) => issue.code === "restore_workload_active"
  );
  return (
    <main className="grid min-h-screen place-items-center bg-(--background) p-6 text-(--foreground)">
      <section className="w-full max-w-3xl overflow-hidden rounded-[var(--radius-overlay)] border border-(--border) bg-(--surface)">
        <div className="flex items-start gap-3 border-b border-(--border) p-5">
          <AlertTriangle
            aria-hidden="true"
            className="mt-1 text-(--warning)"
            size={22}
          />
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-(--muted)">
              {restoreWorkloadActive
                ? "Console Recovery Authority"
                : "Console Bootstrap Diagnostics"}
            </p>
            <h1 className="mt-1 text-2xl font-semibold">
              {restoreWorkloadActive
                ? "Restore workload active"
                : "Recovery Mode"}
            </h1>
            <p className="mt-2 text-sm text-(--muted)">
              {restoreWorkloadActive
                ? "Management mutations and background processing remain disabled until reconciliation evidence is reviewed and activation transfers authority to the normal workload."
                : "Management capabilities are disabled until every mandatory Console role has exactly one compatible Module binding."}
            </p>
          </div>
        </div>

        <div>
          {issues.length === 0 ? (
            <RecoveryIssue
              issue={{
                code: "composition_not_ready",
                message:
                  "The Console Service reported a non-ready composition.",
                moduleIds: [],
                nextAction:
                  "Run Console installation diagnostics and apply a reviewed composition repair.",
                role: "identity",
              }}
            />
          ) : (
            issues.map((issue) => (
              <RecoveryIssue
                issue={issue}
                key={`${issue.code}:${issue.role}:${issue.moduleIds.join(",")}`}
              />
            ))
          )}
        </div>

        <div className="flex justify-end border-t border-(--border) p-3">
          <Button onClick={onRetry} type="button">
            <RefreshCw aria-hidden="true" size={15} />
            Retry diagnostics
          </Button>
        </div>
      </section>
    </main>
  );
}

function RecoveryIssue({ issue }: { issue: ConsoleCompositionIssue }) {
  return (
    <article className="border-b border-(--border-subtle) bg-(--background) px-5 py-4 last:border-b-0">
      <div className="flex flex-wrap items-center gap-2 text-xs text-(--muted)">
        <code>{issue.code}</code>
        <span aria-hidden="true">·</span>
        <span>{roleLabel(issue.role)}</span>
      </div>
      <p className="mt-2 text-sm font-medium">{issue.message}</p>
      {issue.moduleIds.length > 0 ? (
        <p className="mt-2 text-xs text-(--muted)">
          Modules: {issue.moduleIds.join(", ")}
        </p>
      ) : null}
      <p className="mt-3 text-sm text-(--muted)">{issue.nextAction}</p>
    </article>
  );
}

function roleLabel(role?: MandatoryConsoleRole) {
  if (!role) {
    return "Console workload";
  }
  return role === "system_registry" ? "System Registry role" : "Identity role";
}
