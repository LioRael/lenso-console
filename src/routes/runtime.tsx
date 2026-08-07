import { createFileRoute } from "@tanstack/react-router";

import { RuntimePage } from "../features/runtime/runtime-page";

export const Route = createFileRoute("/runtime")({
  component: RuntimePage,
});
