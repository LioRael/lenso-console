import { Button } from "@lenso/ui/button";
import { Select } from "@lenso/ui/select";
import { Switch } from "@lenso/ui/switch";
import { TextField } from "@lenso/ui/text-field";
import * as stylex from "@stylexjs/stylex";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";

import type { PluginWorkbenchItem } from "../plugins/plugin-workbench-model";
import { SettingsPageHeader } from "../settings/settings-page-header";
import { profileStyles as ui } from "./agent-profile-editor.stylex";
import {
  profileRequest,
  providerEnabled,
  providerGroup,
  providerId,
  toggleProviders,
  toggleTools,
  type EditableProfile,
  type ProfileCatalog,
  type ProfileDocument,
} from "./agent-profile-model";
import { readAgentToolPolicy, type AgentIdentity } from "./agent-runtime";
import { agentSettingsStyles as styles } from "./agent-settings-page.stylex";

export function AgentProfileEditor({
  agent,
  items,
  initialProfile,
  existingNames,
  onSaved,
  onDirtyChange,
}: {
  agent: AgentIdentity;
  items: readonly PluginWorkbenchItem[];
  initialProfile: EditableProfile;
  existingNames: string[];
  onSaved?: (profile: EditableProfile) => void;
  onDirtyChange?: (dirty: boolean) => void;
}) {
  const cache = useQueryClient();
  const key = ["agent-profiles", agent.id];
  const tools = useQuery({
    queryKey: ["agent-settings", agent.id, "tool-policy"],
    queryFn: ({ signal }) => readAgentToolPolicy(signal, agent.id),
    retry: false,
  });
  const [saved, setSaved] = useState(initialProfile);
  const [draft, setDraft] = useState<EditableProfile>();
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("Tools");
  const [message, setMessage] = useState("");
  const profile = draft ?? saved;
  const dirty =
    !profile.revision ||
    Boolean(
      draft &&
      (!saved ||
        draft.name !== saved.name ||
        JSON.stringify(draft.document) !== JSON.stringify(saved.document))
    );
  useEffect(() => {
    onDirtyChange?.(dirty);
  }, [dirty, onDirtyChange]);
  const save = useMutation({
    mutationFn: (value: EditableProfile) =>
      profileRequest<EditableProfile>(agent.id, "control/profiles", {
        name: value.name,
        expectedRevision: value.revision || null,
        document: value.document,
      }),
    onError: () => {
      void cache.invalidateQueries({ queryKey: key });
    },
    onSuccess: (value) => {
      cache.setQueryData<ProfileCatalog>(key, (previous) =>
        previous
          ? {
              ...previous,
              profiles: [
                ...previous.profiles.filter((item) => item.name !== value.name),
                value,
              ],
            }
          : previous
      );
      setSaved(value);
      setDraft(undefined);
      setMessage(
        "Saved. Choose this Profile from the Profiles page to use it."
      );
      onDirtyChange?.(false);
      onSaved?.(value);
    },
  });
  const busy = save.isPending;
  const readonly = !profile || profile.readOnly || busy;
  const edit = (document: ProfileDocument) => {
    if (profile && !readonly) {
      setDraft({ ...profile, document });
      setMessage("");
      save.reset();
    }
  };
  const copy = () => {
    if (!profile) {
      return;
    }
    const stem = `${profile.name.slice(0, 50)}-custom`;
    let name = stem;
    for (let index = 2; existingNames.includes(name); index += 1) {
      name = `${stem}-${index}`;
    }
    setDraft({
      ...profile,
      name,
      revision: "",
      readOnly: false,
      document: structuredClone(profile.document),
    });
    setMessage("");
    save.reset();
  };
  const matches = (text: string) =>
    text.toLocaleLowerCase().includes(search.toLocaleLowerCase());
  const visibleTools = (tools.data?.available ?? []).filter((tool) =>
    matches(`${tool.name} ${tool.description}`)
  );
  const allowed = new Set(
    profile?.document.allowed_tools ?? tools.data?.allowed
  );
  const providerItems = items.filter(
    (item) =>
      (item.management?.disableable ||
        providerGroup(item) === "Instruction sources") &&
      providerId(item) !== profile?.document.agent
  );
  const unknown = profile
    ? [
        ...new Set([
          ...profile.document.instances,
          ...profile.document.excluded_instances,
        ]),
      ].filter(
        (id) =>
          !items.some((item) => providerId(item) === id) &&
          id !== profile.document.agent
      )
    : [];
  const categories = [
    "Tools",
    "Tool providers & MCP",
    "Skills & context",
    "Instruments",
    "Instruction sources",
    "Other providers",
  ];
  const visibleProviders = providerItems.filter(
    (item) => providerGroup(item) === category && matches(providerId(item))
  );
  const isTools = category === "Tools";
  const resultCount = isTools ? visibleTools.length : visibleProviders.length;
  const selectedCount = isTools
    ? visibleTools.filter(
        (tool) =>
          allowed.has(tool.name) && tools.data?.allowed.includes(tool.name)
      ).length
    : visibleProviders.filter(
        (item) => profile && providerEnabled(profile.document, item)
      ).length;
  const bulkEdit = (enabled: boolean) => {
    if (!profile) {
      return;
    }
    edit(
      isTools
        ? toggleTools(
            profile.document,
            visibleTools
              .filter(
                (tool) => !enabled || tools.data?.allowed.includes(tool.name)
              )
              .map((tool) => tool.name),
            enabled,
            tools.data?.allowed ?? []
          )
        : toggleProviders(
            profile.document,
            visibleProviders.filter((item) => item.management?.disableable),
            enabled
          )
    );
  };
  return (
    <section {...stylex.props(ui.root)} aria-label="Profile editor">
      <SettingsPageHeader
        title={profile.revision ? profile.name : "New Profile"}
        description={
          <output {...stylex.props(ui.status)}>
            {busy
              ? "Validating and saving…"
              : dirty
                ? "Unsaved changes"
                : message ||
                  (profile.readOnly
                    ? "Built-in template · Duplicate to customize"
                    : "All changes saved")}
          </output>
        }
        actions={
          <div {...stylex.props(ui.footerActions)}>
            {profile.readOnly ? (
              <Button
                variant="secondary"
                size="compact"
                disabled={busy}
                onClick={copy}
              >
                Duplicate Profile
              </Button>
            ) : (
              <>
                {draft ? (
                  <Button
                    size="compact"
                    variant="ghost"
                    disabled={busy}
                    onClick={() => {
                      setDraft(undefined);
                      setSaved(initialProfile);
                      save.reset();
                    }}
                  >
                    Reset
                  </Button>
                ) : null}
                <Button
                  size="compact"
                  disabled={
                    !dirty ||
                    readonly ||
                    !/^[a-z0-9][a-z0-9_-]{0,63}$/u.test(profile.name)
                  }
                  onClick={() => save.mutate(profile)}
                >
                  Save draft
                </Button>
              </>
            )}
          </div>
        }
      />
      {save.error ? (
        <p role="alert" {...stylex.props(ui.inlineNotice, styles.error)}>
          {save.error.message}
        </p>
      ) : null}
      {profile ? (
        <div {...stylex.props(ui.panel)}>
          <div {...stylex.props(ui.fields)}>
            {profile.readOnly ? (
              <>
                <p {...stylex.props(ui.templateDescription)}>
                  {profile.document.description ||
                    "A starting point for your Agent."}
                </p>
                <div {...stylex.props(ui.instructionPreview)}>
                  <h3 {...stylex.props(ui.fieldTitle)}>Instructions</h3>
                  <p {...stylex.props(ui.previewText)}>
                    {profile.document.instructions ||
                      "Uses instructions from its enabled providers."}
                  </p>
                </div>
              </>
            ) : (
              <>
                {profile.revision ? null : (
                  <label htmlFor="profile-name" {...stylex.props(ui.field)}>
                    Name
                    <TextField.Root xstyle={ui.input}>
                      <TextField.Control
                        id="profile-name"
                        aria-label="Profile name"
                        value={profile.name}
                        disabled={busy}
                        onChange={(event) =>
                          setDraft({ ...profile, name: event.target.value })
                        }
                        placeholder="my-profile"
                      />
                    </TextField.Root>
                    <span {...stylex.props(ui.hint)}>
                      Lowercase letters, numbers, hyphens or underscores.
                    </span>
                  </label>
                )}
                <label
                  htmlFor="profile-description"
                  {...stylex.props(ui.field)}
                >
                  Description
                  <TextField.Root xstyle={ui.input}>
                    <TextField.Control
                      id="profile-description"
                      aria-label="Profile description"
                      disabled={busy}
                      value={profile.document.description}
                      onChange={(event) =>
                        edit({
                          ...profile.document,
                          description: event.target.value,
                        })
                      }
                      placeholder="What is this Profile for?"
                    />
                  </TextField.Root>
                </label>
                <label {...stylex.props(ui.field)}>
                  Instructions
                  <textarea
                    {...stylex.props(ui.textarea)}
                    aria-label="Profile instructions"
                    disabled={busy}
                    value={profile.document.instructions}
                    onChange={(event) =>
                      edit({
                        ...profile.document,
                        instructions: event.target.value,
                      })
                    }
                    placeholder="How should this Agent approach its work?"
                  />
                  <span {...stylex.props(ui.hint)}>
                    Your instructions are combined with enabled instruction
                    sources. Select those sources in Capabilities below.
                  </span>
                </label>
              </>
            )}
            <div {...stylex.props(ui.field)}>
              <h3 {...stylex.props(ui.fieldTitle)}>Approval mode</h3>
              <ProfileSelect
                label="Approval mode"
                value={String(profile.document.approval_mode ?? "request")}
                display={
                  (
                    {
                      request: "Request approval",
                      assisted: "Help me approve",
                      full: "Full access",
                    } as Record<string, string>
                  )[String(profile.document.approval_mode ?? "request")] ??
                  "Request approval"
                }
                disabled={readonly}
                options={[
                  {
                    value: "request",
                    label: "Request approval",
                    detail: "Ask before actions requiring approval",
                  },
                  {
                    value: "assisted",
                    label: "Help me approve",
                    detail: "AI reviews actions; asks you when uncertain",
                  },
                  {
                    value: "full",
                    label: "Full access",
                    detail: "Run enabled tools without approval",
                  },
                ]}
                onChange={(value) =>
                  edit({ ...profile.document, approval_mode: value })
                }
              />
              <p {...stylex.props(ui.hint)}>
                Default for new turns. You can override it in a conversation.
                Disabled capabilities remain unavailable in every mode.
              </p>
            </div>
          </div>
          <section
            {...stylex.props(ui.capabilities)}
            aria-label="Profile capabilities"
          >
            <header {...stylex.props(ui.capabilityHeading)}>
              <div>
                <h3 {...stylex.props(ui.fieldTitle)}>Capabilities</h3>
                <p {...stylex.props(ui.hint)}>
                  Choose the tools and providers available to this Profile.
                </p>
              </div>
              {isTools && profile.document.allowed_tools === null ? (
                <span {...stylex.props(ui.badge)}>Inherited</span>
              ) : null}
            </header>
            <div {...stylex.props(ui.filters)}>
              <ProfileSelect
                label="Capability category"
                value={category}
                display={
                  category === "Tool providers & MCP"
                    ? "Providers & MCP"
                    : category
                }
                disabled={false}
                options={categories.map((value) => ({
                  value,
                  label:
                    value === "Tool providers & MCP"
                      ? "Providers & MCP"
                      : value,
                  detail: String(
                    value === "Tools"
                      ? (tools.data?.available.length ?? 0)
                      : providerItems.filter(
                          (item) => providerGroup(item) === value
                        ).length
                  ),
                }))}
                onChange={setCategory}
              />
              <TextField.Root xstyle={ui.search}>
                <TextField.Control
                  aria-label="Search Profile capabilities"
                  type="search"
                  placeholder="Search capabilities…"
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                />
              </TextField.Root>
            </div>
            <div {...stylex.props(ui.listToolbar)}>
              <span {...stylex.props(ui.hint)}>
                {selectedCount} of {resultCount} enabled
                {search ? " · Matching results" : ""}
              </span>
              {profile.readOnly ? (
                <span {...stylex.props(ui.hint)}>Duplicate to customize</span>
              ) : (
                <div {...stylex.props(ui.bulkActions)}>
                  <Button
                    variant="ghost"
                    size="compact"
                    disabled={
                      readonly || !resultCount || (isTools && !tools.data)
                    }
                    onClick={() => bulkEdit(true)}
                  >
                    Enable {search ? "matching" : "all"}
                  </Button>
                  <Button
                    variant="ghost"
                    size="compact"
                    disabled={
                      readonly || !resultCount || (isTools && !tools.data)
                    }
                    onClick={() => bulkEdit(false)}
                  >
                    Disable {search ? "matching" : "all"}
                  </Button>
                </div>
              )}
            </div>
            {isTools && tools.error ? (
              <p role="alert" {...stylex.props(ui.empty)}>
                Tool catalog could not be loaded. Existing choices are
                preserved.
              </p>
            ) : null}
            <ul {...stylex.props(ui.list)} aria-label={`${category} list`}>
              {isTools
                ? visibleTools.map((tool) => (
                    <li key={tool.name} {...stylex.props(ui.row)}>
                      <div {...stylex.props(ui.rowCopy)}>
                        <strong {...stylex.props(ui.rowTitle)}>
                          {tool.name}
                        </strong>
                        <span
                          title={tool.description}
                          {...stylex.props(ui.rowDescription)}
                        >
                          {tool.description}
                        </span>
                        {tools.data?.allowed.includes(tool.name) ? null : (
                          <span {...stylex.props(ui.hint)}>
                            Blocked by global tool restrictions.{" "}
                            <a href="/settings/ai/agent">Review limits</a>
                          </span>
                        )}
                      </div>
                      {profile.readOnly ? (
                        <span
                          {...stylex.props(
                            ui.readOnlyState,
                            allowed.has(tool.name) &&
                              tools.data?.allowed.includes(tool.name) &&
                              ui.enabledState
                          )}
                        >
                          {tools.data?.allowed.includes(tool.name)
                            ? allowed.has(tool.name)
                              ? "Enabled"
                              : "Off"
                            : "Blocked"}
                        </span>
                      ) : (
                        <Switch.Root
                          layout="control-only"
                          aria-label={`Profile tool ${tool.name}`}
                          disabled={
                            busy || !tools.data?.allowed.includes(tool.name)
                          }
                          checked={
                            allowed.has(tool.name) &&
                            Boolean(tools.data?.allowed.includes(tool.name))
                          }
                          onCheckedChange={(checked) =>
                            edit(
                              toggleTools(
                                profile.document,
                                [tool.name],
                                checked,
                                tools.data?.allowed ?? []
                              )
                            )
                          }
                        >
                          <Switch.Thumb />
                        </Switch.Root>
                      )}
                    </li>
                  ))
                : visibleProviders.map((item) => (
                    <li key={providerId(item)} {...stylex.props(ui.row)}>
                      <div {...stylex.props(ui.rowCopy)}>
                        <strong {...stylex.props(ui.providerTitle)}>
                          {item.packageId
                            .replace(/^lenso\.agent\./u, "")
                            .replaceAll(/[._-]/gu, " ")}
                        </strong>
                        <span
                          title={providerId(item)}
                          {...stylex.props(ui.rowDescription)}
                        >
                          {providerId(item)}
                        </span>
                        {providerGroup(item) === "Instruction sources" ? (
                          <span {...stylex.props(ui.hint)}>
                            {item.management?.disableable
                              ? "Plugin-provided instructions"
                              : "Required instruction source"}{" "}
                            ·{" "}
                            <a
                              href={`/plugins/${encodeURIComponent(agent.id)}/${encodeURIComponent(item.packageId)}/${encodeURIComponent(item.instanceKey)}`}
                            >
                              View configuration
                            </a>
                          </span>
                        ) : null}
                      </div>
                      {profile.readOnly ? (
                        <span
                          {...stylex.props(
                            ui.readOnlyState,
                            providerEnabled(profile.document, item) &&
                              ui.enabledState
                          )}
                        >
                          {providerEnabled(profile.document, item)
                            ? "Enabled"
                            : "Off"}
                        </span>
                      ) : (
                        <Switch.Root
                          layout="control-only"
                          aria-label={`Profile provider ${providerId(item)}`}
                          disabled={busy || !item.management?.disableable}
                          checked={providerEnabled(profile.document, item)}
                          onCheckedChange={(checked) =>
                            edit(
                              toggleProviders(profile.document, [item], checked)
                            )
                          }
                        >
                          <Switch.Thumb />
                        </Switch.Root>
                      )}
                    </li>
                  ))}
            </ul>
            {resultCount === 0 ? (
              <div {...stylex.props(ui.empty)}>
                <strong {...stylex.props(ui.fieldTitle)}>
                  {search
                    ? "No matching capabilities"
                    : "No capabilities in this category"}
                </strong>
                <p {...stylex.props(ui.hint)}>
                  {search
                    ? "Try another name or choose a different category."
                    : "Installed providers appear here when available."}
                </p>
              </div>
            ) : null}
            {isTools ? (
              <div {...stylex.props(ui.permissionNote)}>
                <span {...stylex.props(ui.hint)}>
                  Agent-wide permissions remain the limit.
                </span>
                {profile.readOnly ||
                profile.document.allowed_tools === null ? null : (
                  <Button
                    variant="ghost"
                    size="compact"
                    disabled={busy || !tools.data}
                    onClick={() =>
                      edit({ ...profile.document, allowed_tools: null })
                    }
                  >
                    Inherit permissions
                  </Button>
                )}
              </div>
            ) : null}
          </section>
          {unknown.length ? (
            <p {...stylex.props(ui.inlineNotice, ui.hint)}>
              References outside the current inventory are preserved:{" "}
              {unknown.join(", ")}. Saving validates their availability.
            </p>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}

function ProfileSelect({
  label,
  value,
  display,
  disabled,
  options,
  onChange,
}: {
  label: string;
  value: string;
  display: string;
  disabled: boolean;
  options: { value: string; label: string; detail: string }[];
  onChange: (value: string) => void;
}) {
  return (
    <Select.Root
      value={value}
      disabled={disabled}
      onValueChange={(next) => {
        if (typeof next === "string") {
          onChange(next);
        }
      }}
    >
      <Select.Trigger aria-label={label} xstyle={ui.selector}>
        <Select.Value>{display}</Select.Value>
        <Select.Icon />
      </Select.Trigger>
      <Select.Portal>
        <Select.Positioner align="start" position="popper">
          <Select.Popup>
            <Select.List>
              {options.map((option) => (
                <Select.Item key={option.value} value={option.value}>
                  <Select.ItemText>
                    {option.label} · {option.detail}
                  </Select.ItemText>
                  <Select.ItemIndicator />
                </Select.Item>
              ))}
            </Select.List>
          </Select.Popup>
        </Select.Positioner>
      </Select.Portal>
    </Select.Root>
  );
}
