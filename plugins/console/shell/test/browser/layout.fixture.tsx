import { StrictMode, useLayoutEffect, useState } from "react";
import { flushSync } from "react-dom";
import { createRoot } from "react-dom/client";

import "@lenso/tokens/styles.css";
import "../../src/styles.css";
import { ConsoleLayout } from "../../src/components/console/console-layout";
import {
  createConsolePageContext,
  type ConsolePageContextHandle,
} from "../../src/components/console/console-page-context";

type PageState = { count: number };
const { Provider, useConsolePageContext } =
  createConsolePageContext<PageState>();
const handles = new Map<string, ConsolePageContextHandle<PageState>>();
const layoutSnapshots = new Map<string, number>();
let mountWrites = 0;

function ContextObserver({ scopeKey }: { scopeKey: string }) {
  const handle = useConsolePageContext();
  useLayoutEffect(() => {
    layoutSnapshots.set(scopeKey, handle.getContext().count);
    if (handle.context.count === 0) {
      handle.setContext((previous) => {
        mountWrites += 1;
        return previous;
      });
    }
  }, [handle, scopeKey]);
  return null;
}

function ContextButton({ scopeKey }: { scopeKey: string }) {
  const handle = useConsolePageContext();
  useLayoutEffect(() => {
    handles.set(scopeKey, handle);
  }, [handle, scopeKey]);
  return (
    <button
      onClick={() =>
        handle.setContext((previous) => ({ count: previous.count + 1 }))
      }
    >
      Foreground count: {handle.context.count}
    </button>
  );
}

function ContextOutput() {
  const { context } = useConsolePageContext();
  return (
    <output
      aria-label="Page count"
      style={{ position: "fixed", bottom: 20, left: 20 }}
    >
      {context.count}
    </output>
  );
}

function ForegroundControls({ scopeKey }: { scopeKey: string }) {
  return (
    <>
      <ContextObserver scopeKey={scopeKey} />
      <ConsoleLayout.Corner area="topRight">
        <ContextButton scopeKey={scopeKey} />
      </ConsoleLayout.Corner>
      <ConsoleLayout.Foreground>
        <ContextOutput />
      </ConsoleLayout.Foreground>
    </>
  );
}

function Fixture({
  innerScroll,
  reducedTransparency,
  scopeKey,
}: {
  innerScroll: boolean;
  reducedTransparency: boolean;
  scopeKey: string;
}) {
  const [value, setValue] = useState<PageState>({ count: 0 });
  const [contentClicks, setContentClicks] = useState(0);
  return (
    <ConsoleLayout topEdge={{ reducedTransparency }}>
      <Provider scopeKey={scopeKey} value={value} onChange={setValue}>
        <ForegroundControls scopeKey={scopeKey} />
      </Provider>
      <main
        aria-label="Page content"
        style={{
          height: innerScroll ? 480 : undefined,
          overflowY: innerScroll ? "auto" : undefined,
        }}
      >
        <div style={{ minHeight: 1600, paddingTop: 220 }}>
          <button
            style={{ display: "block", marginInline: "auto" }}
            onClick={() => setContentClicks((count) => count + 1)}
          >
            Content clicks: {contentClicks}
          </button>
          <section
            aria-label="Lower nested scroller"
            style={{ height: 100, overflowY: "auto", marginTop: 240 }}
          >
            <div style={{ height: 600 }}>Lower content</div>
          </section>
        </div>
      </main>
    </ConsoleLayout>
  );
}

export function mountLayout() {
  document.body.style.margin = "0";
  document.documentElement.dataset.theme = "light";
  window.scrollTo(0, 0);
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  const render = (
    innerScroll = false,
    scopeKey = "first",
    reducedTransparency = false
  ) =>
    flushSync(() =>
      root.render(
        <StrictMode>
          <Fixture
            innerScroll={innerScroll}
            reducedTransparency={reducedTransparency}
            scopeKey={scopeKey}
          />
        </StrictMode>
      )
    );
  render();
  return {
    render,
    snapshot(scopeKey: string) {
      return {
        context: handles.get(scopeKey)!.getContext(),
        layoutCount: layoutSnapshots.get(scopeKey),
        mountWrites,
      };
    },
    staleHandle(scopeKey: string) {
      let calls = 0;
      flushSync(() =>
        handles.get(scopeKey)!.setContext(() => {
          calls += 1;
          return { count: 999 };
        })
      );
      let errorMessage = "";
      try {
        handles.get(scopeKey)!.getContext();
      } catch (error) {
        errorMessage = String(error);
      }
      return { calls, error: errorMessage };
    },
    unmount() {
      flushSync(() => root.unmount());
    },
  };
}

declare global {
  interface Window {
    consoleLayoutFixture: ReturnType<typeof mountLayout>;
  }
}
