import { IconButton } from "@lenso/ui/icon-button";
import * as stylex from "@stylexjs/stylex";
import { Copy, Pencil, X } from "lucide-react";

import { agentMessageControlStyles as styles } from "./agent-message-controls.stylex";

export function AgentMessageActions({
  content,
  onEdit,
}: {
  content: string;
  onEdit?: () => void;
}) {
  const copyMessage = () => {
    void navigator.clipboard?.writeText(content);
  };

  return (
    <div {...stylex.props(styles.actions)}>
      <IconButton
        aria-label="Copy message"
        onClick={copyMessage}
        size="compact"
        variant="ghost"
        xstyle={styles.action}
      >
        <Copy
          aria-hidden="true"
          className={stylex.props(styles.icon).className}
          size={12}
          strokeWidth={1.7}
        />
      </IconButton>
      {onEdit ? (
        <IconButton
          aria-label="Edit message"
          onClick={onEdit}
          size="compact"
          variant="ghost"
          xstyle={styles.action}
        >
          <Pencil
            aria-hidden="true"
            className={stylex.props(styles.icon).className}
            size={12}
            strokeWidth={1.7}
          />
        </IconButton>
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
      <IconButton
        aria-label="Cancel editing"
        onClick={onCancel}
        size="compact"
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
      </IconButton>
    </div>
  );
}
