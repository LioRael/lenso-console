import type { AgentSessionSummary } from "./agent-runtime";

export function filterAgentSessions(
  sessions: AgentSessionSummary[],
  query: string
) {
  const normalizedQuery = query.trim().toLocaleLowerCase();
  if (!normalizedQuery) {
    return sessions;
  }
  return sessions.filter((session) =>
    session.title.toLocaleLowerCase().includes(normalizedQuery)
  );
}

export function getAgentHistoryEmptyLabel({
  loading,
  query,
  sessionCount,
}: {
  loading: boolean;
  query: string;
  sessionCount: number;
}) {
  if (loading || sessionCount > 0) {
    return null;
  }
  return query.trim() ? "No chats found" : "No chat history yet";
}
