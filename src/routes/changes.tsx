import { createFileRoute } from "@tanstack/react-router";

import { ChangesPage } from "../features/changes/changes-page";

export const Route = createFileRoute("/changes")({
  component: ChangesPage,
});
