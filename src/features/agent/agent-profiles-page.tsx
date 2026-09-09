import { Button } from "@lenso/ui/button";
import { Menu } from "@lenso/ui/menu";
import { TextField } from "@lenso/ui/text-field";
import * as stylex from "@stylexjs/stylex";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useBlocker, useNavigate } from "@tanstack/react-router";
import { Ellipsis } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { useConsoleTranslation } from "../../app/console-i18n";
import { usePluginWorkbench } from "../plugins/use-plugin-workbench";
import { SettingsPageHeader } from "../settings/settings-page-header";
import { settingsPageStyles as pageStyles } from "../settings/settings-page.stylex";
import { useAgentIdentity } from "./agent-identity-context";
import { AgentProfileEditor } from "./agent-profile-editor";
import {
  profileRequest,
  type EditableProfile,
  type ProfileCatalog,
} from "./agent-profile-model";
import { profilesPageStyles as styles } from "./agent-profiles-page.stylex";
import {
  AGENT_PLUGIN_CONFIGURATION_CAPABILITY,
  type AgentIdentity,
} from "./agent-runtime";
import { AgentPicker } from "./agent-settings-page";

export function AgentProfilesPage() {
  const t = useConsoleTranslation();

  const { selectedAgent: agent } = useAgentIdentity();
  return (
    <main {...stylex.props(pageStyles.page)}>
      <div {...stylex.props(pageStyles.column)}>
        <SettingsPageHeader
          title={t("Profiles")}
          description={t(
            "Saved instructions and capabilities. Edit a Profile, then choose when your Agent uses it."
          )}
          actions={<AgentPicker />}
        />
        <ProfileList key={agent.id} agent={agent} />
      </div>
    </main>
  );
}

