import { createContext, useContext } from "react";
import { flushSync } from "react-dom";
import { createRoot } from "react-dom/client";
import { expect, test } from "vitest";
import { page } from "vitest/browser";

import {
  ContributionSidebar,
  WorkspaceSidebarProvider,
  WorkspaceSidebarSlot,
} from "./workspace-sidebar-slot";

const Context = createContext("missing");
function Navigation() {
  return <button>{useContext(Context)}</button>;
}
function App({ active }: { active: boolean }) {
  return (
    <WorkspaceSidebarProvider>
      <aside aria-label="Host sidebar">
        <WorkspaceSidebarSlot>
          <span>Default navigation</span>
        </WorkspaceSidebarSlot>
      </aside>
      <main>
        {active && (
          <Context.Provider value="Workspace navigation">
            <ContributionSidebar>
              <Navigation />
            </ContributionSidebar>
          </Context.Provider>
        )}
      </main>
    </WorkspaceSidebarProvider>
  );
}

test("contributed navigation keeps plugin context and restores the host fallback on unmount", async () => {
  const node = document.createElement("div");
  document.body.append(node);
  const root = createRoot(node);
  try {
    flushSync(() => root.render(<App active />));
    await expect
      .element(page.getByRole("button", { name: "Workspace navigation" }))
      .toBeVisible();
    expect(node.querySelector("aside button")?.textContent).toBe(
      "Workspace navigation"
    );
    await expect
      .element(page.getByText("Default navigation"))
      .not.toBeInTheDocument();
    flushSync(() => root.render(<App active={false} />));
    await expect.element(page.getByText("Default navigation")).toBeVisible();
    expect(node.querySelector("aside button")).toBeNull();
  } finally {
    root.unmount();
    node.remove();
  }
});
