import { Button } from "@lenso/ui/button";
import * as stylex from "@stylexjs/stylex";
import { Copy, Pencil, X } from "lucide-react";

import { AgentForkButton, type AgentForkTarget } from "./agent-fork-button";
import { agentMessageControlStyles as styles } from "./agent-message-controls.stylex";

export function AgentMessageActions({
  content,
  fork,
  onEdit,
  timestamp,
  timePosition = "start",
}: {
  content: string;
  fork?: AgentForkTarget;
  timestamp?: string | undefined;
  timePosition?: "start" | "end";
  onEdit?: () => void;
}) {
  const date = timestamp ? new Date(timestamp) : undefined;
  const validDate = date && !Number.isNaN(date.getTime()) ? date : undefined;
  const copyMessage = () => {
    void navigator.clipboard?.writeText(content);
  };

  return (
    <div {...stylex.props(styles.actions)}>
      {validDate ? (
        <time
          dateTime={validDate.toISOString()}
          title={validDate.toLocaleString()}
          {...stylex.props(
            styles.time,
            timePosition === "end" && styles.timeEnd
          )}
        >
          {validDate.toLocaleTimeString([], {
            hour: "2-digit",
            minute: "2-digit",
            hour12: false,
          })}
        </time>
      ) : null}
      <Button
        isIconOnly
        aria-label="Copy message"
        onClick={copyMessage}
        size="sm"
        variant="ghost"
        xstyle={styles.action}
      >
        <Copy
          aria-hidden="true"
          style={{ width: 12, height: 12 }}
          size={12}
          strokeWidth={1.7}
        />
      </Button>
      {fork ? <AgentForkButton target={fork} /> : null}
      {onEdit ? (
        <Button
          isIconOnly
          aria-label="Edit message"
          onClick={onEdit}
          size="sm"
          variant="ghost"
          xstyle={styles.action}
        >
          <Pencil
            aria-hidden="true"
            style={{ width: 12, height: 12 }}
            size={12}
            strokeWidth={1.7}
          />
        </Button>
      ) : null}
    </div>
  );
}

export function EditingMessageBar({
  compact = false,
  onCancel,
}: {
  compact?: boolean;
  onCancel: () => void;
}) {
  return (
    <div {...stylex.props(styles.editingBar)}>
      <span {...stylex.props(styles.editingLabel)}>
        <Pencil
          aria-hidden="true"
          className={stylex.props(styles.icon).className}
          size={12}
          strokeWidth={1.7}
        />
        <span>Editing message</span>
      </span>
      <Button
        isIconOnly
        aria-label="Cancel editing"
        onClick={onCancel}
        size="sm"
        variant="ghost"
        xstyle={[styles.cancel, compact && styles.compactCancel]}
      >
        <X
          aria-hidden="true"
          className={
            stylex.props(styles.icon, compact && styles.compactCancelIcon)
              .className
          }
        />
      </Button>
    </div>
  );
}