function ProfileList({ agent }: { agent: AgentIdentity }) {
  const t = useConsoleTranslation();

  const [search, setSearch] = useState("");
  const navigate = useNavigate();
  const cache = useQueryClient();
  const key = ["agent-profiles", agent.id];
  const canManage = agent.capabilities.includes(
    AGENT_PLUGIN_CONFIGURATION_CAPABILITY
  );
  const query = useQuery({
    queryKey: key,
    queryFn: ({ signal }) =>
      profileRequest<ProfileCatalog>(
        agent.id,
        "control/profiles",
        undefined,
        signal
      ),
    enabled: canManage,
    retry: false,
  });
  const apply = useMutation({
    mutationFn: (profile: EditableProfile) =>
      profileRequest(agent.id, "control/profile", {
        profile: profile.name === "default" ? null : profile.name,
        expectedRevision: profile.revision,
      }),
    onSuccess: async () => {
      await cache.invalidateQueries({ queryKey: key });
      await cache.invalidateQueries({ queryKey: ["agent", agent.id] });
      await cache.invalidateQueries({ queryKey: ["agent-settings", agent.id] });
    },
  });
  const visibleProfiles =
    query.data?.profiles
      .filter((profile) =>
        `${profile.name} ${profile.document.description}`
          .toLowerCase()
          .includes(search.trim().toLowerCase())
      )
      .toSorted(
        (left, right) => Number(right.readOnly) - Number(left.readOnly)
      ) ?? [];
  if (!canManage) {
    return (
      <p {...stylex.props(styles.description)}>
        {t("This Agent does not support Profile management.")}
      </p>
    );
  }
  return (
    <>
      <div {...stylex.props(styles.toolbar)}>
        <TextField.Root size="compact" xstyle={styles.search}>
          <TextField.Control
            type="search"
            aria-label={t("Search profiles")}
            placeholder={t("Search profiles…")}
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </TextField.Root>
        <Button
          size="compact"
          variant="secondary"
          xstyle={styles.createButton}
          disabled={!query.data || apply.isPending}
          nativeButton={false}
          render={
            <Link
              to="/settings/profiles/$agentId/$profileName"
              params={{ agentId: agent.id, profileName: "default" }}
              search={{ copy: true }}
            />
          }
        >
          {t("New Profile")}
        </Button>
      </div>
      {query.data ? (
        <p {...stylex.props(styles.activeContext)}>
          <span>
            {t("{agent} is using {profile}.", {
              agent: agent.label,
              profile: query.data.activeProfile ?? "default",
            })}
          </span>
          <span>{t("Switching applies to new turns.")}</span>
        </p>
      ) : null}
      {query.isPending ? (
        <output {...stylex.props(styles.empty)}>
          {t("Loading profiles…")}
        </output>
      ) : null}
      {query.error ? (
        <div role="alert" {...stylex.props(styles.empty)}>
          <strong>{t("Profiles unavailable")}</strong>
          <span>{query.error.message}</span>
          <Button
            size="compact"
            variant="secondary"
            onClick={() => void query.refetch()}
          >
            {t("Try again")}
          </Button>
        </div>
      ) : null}
      {apply.error ? (
        <p role="alert" {...stylex.props(styles.description)}>
          {apply.error.message}
        </p>
      ) : null}
      {apply.isSuccess ? (
        <output {...stylex.props(styles.description)}>
          {t(
            "Profile selected. Running turns keep their previous configuration."
          )}
        </output>
      ) : null}
      {query.data && search.trim() ? (
        <p {...stylex.props(styles.resultCount)}>
          {t(
            visibleProfiles.length === 1
              ? "{count} profile"
              : "{count} profiles",
            { count: visibleProfiles.length }
          )}
        </p>
      ) : null}
      {query.data && visibleProfiles.length === 0 ? (
        <div {...stylex.props(styles.empty)}>
          <strong>
            {t(search.trim() ? "No matching profiles" : "No profiles yet")}
          </strong>
          <span>
            {search.trim()
              ? t("Try a different name or clear your search.")
              : t("Create a Profile to save instructions and capabilities.")}
          </span>
          {search.trim() ? (
            <Button
              size="compact"
              variant="ghost"
              onClick={() => setSearch("")}
            >
              {t("Clear search")}
            </Button>
          ) : null}
        </div>
      ) : null}
      {visibleProfiles.length > 0 ? (
        <ul {...stylex.props(styles.list)}>
          {visibleProfiles.map((profile) => {
            const current =
              profile.name === (query.data?.activeProfile ?? "default");
            const applied =
              current &&
              (profile.name === "default" ||
                profile.revision === query.data?.activeRevision);
            return (
              <li key={profile.name} {...stylex.props(styles.row)}>
                <Link
                  {...stylex.props(styles.profileLink)}
                  title={t(
                    profile.readOnly ? "Built-in Profile" : "Custom Profile"
                  )}
                  to="/settings/profiles/$agentId/$profileName"
                  params={{ agentId: agent.id, profileName: profile.name }}
                  search={{ copy: false }}
                >
                  <span {...stylex.props(styles.nameRow)}>
                    <strong {...stylex.props(styles.name)}>
                      {profile.name}
                    </strong>
                    <span {...stylex.props(styles.metadata)}>
                      {t(profile.readOnly ? "Built-in" : "Custom")}
                      {profile.document.model
                        ? ` · ${profile.document.model}`
                        : ""}
                    </span>
                  </span>
                  <span {...stylex.props(styles.description)}>
                    {profile.document.description ||
                      (profile.readOnly
                        ? t("Built-in instructions and capabilities.")
                        : t("Custom instructions and capabilities."))}
                  </span>
                </Link>
                <div {...stylex.props(styles.actions)}>
                  {current ? (
                    <span {...stylex.props(styles.current)}>
                      {t(applied ? "In use" : "Update available")}
                    </span>
                  ) : null}
                  {apply.isPending && apply.variables.name === profile.name ? (
                    <span {...stylex.props(styles.current)}>
                      {t("Preparing…")}
                    </span>
                  ) : null}
                  <Menu.Root>
                    <Menu.Trigger
                      render={
                        <Button
                          size="compact"
                          variant="ghost"
                          aria-label={t("Actions for {profile}", {
                            profile: profile.name,
                          })}
                        >
                          <Ellipsis size={14} aria-hidden="true" />
                        </Button>
                      }
                    />
                    <Menu.Portal>
                      <Menu.Positioner align="end" sideOffset={4}>
                        <Menu.Popup>
                          <Menu.Item
                            aria-label={t("Duplicate {profile}", {
                              profile: profile.name,
                            })}
                            onClick={() =>
                              void navigate({
                                to: "/settings/profiles/$agentId/$profileName",
                                params: {
                                  agentId: agent.id,
                                  profileName: profile.name,
                                },
                                search: { copy: true },
                              })
                            }
                          >
                            {t("Duplicate")}
                          </Menu.Item>
                          <Menu.Item
                            disabled={applied || apply.isPending}
                            aria-label={t("Use {profile}", {
                              profile: profile.name,
                            })}
                            onClick={() => apply.mutate(profile)}
                          >
                            {t("Use for {agent}", { agent: agent.label })}
                          </Menu.Item>
                        </Menu.Popup>
                      </Menu.Positioner>
                    </Menu.Portal>
                  </Menu.Root>
                </div>
              </li>
            );
          })}
        </ul>
      ) : null}
    </>
  );
}

