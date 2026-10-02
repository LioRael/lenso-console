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

export function groupAgentSessions(
  sessions: AgentSessionSummary[],
  now = new Date()
) {
  const today: AgentSessionSummary[] = [];
  const earlier: AgentSessionSummary[] = [];
  for (const session of sessions) {
    if (isSameLocalDay(new Date(session.updatedAt), now)) {
      today.push(session);
    } else {
      earlier.push(session);
    }
  }
  return { earlier, today };
}

export function relativeAgentSessionAge(value: string, now = Date.now()) {
  const elapsed = Math.max(0, now - new Date(value).getTime());
  const minutes = Math.max(1, Math.floor(elapsed / 60_000));
  if (minutes < 60) {
    return `${minutes}min`;
  }
  const hours = Math.floor(minutes / 60);
  if (hours < 24) {
    return `${hours}h`;
  }
  return `${Math.floor(hours / 24)}d`;
}

function isSameLocalDay(left: Date, right: Date) {
  return (
    left.getFullYear() === right.getFullYear() &&
    left.getMonth() === right.getMonth() &&
    left.getDate() === right.getDate()
  );
}
