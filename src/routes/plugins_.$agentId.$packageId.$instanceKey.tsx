import { createFileRoute } from "@tanstack/react-router";

import { PluginDetailPage } from "../features/plugins/plugin-detail-page";

export const Route = createFileRoute(
  "/plugins_/$agentId/$packageId/$instanceKey"
)({
  component: PluginDetailRoute,
});

function PluginDetailRoute() {
  const { agentId, instanceKey, packageId } = Route.useParams();
  return (
    <PluginDetailPage
      agentId={agentId}
      instanceKey={instanceKey}
      packageId={packageId}
    />
  );
}
