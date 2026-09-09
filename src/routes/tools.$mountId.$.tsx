import { createFileRoute } from "@tanstack/react-router";

import { PageContributionOutlet } from "../features/extensions/page-contribution-outlet";

export const Route = createFileRoute("/tools/$mountId/$")({
  component: ToolPage,
});

function ToolPage() {
  const { _splat, mountId } = Route.useParams();
  return (
    <PageContributionOutlet
      mountId={mountId}
      segments={_splat ? _splat.split("/") : []}
    />
  );
}
