import { Menu } from "@lenso/ui/menu";
import { useNavigate } from "@tanstack/react-router";
import { Plus } from "lucide-react";
import { useEffect, useState, type ReactElement, type ReactNode } from "react";

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
}: {
  children: ReactNode;
  currentSessionId?: string | undefined;
  placement?: "header" | "utility";
}) {
  const headerPlacement = placement === "header";
  const [refreshKey, setRefreshKey] = useState(0);
  return (
    <Menu.Root
      onOpenChange={(open) => {
        if (open) {
          setRefreshKey((current) => current + 1);
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
          <Menu.Popup aria-label="Chat history" className={styles.menu}>
            <AgentHistoryItems
              classes={{
                item: styles.item,
                meta: styles.meta,
                newChat: styles.newChat,
                section: styles.section,
              }}
              currentSessionId={currentSessionId}
              refreshKey={refreshKey}
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
  refreshKey = 0,
}: {
  classes?: HistoryClasses;
  currentSessionId?: string | undefined;
  refreshKey?: number;
}) {
  const navigate = useNavigate();
  const [sessions, setSessions] = useState<AgentSessionSummary[]>([]);

  useEffect(() => {
    const controller = new AbortController();
    const loadSessions = async () => {
      try {
        setSessions(await listAgentSessions(controller.signal));
      } catch {
        // History remains empty when the selected runtime cannot enumerate Sessions.
      }
    };
    void loadSessions();
    return () => controller.abort();
  }, [refreshKey]);

  const today = sessions.filter((session) => isToday(session.updatedAt));
  const earlier = sessions.filter((session) => !isToday(session.updatedAt));

  return (
    <>
      <Menu.Item
        className={classes.newChat}
        onClick={() => navigate({ to: "/" })}
      >
        <Menu.Leading>
          <Plus aria-hidden="true" size={14} strokeWidth={1.7} />
        </Menu.Leading>
        <Menu.Label>New chat</Menu.Label>
      </Menu.Item>
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
    </>
  );
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
