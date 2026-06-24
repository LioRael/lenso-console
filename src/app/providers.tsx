import { QueryClientProvider } from "@tanstack/react-query";
import type { PropsWithChildren } from "react";

import { queryClient } from "../lib/query-client";
import { ConsoleAuthGate } from "./console-auth";

export function Providers({ children }: PropsWithChildren) {
  return (
    <QueryClientProvider client={queryClient}>
      <ConsoleAuthGate>{children}</ConsoleAuthGate>
    </QueryClientProvider>
  );
}
