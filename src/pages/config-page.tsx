import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ChevronRight,
  History,
  Languages,
  RefreshCw,
  RotateCcw,
  Search,
} from "lucide-react";
import { useMemo, useState } from "react";

import {
  Badge,
  Button,
  Select,
  SettingsGroup,
  SettingsRow,
} from "../../packages/console-package-api/src/index";
import {
  consoleConfigQueryKeys,
  useConsoleConfigValues,
} from "../app/console-config-api";
import { Drawer } from "../components/ui/drawer";
import type {
  AdminServiceRestartResponse,
  ConfigAuditDto,
  ConfigAuditListResponse,
  ConfigDescriptorDto,
  ConfigDescriptorListResponse,
  ConfigGroupDto,
  ConfigValueDto,
  ConfigWriteResponse,
} from "../hooks/runtime-api-types";
import { usePersistedLayout } from "../hooks/use-persisted-layout";
import { time } from "../lib/format";
import {
  httpClient,
  isApiMode,
  runtimeConsoleDataSource,
} from "../lib/http-client";

export type ValueType =
  | { kind: "bool" }
  | { kind: "int"; min?: number; max?: number }
  | { kind: "float"; min?: number; max?: number }
  | { kind: "string" }
  | { kind: "enum"; values: string[] }
  | { kind: "json" };

export type ConfigRow = {
  descriptor: ConfigDescriptorDto;
  pendingRestart: boolean;
  valueType: ValueType;
  value: unknown;
  source: ConfigValueDto["source"];
};

const EMPTY_GROUPS: ConfigGroupDto[] = [];
type LanguagePreference = "system" | "en" | "zh-CN";

type ConfigGroup = {
  description: string;
  id: string;
  label: string;
  order: number;
  rows: ConfigRow[];
};

type ConfigSection = {
  label: string | null;
  rows: ConfigRow[];
};

const configQueryKeys = {
  descriptors: ["config", "descriptors"] as const,
  values: consoleConfigQueryKeys.values,
  audit: (service: string, key: string) =>
    ["config", "audit", service, key] as const,
};

function configPath(service: string, key: string) {
  return `admin/config/${encodeURIComponent(service)}/${encodeURIComponent(key)}`;
}

function parseValueType(raw: unknown): ValueType {
  if (raw && typeof raw === "object" && "kind" in raw) {
    const candidate = raw as { kind: unknown };
    switch (candidate.kind) {
      case "bool":
      case "string":
      case "json": {
        return { kind: candidate.kind };
      }
      case "int":
      case "float": {
        const numeric = raw as { min?: unknown; max?: unknown };
        return {
          kind: candidate.kind,
          ...(typeof numeric.min === "number" ? { min: numeric.min } : {}),
          ...(typeof numeric.max === "number" ? { max: numeric.max } : {}),
        };
      }
      case "enum": {
        const enumeral = raw as { values?: unknown };
        return {
          kind: "enum",
          values: Array.isArray(enumeral.values)
            ? enumeral.values.filter(
                (item): item is string => typeof item === "string"
              )
            : [],
        };
      }
      default: {
        return { kind: "json" };
      }
    }
  }
  return { kind: "json" };
}

function useConfigDescriptors() {
  return useQuery({
    enabled: isApiMode(),
    queryKey: configQueryKeys.descriptors,
    queryFn: () =>
      httpClient
        .get("admin/config/descriptors")
        .json<ConfigDescriptorListResponse>(),
  });
}

export function ConfigPage() {
  if (!isApiMode()) {
    return <DeferredConfig />;
  }
  return <ConfigContent />;
}

