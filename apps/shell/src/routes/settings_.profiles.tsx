import { createFileRoute } from "@tanstack/react-router";

import { AgentProfilesPage } from "../features/agent/agent-profiles-page";

export const Route = createFileRoute("/settings_/profiles")({
  component: AgentProfilesPage,
});
