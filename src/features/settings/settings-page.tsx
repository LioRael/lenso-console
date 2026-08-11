import {
  Button,
  Input,
  Select,
  SettingsRow,
  settingsStyles,
  useConsoleLocale,
  type ConsoleLanguagePreference,
} from "@lenso/console-ui";
import * as stylex from "@stylexjs/stylex";
import { Link } from "@tanstack/react-router";
import { useState } from "react";

import { useConsoleAppearance } from "../../app/console-appearance";
import { embeddedOfficialDefaultThemeBundle } from "../../app/console-theme-bundle";
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
  workspaceName: "Leo's team",
  workspaceSlug: "leos-team",
};

export function SettingsPage({
  section = "general",
}: {
  section?: "appearance" | "general";
}) {
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
      pageKind="settings-product-page"
      title={copy.settings.title}
    >
      <div data-page-slot="settings-page">
        <SettingsNavigation section={section} zh={zh} />
        <div data-page-slot="settings-page__content" data-section={section}>
          <header data-page-slot="settings-page__header">
            <div data-page-slot="settings-page__header-copy">
              <h2>
                {section === "appearance"
                  ? zh
                    ? "外观"
                    : "Appearance"
                  : zh
                    ? "通用"
                    : "General"}
              </h2>
              <p>
                {section === "appearance"
                  ? zh
                    ? "个人颜色模式与已安装的展示主题包。"
                    : "Personal color mode and installed presentation bundle."
                  : zh
                    ? "当前 Console 工作区的身份与默认设置。"
                    : "Identity and defaults for this Console workspace."}
              </p>
            </div>
          </header>
          {section === "general" ? (
            <>
              <SettingsRow
                data-page-slot="settings-page__row"
                description={
                  zh
                    ? "显示给操作员，并写入导出的证据。"
                    : "Shown to operators and in exported evidence."
                }
                label={zh ? "工作区名称" : "Workspace name"}
              >
                <Input
                  aria-label={zh ? "工作区名称" : "Workspace name"}
                  data-page-slot="settings-page__input"
                  onChange={(event) =>
                    update("workspaceName", event.target.value)
                  }
                  value={draft.workspaceName}
                />
              </SettingsRow>
              <SettingsRow
                data-page-slot="settings-page__row"
                description={
                  zh
                    ? "API 客户端使用的稳定标识符。"
                    : "Stable identifier used by API clients."
                }
                label={zh ? "工作区标识" : "Workspace slug"}
              >
                <Input
                  aria-label={zh ? "工作区标识" : "Workspace slug"}
                  data-page-slot="settings-page__input settings-page__input--mono"
                  onChange={(event) =>
                    update("workspaceSlug", event.target.value)
                  }
                  value={draft.workspaceSlug}
                />
              </SettingsRow>
              <SettingsRow
                data-page-slot="settings-page__row"
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
                  <option value="staging">
                    {zh ? "预发布环境" : "Staging"}
                  </option>
                </SettingsSelect>
              </SettingsRow>
              <SettingsRow
                data-page-slot="settings-page__row"
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
                  <option value="America/Los_Angeles">
                    America / Los Angeles
                  </option>
                </SettingsSelect>
              </SettingsRow>
              <SettingsRow
                data-page-slot="settings-page__row"
                description={copy.settings.languageDescription}
                label={copy.settings.consoleLanguage}
              >
                <Select
                  aria-label={copy.settings.consoleLanguage}
                  data-page-slot="settings-page__select"
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
                data-page-slot="settings-page__row"
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
                data-page-slot="settings-page__row settings-page__row--toggle"
                description={
                  zh
                    ? "操作员必须在审批前记录简明理由。"
                    : "Operators must record a concise rationale before approval."
                }
                label={
                  zh
                    ? "手动审批必须填写理由"
                    : "Require reason for manual approval"
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
                data-page-slot="settings-page__row settings-page__row--toggle"
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
                data-page-slot="settings-page__row settings-page__row--toggle"
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
              <div data-page-slot="settings-page__actions">
                <span aria-live="polite" data-page-slot="settings-page__status">
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
            </>
          ) : (
            <AppearanceSettings appearance={appearance} zh={zh} />
          )}
        </div>
      </div>
    </ProductPage>
  );
}

function reloadThemeSelection() {
  if (typeof window !== "undefined") {
    window.location.reload();
  }
}

