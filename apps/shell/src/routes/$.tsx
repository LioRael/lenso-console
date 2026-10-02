import { createFileRoute, notFound, redirect } from "@tanstack/react-router";

import { legacyConsoleTargetForPath } from "../app/console-router-config";

export const Route = createFileRoute("/$")({
  beforeLoad: ({ location }) => {
    const target = legacyConsoleTargetForPath(location.pathname);
    if (target) {
      throw redirect({ to: target });
    }
  },
  loader: () => {
    throw notFound();
  },
});
