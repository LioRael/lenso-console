import { fileURLToPath } from "node:url";

import react from "@vitejs/plugin-react";
import { chromium, type Browser } from "playwright";
import { createServer } from "vite";

import { consoleStylex } from "../../config/console-stylex";

export async function openFixture(fixture: "dock" | "layout", width: number) {
  const server = await createServer({
    configFile: false,
    root: fileURLToPath(new URL("../..", import.meta.url)),
    optimizeDeps: {
      include: [
        "@lenso/ui/tooltip",
        "@lenso/ui/button",
        "use-sync-external-store/shim",
        "use-sync-external-store/shim/with-selector",
      ],
    },
    plugins: [react(), consoleStylex()],
    server: { host: "127.0.0.1", port: 0 },
  });
  let browser: Browser | undefined;
  const errors: string[] = [];
  const close = async () => {
    try {
      await browser?.close();
    } finally {
      await server.close();
    }
  };
  try {
    await server.listen();
    const executablePath = process.env.LENSO_BROWSER_EXECUTABLE_PATH?.trim();
    browser = await chromium.launch(executablePath ? { executablePath } : {});
    const page = await browser.newPage({ viewport: { width, height: 800 } });
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto(
      `${server.resolvedUrls!.local[0]}test/browser/index.html?fixture=${fixture}`
    );
    await page.waitForSelector('body[data-ready="true"]');
    return {
      page,
      errors,
      close,
    };
  } catch (error) {
    await close();
    throw new Error(`Browser fixture failed: ${errors.join("\n")}`, {
      cause: error,
    });
  }
}
