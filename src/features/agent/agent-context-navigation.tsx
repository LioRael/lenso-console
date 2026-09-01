import { IconButton } from "@lenso/ui/icon-button";
import { Sidebar } from "@lenso/ui/sidebar";
import * as stylex from "@stylexjs/stylex";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { ChevronLeft, MessageSquarePlus, Search } from "lucide-react";
import { useState } from "react";

import {
  ContextNavigationHeader,
  ContextNavigationItem,
  ContextNavigationSection,
} from "../../components/runtime/context-navigation";
import { agentContextNavigationStyles as styles } from "./agent-context-navigation.stylex";
import {
  filterAgentSessions,
  getAgentHistoryEmptyLabel,
  groupAgentSessions,
  relativeAgentSessionAge,
} from "./agent-history-menu-filter";
import { listAgentSessions, type AgentSessionSummary } from "./agent-runtime";
import { useAgentTarget } from "./agent-target-context";

export function AgentContextNavigation({
  currentSessionId,
  onNavigate,
  onRequestClose,
}: {
  currentSessionId?: string | undefined;
  onNavigate: () => void;
  onRequestClose: () => void;
}) {
  const navigate = useNavigate();
  const { selectedTarget } = useAgentTarget();
  const [query, setQuery] = useState("");
  const { data: sessions = [], isPending: loading } = useQuery({
    queryFn: ({ signal }) => listAgentSessions(signal, selectedTarget.id),
    queryKey: ["agent-history", selectedTarget.id],
    retry: false,
  });
  const visibleSessions = filterAgentSessions(sessions, query);
  const { earlier, today } = groupAgentSessions(visibleSessions);
  const emptyLabel = getAgentHistoryEmptyLabel({
    loading,
    query,
    sessionCount: visibleSessions.length,
  });
  const goTo = (to: "/") => {
    onNavigate();
    navigate({ to });
  };

  return (
    <>
      <ContextNavigationHeader title="Agent">
        <IconButton
          aria-label="New chat"
          onClick={() => goTo("/")}
          size="default"
          variant="ghost"
        >
          <MessageSquarePlus aria-hidden="true" size={14} strokeWidth={1.7} />
        </IconButton>
        <IconButton
          aria-label="Close workspace navigation"
          onClick={onRequestClose}
          size="default"
          variant="ghost"
          xstyle={styles.mobileClose}
        >
          <ChevronLeft aria-hidden="true" size={14} strokeWidth={1.7} />
        </IconButton>
      </ContextNavigationHeader>
      <Sidebar.Content xstyle={styles.content}>
        <label {...stylex.props(styles.search)}>
          <Search aria-hidden="true" size={14} strokeWidth={1.7} />
          <input
            {...stylex.props(styles.searchInput)}
            aria-label="Search chats"
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search chats…"
            type="search"
            value={query}
          />
        </label>
        <Sidebar.Menu aria-label="Agent actions">
          <Sidebar.MenuItem>
            <ContextNavigationItem
              icon={<MessageSquarePlus size={14} strokeWidth={1.7} />}
              onClick={() => goTo("/")}
              selected={currentSessionId === undefined}
            >
              New chat
            </ContextNavigationItem>
          </Sidebar.MenuItem>
        </Sidebar.Menu>
        <SessionSection
          currentSessionId={currentSessionId}
          label="Today"
          onNavigate={onNavigate}
          sessions={today}
        />
        <SessionSection
          currentSessionId={currentSessionId}
          label="Earlier"
          onNavigate={onNavigate}
          sessions={earlier}
        />
        {loading ? <p {...stylex.props(styles.empty)}>Loading chats…</p> : null}
        {emptyLabel ? (
          <p {...stylex.props(styles.empty)}>{emptyLabel}</p>
        ) : null}
      </Sidebar.Content>
    </>
  );
}

function SessionSection({
  currentSessionId,
  label,
  onNavigate,
  sessions,
}: {
  currentSessionId: string | undefined;
  label: string;
  onNavigate: () => void;
  sessions: AgentSessionSummary[];
}) {
  const navigate = useNavigate();
  if (sessions.length === 0) {
    return null;
  }
  return (
    <ContextNavigationSection label={label}>
      <Sidebar.Menu>
        {sessions.map((session) => (
          <Sidebar.MenuItem key={session.sessionId}>
            <ContextNavigationItem
              badge={
                <span {...stylex.props(styles.meta)}>
                  {relativeAgentSessionAge(session.updatedAt)}
                </span>
              }
              onClick={() => {
                onNavigate();
                navigate({
                  params: { chatId: session.sessionId },
                  to: "/agent/$chatId",
                });
              }}
              selected={session.sessionId === currentSessionId}
            >
              {session.title}
            </ContextNavigationItem>
          </Sidebar.MenuItem>
        ))}
      </Sidebar.Menu>
    </ContextNavigationSection>
  );
}
