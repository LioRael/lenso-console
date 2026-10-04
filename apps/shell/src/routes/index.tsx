import { createFileRoute, Navigate } from "@tanstack/react-router";

import { RoutePending } from "../app/route-states";
import { workspaceRoute } from "../components/runtime/console-navigation-model";
import { useAgentIdentity } from "../features/agent/agent-identity-context";
import { AgentPage } from "../features/agent/agent-page";
import { usePageCatalog } from "../features/extensions/page-contribution-catalog";
import { PageContributionOutlet } from "../features/extensions/page-contribution-outlet";
import { workspaceBasePath } from "../features/extensions/workspace-paths";

export const Route = createFileRoute("/")({ component: AppHome });
function AppHome() {
  const { agents, loading } = useAgentIdentity();
  const catalog = usePageCatalog();
  if (loading || catalog.isPending) {
    return <RoutePending />;
  }
  const root = catalog.data?.find(
    (page) => page.subject.kind === "console" && workspaceBasePath(page) === "/"
  );
  if (root) {
    return (
      <PageContributionOutlet
        mountId={root.id}
        subject={root.subject}
        segments={[]}
      />
    );
  }
  if (agents.length) {
    return <AgentPage />;
  }
  const workspace = catalog.data?.find(
    (page) => page.subject.kind === "console"
  );
  if (workspace) {
    return <Navigate {...workspaceRoute(workspace, [])} replace />;
  }
  return <Navigate to="/plugins" replace />;
}