function ConfigContent() {
  const descriptorsQuery = useConfigDescriptors();
  const valuesQuery = useConsoleConfigValues();
  const [auditTarget, setAuditTarget] = useState<ConfigRow | null>(null);
  const [restartStatus, setRestartStatus] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");

  const rows = useMemo<ConfigRow[]>(() => {
    const descriptors = descriptorsQuery.data?.data ?? [];
    const values = valuesQuery.data?.data ?? [];
    const valueByKey = new Map(values.map((item) => [item.key, item]));
    return descriptors
      .map((descriptor) => {
        const match = valueByKey.get(descriptor.key);
        return {
          descriptor,
          pendingRestart: match?.pending_restart ?? false,
          valueType: parseValueType(descriptor.value_type),
          value: match ? match.desired_value : descriptor.default,
          source: match ? match.source : "default",
        };
      })
      .sort(
        (a, b) =>
          a.descriptor.service.localeCompare(b.descriptor.service) ||
          a.descriptor.key.localeCompare(b.descriptor.key)
      );
  }, [descriptorsQuery.data, valuesQuery.data]);

  const groups = descriptorsQuery.data?.groups ?? EMPTY_GROUPS;
  const conditionVisibleRows = useMemo(
    () => filterVisibleConfigRows(rows),
    [rows]
  );
  const visibleRows = useMemo(
    () => filterConfigRows(conditionVisibleRows, searchQuery, groups),
    [conditionVisibleRows, groups, searchQuery]
  );
  const grouped = useMemo(
    () => groupConfigRows(visibleRows, groups),
    [groups, visibleRows]
  );

  const isLoading = descriptorsQuery.isLoading || valuesQuery.isLoading;
  const error = descriptorsQuery.error ?? valuesQuery.error;
  const hasSearch = searchQuery.trim().length > 0;
  const hasPendingRestart = rows.some((row) => row.pendingRestart);
  const restartMutation = useMutation({
    mutationFn: () =>
      httpClient
        .post("admin/system/restart")
        .json<AdminServiceRestartResponse>(),
    onSuccess: (response) =>
      setRestartStatus(
        response.requires_supervisor
          ? "shutdown requested"
          : "restart scheduled"
      ),
    onError: (restartError: unknown) =>
      setRestartStatus(errorMessage(restartError)),
  });

  return (
    <section className="grid h-full min-h-0 grid-rows-[auto_auto_minmax(0,1fr)] overflow-hidden bg-(--background) text-(--foreground)">
      <header className="border-b border-(--border-subtle) bg-(--surface) px-3 py-2">
        <div className="flex items-center gap-2">
          <h1 className="text-sm font-semibold">Settings</h1>
          <div className="ml-auto flex items-center gap-2">
            {restartStatus ? (
              <span className="font-mono text-[10px] text-(--muted)">
                {restartStatus}
              </span>
            ) : null}
            <span className="font-mono text-[10px] text-(--muted)">
              {hasSearch ? `${visibleRows.length}/${rows.length}` : rows.length}{" "}
              keys / {runtimeConsoleDataSource()}
            </span>
            <Button
              className="min-h-6 px-2 text-[10px]"
              disabled={restartMutation.isPending}
              onClick={() => restartMutation.mutate()}
              title="Restart the API process"
              variant={hasPendingRestart ? "default" : "ghost"}
            >
              <RefreshCw size={11} />
              {restartMutation.isPending ? "Restarting" : "Restart API"}
            </Button>
          </div>
        </div>
      </header>
      <div className="border-b border-(--border-subtle) bg-(--surface) px-3 py-2">
        <label className="flex h-7 w-full items-center gap-2 text-(--muted)">
          <Search size={14} />
          <input
            aria-label="Search configuration"
            className="min-w-0 flex-1 bg-transparent font-mono text-[13px] text-(--foreground) outline-none placeholder:text-(--muted)"
            onChange={(event) => setSearchQuery(event.target.value)}
            placeholder="search key / description / group"
            type="search"
            value={searchQuery}
          />
        </label>
      </div>

      <div className="min-h-0 overflow-auto">
        <ConsolePreferences />
        {isLoading ? (
          <LoadingRows />
        ) : error ? (
          <MessageRow message={errorMessage(error)} tone="error" />
        ) : rows.length === 0 ? (
          <MessageRow message="no configuration descriptors registered" />
        ) : grouped.length === 0 ? (
          <MessageRow message="no configuration matches search" />
        ) : (
          grouped.map((group) => (
            <details className="group" key={group.id}>
              <summary className="sticky top-0 z-10 flex cursor-pointer list-none items-center gap-2 border-b border-(--border-subtle) bg-(--sidebar) px-3 py-1.5 font-mono [&::-webkit-details-marker]:hidden">
                <ChevronRight
                  className="shrink-0 text-(--muted) transition-transform group-open:rotate-90"
                  size={13}
                />
                <div className="min-w-0">
                  <div className="flex min-w-0 items-center gap-2">
                    <span className="truncate text-[11px] font-semibold text-(--foreground)">
                      {group.label}
                    </span>
                    <span className="text-[10px] text-(--muted)">
                      {group.rows.length} keys
                    </span>
                  </div>
                  {group.description ? (
                    <div className="mt-0.5 truncate text-[10px] text-(--muted)">
                      {group.description}
                    </div>
                  ) : null}
                </div>
              </summary>
              {sectionConfigRows(group.rows).map((section) => (
                <div key={section.label ?? "default"}>
                  {section.label ? (
                    <div className="border-b border-(--border-subtle) bg-(--surface) px-3 py-1 font-mono text-[10px] font-semibold uppercase tracking-[0.08em] text-(--muted)">
                      {section.label}
                    </div>
                  ) : null}
                  {section.rows.map((row) => (
                    <ConfigRowEditor
                      key={`${row.descriptor.service}:${row.descriptor.key}`}
                      onOpenAudit={() => setAuditTarget(row)}
                      row={row}
                    />
                  ))}
                </div>
              ))}
            </details>
          ))
        )}
      </div>

      <AuditDrawer onClose={() => setAuditTarget(null)} target={auditTarget} />
    </section>
  );
}

