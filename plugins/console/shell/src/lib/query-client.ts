import { resolveReadRefreshPolicy } from "../../../../../packages/console-authoring/src/read-refresh";
import { ConsoleQueryClient } from "./console-query-client";
import { consoleReadRefreshPolicy } from "./read-refresh-policy";

export const queryClient = new ConsoleQueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      ...resolveReadRefreshPolicy(consoleReadRefreshPolicy()),
    },
  },
});
