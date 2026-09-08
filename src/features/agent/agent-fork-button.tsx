import { IconButton } from "@lenso/ui/icon-button";
import * as stylex from "@stylexjs/stylex";
import { GitBranch } from "lucide-react";
import { useRef, useState } from "react";

import { agentMessageControlStyles as styles } from "./agent-message-controls.stylex";
import { forkAgentSession, type AgentTarget } from "./agent-runtime";

export type AgentForkTarget = {
  sessionId: string;
  turnId: string;
  targetId: AgentTarget;
  onFork: (sessionId: string) => void;
};
export function AgentForkButton({ target }: { target: AgentForkTarget }) {
  const operation = useRef<string | undefined>(undefined);
  const pending = useRef(false);
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<string>();
  const fork = async () => {
    if (pending.current) {
      return;
    }
    pending.current = true;
    setBusy(true);
    setFailure(undefined);
    operation.current ??= crypto.randomUUID();
    try {
      const id = await forkAgentSession(
        target.sessionId,
        target.turnId,
        operation.current,
        target.targetId
      );
      target.onFork(id);
    } catch (error) {
      setFailure(
        error instanceof Error ? error.message : "Could not branch this chat"
      );
    } finally {
      pending.current = false;
      setBusy(false);
    }
  };
  return (
    <>
      <IconButton
        aria-label="Branch to new chat"
        title="Branch to new chat · Shared working directory"
        disabled={busy}
        onClick={() => {
          void fork();
        }}
        size="compact"
        variant="ghost"
        xstyle={styles.action}
      >
        <GitBranch
          size={12}
          strokeWidth={1.7}
          aria-hidden="true"
          style={{ width: 12, height: 12 }}
        />
      </IconButton>
      {failure ? (
        <span role="alert" {...stylex.props(styles.time)}>
          {failure}
        </span>
      ) : null}
    </>
  );
}