function ConsolePreferences() {
  const [language, setLanguage] = usePersistedLayout<LanguagePreference>(
    "runtime-console:language-preference",
    "system"
  );

  return (
    <SettingsGroup>
      <SettingsGroup.Header>
        <div className="flex items-center gap-2">
          <Languages className="text-(--fg-tertiary)" size={14} />
          <SettingsGroup.Title>Console preferences</SettingsGroup.Title>
        </div>
        <SettingsGroup.Description>
          Preferences are stored in this browser and apply to every Console
          surface, including module extensions.
        </SettingsGroup.Description>
      </SettingsGroup.Header>
      <SettingsRow
        description="Controls locale-sensitive formatting and the language exposed to module surfaces."
        label="Interface language"
      >
        <Select
          aria-label="Interface language"
          onChange={(event) => {
            const next = event.target.value as LanguagePreference;
            setLanguage(next);
            document.documentElement.lang =
              next === "system" ? window.navigator.language || "en" : next;
            document.documentElement.dataset.languagePreference = next;
          }}
          value={language}
        >
          <option value="system">System default</option>
          <option value="en">English</option>
          <option value="zh-CN">简体中文</option>
        </Select>
      </SettingsRow>
    </SettingsGroup>
  );
}

export function filterVisibleConfigRows(rows: ConfigRow[]) {
  const values = new Map<string, unknown>();
  for (const row of rows) {
    values.set(
      configValueKey(row.descriptor.service, row.descriptor.key),
      row.value
    );
    values.set(row.descriptor.key, row.value);
  }
  return rows.filter((row) => {
    const condition = row.descriptor.visible_when;
    if (!condition) {
      return true;
    }
    if (condition.kind === "equals") {
      const value =
        values.get(configValueKey(condition.service, condition.key)) ??
        values.get(condition.key);
      return jsonEqual(value, condition.value);
    }
    return true;
  });
}

