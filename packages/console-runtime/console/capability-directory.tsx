import type { RuntimeCatalogue } from "@lenso/console-runtime/client";
import type {
  PageProps,
  ReadSnapshot,
  WorkspaceReadResult,
} from "@lenso/console-sdk";
import { Accordion } from "@lenso/ui/accordion";
import { Table } from "@lenso/ui/table";
import * as stylex from "@stylexjs/stylex";

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
    <Accordion hideSeparator xstyle={styles.disclosure}>
      <Accordion.Item value="schemas">
        <Accordion.Heading>
          <Accordion.Trigger
            aria-label={`View schemas for ${service}.${method}`}
            xstyle={styles.disclosureTrigger}
          >
            Schemas
            <Accordion.Indicator />
          </Accordion.Trigger>
        </Accordion.Heading>
        <Accordion.Panel>
          <Accordion.Body xstyle={styles.disclosureBody}>
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
          </Accordion.Body>
        </Accordion.Panel>
      </Accordion.Item>
    </Accordion>
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
                    <strong>{name}</strong>
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
          <Table.Footer xstyle={styles.footer}>
            {methods.length} declared{" "}
            {methods.length === 1 ? "method" : "methods"}
          </Table.Footer>
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
      <p {...stylex.props(styles.description)}>
        Static build manifest · availability unverified. These are declared
        contracts selected by the host, not proof that a service is registered
        or callable now.
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
          {trial?.enabled && !catalogue.error ? (
            <GreetingTrial
              key={JSON.stringify(trial)}
              trial={trial}
              services={services}
              signal={signal}
              parentActivation={activation}
            />
          ) : (
            <section
              aria-label="Greeting trial"
              {...stylex.props(styles.trial)}
            >
              <h3 {...stylex.props(styles.trialTitle)}>Greeting trial</h3>
              <p {...stylex.props(styles.description)}>
                {catalogue.error
                  ? "Greeting trial is unavailable until the host configuration can be read."
                  : "Greeting trial is disabled. This host exposes read-only diagnostics."}
              </p>
            </section>
          )}
        </>
      ) : null}
    </section>
  );
}
