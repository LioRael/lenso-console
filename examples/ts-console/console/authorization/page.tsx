import type { RoleSnapshot } from "@lenso/authorization";
import {
  ConsoleIconButton,
  ConsoleLayout,
  ConsolePageScope,
} from "@lenso/console-react";
import {
  definePage,
  type OperationExecutionEvidence,
} from "@lenso/console-sdk";
import {
  useWorkspaceRead,
  WorkspaceExecutionEvidence,
} from "@lenso/console-sdk/react";
import { ThemeScope } from "@lenso/ui";
import { Popover } from "@lenso/ui/popover";
import { Table } from "@lenso/ui/table";
import * as stylex from "@stylexjs/stylex";
import { Info, RefreshCw } from "lucide-react";
import { useRef, useState } from "react";

import { styles } from "./page.styles";

export default definePage(({ services, activation, mount }) => {
  const [execution, setExecution] = useState<{
    services: typeof services;
    activationKey: string | undefined;
    value: OperationExecutionEvidence | undefined;
  }>();
  const invocation = useRef(0);
  const inspection = useWorkspaceRead({
    key: "authorization.inspect",
    params: {},
    read: ({ signal }) => {
      invocation.current += 1;
      const { current } = invocation;
      setExecution(undefined);
      return services.invoke<
        Record<string, never>,
        RoleSnapshot<"access" | "configure">
      >(
        "authorization",
        "inspect",
        {},
        {
          signal,
          onExecutionEvidence(value) {
            if (
              !signal.aborted &&
              current === invocation.current &&
              (!activation || activation.isCurrent())
            ) {
              setExecution({ services, activationKey: activation?.key, value });
            }
          },
        }
      );
    },
  });
  return (
    <main aria-label="Authorization" {...stylex.props(styles.page)}>
      <ConsolePageScope
        scopeKey={activation?.key ?? mount.id}
        value={{ context: { kind: "object", label: "Authorization" } }}
      />
      <ConsoleLayout.Corner area="bottomLeft">
        <Popover.Root>
          <Popover.Trigger
            render={
              <ConsoleIconButton
                label="Authorization information"
                variant="secondary"
              />
            }
          >
            <Info size={18} aria-hidden="true" />
          </Popover.Trigger>
          <ThemeScope>
            <Popover.Portal>
              <Popover.Positioner side="top" align="start" sideOffset={8}>
                <Popover.Popup xstyle={styles.information}>
                  <Popover.Title>Authorization scope</Popover.Title>
                  <p {...stylex.props(styles.description)}>
                    Read-only policy inspection. These roles and bindings are
                    limited to the authorized scope.
                  </p>
                  {inspection.data && (
                    <p {...stylex.props(styles.description)}>
                      Policy revision: {inspection.data.revision}
                    </p>
                  )}
                  <WorkspaceExecutionEvidence
                    evidence={
                      execution?.services === services &&
                      execution.activationKey === activation?.key
                        ? execution.value
                        : undefined
                    }
                    pending={inspection.blocking || inspection.refreshing}
                  />
                </Popover.Popup>
              </Popover.Positioner>
            </Popover.Portal>
          </ThemeScope>
        </Popover.Root>
      </ConsoleLayout.Corner>
      <ConsoleLayout.Corner area="topRight">
        <ConsoleIconButton
          label="Refresh authorization"
          variant="secondary"
          disabled={inspection.refreshing}
          onClick={async () => {
            try {
              await inspection.refetch();
            } catch {
              // The scoped read exposes its failure in the page's alert.
            }
          }}
        >
          <RefreshCw size={18} aria-hidden="true" />
        </ConsoleIconButton>
      </ConsoleLayout.Corner>
      {inspection.error ? (
        <p role="alert">The authorized scope could not be read.</p>
      ) : inspection.data ? (
        <>
          <section aria-label="Policy roles" {...stylex.props(styles.section)}>
            <h2 {...stylex.props(styles.heading)}>Roles</h2>
            {inspection.data.graph.roles.length ? (
              <Table.Root variant="secondary">
                <Table.ScrollContainer>
                  <Table.Content
                    aria-label="Policy roles"
                    xstyle={styles.table}
                  >
                    <Table.Header>
                      <Table.Column columnKey="role" minWidth={176}>
                        Role
                      </Table.Column>
                      <Table.Column columnKey="permissions" minWidth={240}>
                        Declared permissions
                      </Table.Column>
                      <Table.Column columnKey="inherits" minWidth={144}>
                        Inherits
                      </Table.Column>
                    </Table.Header>
                    <Table.Body>
                      {inspection.data.graph.roles.map((role) => (
                        <Table.Row
                          key={`${role.scope.type}:${role.scope.id}:${role.id}`}
                          itemKey={`${role.scope.type}:${role.scope.id}:${role.id}`}
                          textValue={role.id}
                        >
                          <Table.Cell columnKey="role" xstyle={styles.cell}>
                            {role.id}
                            <p {...stylex.props(styles.secondary)}>
                              {role.scope.type} · {role.scope.id}
                            </p>
                          </Table.Cell>
                          <Table.Cell
                            columnKey="permissions"
                            xstyle={styles.cell}
                          >
                            {role.permissions.length ? (
                              <ul {...stylex.props(styles.list)}>
                                {role.permissions.map((permission) => (
                                  <li key={JSON.stringify(permission)}>
                                    {permission.action} ·{" "}
                                    {permission.resourceType}
                                    <span {...stylex.props(styles.secondary)}>
                                      {" "}
                                      {permission.resourceId ??
                                        "All resources"}{" "}
                                      · {permission.scope.type}/
                                      {permission.scope.id}
                                    </span>
                                  </li>
                                ))}
                              </ul>
                            ) : (
                              <span {...stylex.props(styles.description)}>
                                No direct permissions
                              </span>
                            )}
                          </Table.Cell>
                          <Table.Cell columnKey="inherits" xstyle={styles.cell}>
                            {role.inherits?.join(", ") || "None"}
                          </Table.Cell>
                        </Table.Row>
                      ))}
                    </Table.Body>
                  </Table.Content>
                </Table.ScrollContainer>
              </Table.Root>
            ) : (
              <p>No roles are visible in this scope.</p>
            )}
          </section>
          <section aria-label="Role bindings" {...stylex.props(styles.section)}>
            <h2 {...stylex.props(styles.heading)}>Bindings</h2>
            {inspection.data.graph.bindings.length ? (
              <Table.Root variant="secondary">
                <Table.ScrollContainer>
                  <Table.Content
                    aria-label="Role bindings"
                    xstyle={styles.table}
                  >
                    <Table.Header>
                      <Table.Column columnKey="subject" minWidth={200}>
                        Subject
                      </Table.Column>
                      <Table.Column columnKey="role" minWidth={160}>
                        Role
                      </Table.Column>
                      <Table.Column columnKey="scope" minWidth={176}>
                        Scope
                      </Table.Column>
                      <Table.Column columnKey="expiry" minWidth={176}>
                        Expires
                      </Table.Column>
                    </Table.Header>
                    <Table.Body>
                      {inspection.data.graph.bindings.map((binding) => (
                        <Table.Row
                          key={binding.id}
                          itemKey={binding.id}
                          textValue={binding.principal.subjectId}
                        >
                          <Table.Cell columnKey="subject" xstyle={styles.cell}>
                            {binding.principal.subjectId}
                            <p {...stylex.props(styles.secondary)}>
                              {binding.principal.realmId} ·{" "}
                              {binding.principal.kind}
                            </p>
                          </Table.Cell>
                          <Table.Cell columnKey="role" xstyle={styles.cell}>
                            {binding.roleId}
                          </Table.Cell>
                          <Table.Cell columnKey="scope" xstyle={styles.cell}>
                            {binding.scope.type} · {binding.scope.id}
                          </Table.Cell>
                          <Table.Cell columnKey="expiry" xstyle={styles.cell}>
                            {binding.expiresAt === undefined
                              ? "No expiry"
                              : new Date(binding.expiresAt).toLocaleString()}
                          </Table.Cell>
                        </Table.Row>
                      ))}
                    </Table.Body>
                  </Table.Content>
                </Table.ScrollContainer>
              </Table.Root>
            ) : (
              <p>No bindings are visible in this scope.</p>
            )}
          </section>
        </>
      ) : (
        <output aria-busy="true">Loading authorized scope…</output>
      )}
    </main>
  );
});
