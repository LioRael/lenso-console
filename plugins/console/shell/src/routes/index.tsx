import { createFileRoute, Navigate } from "@tanstack/react-router";
import { lazy, Suspense } from "react";

import { RoutePending } from "../app/route-states";
import { workspaceRoute } from "../components/runtime/console-navigation-model";
import { useAgentIdentity } from "../features/agent/agent-identity-context";
import { usePageCatalog } from "../features/extensions/page-contribution-catalog";
import { PageContributionOutlet } from "../features/extensions/page-contribution-outlet";
import { workspaceBasePath } from "../features/extensions/workspace-paths";

const AgentPage = lazy(async () => {
  const module = await import("../features/agent/agent-page");
  return { default: module.AgentPage };
});

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
    return (
      <Suspense fallback={<RoutePending />}>
        <AgentPage />
      </Suspense>
    );
  }
  const workspace = catalog.data?.find(
    (page) => page.subject.kind === "console"
  );
  if (workspace) {
    return <Navigate {...workspaceRoute(workspace, [])} replace />;
  }
  return <Navigate to="/plugins" replace />;
}
