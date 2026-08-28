import { IconButton } from "@lenso/ui/icon-button";
import { Copy, Pencil, X } from "lucide-react";

import styles from "./agent-message-controls.module.css";

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
    <div className={styles.actions}>
      <IconButton
        aria-label="Copy message"
        className={styles.action}
        onClick={copyMessage}
        size="compact"
        variant="ghost"
      >
        <Copy
          aria-hidden="true"
          className={styles.icon}
          size={12}
          strokeWidth={1.7}
        />
      </IconButton>
      {onEdit ? (
        <IconButton
          aria-label="Edit message"
          className={styles.action}
          onClick={onEdit}
          size="compact"
          variant="ghost"
        >
          <Pencil
            aria-hidden="true"
            className={styles.icon}
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
    <div
      className={`${styles.editingBar} ${compact ? styles.compactEditingBar : ""}`}
    >
      <span className={styles.editingLabel}>
        <Pencil
          aria-hidden="true"
          className={styles.editingIcon}
          size={12}
          strokeWidth={1.7}
        />
        <span>Editing message</span>
      </span>
      <IconButton
        aria-label="Cancel editing"
        className={styles.cancel}
        onClick={onCancel}
        size="compact"
        variant="ghost"
      >
        <X aria-hidden="true" className={styles.cancelIcon} />
      </IconButton>
    </div>
  );
}
