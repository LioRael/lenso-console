import { QueryClientProvider } from "@tanstack/react-query";
import type { PropsWithChildren } from "react";

import { queryClient } from "../lib/query-client";
import { ConsoleAppearanceProvider } from "./console-appearance";

export function Providers({ children }: PropsWithChildren) {
  return (
    <QueryClientProvider client={queryClient}>
      <ConsoleAppearanceProvider>{children}</ConsoleAppearanceProvider>
    </QueryClientProvider>
  );
}
