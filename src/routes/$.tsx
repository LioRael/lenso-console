import { createFileRoute, notFound, redirect } from "@tanstack/react-router";

import {
  isRetiredConsolePath,
  legacyConsoleTargetForPath,
} from "../app/console-router-config";
import { DynamicConsoleModulePage } from "../app/dynamic-console-module";

export const Route = createFileRoute("/$")({
  beforeLoad: ({ location }) => {
    if (isRetiredConsolePath(location.pathname)) {
      throw notFound();
    }
    const target = legacyConsoleTargetForPath(location.pathname);
    if (target) {
      throw redirect({ to: target });
    }
  },
  component: DynamicConsoleModulePage,
});
