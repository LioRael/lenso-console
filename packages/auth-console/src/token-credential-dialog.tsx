import { Button } from "@lenso/ui/button";
import { Modal } from "@lenso/ui/modal";
import * as stylex from "@stylexjs/stylex";
import { useEffect, useRef, useState } from "react";

import type { CredentialDelivery } from "./administration-contracts";
import { administrationStyles as s } from "./administration-styles";

/** One-time delivery is independent of token-list reads and never enters a read cache. */
export function TokenCredentialDialog({
  delivery,
  pending,
  onDismiss,
}: {
  delivery: CredentialDelivery | null;
  pending: boolean;
  onDismiss(): void;
}) {
  const [feedback, setFeedback] = useState("");
  const epoch = useRef(0);
  useEffect(() => {
    epoch.current += 1;
    setFeedback("");
    return () => {
      epoch.current += 1;
    };
  }, [delivery]);
  async function copy() {
    if (!delivery?.credential) {
      return;
    }
    const { current } = epoch;
    try {
      await navigator.clipboard.writeText(delivery.credential);
      if (current === epoch.current) {
        setFeedback("Full PAT copied.");
      }
    } catch {
      if (current === epoch.current) {
        setFeedback("Copy failed. Select and copy the complete value above.");
      }
    }
  }
  return (
    <Modal
      open={!!delivery && !pending}
      onOpenChange={(open, details) => {
        // Escape/backdrop cannot silently destroy the sole copy of a newly issued credential.
        if (!open) {
          details.cancel();
        }
      }}
    >
      <Modal.Portal>
        <Modal.Backdrop variant="opaque" />
        <Modal.Viewport>
          <Modal.Popup placement="center" size="md">
            <Modal.Header>
              <Modal.Title>Save your full PAT now</Modal.Title>
              <Modal.Description>
                This is the only display of the full credential. Save the
                complete lk_ value before closing; the Token ID in the list
                cannot authenticate a client.
              </Modal.Description>
            </Modal.Header>
            <Modal.Body>
              <section
                aria-label="One-time credential"
                {...stylex.props(s.section)}
              >
                {delivery?.credential ? (
                  <pre {...stylex.props(s.secret)}>{delivery.credential}</pre>
                ) : (
                  <p>
                    The credential is no longer available. Inspect the token
                    before rotating it; do not repeat issuance automatically.
                  </p>
                )}
                {feedback && <output>{feedback}</output>}
              </section>
            </Modal.Body>
            <Modal.Footer>
              {delivery?.credential && (
                <Button variant="secondary" onClick={() => void copy()}>
                  Copy full PAT
                </Button>
              )}
              <Button
                variant="primary"
                onClick={() => {
                  epoch.current += 1;
                  onDismiss();
                }}
              >
                I&apos;ve saved the full PAT
              </Button>
            </Modal.Footer>
          </Modal.Popup>
        </Modal.Viewport>
      </Modal.Portal>
    </Modal>
  );
}
