import { Button } from "@lenso/ui/button";
import { Modal } from "@lenso/ui/modal";
import * as stylex from "@stylexjs/stylex";
import { useEffect, useRef, useState } from "react";

import { administrationStyles as s } from "./administration-styles";
import type {
  OAuthConnectedApplication,
  OAuthConsentView,
  OAuthConsoleClient,
} from "./oauth-client";

/** Separate from Identity and Access. The admitted host owns login and lifetime. */
export function OAuthConsentPage(props: {
  client: OAuthConsoleClient;
  requestId: string;
  signal: AbortSignal;
  onComplete(redirect: string): void;
}) {
  const [view, setView] = useState<OAuthConsentView>();
  const [errorMessage, setErrorMessage] = useState("");
  const [pending, setPending] = useState(false);
  const epoch = useRef({ value: 0 });
  const lock = useRef(false);
  useEffect(() => {
    const controller = new AbortController();
    const lifetime = epoch.current;
    lifetime.value += 1;
    const current = lifetime.value;
    const signal = AbortSignal.any([controller.signal, props.signal]);
    setView(undefined);
    setErrorMessage("");
    lock.current = false;
    setPending(false);
    async function load() {
      try {
        const value = await props.client.consent(props.requestId, signal);
        if (!signal.aborted && lifetime.value === current) {
          setView(value);
        }
      } catch (error) {
        if (!signal.aborted && lifetime.value === current) {
          setErrorMessage(
            error instanceof Error ? error.message : "Authorization unavailable"
          );
        }
      }
    }
    void load();
    return () => {
      lifetime.value += 1;
      controller.abort();
    };
  }, [props.client, props.requestId, props.signal]);
  async function decide(approve: boolean) {
    if (!view || lock.current || props.signal.aborted) {
      return;
    }
    lock.current = true;
    setPending(true);
    setErrorMessage("");
    const current = epoch.current.value;
    try {
      const result = await props.client.decide(
        view.requestId,
        approve,
        props.signal
      );
      if (!props.signal.aborted && current === epoch.current.value) {
        props.onComplete(result.redirect);
      }
    } catch (error) {
      if (!props.signal.aborted && current === epoch.current.value) {
        setErrorMessage(
          error instanceof Error
            ? error.message
            : "Authorization outcome unavailable"
        );
      }
    } finally {
      if (current === epoch.current.value) {
        lock.current = false;
        setPending(false);
      }
    }
  }
  return (
    <section
      aria-label="Application authorization"
      {...stylex.props(s.section)}
    >
      <h1>Connect an application</h1>
      {errorMessage && <p role="alert">{errorMessage}</p>}
      {!view && !errorMessage && (
        <output>Loading authorization request…</output>
      )}
      {view && (
        <>
          <h2>{view.client.name}</h2>
          <p>
            This application is requesting access to{" "}
            <code>{view.resource}</code> using your current Console identity.
          </p>
          <p>
            The client name is supplied by the application and is not a verified
            publisher identity.
          </p>
          <p>
            Client ID: <code>{view.client.id}</code>
          </p>
          <p>Requested permissions</p>
          <ul>
            {view.scopes.map((scope) => (
              <li key={scope}>{scope}</li>
            ))}
          </ul>
          <p>
            You can revoke this connection in Connected applications. Approving
            does not change your Console role.
          </p>
          <div {...stylex.props(s.row)}>
            <Button
              variant="secondary"
              disabled={pending}
              onClick={() => void decide(false)}
            >
              Deny
            </Button>
            <Button
              variant="primary"
              disabled={pending || view.expiresAt <= Date.now()}
              onClick={() => void decide(true)}
            >
              {pending ? "Completing…" : "Allow connection"}
            </Button>
          </div>
        </>
      )}
    </section>
  );
}

