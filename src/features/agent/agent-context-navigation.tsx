import { IconButton } from "@lenso/ui/icon-button";
import { Sidebar } from "@lenso/ui/sidebar";
import * as stylex from "@stylexjs/stylex";
import { useQuery } from "@tanstack/react-query";
import { useNavigate, useSearch } from "@tanstack/react-router";
import {
  ChevronLeft,
  Folder,
  LayoutGrid,
  MessageCircle,
  PanelLeft,
  Plus,
  PanelsTopLeft,
  Sparkles,
} from "lucide-react";
import { useState } from "react";

import {
  ContextNavigationContent,
  ContextNavigationItem,
  ContextNavigationSearch,
  ContextNavigationSection,
} from "../../components/runtime/context-navigation";
import type { PageMount } from "../extensions/page-contribution-catalog";
import { agentContextNavigationStyles as styles } from "./agent-context-navigation.stylex";
import {
  filterAgentSessions,
  getAgentHistoryEmptyLabel,
} from "./agent-history-menu-filter";
import { listOpenedProjects } from "./agent-projects";
import {
  listAgentSessions,
  type AgentId,
  type AgentSessionSummary,
} from "./agent-runtime";

export function AgentContextNavigation({
  agentId,
  agentLabel,
  currentSessionId,
  onNavigate,
  onOpenWorkspace,
  onRequestClose,
  workspaces,
}: {
  agentId: AgentId;
  agentLabel: string;
  currentSessionId?: string | undefined;
  onNavigate: () => void;
  onOpenWorkspace: (workspace: PageMount) => void;
  onRequestClose: () => void;
  workspaces: readonly PageMount[];
}) {
  const navigate = useNavigate();
  const search = useSearch({ strict: false });
  const projectId = agentId === "app" ? search.project : undefined;
  const [query, setQuery] = useState("");
  const { data: sessions = [], isPending: loading } = useQuery({
    queryFn: ({ signal }) =>
      listAgentSessions(signal, projectId ? { agentId, projectId } : agentId),
    queryKey: ["agent-history", agentId, projectId],
    retry: false,
  });
  const visibleSessions = filterAgentSessions(sessions, query);
  const { data: openedProjects } = useQuery({
    queryKey: ["local-projects", "app"],
    queryFn: listOpenedProjects,
    enabled: agentId === "app",
    retry: false,
  });
  const emptyLabel = getAgentHistoryEmptyLabel({
    loading,
    query,
    sessionCount: visibleSessions.length,
  });
  const welcomeWorkspace = workspaces.find(
    (workspace) =>
      workspace.subject.kind === "console" && workspace.id === "welcome"
  );
  const projectsWorkspace = workspaces.find(
    (workspace) =>
      workspace.subject.kind === "console" && workspace.id === "projects"
  );
  const artifactsWorkspace = workspaces.find(
    (workspace) =>
      workspace.subject.kind === "console" && workspace.id === "artifacts"
  );
  const appsWorkspace = workspaces.find(
    (workspace) =>
      workspace.subject.kind === "console" && workspace.id === "apps"
  );
  const appsDestination =
    appsWorkspace ??
    workspaces.find((workspace) => workspace.subject.kind === "app");
  const openNewChat = () => {
    onNavigate();
    navigate({
      params: { agentId, chatId: "new-task" },
      search: { project: projectId },
      to: "/agent/$agentId/$chatId",
    });
  };

  return (
    <>
      <IconButton
        aria-label="Close workspace navigation"
        onClick={onRequestClose}
        size="default"
        variant="ghost"
        xstyle={styles.mobileClose}
      >
        <ChevronLeft aria-hidden="true" size={14} strokeWidth={1.7} />
      </IconButton>
      <ContextNavigationContent>
        <div {...stylex.props(styles.stickyActions)}>
          <Sidebar.Menu aria-label={`${agentLabel} navigation`}>
            {welcomeWorkspace ? (
              <Sidebar.MenuItem>
                <ContextNavigationItem
                  icon={<Sparkles size={14} strokeWidth={1.7} />}
                  onClick={() => onOpenWorkspace(welcomeWorkspace)}
                >
                  {welcomeWorkspace.navigation.label}
                </ContextNavigationItem>
              </Sidebar.MenuItem>
            ) : null}
            <Sidebar.MenuItem>
              <ContextNavigationItem
                icon={<Plus size={14} strokeWidth={1.7} />}
                onClick={openNewChat}
                selected={currentSessionId === undefined}
              >
                New chat
              </ContextNavigationItem>
            </Sidebar.MenuItem>
            {projectsWorkspace ? (
              <Sidebar.MenuItem>
                <ContextNavigationItem
                  icon={<Folder size={14} strokeWidth={1.7} />}
                  onClick={() => onOpenWorkspace(projectsWorkspace)}
                >
                  {projectsWorkspace.navigation.label}
                </ContextNavigationItem>
              </Sidebar.MenuItem>
            ) : null}
            {artifactsWorkspace ? (
              <Sidebar.MenuItem>
                <ContextNavigationItem
                  icon={<PanelLeft size={14} strokeWidth={1.7} />}
                  onClick={() => onOpenWorkspace(artifactsWorkspace)}
                >
                  {artifactsWorkspace.navigation.label}
                </ContextNavigationItem>
              </Sidebar.MenuItem>
            ) : null}
            {appsDestination ? (
              <Sidebar.MenuItem>
                <ContextNavigationItem
                  icon={<LayoutGrid size={14} strokeWidth={1.7} />}
                  onClick={() => onOpenWorkspace(appsDestination)}
                >
                  Apps
                </ContextNavigationItem>
              </Sidebar.MenuItem>
            ) : null}
            {workspaces
              .filter(
                (workspace) =>
                  workspace.subject.kind === "console" &&
                  workspace !== welcomeWorkspace &&
                  workspace !== projectsWorkspace &&
                  workspace !== artifactsWorkspace &&
                  workspace !== appsWorkspace
              )
              .map((workspace) => (
                <Sidebar.MenuItem
                  key={`${workspace.subject.kind === "app" ? workspace.subject.appId : "console"}:${workspace.id}`}
                >
                  <ContextNavigationItem
                    icon={<PanelsTopLeft size={14} strokeWidth={1.7} />}
                    onClick={() => onOpenWorkspace(workspace)}
                  >
                    {workspace.navigation.label}
                  </ContextNavigationItem>
                </Sidebar.MenuItem>
              ))}
          </Sidebar.Menu>
          {sessions.length > 5 ? (
            <ContextNavigationSearch
              aria-label="Search chats"
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search chats…"
              value={query}
            />
          ) : null}
        </div>
        {agentId === "app" && openedProjects?.projects.length ? (
          <ContextNavigationSection label="Projects">
            <Sidebar.Menu>
              {openedProjects.projects.map((project) => (
                <Sidebar.MenuItem key={project.id}>
                  <ContextNavigationItem
                    icon={<Folder size={14} strokeWidth={1.7} />}
                    onClick={() => {
                      onNavigate();
                      navigate({
                        params: { agentId, chatId: "new-task" },
                        search: { project: project.id },
                        to: "/agent/$agentId/$chatId",
                      });
                    }}
                    selected={project.id === projectId}
                    title={project.path}
                  >
                    {project.path.replace(/\/+$/u, "").split("/").at(-1) ||
                      project.path}
                  </ContextNavigationItem>
                </Sidebar.MenuItem>
              ))}
            </Sidebar.Menu>
          </ContextNavigationSection>
        ) : null}
        <SessionSection
          agentId={agentId}
          currentSessionId={currentSessionId}
          emptyLabel={emptyLabel}
          loading={loading}
          onNavigate={onNavigate}
          sessions={visibleSessions}
        />
      </ContextNavigationContent>
    </>
  );
}