export function AgentProfileDetailPage({
  agentId,
  profileName,
  copy,
}: {
  agentId: string;
  profileName: string;
  copy: boolean;
}) {
  const t = useConsoleTranslation();

  const { agents, selectedAgent, selectAgent } = useAgentIdentity();
  const agent = agents.find((item) => item.id === agentId);
  useEffect(() => {
    if (agent && selectedAgent.id !== agent.id) {
      selectAgent(agent.id);
    }
  }, [agent, selectedAgent.id, selectAgent]);
  const dirty = useRef(false);
  const navigate = useNavigate();
  const blocker = useBlocker({
    shouldBlockFn: () => dirty.current,
    enableBeforeUnload: () => dirty.current,
    withResolver: true,
  });
  const query = useQuery({
    queryKey: ["agent-profiles", agentId],
    queryFn: ({ signal }) =>
      profileRequest<ProfileCatalog>(
        agentId,
        "control/profiles",
        undefined,
        signal
      ),
    enabled: Boolean(agent),
    retry: false,
  });
  const workbench = usePluginWorkbench(
    agentId,
    Boolean(agent?.capabilities.includes(AGENT_PLUGIN_CONFIGURATION_CAPABILITY))
  );
  const profile = query.data?.profiles.find(
    (item) => item.name === profileName
  );
  let initialProfile = profile;
  if (profile && copy) {
    const stem = `${profile.name.slice(0, 50)}-custom`;
    let name = stem;
    for (
      let index = 2;
      query.data?.profiles.some((item) => item.name === name);
      index += 1
    ) {
      name = `${stem}-${index}`;
    }
    initialProfile = {
      ...profile,
      name,
      revision: "",
      readOnly: false,
      document: structuredClone(profile.document),
    };
  }
  return (
    <main {...stylex.props(pageStyles.page)}>
      <div {...stylex.props(pageStyles.column)}>
        <div {...stylex.props(styles.breadcrumb)}>
          <Link to="/settings/profiles">{t("Profiles")}</Link>
          <span>{agent?.label ?? agentId}</span>
        </div>
        {blocker.status === "blocked" ? (
          <div role="alert" {...stylex.props(styles.guard)}>
            <span>{t("Discard unsaved changes and leave this Profile?")}</span>
            <Button
              size="compact"
              variant="ghost"
              onClick={() => blocker.reset()}
            >
              {t("Keep editing")}
            </Button>
            <Button
              size="compact"
              onClick={() => {
                dirty.current = false;
                blocker.proceed();
              }}
            >
              {t("Discard and leave")}
            </Button>
          </div>
        ) : null}
        {query.error ? <p role="alert">{query.error.message}</p> : null}
        {agent && query.isPending ? (
          <output>{t("Loading Profile…")}</output>
        ) : null}
        {agent ? null : (
          <p role="alert">
            {t(
              "This Agent is unavailable. Return to Profiles to choose an Agent."
            )}
          </p>
        )}
        {query.data && !profile ? (
          <p role="alert">
            {t(
              "This Profile could not be found. Return to Profiles to choose another."
            )}
          </p>
        ) : null}
        {workbench.isError ? (
          <p role="alert">
            {t(
              "Provider inventory could not be loaded. Existing choices are preserved."
            )}
          </p>
        ) : null}
        {agent && initialProfile ? (
          <AgentProfileEditor
            key={`${agentId}/${profileName}/${copy}`}
            agent={agent}
            items={workbench.data?.items ?? []}
            initialProfile={initialProfile}
            existingNames={query.data?.profiles.map((item) => item.name) ?? []}
            onDirtyChange={(value) => {
              dirty.current = value;
            }}
            onSaved={(saved) => {
              dirty.current = false;
              if (copy || saved.name !== profileName) {
                void navigate({
                  to: "/settings/profiles/$agentId/$profileName",
                  params: { agentId, profileName: saved.name },
                  search: { copy: false },
                  replace: true,
                });
              }
            }}
          />
        ) : null}
      </div>
    </main>
  );
}
