import { describe, expect, it } from "vitest";

import {
  filterAgentSessions,
  getAgentHistoryEmptyLabel,
  groupAgentSessions,
  relativeAgentSessionAge,
} from "./agent-history-menu-filter";
import type { AgentSessionSummary } from "./agent-runtime";

const sessions: AgentSessionSummary[] = [
  {
    revision: "1",
    sessionId: "one",
    title: "Intro message",
    updatedAt: "2026-08-29T01:00:00Z",
  },
  {
    revision: "2",
    sessionId: "two",
    title: "Reply with hello",
    updatedAt: "2026-08-28T01:00:00Z",
  },
];

describe("filterAgentSessions", () => {
  it("keeps all sessions for an empty query", () => {
    expect(filterAgentSessions(sessions, "   ")).toEqual(sessions);
  });

  it("filters session titles without case sensitivity", () => {
    expect(filterAgentSessions(sessions, "HELLO")).toEqual([sessions[1]]);
  });
});

describe("getAgentHistoryEmptyLabel", () => {
  it("shows a dedicated empty state after an empty history loads", () => {
    expect(
      getAgentHistoryEmptyLabel({ loading: false, query: "", sessionCount: 0 })
    ).toBe("No chat history yet");
  });

  it("does not flash the empty state while loading or when sessions exist", () => {
    expect(
      getAgentHistoryEmptyLabel({ loading: true, query: "", sessionCount: 0 })
    ).toBeNull();
    expect(
      getAgentHistoryEmptyLabel({ loading: false, query: "", sessionCount: 1 })
    ).toBeNull();
  });

  it("uses search-specific copy when no title matches", () => {
    expect(
      getAgentHistoryEmptyLabel({
        loading: false,
        query: "missing",
        sessionCount: 0,
      })
    ).toBe("No chats found");
  });
});

describe("groupAgentSessions", () => {
  it("separates sessions by the current local day", () => {
    expect(
      groupAgentSessions(sessions, new Date("2026-08-29T12:00:00Z"))
    ).toEqual({ earlier: [sessions[1]], today: [sessions[0]] });
  });
});

describe("relativeAgentSessionAge", () => {
  it("formats recent session age without unstable wall-clock time", () => {
    const now = new Date("2026-08-29T03:30:00Z").getTime();
    expect(relativeAgentSessionAge(sessions[0]?.updatedAt ?? "", now)).toBe(
      "2h"
    );
  });
});