function SessionSection({
  agentId,
  currentSessionId,
  emptyLabel,
  loading,
  onNavigate,
  sessions,
}: {
  agentId: AgentId;
  currentSessionId: string | undefined;
  emptyLabel: string | null;
  loading: boolean;
  onNavigate: () => void;
  sessions: AgentSessionSummary[];
}) {
  const navigate = useNavigate();
  const search = useSearch({ strict: false });
  const projectId = agentId === "app" ? search.project : undefined;
  return (
    <ContextNavigationSection label="Recents">
      <Sidebar.Menu>
        {sessions.map((session) => (
          <Sidebar.MenuItem key={session.sessionId}>
            <ContextNavigationItem
              icon={<MessageCircle size={14} strokeWidth={1.7} />}
              onClick={() => {
                onNavigate();
                navigate({
                  params: { agentId, chatId: session.sessionId },
                  search: { project: projectId },
                  to: "/agent/$agentId/$chatId",
                });
              }}
              selected={session.sessionId === currentSessionId}
            >
              {session.title}
            </ContextNavigationItem>
          </Sidebar.MenuItem>
        ))}
      </Sidebar.Menu>
      {loading ? <p {...stylex.props(styles.empty)}>Loading chats…</p> : null}
      {emptyLabel ? <p {...stylex.props(styles.empty)}>{emptyLabel}</p> : null}
    </ContextNavigationSection>
  );
}
