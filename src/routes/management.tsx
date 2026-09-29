import { createFileRoute } from "@tanstack/react-router";

import { ManagementPage } from "../features/management/management-page";

export const Route = createFileRoute("/management")({
  component: ManagementPage,
});
