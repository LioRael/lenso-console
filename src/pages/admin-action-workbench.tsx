import { useMutation, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, ExternalLink, Play } from "lucide-react";
import { useState } from "react";

import { Button } from "../components/ui/button";
import { cn } from "../lib/cn";
import { httpClient } from "../lib/http-client";
import { adminActionsPath } from "./admin-actions-model";
import {
  type AdminActionInputField,
  type AdminActionInputValue,
  type AdminActionInputValues,
  type DeclarativeAction,
  adminActionDangerLevel,
  adminActionInitialInputValues,
  adminActionRequiredConfirmationPhrase,
  adminActionResultSummary,
  buildAdminActionInput,
} from "./data-render-model";

type ActionResponse = {
  data: unknown;
  invocation?: {
    correlation_id: string;
    request_id: string;
    story_node_id: string;
  };
};

type ActionInputState = Record<string, AdminActionInputValues>;

type ActionVariables = {
  capability: string;
  confirmationPhrase?: string;
  input: Record<string, unknown>;
  label: string;
  name: string;
};

type ActionActivityItem = {
  id: string;
  capability: string;
  kind: "error" | "success";
  label: string;
  message: string;
  occurredAt: string;
  operationsPath?: string;
};

type AdminActionWorkbenchProps = {
  actions: DeclarativeAction[];
  className?: string;
  moduleName: string;
  onActionSettled?: () => Promise<void> | void;
};