function AppearanceSettings({
  appearance,
  zh,
}: {
  appearance: ReturnType<typeof useConsoleAppearance>;
  zh: boolean;
}) {
  const selectedBundle = appearance.themeBundles.find(
    (candidate) => candidate.bundleId === appearance.bundleId
  );
  const defaultBundleId = embeddedOfficialDefaultThemeBundle.manifest.bundleId;

  return (
    <>
      <SettingsRow
        data-page-slot="settings-page__row"
        description={
          zh ? "跟随系统、浅色或深色。" : "Match system, light, or dark."
        }
        label={zh ? "颜色模式" : "Color mode"}
      >
        <Select
          aria-label={zh ? "颜色模式" : "Color mode"}
          data-page-slot="settings-page__select"
          onChange={(event) => {
            appearance.setPreference(
              event.target.value as "system" | "light" | "dark"
            );
          }}
          value={appearance.preference}
        >
          <option value="system">{zh ? "跟随系统" : "System"}</option>
          <option value="light">{zh ? "浅色" : "Light"}</option>
          <option value="dark">{zh ? "深色" : "Dark"}</option>
        </Select>
      </SettingsRow>
      <SettingsRow
        data-page-slot="settings-page__row"
        description={
          zh
            ? "Console 已安装的展示主题包。"
            : "Installed presentation package for the Console."
        }
        label={zh ? "主题包" : "Theme Bundle"}
      >
        <Select
          aria-label={zh ? "主题包" : "Theme Bundle"}
          data-page-slot="settings-page__select"
          onChange={(event) => {
            if (event.target.value === defaultBundleId) {
              appearance.recoverToOfficialDefault();
            } else {
              appearance.setBundleId(event.target.value);
              appearance.setVariantId(null);
            }
            reloadThemeSelection();
          }}
          value={appearance.bundleId ?? defaultBundleId}
        >
          <option value={defaultBundleId}>
            {zh ? "默认 Console" : "Default Console"}
          </option>
          {appearance.themeBundles.map((bundle) => (
            <option key={bundle.bundleId} value={bundle.bundleId}>
              {bundle.manifest.displayName}
            </option>
          ))}
        </Select>
      </SettingsRow>
      <SettingsRow
        data-page-slot="settings-page__row"
        description={
          zh
            ? "所选主题包提供的变体。"
            : "Variant exposed by the selected bundle."
        }
        label={zh ? "主题变体" : "Theme Variant"}
      >
        <Select
          aria-label={zh ? "主题变体" : "Theme Variant"}
          data-page-slot="settings-page__select"
          disabled={
            !selectedBundle || selectedBundle.manifest.variants.length < 2
          }
          onChange={(event) => {
            appearance.setVariantId(event.target.value);
            reloadThemeSelection();
          }}
          value={
            selectedBundle
              ? (appearance.variantId ?? selectedBundle.manifest.defaultVariant)
              : "automatic"
          }
        >
          {selectedBundle ? (
            selectedBundle.manifest.variants.map((variant) => (
              <option key={variant.id} value={variant.id}>
                {variant.label}
              </option>
            ))
          ) : (
            <option value="automatic">
              {zh ? "自动（系统）" : "Automatic (System)"}
            </option>
          )}
        </Select>
      </SettingsRow>
      <p data-page-slot="settings-page__appearance-note">
        {zh
          ? "主题更改会重新加载 Console。"
          : "Theme changes reload the Console."}
      </p>
    </>
  );
}

function SettingsNavigation({
  section,
  zh,
}: {
  section: "appearance" | "general";
  zh: boolean;
}) {
  const groups = zh
    ? [
        ["工作区", ["通用", "外观", "环境", "成员"]],
        ["运营", ["审批策略", "Agent 边界", "恢复"]],
        ["证据", ["保留", "导出", "审计日志"]],
        ["开发者", ["API 访问", "Webhooks"]],
      ]
    : [
        ["Workspace", ["General", "Appearance", "Environments", "Members"]],
        ["Operations", ["Approval policy", "Agent bounds", "Recovery"]],
        ["Evidence", ["Retention", "Exports", "Audit log"]],
        ["Developer", ["API access", "Webhooks"]],
      ];
  return (
    <nav
      data-page-slot="settings-page__navigation"
      aria-label={zh ? "设置分类" : "Settings categories"}
    >
      {groups.map(([label, items], groupIndex) => (
        <div
          data-page-slot="settings-page__navigation-group"
          data-first={groupIndex === 0 ? "true" : "false"}
          key={label as string}
        >
          <div data-page-slot="settings-page__navigation-label">
            {label as string}
          </div>
          <div data-page-slot="settings-page__navigation-items">
            {(items as string[]).map((item, itemIndex) => {
              const targetSection =
                groupIndex === 0 && itemIndex === 0
                  ? "general"
                  : groupIndex === 0 && itemIndex === 1
                    ? "appearance"
                    : null;
              const active = targetSection === section;
              return targetSection ? (
                <Link
                  aria-current={active ? "page" : undefined}
                  data-page-slot={`settings-page__navigation-item ${
                    active ? "settings-page__navigation-item--active" : ""
                  }`}
                  key={item}
                  to={
                    targetSection === "appearance"
                      ? "/settings/appearance"
                      : "/settings"
                  }
                >
                  {item}
                </Link>
              ) : (
                <button
                  data-page-slot="settings-page__navigation-item"
                  key={item}
                  type="button"
                >
                  {item}
                </button>
              );
            })}
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
      data-page-slot="settings-page__select"
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
  const toggleStyleProps = stylex.props(
    settingsStyles.settingsToggle,
    value ? settingsStyles.settingsToggleOn : settingsStyles.settingsToggleOff
  );
  const knobStyleProps = stylex.props(
    settingsStyles.settingsToggleKnob,
    value
      ? settingsStyles.settingsToggleKnobOn
      : settingsStyles.settingsToggleKnobOff
  );

  return (
    <button
      aria-checked={value}
      aria-label={label}
      {...toggleStyleProps}
      data-page-slot="settings-page__toggle"
      onClick={() => onChange(!value)}
      role="switch"
      type="button"
    >
      <span {...knobStyleProps} data-page-slot="settings-page__toggle-knob" />
    </button>
  );
}