export function filterConfigRows(
  rows: ConfigRow[],
  query: string,
  groups: ConfigGroupDto[]
) {
  const terms = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (terms.length === 0) {
    return rows;
  }
  const groupById = new Map(groups.map((group) => [group.id, group]));
  return rows.filter((row) => {
    const groupId = configGroupId(row.descriptor);
    const group = groupById.get(groupId);
    const text = [
      row.descriptor.key,
      row.descriptor.description,
      row.descriptor.service,
      groupId,
      group?.label ?? labelFromGroupId(groupId),
      group?.description ?? "",
    ]
      .join(" ")
      .toLowerCase();
    return terms.every((term) => text.includes(term));
  });
}

export function groupConfigRows(
  rows: ConfigRow[],
  groups: ConfigGroupDto[]
): ConfigGroup[] {
  const groupById = new Map(groups.map((group) => [group.id, group]));
  const map = new Map<string, ConfigRow[]>();
  for (const row of rows) {
    const groupId = configGroupId(row.descriptor);
    map.set(groupId, [...(map.get(groupId) ?? []), row]);
  }
  return [...map.entries()]
    .map(([groupId, groupRows]) => {
      const group = groupById.get(groupId);
      return {
        description: group?.description ?? "",
        id: groupId,
        label: group?.label ?? labelFromGroupId(groupId),
        order: group?.order ?? 999,
        rows: [...groupRows].sort(compareConfigRows),
      };
    })
    .sort(
      (a, b) =>
        a.order - b.order ||
        a.label.localeCompare(b.label) ||
        a.id.localeCompare(b.id)
    );
}

export function sectionConfigRows(rows: ConfigRow[]): ConfigSection[] {
  const map = new Map<string, ConfigSection>();
  for (const row of rows) {
    const label = row.descriptor.section?.trim() || null;
    const key = label ?? "";
    const section = map.get(key) ?? { label, rows: [] };
    section.rows.push(row);
    map.set(key, section);
  }
  return [...map.values()];
}

function configGroupId(descriptor: ConfigDescriptorDto) {
  return (
    descriptor.group ??
    (descriptor.service === "*" ? "shared" : descriptor.service)
  );
}

function configValueKey(service: string, key: string) {
  return `${service}:${key}`;
}

function jsonEqual(left: unknown, right: unknown) {
  return JSON.stringify(left) === JSON.stringify(right);
}

export function compareConfigRows(a: ConfigRow, b: ConfigRow) {
  return (
    (a.descriptor.order ?? 0) - (b.descriptor.order ?? 0) ||
    a.descriptor.key.localeCompare(b.descriptor.key)
  );
}

