import { createFileRoute } from "@tanstack/react-router";

import { ModulesPage } from "../features/modules/modules-page";

export const Route = createFileRoute("/modules")({
  component: ModulesPage,
});
