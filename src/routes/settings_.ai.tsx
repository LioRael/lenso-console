import { createFileRoute } from "@tanstack/react-router";

import { AgentSettingsPage } from "../features/agent/agent-settings-page";

export const Route = createFileRoute("/settings_/ai")({
  component: () => <AgentSettingsPage kind="ai" />,
});
