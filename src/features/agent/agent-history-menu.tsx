import { Menu } from "@lenso/ui/menu";
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
} from "./agent-history-menu-filter";
import { listAgentSessions, type AgentSessionSummary } from "./agent-runtime";

import styles from "./agent-history-menu.module.css";

type HistoryClasses = {
  item?: string | undefined;
  meta?: string | undefined;
  newChat?: string | undefined;
  section?: string | undefined;
};

const emptyHistoryClasses: HistoryClasses = {};

export function AgentHistoryMenu({
  children,
  currentSessionId,
  placement = "utility",
  showNewChat = true,
}: {
  children: ReactNode;
  currentSessionId?: string | undefined;
  placement?: "header" | "utility";
  showNewChat?: boolean;
}) {
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
            className={styles.menu}
            id={menuId}
          >
            <div className={styles.search}>
              <input
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
              classes={{
                item: styles.item,
                meta: styles.meta,
                newChat: styles.newChat,
                section: styles.section,
              }}
              currentSessionId={currentSessionId}
              query={query}
              refreshKey={refreshKey}
              showNewChat={showNewChat}
            />
          </Menu.Popup>
        </Menu.Positioner>
      </Menu.Portal>
    </Menu.Root>
  );
}

export function AgentHistoryItems({
  classes = emptyHistoryClasses,
  currentSessionId,
  query = "",
  refreshKey = 0,
  showNewChat = true,
}: {
  classes?: HistoryClasses;
  currentSessionId?: string | undefined;
  query?: string;
  refreshKey?: number;
  showNewChat?: boolean;
}) {
  const navigate = useNavigate();
  const { data: sessions = [], isPending: loading } = useQuery({
    queryFn: ({ signal }) => listAgentSessions(signal),
    queryKey: ["agent-history", refreshKey],
    retry: false,
  });
  const visibleSessions = filterAgentSessions(sessions, query);
  const today = visibleSessions.filter((session) => isToday(session.updatedAt));
  const earlier = visibleSessions.filter(
    (session) => !isToday(session.updatedAt)
  );
  const emptyLabel = getAgentHistoryEmptyLabel({
    loading,
    query,
    sessionCount: visibleSessions.length,
  });

  return (
    <>
      {showNewChat ? (
        <Menu.Item
          className={classes.newChat}
          onClick={() => navigate({ to: "/" })}
        >
          <Menu.Leading>
            <Plus aria-hidden="true" size={14} strokeWidth={1.7} />
          </Menu.Leading>
          <Menu.Label>New chat</Menu.Label>
        </Menu.Item>
      ) : null}
      {today.length > 0 ? (
        <HistorySection
          classes={classes}
          currentSessionId={currentSessionId}
          label="Today"
          sessions={today}
        />
      ) : null}
      {earlier.length > 0 ? (
        <HistorySection
          classes={classes}
          currentSessionId={currentSessionId}
          label="Earlier"
          sessions={earlier}
        />
      ) : null}
      {emptyLabel ? <div className={styles.empty}>{emptyLabel}</div> : null}
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
  classes,
  currentSessionId,
  label,
  sessions,
}: {
  classes: HistoryClasses;
  currentSessionId: string | undefined;
  label: string;
  sessions: AgentSessionSummary[];
}) {
  const navigate = useNavigate();
  return (
    <>
      <Menu.Separator />
      <div className={classes.section}>{label}</div>
      {sessions.map((session) => {
        const current = session.sessionId === currentSessionId;
        return (
          <Menu.Item
            className={classes.item}
            data-current={current || undefined}
            key={session.sessionId}
            onClick={() =>
              navigate({
                params: { chatId: session.sessionId },
                to: "/agent/$chatId",
              })
            }
          >
            <Menu.Label>{session.title}</Menu.Label>
            <Menu.Trailing>
              <span className={classes.meta}>
                {current ? <span>Current</span> : null}
                <span>{relativeAge(session.updatedAt)}</span>
              </span>
            </Menu.Trailing>
          </Menu.Item>
        );
      })}
    </>
  );
}

function isToday(value: string) {
  const date = new Date(value);
  const now = new Date();
  return (
    date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth() &&
    date.getDate() === now.getDate()
  );
}

function relativeAge(value: string) {
  const elapsed = Math.max(0, Date.now() - new Date(value).getTime());
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
