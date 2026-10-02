import { createFileRoute } from "@tanstack/react-router";

import { PageContributionOutlet } from "../features/extensions/page-contribution-outlet";

export const Route = createFileRoute("/apps/$appId/pages/$workspaceId/$")({
  component: AppWorkspacePage,
});

function AppWorkspacePage() {
  const { _splat, appId, workspaceId } = Route.useParams();
  return (
    <PageContributionOutlet
      mountId={workspaceId}
      segments={_splat ? _splat.split("/") : []}
      subject={{ appId, kind: "app" }}
    />
  );
}
