import { Menu } from "@lenso/ui/menu";
import * as stylex from "@stylexjs/stylex";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { Plus } from "lucide-react";
import {
  useId,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactElement,
  type ReactNode,
} from "react";

import {
  filterAgentSessions,
  getAgentHistoryEmptyLabel,
  groupAgentSessions,
  relativeAgentSessionAge,
} from "./agent-history-menu-filter";
import { agentHistoryMenuStyles as styles } from "./agent-history-menu.stylex";
import { useAgentIdentity } from "./agent-identity-context";
import {
  listAgentSessions,
  type AgentSessionSummary,
  type AgentId,
} from "./agent-runtime";

export function AgentHistoryMenu({
  agentId,
  children,
  currentSessionId,
  placement = "utility",
  showNewChat = true,
}: {
  agentId?: AgentId;
  children: ReactNode;
  currentSessionId?: string | undefined;
  placement?: "header" | "utility";
  showNewChat?: boolean;
}) {
  const { selectedAgent } = useAgentIdentity();
  const headerPlacement = placement === "header";
  const menuId = useId();
  const [refreshKey, setRefreshKey] = useState(0);
  const [query, setQuery] = useState("");
  const searchInput = useRef<HTMLInputElement>(null);
  return (
    <Menu.Root
      onOpenChange={(open) => {
        if (open) {
          setQuery("");
          setRefreshKey((current) => current + 1);
          requestAnimationFrame(() => searchInput.current?.focus());
        }
      }}
    >
      <Menu.Trigger render={children as ReactElement} />
      <Menu.Portal>
        <Menu.Positioner
          align={headerPlacement ? "start" : "end"}
          alignOffset={headerPlacement ? 8.5 : 0}
          side={headerPlacement ? "bottom" : "top"}
          sideOffset={headerPlacement ? 3.5 : 6}
        >
          <Menu.Popup
            aria-label="Chat history"
            id={menuId}
            xstyle={styles.menu}
          >
            <div {...stylex.props(styles.search)}>
              <input
                {...stylex.props(styles.searchInput)}
                aria-autocomplete="list"
                aria-controls={menuId}
                aria-expanded="true"
                aria-haspopup="menu"
                aria-label="Search chat history"
                autoComplete="off"
                onChange={(event) => setQuery(event.target.value)}
                onKeyDown={focusFirstHistoryItem}
                placeholder="Chat history"
                ref={searchInput}
                role="combobox"
                type="search"
                value={query}
              />
            </div>
            <AgentHistoryItems
              currentSessionId={currentSessionId}
              query={query}
              refreshKey={refreshKey}
              showNewChat={showNewChat}
              targetId={agentId ?? selectedAgent.id}
            />
          </Menu.Popup>
        </Menu.Positioner>
      </Menu.Portal>
    </Menu.Root>
  );
}

export function AgentHistoryItems({
  currentSessionId,
  query = "",
  refreshKey = 0,
  showNewChat = true,
  targetId = "console",
}: {
  currentSessionId?: string | undefined;
  query?: string;
  refreshKey?: number;
  showNewChat?: boolean;
  targetId?: AgentId;
}) {
  const navigate = useNavigate();
  const { data: sessions = [], isPending: loading } = useQuery({
    queryFn: ({ signal }) => listAgentSessions(signal, targetId),
    queryKey: ["agent-history", targetId, refreshKey],
    retry: false,
  });
  const visibleSessions = filterAgentSessions(sessions, query);
  const { earlier, today } = groupAgentSessions(visibleSessions);
  const emptyLabel = getAgentHistoryEmptyLabel({
    loading,
    query,
    sessionCount: visibleSessions.length,
  });

  return (
    <>
      {showNewChat ? (
        <>
          <Menu.Item
            onClick={() =>
              navigate({
                params: { agentId: targetId, chatId: "new-task" },
                to: "/agent/$agentId/$chatId",
              })
            }
            xstyle={[styles.item, styles.newChat]}
          >
            <Menu.Leading>
              <Plus aria-hidden="true" size={14} strokeWidth={1.7} />
            </Menu.Leading>
            <Menu.Label>New chat</Menu.Label>
          </Menu.Item>
          <Menu.Separator />
        </>
      ) : null}
      {today.length > 0 ? (
        <HistorySection
          agentId={targetId}
          currentSessionId={currentSessionId}
          label="Today"
          sessions={today}
        />
      ) : null}
      {earlier.length > 0 ? (
        <>
          {today.length > 0 ? <Menu.Separator /> : null}
          <HistorySection
            agentId={targetId}
            currentSessionId={currentSessionId}
            label="Earlier"
            sessions={earlier}
          />
        </>
      ) : null}
      {emptyLabel ? (
        <div {...stylex.props(styles.empty)}>{emptyLabel}</div>
      ) : null}
    </>
  );
}

function focusFirstHistoryItem(event: KeyboardEvent<HTMLInputElement>) {
  if (event.key === "ArrowDown") {
    event.preventDefault();
    event.currentTarget
      .closest('[role="menu"]')
      ?.querySelector<HTMLElement>('[role="menuitem"]')
      ?.focus();
    return;
  }
  if (event.key !== "Escape") {
    event.stopPropagation();
  }
}

function HistorySection({
  agentId,
  currentSessionId,
  label,
  sessions,
}: {
  agentId: AgentId;
  currentSessionId: string | undefined;
  label: string;
  sessions: AgentSessionSummary[];
}) {
  const navigate = useNavigate();
  return (
    <>
      <div {...stylex.props(styles.section)}>{label}</div>
      {sessions.map((session) => {
        const current = session.sessionId === currentSessionId;
        return (
          <Menu.Item
            data-current={current || undefined}
            key={session.sessionId}
            onClick={() =>
              navigate({
                params: { agentId, chatId: session.sessionId },
                to: "/agent/$agentId/$chatId",
              })
            }
            xstyle={styles.item}
          >
            <Menu.Label>{session.title}</Menu.Label>
            <Menu.Trailing>
              <span {...stylex.props(styles.meta)}>
                {current ? (
                  <span {...stylex.props(styles.metaCurrent)}>Current</span>
                ) : null}
                <span>{relativeAgentSessionAge(session.updatedAt)}</span>
              </span>
            </Menu.Trailing>
          </Menu.Item>
        );
      })}
    </>
  );
}
