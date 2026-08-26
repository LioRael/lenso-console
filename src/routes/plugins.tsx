import { createFileRoute } from "@tanstack/react-router";

import { PluginWorkbenchPage } from "../features/plugins/plugin-workbench-page";

export const Route = createFileRoute("/plugins")({
  component: PluginWorkbenchPage,
});
