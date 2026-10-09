import type { RoleSnapshot } from "@lenso/authorization";
import { definePage, useWorkspaceRead } from "@lenso/console-sdk";
import { Button } from "@lenso/ui/button";

export default definePage(({ services }) => {
  const inspection = useWorkspaceRead({
    key: "authorization.inspect",
    params: {},
    read: ({ signal }) =>
      services.invoke<
        Record<string, never>,
        RoleSnapshot<"access" | "configure">
      >("authorization", "inspect", {}, { signal }),
  });
  return (
    <main aria-label="Authorization">
      <h1>Authorization</h1>
      {inspection.error ? (
        <p role="alert">The authorized scope could not be read.</p>
      ) : inspection.data ? (
        <>
          <p>Policy revision: {inspection.data.revision}</p>
          <h2>Roles</h2>
          {inspection.data.graph.roles.length ? (
            <ul>
              {inspection.data.graph.roles.map((role) => (
                <li key={role.id}>{role.id}</li>
              ))}
            </ul>
          ) : (
            <p>No roles are visible in this scope.</p>
          )}
          <h2>Bindings</h2>
          {inspection.data.graph.bindings.length ? (
            <ul>
              {inspection.data.graph.bindings.map((binding) => (
                <li key={binding.id}>
                  {binding.principal.subjectId}: {binding.roleId}
                </li>
              ))}
            </ul>
          ) : (
            <p>No bindings are visible in this scope.</p>
          )}
        </>
      ) : (
        <output aria-busy="true">Loading authorized scope…</output>
      )}
      <Button
        disabled={inspection.refreshing}
        onClick={async () => {
          try {
            await inspection.refetch();
          } catch {
            // The scoped read exposes its failure in the page's alert.
          }
        }}
      >
        Refresh authorization
      </Button>
    </main>
  );
});
