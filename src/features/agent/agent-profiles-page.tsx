import { Button } from "@lenso/ui/button";
import * as stylex from "@stylexjs/stylex";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useBlocker, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef } from "react";

import { usePluginWorkbench } from "../plugins/use-plugin-workbench";
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
  const { selectedAgent: agent } = useAgentIdentity();
  return (
    <main {...stylex.props(pageStyles.page)}>
      <div {...stylex.props(styles.page)}>
        <header {...stylex.props(styles.header)}>
          <div>
            <h1 {...stylex.props(styles.title)}>Profiles</h1>
            <p {...stylex.props(styles.description)}>
              Reusable instructions and capabilities for your Agent.
            </p>
          </div>
          <AgentPicker />
        </header>
        <ProfileList key={agent.id} agent={agent} />
      </div>
    </main>
  );
}

function ProfileList({ agent }: { agent: AgentIdentity }) {
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
  if (!canManage) {
    return (
      <p {...stylex.props(styles.description)}>
        This Agent does not support Profile management.
      </p>
    );
  }
  return (
    <>
      <div {...stylex.props(styles.toolbar)}>
        <span {...stylex.props(styles.description)}>
          {query.data?.profiles.length ?? 0} profiles
        </span>
        <Button
          size="compact"
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
          New Profile
        </Button>
      </div>
      {query.isPending ? <output>Loading profiles…</output> : null}
      {query.error || apply.error ? (
        <p role="alert">{(query.error ?? apply.error)?.message}</p>
      ) : null}
      {apply.isSuccess ? (
        <output {...stylex.props(styles.description)}>
          Profile selected. Running turns keep their previous configuration.
        </output>
      ) : null}
      <ul {...stylex.props(styles.list)}>
        {query.data?.profiles.map((profile) => {
          const current =
            profile.name === (query.data.activeProfile ?? "default");
          const applied =
            current &&
            (profile.name === "default" ||
              profile.revision === query.data.activeRevision);
          return (
            <li key={profile.name} {...stylex.props(styles.row)}>
              <Link
                {...stylex.props(styles.profileLink)}
                to="/settings/profiles/$agentId/$profileName"
                params={{ agentId: agent.id, profileName: profile.name }}
                search={{ copy: false }}
              >
                <span {...stylex.props(styles.nameRow)}>
                  <strong {...stylex.props(styles.name)}>{profile.name}</strong>
                  <span {...stylex.props(styles.badge)}>
                    {profile.readOnly ? "Built-in" : "Custom"}
                  </span>
                  {current ? (
                    <span {...stylex.props(styles.badge)}>
                      {applied ? "Current" : "Update available"}
                    </span>
                  ) : null}
                </span>
                <span {...stylex.props(styles.description)}>
                  {profile.document.description || "No description"}
                </span>
              </Link>
              <div {...stylex.props(styles.actions)}>
                <Button
                  size="compact"
                  variant="ghost"
                  aria-label={`Duplicate ${profile.name}`}
                  nativeButton={false}
                  render={
                    <Link
                      to="/settings/profiles/$agentId/$profileName"
                      params={{ agentId: agent.id, profileName: profile.name }}
                      search={{ copy: true }}
                    />
                  }
                >
                  Duplicate
                </Button>
                <Button
                  size="compact"
                  variant="secondary"
                  disabled={applied || apply.isPending}
                  aria-label={`Use ${profile.name}`}
                  onClick={() => apply.mutate(profile)}
                >
                  {apply.isPending && apply.variables.name === profile.name
                    ? "Preparing…"
                    : applied
                      ? "In use"
                      : "Use Profile"}
                </Button>
              </div>
            </li>
          );
        })}
      </ul>
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
      <div {...stylex.props(styles.page)}>
        <div {...stylex.props(styles.breadcrumb)}>
          <Link to="/settings/profiles">Profiles</Link>
          <span>{agent?.label ?? agentId}</span>
        </div>
        {blocker.status === "blocked" ? (
          <div role="alert" {...stylex.props(styles.guard)}>
            <span>Discard unsaved changes and leave this Profile?</span>
            <Button
              size="compact"
              variant="ghost"
              onClick={() => blocker.reset()}
            >
              Keep editing
            </Button>
            <Button
              size="compact"
              onClick={() => {
                dirty.current = false;
                blocker.proceed();
              }}
            >
              Discard and leave
            </Button>
          </div>
        ) : null}
        {query.error ? <p role="alert">{query.error.message}</p> : null}
        {agent && query.isPending ? <output>Loading Profile…</output> : null}
        {agent ? null : (
          <p role="alert">
            This Agent is unavailable. Return to Profiles to choose an Agent.
          </p>
        )}
        {query.data && !profile ? (
          <p role="alert">
            This Profile could not be found. Return to Profiles to choose
            another.
          </p>
        ) : null}
        {workbench.isError ? (
          <p role="alert">
            Provider inventory could not be loaded. Existing choices are
            preserved.
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
