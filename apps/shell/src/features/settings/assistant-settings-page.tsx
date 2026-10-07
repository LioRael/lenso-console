import { Button } from "@lenso/ui/button";
import { Description } from "@lenso/ui/description";
import { Input } from "@lenso/ui/input";
import { Label } from "@lenso/ui/label";
import { Select } from "@lenso/ui/select";
import { TextField } from "@lenso/ui/textfield";
import * as stylex from "@stylexjs/stylex";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";

import { useConsoleLocale } from "../../app/console-locale";
import { useConsoleSession } from "../../app/console-session";
import { SettingsRow } from "../../components/lenso/recipes/settings-row";
import { SettingsSection } from "../../components/lenso/recipes/settings-section";
import { ConsolePageHeader } from "../../components/runtime/console-page-header";
import { agentSettingsStyles as shared } from "../agent/agent-settings-page.stylex";
import { assistantSettingsStyles as styles } from "./assistant-settings-page.stylex";
import {
  AssistantSettingsError,
  readAssistantSettings,
  updateAssistantSettings,
  type AssistantSettings,
  type AssistantSettingsUpdate,
} from "./assistant-settings-runtime";
import { settingsPageStyles as preferences } from "./settings-page.stylex";

export function AssistantSettingsPage() {
  const { assistantEnabled, subject } = useConsoleSession();
  const { locale } = useConsoleLocale();
  const zh = locale === "zh-CN";
  const settings = useQuery({
    queryKey: ["assistant-settings", subject],
    queryFn: ({ signal }) => readAssistantSettings(subject, signal),
    enabled: assistantEnabled,
    retry: false,
  });

  return (
    <main {...stylex.props(preferences.page)}>
      <div {...stylex.props(preferences.column)}>
        <ConsolePageHeader
          xstyle={preferences.headerInset}
          title={zh ? "助手" : "Assistant"}
          description={
            zh
              ? "为你的助手选择模型服务。"
              : "Choose the model service for your assistant."
          }
        />
        {!assistantEnabled ||
        (settings.error instanceof AssistantSettingsError &&
          settings.error.status === 403) ? (
          <p role="alert" {...stylex.props(shared.error)}>
            {zh
              ? "此账号尚未获得助手访问权限。请联系管理员。"
              : "Assistant access is not enabled for this account. Contact your administrator."}
          </p>
        ) : settings.isError && !settings.data ? (
          <>
            <p role="alert" {...stylex.props(shared.error)}>
              {zh
                ? "无法加载助手设置。请重试。"
                : "Assistant settings could not be loaded. Try again."}
            </p>
            <Button
              variant="ghost"
              onClick={() => {
                void settings.refetch();
              }}
            >
              {zh ? "重试" : "Retry"}
            </Button>
          </>
        ) : settings.data ? (
          <>
            {settings.isError ? (
              <p role="alert" {...stylex.props(shared.error)}>
                {zh
                  ? "无法刷新设置。你的编辑已保留。"
                  : "Settings could not be refreshed. Your edits have been kept."}
              </p>
            ) : null}
            <AssistantSettingsForm
              key={subject}
              settings={settings.data}
              subject={subject}
              zh={zh}
              refresh={async () => {
                const result = await settings.refetch();
                return result.isError ? undefined : result.data;
              }}
            />
          </>
        ) : (
          <output {...stylex.props(shared.notice)}>
            {zh ? "正在加载助手设置…" : "Loading assistant settings…"}
          </output>
        )}
      </div>
    </main>
  );
}

