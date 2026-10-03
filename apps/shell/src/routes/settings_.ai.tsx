import { createFileRoute } from "@tanstack/react-router";

import { AssistantSettingsPage } from "../features/settings/assistant-settings-page";

export const Route = createFileRoute("/settings_/ai")({
  component: AssistantSettingsPage,
});
