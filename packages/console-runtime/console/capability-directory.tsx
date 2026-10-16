import { ConsoleIconButton, ConsoleLayout } from "@lenso/console-react";
import type { RuntimeCatalogue } from "@lenso/console-runtime/client";
import type {
  PageProps,
  ReadSnapshot,
  WorkspaceReadResult,
} from "@lenso/console-sdk";
import { Button } from "@lenso/ui/button";
import { Drawer } from "@lenso/ui/drawer";
import { Modal } from "@lenso/ui/modal";
import { Table } from "@lenso/ui/table";
import * as stylex from "@stylexjs/stylex";
import { FlaskConical, X } from "lucide-react";

import { GreetingTrial } from "./greeting-trial";
import { styles } from "./page.styles";

type Service = ReadSnapshot<RuntimeCatalogue>["services"][number];
type Method = Service["contract"]["methods"][string];

function MethodSchemas({
  service,
  method,
  contract,
}: {
  service: string;
  method: string;
  contract: Method;
}) {
  return (
    <Drawer.Root swipeDirection="right">
      <Drawer.Trigger
        render={
          <Button
            variant="secondary"
            aria-label={`View schemas for ${service}.${method}`}
          />
        }
      >
        Schemas
      </Drawer.Trigger>
      <Drawer.Portal>
        <Drawer.Backdrop variant="opaque" />
        <Drawer.Viewport>
          <Drawer.Popup xstyle={styles.drawer}>
            <Drawer.Content xstyle={styles.drawerContent}>
              <Drawer.Header xstyle={styles.overlayHeader}>
                <div {...stylex.props(styles.overlayHeading)}>
                  <Drawer.Title>Schemas</Drawer.Title>
                  <Drawer.Description>
                    {service}.{method}
                  </Drawer.Description>
                </div>
                <Drawer.Close
                  render={
                    <ConsoleIconButton
                      label="Close schemas"
                      variant="secondary"
                    />
                  }
                >
                  <X size={18} aria-hidden="true" />
                </Drawer.Close>
              </Drawer.Header>
              <Drawer.Body xstyle={styles.overlayBody}>
                <dl {...stylex.props(styles.schemas)}>
                  {(["input", "output", "error"] as const).map((kind) => (
                    <div key={kind}>
                      <dt {...stylex.props(styles.schemaLabel)}>
                        {kind === "input"
                          ? "Input"
                          : kind === "output"
                            ? "Output"
                            : "Error"}
                      </dt>
                      <dd {...stylex.props(styles.schemaValue)}>
                        <pre {...stylex.props(styles.code)}>
                          <code>{JSON.stringify(contract[kind], null, 2)}</code>
                        </pre>
                      </dd>
                    </div>
                  ))}
                </dl>
              </Drawer.Body>
            </Drawer.Content>
          </Drawer.Popup>
        </Drawer.Viewport>
      </Drawer.Portal>
    </Drawer.Root>
  );
}

function DeclaredService({ service }: { service: Service }) {
  const identity = `${service.namespace}/${service.service}`;
  const methods = Object.entries(service.contract.methods);
  return (
    <div>
      <h3 {...stylex.props(styles.subtitle)}>{identity}</h3>
      <p {...stylex.props(styles.description)}>
        Declared contract {service.contract.version}
      </p>
      {methods.length ? (
        <Table.Root variant="secondary">
          <Table.Content
            aria-label={`Declared capabilities for ${identity}`}
            xstyle={styles.table}
          >
            <Table.Header>
              <Table.Column
                columnKey="method"
                width="1fr"
                minWidth={100}
                xstyle={styles.cell}
              >
                Method
              </Table.Column>
              <Table.Column
                columnKey="schemas"
                width="1fr"
                minWidth={112}
                xstyle={styles.cell}
              >
                Schemas
              </Table.Column>
            </Table.Header>
            <Table.Body>
              {methods.map(([name, method]) => (
                <Table.Row
                  key={name}
                  itemKey={name}
                  textValue={`${identity}.${name}`}
                >
                  <Table.Cell columnKey="method" xstyle={styles.cell}>
                    <span {...stylex.props(styles.primary)}>{name}</span>
                    <p {...stylex.props(styles.metadata)}>{method.mode}</p>
                  </Table.Cell>
                  <Table.Cell columnKey="schemas" xstyle={styles.cell}>
                    <MethodSchemas
                      service={identity}
                      method={name}
                      contract={method}
                    />
                  </Table.Cell>
                </Table.Row>
              ))}
            </Table.Body>
          </Table.Content>
        </Table.Root>
      ) : (
        <p {...stylex.props(styles.message)}>
          No methods are declared for this service.
        </p>
      )}
    </div>
  );
}

