import { createFileRoute, Navigate } from "@tanstack/react-router";

import { RoutePending } from "../app/route-states";
import { useAgentIdentity } from "../features/agent/agent-identity-context";
import { AgentPage } from "../features/agent/agent-page";
import { usePageCatalog } from "../features/extensions/page-contribution-catalog";

export const Route = createFileRoute("/")({ component: AppHome });
function AppHome() {
  const { agents, loading } = useAgentIdentity();
  const catalog = usePageCatalog();
  if (loading || catalog.isPending) {
    return <RoutePending />;
  }
  if (agents.length) {
    return <AgentPage />;
  }
  const workspace = catalog.data?.find(
    (page) => page.subject.kind === "console"
  );
  if (workspace) {
    return (
      <Navigate
        to="/workspaces/$workspaceId/$"
        params={{ workspaceId: workspace.id, _splat: "" }}
        replace
      />
    );
  }
  return <Navigate to="/plugins" replace />;
}