export function OAuthApplicationsPage(props: {
  client: OAuthConsoleClient;
  signal: AbortSignal;
}) {
  const [items, setItems] = useState<readonly OAuthConnectedApplication[]>();
  const [selected, setSelected] = useState<OAuthConnectedApplication>();
  const [errorMessage, setErrorMessage] = useState("");
  const [pending, setPending] = useState(false);
  const epoch = useRef({ value: 0 });
  const lock = useRef(false);
  useEffect(() => {
    const controller = new AbortController();
    const lifetime = epoch.current;
    lifetime.value += 1;
    const current = lifetime.value;
    const signal = AbortSignal.any([controller.signal, props.signal]);
    setItems(undefined);
    setErrorMessage("");
    lock.current = false;
    setPending(false);
    async function load() {
      try {
        const value = await props.client.grants(signal);
        if (!signal.aborted && lifetime.value === current) {
          setItems(value);
        }
      } catch (error) {
        if (!signal.aborted && lifetime.value === current) {
          setErrorMessage(
            error instanceof Error ? error.message : "Connections unavailable"
          );
        }
      }
    }
    void load();
    return () => {
      lifetime.value += 1;
      controller.abort();
    };
  }, [props.client, props.signal]);
  async function revoke() {
    if (!selected || lock.current || props.signal.aborted) {
      return;
    }
    const current = epoch.current.value;
    const target = selected.id;
    lock.current = true;
    setPending(true);
    setErrorMessage("");
    try {
      await props.client.revoke(target, props.signal);
      if (props.signal.aborted || current !== epoch.current.value) {
        return;
      }
      const next = await props.client.grants(props.signal);
      if (!props.signal.aborted && current === epoch.current.value) {
        setSelected(undefined);
        setItems(next);
      }
    } catch (error) {
      if (!props.signal.aborted && current === epoch.current.value) {
        setErrorMessage(
          error instanceof Error
            ? error.message
            : "Revocation outcome unavailable"
        );
      }
    } finally {
      if (current === epoch.current.value) {
        lock.current = false;
        setPending(false);
      }
    }
  }
  return (
    <section aria-label="Connected applications" {...stylex.props(s.section)}>
      <h1>Connected applications</h1>
      <p>
        Applications you authorized with OAuth. Revocation blocks new requests
        and token refresh.
      </p>
      {errorMessage && <p role="alert">{errorMessage}</p>}
      {!items && !errorMessage && <output>Loading connections…</output>}
      {items?.length === 0 && <p>No applications connected.</p>}
      <ul>
        {items?.map((item) => (
          <li key={item.id}>
            <h2>{item.clientName}</h2>
            <p>
              <code>{item.resource}</code>
            </p>
            <p>{item.scopes.join(", ")}</p>
            <p>Authorized {new Date(item.createdAt).toLocaleString()}</p>
            <p>
              {item.revoked
                ? "Revoked"
                : item.expiresAt <= Date.now()
                  ? "Expired"
                  : "Connected"}
            </p>
            {!item.revoked && item.expiresAt > Date.now() && (
              <Button
                variant="danger-soft"
                disabled={pending}
                onClick={() => setSelected(item)}
              >
                Revoke {item.clientName}
              </Button>
            )}
          </li>
        ))}
      </ul>
      <Modal
        open={!!selected}
        onOpenChange={(open, details) => {
          if (pending) {
            details.cancel();
          } else if (!open) {
            setSelected(undefined);
          }
        }}
      >
        <Modal.Portal>
          <Modal.Backdrop variant="opaque" />
          <Modal.Viewport>
            <Modal.Popup placement="center" size="md">
              <Modal.Header>
                <Modal.Title>Revoke {selected?.clientName}?</Modal.Title>
                <Modal.Description>
                  The application will need your permission to connect again.
                </Modal.Description>
              </Modal.Header>
              <Modal.Footer>
                <Button
                  variant="secondary"
                  disabled={pending}
                  onClick={() => setSelected(undefined)}
                >
                  Cancel
                </Button>
                <Button
                  variant="danger"
                  disabled={pending}
                  onClick={() => void revoke()}
                >
                  {pending ? "Revoking…" : "Revoke connection"}
                </Button>
              </Modal.Footer>
            </Modal.Popup>
          </Modal.Viewport>
        </Modal.Portal>
      </Modal>
    </section>
  );
}
