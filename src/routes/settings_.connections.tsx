import { createFileRoute } from "@tanstack/react-router";

import { AgentSettingsPage } from "../features/agent/agent-settings-page";

export const Route = createFileRoute("/settings_/connections")({
  component: () => <AgentSettingsPage kind="ai" />,
});
