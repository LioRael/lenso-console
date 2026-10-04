import { createFileRoute, useLocation } from "@tanstack/react-router";

import { RouteNotFound, RoutePending } from "../app/route-states";
import { usePageCatalog } from "../features/extensions/page-contribution-catalog";
import { PageContributionOutlet } from "../features/extensions/page-contribution-outlet";
import { resolveWorkspaceLocation } from "../features/extensions/workspace-paths";

export const Route = createFileRoute("/$")({
  component: WorkspaceRoute,
});

function WorkspaceRoute() {
  const catalog = usePageCatalog();
  const pathname = useLocation({ select: (location) => location.pathname });
  if (catalog.isPending) {
    return <RoutePending />;
  }
  const location = resolveWorkspaceLocation(pathname, catalog.data ?? []);
  if (!location) {
    return <RouteNotFound />;
  }
  return (
    <PageContributionOutlet
      mountId={location.workspaceId}
      subject={location.subject}
      segments={location.segments}
    />
  );
}