export function AdminActionWorkbench({
  actions,
  className,
  moduleName,
  onActionSettled,
}: AdminActionWorkbenchProps) {
  const queryClient = useQueryClient();
  const [actionStatus, setActionStatus] = useState<{
    kind: "error" | "success";
    message: string;
  } | null>(null);
  const [actionActivity, setActionActivity] = useState<ActionActivityItem[]>(
    []
  );
  const [actionInputs, setActionInputs] = useState<ActionInputState>({});
  const [confirmationPhrases, setConfirmationPhrases] = useState<
    Record<string, string>
  >({});
  const recordActionActivity = (item: Omit<ActionActivityItem, "id">) => {
    const id = `${item.occurredAt}:${item.label}:${item.kind}`;
    setActionActivity((current) => [{ ...item, id }, ...current].slice(0, 5));
  };
  const actionMutation = useMutation({
    mutationFn: (action: ActionVariables) =>
      invokeAdminAction(
        moduleName,
        action.name,
        action.input,
        action.confirmationPhrase
      ),
    onError: (error, action) => {
      const message = error instanceof Error ? error.message : String(error);
      setActionStatus({
        kind: "error",
        message: `${action.label}: ${message}`,
      });
      recordActionActivity({
        capability: action.capability,
        kind: "error",
        label: action.label,
        message,
        occurredAt: new Date().toISOString(),
      });
    },
    onSuccess: async (response, action) => {
      const message = adminActionResultSummary(response.data);
      setActionStatus({
        kind: "success",
        message: `${action.label}: ${message}`,
      });
      recordActionActivity({
        capability: action.capability,
        kind: "success",
        label: action.label,
        message,
        occurredAt: new Date().toISOString(),
        ...(response.invocation
          ? {
              operationsPath: adminActionsPath({
                correlationId: response.invocation.correlation_id,
                selectedId: response.invocation.story_node_id,
              }),
            }
          : {}),
      });
      await queryClient.invalidateQueries({
        queryKey: ["admin-data", "list", moduleName],
      });
      await queryClient.invalidateQueries({
        queryKey: ["admin-data", "detail", moduleName],
      });
    },
    onSettled: async () => {
      await queryClient.invalidateQueries({
        queryKey: ["runtime", "admin-actions"],
      });
      await onActionSettled?.();
    },
  });

  if (actions.length === 0) {
    return null;
  }

  return (
    <div
      className={cn(
        "grid gap-1.5 border border-(--border-subtle) bg-(--background) p-2",
        className
      )}
    >
      <div className="grid gap-2">
        {actions.map((action) => {
          const isPending =
            actionMutation.isPending &&
            actionMutation.variables?.name === action.name;
          const input =
            actionInputs[action.name] ?? adminActionInitialInputValues(action);
          const confirmationPhrase = confirmationPhrases[action.name] ?? "";
          const readiness = adminActionReadiness(
            action,
            input,
            confirmationPhrase
          );
          return (
            <AdminActionPanel
              action={action}
              confirmationPhrase={confirmationPhrase}
              disabled={actionMutation.isPending || !readiness.ready}
              input={input}
              isPending={isPending}
              key={action.name}
              onChangeConfirmation={(value) => {
                setConfirmationPhrases((current) => ({
                  ...current,
                  [action.name]: value,
                }));
              }}
              onChangeInput={(fieldName, value) => {
                setActionInputs((current) => ({
                  ...current,
                  [action.name]: {
                    ...current[action.name],
                    [fieldName]: value,
                  },
                }));
              }}
              onRun={() => {
                const inputResult = buildAdminActionInput(action, input);
                if (inputResult.error) {
                  setActionStatus({
                    kind: "error",
                    message: `${action.label}: ${inputResult.error}`,
                  });
                  return;
                }
                setActionStatus(null);
                actionMutation.mutate({
                  capability: action.capability,
                  confirmationPhrase,
                  input: inputResult.input,
                  label: action.label,
                  name: action.name,
                });
              }}
              {...(readiness.reason
                ? { readinessReason: readiness.reason }
                : {})}
            />
          );
        })}
      </div>
      {actionStatus ? (
        <p
          className={cn(
            "truncate text-[11px]",
            actionStatus.kind === "error"
              ? "text-(--error)"
              : "text-(--success)"
          )}
        >
          {actionStatus.message}
        </p>
      ) : null}
      {actionActivity.length > 0 ? (
        <div className="grid gap-1 border-t border-(--border-subtle) pt-1.5">
          {actionActivity.map((item) => (
            <div
              className="grid min-w-0 grid-cols-[72px_minmax(0,140px)_minmax(0,1fr)_42px] gap-2 text-[11px]"
              key={item.id}
              title={`${item.capability} / ${item.occurredAt}`}
            >
              <span
                className={cn(
                  "truncate",
                  item.kind === "error" ? "text-(--error)" : "text-(--success)"
                )}
              >
                {item.kind}
              </span>
              <span className="truncate text-(--foreground)">{item.label}</span>
              <span className="truncate text-(--muted)">{item.message}</span>
              {item.operationsPath ? (
                <a
                  className="inline-flex h-5 items-center justify-center gap-1 border border-(--border-subtle) bg-(--elevated) px-1 text-[10px] text-(--muted) hover:text-(--foreground)"
                  href={item.operationsPath}
                >
                  <ExternalLink size={10} />
                  Open
                </a>
              ) : (
                <span />
              )}
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function invokeAdminAction(
  moduleName: string,
  actionName: string,
  input: Record<string, unknown>,
  confirmationPhrase?: string
) {
  return httpClient
    .post(
      `admin/data/${encodeURIComponent(moduleName)}/actions/${encodeURIComponent(actionName)}`,
      {
        json: {
          input,
          ...(confirmationPhrase
            ? { confirmation_phrase: confirmationPhrase }
            : {}),
        },
      }
    )
    .json<ActionResponse>();
}

function AdminActionPanel({
  action,
  confirmationPhrase,
  disabled,
  input,
  isPending,
  onChangeConfirmation,
  onChangeInput,
  onRun,
  readinessReason,
}: {
  action: DeclarativeAction;
  confirmationPhrase: string;
  disabled: boolean;
  input: AdminActionInputValues;
  isPending: boolean;
  onChangeConfirmation: (value: string) => void;
  onChangeInput: (fieldName: string, value: AdminActionInputValue) => void;
  onRun: () => void;
  readinessReason?: string;
}) {
  const fields = action.input_schema?.fields ?? [];
  const dangerLevel = adminActionDangerLevel(action);
  const isDangerous = dangerLevel !== "low";
  const requiredPhrase = adminActionRequiredConfirmationPhrase(action);
  return (
    <div className="grid gap-2 border border-(--border-subtle) bg-(--surface) p-2">
      <div className="flex min-w-0 items-start gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 items-center gap-2">
            <span className="truncate font-semibold text-(--foreground)">
              {action.label}
            </span>
            <span
              className={cn(
                "shrink-0 border px-1.5 py-0.5 text-[10px] uppercase",
                dangerLevel === "high"
                  ? "border-[color-mix(in_srgb,var(--error)_50%,transparent)] text-(--error)"
                  : dangerLevel === "medium"
                    ? "border-[#f59e0b]/40 text-[#d97706]"
                    : "border-(--border-subtle) text-(--muted)"
              )}
            >
              {dangerLevel}
            </span>
          </div>
          <div className="mt-1 truncate text-[10px] text-(--muted)">
            {action.name} / {action.capability}
          </div>
        </div>
        <Button
          className="min-h-7 px-2 text-[11px]"
          disabled={disabled}
          onClick={onRun}
          title={readinessReason ?? action.capability}
          type="button"
          variant={isDangerous ? "danger" : "ghost"}
        >
          <Play className={cn(isPending && "animate-pulse")} size={12} />
          {isPending ? "Running" : "Run"}
        </Button>
      </div>

      {fields.length > 0 ? (
        <div className="grid gap-1.5 md:grid-cols-2">
          {fields.map((field) => (
            <AdminActionFieldControl
              field={field}
              key={field.name}
              onChange={(value) => onChangeInput(field.name, value)}
              value={input[field.name]}
            />
          ))}
        </div>
      ) : null}

      {action.confirmation ? (
        <div
          className={cn(
            "grid gap-1 border px-2 py-1.5",
            isDangerous
              ? "border-[color-mix(in_srgb,var(--error)_35%,transparent)] bg-[color-mix(in_srgb,var(--error)_7%,var(--background))]"
              : "border-(--border-subtle) bg-(--background)"
          )}
        >
          <div className="flex min-w-0 items-start gap-1.5 text-[11px] text-(--secondary)">
            <AlertTriangle
              className={cn(isDangerous ? "text-(--error)" : "text-(--muted)")}
              size={13}
            />
            <span className="min-w-0">{action.confirmation.message}</span>
          </div>
          {requiredPhrase ? (
            <input
              aria-label={`${action.label} confirmation phrase`}
              className="h-7 border border-(--border-subtle) bg-(--elevated) px-2 font-mono text-[11px] text-(--foreground) outline-hidden placeholder:text-(--muted)"
              onChange={(event) => onChangeConfirmation(event.target.value)}
              placeholder={`type ${requiredPhrase}`}
              value={confirmationPhrase}
            />
          ) : null}
        </div>
      ) : null}

      {readinessReason ? (
        <div className="text-[10px] text-(--muted)">{readinessReason}</div>
      ) : null}
    </div>
  );
}

function AdminActionFieldControl({
  field,
  onChange,
  value,
}: {
  field: AdminActionInputField;
  onChange: (value: AdminActionInputValue) => void;
  value: AdminActionInputValue | undefined;
}) {
  const label = (
    <span className="flex min-w-0 items-center gap-1 text-[10px] text-(--muted)">
      <span className="truncate">{field.label}</span>
      {field.required ? <span className="text-(--error)">*</span> : null}
    </span>
  );

  if (field.field_type.kind === "boolean") {
    return (
      <label className="flex min-w-0 items-center gap-2 border border-(--border-subtle) bg-(--background) px-2 py-1.5">
        <input
          aria-label={field.label}
          checked={value === true}
          onChange={(event) => onChange(event.target.checked)}
          type="checkbox"
        />
        <span className="grid min-w-0">
          {label}
          {field.description ? (
            <span className="truncate text-[10px] text-(--muted-deep)">
              {field.description}
            </span>
          ) : null}
        </span>
      </label>
    );
  }

  if (field.field_type.kind === "json") {
    return (
      <label className="grid min-w-0 gap-1 md:col-span-2">
        {label}
        <textarea
          aria-label={field.label}
          className="h-20 resize-y border border-(--border-subtle) bg-(--elevated) px-2 py-1 font-mono text-[11px] text-(--foreground) outline-hidden placeholder:text-(--muted)"
          onChange={(event) => onChange(event.target.value)}
          placeholder={field.description ?? field.name}
          spellCheck={false}
          value={typeof value === "string" ? value : ""}
        />
      </label>
    );
  }

  return (
    <label className="grid min-w-0 gap-1">
      {label}
      <input
        aria-label={field.label}
        className="h-7 border border-(--border-subtle) bg-(--elevated) px-2 font-mono text-[11px] text-(--foreground) outline-hidden placeholder:text-(--muted)"
        onChange={(event) => onChange(event.target.value)}
        placeholder={field.description ?? field.name}
        type={field.field_type.kind === "integer" ? "number" : "text"}
        value={typeof value === "string" ? value : ""}
      />
    </label>
  );
}

function adminActionReadiness(
  action: DeclarativeAction,
  input: AdminActionInputValues,
  confirmationPhrase: string
): { ready: boolean; reason?: string } {
  const inputResult = buildAdminActionInput(action, input);
  if (inputResult.error) {
    return { ready: false, reason: inputResult.error };
  }

  const requiredPhrase = adminActionRequiredConfirmationPhrase(action);
  if (requiredPhrase && confirmationPhrase !== requiredPhrase) {
    return {
      ready: false,
      reason: `type ${requiredPhrase} to confirm`,
    };
  }

  return { ready: true };
}
