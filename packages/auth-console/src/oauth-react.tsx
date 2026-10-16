import {
  ConsoleIconButton,
  ConsoleTableContext,
  ConsoleTableSearch,
} from "@lenso/console-react";
import { ThemeScope } from "@lenso/ui";
import { Button } from "@lenso/ui/button";
import { Drawer } from "@lenso/ui/drawer";
import { Modal } from "@lenso/ui/modal";
import { Popover } from "@lenso/ui/popover";
import { Table } from "@lenso/ui/table";
import * as stylex from "@stylexjs/stylex";
import { Info, X } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";

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
  scopeKey?: string;
}) {
  const [items, setItems] = useState<readonly OAuthConnectedApplication[]>();
  const [selected, setSelected] = useState<OAuthConnectedApplication>();
  const [inspected, setInspected] = useState<OAuthConnectedApplication>();
  const [query, setQuery] = useState("");
  const scopeKey = useId();
  const entry = useRef<HTMLHeadingElement>(null);
  const opener = useRef<HTMLElement | null>(null);
  const revokeOpener = useRef<HTMLButtonElement | null>(null);
  const list = useRef<HTMLDivElement>(null);
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
    setInspected(undefined);
    setSelected(undefined);
    setQuery("");
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
        setInspected(next.find((item) => item.id === target));
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
  const visibleItems =
    items?.filter((item) =>
      `${item.clientName} ${item.clientId} ${item.resource}`
        .toLowerCase()
        .includes(query.trim().toLowerCase())
    ) ?? [];
  return (
    <section aria-label="Connected applications" {...stylex.props(s.section)}>
      {errorMessage && !selected && <p role="alert">{errorMessage}</p>}
      {!items && !errorMessage && <output>Loading connections…</output>}
      <ConsoleTableContext
        scopeKey={props.scopeKey ?? scopeKey}
        label="Connected applications"
        locked={pending || !!selected || !!inspected}
        groups={[
          {
            id: "query",
            kind: "query",
            label: "Search",
            children: (
              <ConsoleTableSearch
                label="Search applications"
                value={query}
                onValueChange={setQuery}
              />
            ),
          },
          {
            id: "information",
            kind: "view",
            label: "Connection information",
            placement: "bottomLeft",
            children: (
              <Popover.Root>
                <Popover.Trigger
                  render={
                    <ConsoleIconButton
                      label="Application information"
                      variant="secondary"
                    />
                  }
                >
                  <Info size={18} aria-hidden="true" />
                </Popover.Trigger>
                <ThemeScope>
                  <Popover.Portal>
                    <Popover.Positioner side="top" align="start" sideOffset={8}>
                      <Popover.Popup xstyle={s.accessScope}>
                        <Popover.Title>Connected applications</Popover.Title>
                        <p {...stylex.props(s.accessSecondary)}>
                          Applications you authorized with OAuth. Revocation
                          blocks new requests and token refresh; it does not
                          change your Console role.
                        </p>
                      </Popover.Popup>
                    </Popover.Positioner>
                  </Popover.Portal>
                </ThemeScope>
              </Popover.Root>
            ),
          },
        ]}
      >
        <div ref={list} tabIndex={-1} {...stylex.props(s.accessList)}>
          {items &&
            (visibleItems.length ? (
              <Table.Root variant="secondary">
                <Table.ScrollContainer>
                  <Table.Content
                    aria-label="Connected applications"
                    xstyle={s.table}
                  >
                    <Table.Header>
                      <Table.Column
                        columnKey="application"
                        minWidth={200}
                        width="1.5fr"
                      >
                        Application
                      </Table.Column>
                      <Table.Column columnKey="resource" minWidth={176}>
                        Resource
                      </Table.Column>
                      <Table.Column columnKey="status" minWidth={112}>
                        Status
                      </Table.Column>
                      <Table.Column columnKey="authorized" minWidth={176}>
                        Authorized
                      </Table.Column>
                    </Table.Header>
                    <Table.Body>
                      {visibleItems.map((item) => (
                        <Table.Row
                          key={item.id}
                          itemKey={item.id}
                          textValue={item.clientName}
                        >
                          <Table.Cell columnKey="application" xstyle={s.cell}>
                            <Button
                              variant="ghost"
                              xstyle={[s.subjectButton, s.memberButton]}
                              aria-label={`Inspect application ${item.clientName}`}
                              onClick={(event) => {
                                opener.current = event.currentTarget;
                                setInspected(item);
                              }}
                            >
                              <span {...stylex.props(s.memberIdentity)}>
                                {item.clientName}
                              </span>
                              <span {...stylex.props(s.accessSecondary)}>
                                {item.clientId}
                              </span>
                            </Button>
                          </Table.Cell>
                          <Table.Cell columnKey="resource" xstyle={s.cell}>
                            {item.resource}
                          </Table.Cell>
                          <Table.Cell columnKey="status" xstyle={s.cell}>
                            {applicationStatus(item)}
                          </Table.Cell>
                          <Table.Cell columnKey="authorized" xstyle={s.cell}>
                            {new Date(item.createdAt).toLocaleString()}
                          </Table.Cell>
                        </Table.Row>
                      ))}
                    </Table.Body>
                  </Table.Content>
                </Table.ScrollContainer>
              </Table.Root>
            ) : (
              <p>
                {items.length
                  ? "No applications match this search."
                  : "No applications connected."}
              </p>
            ))}
        </div>
      </ConsoleTableContext>
      <Drawer.Root
        open={!!inspected}
        swipeDirection="right"
        onOpenChange={(open, details) => {
          if (pending || selected) {
            details.cancel();
          } else if (!open) {
            setInspected(undefined);
          }
        }}
      >
        <Drawer.Portal>
          <Drawer.Backdrop variant="opaque" />
          <Drawer.Viewport>
            <Drawer.Popup
              xstyle={s.membershipDrawer}
              initialFocus={entry}
              finalFocus={() =>
                opener.current?.isConnected
                  ? opener.current
                  : (list.current ?? false)
              }
            >
              <Drawer.Content xstyle={s.membershipDrawerContent}>
                <Drawer.Header xstyle={s.membershipHeader}>
                  <div {...stylex.props(s.membershipHeading)}>
                    <Drawer.Title ref={entry} tabIndex={-1}>
                      {inspected?.clientName}
                    </Drawer.Title>
                    <Drawer.Description>
                      {inspected?.clientId}
                    </Drawer.Description>
                  </div>
                  <ConsoleIconButton
                    label="Close application"
                    variant="secondary"
                    disabled={pending || !!selected}
                    onClick={() => setInspected(undefined)}
                  >
                    <X size={18} aria-hidden="true" />
                  </ConsoleIconButton>
                </Drawer.Header>
                <Drawer.Body xstyle={s.membershipOverlayBody}>
                  {inspected && (
                    <div {...stylex.props(s.membershipFields)}>
                      <dl {...stylex.props(s.roleIdentityFields)}>
                        {[
                          ["Connection ID", inspected.id],
                          ["Subject", inspected.subjectId],
                          ["Resource", inspected.resource],
                          ["Status", applicationStatus(inspected)],
                          [
                            "Authorized",
                            new Date(inspected.createdAt).toLocaleString(),
                          ],
                          [
                            "Expires",
                            new Date(inspected.expiresAt).toLocaleString(),
                          ],
                        ].map(([label, value]) => (
                          <div key={label} {...stylex.props(s.field)}>
                            <dt {...stylex.props(s.accessSecondary)}>
                              {label}
                            </dt>
                            <dd {...stylex.props(s.value)}>{value}</dd>
                          </div>
                        ))}
                      </dl>
                      <section aria-label="Granted permissions">
                        <h3 {...stylex.props(s.accessLabel)}>Permissions</h3>
                        <ul {...stylex.props(s.permissionList)}>
                          {inspected.scopes.map((scope) => (
                            <li key={scope}>
                              <code>{scope}</code>
                            </li>
                          ))}
                        </ul>
                      </section>
                      {!inspected.revoked &&
                        inspected.expiresAt > Date.now() && (
                          <div {...stylex.props(s.row)}>
                            <Button
                              variant="danger-soft"
                              disabled={pending}
                              onClick={(event) => {
                                revokeOpener.current = event.currentTarget;
                                setSelected(inspected);
                              }}
                            >
                              Revoke {inspected.clientName}
                            </Button>
                          </div>
                        )}
                    </div>
                  )}
                </Drawer.Body>
              </Drawer.Content>
            </Drawer.Popup>
          </Drawer.Viewport>
        </Drawer.Portal>
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
              <Modal.Popup
                placement="center"
                size="md"
                finalFocus={() =>
                  revokeOpener.current?.isConnected
                    ? revokeOpener.current
                    : (entry.current ?? false)
                }
              >
                <Modal.Header>
                  <Modal.Title>Revoke {selected?.clientName}?</Modal.Title>
                  <Modal.Description>
                    The application will need your permission to connect again.
                  </Modal.Description>
                </Modal.Header>
                {errorMessage && (
                  <Modal.Body>
                    <p role="alert">{errorMessage}</p>
                  </Modal.Body>
                )}
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
      </Drawer.Root>
    </section>
  );
}
function applicationStatus(item: OAuthConnectedApplication) {
  return item.revoked
    ? "Revoked"
    : item.expiresAt <= Date.now()
      ? "Expired"
      : "Connected";
}
