import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { createRequire } from "node:module";
import { setTimeout as delay } from "node:timers/promises";

const require = createRequire(new URL("../../package.json", import.meta.url));
const { chromium } = require("playwright");
const evidenceDir =
  process.env.LENSO_ASSISTANT_UI_EVIDENCE_DIR ?? "/tmp/lenso-assistant-ui";
await fs.mkdir(evidenceDir, { mode: 0o700, recursive: true });
const serviceFile =
  process.env.LENSO_ASSISTANT_SERVICE_MANIFEST ?? `${evidenceDir}/service.json`;
const service = JSON.parse(await fs.readFile(serviceFile, "utf-8"));
assert.ok(
  ["127.0.0.1", "localhost", "[::1]"].includes(
    new URL(service.origin).hostname
  ),
  "synthetic acceptance must use a local service"
);
const browser = await chromium.launch({
  ...(process.env.LENSO_BROWSER_EXECUTABLE_PATH
    ? { executablePath: process.env.LENSO_BROWSER_EXECUTABLE_PATH }
    : {}),
  args: ["--no-sandbox"],
  headless: true,
});
const failures = [];
const responses = [];
const responseInspections = [];
const credentialValues = [
  "synthetic-alice-byok",
  ...["alice", "bob", "denied"].flatMap((name) => [
    service[name].csrf,
    ...service[name].cookie
      .split("; ")
      .map((cookie) => cookie.slice(cookie.indexOf("=") + 1)),
  ]),
];
const redactedText = (value) => {
  if (typeof value !== "string") {
    return;
  }
  let text = value;
  for (const credential of credentialValues) {
    if (credential) {
      text = text.replaceAll(credential, "[redacted]");
    }
  }
  return text;
};
const bodyDeadline = async (signal) => {
  await delay(2000, null, { signal });
  throw new Error("Response body unavailable");
};
const responseBody = async (response) => {
  const deadline = new AbortController();
  try {
    return await Promise.race([response.json(), bodyDeadline(deadline.signal)]);
  } finally {
    deadline.abort();
  }
};
const publicProblem = (body) => {
  const error = body?.error;
  const object = error && typeof error === "object" ? error : body;
  return {
    code: redactedText(object?.code),
    detail: redactedText(object?.detail),
    message: redactedText(
      object?.message ?? (typeof error === "string" ? error : undefined)
    ),
    title: redactedText(object?.title),
    type: redactedText(object?.type),
  };
};
const participants = {};
const report = { checks: [], responses, screenshots: [] };
const browserRequest = async (context, url, options = {}) => {
  const [page] = context.pages();
  const result = await page.evaluate(
    async ({ url: requestUrl, options: requestOptions }) => {
      const response = await fetch(requestUrl, {
        headers: {
          ...requestOptions.headers,
          ...(requestOptions.data
            ? { "content-type": "application/json" }
            : {}),
        },
        method: requestOptions.data ? "PUT" : "GET",
        ...(requestOptions.data
          ? { body: JSON.stringify(requestOptions.data) }
          : {}),
      });
      return { body: await response.json(), status: response.status };
    },
    { options, url }
  );
  return result;
};
const readSettings = async (context) => {
  const result = await browserRequest(
    context,
    `${service.origin}/api/console/v1/assistant/settings`
  );
  return result.body;
};
const cookiesFor = (account) =>
  account.cookie.split("; ").map((cookie) => {
    const separator = cookie.indexOf("=");
    const cookieName = cookie.slice(0, separator);
    return {
      domain: new URL(service.origin).hostname,
      httpOnly: cookieName === "__Host-lenso-session",
      name: cookieName,
      path: "/",
      sameSite: "Lax",
      secure: true,
      value: cookie.slice(separator + 1),
    };
  });
