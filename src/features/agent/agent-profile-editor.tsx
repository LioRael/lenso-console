import { Button } from "@lenso/ui/button";
import { Select } from "@lenso/ui/select";
import { Switch } from "@lenso/ui/switch";
import { TextField } from "@lenso/ui/text-field";
import * as stylex from "@stylexjs/stylex";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

import type { PluginWorkbenchItem } from "../plugins/plugin-workbench-model";
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
}: {
  agent: AgentIdentity;
  items: readonly PluginWorkbenchItem[];
}) {
  const cache = useQueryClient();
  const key = ["agent-profiles", agent.id];
  const catalog = useQuery({
    queryKey: key,
    queryFn: ({ signal }) =>
      profileRequest<ProfileCatalog>(
        agent.id,
        "control/profiles",
        undefined,
        signal
      ),
    retry: false,
  });
  const tools = useQuery({
    queryKey: ["agent-settings", agent.id, "tool-policy"],
    queryFn: ({ signal }) => readAgentToolPolicy(signal, agent.id),
    retry: false,
  });
  const [selected, setSelected] = useState<string>();
  const [draft, setDraft] = useState<EditableProfile>();
  const [pendingSelection, setPendingSelection] = useState<string>();
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("Tools");
  const [message, setMessage] = useState("");
  const profiles = catalog.data?.profiles ?? [];
  const saved =
    profiles.find(
      (profile) =>
        profile.name === (selected ?? catalog.data?.activeProfile ?? "default")
    ) ?? profiles[0];
  const profile = draft ?? saved;
  const dirty = Boolean(
    draft &&
    (!saved ||
      draft.name !== saved.name ||
      JSON.stringify(draft.document) !== JSON.stringify(saved.document))
  );
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
      setSelected(value.name);
      setDraft(undefined);
      setMessage("Draft saved. Apply when you are ready.");
    },
  });
  const apply = useMutation({
    mutationFn: (value: EditableProfile) =>
      profileRequest(agent.id, "control/profile", {
        profile: value.name === "default" ? null : value.name,
        expectedRevision: value.revision,
      }),
    onSuccess: async () => {
      setMessage(
        "Profile applied. Running turns keep their previous configuration."
      );
      await cache.invalidateQueries({ queryKey: key });
      await cache.invalidateQueries({ queryKey: ["agent-settings", agent.id] });
      await cache.invalidateQueries({
        queryKey: ["agent", agent.id, "plugin-workbench"],
      });
    },
  });
  const busy = save.isPending || apply.isPending;
  const readonly = !profile || profile.readOnly || busy;
  const edit = (document: ProfileDocument) => {
    if (profile && !readonly) {
      setDraft({ ...profile, document });
      setMessage("");
      save.reset();
    }
  };
  const choose = (name: string) => {
    if (dirty) {
      setPendingSelection(name);
    } else {
      setSelected(name);
      setDraft(undefined);
      setMessage("");
      save.reset();
      apply.reset();
    }
  };
  const copy = () => {
    if (!profile) {
      return;
    }
    const stem = `${profile.name.slice(0, 50)}-custom`;
    let name = stem;
    for (
      let index = 2;
      profiles.some((item) => item.name === name);
      index += 1
    ) {
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
    apply.reset();
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
      item.management?.disableable &&
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
  const active = profile?.name === (catalog.data?.activeProfile ?? "default");
  const applied =
    active &&
    (profile?.name === "default" ||
      profile?.revision === catalog.data?.activeRevision);
  const categories = [
    "Tools",
    "Tool providers & MCP",
    "Skills & context",
    "Instruments",
    "Other providers",
  ];
  const visibleProviders = providerItems.filter(
    (item) => providerGroup(item) === category && matches(providerId(item))
  );
  const isTools = category === "Tools";
  const resultCount = isTools ? visibleTools.length : visibleProviders.length;
  const selectedCount = isTools
    ? visibleTools.filter((tool) => allowed.has(tool.name)).length
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
            visibleTools.map((tool) => tool.name),
            enabled,
            tools.data?.allowed ?? []
          )
        : toggleProviders(profile.document, visibleProviders, enabled)
    );
  };
  return (
    <section {...stylex.props(ui.root)} aria-label="Profile editor">
      <header {...stylex.props(ui.sectionHeading)}>
        <h2 {...stylex.props(ui.heading)}>Profiles</h2>
        <p {...stylex.props(ui.muted)}>Choose how this Agent works.</p>
      </header>
      {catalog.isPending ? (
        <output {...stylex.props(ui.empty)}>Loading profiles…</output>
      ) : null}
      {catalog.error ? (
        <p role="alert" {...stylex.props(styles.error)}>
          {catalog.error.message}
        </p>
      ) : null}
      {profile ? (
        <div {...stylex.props(ui.panel)}>
          <div {...stylex.props(ui.profileHeader)}>
            <div {...stylex.props(ui.profileIdentity)}>
              <ProfileSelect
                label="Select Profile"
                value={saved?.name ?? "default"}
                display={draft?.name || saved?.name || "default"}
                disabled={busy}
                options={profiles.map((item) => ({
                  value: item.name,
                  label: item.name,
                  detail: item.readOnly ? "Template" : "Custom",
                }))}
                onChange={choose}
              />
              <span {...stylex.props(ui.badge)}>
                {profile.readOnly
                  ? "Template"
                  : dirty
                    ? "Editing"
                    : applied
                      ? "Applied"
                      : "Draft"}
              </span>
            </div>
            <Button
              variant={profile.readOnly ? "secondary" : "ghost"}
              size="compact"
              disabled={busy || dirty}
              onClick={copy}
            >
              Duplicate Profile
            </Button>
          </div>
          {pendingSelection ? (
            <div {...stylex.props(ui.inlineNotice)} role="alert">
              <span {...stylex.props(ui.muted)}>
                Discard unsaved changes and switch Profile?
              </span>
              <Button
                size="compact"
                variant="ghost"
                onClick={() => setPendingSelection(undefined)}
              >
                Keep editing
              </Button>
              <Button
                size="compact"
                variant="secondary"
                onClick={() => {
                  setSelected(pendingSelection);
                  setDraft(undefined);
                  setPendingSelection(undefined);
                }}
              >
                Discard and switch
              </Button>
            </div>
          ) : null}
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
                    Added to the instructions from enabled providers.
                  </span>
                </label>
              </>
            )}
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
                            Blocked by Agent-wide permissions
                          </span>
                        )}
                      </div>
                      {profile.readOnly ? (
                        <span
                          {...stylex.props(
                            ui.readOnlyState,
                            allowed.has(tool.name) && ui.enabledState
                          )}
                        >
                          {allowed.has(tool.name) ? "Enabled" : "Off"}
                        </span>
                      ) : (
                        <Switch.Root
                          layout="control-only"
                          aria-label={`Profile tool ${tool.name}`}
                          disabled={busy}
                          checked={allowed.has(tool.name)}
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
                          disabled={busy}
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
          {save.error || apply.error ? (
            <p role="alert" {...stylex.props(ui.inlineNotice, styles.error)}>
              {(save.error ?? apply.error)?.message}
            </p>
          ) : null}
          <footer {...stylex.props(ui.footer)}>
            <output {...stylex.props(ui.status)}>
              {busy
                ? apply.isPending
                  ? "Preparing Profile…"
                  : "Validating and saving…"
                : dirty
                  ? "Unsaved changes"
                  : message ||
                    (applied
                      ? "Currently applied"
                      : profile.readOnly
                        ? "Template · Ready to apply"
                        : "Saved · Not yet applied")}
            </output>
            <div {...stylex.props(ui.footerActions)}>
              {profile.readOnly ? null : (
                <>
                  {draft ? (
                    <Button
                      size="compact"
                      variant="ghost"
                      disabled={busy}
                      onClick={() => {
                        setDraft(undefined);
                        save.reset();
                      }}
                    >
                      Reset
                    </Button>
                  ) : null}
                  <Button
                    size="compact"
                    variant={dirty ? "primary" : "secondary"}
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
              {profile.readOnly && applied ? null : (
                <Button
                  size="compact"
                  variant={dirty ? "secondary" : "primary"}
                  disabled={dirty || busy || !profile.revision || applied}
                  onClick={() => apply.mutate(profile)}
                >
                  Apply Profile
                </Button>
              )}
            </div>
          </footer>
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