export function CapabilityDirectory({
  catalogue,
  services,
  signal,
  activation,
}: {
  catalogue: WorkspaceReadResult<RuntimeCatalogue>;
  services: PageProps["services"];
  signal: AbortSignal;
  activation: NonNullable<PageProps["activation"]>;
}) {
  const { data } = catalogue;
  const trial = data?.greetingTrial;
  return (
    <section
      {...stylex.props(styles.section)}
      aria-label="Capability directory"
    >
      <h2 {...stylex.props(styles.title)}>Capability directory</h2>
      <p {...stylex.props(styles.metadata)}>
        Static build manifest · availability unverified
      </p>
      {catalogue.error ? (
        <p role="alert" {...stylex.props(styles.message)}>
          The capability directory could not be read. Refresh to try again.
          {data ? " Showing the last successful manifest." : ""}
        </p>
      ) : null}
      {!data && !catalogue.error ? (
        <output aria-busy="true" {...stylex.props(styles.message)}>
          Loading capability directory…
        </output>
      ) : null}
      {data ? (
        <>
          {data.configured ? (
            data.services.length ? (
              data.services.map((service) => (
                <DeclaredService
                  key={`${service.namespace}/${service.service}/${service.contract.version}`}
                  service={service}
                />
              ))
            ) : (
              <p {...stylex.props(styles.message)}>
                The configured manifest declares no services.
              </p>
            )
          ) : (
            <p {...stylex.props(styles.message)}>
              This host has not configured a static capability manifest.
            </p>
          )}
          {trial?.enabled && !catalogue.error && (
            <Modal.Root scroll="inside">
              <ConsoleLayout.Corner area="topLeft">
                <Modal.Trigger
                  render={
                    <ConsoleIconButton
                      label="Open greeting trial"
                      variant="secondary"
                    />
                  }
                >
                  <FlaskConical size={18} aria-hidden="true" />
                </Modal.Trigger>
              </ConsoleLayout.Corner>
              <Modal.Portal>
                <Modal.Backdrop variant="opaque" />
                <Modal.Viewport xstyle={styles.overlayViewport}>
                  <Modal.Popup
                    placement="center"
                    size="lg"
                    xstyle={styles.trialDialog}
                  >
                    <Modal.Header xstyle={styles.overlayHeader}>
                      <Modal.Title xstyle={styles.overlayHeading}>
                        Greeting trial
                      </Modal.Title>
                      <Modal.Close
                        render={
                          <ConsoleIconButton
                            label="Close greeting trial"
                            variant="secondary"
                          />
                        }
                      >
                        <X size={18} aria-hidden="true" />
                      </Modal.Close>
                    </Modal.Header>
                    <Modal.Body xstyle={styles.overlayBody}>
                      <GreetingTrial
                        key={JSON.stringify(trial)}
                        trial={trial}
                        services={services}
                        signal={signal}
                        parentActivation={activation}
                      />
                    </Modal.Body>
                  </Modal.Popup>
                </Modal.Viewport>
              </Modal.Portal>
            </Modal.Root>
          )}
        </>
      ) : null}
    </section>
  );
}
