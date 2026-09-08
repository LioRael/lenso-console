import { createFileRoute } from "@tanstack/react-router";

import { AgentProfileDetailPage } from "../features/agent/agent-profiles-page";

export const Route = createFileRoute(
  "/settings_/profiles_/$agentId/$profileName"
)({
  validateSearch: (search: Record<string, unknown>): { copy: boolean } => ({
    copy: search.copy === true || search.copy === "true",
  }),
  component: ProfileDetailRoute,
});
function ProfileDetailRoute() {
  const { agentId, profileName } = Route.useParams();
  const { copy } = Route.useSearch();
  return (
    <AgentProfileDetailPage
      key={`${agentId}/${profileName}/${copy}`}
      agentId={agentId}
      profileName={profileName}
      copy={copy}
    />
  );
}