export function labelFromGroupId(groupId: string) {
  if (groupId === "shared") {
    return "Shared";
  }
  const lastSegment = groupId.split(".").at(-1) ?? groupId;
  return lastSegment
    .split(/[-_]/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

function ConfigRowEditor({
  onOpenAudit,
  row,
}: {
  onOpenAudit: () => void;
  row: ConfigRow;
}) {
  const queryClient = useQueryClient();
  const { descriptor, valueType } = row;
  const [draft, setDraft] = useState<string>(() =>
    toInputString(row.value, valueType)
  );
  const [localError, setLocalError] = useState<string | null>(null);

  const invalidateValues = () =>
    queryClient.invalidateQueries({ queryKey: configQueryKeys.values });

  const saveMutation = useMutation({
    mutationFn: (value: unknown) =>
      httpClient
        .put(configPath(descriptor.service, descriptor.key), {
          json: { value },
        })
        .json<ConfigWriteResponse>(),
    onSuccess: async () => {
      setLocalError(null);
      await invalidateValues();
    },
    onError: (mutationError: unknown) =>
      setLocalError(errorMessage(mutationError)),
  });

  const resetMutation = useMutation({
    mutationFn: () =>
      httpClient
        .delete(configPath(descriptor.service, descriptor.key))
        .json<ConfigWriteResponse>(),
    onSuccess: async () => {
      setLocalError(null);
      setDraft(toInputString(descriptor.default, valueType));
      await invalidateValues();
    },
    onError: (mutationError: unknown) =>
      setLocalError(errorMessage(mutationError)),
  });

  const submit = () => {
    const parsed = parseDraft(draft, valueType);
    if (!parsed.ok) {
      setLocalError(parsed.error);
      return;
    }
    saveMutation.mutate(parsed.value);
  };

  const pending = saveMutation.isPending || resetMutation.isPending;
  const disabled = !descriptor.editable;

  return (
    <div className="grid gap-1.5 border-b border-(--border-subtle) px-3 py-2 font-mono text-[11px]">
      <div className="flex items-center gap-2">
        <span className="truncate font-semibold text-(--foreground)">
          {descriptor.key}
        </span>
        <SourceBadge source={row.source} />
        {disabled ? <Tag tone="muted">read-only</Tag> : null}
        {descriptor.restart_only ? (
          <Tag tone="warn">applies on restart</Tag>
        ) : null}
        {row.pendingRestart ? <Tag tone="warn">pending restart</Tag> : null}
        <button
          aria-label="View audit history"
          className="ml-auto inline-flex h-6 items-center gap-1 border border-(--border-subtle) px-1.5 text-[10px] text-(--muted) hover:text-(--foreground)"
          onClick={onOpenAudit}
          type="button"
        >
          <History size={11} />
          audit
        </button>
      </div>

      {descriptor.description ? (
        <span className="text-[10px] text-(--muted)">
          {descriptor.description}
        </span>
      ) : null}

      <div className="flex flex-wrap items-center gap-2">
        <ValueControl
          disabled={disabled}
          label={descriptor.key}
          onChange={setDraft}
          onSubmit={submit}
          value={draft}
          valueType={valueType}
        />
        <Button
          disabled={disabled || pending}
          onClick={submit}
          variant="default"
        >
          Save
        </Button>
        <Button
          disabled={disabled || pending}
          onClick={() => resetMutation.mutate()}
          variant="ghost"
        >
          <RotateCcw size={12} />
          Reset
        </Button>
      </div>

      {localError ? (
        <span className="text-[10px] text-(--error)">{localError}</span>
      ) : null}
    </div>
  );
}

function ValueControl({
  disabled,
  label,
  onChange,
  onSubmit,
  value,
  valueType,
}: {
  disabled: boolean;
  label: string;
  onChange: (next: string) => void;
  onSubmit: () => void;
  value: string;
  valueType: ValueType;
}) {
  const inputClass =
    "h-6 min-w-[160px] border border-(--border-subtle) bg-(--elevated) px-2 text-[11px] text-(--foreground) outline-hidden focus-visible:border-(--accent) disabled:opacity-45";

  if (valueType.kind === "bool") {
    return (
      <label className="inline-flex h-6 items-center gap-1.5 text-[11px] text-(--secondary)">
        <input
          aria-label={label}
          checked={value === "true"}
          className="size-3.5 accent-(--accent) disabled:opacity-45"
          disabled={disabled}
          onChange={(event) =>
            onChange(event.target.checked ? "true" : "false")
          }
          type="checkbox"
        />
        {value === "true" ? "true" : "false"}
      </label>
    );
  }

  if (valueType.kind === "enum") {
    return (
      <select
        aria-label={label}
        className={inputClass}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
        value={value}
      >
        {valueType.values.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
    );
  }

  if (valueType.kind === "int" || valueType.kind === "float") {
    return (
      <input
        aria-label={label}
        className={inputClass}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            onSubmit();
          }
        }}
        step={valueType.kind === "float" ? "any" : "1"}
        type="number"
        value={value}
        {...(valueType.min === undefined ? {} : { min: valueType.min })}
        {...(valueType.max === undefined ? {} : { max: valueType.max })}
      />
    );
  }

  if (valueType.kind === "json") {
    return (
      <textarea
        aria-label={label}
        className={`${inputClass} h-16 w-full resize-y py-1 font-mono`}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
        spellCheck={false}
        value={value}
      />
    );
  }

  return (
    <input
      aria-label={label}
      className={inputClass}
      disabled={disabled}
      onChange={(event) => onChange(event.target.value)}
      onKeyDown={(event) => {
        if (event.key === "Enter") {
          onSubmit();
        }
      }}
      type="text"
      value={value}
    />
  );
}

