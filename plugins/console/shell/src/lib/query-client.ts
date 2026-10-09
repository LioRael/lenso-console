import { resolveReadRefreshPolicy } from "@lenso/console-sdk";
import { ConsoleQueryClient } from "@lenso/console-sdk/query-client";

import { consoleReadRefreshPolicy } from "./read-refresh-policy";

export const queryClient = new ConsoleQueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      ...resolveReadRefreshPolicy(consoleReadRefreshPolicy()),
    },
  },
});
