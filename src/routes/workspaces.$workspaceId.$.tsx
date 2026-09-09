import { createFileRoute } from "@tanstack/react-router";

import { PageContributionOutlet } from "../features/extensions/page-contribution-outlet";

export const Route = createFileRoute("/workspaces/$workspaceId/$")({
  component: WorkspacePage,
});

function WorkspacePage() {
  const { _splat, workspaceId } = Route.useParams();
  return (
    <PageContributionOutlet
      mountId={workspaceId}
      segments={_splat ? _splat.split("/") : []}
    />
  );
}
