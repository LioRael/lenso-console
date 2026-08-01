import {
  Button,
  Input,
  Select,
  useConsoleLocale,
  type ConsoleLanguagePreference,
} from "@lenso/console-package-api";
import { useState } from "react";

import {
  useConsoleAppearance,
  type ConsoleThemePreference,
} from "../../app/console-appearance";
import { usePersistedLayout } from "../../hooks/use-persisted-layout";
import { ProductPage } from "../console-design/components";
import { consoleProductCopy } from "../console-design/copy";

type GeneralSettings = {
  agentDrafts: boolean;
  environment: string;
  experimentalSurfaces: boolean;
  manualApprovalReason: boolean;
  refreshInterval: string;
  timeZone: string;
  workspaceName: string;
  workspaceSlug: string;
};

const defaultGeneralSettings: GeneralSettings = {
  agentDrafts: true,
  environment: "production",
  experimentalSurfaces: false,
  manualApprovalReason: true,
  refreshInterval: "15",
  timeZone: "Asia/Shanghai",
  workspaceName: "leosouthey's team",
  workspaceSlug: "leosouthey-team",
};

export function SettingsPage() {
  const appearance = useConsoleAppearance();
  const locale = useConsoleLocale();
  const copy = consoleProductCopy(locale.locale);
  const zh = locale.locale === "zh-CN";
  const [storedSettings, setStoredSettings] = usePersistedLayout(
    "lenso-console-general-settings",
    defaultGeneralSettings
  );
  const [draft, setDraft] = useState(storedSettings);
  const [saved, setSaved] = useState(false);

  const update = <Key extends keyof GeneralSettings>(
    key: Key,
    value: GeneralSettings[Key]
  ) => {
    setSaved(false);
    setDraft((current) => ({ ...current, [key]: value }));
  };

  return (
    <ProductPage
      description={
        zh
          ? "管理工作区策略、审批、证据保留以及 Console 偏好。"
          : "Workspace policy, approvals, evidence retention, and Console preferences."
      }
      title={copy.settings.title}
    >
      <div className="grid min-h-[calc(100vh-192px)] grid-cols-[236px_minmax(0,1fr)]">
        <SettingsNavigation zh={zh} />
        <div className="min-w-0 pl-9">
          <header className="flex min-h-[68px] items-center justify-between gap-6 border-b border-(--line)">
            <div>
              <h2 className="text-[18px] leading-6 font-semibold">
                {zh ? "通用" : "General"}
              </h2>
              <p className="mt-0.5 text-[12px] text-(--fg-secondary)">
                {zh
                  ? "当前 Console 工作区的身份与默认设置。"
                  : "Identity and defaults for this Console workspace."}
              </p>
            </div>
            <Select
              aria-label={copy.settings.theme}
              className="h-8! min-h-8! w-32! text-[12px]!"
              onChange={(event) =>
                appearance.setPreference(
                  event.target.value as ConsoleThemePreference
                )
              }
              value={appearance.preference}
            >
              <option value="system">{copy.settings.followSystem}</option>
              <option value="dark">{copy.settings.dark}</option>
              <option value="light">{copy.settings.light}</option>
            </Select>
          </header>

          <SettingsRow
            description={
              zh
                ? "显示给操作员，并写入导出的证据。"
                : "Shown to operators and in exported evidence."
            }
            label={zh ? "工作区名称" : "Workspace name"}
          >
            <Input
              aria-label={zh ? "工作区名称" : "Workspace name"}
              className="h-8! min-h-8! w-[300px]! text-[12px]!"
              onChange={(event) => update("workspaceName", event.target.value)}
              value={draft.workspaceName}
            />
          </SettingsRow>
          <SettingsRow
            description={
              zh
                ? "API 客户端使用的稳定标识符。"
                : "Stable identifier used by API clients."
            }
            label={zh ? "工作区标识" : "Workspace slug"}
          >
            <Input
              aria-label={zh ? "工作区标识" : "Workspace slug"}
              className="h-8! min-h-8! w-[300px]! font-mono text-[12px]!"
              onChange={(event) => update("workspaceSlug", event.target.value)}
              value={draft.workspaceSlug}
            />
          </SettingsRow>
          <SettingsRow
            description={
              zh
                ? "运营视图的初始环境。"
                : "Initial context for operational views."
            }
            label={zh ? "默认环境" : "Default environment"}
          >
            <SettingsSelect
              label={zh ? "默认环境" : "Default environment"}
              onChange={(value) => update("environment", value)}
              value={draft.environment}
            >
              <option value="production">
                {zh ? "生产环境" : "Production"}
              </option>
              <option value="staging">{zh ? "预发布环境" : "Staging"}</option>
            </SettingsSelect>
          </SettingsRow>
          <SettingsRow
            description={
              zh
                ? "用于时间线显示与证据导出。"
                : "Used for timeline display and evidence exports."
            }
            label={copy.settings.timeZone}
          >
            <SettingsSelect
              label={copy.settings.timeZone}
              onChange={(value) => update("timeZone", value)}
              value={draft.timeZone}
            >
              <option value="Asia/Shanghai">Asia / Shanghai</option>
              <option value="Asia/Tokyo">Asia / Tokyo</option>
              <option value="Europe/London">Europe / London</option>
              <option value="America/Los_Angeles">America / Los Angeles</option>
            </SettingsSelect>
          </SettingsRow>
          <SettingsRow
            description={copy.settings.languageDescription}
            label={copy.settings.consoleLanguage}
          >
            <Select
              aria-label={copy.settings.consoleLanguage}
              className="h-8! min-h-8! w-[300px]! text-[12px]!"
              onChange={(event) =>
                locale.setPreference(
                  event.target.value as ConsoleLanguagePreference
                )
              }
              value={locale.preference}
            >
              <option value="system">{copy.settings.followSystem}</option>
              <option value="en">English (US)</option>
              <option value="zh-CN">简体中文</option>
            </Select>
          </SettingsRow>
          <SettingsRow
            description={
              zh
                ? "流式更新不可用时的轮询间隔。"
                : "Live polling interval when streaming is unavailable."
            }
            label={zh ? "运行时刷新" : "Runtime refresh"}
          >
            <SettingsSelect
              label={zh ? "运行时刷新" : "Runtime refresh"}
              onChange={(value) => update("refreshInterval", value)}
              value={draft.refreshInterval}
            >
              <option value="5">{zh ? "5 秒" : "5 seconds"}</option>
              <option value="15">{zh ? "15 秒" : "15 seconds"}</option>
              <option value="30">{zh ? "30 秒" : "30 seconds"}</option>
            </SettingsSelect>
          </SettingsRow>
          <SettingsRow
            description={
              zh
                ? "操作员必须在审批前记录简明理由。"
                : "Operators must record a concise rationale before approval."
            }
            label={
              zh ? "手动审批必须填写理由" : "Require reason for manual approval"
            }
          >
            <SettingsToggle
              label={
                zh
                  ? "手动审批必须填写理由"
                  : "Require reason for manual approval"
              }
              onChange={(value) => update("manualApprovalReason", value)}
              value={draft.manualApprovalReason}
            />
          </SettingsRow>
          <SettingsRow
            description={
              zh
                ? "Agent 可以准备有边界的草稿，但不能批准。"
                : "Agents may prepare bounded drafts; they cannot approve them."
            }
            label={
              zh
                ? "允许 Agent 编写计划草稿"
                : "Allow agent-authored draft plans"
            }
          >
            <SettingsToggle
              label={
                zh
                  ? "允许 Agent 编写计划草稿"
                  : "Allow agent-authored draft plans"
              }
              onChange={(value) => update("agentDrafts", value)}
              value={draft.agentDrafts}
            />
          </SettingsRow>
          <SettingsRow
            description={
              zh
                ? "显示标记为实验性的 Console 页面。"
                : "Expose Console surfaces marked experimental."
            }
            label={zh ? "显示实验性页面" : "Show experimental surfaces"}
          >
            <SettingsToggle
              label={zh ? "显示实验性页面" : "Show experimental surfaces"}
              onChange={(value) => update("experimentalSurfaces", value)}
              value={draft.experimentalSurfaces}
            />
          </SettingsRow>
          <div className="flex h-16 items-center justify-end">
            <Button
              onClick={() => {
                setStoredSettings(draft);
                setSaved(true);
              }}
              variant="primary"
            >
              {saved
                ? zh
                  ? "已保存"
                  : "Saved"
                : zh
                  ? "保存更改"
                  : "Save changes"}
            </Button>
          </div>
        </div>
      </div>
    </ProductPage>
  );
}

