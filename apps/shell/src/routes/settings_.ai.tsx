import { createFileRoute, Navigate } from "@tanstack/react-router";

export const Route = createFileRoute("/settings_/ai")({
  component: () => <Navigate replace to="/settings/connections" />,
});
