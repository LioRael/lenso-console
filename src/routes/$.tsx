import { createFileRoute, redirect } from "@tanstack/react-router";

import { legacyConsoleTargetForPath } from "../app/console-router-config";
import { DynamicConsoleModulePage } from "../app/dynamic-console-module";

export const Route = createFileRoute("/$")({
  beforeLoad: ({ location }) => {
    const target = legacyConsoleTargetForPath(location.pathname);
    if (target) {
      throw redirect({ to: target });
    }
  },
  component: DynamicConsoleModulePage,
});
