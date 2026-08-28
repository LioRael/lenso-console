import { Menu } from "@lenso/ui/menu";
import { useNavigate } from "@tanstack/react-router";
import { Plus } from "lucide-react";
import { useEffect, useState, type ReactElement, type ReactNode } from "react";

import { listAgentSessions, type AgentSessionSummary } from "./agent-runtime";

type HistoryClasses = {
  item?: string | undefined;
  meta?: string | undefined;
  newChat?: string | undefined;
  section?: string | undefined;
};

const emptyHistoryClasses: HistoryClasses = {};

export function AgentHistoryMenu({ children }: { children: ReactNode }) {
  return (
    <Menu.Root>
      <Menu.Trigger render={children as ReactElement} />
      <Menu.Portal>
        <Menu.Positioner align="end" side="top" sideOffset={6}>
          <Menu.Popup aria-label="Agent history">
            <AgentHistoryItems />
          </Menu.Popup>
        </Menu.Positioner>
      </Menu.Portal>
    </Menu.Root>
  );
}

export function AgentHistoryItems({
  classes = emptyHistoryClasses,
  currentSessionId,
}: {
  classes?: HistoryClasses;
  currentSessionId?: string | undefined;
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
  }, []);

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
