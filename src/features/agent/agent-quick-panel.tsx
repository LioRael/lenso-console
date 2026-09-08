import { Button } from "@lenso/ui/button";
import { Dialog } from "@lenso/ui/dialog";
import * as stylex from "@stylexjs/stylex";
import { MousePointer2, X } from "lucide-react";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";

import { useAgentIdentity } from "./agent-identity-context";
import { AgentQuickConversation } from "./agent-quick-conversation";
import { useAgentQuickPanel } from "./agent-quick-panel-context";
import {
  agentQuickPanelStyles as styles,
  chipGroup,
} from "./agent-quick-panel.stylex";

type Entry = {
  id: number;
  agentId: string;
  title: string;
  hasConversation: boolean;
  running: boolean;
  dismissed?: boolean;
  initialDraft?: string;
};

export function AgentQuickPanel({
  onOpenFullPage,
}: {
  onOpenFullPage: (agentId: string, sessionId?: string) => void;
}) {
  const { selectedAgent } = useAgentIdentity();
  const { draftRequest } = useAgentQuickPanel();
  const [entries, setEntries] = useState<Entry[]>([]);
  const [activeId, setActiveId] = useState<number>();
  const [open, setOpen] = useState(false);
  const [host, setHost] = useState<HTMLDivElement | null>(null);
  const [left, setLeft] = useState(0);
  const nextId = useRef(0);
  const mainTrigger = useRef<HTMLButtonElement>(null);
  const anchors = useRef(new Map<number, HTMLElement>());
  const appliedRequest = useRef(0);
  const create = useCallback((agentId: string, initialDraft?: string) => {
    nextId.current += 1;
    const id = nextId.current;
    setEntries((current) => [
      ...current,
      {
        id,
        agentId,
        title: "New chat",
        hasConversation: false,
        running: false,
        ...(initialDraft ? { initialDraft } : {}),
      },
    ]);
    setActiveId(id);
    setOpen(true);
  }, []);
  useEffect(() => {
    if (draftRequest && draftRequest.id !== appliedRequest.current) {
      appliedRequest.current = draftRequest.id;
      create(draftRequest.agentId, draftRequest.draft);
    }
  }, [create, draftRequest]);
  const update = useCallback(
    (id: number, title: string, hasConversation: boolean, running: boolean) => {
      setEntries((current) => {
        const entry = current.find((item) => item.id === id);
        if (!entry) {
          return current;
        }
        if (entry.dismissed && !running) {
          return current.filter((item) => item.id !== id);
        }
        if (
          entry.title === title &&
          entry.hasConversation === hasConversation &&
          entry.running === running
        ) {
          return current;
        }
        return current.map((item) =>
          item.id === id ? { ...item, title, hasConversation, running } : item
        );
      });
    },
    []
  );
  const close = (id: number) => {
    setEntries((current) =>
      current.flatMap((entry) =>
        entry.id === id
          ? entry.running
            ? [{ ...entry, dismissed: true }]
            : []
          : [entry]
      )
    );
    if (activeId === id) {
      setOpen(false);
      setActiveId(undefined);
    }
  };
  const active = entries.find((entry) => entry.id === activeId);
  useLayoutEffect(() => {
    if (!open) {
      return;
    }
    const anchor =
      (active?.hasConversation ? anchors.current.get(active.id) : undefined) ??
      mainTrigger.current;
    if (!anchor) {
      return;
    }
    const position = () => {
      const width = Math.min(400, window.innerWidth - 24);
      setLeft(
        Math.max(
          12,
          Math.min(
            anchor.getBoundingClientRect().right - width,
            window.innerWidth - width - 12
          )
        )
      );
    };
    position();
    const observer = new ResizeObserver(position);
    observer.observe(anchor);
    if (anchor.parentElement?.parentElement) {
      observer.observe(anchor.parentElement.parentElement);
    }
    window.addEventListener("resize", position);
    window.addEventListener("scroll", position, true);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", position);
      window.removeEventListener("scroll", position, true);
    };
  }, [open, active, entries]);
  return (
    <Dialog.Root
      modal={false}
      open={open}
      onOpenChange={(nextOpen, details) => {
        const target =
          details.event instanceof FocusEvent
            ? details.event.relatedTarget
            : details.event.target;
        if (
          !nextOpen &&
          target instanceof Element &&
          target.closest("[data-agent-tray]")
        ) {
          details.cancel();
          return;
        }
        setOpen(nextOpen);
      }}
    >
      {entries
        .filter((entry) => entry.hasConversation && !entry.dismissed)
        .map((entry) => (
          <div
            key={entry.id}
            data-agent-tray=""
            {...stylex.props(chipGroup, styles.chipGroup)}
          >
            <Button
              ref={(node) => {
                if (node) {
                  anchors.current.set(entry.id, node);
                } else {
                  anchors.current.delete(entry.id);
                }
              }}
              aria-label={entry.title}
              aria-expanded={open && activeId === entry.id}
              onClick={() => {
                setActiveId(entry.id);
                setOpen(true);
              }}
              size="compact"
              variant="secondary"
              xstyle={styles.chatChip}
            >
              {entry.title}
            </Button>
            <button
              type="button"
              aria-label={`Close ${entry.title}`}
              onClick={() => close(entry.id)}
              {...stylex.props(styles.chipClose)}
            >
              <X aria-hidden="true" size={12} />
            </button>
          </div>
        ))}
      <Button
        ref={mainTrigger}
        aria-label="Agent"
        data-agent-action="open"
        data-agent-tray=""
        data-open={open || undefined}
        onClick={() => {
          const draft = entries.find(
            (entry) =>
              entry.agentId === selectedAgent.id &&
              !entry.hasConversation &&
              !entry.dismissed
          );
          if (draft) {
            setActiveId(draft.id);
            setOpen(true);
          } else {
            create(selectedAgent.id);
          }
        }}
        size="compact"
        variant="ghost"
        xstyle={[styles.trigger, open && styles.triggerOpen]}
      >
        <MousePointer2 aria-hidden="true" size={14} strokeWidth={1.6} />
        Agent
      </Button>
      <Dialog.Portal className={stylex.props(styles.portal).className}>
        <Dialog.Popup
          xstyle={styles.panel}
          style={{ transform: `translateX(${left}px)` }}
        >
          <div ref={setHost} {...stylex.props(styles.panelContent)} />
        </Dialog.Popup>
      </Dialog.Portal>
      {entries.map((entry) => (
        <Conversation
          key={entry.id}
          entry={entry}
          active={open && entry.id === activeId}
          host={host}
          onMetadata={update}
          onClose={() => close(entry.id)}
          onMinimize={() => setOpen(false)}
          onOpenFullPage={onOpenFullPage}
        />
      ))}
    </Dialog.Root>
  );
}

function Conversation({
  entry,
  onMetadata,
  ...props
}: {
  entry: Entry;
  onMetadata: (
    id: number,
    title: string,
    hasConversation: boolean,
    running: boolean
  ) => void;
} & Omit<
  Parameters<typeof AgentQuickConversation>[0],
  "agentId" | "initialDraft" | "onMetadata"
>) {
  const report = useCallback(
    (title: string, hasConversation: boolean, running: boolean) =>
      onMetadata(entry.id, title, hasConversation, running),
    [entry.id, onMetadata]
  );
  return (
    <AgentQuickConversation
      {...props}
      agentId={entry.agentId}
      initialDraft={entry.initialDraft}
      onMetadata={report}
    />
  );
}