const check = (name) => {
  report.checks.push(name);
  console.log(`PASS ${name}`);
};
try {
  for (const name of ["alice", "bob", "denied"]) {
    const account = service[name];
    const context = await browser.newContext({
      colorScheme: "light",
      viewport: { height: 900, width: 1280 },
    });
    await context.addCookies(cookiesFor(account));
    const authPage = await context.newPage();
    await authPage.goto(service.origin);
    const sessionResponse = await authPage.evaluate(async () => {
      const response = await fetch("/api/console/v1/session");
      return { body: await response.json(), code: response.status };
    });
    await authPage.close();
    assert.equal(sessionResponse.code, 200, `browser session for ${name}`);
    const session = sessionResponse.body;
    assert.equal(session.subject, account.subject);
    assert.equal(session.assistant_enabled, name !== "denied");
    assert.equal(session.administrator, false);
    const page = await context.newPage();
    page.on("pageerror", (error) =>
      failures.push({ message: error.message, user: name })
    );
    page.on("response", (response) => {
      const url = new URL(response.url());
      if (!url.pathname.startsWith("/api/")) {
        return;
      }
      const summary = {
        path: url.pathname,
        status: response.status(),
        user: name,
      };
      responses.push(summary);
      if (response.status() >= 400) {
        responseInspections.push(
          (async () => {
            try {
              const body = await responseBody(response);
              summary.problem = publicProblem(body);
            } catch {
              // A non-JSON failure still has its URL and status in the report.
            }
          })()
        );
      }
    });
    participants[name] = { account, context, page };
  }
  check(
    "three independent browser sessions reflect real Auth subjects and assistant grants"
  );

  for (const [name, providerId] of [
    ["alice", "a"],
    ["bob", "b"],
  ]) {
    const { context, page } = participants[name];
    await page.goto(`${service.origin}/settings/ai`);
    await page
      .getByRole("heading", { exact: true, name: "Assistant" })
      .waitFor();
    await page.getByRole("combobox", { name: "Assistant provider" }).waitFor();
    const settings = await readSettings(context);
    assert.deepEqual(
      settings.providers.map((provider) => provider.id),
      [providerId]
    );
    assert.equal(settings.byok_enabled, name === "alice");
    assert.equal(
      await page.getByRole("button", { exact: true, name: "Profiles" }).count(),
      0
    );
    assert.equal(
      await page
        .getByRole("button", { exact: true, name: "Connections" })
        .count(),
      0
    );
    assert.equal(
      await page.getByRole("link", { exact: true, name: "Plugins" }).count(),
      0
    );
    const trigger = page.getByRole("combobox", { name: "Assistant provider" });
    await trigger.click();
    assert.equal(
      await page
        .getByRole("option", {
          exact: true,
          name: name === "alice" ? "Synthetic B" : "Synthetic A",
        })
        .count(),
      0
    );
    await page
      .getByRole("option", {
        exact: true,
        name: `Synthetic ${providerId.toUpperCase()}`,
      })
      .click();
    if (
      !(await page
        .getByRole("button", { exact: true, name: "Save provider" })
        .isDisabled())
    ) {
      await page
        .getByRole("button", { exact: true, name: "Save provider" })
        .click();
      await page
        .getByText("Assistant settings saved.", { exact: true })
        .waitFor();
    }
    check(`${name} sees only allowed provider and personal settings controls`);
  }

  const {
    page: aliceSettings,
    context: aliceContext,
    account: aliceAccount,
  } = participants.alice;
  await aliceSettings.getByLabel("New API key").fill("synthetic-alice-byok");
  const savedKeyResponse = aliceSettings.waitForResponse(
    (response) =>
      new URL(response.url()).pathname ===
        "/api/console/v1/assistant/settings" &&
      response.request().method() === "PUT"
  );
  await aliceSettings
    .getByRole("button", { exact: true, name: "Save personal key" })
    .click();
  const keyResponse = await savedKeyResponse;
  assert.equal(keyResponse.status(), 200);
  await aliceSettings.waitForFunction(
    () => document.querySelector("input[type=password]")?.value === ""
  );
  await aliceSettings
    .getByText("Assistant settings saved.", { exact: true })
    .waitFor();
  assert.equal(await aliceSettings.getByLabel("New API key").inputValue(), "");
  assert.equal(
    await aliceSettings.evaluate(() =>
      `${JSON.stringify(localStorage)} ${JSON.stringify(sessionStorage)}`.includes(
        "synthetic-alice-byok"
      )
    ),
    false
  );
  const aliceSafe = await readSettings(aliceContext);
  assert.equal(aliceSafe.has_byok, true);
  assert.equal(
    JSON.stringify(aliceSafe).includes("synthetic-alice-byok"),
    false
  );
  const bobSafe = await readSettings(participants.bob.context);
  assert.equal(bobSafe.has_byok, false);
  const forbiddenProvider = await browserRequest(
    participants.bob.context,
    `${service.origin}/api/console/v1/assistant/settings`,
    {
      data: { provider_id: "a" },
      headers: { "x-csrf-token": participants.bob.account.csrf },
    }
  );
  assert.equal(forbiddenProvider.status, 403);
  const staleActorWrite = await browserRequest(
    participants.bob.context,
    `${service.origin}/api/console/v1/assistant/settings`,
    {
      data: { provider_id: "b" },
      headers: {
        "x-csrf-token": participants.bob.account.csrf,
        "x-lenso-expected-subject": aliceAccount.subject,
      },
    }
  );
  assert.equal(staleActorWrite.status, 412);
  check(
    "real BYOK save clears transient input, redacts credentials, isolates owners, rejects unauthorized provider and stale account writes"
  );

  for (const theme of ["light", "dark"]) {
    await aliceSettings.emulateMedia({ colorScheme: theme });
    for (const width of [1280, 390]) {
      await aliceSettings.setViewportSize({ height: 900, width });
      const trigger = aliceSettings.getByRole("combobox", {
        name: "Assistant provider",
      });
      await trigger.hover();
      await trigger.focus();
      await trigger.press("ArrowDown");
      const popup = aliceSettings.getByRole("listbox");
      await popup.waitFor();
      const bounds = await popup.boundingBox();
      assert.ok(bounds.x >= 0 && bounds.x + bounds.width <= width + 1);
      await aliceSettings.keyboard.press("Escape");
      await aliceSettings.waitForFunction(
        (element) => document.activeElement === element,
        await trigger.elementHandle(),
        { timeout: 5000 }
      );
      assert.equal(
        await trigger.evaluate((element) => document.activeElement === element),
        true
      );
      assert.equal(
        await aliceSettings.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth
        ),
        true
      );
      const screenshot = `${evidenceDir}/settings-alice-${theme}-${width}.png`;
      await aliceSettings.screenshot({ fullPage: true, path: screenshot });
      report.screenshots.push(screenshot);
    }
  }
  check(
    "real settings desktop/narrow light/dark have unclipped popup and returned keyboard focus"
  );

  const denied = participants.denied.page;
  for (const route of ["/settings/ai", "/agent/console/new-task"]) {
    await denied.goto(`${service.origin}${route}`);
    await denied
      .getByText(
        "Assistant access is not enabled for this account. Contact your administrator.",
        { exact: true }
      )
      .waitFor();
    assert.equal(
      await denied
        .getByRole("textbox", { name: "Send a message to Lenso Agent" })
        .count(),
      0
    );
    assert.equal(await denied.getByLabel("New API key").count(), 0);
  }
  assert.equal(
    responses.some(
      (response) =>
        response.user === "denied" &&
        (response.path.includes("/agent/") ||
          response.path.includes("/assistant/settings"))
    ),
    false
  );
  await denied.screenshot({
    fullPage: true,
    path: `${evidenceDir}/denied-agent.png`,
  });
  report.screenshots.push(`${evidenceDir}/denied-agent.png`);
  check(
    "denied user sees clear direct-route message and issues no assistant data requests"
  );

  for (const name of ["alice", "bob"]) {
    const { page } = participants[name];
    await page.setViewportSize({ height: 900, width: 1280 });
    await page.emulateMedia({ colorScheme: "light" });
    await page.goto(`${service.origin}/agent/console/new-task`);
    await page
      .getByRole("textbox", { name: "Send a message to Lenso Agent" })
      .waitFor();
  }
  const alice = participants.alice.page;
  const bob = participants.bob.page;
  await alice
    .getByRole("textbox", { name: "Send a message to Lenso Agent" })
    .fill("ui-alice-slow");
  await bob
    .getByRole("textbox", { name: "Send a message to Lenso Agent" })
    .fill("ui-bob-fast");
  const began = Date.now();
  await Promise.all([
    alice
      .getByRole("textbox", { name: "Send a message to Lenso Agent" })
      .press("Enter"),
    bob
      .getByRole("textbox", { name: "Send a message to Lenso Agent" })
      .press("Enter"),
  ]);
  await bob.getByText("provider-b:ui-bob-fast", { exact: true }).waitFor();
  report.bob_completed_ms = Date.now() - began;
  const aliceFinishedWhenBobCompleted = await alice
    .getByText("provider-a:ui-alice-slow", { exact: true })
    .count();
  assert.equal(aliceFinishedWhenBobCompleted, 0);
  await alice.getByText("provider-a:ui-alice-slow", { exact: true }).waitFor();
  report.alice_completed_ms = Date.now() - began;
  assert.equal(
    await alice.getByText("ui-bob-fast", { exact: true }).count(),
    0
  );
  assert.equal(
    await bob.getByText("ui-alice-slow", { exact: true }).count(),
    0
  );
  for (const [name, page] of [
    ["alice", alice],
    ["bob", bob],
  ]) {
    for (const theme of ["light", "dark"]) {
      await page.emulateMedia({ colorScheme: theme });
      for (const width of [1280, 390]) {
        await page.setViewportSize({ height: 900, width });
        const composer = page.getByRole("textbox", {
          name: "Send a message to Lenso Agent",
        });
        await composer.focus();
        assert.equal(
          await composer.evaluate(
            (element) => document.activeElement === element
          ),
          true
        );
        assert.equal(
          await page.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth
          ),
          true
        );
        const screenshot = `${evidenceDir}/agent-${name}-${theme}-${width}.png`;
        await page.screenshot({ fullPage: true, path: screenshot });
        report.screenshots.push(screenshot);
      }
    }
  }
  check(
    "two real UI conversations resolve different providers without cross-user content; slow Alice does not block Bob; desktop/narrow light/dark preserve composer focus"
  );
  assert.equal(
    responses.some((response) => response.path.endsWith("/agent/activity")),
    false
  );
  check("member activity capability prevents global activity requests");
  const switchedBootstrap = alice.waitForResponse(
    (response) =>
      response.url().endsWith("/agent/bootstrap") &&
      response.request().headers()["x-lenso-expected-subject"] ===
        participants.bob.account.subject
  );
  await aliceContext.addCookies(cookiesFor(participants.bob.account));
  await alice.evaluate(() =>
    window.dispatchEvent(new Event("lenso-session-expired"))
  );
  await switchedBootstrap;
  await alice.waitForFunction(
    () =>
      !document.body.textContent.includes("Checking your session") &&
      !document.body.textContent.includes("ui-alice-slow")
  );
  assert.equal(
    await alice.getByText("provider-a:ui-alice-slow", { exact: true }).count(),
    0
  );
  await alice.screenshot({
    fullPage: true,
    path: `${evidenceDir}/account-switch-bob.png`,
  });
  report.screenshots.push(`${evidenceDir}/account-switch-bob.png`);
  check(
    "same browser account change remounts conversation, uses captured new subject, and removes Alice content"
  );
  assert.equal(
    failures.length,
    0,
    `browser errors: ${JSON.stringify(failures)}`
  );
  await Promise.allSettled(responseInspections);
  report.failures = failures;
  report.status = "passed";
  await fs.writeFile(
    `${evidenceDir}/ui-report.json`,
    JSON.stringify(report, null, 2),
    { mode: 0o600 }
  );
  await fs.writeFile(`${evidenceDir}/finish`, "", { mode: 0o600 });
} catch (error) {
  await Promise.allSettled(responseInspections);
  report.status = "failed";
  report.error = error.message;
  report.failures = failures;
  await fs.writeFile(
    `${evidenceDir}/ui-report.json`,
    JSON.stringify(report, null, 2),
    { mode: 0o600 }
  );
  for (const [name, { page }] of Object.entries(participants)) {
    await page
      .screenshot({
        fullPage: true,
        path: `${evidenceDir}/failure-${name}.png`,
      })
      .catch(() => {
        /* The primary failure is already recorded. */
      });
  }
  throw error;
} finally {
  await browser.close();
}