function AssistantSettingsForm({
  settings,
  subject,
  zh,
  refresh,
}: {
  settings: AssistantSettings;
  subject: string;
  zh: boolean;
  refresh: () => Promise<AssistantSettings | undefined>;
}) {
  const [provider, setProvider] = useState<string | null>(
    settings.selected_provider_id
  );
  const [apiKey, setApiKey] = useState("");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [denied, setDenied] = useState(false);
  const pendingWrite = useRef<AbortController | null>(null);
  useEffect(() => () => pendingWrite.current?.abort(), []);
  const selected = settings.providers.find((entry) => entry.id === provider);

  const save = async (update: AssistantSettingsUpdate) => {
    const controller = new AbortController();
    pendingWrite.current = controller;
    setSaving(true);
    setErrorMessage("");
    setMessage("");
    try {
      // Credentials remain in this transient form and the request body only.
      // A mutation cache or browser storage must never retain them.
      await updateAssistantSettings(subject, update, controller.signal);
      if (controller.signal.aborted) {
        return;
      }
      if ("byok" in update) {
        setApiKey("");
      }
      const refreshed = await refresh();
      if (controller.signal.aborted) {
        return;
      }
      if (refreshed) {
        setProvider(refreshed.selected_provider_id);
      }
      setMessage(
        refreshed
          ? zh
            ? "助手设置已保存。"
            : "Assistant settings saved."
          : zh
            ? "设置已保存；请刷新以查看最新状态。"
            : "Settings saved. Refresh to see the latest status."
      );
    } catch (error) {
      if (controller.signal.aborted) {
        return;
      }
      if (error instanceof AssistantSettingsError && error.status === 403) {
        setApiKey("");
        setDenied(true);
        setErrorMessage(
          zh
            ? "你无权更改这些助手设置。请联系管理员。"
            : "You do not have permission to change these assistant settings. Contact your administrator."
        );
      } else {
        setErrorMessage(
          zh
            ? "无法保存助手设置。请检查所选服务并重试。"
            : "Assistant settings could not be saved. Check the selected service and try again."
        );
      }
    } finally {
      if (!controller.signal.aborted) {
        setSaving(false);
      }
    }
  };

  if (denied) {
    return (
      <p role="alert" {...stylex.props(shared.error)}>
        {errorMessage}
      </p>
    );
  }

  return (
    <>
      <SettingsSection.Root
        aria-labelledby="assistant-provider-title"
        xstyle={preferences.section}
      >
        <SettingsSection.Header>
          <SettingsSection.Title
            id="assistant-provider-title"
            xstyle={preferences.sectionTitle}
          >
            {zh ? "模型服务" : "Model service"}
          </SettingsSection.Title>
        </SettingsSection.Header>
        <SettingsSection.Group xstyle={preferences.group}>
          <SettingsRow.Root xstyle={[preferences.row, styles.providerRow]}>
            <SettingsRow.Copy xstyle={preferences.rowCopy}>
              <SettingsRow.Title xstyle={preferences.rowTitle}>
                Provider
              </SettingsRow.Title>
              <SettingsRow.Description xstyle={preferences.rowDescription}>
                {selected?.model ??
                  (zh
                    ? "使用管理员为此账号分配的默认服务。"
                    : "Use the default service assigned to your account.")}
              </SettingsRow.Description>
            </SettingsRow.Copy>
            <SettingsRow.Control xstyle={styles.providerControl}>
              <Select.Root
                disabled={saving || denied}
                value={provider ?? "__assigned"}
                onValueChange={(value) => {
                  if (typeof value === "string") {
                    setProvider(value === "__assigned" ? null : value);
                    setMessage("");
                  }
                }}
              >
                <Select.Trigger
                  aria-label={zh ? "助手 Provider" : "Assistant provider"}
                  xstyle={[preferences.selectTrigger, styles.providerTrigger]}
                >
                  <Select.Value>
                    {selected?.label ??
                      (zh ? "分配的默认服务" : "Assigned default")}
                  </Select.Value>
                  <Select.Icon />
                </Select.Trigger>
                <Select.Portal>
                  <Select.Positioner align="end" alignItemWithTrigger={false}>
                    <Select.Popup>
                      <Select.List>
                        {[
                          {
                            id: "__assigned",
                            label: zh ? "分配的默认服务" : "Assigned default",
                          },
                          ...settings.providers,
                        ].map((entry) => (
                          <Select.Item key={entry.id} value={entry.id}>
                            <Select.ItemText>{entry.label}</Select.ItemText>
                            <Select.ItemIndicator />
                          </Select.Item>
                        ))}
                      </Select.List>
                    </Select.Popup>
                  </Select.Positioner>
                </Select.Portal>
              </Select.Root>
            </SettingsRow.Control>
          </SettingsRow.Root>
          <SettingsRow.Root xstyle={shared.saveBar}>
            <Button
              disabled={
                saving || denied || provider === settings.selected_provider_id
              }
              onClick={() => {
                void save({ provider_id: provider });
              }}
            >
              {zh ? "保存 Provider" : "Save provider"}
            </Button>
          </SettingsRow.Root>
        </SettingsSection.Group>
      </SettingsSection.Root>

      <SettingsSection.Root
        aria-labelledby="assistant-key-title"
        xstyle={preferences.section}
      >
        <SettingsSection.Header>
          <SettingsSection.Title
            id="assistant-key-title"
            xstyle={preferences.sectionTitle}
          >
            {zh ? "个人 API Key" : "Personal API key"}
          </SettingsSection.Title>
        </SettingsSection.Header>
        <SettingsSection.Group xstyle={preferences.group}>
          <SettingsRow.Root xstyle={styles.keyBody}>
            <p {...stylex.props(preferences.description)}>
              {settings.byok_enabled
                ? zh
                  ? "你的密钥仅用于此账号和允许的模型服务。保存后不会显示。"
                  : "Your key is used only for your account and an allowed model service. Saved keys are never displayed."
                : zh
                  ? "管理员尚未启用个人 API Key。"
                  : "Personal API keys have not been enabled by your administrator."}
            </p>
            <p {...stylex.props(preferences.description)}>
              {settings.has_byok
                ? zh
                  ? "已保存个人密钥。"
                  : "A personal key is saved."
                : zh
                  ? "尚未保存个人密钥。"
                  : "No personal key is saved."}
            </p>
            {settings.byok_enabled ? (
              <TextField.Root>
                <Label htmlFor="assistant-personal-key">
                  {zh ? "新的 API Key" : "New API key"}
                </Label>
                <Input
                  id="assistant-personal-key"
                  aria-describedby="assistant-key-description"
                  type="password"
                  autoComplete="off"
                  spellCheck={false}
                  disabled={saving || denied}
                  value={apiKey}
                  onChange={(event) => {
                    setApiKey(event.target.value);
                    setMessage("");
                  }}
                />
                <Description id="assistant-key-description">
                  {zh
                    ? "先保存 Provider 选择，再保存个人密钥。"
                    : "Save your provider choice before saving a personal key."}
                </Description>
              </TextField.Root>
            ) : null}
          </SettingsRow.Root>
          {settings.byok_enabled || settings.has_byok ? (
            <SettingsRow.Root xstyle={shared.saveBar}>
              {settings.has_byok ? (
                <Button
                  variant="ghost"
                  disabled={saving || denied}
                  onClick={() => {
                    void save({
                      provider_id: settings.selected_provider_id,
                      byok: null,
                    });
                  }}
                >
                  {zh ? "移除个人密钥" : "Remove personal key"}
                </Button>
              ) : null}
              {settings.byok_enabled ? (
                <Button
                  disabled={
                    saving ||
                    denied ||
                    !apiKey.trim() ||
                    !selected ||
                    provider !== settings.selected_provider_id
                  }
                  onClick={() => {
                    if (selected) {
                      void save({
                        provider_id: selected.id,
                        byok: { provider_id: selected.id, api_key: apiKey },
                      });
                    }
                  }}
                >
                  {zh ? "保存个人密钥" : "Save personal key"}
                </Button>
              ) : null}
            </SettingsRow.Root>
          ) : null}
        </SettingsSection.Group>
      </SettingsSection.Root>
      {saving ? (
        <output {...stylex.props(shared.notice)}>
          {zh ? "正在保存…" : "Saving…"}
        </output>
      ) : null}
      {message ? (
        <output {...stylex.props(shared.notice)}>{message}</output>
      ) : null}
      {errorMessage ? (
        <p role="alert" {...stylex.props(shared.error)}>
          {errorMessage}
        </p>
      ) : null}
    </>
  );
}
