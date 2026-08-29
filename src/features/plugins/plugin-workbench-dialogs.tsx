import { Button } from "@lenso/ui/button";
import { Dialog } from "@lenso/ui/dialog";
import * as stylex from "@stylexjs/stylex";
import { Plus, Trash2 } from "lucide-react";
import { useState } from "react";

import { lensoUiTokens as tokens } from "../../lenso-ui-token-refs.stylex";

const styles = stylex.create({
  destructive: {
    color: "var(--color-action-danger)",
  },
  dialogField: { display: "grid", gap: tokens.space2 },
  dialogLabel: {
    color: tokens.colorContentSecondary,
    fontSize: 12,
    fontWeight: 500,
  },
  dialogPopup: { maxWidth: 440, width: "calc(100vw - 32px)" },
  feedback: {
    color: tokens.colorContentTertiary,
    fontSize: 11,
    lineHeight: "16px",
    margin: 0,
  },
  feedbackError: { color: "var(--color-status-error-content)" },
  input: {
    backgroundColor: tokens.colorSurfaceSubtle,
    borderColor: tokens.colorBorderTertiary,
    borderRadius: tokens.radiusControl,
    borderStyle: "solid",
    borderWidth: 1,
    boxSizing: "border-box",
    color: tokens.colorContentPrimary,
    fontFamily: tokens.fontSans,
    fontSize: 12,
    height: 32,
    outline: {
      default: "none",
      ":focus": `2px solid ${tokens.colorFocusRing}`,
    },
    paddingInline: 9,
    width: "100%",
  },
});

export function InstallPluginDialog({
  disabled,
  error,
  isPending,
  onInstall,
}: {
  disabled: boolean;
  error: Error | null;
  isPending: boolean;
  onInstall: (bundlePath: string) => Promise<void>;
}) {
  const [bundlePath, setBundlePath] = useState("");
  const [open, setOpen] = useState(false);
  return (
    <Dialog.Root onOpenChange={setOpen} open={open}>
      <Button
        disabled={disabled}
        onClick={() => setOpen(true)}
        size="compact"
        variant="secondary"
      >
        <Plus size={13} strokeWidth={1.75} />
        Install
      </Button>
      <Dialog.Portal>
        <Dialog.Backdrop />
        <Dialog.Viewport>
          <Dialog.Popup {...stylex.props(styles.dialogPopup)}>
            <Dialog.Header>
              <div>
                <Dialog.Title>Install Plugin</Dialog.Title>
                <Dialog.Description>
                  Add a verified Plugin Bundle available on this Host.
                </Dialog.Description>
              </div>
              <Dialog.Close />
            </Dialog.Header>
            <Dialog.Body>
              <label {...stylex.props(styles.dialogField)}>
                <span {...stylex.props(styles.dialogLabel)}>
                  Absolute bundle path
                </span>
                <input
                  autoFocus
                  onChange={(event) => setBundlePath(event.target.value)}
                  placeholder="/opt/lenso/plugins/example.lenso-plugin"
                  value={bundlePath}
                  {...stylex.props(styles.input)}
                />
              </label>
              {error ? (
                <p
                  role="alert"
                  {...stylex.props(styles.feedback, styles.feedbackError)}
                >
                  {error.message}
                </p>
              ) : null}
            </Dialog.Body>
            <Dialog.Footer>
              <Dialog.Close render={<Button size="compact" variant="ghost" />}>
                Cancel
              </Dialog.Close>
              <Button
                disabled={disabled || isPending || !bundlePath.trim()}
                onClick={async () => {
                  try {
                    await onInstall(bundlePath.trim());
                    setOpen(false);
                    setBundlePath("");
                  } catch {
                    // The receipt-aware mutation error remains visible above.
                  }
                }}
                size="compact"
                variant="primary"
              >
                Install Plugin
              </Button>
            </Dialog.Footer>
          </Dialog.Popup>
        </Dialog.Viewport>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

export function RemovePluginDialog({
  disabled,
  error,
  isPending,
  onRemove,
  packageId,
}: {
  disabled: boolean;
  error: Error | null;
  isPending: boolean;
  onRemove: () => Promise<void>;
  packageId: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <Dialog.Root onOpenChange={setOpen} open={open}>
      <Button
        disabled={disabled}
        onClick={() => setOpen(true)}
        size="compact"
        variant="ghost"
        {...stylex.props(styles.destructive)}
      >
        <Trash2 size={13} strokeWidth={1.75} />
        Remove Plugin
      </Button>
      <Dialog.Portal>
        <Dialog.Backdrop />
        <Dialog.Viewport>
          <Dialog.Popup {...stylex.props(styles.dialogPopup)}>
            <Dialog.Header>
              <div>
                <Dialog.Title>Remove {packageId}?</Dialog.Title>
                <Dialog.Description>
                  The Plugin directory will move to recoverable Lenso trash
                  after the remaining App validates.
                </Dialog.Description>
              </div>
              <Dialog.Close />
            </Dialog.Header>
            {error ? (
              <Dialog.Body>
                <p
                  role="alert"
                  {...stylex.props(styles.feedback, styles.feedbackError)}
                >
                  {error.message}
                </p>
              </Dialog.Body>
            ) : null}
            <Dialog.Footer>
              <Dialog.Close render={<Button size="compact" variant="ghost" />}>
                Cancel
              </Dialog.Close>
              <Button
                disabled={disabled || isPending}
                onClick={async () => {
                  try {
                    await onRemove();
                    setOpen(false);
                  } catch {
                    // The receipt-aware mutation error remains visible above.
                  }
                }}
                size="compact"
                variant="primary"
              >
                Remove Plugin
              </Button>
            </Dialog.Footer>
          </Dialog.Popup>
        </Dialog.Viewport>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