function SettingsNavigation({ zh }: { zh: boolean }) {
  const groups = zh
    ? [
        ["工作区", ["通用", "环境", "成员"]],
        ["运营", ["审批策略", "Agent 边界", "恢复"]],
        ["证据", ["保留", "导出", "审计日志"]],
        ["开发者", ["API 访问", "Webhooks"]],
      ]
    : [
        ["Workspace", ["General", "Environments", "Members"]],
        ["Operations", ["Approval policy", "Agent bounds", "Recovery"]],
        ["Evidence", ["Retention", "Exports", "Audit log"]],
        ["Developer", ["API access", "Webhooks"]],
      ];
  return (
    <nav
      className="border-r border-(--line) pr-6 pt-4"
      aria-label={zh ? "设置分类" : "Settings categories"}
    >
      {groups.map(([label, items], groupIndex) => (
        <div className={groupIndex === 0 ? "" : "mt-5"} key={label as string}>
          <div className="px-2 text-[10px] text-(--fg-tertiary)">
            {label as string}
          </div>
          <div className="mt-1 grid gap-0.5">
            {(items as string[]).map((item, itemIndex) => (
              <button
                aria-current={
                  groupIndex === 0 && itemIndex === 0 ? "page" : undefined
                }
                className={`h-8 rounded-[var(--radius-control)] px-2 text-left text-[12px] ${
                  groupIndex === 0 && itemIndex === 0
                    ? "bg-(--bg-row-hover) text-(--fg-primary)"
                    : "text-(--fg-secondary) hover:bg-(--bg-row-hover) hover:text-(--fg-primary)"
                }`}
                key={item}
                type="button"
              >
                {item}
              </button>
            ))}
          </div>
        </div>
      ))}
    </nav>
  );
}

