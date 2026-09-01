import { IconButton } from "@lenso/ui/icon-button";
import { Sidebar } from "@lenso/ui/sidebar";
import * as stylex from "@stylexjs/stylex";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { ChevronLeft, MessageSquarePlus } from "lucide-react";
import { useState } from "react";

import {
  ContextNavigationContent,
  ContextNavigationHeader,
  ContextNavigationItem,
  ContextNavigationSearch,
  ContextNavigationSection,
} from "../../components/runtime/context-navigation";
import { agentContextNavigationStyles as styles } from "./agent-context-navigation.stylex";
import {
  filterAgentSessions,
  getAgentHistoryEmptyLabel,
  groupAgentSessions,
  relativeAgentSessionAge,
} from "./agent-history-menu-filter";
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
  onRequestClose,
}: {
  agentId: AgentId;
  agentLabel: string;
  currentSessionId?: string | undefined;
  onNavigate: () => void;
  onRequestClose: () => void;
}) {
  const navigate = useNavigate();
  const [query, setQuery] = useState("");
  const { data: sessions = [], isPending: loading } = useQuery({
    queryFn: ({ signal }) => listAgentSessions(signal, agentId),
    queryKey: ["agent-history", agentId],
    retry: false,
  });
  const visibleSessions = filterAgentSessions(sessions, query);
  const { earlier, today } = groupAgentSessions(visibleSessions);
  const emptyLabel = getAgentHistoryEmptyLabel({
    loading,
    query,
    sessionCount: visibleSessions.length,
  });
  const openNewChat = () => {
    onNavigate();
    navigate({
      params: { agentId, chatId: "new-task" },
      to: "/agent/$agentId/$chatId",
    });
  };

  return (
    <>
      <ContextNavigationHeader title={agentLabel}>
        <IconButton
          aria-label="New chat"
          onClick={openNewChat}
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
      <ContextNavigationContent>
        <div {...stylex.props(styles.stickyActions)}>
          <ContextNavigationSearch
            aria-label="Search chats"
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search chats…"
            value={query}
          />
          <Sidebar.Menu aria-label="Agent actions">
            <Sidebar.MenuItem>
              <ContextNavigationItem
                icon={<MessageSquarePlus size={14} strokeWidth={1.7} />}
                onClick={openNewChat}
                selected={currentSessionId === undefined}
              >
                New chat
              </ContextNavigationItem>
            </Sidebar.MenuItem>
          </Sidebar.Menu>
        </div>
        <SessionSection
          agentId={agentId}
          currentSessionId={currentSessionId}
          label="Today"
          onNavigate={onNavigate}
          sessions={today}
        />
        <SessionSection
          agentId={agentId}
          currentSessionId={currentSessionId}
          label="Earlier"
          onNavigate={onNavigate}
          sessions={earlier}
        />
        {loading ? <p {...stylex.props(styles.empty)}>Loading chats…</p> : null}
        {emptyLabel ? (
          <p {...stylex.props(styles.empty)}>{emptyLabel}</p>
        ) : null}
      </ContextNavigationContent>
    </>
  );
}

function SessionSection({
  agentId,
  currentSessionId,
  label,
  onNavigate,
  sessions,
}: {
  agentId: AgentId;
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
                  params: { agentId, chatId: session.sessionId },
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
    </ContextNavigationSection>
  );
}