function AuditDrawer({
  onClose,
  target,
}: {
  onClose: () => void;
  target: ConfigRow | null;
}) {
  const service = target?.descriptor.service ?? "";
  const key = target?.descriptor.key ?? "";
  const auditQuery = useQuery({
    enabled: Boolean(target),
    queryKey: configQueryKeys.audit(service, key),
    queryFn: () =>
      httpClient
        .get(`${configPath(service, key)}/audit`)
        .json<ConfigAuditListResponse>(),
  });
  const entries = auditQuery.data?.data ?? [];

  return (
    <Drawer
      onOpenChange={(open) => (open ? null : onClose())}
      open={Boolean(target)}
    >
      <Drawer.Content>
        <header className="border-b border-(--border-subtle) bg-(--surface) px-3 py-2 font-mono">
          <Drawer.Title className="text-[13px] font-semibold text-(--foreground)">
            Audit
          </Drawer.Title>
          {target ? (
            <div className="mt-1 truncate text-[10px] text-(--muted)">
              {target.descriptor.service === "*"
                ? "shared"
                : target.descriptor.service}{" "}
              / {target.descriptor.key}
            </div>
          ) : null}
        </header>
        <div className="p-3 font-mono text-[11px]">
          {auditQuery.isLoading ? (
            <MessageRow message="loading audit history" />
          ) : auditQuery.isError ? (
            <MessageRow message={errorMessage(auditQuery.error)} tone="error" />
          ) : entries.length === 0 ? (
            <MessageRow message="no audit entries" />
          ) : (
            <ol className="grid gap-2">
              {entries.map((entry, index) => (
                <AuditEntry
                  entry={entry}
                  key={`${entry.changed_at}:${index}`}
                />
              ))}
            </ol>
          )}
        </div>
      </Drawer.Content>
    </Drawer>
  );
}

function AuditEntry({ entry }: { entry: ConfigAuditDto }) {
  return (
    <li className="border border-(--border-subtle) bg-(--elevated) px-2.5 py-2">
      <div className="flex items-center gap-2 text-[10px] text-(--muted)">
        <span>{entry.actor ?? "system"}</span>
        <span className="ml-auto">{time(entry.changed_at)}</span>
      </div>
      <div className="mt-1 grid gap-1">
        <div className="flex gap-2">
          <span className="w-8 shrink-0 text-(--muted)">old</span>
          <span className="min-w-0 break-words text-(--secondary)">
            {previewValue(entry.old_value)}
          </span>
        </div>
        <div className="flex gap-2">
          <span className="w-8 shrink-0 text-(--muted)">new</span>
          <span className="min-w-0 break-words text-(--foreground)">
            {previewValue(entry.new_value)}
          </span>
        </div>
      </div>
    </li>
  );
}

function SourceBadge({ source }: { source: string }) {
  return (
    <Badge className="px-1.5 py-0.5 text-[9px] uppercase tracking-[0.08em]">
      {source}
    </Badge>
  );
}

function Tag({ children, tone }: { children: string; tone: "muted" | "warn" }) {
  return (
    <span
      className={`border px-1.5 py-0.5 text-[9px] uppercase tracking-[0.08em] ${
        tone === "warn"
          ? "border-[color-mix(in_srgb,var(--warning)_35%,transparent)] text-(--warning)"
          : "border-(--border-subtle) text-(--muted)"
      }`}
    >
      {children}
    </span>
  );
}

