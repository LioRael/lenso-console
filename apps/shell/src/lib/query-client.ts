import { QueryClient } from "@tanstack/react-query";

import { resolveReadRefreshPolicy } from "../../../../packages/console-authoring/src/read-refresh";
import { consoleReadRefreshPolicy } from "./read-refresh-policy";

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      ...resolveReadRefreshPolicy(consoleReadRefreshPolicy()),
    },
  },
});
