import {
  Button,
  Input,
  Select,
  SettingsRow,
  useConsoleLocale,
  type ConsoleLanguagePreference,
} from "@lenso/console-ui";
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
  const isDirty = JSON.stringify(draft) !== JSON.stringify(storedSettings);

  const update = <Key extends keyof GeneralSettings>(
    key: Key,
    value: GeneralSettings[Key]
  ) => {
    setSaved(false);
    setDraft((current) => ({ ...current, [key]: value }));
  };

  return (
    <ProductPage
      description={copy.settings.description}
      title={copy.settings.title}
    >
      <div className="settings-page">
        <SettingsNavigation zh={zh} />
        <div className="settings-page__content">
          <header className="settings-page__header">
            <div className="settings-page__header-copy">
              <h2>{zh ? "通用" : "General"}</h2>
              <p>
                {zh
                  ? "当前 Console 工作区的身份与默认设置。"
                  : "Identity and defaults for this Console workspace."}
              </p>
            </div>
            <Select
              aria-label={copy.settings.theme}
              className="settings-page__theme-select"
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
            className="settings-page__row"
            description={
              zh
                ? "显示给操作员，并写入导出的证据。"
                : "Shown to operators and in exported evidence."
            }
            label={zh ? "工作区名称" : "Workspace name"}
          >
            <Input
              aria-label={zh ? "工作区名称" : "Workspace name"}
              className="settings-page__input"
              onChange={(event) => update("workspaceName", event.target.value)}
              value={draft.workspaceName}
            />
          </SettingsRow>
          <SettingsRow
            className="settings-page__row"
            description={
              zh
                ? "API 客户端使用的稳定标识符。"
                : "Stable identifier used by API clients."
            }
            label={zh ? "工作区标识" : "Workspace slug"}
          >
            <Input
              aria-label={zh ? "工作区标识" : "Workspace slug"}
              className="settings-page__input settings-page__input--mono"
              onChange={(event) => update("workspaceSlug", event.target.value)}
              value={draft.workspaceSlug}
            />
          </SettingsRow>
          <SettingsRow
            className="settings-page__row"
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
            className="settings-page__row"
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
            className="settings-page__row"
            description={copy.settings.languageDescription}
            label={copy.settings.consoleLanguage}
          >
            <Select
              aria-label={copy.settings.consoleLanguage}
              className="settings-page__select"
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
            className="settings-page__row"
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
            className="settings-page__row"
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
            className="settings-page__row"
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
            className="settings-page__row"
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
          <div className="settings-page__actions">
            <span aria-live="polite">
              {saved
                ? copy.settings.saved
                : isDirty
                  ? copy.settings.unsaved
                  : copy.settings.noChanges}
            </span>
            <Button
              disabled={!isDirty}
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
      className="settings-page__navigation"
      aria-label={zh ? "设置分类" : "Settings categories"}
    >
      {groups.map(([label, items], groupIndex) => (
        <div
          className="settings-page__navigation-group"
          data-first={groupIndex === 0 ? "true" : "false"}
          key={label as string}
        >
          <div className="settings-page__navigation-label">
            {label as string}
          </div>
          <div className="settings-page__navigation-items">
            {(items as string[]).map((item, itemIndex) => (
              <button
                aria-current={
                  groupIndex === 0 && itemIndex === 0 ? "page" : undefined
                }
                className={`settings-page__navigation-item ${
                  groupIndex === 0 && itemIndex === 0
                    ? "settings-page__navigation-item--active"
                    : ""
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
      className="settings-page__select"
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
      className={`settings-page__toggle relative rounded-full border transition-colors ${
        value
          ? "border-(--fg-primary) bg-(--fg-primary)"
          : "border-(--line-strong) bg-(--bg-control)"
      }`}
      onClick={() => onChange(!value)}
      role="switch"
      type="button"
    >
      <span
        className={`settings-page__toggle-knob absolute rounded-full transition-transform ${
          value
            ? "translate-x-[13px] bg-(--bg-canvas)"
            : "translate-x-0.5 bg-(--fg-tertiary)"
        }`}
      />
    </button>
  );
}
