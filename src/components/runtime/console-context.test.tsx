import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test, vi } from "vitest";

import { ConsoleProvider } from "./console-context";

const runtimeQueries = vi.hoisted(() => ({
  useRuntimeEvents: vi.fn(),
  useRuntimeFunctions: vi.fn(),
  useRuntimeStories: vi.fn(() => ({
    data: [],
    isError: false,
  })),
}));

vi.mock("@tanstack/react-router", () => ({
  useNavigate: () => vi.fn(),
}));

vi.mock("../../hooks/use-runtime-queries", () => runtimeQueries);

describe("ConsoleProvider", () => {
  test("uses Runtime Stories without polling retired runtime lists", () => {
    renderToStaticMarkup(
      <ConsoleProvider>
        <div>Console surface</div>
      </ConsoleProvider>
    );

    expect(runtimeQueries.useRuntimeStories).toHaveBeenCalledOnce();
    expect(runtimeQueries.useRuntimeEvents).not.toHaveBeenCalled();
    expect(runtimeQueries.useRuntimeFunctions).not.toHaveBeenCalled();
  });
});
