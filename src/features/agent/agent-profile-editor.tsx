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
  return (
    <section {...stylex.props(ui.root)} aria-label="Profile editor">
      <div>
        <h2 {...stylex.props(ui.heading)}>Profiles</h2>
        <p {...stylex.props(styles.description)}>
          Reusable instructions and capability choices for this Agent. Save a
          draft, then apply it explicitly.
        </p>
      </div>
      {catalog.isPending ? <output>Loading profiles…</output> : null}
      {catalog.error ? (
        <p role="alert" {...stylex.props(styles.error)}>
          {catalog.error.message}
        </p>
      ) : null}
      {profile ? (
        <>
          <div {...stylex.props(ui.toolbar)}>
            <Select.Root
              value={saved?.name ?? "default"}
              onValueChange={(value) => {
                if (typeof value === "string") {
                  choose(value);
                }
              }}
              disabled={busy}
            >
              <Select.Trigger aria-label="Select Profile" xstyle={ui.selector}>
                <Select.Value>{saved?.name}</Select.Value>
                <Select.Icon />
              </Select.Trigger>
              <Select.Portal>
                <Select.Positioner align="start" position="popper">
                  <Select.Popup>
                    <Select.List>
                      {profiles.map((item) => (
                        <Select.Item key={item.name} value={item.name}>
                          <Select.ItemText>
                            {item.name}
                            {item.readOnly ? " · Template" : ""}
                          </Select.ItemText>
                          <Select.ItemIndicator />
                        </Select.Item>
                      ))}
                    </Select.List>
                  </Select.Popup>
                </Select.Positioner>
              </Select.Portal>
            </Select.Root>
            <Button
              variant="secondary"
              size="compact"
              disabled={busy || dirty}
              onClick={copy}
            >
              Duplicate Profile
            </Button>
            <span {...stylex.props(ui.status)}>
              {profile.readOnly
                ? "Read-only template · Duplicate to edit"
                : profile.revision
                  ? applied
                    ? "Applied"
                    : "Saved draft"
                  : "New Profile"}
            </span>
          </div>
          {pendingSelection ? (
            <div {...stylex.props(ui.toolbar)} role="alert">
              <span {...stylex.props(styles.description)}>
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
          {save.error || apply.error ? (
            <p role="alert" {...stylex.props(styles.error)}>
              {(save.error ?? apply.error)?.message}
            </p>
          ) : null}
          <div {...stylex.props(ui.footer)}>
            <output {...stylex.props(ui.status, ui.statusStart)}>
              {busy
                ? apply.isPending
                  ? "Preparing Profile…"
                  : "Validating and saving…"
                : dirty
                  ? "Unsaved changes"
                  : message ||
                    (active && !applied
                      ? "A different revision is running."
                      : "")}
            </output>
            <Button
              size="compact"
              variant="ghost"
              disabled={!draft || busy}
              onClick={() => {
                setDraft(undefined);
                save.reset();
              }}
            >
              Reset
            </Button>
            <Button
              size="compact"
              variant="secondary"
              disabled={
                !dirty ||
                readonly ||
                !/^[a-z0-9][a-z0-9_-]{0,63}$/u.test(profile.name)
              }
              onClick={() => save.mutate(profile)}
            >
              Save draft
            </Button>
            <Button
              size="compact"
              disabled={dirty || busy || !profile.revision || applied}
              onClick={() => apply.mutate(profile)}
            >
              Apply Profile
            </Button>
          </div>
          <div {...stylex.props(ui.fields)}>
            {profile.revision ? null : (
              <label htmlFor="profile-name" {...stylex.props(ui.field)}>
                Profile name
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
                <span {...stylex.props(styles.description)}>
                  Lowercase letters, numbers, hyphens or underscores. Up to 64
                  characters.
                </span>
              </label>
            )}
            <label htmlFor="profile-description" {...stylex.props(ui.field)}>
              Description
              <TextField.Root xstyle={ui.input}>
                <TextField.Control
                  id="profile-description"
                  aria-label="Profile description"
                  disabled={readonly}
                  value={profile.document.description}
                  onChange={(event) =>
                    edit({
                      ...profile.document,
                      description: event.target.value,
                    })
                  }
                />
              </TextField.Root>
            </label>
            <label {...stylex.props(ui.field)}>
              Instructions
              <textarea
                {...stylex.props(ui.textarea)}
                aria-label="Profile instructions"
                disabled={readonly}
                value={profile.document.instructions}
                onChange={(event) =>
                  edit({
                    ...profile.document,
                    instructions: event.target.value,
                  })
                }
                placeholder="How should this Agent approach its work?"
              />
            </label>
          </div>
          <TextField.Root xstyle={ui.input}>
            <TextField.Control
              aria-label="Search Profile capabilities"
              type="search"
              placeholder="Search tools and providers…"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
          </TextField.Root>
          <details open {...stylex.props(ui.group)}>
            <summary {...stylex.props(ui.summary)}>
              Tools
              <span {...stylex.props(ui.count)}>
                {allowed.size} selected
                {profile.document.allowed_tools === null ? " · Inherited" : ""}
              </span>
            </summary>
            <div {...stylex.props(styles.toolToolbar)}>
              <span {...stylex.props(styles.description)}>
                Profile choices can only narrow Agent-wide permissions.
              </span>
              <Button
                variant="ghost"
                size="compact"
                disabled={readonly || !tools.data}
                onClick={() =>
                  edit({ ...profile.document, allowed_tools: null })
                }
              >
                Inherit permissions
              </Button>
            </div>
            {tools.error ? (
              <p role="alert" {...stylex.props(styles.notice)}>
                Tool catalog could not be loaded. Existing choices are
                preserved.
              </p>
            ) : null}
            <div {...stylex.props(styles.toolToolbar)}>
              <Button
                variant="ghost"
                size="compact"
                disabled={readonly || !tools.data}
                onClick={() =>
                  edit(
                    toggleTools(
                      profile.document,
                      visibleTools.map((tool) => tool.name),
                      true,
                      tools.data?.allowed ?? []
                    )
                  )
                }
              >
                Enable {search ? "matching" : "all"}
              </Button>
              <Button
                variant="ghost"
                size="compact"
                disabled={readonly || !tools.data}
                onClick={() =>
                  edit(
                    toggleTools(
                      profile.document,
                      visibleTools.map((tool) => tool.name),
                      false,
                      tools.data?.allowed ?? []
                    )
                  )
                }
              >
                Disable {search ? "matching" : "all"}
              </Button>
            </div>
            <ul {...stylex.props(styles.toolList)}>
              {visibleTools.map((tool) => (
                <li key={tool.name} {...stylex.props(styles.row)}>
                  <span {...stylex.props(styles.rowCopy)}>
                    <strong {...stylex.props(styles.rowTitle)}>
                      {tool.name}
                    </strong>
                    <span {...stylex.props(styles.description)}>
                      {tool.description}
                      {tools.data?.allowed.includes(tool.name)
                        ? ""
                        : " · Blocked by Agent-wide permissions"}
                    </span>
                  </span>
                  <Switch.Root
                    layout="control-only"
                    aria-label={`Profile tool ${tool.name}`}
                    disabled={readonly}
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
                </li>
              ))}
            </ul>
            {visibleTools.length === 0 ? (
              <p {...stylex.props(styles.notice)}>
                No matching tools in the current runtime catalog. Provider
                changes are reflected after applying.
              </p>
            ) : null}
          </details>
          {[
            "Tool providers & MCP",
            "Skills & context",
            "Instruments",
            "Other providers",
          ].map((group) => {
            const members = providerItems.filter(
              (item) => providerGroup(item) === group
            );
            const visible = members.filter((item) => matches(providerId(item)));
            return (
              <details key={group} {...stylex.props(ui.group)}>
                <summary {...stylex.props(ui.summary)}>
                  {group}
                  <span {...stylex.props(ui.count)}>
                    {
                      members.filter((item) =>
                        providerEnabled(profile.document, item)
                      ).length
                    }{" "}
                    / {members.length} enabled
                  </span>
                </summary>
                <div {...stylex.props(ui.groupBody)}>
                  <div {...stylex.props(styles.toolToolbar)}>
                    <Button
                      size="compact"
                      variant="ghost"
                      disabled={readonly || !visible.length}
                      onClick={() =>
                        edit(toggleProviders(profile.document, visible, true))
                      }
                    >
                      Enable {search ? "matching" : "all"}
                    </Button>
                    <Button
                      size="compact"
                      variant="ghost"
                      disabled={readonly || !visible.length}
                      onClick={() =>
                        edit(toggleProviders(profile.document, visible, false))
                      }
                    >
                      Disable {search ? "matching" : "all"}
                    </Button>
                  </div>
                  <ul {...stylex.props(styles.toolList)}>
                    {visible.map((item) => (
                      <li key={providerId(item)} {...stylex.props(styles.row)}>
                        <span {...stylex.props(styles.rowCopy)}>
                          <strong {...stylex.props(styles.rowTitle)}>
                            {item.packageId}
                          </strong>
                          <span {...stylex.props(styles.description)}>
                            {item.instanceKey}
                          </span>
                        </span>
                        <Switch.Root
                          layout="control-only"
                          aria-label={`Profile provider ${providerId(item)}`}
                          disabled={readonly}
                          checked={providerEnabled(profile.document, item)}
                          onCheckedChange={(checked) =>
                            edit(
                              toggleProviders(profile.document, [item], checked)
                            )
                          }
                        >
                          <Switch.Thumb />
                        </Switch.Root>
                      </li>
                    ))}
                  </ul>
                  {visible.length ? null : (
                    <p {...stylex.props(styles.notice)}>
                      No matching installed providers.
                    </p>
                  )}
                </div>
              </details>
            );
          })}
          {unknown.length ? (
            <p {...stylex.props(styles.notice)}>
              References outside the current inventory are preserved:{" "}
              {unknown.join(", ")}. Saving validates their availability.
            </p>
          ) : null}
        </>
      ) : null}
    </section>
  );
}