function SettingsRow({
  children,
  description,
  label,
}: React.PropsWithChildren<{ description: string; label: string }>) {
  return (
    <div className="grid min-h-[70px] grid-cols-[minmax(0,1fr)_auto] items-center gap-8 border-b border-(--line)">
      <div className="min-w-0">
        <h3 className="text-[12px] font-medium">{label}</h3>
        <p className="mt-0.5 text-[11px] text-(--fg-secondary)">
          {description}
        </p>
      </div>
      {children}
    </div>
  );
}

function SettingsSelect({
  children,
  label,
  onChange,
  value,
}: React.PropsWithChildren<{
  label: string;
  onChange: (value: string) => void;
  value: string;
}>) {
  return (
    <Select
      aria-label={label}
      className="h-8! min-h-8! w-[300px]! text-[12px]!"
      onChange={(event) => onChange(event.target.value)}
      value={value}
    >
      {children}
    </Select>
  );
}

function SettingsToggle({
  label,
  onChange,
  value,
}: {
  label: string;
  onChange: (value: boolean) => void;
  value: boolean;
}) {
  return (
    <button
      aria-checked={value}
      aria-label={label}
      className={`relative h-4 w-7 rounded-full border transition-colors ${
        value
          ? "border-(--fg-primary) bg-(--fg-primary)"
          : "border-(--line-strong) bg-(--bg-control)"
      }`}
      onClick={() => onChange(!value)}
      role="switch"
      type="button"
    >
      <span
        className={`absolute top-0.5 size-2.5 rounded-full transition-transform ${
          value
            ? "translate-x-[13px] bg-(--bg-canvas)"
            : "translate-x-0.5 bg-(--fg-tertiary)"
        }`}
      />
    </button>
  );
}
