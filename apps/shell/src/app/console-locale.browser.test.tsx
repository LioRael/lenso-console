import { flushSync } from "react-dom";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, expect, test, vi } from "vitest";
import { page } from "vitest/browser";

import {
  HostConsoleLocaleProvider,
  prepareSessionLocale,
  useConsoleLocale,
} from "./console-locale";
import { ConsoleSession } from "./console-session";

vi.mock("../dev/console-dev-config", () => ({
  consoleDevConfig: { mode: "production" },
}));
let root: Root | undefined;
let container: HTMLDivElement | undefined;
afterEach(() => {
  flushSync(() => root?.unmount());
  container?.remove();
  vi.unstubAllGlobals();
  root = undefined;
});
function Probe() {
  const locale = useConsoleLocale();
  return (
    <>
      <output>
        {locale.locale} · {locale.preference}
      </output>
      <button
        onClick={() => {
          void locale.setPreference("zh-CN");
        }}
      >
        Choose Chinese
      </button>
      <button
        onClick={() => {
          void locale.setPreference("global");
        }}
      >
        Follow global
      </button>
      <input aria-label="Keep draft" defaultValue="draft" />
    </>
  );
}
// Prevent locale changes from remounting admitted session content or overwriting a draft.
test("account language updates retain the admitted session and follow the global default", async () => {
  let preference = "global";
  let sessions = 0;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const path = String(input);
      if (path.endsWith("/session")) {
        sessions += 1;
        return Response.json({
          mode: "required",
          authenticated: true,
          subject: "alice",
          administrator: false,
          workspace_ids: [],
        });
      }
      if (path.includes("/auth/methods")) {
        return Response.json({ methods: [] });
      }
      if (init?.method === "PUT") {
        ({ preference } = JSON.parse(String(init.body)));
      }
      return Response.json({
        global_default: "en",
        preference,
        available: true,
        can_manage_default: false,
      });
    })
  );
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  flushSync(() =>
    root?.render(
      <HostConsoleLocaleProvider>
        <ConsoleSession>
          <Probe />
        </ConsoleSession>
      </HostConsoleLocaleProvider>
    )
  );
  await expect.element(page.getByText("en · global")).toBeVisible();
  await page.getByRole("button", { name: "Choose Chinese" }).click();
  await expect.element(page.getByText("zh-CN · zh-CN")).toBeVisible();
  expect(sessions).toBe(1);
  expect((container.querySelector("input") as HTMLInputElement).value).toBe(
    "draft"
  );
  await expect
    .element(page.getByText("Checking session…"))
    .not.toBeInTheDocument();
  await page.getByRole("button", { name: "Follow global" }).click();
  await expect.element(page.getByText("en · global")).toBeVisible();
  expect(sessions).toBe(1);
});
// A retired account response must never restore its language after another identity was admitted.
test("a late prior-account locale read cannot overwrite the next account", async () => {
  let resolveOld: ((value: Response) => void) | undefined;
  let defer = false;
  vi.stubGlobal(
    "fetch",
    vi.fn(async () =>
      defer
        ? new Promise<Response>((resolve) => {
            resolveOld = resolve;
          })
        : Response.json({
            global_default: "en",
            preference: "global",
            available: true,
            can_manage_default: false,
          })
    )
  );
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  flushSync(() =>
    root?.render(
      <HostConsoleLocaleProvider>
        <Probe />
      </HostConsoleLocaleProvider>
    )
  );
  await prepareSessionLocale("alice");
  defer = true;
  const old = prepareSessionLocale("alice");
  await expect.poll(() => Boolean(resolveOld)).toBe(true);
  defer = false;
  await prepareSessionLocale("bob");
  resolveOld?.(
    Response.json({
      global_default: "en",
      preference: "zh-CN",
      available: true,
      can_manage_default: false,
    })
  );
  await old;
  await expect.element(page.getByText("en · global")).toBeVisible();
});