function toInputString(value: unknown, valueType: ValueType): string {
  if (valueType.kind === "bool") {
    return value === true ? "true" : "false";
  }
  if (valueType.kind === "json") {
    return JSON.stringify(value, null, 2);
  }
  if (value === null || value === undefined) {
    return "";
  }
  if (typeof value === "string") {
    return value;
  }
  return String(value);
}

type ParseResult = { ok: true; value: unknown } | { ok: false; error: string };

function parseDraft(draft: string, valueType: ValueType): ParseResult {
  switch (valueType.kind) {
    case "bool": {
      return { ok: true, value: draft === "true" };
    }
    case "int": {
      const parsed = Number(draft);
      if (!Number.isInteger(parsed)) {
        return { ok: false, error: "value must be an integer" };
      }
      return { ok: true, value: parsed };
    }
    case "float": {
      const parsed = Number(draft);
      if (!Number.isFinite(parsed) || draft.trim() === "") {
        return { ok: false, error: "value must be a number" };
      }
      return { ok: true, value: parsed };
    }
    case "json": {
      try {
        return { ok: true, value: JSON.parse(draft) as unknown };
      } catch {
        return { ok: false, error: "invalid JSON" };
      }
    }
    default: {
      return { ok: true, value: draft };
    }
  }
}

function previewValue(value: unknown): string {
  if (value === null || value === undefined) {
    return "—";
  }
  if (typeof value === "string") {
    return value;
  }
  return JSON.stringify(value);
}

function LoadingRows() {
  return (
    <>
      <div className="h-12 animate-pulse border-b border-(--border-subtle) bg-(--elevated)" />
      <div className="h-12 animate-pulse border-b border-(--border-subtle) bg-(--elevated)" />
      <div className="h-12 animate-pulse border-b border-(--border-subtle) bg-(--elevated)" />
    </>
  );
}

function MessageRow({
  message,
  tone = "muted",
}: {
  message: string;
  tone?: "error" | "muted";
}) {
  return (
    <div
      className={`border-b border-(--border-subtle) px-3 py-3 font-mono text-[11px] ${
        tone === "error" ? "text-(--error)" : "text-(--muted)"
      }`}
    >
      {message}
    </div>
  );
}

function DeferredConfig() {
  return (
    <section className="grid h-full min-h-0 grid-rows-[auto_minmax(0,1fr)] overflow-hidden bg-(--background) text-(--foreground)">
      <header className="border-b border-(--border-subtle) bg-(--surface) px-3 py-2">
        <div className="flex items-center gap-2">
          <h1 className="text-sm font-semibold">Settings</h1>
          <span className="ml-auto font-mono text-[10px] text-(--muted)">
            deferred
          </span>
        </div>
      </header>
      <div className="p-3 font-mono">
        <div className="-mx-3 -mt-3 mb-3 font-sans">
          <ConsolePreferences />
        </div>
        <div className="border-y border-(--border-subtle)">
          <div className="grid grid-cols-[96px_minmax(0,1fr)] border-b border-(--border-subtle) text-[11px]">
            <div className="bg-(--sidebar) px-3 py-1.5 text-(--muted)">
              status
            </div>
            <div className="px-3 py-1.5 text-(--secondary)">
              requires API mode
            </div>
          </div>
          <div className="grid grid-cols-[96px_minmax(0,1fr)] text-[11px]">
            <div className="bg-(--sidebar) px-3 py-1.5 text-(--muted)">
              reason
            </div>
            <div className="px-3 py-1.5 text-(--secondary)">
              configuration is unavailable in mock mode
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function errorMessage(error: unknown) {
  return error instanceof Error
    ? error.message
    : "Configuration request failed";
}
